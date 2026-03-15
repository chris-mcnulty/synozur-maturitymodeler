import { Router, Request } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { ensureAuthenticated, ensureAnyAdmin, ensureGlobalAdmin } from "./auth";
import { checkIsGlobalAdmin } from "./permissions";
import { providerRegistry } from "./services/ai-providers/registry";
import { plannerService, resolvePlannerCredentials } from "./services/planner-service";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

let userGuideCache: string | null = null;
let changelogCache: string | null = null;
let adminGuideCache: string | null = null;
let currentChangelogVersion: string = '0.0';

function loadMarkdownFile(filename: string): string {
  try {
    return readFileSync(join(__dirname, '..', filename), 'utf-8');
  } catch (error) {
    console.error(`Failed to load ${filename}:`, error);
    return '';
  }
}

function detectChangelogVersion(content: string): string {
  const match = content.match(/Version\s+([\d.]+)/);
  return match?.[1] || '0.0';
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function initDocs() {
  const userGuide = loadMarkdownFile('USER_GUIDE.md');
  userGuideCache = userGuide.substring(0, 30000);

  const changelog = loadMarkdownFile('CHANGELOG.md');
  changelogCache = changelog;
  currentChangelogVersion = detectChangelogVersion(changelog);
  console.log(`[Support] Detected changelog version: ${currentChangelogVersion}`);

  adminGuideCache = loadMarkdownFile('ADMIN_GUIDE.md');
}

initDocs();

router.get('/api/user-guide', (_req, res) => {
  res.setHeader('Content-Type', 'text/markdown');
  res.send(userGuideCache || '');
});

router.get('/api/changelog', (_req, res) => {
  res.setHeader('Content-Type', 'text/markdown');
  res.send(changelogCache || '');
});

router.get('/api/admin-guide', ensureAuthenticated, ensureAnyAdmin, (_req, res) => {
  res.json({ content: adminGuideCache || '' });
});

router.get('/api/changelog/whats-new', ensureAuthenticated, async (req, res) => {
  try {
    const systemSetting = await storage.getSetting('showWhatsNew');
    if (!systemSetting || systemSetting.value !== true) {
      return res.json({ showModal: false, version: currentChangelogVersion });
    }

    const user = req.user!;
    const userCreatedAt = new Date(user.createdAt);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (userCreatedAt > oneHourAgo) {
      await db.update(schema.users)
        .set({ lastDismissedChangelogVersion: currentChangelogVersion })
        .where(eq(schema.users.id, user.id));
      return res.json({ showModal: false, version: currentChangelogVersion });
    }

    if (user.tenantId) {
      const tenant = await storage.getTenant(user.tenantId);
      if (tenant && !tenant.showChangelogOnLogin) {
        return res.json({ showModal: false, version: currentChangelogVersion });
      }
    }

    const lastDismissed = user.lastDismissedChangelogVersion || '0.0';
    if (compareVersions(lastDismissed, currentChangelogVersion) >= 0) {
      return res.json({ showModal: false, version: currentChangelogVersion });
    }

    let summary = '';
    let highlights: Array<{ icon: string; title: string; description: string }> = [];

    try {
      const recentSections = extractRecentSections(changelogCache || '', 14);
      if (recentSections) {
        const config = await providerRegistry.getActiveConfig();
        const provider = providerRegistry.get(config.providerId);
        if (provider?.isAvailable()) {
          const prompt = `Summarize these changelog updates for a "What's New" modal. Return JSON with:
{
  "summary": "One paragraph overview of what's new",
  "highlights": [
    {"icon": "sparkles|shield|zap|users|settings|brain", "title": "Short title", "description": "Brief description"}
  ]
}
Keep it concise, max 5 highlights. Updates:\n\n${recentSections}`;
          const result = await provider.call(prompt, { systemPrompt: 'You are a product update summarizer. Return valid JSON only.', maxTokens: 1000 });
          const parsed = JSON.parse(result.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
          summary = parsed.summary || '';
          highlights = parsed.highlights || [];
        }
      }
    } catch (error) {
      console.error('[WhatsNew] AI summary failed, using fallback:', error);
    }

    if (!summary && changelogCache) {
      const extracted = extractFallbackHighlights(changelogCache);
      summary = `Orion has been updated to version ${currentChangelogVersion} with new features and improvements.`;
      highlights = extracted;
    }

    res.json({
      showModal: true,
      version: currentChangelogVersion,
      summary,
      highlights,
    });
  } catch (error) {
    console.error('[WhatsNew] Error:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

router.post('/api/changelog/dismiss', ensureAuthenticated, async (req, res) => {
  try {
    await db.update(schema.users)
      .set({ lastDismissedChangelogVersion: currentChangelogVersion })
      .where(eq(schema.users.id, req.user!.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

const createTicketSchema = z.object({
  category: z.enum(schema.TICKET_CATEGORIES),
  subject: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  priority: z.enum(schema.TICKET_PRIORITIES).default('medium'),
});

router.post('/api/support/tickets', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user!;
    const validation = createTicketSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
    }

    const { category, subject, description, priority } = validation.data;
    const ticketNumber = await storage.getNextTicketNumber();

    const ticket = await storage.createSupportTicket({
      ticketNumber,
      userId: user.id,
      tenantId: user.tenantId || null,
      category,
      subject,
      description,
      priority,
      status: 'open',
    });

    sendTicketAcknowledgement(user, ticket, req).catch(err =>
      console.error('[Support] Failed to send acknowledgement email:', err)
    );

    sendInternalNotification(user, ticket, req).catch(err =>
      console.error('[Support] Failed to send internal notification:', err)
    );

    if (user.tenantId) {
      syncTicketToPlanner(ticket, user).catch(err =>
        console.error('[Support] Failed to sync to Planner:', err)
      );
    }

    res.json(ticket);
  } catch (error) {
    console.error('[Support] Create ticket error:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.get('/api/support/tickets', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user!;
    const isGlobalAdmin = checkIsGlobalAdmin(user);
    const isTenantAdmin = user.role === 'tenant_admin';

    let tickets: schema.SupportTicket[];

    if (isGlobalAdmin) {
      tickets = await storage.getAllSupportTickets();
    } else if (isTenantAdmin && user.tenantId) {
      tickets = await storage.getSupportTicketsByTenant(user.tenantId);
    } else {
      tickets = await storage.getSupportTicketsByUser(user.id);
    }

    const { status, priority, category, tenantId } = req.query;
    if (status) tickets = tickets.filter(t => t.status === status);
    if (priority) tickets = tickets.filter(t => t.priority === priority);
    if (category) tickets = tickets.filter(t => t.category === category);
    if (tenantId && isGlobalAdmin) tickets = tickets.filter(t => t.tenantId === tenantId);

    res.json(tickets);
  } catch (error) {
    console.error('[Support] Get tickets error:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/api/support/tickets/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user!;
    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isGlobalAdmin = checkIsGlobalAdmin(user);
    const isTenantAdmin = user.role === 'tenant_admin' && user.tenantId === ticket.tenantId;
    const isOwner = user.id === ticket.userId;

    if (!isGlobalAdmin && !isTenantAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const replies = await storage.getSupportTicketReplies(ticket.id);
    const filteredReplies = (isGlobalAdmin || isTenantAdmin)
      ? replies
      : replies.filter(r => !r.isInternal);

    const ticketUser = await storage.getUser(ticket.userId);
    const authorName = ticketUser?.name || ticketUser?.username || 'Unknown';

    const replyUserIds = [...new Set(replies.map(r => r.userId))];
    const allUsers = await storage.getAllUsers();
    const userMap = new Map(allUsers.map(u => [u.id, { name: u.name || u.username || 'Unknown', role: u.role }]));

    const enrichedReplies = filteredReplies.map(r => ({
      ...r,
      authorName: userMap.get(r.userId)?.name || 'Unknown',
      authorRole: userMap.get(r.userId)?.role || 'user',
    }));

    let tenantName: string | undefined;
    if (ticket.tenantId) {
      const tenant = await storage.getTenant(ticket.tenantId);
      tenantName = tenant?.name;
    }

    res.json({
      ...ticket,
      authorName,
      authorEmail: ticketUser?.email,
      tenantName,
      replies: enrichedReplies,
    });
  } catch (error) {
    console.error('[Support] Get ticket detail error:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

router.post('/api/support/tickets/:id/replies', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user!;
    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isGlobalAdmin = checkIsGlobalAdmin(user);
    const isTenantAdmin = user.role === 'tenant_admin' && user.tenantId === ticket.tenantId;
    const isOwner = user.id === ticket.userId;

    if (!isGlobalAdmin && !isTenantAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { message, isInternal } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const internalFlag = (isGlobalAdmin || isTenantAdmin) ? !!isInternal : false;

    const reply = await storage.createSupportTicketReply({
      ticketId: ticket.id,
      userId: user.id,
      message: message.trim(),
      isInternal: internalFlag,
    });

    res.json(reply);
  } catch (error) {
    console.error('[Support] Create reply error:', error);
    res.status(500).json({ error: 'Failed to create reply' });
  }
});

router.patch('/api/support/tickets/:id', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const ticket = await storage.getSupportTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const isGlobalAdmin = checkIsGlobalAdmin(user);
    const isTenantAdmin = user.role === 'tenant_admin' && user.tenantId === ticket.tenantId;

    if (!isGlobalAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status, priority, category } = req.body;
    const updates: Partial<schema.SupportTicket> = {};

    if (status && schema.TICKET_STATUSES.includes(status)) {
      updates.status = status;
      if (status === 'resolved' || status === 'closed') {
        updates.resolvedAt = new Date();
        updates.resolvedBy = user.id;

        markPlannerTaskComplete(ticket).catch(err =>
          console.error('[Support] Failed to mark Planner task complete:', err)
        );

        sendTicketClosedEmail(ticket, status, req).catch(err =>
          console.error('[Support] Failed to send closure email:', err)
        );
      }
    }
    if (priority && schema.TICKET_PRIORITIES.includes(priority)) updates.priority = priority;
    if (category && schema.TICKET_CATEGORIES.includes(category)) updates.category = category;

    const updated = await storage.updateSupportTicket(ticket.id, updates);
    res.json(updated);
  } catch (error) {
    console.error('[Support] Update ticket error:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.post('/api/support/help/chat/stream', ensureAuthenticated, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const guideContent = userGuideCache || '';

    const systemPrompt = `You are the Orion Help Assistant, an AI support chatbot for the Orion maturity assessment platform by The Synozur Alliance. 
Answer questions about using Orion based on the User Guide content below. Be helpful, concise, and accurate.
If you cannot answer from the guide content, say so and suggest the user submit a support ticket for personalized help.

USER GUIDE CONTENT:
${guideContent.substring(0, 15000)}`;

    const historyContext = Array.isArray(history)
      ? history.slice(-6).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
      : '';

    const fullPrompt = historyContext
      ? `${historyContext}\nUser: ${message}\nAssistant:`
      : `User: ${message}\nAssistant:`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const config = await providerRegistry.getActiveConfig();
      const provider = providerRegistry.get(config.providerId);

      if (!provider?.isAvailable()) {
        throw new Error('No AI provider available');
      }

      const response = await provider.call(fullPrompt, {
        systemPrompt,
        maxTokens: 1000,
        temperature: 0.3,
      });

      const words = response.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i];
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    } catch (error: any) {
      console.error('[HelpChat] AI error:', error);
      res.write(`data: ${JSON.stringify({ content: "I'm sorry, I'm having trouble responding right now. Please try again later or submit a support ticket for assistance." })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error('[HelpChat] Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed' });
    }
  }
});

async function resolveTenantForPlanner(req: Request): Promise<schema.Tenant | null> {
  const user = req.user!;
  const tenantId = req.query.tenantId as string | undefined;
  if (!tenantId) return null;
  if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
    return null;
  }
  const tenant = await storage.getTenant(tenantId);
  return tenant || null;
}

router.get('/api/planner/status', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    if (tenantId) {
      const user = req.user!;
      if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const tenantConfig = await resolveTenantForPlanner(req);
    const configured = plannerService.isConfigured(tenantConfig);
    if (!configured) {
      return res.json({ configured: false, connected: false });
    }
    const result = await plannerService.testConnection(tenantConfig);
    res.json({ configured: true, connected: result.success, message: result.message });
  } catch (error) {
    res.json({ configured: false, connected: false });
  }
});

router.get('/api/planner/groups', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    if (tenantId) {
      const user = req.user!;
      if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const tenantConfig = await resolveTenantForPlanner(req);
    const groups = await plannerService.listMyGroups(tenantConfig);
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

router.get('/api/planner/groups/:groupId/plans', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    if (tenantId) {
      const user = req.user!;
      if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const tenantConfig = await resolveTenantForPlanner(req);
    const plans = await plannerService.getPlansForGroup(req.params.groupId, tenantConfig);
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch plans' });
  }
});

router.get('/api/tenants/:tenantId/support-integrations', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { tenantId } = req.params;

    if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    res.json({
      supportPlannerEnabled: tenant.supportPlannerEnabled,
      supportPlannerTenantId: tenant.supportPlannerTenantId || '',
      supportPlannerClientId: tenant.supportPlannerClientId || '',
      supportPlannerHasClientSecret: !!tenant.supportPlannerClientSecret,
      supportPlannerPlanId: tenant.supportPlannerPlanId,
      supportPlannerPlanTitle: tenant.supportPlannerPlanTitle,
      supportPlannerPlanWebUrl: tenant.supportPlannerPlanWebUrl,
      supportPlannerGroupId: tenant.supportPlannerGroupId,
      supportPlannerGroupName: tenant.supportPlannerGroupName,
      supportPlannerBucketName: tenant.supportPlannerBucketName || 'Support Tickets',
      showChangelogOnLogin: tenant.showChangelogOnLogin ?? true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.patch('/api/tenants/:tenantId/support-integrations', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { tenantId } = req.params;

    if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      supportPlannerEnabled,
      supportPlannerTenantId,
      supportPlannerClientId,
      supportPlannerClientSecret,
      supportPlannerPlanId,
      supportPlannerPlanTitle,
      supportPlannerPlanWebUrl,
      supportPlannerGroupId,
      supportPlannerGroupName,
      supportPlannerBucketName,
      showChangelogOnLogin,
    } = req.body;

    const updates: Partial<schema.Tenant> = {};
    if (supportPlannerEnabled !== undefined) updates.supportPlannerEnabled = supportPlannerEnabled;
    if (supportPlannerTenantId !== undefined) updates.supportPlannerTenantId = supportPlannerTenantId || null;
    if (supportPlannerClientId !== undefined) updates.supportPlannerClientId = supportPlannerClientId || null;
    if (supportPlannerClientSecret !== undefined) updates.supportPlannerClientSecret = supportPlannerClientSecret || null;
    if (supportPlannerPlanId !== undefined) updates.supportPlannerPlanId = supportPlannerPlanId;
    if (supportPlannerPlanTitle !== undefined) updates.supportPlannerPlanTitle = supportPlannerPlanTitle;
    if (supportPlannerPlanWebUrl !== undefined) updates.supportPlannerPlanWebUrl = supportPlannerPlanWebUrl;
    if (supportPlannerGroupId !== undefined) updates.supportPlannerGroupId = supportPlannerGroupId;
    if (supportPlannerGroupName !== undefined) updates.supportPlannerGroupName = supportPlannerGroupName;
    if (supportPlannerBucketName !== undefined) updates.supportPlannerBucketName = supportPlannerBucketName;
    if (showChangelogOnLogin !== undefined) updates.showChangelogOnLogin = showChangelogOnLogin;

    const updated = await storage.updateTenant(tenantId, updates);
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      supportPlannerEnabled: updated.supportPlannerEnabled,
      supportPlannerTenantId: updated.supportPlannerTenantId || '',
      supportPlannerClientId: updated.supportPlannerClientId || '',
      supportPlannerHasClientSecret: !!updated.supportPlannerClientSecret,
      supportPlannerPlanId: updated.supportPlannerPlanId,
      supportPlannerPlanTitle: updated.supportPlannerPlanTitle,
      supportPlannerPlanWebUrl: updated.supportPlannerPlanWebUrl,
      supportPlannerGroupId: updated.supportPlannerGroupId,
      supportPlannerGroupName: updated.supportPlannerGroupName,
      supportPlannerBucketName: updated.supportPlannerBucketName || 'Support Tickets',
      showChangelogOnLogin: updated.showChangelogOnLogin ?? true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update integrations' });
  }
});

router.post('/api/tenants/:tenantId/support-integrations/sync-existing', ensureAuthenticated, ensureAnyAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { tenantId } = req.params;

    if (!checkIsGlobalAdmin(user) && user.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant?.supportPlannerEnabled || !tenant.supportPlannerPlanId) {
      return res.status(400).json({ error: 'Planner not configured for this tenant' });
    }

    const unsyncedTickets = await storage.getUnsyncedTickets(tenantId);
    let synced = 0;
    let failed = 0;

    for (const ticket of unsyncedTickets) {
      try {
        const ticketUser = await storage.getUser(ticket.userId);
        await syncTicketToPlannerInternal(ticket, ticketUser, tenant);
        synced++;
      } catch (error) {
        console.error(`[Planner] Failed to sync ticket #${ticket.ticketNumber}:`, error);
        failed++;
      }
    }

    res.json({ synced, failed, total: unsyncedTickets.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync tickets' });
  }
});

function extractRecentSections(content: string, days: number): string {
  const lines = content.split('\n');
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let result = '';
  let include = false;

  for (const line of lines) {
    const dateMatch = line.match(/###?\s+(\w+\s+\d{1,2},\s+\d{4})/);
    if (dateMatch) {
      const sectionDate = new Date(dateMatch[1]);
      include = !isNaN(sectionDate.getTime()) && sectionDate >= cutoff;
    }
    if (include) result += line + '\n';
  }

  return result || lines.slice(0, 50).join('\n');
}

function extractFallbackHighlights(content: string): Array<{ icon: string; title: string; description: string }> {
  const highlights: Array<{ icon: string; title: string; description: string }> = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('- **') && highlights.length < 5) {
      const match = line.match(/- \*\*(.+?)\*\*:?\s*(.*)/);
      if (match) {
        highlights.push({
          icon: 'sparkles',
          title: match[1],
          description: match[2] || match[1],
        });
      }
    }
  }

  return highlights;
}

async function sendTicketAcknowledgement(user: schema.User, ticket: schema.SupportTicket, req: Request) {
  if (!user.email) return;
  try {
    const { getUncachableSendGridClient } = await import('./sendgrid.js');
    const { client: sgMail, fromEmail } = await getUncachableSendGridClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    await sgMail.send({
      to: user.email,
      from: fromEmail,
      subject: `Support Ticket #${ticket.ticketNumber} Received - ${escapeHtml(ticket.subject)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #810FFB;">Support Ticket Received</h2>
          <p>Hi ${escapeHtml(user.name || user.username)},</p>
          <p>We've received your support request and will get back to you soon.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; font-weight: bold;">Ticket Number</td><td style="padding: 8px;">#${ticket.ticketNumber}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Subject</td><td style="padding: 8px;">${escapeHtml(ticket.subject)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Category</td><td style="padding: 8px;">${escapeHtml(ticket.category)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Priority</td><td style="padding: 8px;">${escapeHtml(ticket.priority)}</td></tr>
          </table>
          <p>You can track your ticket at <a href="${baseUrl}/support">Orion Support</a>.</p>
          <p style="color: #666; font-size: 14px;">- The Synozur Team</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('[Support Email] Acknowledgement failed:', error);
  }
}

async function sendInternalNotification(user: schema.User, ticket: schema.SupportTicket, req: Request) {
  try {
    const { getUncachableSendGridClient } = await import('./sendgrid.js');
    const { client: sgMail, fromEmail } = await getUncachableSendGridClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const globalAdmins = (await storage.getAllUsers()).filter(u => u.role === 'global_admin' && u.email);
    if (globalAdmins.length === 0) return;

    let tenantName = 'N/A';
    if (ticket.tenantId) {
      const tenant = await storage.getTenant(ticket.tenantId);
      tenantName = tenant?.name || 'Unknown';
    }

    for (const admin of globalAdmins) {
      await sgMail.send({
        to: admin.email!,
        from: fromEmail,
        subject: `[Orion Support] New Ticket #${ticket.ticketNumber}: ${escapeHtml(ticket.subject)}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #810FFB;">New Support Ticket</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; font-weight: bold;">Ticket</td><td style="padding: 8px;">#${ticket.ticketNumber}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Subject</td><td style="padding: 8px;">${escapeHtml(ticket.subject)}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Submitted By</td><td style="padding: 8px;">${escapeHtml(user.name || user.username || 'Unknown')} (${escapeHtml(user.email || 'no email')})</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Tenant</td><td style="padding: 8px;">${escapeHtml(tenantName)}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Category</td><td style="padding: 8px;">${escapeHtml(ticket.category)}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Priority</td><td style="padding: 8px;">${escapeHtml(ticket.priority)}</td></tr>
            </table>
            <p><strong>Description:</strong></p>
            <p style="background: #f5f5f5; padding: 12px; border-radius: 4px;">${escapeHtml(ticket.description)}</p>
            <p><a href="${baseUrl}/admin">View in Admin Console</a></p>
          </div>
        `,
      });
    }
  } catch (error) {
    console.error('[Support Email] Internal notification failed:', error);
  }
}

async function sendTicketClosedEmail(ticket: schema.SupportTicket, newStatus: string, req: Request) {
  try {
    const ticketUser = await storage.getUser(ticket.userId);
    if (!ticketUser?.email) return;

    const { getUncachableSendGridClient } = await import('./sendgrid.js');
    const { client: sgMail, fromEmail } = await getUncachableSendGridClient();
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    await sgMail.send({
      to: ticketUser.email,
      from: fromEmail,
      subject: `Support Ticket #${ticket.ticketNumber} ${newStatus === 'resolved' ? 'Resolved' : 'Closed'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #810FFB;">Ticket ${newStatus === 'resolved' ? 'Resolved' : 'Closed'}</h2>
          <p>Hi ${escapeHtml(ticketUser.name || ticketUser.username)},</p>
          <p>Your support ticket has been ${escapeHtml(newStatus)}.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; font-weight: bold;">Ticket</td><td style="padding: 8px;">#${ticket.ticketNumber}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Subject</td><td style="padding: 8px;">${escapeHtml(ticket.subject)}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px;">${escapeHtml(newStatus)}</td></tr>
          </table>
          <p>If you have further questions, you can reply via <a href="${baseUrl}/support">Orion Support</a>.</p>
          <p style="color: #666; font-size: 14px;">- The Synozur Team</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('[Support Email] Closure email failed:', error);
  }
}

async function syncTicketToPlanner(ticket: schema.SupportTicket, user: schema.User) {
  if (!ticket.tenantId) return;
  const tenant = await storage.getTenant(ticket.tenantId);
  if (!tenant) return;
  await syncTicketToPlannerInternal(ticket, user, tenant);
}

async function syncTicketToPlannerInternal(ticket: schema.SupportTicket, user: schema.User | undefined, tenant: schema.Tenant) {
  if (!tenant.supportPlannerEnabled || !tenant.supportPlannerPlanId || !plannerService.isConfigured(tenant)) return;

  try {
    const bucketName = tenant.supportPlannerBucketName || 'Support Tickets';
    const bucket = await plannerService.getOrCreateBucket(tenant.supportPlannerPlanId, bucketName, tenant);
    const taskTitle = `[#${ticket.ticketNumber}] ${ticket.subject}`;

    const task = await plannerService.createTask({
      planId: tenant.supportPlannerPlanId,
      bucketId: bucket.id,
      title: taskTitle,
    }, tenant);

    const details = await plannerService.getTaskDetails(task.id, tenant);
    const description = `Priority: ${ticket.priority}\nCategory: ${ticket.category}\nSubmitted by: ${user?.name || user?.username || 'Unknown'}\nTenant: ${tenant.name}`;
    await plannerService.updateTaskDetails(task.id, details['@odata.etag']!, description, tenant);

    await storage.createSupportTicketPlannerSync({
      ticketId: ticket.id,
      tenantId: tenant.id,
      planId: tenant.supportPlannerPlanId,
      taskId: task.id,
      taskTitle,
      bucketId: bucket.id,
      bucketName,
      syncStatus: 'synced',
      remoteEtag: task['@odata.etag'] || null,
    });

    console.log(`[Planner] Synced ticket #${ticket.ticketNumber} to task ${task.id}`);
  } catch (error: any) {
    console.error(`[Planner] Sync failed for ticket #${ticket.ticketNumber}:`, error.message);

    await storage.createSupportTicketPlannerSync({
      ticketId: ticket.id,
      tenantId: tenant.id,
      planId: tenant.supportPlannerPlanId!,
      taskId: 'sync-failed',
      taskTitle: `[#${ticket.ticketNumber}] ${ticket.subject}`,
      syncStatus: 'failed',
      syncError: error.message,
    });
  }
}

async function markPlannerTaskComplete(ticket: schema.SupportTicket) {
  const syncRecord = await storage.getSupportTicketPlannerSync(ticket.id);
  if (!syncRecord || syncRecord.syncStatus !== 'synced' || syncRecord.taskId === 'sync-failed') return;

  let tenantConfig = null;
  if (ticket.tenantId) {
    const tenant = await storage.getTenant(ticket.tenantId);
    if (tenant) tenantConfig = tenant;
  }

  try {
    const task = await plannerService.getTaskWithDetails(syncRecord.taskId, tenantConfig);
    await plannerService.updateTask(syncRecord.taskId, task['@odata.etag']!, { percentComplete: 100 }, tenantConfig);

    await storage.updateSupportTicketPlannerSync(syncRecord.id, {
      syncStatus: 'completed',
      lastSyncedAt: new Date(),
    });
  } catch (error: any) {
    console.error(`[Planner] Failed to mark task complete:`, error.message);
  }
}

export default router;

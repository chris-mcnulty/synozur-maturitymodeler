import { Express } from 'express';
import { db } from '../db';
import { assessments, results, users, models } from '@shared/schema';
import { eq, and, gte, lt, isNotNull } from 'drizzle-orm';
import { ensureGlobalAdmin } from '../auth';
import { getUncachableSendGridClient, buildEmailFrom, getEmailBranding } from '../sendgrid';

export function registerRemediationRoutes(app: Express) {

  // GET /api/admin/remediation/results
  // Query params: modelId (required), date (YYYY-MM-DD, required)
  // Returns all completed assessments for the model on that date, with user info and score
  app.get('/api/admin/remediation/results', ensureGlobalAdmin, async (req, res) => {
    try {
      const { modelId, date } = req.query as { modelId: string; date?: string };
      if (!modelId) {
        return res.status(400).json({ error: 'modelId is required' });
      }

      // Build date filter. Add +/- 14-hour buffer around the local day to handle
      // any timezone offset between the server and where respondents took the assessment.
      const dateConditions: ReturnType<typeof and>[] = [
        eq(assessments.modelId, modelId),
        eq(assessments.status, 'completed'),
      ];
      if (date) {
        // Widen window by 14 hours either side to avoid UTC-vs-local-timezone mismatches
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        dayStart.setHours(dayStart.getHours() - 14);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        dayEnd.setHours(dayEnd.getHours() + 14);
        dateConditions.push(gte(assessments.completedAt, dayStart));
        dateConditions.push(lt(assessments.completedAt, dayEnd));
      }

      // Fetch completed assessments for this model on this date, joined with results and users
      const rows = await db
        .select({
          assessmentId: assessments.id,
          completedAt: assessments.completedAt,
          isProxy: assessments.isProxy,
          proxyName: assessments.proxyName,
          userId: assessments.userId,
          overallScore: results.overallScore,
          storedLabel: results.label,
          resultId: results.id,
          userName: users.displayName,
          userEmail: users.email,
        })
        .from(assessments)
        .innerJoin(results, eq(results.assessmentId, assessments.id))
        .leftJoin(users, eq(users.id, assessments.userId))
        .where(and(...dateConditions))
        .orderBy(assessments.completedAt);

      // Fetch model name
      const [model] = await db.select({ name: models.name }).from(models).where(eq(models.id, modelId)).limit(1);

      res.json({
        modelName: model?.name || 'Unknown Model',
        results: rows.map(r => ({
          assessmentId: r.assessmentId,
          resultId: r.resultId,
          completedAt: r.completedAt,
          name: r.isProxy ? r.proxyName : (r.userName || 'Unknown'),
          email: r.userEmail || null,
          userId: r.userId,
          overallScore: r.overallScore,
          storedLabel: r.storedLabel,
        })),
      });
    } catch (error) {
      console.error('Remediation results error:', error);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  });

  // POST /api/admin/remediation/send
  // Body: { recipients: [{ email, name, overallScore, correctLevel }], subject, messageTemplate, modelName }
  app.post('/api/admin/remediation/send', ensureGlobalAdmin, async (req, res) => {
    try {
      const { recipients, subject, messageTemplate, modelName } = req.body as {
        recipients: Array<{ email: string; name: string; overallScore: number; correctLevel: string }>;
        subject: string;
        messageTemplate: string;
        modelName: string;
      };

      if (!recipients?.length || !subject || !messageTemplate) {
        return res.status(400).json({ error: 'recipients, subject, and messageTemplate are required' });
      }

      const { client: sgMail, fromEmail } = await getUncachableSendGridClient();
      const branding = await getEmailBranding(null);
      const from = await buildEmailFrom(fromEmail);

      const sentTo: string[] = [];
      const failed: string[] = [];

      for (const r of recipients) {
        if (!r.email) {
          failed.push(r.name || 'unknown (no email)');
          continue;
        }

        // Replace template variables
        const personalised = messageTemplate
          .replace(/\{\{name\}\}/g, r.name || 'there')
          .replace(/\{\{correctLevel\}\}/g, r.correctLevel)
          .replace(/\{\{score\}\}/g, String(r.overallScore))
          .replace(/\{\{modelName\}\}/g, modelName);

        const htmlBody = `
          <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            ${branding.headerHtml}
            <div style="padding: 32px 30px;">
              ${personalised
                .split('\n\n')
                .map(para => `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #1a1a1a;">${para.replace(/\n/g, '<br/>')}</p>`)
                .join('')}
            </div>
            ${branding.footerHtml}
          </div>`;

        const textBody = personalised;

        try {
          await sgMail.send({
            to: r.email,
            from,
            subject,
            text: textBody,
            html: htmlBody,
          });
          sentTo.push(r.email);
        } catch (err: any) {
          console.error(`Failed to send to ${r.email}:`, err?.response?.body || err);
          failed.push(r.email);
        }
      }

      res.json({ sent: sentTo.length, failed: failed.length, sentTo, failed });
    } catch (error: any) {
      console.error('Remediation send error:', error);
      res.status(500).json({ error: error.message || 'Failed to send emails' });
    }
  });
}

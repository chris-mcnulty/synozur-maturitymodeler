import type { Express } from "express";
  import { storage } from "../storage";
  import { db } from "../db";
  import { eq, inArray, desc, gte, lt, and, sql, isNotNull, isNull, or, notInArray } from "drizzle-orm";
  import * as schema from "@shared/schema";
  import { insertAssessmentSchema, insertAssessmentResponseSchema, insertResultSchema, insertModelSchema, insertDimensionSchema, insertQuestionSchema, insertAnswerSchema, type Answer } from "@shared/schema";
  import { ensureAuthenticated, ensureAdmin, ensureAdminOrModeler, ensureAnyAdmin, ensureGlobalAdmin } from "../auth";
  import { canManageUsers, canAssignRole, checkIsGlobalAdmin, getAccessibleTenantIds, canAccessModel, hasAdminAccess } from "../permissions";
  import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
  import { aiService } from "../services/ai-service";
  import { providerRegistry } from "../services/ai-providers/registry";
  import { validateImportData, executeImport, type ImportExportData } from "../services/import-service";
  import { z } from "zod";
  import { randomBytes, createHash } from "crypto";
  import bcrypt from "bcryptjs";
  import { generateAdminConsentUrl, isSsoConfigured, extractDomain } from "../services/sso-service";
  import { hashPassword, comparePasswords } from "../utils/password";

// ===========================================================================
// CROSS-MODEL INSIGHTS & TRENDS (Task #11) - shared helper
// ===========================================================================

export type CompletedRow = {
  assessmentId: string;
  userId: string | null;
  modelId: string;
  modelName: string;
  modelClass: string;
  maturityScale: any;
  completedAt: Date | null;
  overallScore: number;
  label: string;
  dimensionScores: any;
};

export type BenchmarkStat = {
  sampleSize: number;
  meanPercent: number;
  percentile: number;
};

export type ModelInsight = {
  modelId: string;
  modelName: string;
  modelClass: string;
  maxScore: number;
  assessmentCount: number;
  latestScore: number;
  latestScorePercent: number;
  latestLabel: string | null;
  trendDelta: number;
  trendDirection: 'up' | 'down' | 'flat' | 'single';
  trend: Array<{
    assessmentId: string;
    completedAt: string | null;
    score: number;
    scorePercent: number;
    label: string | null;
  }>;
  benchmarks?: {
    global?: BenchmarkStat;
    tenant?: BenchmarkStat;
  };
};

export type DimensionInsight = {
  label: string;
  averagePercent: number;
  modelCount: number;
  sampleSize: number;
  contributingModels: Array<{ modelName: string; averagePercent: number }>;
};

export function buildInsightsFromRows(
  rows: CompletedRow[],
  dimensionLabelMap: Map<string, string>
): { models: ModelInsight[]; crossModelDimensions: DimensionInsight[] } {
  const byModel = new Map<string, CompletedRow[]>();
  for (const r of rows) {
    const list = byModel.get(r.modelId) ?? [];
    list.push(r);
    byModel.set(r.modelId, list);
  }

  const models: ModelInsight[] = [];
  const dimAcc = new Map<
    string,
    {
      label: string;
      sumPercent: number;
      sampleSize: number;
      perModel: Map<string, { modelName: string; sumPercent: number; n: number }>;
    }
  >();

  Array.from(byModel.entries()).forEach(([modelId, modelRows]) => {
    modelRows.sort((a: CompletedRow, b: CompletedRow) => {
      const da = a.completedAt ? a.completedAt.getTime() : 0;
      const db_ = b.completedAt ? b.completedAt.getTime() : 0;
      return da - db_;
    });

    const first = modelRows[0];
    const maturityScale = (first.maturityScale as any[]) || [];
    const maxScore = maturityScale.length > 0
      ? Math.max(...maturityScale.map((s: any) => s.maxScore || 100))
      : 100;

    const trend = modelRows.map(r => ({
      assessmentId: r.assessmentId,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      score: r.overallScore,
      scorePercent: maxScore > 0 ? Math.round((r.overallScore / maxScore) * 1000) / 10 : 0,
      label: r.label ?? null,
    }));

    const latest = modelRows[modelRows.length - 1];
    const firstPercent = maxScore > 0 ? (first.overallScore / maxScore) * 100 : 0;
    const latestPercent = maxScore > 0 ? (latest.overallScore / maxScore) * 100 : 0;
    const trendDelta = Math.round((latestPercent - firstPercent) * 10) / 10;
    let trendDirection: ModelInsight['trendDirection'];
    if (modelRows.length === 1) trendDirection = 'single';
    else if (trendDelta > 1) trendDirection = 'up';
    else if (trendDelta < -1) trendDirection = 'down';
    else trendDirection = 'flat';

    models.push({
      modelId,
      modelName: first.modelName,
      modelClass: first.modelClass,
      maxScore,
      assessmentCount: modelRows.length,
      latestScore: latest.overallScore,
      latestScorePercent: Math.round(latestPercent * 10) / 10,
      latestLabel: latest.label ?? null,
      trendDelta,
      trendDirection,
      trend,
    });

    const dimScores = (latest.dimensionScores ?? {}) as Record<string, number>;
    for (const [dimKey, raw] of Object.entries(dimScores)) {
      if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
      const pct = maxScore > 0 ? (raw / maxScore) * 100 : 0;
      const label = dimensionLabelMap.get(`${modelId}:${dimKey}`) || dimKey;
      const acc = dimAcc.get(label) ?? {
        label,
        sumPercent: 0,
        sampleSize: 0,
        perModel: new Map<string, { modelName: string; sumPercent: number; n: number }>(),
      };
      acc.sumPercent += pct;
      acc.sampleSize += 1;
      const perModel = acc.perModel.get(modelId) ?? { modelName: first.modelName, sumPercent: 0, n: 0 };
      perModel.sumPercent += pct;
      perModel.n += 1;
      acc.perModel.set(modelId, perModel);
      dimAcc.set(label, acc);
    }
  });

  const crossModelDimensions: DimensionInsight[] = Array.from(dimAcc.values())
    .map(d => ({
      label: d.label,
      averagePercent: Math.round((d.sumPercent / Math.max(d.sampleSize, 1)) * 10) / 10,
      modelCount: d.perModel.size,
      sampleSize: d.sampleSize,
      contributingModels: Array.from(d.perModel.values()).map(pm => ({
        modelName: pm.modelName,
        averagePercent: Math.round((pm.sumPercent / Math.max(pm.n, 1)) * 10) / 10,
      })),
    }))
    .sort((a, b) => b.averagePercent - a.averagePercent);

  return { models, crossModelDimensions };
}

export function registerAdminRoutes(app: Express) {
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings/:key", ensureAdmin, async (req, res) => {
    try {
      const setting = await storage.setSetting(req.params.key, req.body.value);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // AI Provider routes

  app.get("/api/benchmarks/config", ensureAdmin, async (req, res) => {
    try {
      const { getBenchmarkConfig } = await import('../services/benchmark-service.js');
      const config = await getBenchmarkConfig();
      res.json(config);
    } catch (error) {
      console.error('Get benchmark config error:', error);
      res.status(500).json({ error: "Failed to get benchmark configuration" });
    }
  });

  app.put("/api/benchmarks/config", ensureAdmin, async (req, res) => {
    try {
      const { setBenchmarkConfig } = await import('../services/benchmark-service.js');
      await setBenchmarkConfig(req.body);
      res.json({ success: true });
    } catch (error) {
      console.error('Update benchmark config error:', error);
      res.status(500).json({ error: "Failed to update benchmark configuration" });
    }
  });

  app.post("/api/benchmarks/calculate/:modelId", ensureAdmin, async (req, res) => {
    try {
      const { calculateBenchmarks } = await import('../services/benchmark-service.js');
      await calculateBenchmarks(req.params.modelId);
      res.json({ success: true, message: "Benchmarks calculated successfully" });
    } catch (error) {
      console.error('Calculate benchmarks error:', error);
      res.status(500).json({ error: "Failed to calculate benchmarks" });
    }
  });

  app.get("/api/benchmarks/:modelId", async (req, res) => {
    try {
      const { getBenchmarksForUser } = await import('../services/benchmark-service.js');
      
      // Get user profile if authenticated
      const userProfile = req.user ? {
        industry: req.user.industry || undefined,
        companySize: req.user.companySize || undefined,
        country: req.user.country || undefined,
      } : undefined;

      const benchmarks = await getBenchmarksForUser(req.params.modelId, userProfile);
      res.json(benchmarks);
    } catch (error) {
      console.error('Get benchmarks error:', error);
      res.status(500).json({ error: "Failed to get benchmarks" });
    }
  });

  app.get("/api/benchmarks/:modelId/all", ensureAdmin, async (req, res) => {
    try {
      const { getAllBenchmarksForModel } = await import('../services/benchmark-service.js');
      const benchmarks = await getAllBenchmarksForModel(req.params.modelId);
      res.json(benchmarks);
    } catch (error) {
      console.error('Get all benchmarks error:', error);
      res.status(500).json({ error: "Failed to get all benchmarks" });
    }
  });

  // Export assessment results

  app.post("/api/traffic/track", async (req, res) => {
    try {
      const { page, referrer } = req.body;
      
      // Validate page
      const validPages = ['homepage', 'signup', 'login'];
      if (!page || !validPages.includes(page)) {
        return res.status(400).json({ error: "Invalid page" });
      }
      
      // Get client IP (handle proxies)
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                 req.socket.remoteAddress || 
                 'unknown';
      
      // Hash IP for privacy (SHA-256 with daily salt)
      const crypto = await import('crypto');
      const today = new Date().toISOString().split('T')[0];
      const ipHash = crypto.createHash('sha256').update(ip + today).digest('hex').substring(0, 16);
      
      // Get country from IP using geoip-lite
      let country: string | null = null;
      try {
        const geoip = await import('geoip-lite');
        const geo = geoip.lookup(ip);
        country = geo?.country || null;
      } catch (e) {
        // Fallback: try to get from accept-language header
        const acceptLanguage = req.headers['accept-language'];
        if (acceptLanguage) {
          // Try to extract country from locale (e.g., en-US -> US)
          const match = acceptLanguage.match(/[a-z]{2}-([A-Z]{2})/);
          country = match?.[1] || null;
        }
      }
      
      // Parse user agent for device and browser info
      let deviceType: string | null = null;
      let browser: string | null = null;
      let browserVersion: string | null = null;
      let os: string | null = null;
      
      const userAgent = req.headers['user-agent'];
      if (userAgent) {
        const UAParserModule = await import('ua-parser-js');
        const UAParser: any = (UAParserModule as any).default || (UAParserModule as any).UAParser || UAParserModule;
        const parser = new UAParser(userAgent);
        const result = parser.getResult();
        
        browser = result.browser?.name || null;
        browserVersion = result.browser?.version || null;
        os = result.os?.name || null;
        
        // Determine device type
        const deviceTypeRaw = result.device?.type;
        if (deviceTypeRaw === 'mobile') {
          deviceType = 'mobile';
        } else if (deviceTypeRaw === 'tablet') {
          deviceType = 'tablet';
        } else {
          deviceType = 'desktop';
        }
      }
      
      // Insert traffic record (fire-and-forget style but await for safety)
      await db.insert(schema.trafficVisits).values({
        page,
        country,
        deviceType,
        browser,
        browserVersion,
        os,
        referrer: referrer || null,
        ipHash,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Traffic tracking error:", error);
      // Don't expose errors to client, just return success
      res.json({ success: true });
    }
  });
  
  // Get traffic analytics data (admin only)

  app.get("/api/traffic", ensureAnyAdmin, async (req, res) => {
    try {
      const { dateFrom, dateTo, page, country, deviceType, browser } = req.query;
      
      // Build conditions array
      const conditions = [];
      
      if (dateFrom) {
        conditions.push(gte(schema.trafficVisits.visitedAt, new Date(dateFrom as string)));
      }
      if (dateTo) {
        // Add 1 day to include the end date
        const endDate = new Date(dateTo as string);
        endDate.setDate(endDate.getDate() + 1);
        conditions.push(lt(schema.trafficVisits.visitedAt, endDate));
      }
      if (page && page !== 'all') {
        conditions.push(eq(schema.trafficVisits.page, page as string));
      }
      if (country && country !== 'all') {
        conditions.push(eq(schema.trafficVisits.country, country as string));
      }
      if (deviceType && deviceType !== 'all') {
        conditions.push(eq(schema.trafficVisits.deviceType, deviceType as string));
      }
      if (browser && browser !== 'all') {
        conditions.push(eq(schema.trafficVisits.browser, browser as string));
      }
      
      // Get all matching visits
      const visits = await db
        .select()
        .from(schema.trafficVisits)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.trafficVisits.visitedAt));
      
      // Calculate summary statistics
      const totalVisits = visits.length;
      
      // Group by page
      const pageBreakdown: Record<string, number> = {};
      visits.forEach(v => {
        pageBreakdown[v.page] = (pageBreakdown[v.page] || 0) + 1;
      });
      
      // Group by country (top 10)
      const countryBreakdown: Record<string, number> = {};
      visits.forEach(v => {
        const c = v.country || 'Unknown';
        countryBreakdown[c] = (countryBreakdown[c] || 0) + 1;
      });
      const topCountries = Object.entries(countryBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      // Group by device type
      const deviceBreakdown: Record<string, number> = {};
      visits.forEach(v => {
        const d = v.deviceType || 'Unknown';
        deviceBreakdown[d] = (deviceBreakdown[d] || 0) + 1;
      });
      
      // Group by browser (top 10)
      const browserBreakdown: Record<string, number> = {};
      visits.forEach(v => {
        const b = v.browser || 'Unknown';
        browserBreakdown[b] = (browserBreakdown[b] || 0) + 1;
      });
      const topBrowsers = Object.entries(browserBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      // Helper function to format date in Pacific time as YYYY-MM-DD
      const toPacificDate = (date: Date): string => {
        const parts = date.toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).split('/');
        return `${parts[2]}-${parts[0]}-${parts[1]}`;
      };
      
      // Daily time series (last 30 days or filtered range) - using Pacific time
      const dailyVisits: Record<string, number> = {};
      visits.forEach(v => {
        const formattedDay = toPacificDate(v.visitedAt);
        dailyVisits[formattedDay] = (dailyVisits[formattedDay] || 0) + 1;
      });
      const timeSeries = Object.entries(dailyVisits)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));
      
      // Get unique values for filters
      const uniqueCountries = Array.from(new Set(visits.map(v => v.country).filter((c): c is string => c !== null))).sort();
      const uniqueBrowsers = Array.from(new Set(visits.map(v => v.browser).filter((b): b is string => b !== null))).sort();
      
      res.json({
        totalVisits,
        pageBreakdown,
        topCountries,
        deviceBreakdown,
        topBrowsers,
        timeSeries,
        filterOptions: {
          countries: uniqueCountries,
          browsers: uniqueBrowsers,
        },
        visits: visits.slice(0, 100), // Return first 100 for detail view
      });
    } catch (error) {
      console.error("Traffic analytics error:", error);
      res.status(500).json({ error: "Failed to fetch traffic data" });
    }
  });
  
  // Export traffic data as CSV (admin only)

  app.get("/api/traffic/export", ensureAnyAdmin, async (req, res) => {
    try {
      const { dateFrom, dateTo, page, country, deviceType, browser } = req.query;
      
      // Build conditions array
      const conditions = [];
      
      if (dateFrom) {
        conditions.push(gte(schema.trafficVisits.visitedAt, new Date(dateFrom as string)));
      }
      if (dateTo) {
        const endDate = new Date(dateTo as string);
        endDate.setDate(endDate.getDate() + 1);
        conditions.push(lt(schema.trafficVisits.visitedAt, endDate));
      }
      if (page && page !== 'all') {
        conditions.push(eq(schema.trafficVisits.page, page as string));
      }
      if (country && country !== 'all') {
        conditions.push(eq(schema.trafficVisits.country, country as string));
      }
      if (deviceType && deviceType !== 'all') {
        conditions.push(eq(schema.trafficVisits.deviceType, deviceType as string));
      }
      if (browser && browser !== 'all') {
        conditions.push(eq(schema.trafficVisits.browser, browser as string));
      }
      
      // Get all matching visits
      const visits = await db
        .select()
        .from(schema.trafficVisits)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.trafficVisits.visitedAt));
      
      // Helper function to format date in Pacific time
      const toPacificDateTime = (date: Date): { date: string; time: string } => {
        const dateParts = date.toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).split('/');
        const time = date.toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return {
          date: `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}`,
          time: time
        };
      };
      
      // Build CSV
      const headers = ['Date (Pacific)', 'Time (Pacific)', 'Page', 'Country', 'Device Type', 'Browser', 'Browser Version', 'OS', 'Referrer'];
      const rows = visits.map(v => {
        const dt = toPacificDateTime(v.visitedAt);
        return [
          dt.date,
          dt.time,
          v.page,
          v.country || '',
          v.deviceType || '',
          v.browser || '',
          v.browserVersion || '',
          v.os || '',
          v.referrer || '',
        ];
      });
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="traffic-report-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Traffic export error:", error);
      res.status(500).json({ error: "Failed to export traffic data" });
    }
  });

  // Knowledge base routes
  
  // Get upload URL for knowledge document

  app.post("/api/knowledge/upload-url", ensureAdminOrModeler, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });
  
  // Create knowledge document metadata after file upload

  app.post("/api/knowledge/documents", ensureAdminOrModeler, async (req, res) => {
    try {
      const { name, fileUrl, fileSize, fileType, scope, modelId, description } = req.body;
      
      // Validate file type
      const allowedTypes = ['pdf', 'docx', 'doc', 'txt', 'md'];
      if (!allowedTypes.includes(fileType.toLowerCase())) {
        return res.status(400).json({ 
          error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
        });
      }
      
      // Validate file size (25MB = 26214400 bytes)
      const maxSize = 26214400;
      if (fileSize > maxSize) {
        return res.status(400).json({ 
          error: "File size exceeds 25MB limit" 
        });
      }
      
      // Validate scope
      if (!['company-wide', 'model-specific'].includes(scope)) {
        return res.status(400).json({ 
          error: "Scope must be 'company-wide' or 'model-specific'" 
        });
      }
      
      // If model-specific, ensure modelId is provided
      if (scope === 'model-specific' && !modelId) {
        return res.status(400).json({ 
          error: "Model ID required for model-specific documents" 
        });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for the uploaded document (private for knowledge docs)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        fileUrl,
        {
          owner: req.user!.id,
          visibility: "private",
        }
      );
      
      // Create document record in database
      const document = await db.insert(schema.knowledgeDocuments).values({
        name,
        fileUrl: normalizedPath,
        fileSize,
        fileType: fileType.toLowerCase(),
        scope,
        modelId: scope === 'model-specific' ? modelId : null,
        description,
        uploadedBy: req.user!.id,
      }).returning();
      
      res.json(document[0]);
    } catch (error) {
      console.error("Error creating knowledge document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });
  
  // List all knowledge documents (with optional filters)

  app.get("/api/knowledge/documents", ensureAdminOrModeler, async (req, res) => {
    try {
      const { scope, modelId } = req.query;
      
      let query = db.select().from(schema.knowledgeDocuments);
      
      if (scope) {
        query = query.where(eq(schema.knowledgeDocuments.scope, scope as string)) as any;
      }
      
      if (modelId) {
        query = query.where(eq(schema.knowledgeDocuments.modelId, modelId as string)) as any;
      }
      
      const documents = await query.orderBy(desc(schema.knowledgeDocuments.uploadedAt));
      res.json(documents);
    } catch (error) {
      console.error("Error listing knowledge documents:", error);
      res.status(500).json({ error: "Failed to list documents" });
    }
  });
  
  // Delete knowledge document

  app.delete("/api/knowledge/documents/:id", ensureAdminOrModeler, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get document to find file URL
      const docResult = await db
        .select()
        .from(schema.knowledgeDocuments)
        .where(eq(schema.knowledgeDocuments.id, id))
        .limit(1);
      
      const doc = docResult[0];
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Delete from database
      await db.delete(schema.knowledgeDocuments)
        .where(eq(schema.knowledgeDocuments.id, id));
      
      // Optionally delete file from object storage
      // (skipping this for now to preserve files if needed)
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting knowledge document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // API endpoint for Open Graph preview pages
  // Note: We use /api/og/ instead of /share/ because Vite's dev server catches non-API routes
  // Social media crawlers will visit this URL and see proper meta tags
  // Real users will be JavaScript-redirected to the actual model page

  // ===========================================================================
  // CROSS-MODEL INSIGHTS & TRENDS (Task #11)
  // ===========================================================================

  // Manually trigger the monthly Insights digest (global admin only).
  // Useful for testing and to recover from a missed scheduled run.
  app.post("/api/admin/digest/run-monthly", ensureGlobalAdmin, async (req, res) => {
    try {
      const force = req.query.force === 'true' || req.body?.force === true;
      const { runMonthlyDigest } = await import('../services/digest-service');
      const summary = await runMonthlyDigest({ force });
      res.json(summary);
    } catch (error) {
      console.error('Failed to run monthly digest:', error);
      res.status(500).json({ error: 'Failed to run monthly digest' });
    }
  });

  // Bulk update monthly digest opt-out for all users or a specific tenant.
  // optOut=true  => disable digest for those users
  // optOut=false => re-enable digest for those users
  app.post("/api/admin/users/bulk-digest-setting", ensureGlobalAdmin, async (req, res) => {
    try {
      const schema2 = z.object({
        optOut: z.boolean(),
        tenantId: z.string().optional().nullable(), // null/undefined = all users
      });
      const parsed = schema2.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
      const { optOut, tenantId } = parsed.data;

      const condition = tenantId
        ? eq(schema.users.tenantId, tenantId)
        : undefined; // no filter = all users

      const result = condition
        ? await db.update(schema.users).set({ monthlyDigestOptOut: optOut }).where(condition)
        : await db.update(schema.users).set({ monthlyDigestOptOut: optOut });

      const count = (result as any).rowCount ?? 0;
      res.json({ updated: count, optOut, tenantId: tenantId ?? 'all' });
    } catch (error) {
      console.error('Failed to bulk update digest setting:', error);
      res.status(500).json({ error: 'Failed to update digest settings' });
    }
  });

  // Safe bulk opt-in: sets monthlyDigestOptOut=false for ALL users EXCEPT
  // those belonging to the specified tenant IDs.  Use this to safely opt-in
  // all production users while leaving certain tenants untouched.
  app.post("/api/admin/users/safe-opt-in-except", ensureGlobalAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        excludeTenantIds: z.array(z.string()).min(0),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
      const { excludeTenantIds } = parsed.data;

      let result;
      if (excludeTenantIds.length === 0) {
        // No exclusions — opt in everyone
        result = await db.update(schema.users).set({ monthlyDigestOptOut: false });
      } else {
        // Opt in all users whose tenantId is NOT in the exclusion list.
        // Users with tenantId=null (no tenant) are always opted in.
        result = await db
          .update(schema.users)
          .set({ monthlyDigestOptOut: false })
          .where(
            or(
              isNull(schema.users.tenantId),
              notInArray(schema.users.tenantId, excludeTenantIds),
            )
          );
      }

      const count = (result as any).rowCount ?? 0;
      res.json({ updated: count, excludedTenantIds: excludeTenantIds });
    } catch (error) {
      console.error('Failed to run safe opt-in:', error);
      res.status(500).json({ error: 'Failed to perform safe opt-in' });
    }
  });

  // Get digest opt-out stats (counts per state).
  app.get("/api/admin/users/digest-stats", ensureGlobalAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          optOut: schema.users.monthlyDigestOptOut,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.users)
        .groupBy(schema.users.monthlyDigestOptOut);
      const optedIn = rows.find(r => r.optOut === false)?.count ?? 0;
      const optedOut = rows.find(r => r.optOut === true)?.count ?? 0;
      res.json({ optedIn, optedOut, total: optedIn + optedOut });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get digest stats' });
    }
  });

  // Personal insights for the logged-in user
  app.get("/api/insights/user", ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userTenantId = req.user!.tenantId ?? null;

      const completedRows = await db
        .select({
          assessmentId: schema.assessments.id,
          userId: schema.assessments.userId,
          modelId: schema.assessments.modelId,
          modelName: schema.models.name,
          modelClass: schema.models.modelClass,
          maturityScale: schema.models.maturityScale,
          completedAt: schema.assessments.completedAt,
          overallScore: schema.results.overallScore,
          label: schema.results.label,
          dimensionScores: schema.results.dimensionScores,
        })
        .from(schema.assessments)
        .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
        .innerJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
        .where(and(
          eq(schema.assessments.userId, userId),
          eq(schema.assessments.status, 'completed'),
        ));

      const modelIds = Array.from(new Set(completedRows.map(r => r.modelId)));
      const dimensionLabelMap = new Map<string, string>();
      if (modelIds.length > 0) {
        const dims = await db
          .select({ modelId: schema.dimensions.modelId, key: schema.dimensions.key, label: schema.dimensions.label })
          .from(schema.dimensions)
          .where(inArray(schema.dimensions.modelId, modelIds));
        for (const d of dims) dimensionLabelMap.set(`${d.modelId}:${d.key}`, d.label);
      }

      const { models, crossModelDimensions } = buildInsightsFromRows(
        completedRows as CompletedRow[],
        dimensionLabelMap,
      );

      // ----- Benchmark augmentation (global + tenant) -----
      let globalBenchmarkRadar: DimensionInsight[] = [];
      let tenantBenchmarkRadar: DimensionInsight[] = [];

      if (modelIds.length > 0 && models.length > 0) {
        const { getBenchmarkConfig } = await import('../services/benchmark-service');
        const benchmarkConfig = await getBenchmarkConfig();
        const minCohort = benchmarkConfig.minSampleSizeOverall;

        // Pull peer rows for the user's models (exclude anonymous/proxy/imported by default)
        type PeerRow = CompletedRow & { tenantId: string | null };
        const peerConditions = [
          inArray(schema.assessments.modelId, modelIds),
          eq(schema.assessments.status, 'completed'),
          eq(schema.assessments.isProxy, false),
          isNotNull(schema.assessments.userId),
          sql`${schema.assessments.importBatchId} IS NULL`,
        ];

        const peerRows: PeerRow[] = await db
          .select({
            assessmentId: schema.assessments.id,
            userId: schema.assessments.userId,
            tenantId: schema.users.tenantId,
            modelId: schema.assessments.modelId,
            modelName: schema.models.name,
            modelClass: schema.models.modelClass,
            maturityScale: schema.models.maturityScale,
            completedAt: schema.assessments.completedAt,
            overallScore: schema.results.overallScore,
            label: schema.results.label,
            dimensionScores: schema.results.dimensionScores,
          })
          .from(schema.assessments)
          .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
          .innerJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
          .innerJoin(schema.users, eq(schema.users.id, schema.assessments.userId))
          .where(and(...peerConditions));

        // Reduce to latest completed per (user, model)
        const reduceLatestPerUserModel = (rows: PeerRow[]): PeerRow[] => {
          const map = new Map<string, PeerRow>();
          for (const r of rows) {
            if (!r.userId) continue;
            const key = `${r.userId}:${r.modelId}`;
            const existing = map.get(key);
            const t = r.completedAt ? r.completedAt.getTime() : 0;
            const et = existing?.completedAt ? existing.completedAt.getTime() : 0;
            if (!existing || t >= et) map.set(key, r);
          }
          return Array.from(map.values());
        };

        const globalLatest = reduceLatestPerUserModel(peerRows);
        const tenantLatest = userTenantId
          ? globalLatest.filter(r => r.tenantId === userTenantId)
          : [];

        // Compute per-model benchmark stats (sampleSize, meanPercent, user's percentile)
        const computePerModelBenchmark = (
          peers: PeerRow[],
        ): Map<string, BenchmarkStat> => {
          const out = new Map<string, BenchmarkStat>();
          const byModel = new Map<string, PeerRow[]>();
          for (const r of peers) {
            const list = byModel.get(r.modelId) ?? [];
            list.push(r);
            byModel.set(r.modelId, list);
          }
          for (const m of models) {
            const list = byModel.get(m.modelId) ?? [];
            const sampleSize = list.length;
            if (sampleSize < minCohort) continue;
            const maxScore = m.maxScore || 100;
            const meanScore = list.reduce((s, r) => s + r.overallScore, 0) / sampleSize;
            const meanPercent = Math.round((meanScore / maxScore) * 1000) / 10;
            const userScore = m.latestScore;
            // Percentile rank: % of peers with score <= user (inclusive); if user is in the cohort, this is the standard percentile.
            const atOrBelow = list.filter(r => r.overallScore <= userScore).length;
            const percentile = Math.round((atOrBelow / sampleSize) * 100);
            out.set(m.modelId, { sampleSize, meanPercent, percentile });
          }
          return out;
        };

        const globalPerModel = computePerModelBenchmark(globalLatest);
        const tenantPerModel: Map<string, BenchmarkStat> = userTenantId
          ? computePerModelBenchmark(tenantLatest)
          : new Map();

        for (const m of models) {
          const g = globalPerModel.get(m.modelId);
          const t = tenantPerModel.get(m.modelId);
          if (g || t) {
            m.benchmarks = {};
            if (g) m.benchmarks.global = g;
            if (t) m.benchmarks.tenant = t;
          }
        }

        // Cross-model benchmark radar — average dimension percentages across ALL latest
        // peer rows (one per user×model), gated by cohort threshold per label and
        // restricted to dimension labels the user actually has.
        const userLabels = new Set(crossModelDimensions.map(d => d.label));

        // Pre-compute maxScore per modelId from this user's models (peers share the same models).
        const maxScoreByModel = new Map<string, number>();
        for (const m of models) maxScoreByModel.set(m.modelId, m.maxScore || 100);

        const buildBenchmarkRadar = (peers: PeerRow[]): DimensionInsight[] => {
          if (peers.length === 0) return [];
          const acc = new Map<string, {
            label: string;
            sumPercent: number;
            count: number;
            users: Set<string>;
            perModel: Map<string, { modelName: string; sumPercent: number; n: number }>;
          }>();
          for (const r of peers) {
            if (!r.userId) continue;
            const maxScore = maxScoreByModel.get(r.modelId)
              ?? (Array.isArray(r.maturityScale) && r.maturityScale.length > 0
                ? Math.max(...(r.maturityScale as Array<{ maxScore?: number }>).map(s => s.maxScore || 100))
                : 100);
            const dimScores = (r.dimensionScores ?? {}) as Record<string, number>;
            for (const [dimKey, raw] of Object.entries(dimScores)) {
              if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
              const label = dimensionLabelMap.get(`${r.modelId}:${dimKey}`) || dimKey;
              if (!userLabels.has(label)) continue;
              const pct = maxScore > 0 ? (raw / maxScore) * 100 : 0;
              const entry = acc.get(label) ?? {
                label,
                sumPercent: 0,
                count: 0,
                users: new Set<string>(),
                perModel: new Map<string, { modelName: string; sumPercent: number; n: number }>(),
              };
              entry.sumPercent += pct;
              entry.count += 1;
              entry.users.add(r.userId);
              const pm = entry.perModel.get(r.modelId) ?? { modelName: r.modelName, sumPercent: 0, n: 0 };
              pm.sumPercent += pct;
              pm.n += 1;
              entry.perModel.set(r.modelId, pm);
              acc.set(label, entry);
            }
          }
          return Array.from(acc.values())
            .filter(e => e.users.size >= minCohort)
            .map(e => ({
              label: e.label,
              averagePercent: Math.round((e.sumPercent / Math.max(e.count, 1)) * 10) / 10,
              modelCount: e.perModel.size,
              sampleSize: e.count,
              contributingModels: Array.from(e.perModel.values()).map(pm => ({
                modelName: pm.modelName,
                averagePercent: Math.round((pm.sumPercent / Math.max(pm.n, 1)) * 10) / 10,
              })),
            }));
        };

        globalBenchmarkRadar = buildBenchmarkRadar(globalLatest);
        if (userTenantId) tenantBenchmarkRadar = buildBenchmarkRadar(tenantLatest);
      }

      const totalCompleted = completedRows.length;
      res.json({
        scope: 'user',
        totalCompleted,
        modelCount: models.length,
        models,
        crossModelDimensions,
        benchmarkRadar: {
          global: globalBenchmarkRadar,
          tenant: tenantBenchmarkRadar,
        },
      });
    } catch (error) {
      console.error('Failed to build user insights:', error);
      res.status(500).json({ error: 'Failed to build user insights' });
    }
  });

  // Tenant aggregate insights for tenant admins (anonymized, cohort-thresholded)
  app.get("/api/insights/tenant", ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user!;
      const isGlobal = user.role === 'global_admin';
      const isTenantAdmin = user.role === 'tenant_admin';
      if (!isGlobal && !isTenantAdmin) {
        return res.status(403).json({ error: 'Tenant admin access required' });
      }

      let tenantId: string | null = null;
      if (isTenantAdmin) {
        if (!user.tenantId) return res.status(400).json({ error: 'No tenant assigned' });
        tenantId = user.tenantId;
      } else if (typeof req.query.tenantId === 'string') {
        tenantId = req.query.tenantId;
      } else {
        tenantId = user.tenantId ?? null;
      }
      if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

      const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const { getBenchmarkConfig } = await import('../services/benchmark-service');
      const benchmarkConfig = await getBenchmarkConfig();
      const minCohort = benchmarkConfig.minSampleSizeOverall;

      const completedRows = await db
        .select({
          assessmentId: schema.assessments.id,
          userId: schema.assessments.userId,
          modelId: schema.assessments.modelId,
          modelName: schema.models.name,
          modelClass: schema.models.modelClass,
          maturityScale: schema.models.maturityScale,
          completedAt: schema.assessments.completedAt,
          overallScore: schema.results.overallScore,
          label: schema.results.label,
          dimensionScores: schema.results.dimensionScores,
        })
        .from(schema.assessments)
        .innerJoin(schema.models, eq(schema.assessments.modelId, schema.models.id))
        .innerJoin(schema.results, eq(schema.results.assessmentId, schema.assessments.id))
        .innerJoin(schema.users, eq(schema.users.id, schema.assessments.userId))
        .where(and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.assessments.status, 'completed'),
          eq(schema.assessments.isProxy, false),
        ));

      const distinctUsers = new Set(completedRows.map(r => r.userId).filter(Boolean));
      const cohortSize = distinctUsers.size;

      if (cohortSize < minCohort) {
        return res.json({
          scope: 'tenant',
          tenantId,
          tenantName: tenant.name,
          cohortSize,
          minCohort,
          belowThreshold: true,
          totalCompleted: completedRows.length,
          modelCount: 0,
          models: [],
          crossModelDimensions: [],
        });
      }

      const modelIds = Array.from(new Set(completedRows.map(r => r.modelId)));
      const dimensionLabelMap = new Map<string, string>();
      if (modelIds.length > 0) {
        const dims = await db
          .select({ modelId: schema.dimensions.modelId, key: schema.dimensions.key, label: schema.dimensions.label })
          .from(schema.dimensions)
          .where(inArray(schema.dimensions.modelId, modelIds));
        for (const d of dims) dimensionLabelMap.set(`${d.modelId}:${d.key}`, d.label);
      }

      const built = buildInsightsFromRows(completedRows as CompletedRow[], dimensionLabelMap);

      const usersPerModel = new Map<string, Set<string>>();
      for (const r of completedRows) {
        if (!r.userId) continue;
        const set = usersPerModel.get(r.modelId) ?? new Set<string>();
        set.add(r.userId);
        usersPerModel.set(r.modelId, set);
      }

      const filteredModels = built.models.filter(m => (usersPerModel.get(m.modelId)?.size ?? 0) >= minCohort);

      const dimUserCount = new Map<string, Set<string>>();
      for (const r of completedRows) {
        if (!r.userId) continue;
        const dimScores = (r.dimensionScores ?? {}) as Record<string, number>;
        for (const dimKey of Object.keys(dimScores)) {
          const label = dimensionLabelMap.get(`${r.modelId}:${dimKey}`) || dimKey;
          const set = dimUserCount.get(label) ?? new Set<string>();
          set.add(r.userId);
          dimUserCount.set(label, set);
        }
      }
      const filteredDims = built.crossModelDimensions.filter(d => (dimUserCount.get(d.label)?.size ?? 0) >= minCohort);

      res.json({
        scope: 'tenant',
        tenantId,
        tenantName: tenant.name,
        cohortSize,
        minCohort,
        belowThreshold: false,
        totalCompleted: completedRows.length,
        modelCount: filteredModels.length,
        models: filteredModels,
        crossModelDimensions: filteredDims,
      });
    } catch (error) {
      console.error('Failed to build tenant insights:', error);
      res.status(500).json({ error: 'Failed to build tenant insights' });
    }
  });
}

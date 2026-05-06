import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeJWTService } from "./services/jwt-signing";
import { startSsoStateCleanup } from "./services/sso-service";
import { startMonthlyDigestSchedule } from "./services/digest-service";

// Belt-and-suspenders: catch anything that slips past route-level error handlers.
// Neon 57P01 is handled in db.ts, but this guards against any other stray throws.
process.on('uncaughtException', (err: any) => {
  console.error('[FATAL] uncaughtException — keeping process alive:', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[FATAL] unhandledRejection — keeping process alive:', reason?.message || reason);
});

const app = express();

// Host-based redirects (must run before all other middleware/routes)
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  if (host === 'polaris.synozur.com') {
    return res.redirect(301, 'https://www.synozur.com/polaris');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Threshold (ms) above which a request is considered slow and logged separately.
// Override via SLOW_REQUEST_MS env var. Slow log goes to console.warn so it stands
// out in production logs without requiring a full APM setup.
const SLOW_REQUEST_MS = Number.parseInt(process.env.SLOW_REQUEST_MS || "500", 10);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);

      // Lightweight slow-query/slow-request logging. Helps surface DB-bound
      // hotspots in production without an APM. Skips noisy bulk endpoints
      // (exports/imports) where a few seconds is expected.
      if (
        duration >= SLOW_REQUEST_MS &&
        !path.includes("/export") &&
        !path.includes("/import")
      ) {
        console.warn(
          `[SLOW] ${req.method} ${path} ${res.statusCode} took ${duration}ms (threshold ${SLOW_REQUEST_MS}ms)`
        );
      }
    }
  });

  next();
});

(async () => {
  // Initialize JWT signing service for OAuth
  await initializeJWTService();
  
  // Initialize SSO auth state cleanup (database-backed for production scalability)
  startSsoStateCleanup();

  // Schedule the monthly Insights digest. Runs once on the 1st of each month.
  startMonthlyDigestSchedule();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error(`[ERROR] ${status}: ${message}`, err.stack || '');
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();

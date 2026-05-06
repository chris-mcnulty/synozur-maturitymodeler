import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import tenantRoutes from "./tenant-routes";
import oauthRoutes from "./oauth-routes";
import supportRoutes from "./routes-support";
import { registerAuthUsersRoutes } from "./routes/auth-users-routes";
import { registerOauthClientsRoutes } from "./routes/oauth-clients-routes";
import { registerModelRoutes } from "./routes/model-routes";
import { registerAssessmentRoutes } from "./routes/assessment-routes";
import { registerAiRoutes } from "./routes/ai-routes";
import { registerAdminRoutes } from "./routes/admin-routes";
import { registerOgRoutes } from "./routes/og-routes";
import { registerGalaxyRoutes, registerGalaxyAdminRoutes, registerGalaxyPortalRoutes, registerGalaxyPortalAdminRoutes } from "./routes/galaxy";
import { registerCourseRoutes } from "./routes/course-routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes (includes session setup)
  setupAuth(app);

  // Register OAuth routes after session setup
  app.use(oauthRoutes);

  // Register multi-tenant routes (Phase 1 - behind testing/staging wall)
  app.use(tenantRoutes);

  // Register support and documentation routes
  app.use(supportRoutes);

  // Domain-specific route registrations
  registerAuthUsersRoutes(app);
  registerOauthClientsRoutes(app);
  registerModelRoutes(app);
  registerAssessmentRoutes(app);
  registerAiRoutes(app);
  registerAdminRoutes(app);
  registerOgRoutes(app);
  registerGalaxyRoutes(app);
  registerGalaxyAdminRoutes(app);
  registerGalaxyPortalRoutes(app);
  registerGalaxyPortalAdminRoutes(app);
  registerCourseRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

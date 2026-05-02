import type { Express } from "express";
  import { storage } from "../storage";
  import { db } from "../db";
  import { eq, inArray, desc, gte, lt, and, sql, isNotNull } from "drizzle-orm";
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
  
export function registerOauthClientsRoutes(app: Express) {
  app.get('/api/admin/oauth-clients', ensureGlobalAdmin, async (req, res) => {
    try {
      const clients = await db
        .select({
          id: schema.oauthClients.id,
          clientId: schema.oauthClients.clientId,
          name: schema.oauthClients.name,
          environment: schema.oauthClients.environment,
          redirectUris: schema.oauthClients.redirectUris,
          postLogoutRedirectUris: schema.oauthClients.postLogoutRedirectUris,
          grantTypes: schema.oauthClients.grantTypes,
          pkceRequired: schema.oauthClients.pkceRequired,
          createdAt: schema.oauthClients.createdAt,
          updatedAt: schema.oauthClients.updatedAt,
          applicationId: schema.oauthClients.applicationId,
        })
        .from(schema.oauthClients)
        .orderBy(desc(schema.oauthClients.createdAt));
      
      res.json(clients);
    } catch (error) {
      console.error('Error fetching OAuth clients:', error);
      res.status(500).json({ error: "Failed to fetch OAuth clients" });
    }
  });

  // Create new OAuth client

  app.post('/api/admin/oauth-clients', ensureGlobalAdmin, async (req, res) => {
    try {
      const { name, redirectUris, postLogoutRedirectUris, environment, pkceRequired } = req.body;
      
      // Validate required fields
      if (!name || !redirectUris || redirectUris.length === 0 || !environment) {
        return res.status(400).json({ error: "Missing required fields: name, redirectUris, environment" });
      }
      
      // Generate secure client ID and secret
      const clientId = `${name.toLowerCase().replace(/\s+/g, '_')}_${randomBytes(8).toString('hex')}`;
      const clientSecret = randomBytes(32).toString('base64url');
      const clientSecretHash = await bcrypt.hash(clientSecret, 10);
      
      // Insert the new client
      const [newClient] = await db.insert(schema.oauthClients).values({
        clientId,
        clientSecretHash,
        name,
        environment: environment as 'development' | 'staging' | 'production',
        redirectUris: Array.isArray(redirectUris) ? redirectUris : [redirectUris],
        postLogoutRedirectUris: postLogoutRedirectUris || [],
        grantTypes: ['authorization_code'],
        pkceRequired: pkceRequired !== false, // Default to true
      }).returning();
      
      // Return client info with plaintext secret (only time it's shown!)
      res.json({
        ...newClient,
        clientSecret, // ONLY SHOWN ONCE!
      });
    } catch (error) {
      console.error('Error creating OAuth client:', error);
      res.status(500).json({ error: "Failed to create OAuth client" });
    }
  });

  // Update OAuth client

  app.put('/api/admin/oauth-clients/:id', ensureGlobalAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, redirectUris, postLogoutRedirectUris, environment, pkceRequired } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      
      if (name !== undefined) updateData.name = name;
      if (redirectUris !== undefined) {
        updateData.redirectUris = Array.isArray(redirectUris) ? redirectUris : [redirectUris];
      }
      if (postLogoutRedirectUris !== undefined) {
        updateData.postLogoutRedirectUris = Array.isArray(postLogoutRedirectUris) 
          ? postLogoutRedirectUris 
          : [postLogoutRedirectUris];
      }
      if (environment !== undefined) updateData.environment = environment;
      if (pkceRequired !== undefined) updateData.pkceRequired = pkceRequired;
      
      const [updatedClient] = await db
        .update(schema.oauthClients)
        .set(updateData)
        .where(eq(schema.oauthClients.id, id))
        .returning();
      
      if (!updatedClient) {
        return res.status(404).json({ error: "OAuth client not found" });
      }
      
      res.json(updatedClient);
    } catch (error) {
      console.error('Error updating OAuth client:', error);
      res.status(500).json({ error: "Failed to update OAuth client" });
    }
  });

  // Delete OAuth client

  app.delete('/api/admin/oauth-clients/:id', ensureGlobalAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if client exists
      const [client] = await db
        .select()
        .from(schema.oauthClients)
        .where(eq(schema.oauthClients.id, id))
        .limit(1);
      
      if (!client) {
        return res.status(404).json({ error: "OAuth client not found" });
      }
      
      // Delete the client (cascades to tokens, codes, consents)
      await db
        .delete(schema.oauthClients)
        .where(eq(schema.oauthClients.id, id));
      
      res.json({ success: true, message: "OAuth client deleted successfully" });
    } catch (error) {
      console.error('Error deleting OAuth client:', error);
      res.status(500).json({ error: "Failed to delete OAuth client" });
    }
  });

  // Regenerate client secret

  app.post('/api/admin/oauth-clients/:id/regenerate-secret', ensureGlobalAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Generate new secret
      const newClientSecret = randomBytes(32).toString('base64url');
      const newSecretHash = await bcrypt.hash(newClientSecret, 10);
      
      // Update client
      const [updatedClient] = await db
        .update(schema.oauthClients)
        .set({ 
          clientSecretHash: newSecretHash,
          updatedAt: new Date()
        })
        .where(eq(schema.oauthClients.id, id))
        .returning();
      
      if (!updatedClient) {
        return res.status(404).json({ error: "OAuth client not found" });
      }
      
      // Return new secret (only time it's shown!)
      res.json({
        ...updatedClient,
        clientSecret: newClientSecret, // ONLY SHOWN ONCE!
      });
    } catch (error) {
      console.error('Error regenerating client secret:', error);
      res.status(500).json({ error: "Failed to regenerate client secret" });
    }
  });

  // Clear AI cache for a specific model or all models
}

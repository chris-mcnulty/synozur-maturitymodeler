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
  import { join, dirname } from "path";
  import { fileURLToPath } from "url";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
export function registerAuthUsersRoutes(app: Express) {
  app.get('/email-header.jpg', (req, res) => {
    const imagePath = join(__dirname, '../../attached_assets/SA_EmailHeader_short_1760554032055.jpg');
    res.sendFile(imagePath);
  });

  // Get current user

  app.get('/api/user', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    // Remove password from response
    const { password, ...safeUser } = req.user;
    res.json(safeUser);
  });

  // Debug endpoint to check user permissions (temporary for debugging)

  app.get('/api/debug/permissions', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user;
    const { password, ...safeUser } = user;
    
    res.json({
      user: safeUser,
      permissions: {
        isGlobalAdmin: checkIsGlobalAdmin(user),
        isTenantAdmin: user.role === 'tenant_admin',
        isAnyAdmin: user.role === 'global_admin' || user.role === 'tenant_admin',
        canManageModels: hasAdminAccess(user) || user.role === 'tenant_modeler',
        accessibleTenantIds: getAccessibleTenantIds(user),
      },
      rawRole: user.role,
      roleType: typeof user.role,
    });
  });

  // Get user profile by ID (for viewing assessment owner's profile)
  // Only accessible by: admin/modeler OR the user themselves

  app.get('/api/users/:id', async (req, res) => {
    try {
      // Require authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const requestingUser = req.user!;
      const targetUserId = req.params.id;

      // Check authorization: must be admin OR requesting own profile
      const isAuthorized = 
        requestingUser.id === targetUserId || 
        hasAdminAccess(requestingUser);

      if (!isAuthorized) {
        return res.status(403).json({ error: "Access denied" });
      }

      const user = await storage.getUser(targetUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Remove password and sensitive fields from response
      const { password, verificationToken, verificationTokenExpiry, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Update current user's profile

  app.put('/api/profile', ensureAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Validate all required profile fields
      const validationResult = schema.updateProfileSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues.map(i => i.message).join(", ")
        });
      }
      
      const updateData = validationResult.data;
      
      const user = await storage.updateUser(req.user.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remove password from response
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      res.status(400).json({ error: "Failed to update profile" });
    }
  });

  // Get current user's tenant information (authenticated users only)

  app.get('/api/user/tenant', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user!;
      
      if (!user.tenantId) {
        return res.json(null); // User not assigned to any tenant
      }
      
      // Fetch tenant details
      const tenant = await db.select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1);
      
      if (tenant.length === 0) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      res.json(tenant[0]);
    } catch (error) {
      console.error('Error fetching user tenant:', error);
      res.status(500).json({ error: "Failed to fetch tenant information" });
    }
  });

  // User management routes (admin only)

  app.get('/api/users', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      // getAccessibleTenantIds returns null for global admin (=> all users),
      // [] for users with no tenant access, or [tenantId] for tenant-scoped roles.
      // Pushing this into SQL avoids fetching the entire users table.
      const accessibleTenants = getAccessibleTenantIds(currentUser);
      const users = await storage.getAllUsers(accessibleTenants);

      // Remove password from response
      const safeUsers = users.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post('/api/users', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { username, email, password, role, tenantId } = req.body;
      
      // Validate required fields
      if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required" });
      }
      
      // Validate password length
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      // Check if username already exists
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      
      // Validate role assignment if provided
      const userRole = role || 'user';
      if (!canAssignRole(currentUser, userRole)) {
        return res.status(403).json({ error: "Insufficient permissions to assign this role" });
      }
      
      // Validate tenant assignment if provided
      if (tenantId && !canManageUsers(currentUser, tenantId)) {
        return res.status(403).json({ error: "Insufficient permissions for requested tenant" });
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Create user
      const newUser = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        role: userRole,
        tenantId: tenantId || null,
      });
      
      // Remove password from response
      const { password: _, ...safeUser } = newUser;
      res.json(safeUser);
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) {
          return res.status(400).json({ error: "Username already exists" });
        }
        if (error.constraint?.includes('email')) {
          return res.status(400).json({ error: "Email already exists" });
        }
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put('/api/users/:id', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { id } = req.params;
      const { newPassword, username, role, ...updateData } = req.body;
      
      // Get target user to check permissions
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if current user can manage this user
      if (!canManageUsers(currentUser, targetUser.tenantId)) {
        return res.status(403).json({ error: "Insufficient permissions for requested tenant" });
      }
      
      // Validate role assignment if provided
      if (role !== undefined && role !== targetUser.role) {
        if (!canAssignRole(currentUser, role)) {
          return res.status(403).json({ error: "Insufficient permissions to assign this role" });
        }
        updateData.role = role;
      }
      
      // Validate username if provided
      if (username !== undefined) {
        if (!username || username.trim().length === 0) {
          return res.status(400).json({ error: "Username cannot be empty" });
        }
        
        // Check if username is taken by a different user (case-insensitive,
        // matching the prior behaviour that compared lowercased usernames).
        const trimmedUsername = username.trim();
        const existingUser = await storage.getUserByUsernameCaseInsensitive(trimmedUsername);
        if (existingUser && existingUser.id !== id) {
          return res.status(400).json({ error: "Username already exists" });
        }
        
        updateData.username = trimmedUsername;
      }
      
      // Hash new password if provided
      if (newPassword) {
        if (newPassword.length < 8) {
          return res.status(400).json({ error: "Password must be at least 8 characters" });
        }
        const hashedPassword = await hashPassword(newPassword);
        updateData.password = hashedPassword;
      }
      
      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Remove password from response
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      // Handle duplicate username error (fallback)
      if (error.code === '23505' && error.constraint?.includes('username')) {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.status(400).json({ error: error.message || "Failed to update user" });
    }
  });

  app.delete('/api/users/:id', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { id } = req.params;
      
      // Prevent deleting yourself
      if (currentUser.id === id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Get target user to check permissions
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if current user can manage this user
      if (!canManageUsers(currentUser, targetUser.tenantId)) {
        return res.status(403).json({ error: "Insufficient permissions for requested tenant" });
      }
      
      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete user" });
    }
  });

  // Import users from CSV

  app.post('/api/users/import', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { users: usersToImport } = req.body;
      
      if (!Array.isArray(usersToImport) || usersToImport.length === 0) {
        return res.status(400).json({ error: "No users to import" });
      }
      
      const results = {
        created: 0,
        skipped: 0,
        errors: [] as string[],
      };
      
      for (const userData of usersToImport) {
        try {
          const { username, email, password, role = 'user', tenantId } = userData;
          
          // Validate required fields
          if (!username || !email || !password) {
            results.errors.push(`Missing required fields for user: ${username || email || 'unknown'}`);
            results.skipped++;
            continue;
          }
          
          // Validate role assignment
          if (!canAssignRole(currentUser, role)) {
            results.errors.push(`Cannot assign role '${role}' to user: ${username}`);
            results.skipped++;
            continue;
          }
          
          // Validate tenant assignment
          const effectiveTenantId = tenantId || (currentUser.tenantId && !checkIsGlobalAdmin(currentUser) ? currentUser.tenantId : null);
          if (effectiveTenantId && !canManageUsers(currentUser, effectiveTenantId)) {
            results.errors.push(`Cannot assign tenant to user: ${username}`);
            results.skipped++;
            continue;
          }
          
          // Check if username already exists
          const existingUsername = await storage.getUserByUsername(username);
          if (existingUsername) {
            results.errors.push(`Username already exists: ${username}`);
            results.skipped++;
            continue;
          }
          
          // Check if email already exists
          const existingEmail = await storage.getUserByEmail(email);
          if (existingEmail) {
            results.errors.push(`Email already exists: ${email}`);
            results.skipped++;
            continue;
          }
          
          // Hash password and create user
          const hashedPassword = await hashPassword(password);
          await storage.createUser({
            username,
            email,
            password: hashedPassword,
            role,
            tenantId: effectiveTenantId,
          });
          
          results.created++;
        } catch (error: any) {
          results.errors.push(`Failed to create user: ${userData.username || 'unknown'} - ${error.message}`);
          results.skipped++;
        }
      }
      
      res.json({
        success: true,
        message: `Imported ${results.created} users, skipped ${results.skipped}`,
        details: results,
      });
    } catch (error: any) {
      console.error('Error importing users:', error);
      res.status(500).json({ error: "Failed to import users" });
    }
  });

  // Assign or unassign user to/from tenant

  app.patch('/api/users/:id/tenant', ensureAnyAdmin, async (req, res) => {
    try {
      const currentUser = req.user!;
      const { id } = req.params;
      const { tenantId } = req.body; // null to unassign, tenant ID to assign
      
      // Get target user
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Global admins can assign to any tenant or unassign
      if (checkIsGlobalAdmin(currentUser)) {
        const user = await storage.updateUser(id, { tenantId: tenantId || null });
        const { password, ...safeUser } = user!;
        return res.json(safeUser);
      }
      
      // Tenant admins can only assign users TO their own tenant
      if (currentUser.role === 'tenant_admin') {
        // Cannot unassign (remove from tenant)
        if (!tenantId) {
          return res.status(403).json({ error: "Tenant admins cannot unassign users from tenants" });
        }
        
        // Can only assign to their own tenant
        if (tenantId !== currentUser.tenantId) {
          return res.status(403).json({ error: "Insufficient permissions to assign users to this tenant" });
        }
        
        const user = await storage.updateUser(id, { tenantId });
        const { password, ...safeUser } = user!;
        return res.json(safeUser);
      }
      
      // Should not reach here (ensureAnyAdmin should have blocked non-admins)
      return res.status(403).json({ error: "Insufficient permissions" });
    } catch (error) {
      console.error('Error updating user tenant:', error);
      res.status(500).json({ error: "Failed to update user tenant assignment" });
    }
  });

  // OAuth Client Management Routes (Global Admin Only)
  
  // List all OAuth clients

  app.put('/api/admin/users/:id/verify-email', ensureAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.updateUser(id, { 
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Remove password from response
      const { password: _, ...safeUser } = user;
      res.json({ success: true, user: safeUser });
    } catch (error) {
      console.error('Manual verification error:', error);
      res.status(400).json({ error: "Failed to verify user email" });
    }
  });

  // Answer routes

  app.post('/api/send-pdf-email', ensureAuthenticated, async (req, res) => {
    try {
      // Validate payload with Zod
      const emailPayloadSchema = z.object({
        pdfBase64: z.string().min(1).max(10 * 1024 * 1024), // Max ~10MB base64
        fileName: z.string().min(1).max(255),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        modelName: z.string().optional(),
      });

      const validationResult = emailPayloadSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid payload", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { pdfBase64, fileName, recipientEmail, recipientName, modelName } = validationResult.data;

      // Check if user's email is verified
      if (!req.user?.emailVerified) {
        return res.status(403).json({ 
          error: "Email not verified", 
          message: "Please verify your email address before downloading PDF reports. Check your inbox for a verification link or request a new one from your profile." 
        });
      }

      // Import SendGrid client
      const { getUncachableSendGridClient, buildEmailFrom, getEmailBranding } = await import('../sendgrid.js');
      const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const tenantId = req.user?.tenantId || null;
      const from = await buildEmailFrom(fromEmail, tenantId);
      const branding = await getEmailBranding(tenantId, baseUrl);

      const msg = {
        to: recipientEmail,
        from,
        subject: `Your ${modelName || 'Maturity Assessment'} Report`,
        text: `Dear ${recipientName || 'Valued User'},

Thank you for completing the ${modelName || 'assessment'}. Your comprehensive report is attached, including:

• Your overall maturity score and level
• Dimension-specific insights
• Personalized recommendations
• Resources to guide your next steps

If you have any questions, we're here to help you navigate your journey.

Best regards,
The ${branding.brandName} Team`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
              .content { padding: 40px 30px; background: #ffffff; }
              ul { padding-left: 20px; }
              ul li { margin: 8px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              ${branding.headerHtml}
              <div class="content">
                <h2 style="color: ${branding.primaryColor}; margin-top: 0;">Your Assessment Report is Ready</h2>
                <p>Dear ${recipientName || 'Valued User'},</p>
                <p>Thank you for completing the <strong>${modelName || 'assessment'}</strong>. Your comprehensive report is attached, including:</p>
                <ul>
                  <li>Your overall maturity score and level</li>
                  <li>Dimension-specific insights</li>
                  <li>Personalized recommendations</li>
                  <li>Resources to guide your next steps</li>
                </ul>
                <p>If you have any questions, we're here to help you navigate your journey.</p>
              </div>
              ${branding.footerHtml}
            </div>
          </body>
          </html>
        `,
        attachments: [
          {
            content: pdfBase64,
            filename: fileName || 'assessment-report.pdf',
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
      };

      await sgMail.send(msg);

      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Email sending error:', error);
      res.status(500).json({ 
        error: "Failed to send email", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Password reset request endpoint

  app.post('/api/password-reset/request', async (req, res) => {
    try {
      const requestSchema = z.object({
        email: z.string().email(),
      });

      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid email", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { email } = validationResult.data;

      // Find user by email
      const users = await db.select().from(schema.users).where(eq(schema.users.email, email));
      
      if (users.length === 0) {
        // Don't reveal if email exists - return success anyway for security
        return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
      }

      const user = users[0];

      // Create reset token (expires in 1 hour)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const [resetToken] = await db.insert(schema.passwordResetTokens).values({
        userId: user.id,
        expiresAt,
        used: false,
      }).returning();

      // Send email with reset link (with defensive error handling)
      try {
        const { getUncachableSendGridClient, buildEmailFrom, getEmailBranding } = await import('../sendgrid.js');
        const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const tenantId = user.tenantId || null;
        const from = await buildEmailFrom(fromEmail, tenantId);
        const branding = await getEmailBranding(tenantId, baseUrl);
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

        const msg = {
          to: email,
          from,
          subject: `Reset Your Password – Orion by ${branding.brandName}`,
          text: `You requested a password reset for your Orion account by ${branding.brandName}.

To continue your journey, click the link below to reset your password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email—your password will remain unchanged.
— The ${branding.brandName} Team`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                .content { padding: 40px 30px; background: #ffffff; }
                .button { display: inline-block; background: ${branding.primaryColor}; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 25px 0; }
                .link-text { color: ${branding.primaryColor}; word-break: break-all; }
              </style>
            </head>
            <body>
              <div class="container">
                ${branding.headerHtml}
                <div class="content">
                  <h2 style="color: ${branding.primaryColor}; margin-top: 0;">Reset Your Password</h2>
                  <p>You requested a password reset for your Orion account by ${branding.brandName}.</p>
                  <p>To continue your journey, click the button below to reset your password:</p>
                  <p style="text-align: center;">
                    <a href="${resetUrl}" class="button">Reset Password</a>
                  </p>
                  <p style="font-size: 14px; color: #666;">
                    Or copy and paste this link into your browser:<br>
                    <span class="link-text">${resetUrl}</span>
                  </p>
                  <p style="font-size: 14px; color: #666;">This link will expire in <strong>1 hour</strong>.</p>
                  <p style="font-size: 14px; color: #666;">If you didn't request this password reset, please ignore this email—your password will remain unchanged.</p>
                </div>
                ${branding.footerHtml}
              </div>
            </body>
            </html>
          `,
        };

        await sgMail.send(msg);
      } catch (emailError) {
        // Log email delivery failure but don't block the user
        console.error('Failed to send password reset email:', emailError);
        // Token is still created and valid - user can contact support if needed
      }

      // Always return success to avoid revealing if email exists
      res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ 
        error: "Failed to process password reset request", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Password reset confirmation endpoint

  app.post('/api/password-reset/reset', async (req, res) => {
    try {
      const resetSchema = z.object({
        token: z.string().uuid(),
        newPassword: z.string().min(6, "Password must be at least 6 characters"),
      });

      const validationResult = resetSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { token, newPassword } = validationResult.data;

      // Find the reset token
      const tokens = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
      
      if (tokens.length === 0) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const resetToken = tokens[0];

      // Check if token is expired or used
      if (resetToken.used) {
        return res.status(400).json({ error: "This reset token has already been used" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update user password
      await db.update(schema.users)
        .set({ password: hashedPassword })
        .where(eq(schema.users.id, resetToken.userId));

      // Mark token as used
      await db.update(schema.passwordResetTokens)
        .set({ used: true })
        .where(eq(schema.passwordResetTokens.token, token));

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ 
        error: "Failed to reset password", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Change password (for logged-in users)

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      // Ensure user is authenticated
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string()
          .min(8, "Password must be at least 8 characters")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one punctuation mark"),
      });

      const validationResult = changePasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: validationResult.error.issues.map((i: any) => i.message).join(", ")
        });
      }

      const { currentPassword, newPassword } = validationResult.data;

      // Get current user from database
      const users = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id));
      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = users[0];

      // Verify current password
      const isCurrentPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);

      // Update user password
      await db.update(schema.users)
        .set({ password: hashedPassword })
        .where(eq(schema.users.id, req.user.id));

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // ===== IMPORT ENDPOINTS =====
  
  // Preview import data - validate and show question mappings
}

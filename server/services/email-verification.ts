import { db } from '../db.js';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Generate a verification token and update user record
 */
export async function generateVerificationToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.update(users)
    .set({
      verificationToken: token,
      verificationTokenExpiry: expiresAt,
    })
    .where(eq(users.id, userId));

  return token;
}

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const { getUncachableSendGridClient } = await import('../sendgrid.js');
  const { client: sgMail, fromEmail } = await getUncachableSendGridClient();

  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const msg = {
    to: email,
    from: fromEmail,
    subject: 'Verify Your Email - Synozur Maturity Modeler',
    text: `Welcome to Synozur Maturity Modeler! Please verify your email address by clicking the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, you can safely ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #810FFB 0%, #E60CB3 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #810FFB; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .button:hover { background: #6a0dd1; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Synozur!</h1>
          </div>
          <div class="content">
            <p>Thank you for creating your account with Synozur Maturity Modeler.</p>
            <p>To unlock all features including downloadable PDF reports, please verify your email address:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p style="font-size: 14px; color: #666;">
              Or copy and paste this link into your browser:<br>
              <a href="${verificationUrl}" style="color: #810FFB;">${verificationUrl}</a>
            </p>
            <p style="font-size: 14px; color: #666;">This link will expire in 24 hours.</p>
            <p style="font-size: 14px; color: #666;">If you didn't create an account with Synozur, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} The Synozur Alliance LLC | Find Your North Star</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await sgMail.send(msg);
}

/**
 * Verify email token and mark user as verified
 */
export async function verifyEmailToken(token: string): Promise<{ success: boolean; error?: string }> {
  const userRecords = await db.select()
    .from(users)
    .where(eq(users.verificationToken, token));

  if (userRecords.length === 0) {
    return { success: false, error: 'Invalid verification token' };
  }

  const user = userRecords[0];

  // Check if already verified
  if (user.emailVerified) {
    return { success: true }; // Already verified, just return success
  }

  // Check if token is expired
  if (!user.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
    return { success: false, error: 'Verification token has expired. Please request a new one.' };
  }

  // Mark user as verified and clear token
  await db.update(users)
    .set({
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    })
    .where(eq(users.id, user.id));

  return { success: true };
}

/**
 * Get user by email for resending verification
 */
export async function getUserByEmail(email: string) {
  const userRecords = await db.select()
    .from(users)
    .where(eq(users.email, email));

  return userRecords[0] || null;
}

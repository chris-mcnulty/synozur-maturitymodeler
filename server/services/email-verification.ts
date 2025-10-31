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
  const emailHeaderUrl = `${baseUrl}/email-header.jpg`;

  const msg = {
    to: email,
    from: fromEmail,
    subject: 'Welcome to Orion by Synozur – Please Verify Your Email',
    text: `Welcome to Orion by Synozur!

We're excited to guide you on your journey to business excellence. To unlock all features—including downloadable PDF reports—please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.
— The Synozur Team`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header-image { width: 100%; height: auto; display: block; }
          .content { padding: 40px 30px; background: #ffffff; }
          .button { display: inline-block; background: #810FFB; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 25px 0; }
          .footer { text-align: center; padding: 30px; background: #f9f9f9; color: #666; font-size: 14px; }
          .link-text { color: #810FFB; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="${emailHeaderUrl}" alt="Synozur Alliance" class="header-image" />
          <div class="content">
            <p>Welcome to Orion by Synozur!</p>
            <p>We're excited to guide you on your journey to business excellence. To unlock all features—including downloadable PDF reports—please verify your email address:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p style="font-size: 14px; color: #666;">
              Or copy and paste this link into your browser:<br>
              <span class="link-text">${verificationUrl}</span>
            </p>
            <p style="font-size: 14px; color: #666;">This link will expire in 24 hours.</p>
            <p style="font-size: 14px; color: #666;">If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>— The Synozur Team</p>
            <p>© ${new Date().getFullYear()} The Synozur Alliance LLC</p>
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

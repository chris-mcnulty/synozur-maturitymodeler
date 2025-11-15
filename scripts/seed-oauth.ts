// Seed script to create OAuth clients and applications for development
import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

async function seedOAuthData() {
  try {
    console.log('Starting OAuth seed data generation...');
    
    // Check if Orion application already exists
    const existingOrion = await db.select()
      .from(schema.applications)
      .where(eq(schema.applications.id, 'orion'))
      .limit(1);
    
    if (existingOrion.length === 0) {
      // Create Orion application (the identity provider itself)
      await db.insert(schema.applications).values({
        id: 'orion',
        name: 'Orion Platform',
        description: 'Synozur Multi-Model Maturity Assessment Platform',
        logoUrl: null,
        homepageUrl: process.env.REPLIT_URL || 'http://localhost:5000',
        privacyPolicyUrl: null,
        termsOfServiceUrl: null,
      });
      console.log('Created Orion application');
      
      // Create Orion application roles
      await db.insert(schema.applicationRoles).values([
        {
          id: 'orion_admin',
          applicationId: 'orion',
          name: 'Administrator',
          description: 'Full administrative access to Orion',
          permissions: ['manage_users', 'manage_models', 'manage_assessments', 'view_analytics'],
        },
        {
          id: 'orion_modeler',
          applicationId: 'orion',
          name: 'Modeler',
          description: 'Can create and manage maturity models',
          permissions: ['manage_models', 'view_assessments'],
        },
        {
          id: 'orion_user',
          applicationId: 'orion',
          name: 'User',
          description: 'Standard user access',
          permissions: ['take_assessments', 'view_own_results'],
        },
      ]);
      console.log('Created Orion application roles');
    }
    
    // Check if Nebula application already exists
    const existingNebula = await db.select()
      .from(schema.applications)
      .where(eq(schema.applications.id, 'nebula'))
      .limit(1);
    
    if (existingNebula.length === 0) {
      // Create Nebula application
      await db.insert(schema.applications).values({
        id: 'nebula',
        name: 'Nebula Platform',
        description: 'AI-Powered Skills Assessment Platform',
        logoUrl: null,
        homepageUrl: 'https://nebula.synozur.com',
        privacyPolicyUrl: null,
        termsOfServiceUrl: null,
      });
      console.log('Created Nebula application');
      
      // Create Nebula application roles
      await db.insert(schema.applicationRoles).values([
        {
          id: 'nebula_admin',
          applicationId: 'nebula',
          name: 'Administrator',
          description: 'Full administrative access to Nebula',
          permissions: ['manage_skills', 'manage_users', 'view_analytics'],
        },
        {
          id: 'nebula_instructor',
          applicationId: 'nebula',
          name: 'Instructor',
          description: 'Can create and manage skill assessments',
          permissions: ['create_assessments', 'view_results'],
        },
        {
          id: 'nebula_learner',
          applicationId: 'nebula',
          name: 'Learner',
          description: 'Can take skill assessments',
          permissions: ['take_assessments', 'view_own_results'],
        },
      ]);
      console.log('Created Nebula application roles');
    }
    
    // Only create OAuth clients in development environment
    if (process.env.NODE_ENV === 'development' || process.env.OAUTH_ENVIRONMENT === 'development') {
      // Check if Nebula development OAuth client exists
      const existingNebulaClient = await db.select()
        .from(schema.oauthClients)
        .where(and(
          eq(schema.oauthClients.clientId, 'nebula_dev'),
          eq(schema.oauthClients.environment, 'development')
        ))
        .limit(1);
      
      if (existingNebulaClient.length === 0) {
        // Generate a secure client secret
        const clientSecret = randomBytes(32).toString('base64url');
        const clientSecretHash = await bcrypt.hash(clientSecret, 10);
        
        // Create Nebula OAuth client for development
        await db.insert(schema.oauthClients).values({
          applicationId: 'nebula',
          clientId: 'nebula_dev',
          clientSecretHash,
          name: 'Nebula Development Client',
          environment: 'development',
          redirectUris: [
            'http://localhost:3000/auth/callback',
            'http://localhost:3001/auth/callback',
            'http://127.0.0.1:3000/auth/callback',
            'http://127.0.0.1:3001/auth/callback',
          ],
          postLogoutRedirectUris: [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
          ],
          grantTypes: ['authorization_code', 'refresh_token'],
          pkceRequired: true,
        });
        
        console.log('Created Nebula OAuth client for development');
        console.log('==============================================');
        console.log('IMPORTANT: Save these credentials securely!');
        console.log('Client ID: nebula_dev');
        console.log(`Client Secret: ${clientSecret}`);
        console.log('==============================================');
        console.log('Add these to your Nebula .env file:');
        console.log('OAUTH_CLIENT_ID=nebula_dev');
        console.log(`OAUTH_CLIENT_SECRET=${clientSecret}`);
        console.log(`OAUTH_ISSUER=${process.env.REPLIT_URL || 'http://localhost:5000'}`);
        console.log('==============================================');
      } else {
        console.log('Nebula development OAuth client already exists');
      }
      
      // Create a test Orion self-client for testing OAuth flow
      const existingOrionClient = await db.select()
        .from(schema.oauthClients)
        .where(and(
          eq(schema.oauthClients.clientId, 'orion_dev'),
          eq(schema.oauthClients.environment, 'development')
        ))
        .limit(1);
      
      if (existingOrionClient.length === 0) {
        const orionSecret = randomBytes(32).toString('base64url');
        const orionSecretHash = await bcrypt.hash(orionSecret, 10);
        
        await db.insert(schema.oauthClients).values({
          applicationId: 'orion',
          clientId: 'orion_dev',
          clientSecretHash: orionSecretHash,
          name: 'Orion Development Client',
          environment: 'development',
          redirectUris: [
            'http://localhost:5000/auth/callback',
            'http://localhost:5001/auth/callback',
            `${process.env.REPLIT_URL}/auth/callback`,
          ],
          postLogoutRedirectUris: [
            'http://localhost:5000',
            'http://localhost:5001',
            process.env.REPLIT_URL || 'http://localhost:5000',
          ],
          grantTypes: ['authorization_code', 'refresh_token'],
          pkceRequired: false, // Orion can use client secret authentication
        });
        
        console.log('Created Orion OAuth client for development');
        console.log('==============================================');
        console.log('Orion self-client credentials:');
        console.log('Client ID: orion_dev');
        console.log(`Client Secret: ${orionSecret}`);
        console.log('==============================================');
      } else {
        console.log('Orion development OAuth client already exists');
      }
    } else {
      console.log('Skipping OAuth client creation (not in development environment)');
    }
    
    console.log('OAuth seed data generation complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding OAuth data:', error);
    process.exit(1);
  }
}

// Run the seed script
seedOAuthData();
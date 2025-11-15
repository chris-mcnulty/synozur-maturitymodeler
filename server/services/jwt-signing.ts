// JWT signing service for OAuth 2.0 with RS256 algorithm
// Supports key rotation and JWKS endpoint

import jose from 'node-jose';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { settings } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface JWK {
  kid: string;
  kty: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface KeyPair {
  kid: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
  isActive: boolean;
}

class JWTSigningService {
  private keyStore: jose.JWK.KeyStore;
  private activeKeyPair: KeyPair | null = null;
  private keyRotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days
  private maxKeys = 3; // Keep up to 3 old keys for verification
  
  constructor() {
    this.keyStore = jose.JWK.createKeyStore();
  }
  
  // Initialize the service and load or generate keys
  async initialize() {
    await this.loadOrGenerateKeys();
    
    // Schedule key rotation check
    setInterval(() => {
      this.checkKeyRotation().catch(console.error);
    }, 24 * 60 * 60 * 1000); // Check daily
  }
  
  // Load existing keys from database or generate new ones
  private async loadOrGenerateKeys() {
    const keySetting = await db.query.settings.findFirst({
      where: eq(settings.key, 'oauth_signing_keys')
    });
    
    if (keySetting && keySetting.value) {
      const storedKeys = keySetting.value as unknown as KeyPair[];
      
      // Find the active key
      this.activeKeyPair = storedKeys.find(k => k.isActive) || null;
      
      // Load all keys into the key store for verification
      for (const keyPair of storedKeys) {
        await this.keyStore.add(keyPair.publicKey, 'pem');
      }
      
      // Generate new key if active key is too old or missing
      if (!this.activeKeyPair || this.shouldRotateKey(this.activeKeyPair)) {
        await this.rotateKeys();
      }
    } else {
      // No keys exist, generate initial keypair
      await this.generateInitialKeys();
    }
  }
  
  // Generate the initial signing keypair
  private async generateInitialKeys() {
    const key = await jose.JWK.createKey('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: this.generateKid(),
    });
    
    const publicKeyPem = key.toPEM();
    const privateKeyPem = key.toPEM(true);
    
    this.activeKeyPair = {
      kid: key.kid,
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      createdAt: new Date(),
      isActive: true,
    };
    
    await this.keyStore.add(publicKeyPem, 'pem');
    await this.saveKeys([this.activeKeyPair]);
  }
  
  // Rotate keys - generate new active key, keep old ones for verification
  private async rotateKeys() {
    const key = await jose.JWK.createKey('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: this.generateKid(),
    });
    
    const publicKeyPem = key.toPEM();
    const privateKeyPem = key.toPEM(true);
    
    const newKeyPair: KeyPair = {
      kid: key.kid,
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      createdAt: new Date(),
      isActive: true,
    };
    
    // Load existing keys
    const keySetting = await db.query.settings.findFirst({
      where: eq(settings.key, 'oauth_signing_keys')
    });
    
    let allKeys: KeyPair[] = [];
    if (keySetting && keySetting.value) {
      allKeys = keySetting.value as unknown as KeyPair[];
      // Deactivate all existing keys
      allKeys = allKeys.map(k => ({ ...k, isActive: false }));
    }
    
    // Add new key as active
    allKeys.unshift(newKeyPair);
    
    // Keep only the most recent keys
    if (allKeys.length > this.maxKeys) {
      allKeys = allKeys.slice(0, this.maxKeys);
    }
    
    this.activeKeyPair = newKeyPair;
    await this.keyStore.add(publicKeyPem, 'pem');
    await this.saveKeys(allKeys);
    
    console.log(`Rotated JWT signing keys. New active key: ${newKeyPair.kid}`);
  }
  
  // Check if key should be rotated
  private shouldRotateKey(keyPair: KeyPair): boolean {
    const age = Date.now() - keyPair.createdAt.getTime();
    return age > this.keyRotationInterval;
  }
  
  // Check and perform key rotation if needed
  private async checkKeyRotation() {
    if (this.activeKeyPair && this.shouldRotateKey(this.activeKeyPair)) {
      await this.rotateKeys();
    }
  }
  
  // Save keys to database
  private async saveKeys(keys: KeyPair[]) {
    const existingSetting = await db.query.settings.findFirst({
      where: eq(settings.key, 'oauth_signing_keys')
    });
    
    if (existingSetting) {
      await db.update(settings)
        .set({
          value: JSON.stringify(keys),
          updatedAt: new Date(),
        })
        .where(eq(settings.key, 'oauth_signing_keys'));
    } else {
      await db.insert(settings)
        .values({
          key: 'oauth_signing_keys',
          value: JSON.stringify(keys),
        });
    }
  }
  
  // Generate a unique key ID
  private generateKid(): string {
    return `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Sign a JWT token
  async signToken(payload: any, expiresIn: string | number = '1h'): Promise<string> {
    if (!this.activeKeyPair) {
      await this.loadOrGenerateKeys();
      if (!this.activeKeyPair) {
        throw new Error('No active signing key available');
      }
    }
    
    const signOptions: jwt.SignOptions = {
      algorithm: 'RS256',
      expiresIn: expiresIn as any, // Type assertion for compatibility
      issuer: process.env.REPLIT_URL || 'https://orion.synozur.com',
      keyid: this.activeKeyPair.kid,
    };
    
    return jwt.sign(payload, this.activeKeyPair.privateKey, signOptions);
  }
  
  // Verify a JWT token
  async verifyToken(token: string): Promise<any> {
    // Decode the token to get the kid
    const decoded = jwt.decode(token, { complete: true }) as any;
    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error('Invalid token format');
    }
    
    // Find the corresponding public key
    const keySetting = await db.query.settings.findFirst({
      where: eq(settings.key, 'oauth_signing_keys')
    });
    
    if (!keySetting || !keySetting.value) {
      throw new Error('No signing keys configured');
    }
    
    const storedKeys = keySetting.value as unknown as KeyPair[];
    const keyPair = storedKeys.find(k => k.kid === decoded.header.kid);
    
    if (!keyPair) {
      throw new Error('Unknown signing key');
    }
    
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['RS256'],
      issuer: process.env.REPLIT_URL || 'https://orion.synozur.com',
    };
    
    return jwt.verify(token, keyPair.publicKey, verifyOptions);
  }
  
  // Get JWKS (JSON Web Key Set) for public endpoint
  async getJWKS(): Promise<{ keys: JWK[] }> {
    const keySetting = await db.query.settings.findFirst({
      where: eq(settings.key, 'oauth_signing_keys')
    });
    
    if (!keySetting || !keySetting.value) {
      return { keys: [] };
    }
    
    const storedKeys = keySetting.value as unknown as KeyPair[];
    const jwks: JWK[] = [];
    
    for (const keyPair of storedKeys) {
      const key = await jose.JWK.asKey(keyPair.publicKey, 'pem');
      const jwk = key.toJSON() as JWK;
      jwk.kid = keyPair.kid;
      jwk.use = 'sig';
      jwk.alg = 'RS256';
      jwks.push(jwk);
    }
    
    return { keys: jwks };
  }
  
  // Sign an ID token for OpenID Connect
  async signIdToken(userId: string, clientId: string, nonce?: string, additionalClaims?: any): Promise<string> {
    const payload = {
      sub: userId,
      aud: clientId,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
      ...additionalClaims,
    };
    
    if (nonce) {
      payload['nonce'] = nonce;
    }
    
    return this.signToken(payload, '1h');
  }
  
  // Sign an access token
  async signAccessToken(userId: string, clientId: string, scopes: string[], additionalClaims?: any): Promise<string> {
    const payload = {
      sub: userId,
      client_id: clientId,
      scope: scopes.join(' '),
      token_type: 'access',
      ...additionalClaims,
    };
    
    return this.signToken(payload, '1h');
  }
}

// Export a singleton instance
export const jwtSigningService = new JWTSigningService();

// Initialize the service
export async function initializeJWTService() {
  await jwtSigningService.initialize();
  console.log('JWT signing service initialized');
}
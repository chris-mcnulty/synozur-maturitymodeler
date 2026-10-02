import { describe, expect, it, vi, afterEach } from 'vitest';
import { assertGrameenDevelopmentTarget } from '../e2e/helpers/grameen-fixture';

afterEach(() => vi.unstubAllEnvs());

function development() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('REPLIT_DEPLOYMENT', '');
  vi.stubEnv('REPLIT_DEV_DOMAIN', 'grameen-qa.replit.dev');
  vi.stubEnv('DATABASE_URL', 'test-only-not-a-real-connection');
  vi.stubEnv('GRAMEEN_REPORT_E2E', '1');
}

describe('Grameen live QA safety guard (no database access)', () => {
  it('accepts only an opted-in development workspace target', () => {
    development();
    expect(() => assertGrameenDevelopmentTarget('https://grameen-qa.replit.dev')).not.toThrow();
  });

  it.each([
    ['NODE_ENV', 'production'],
    ['REPLIT_DEPLOYMENT', '1'],
    ['REPLIT_DEV_DOMAIN', ''],
    ['DATABASE_URL', ''],
    ['GRAMEEN_REPORT_E2E', ''],
  ])('refuses unsafe or missing %s', (key, value) => {
    development();
    vi.stubEnv(key, value);
    expect(() => assertGrameenDevelopmentTarget('https://grameen-qa.replit.dev')).toThrow();
  });

  it.each([
    'https://orion.replit.app', 'http://grameen-qa.replit.dev',
    'https://another-workspace.replit.dev', 'https://grameen-qa.replit.dev.evil.example',
    'http://localhost:5000',
  ])('refuses other targets: %s', url => {
    development();
    expect(() => assertGrameenDevelopmentTarget(url)).toThrow();
  });
});
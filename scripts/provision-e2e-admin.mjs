#!/usr/bin/env node
// Provision a non-production admin account for the Playwright smoke suite.
//
// Reads E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD from the environment and
// upserts a user row with role='global_admin' so the admin "edit question"
// leg of tests/e2e/smoke.spec.ts can run end-to-end. This is intended for
// CI against an isolated test database — never run it against a shared or
// production database.
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

if (!username || !password) {
  console.log("E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD not set — skipping admin provisioning.");
  process.exit(0);
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required to provision the E2E admin account.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const hashed = await hashPassword(password);
  const email = `${username.replace(/[^a-zA-Z0-9._-]/g, "_")}@e2e.local`;

  await client.query(
    `INSERT INTO users (username, password, email, name, role, email_verified)
     VALUES ($1, $2, $3, $4, 'global_admin', true)
     ON CONFLICT (username) DO UPDATE
       SET password = EXCLUDED.password,
           role = 'global_admin',
           email_verified = true`,
    [username, hashed, email, "E2E Admin"],
  );

  console.log(`Provisioned E2E admin user: ${username}`);
} finally {
  await client.end();
}

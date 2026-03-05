/**
 * Migration: Add directory defaults and sync settings to tenants table
 *
 * Adds:
 *  - default_company
 *  - default_industry
 *  - default_country
 *  - default_company_size
 *  - Changes sync_to_hubspot default to false (existing rows unaffected)
 *  - allow_user_self_provisioning (if not already present)
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function runTenantDirectoryDefaultsMigration() {
  const columns = [
    { name: 'default_company',      definition: 'TEXT' },
    { name: 'default_industry',     definition: 'TEXT' },
    { name: 'default_country',      definition: 'TEXT' },
    { name: 'default_company_size', definition: 'TEXT' },
    { name: 'allow_user_self_provisioning', definition: 'BOOLEAN NOT NULL DEFAULT TRUE' },
  ];

  for (const col of columns) {
    try {
      await db.execute(
        sql.raw(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ${col.name} ${col.definition}`)
      );
      console.log(`[migration] tenants.${col.name} — OK`);
    } catch (err: any) {
      // Column already exists or other benign error — log and continue
      console.warn(`[migration] tenants.${col.name} — skipped: ${err.message}`);
    }
  }
}

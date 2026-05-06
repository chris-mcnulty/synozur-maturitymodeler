import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Neon serverless kills idle WebSocket connections (PG error 57P01).
// Without this handler Node will crash the process on the unhandled 'error' event.
// The pool reconnects automatically on the next query, so we just log and continue.
pool.on('error', (err: any) => {
  if (err.code === '57P01') {
    console.warn('[DB] Neon terminated idle connection (57P01) — pool will reconnect on next query');
  } else {
    console.error('[DB] Unexpected pool error:', err.message);
  }
});

export const db = drizzle({ client: pool, schema });

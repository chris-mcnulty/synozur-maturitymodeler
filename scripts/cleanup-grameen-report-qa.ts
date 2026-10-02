import { cleanupGrameenFixture } from '../tests/e2e/helpers/grameen-fixture';

await cleanupGrameenFixture(`https://${process.env.REPLIT_DEV_DOMAIN}`);
console.log('Disposable Grameen report fixtures removed (or no journal present).');
const { pool } = await import('../server/db');
await pool.end();
/**
 * The annual training build and QA scripts write to the database, so they only
 * run from the development workspace. Deployments set REPLIT_DEPLOYMENT and do
 * not set REPLIT_DEV_DOMAIN; the workspace's DATABASE_URL is the development
 * database.
 */
export function assertDevelopmentWorkspace(): void {
  const reasons: string[] = [];
  if (process.env.NODE_ENV === "production") reasons.push("NODE_ENV is production");
  if (process.env.REPLIT_DEPLOYMENT) reasons.push("running inside a deployment");
  if (!process.env.REPLIT_DEV_DOMAIN) reasons.push("not running in the development workspace (REPLIT_DEV_DOMAIN is unset)");
  if (!process.env.DATABASE_URL) reasons.push("DATABASE_URL is unset");
  if (reasons.length) throw new Error(`Refusing to write to the database: ${reasons.join("; ")}.`);
}

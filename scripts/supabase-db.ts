/**
 * Runs a `supabase db`/`supabase migration` command against DIRECT_DATABASE_URL
 * from .env.local, so the Supabase CLI works without `supabase link`.
 * Applied migrations are recorded in supabase_migrations.schema_migrations.
 *
 *   pnpm db:migrate              # supabase db push
 *   pnpm db:status               # supabase migration list
 *
 * --master targets the real production database instead, through
 * DIRECT_DATABASE_URL_MASTER (or DATABASE_URL_MASTER), and never falls back to the others:
 *
 *   pnpm db:migrate --master
 *   pnpm db:status --master
 *
 * The _MASTER variables are only for running migrations this way. NEVER use them
 * for testing of any kind: not tests, seeds, dev servers, scripts or one-off queries.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { spawnSync } from "node:child_process";
import path from "node:path";

const master = process.argv.includes("--master");
const url = master
  ? process.env.DIRECT_DATABASE_URL_MASTER || process.env.DATABASE_URL_MASTER
  : process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    master
      ? "Set DIRECT_DATABASE_URL_MASTER (or DATABASE_URL_MASTER) in .env.local"
      : "Set DIRECT_DATABASE_URL (or DATABASE_URL) in .env.local",
  );
  process.exit(1);
}
if (master) console.log("Target: PRODUCTION database (--master)");

// Run the CLI's launcher with node directly: going through a shell would mangle special characters in the password.
const cli = path.join("node_modules", "supabase", "dist", "supabase.js");
const args = [cli, ...process.argv.slice(2).filter((a) => a !== "--master"), "--db-url", url];
const { status } = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(status ?? 1);

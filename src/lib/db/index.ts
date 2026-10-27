import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

// Reuse the client across hot reloads / warm serverless invocations.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.pg ??
  postgres(url, {
    // Local PGlite is single-session: concurrent connections interleave statements.
    max: process.env.VERCEL || /@(127\.0\.0\.1|localhost)[:/]/.test(url) ? 1 : 5,
    // Neon's pooler (pgbouncer, transaction mode) doesn't support prepared statements.
    prepare: false,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
export const closeDb = () => client.end();

import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, closeDb } from "@/lib/db";

migrate(db, { migrationsFolder: "./drizzle" })
  .then(() => console.log("migrations applied"))
  .finally(closeDb);

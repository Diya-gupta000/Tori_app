import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});

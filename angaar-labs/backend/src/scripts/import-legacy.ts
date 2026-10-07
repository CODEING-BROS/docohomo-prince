// Fills the new database with the data from the old system.
// Reads LEGACY_DATABASE_URL (the old data already in PostgreSQL), EMPTIES the new database, and loads everything.
// This is the terminal way. Before launch the owner can do the same from Admin → Import from old site, which
// reads the old site directly and keeps the staff, roles, settings and consulting set-up made here.
//
//   npm run db:import-legacy -- --yes
import "dotenv/config";
import pg from "pg";
import { seedBase } from "../../prisma/seed";
import { type Row, loadFromLegacy } from "../lib/legacy-load";
import { prisma } from "../lib/prisma";

pg.types.setTypeParser(20, Number); // bigint
pg.types.setTypeParser(1700, Number); // numeric

const run = async () => {
  if (!process.argv.includes("--yes")) {
    throw new Error("This empties the new database and reloads it from the old data. Re-run with -- --yes to confirm.");
  }
  if (!process.env.LEGACY_DATABASE_URL) throw new Error("Set LEGACY_DATABASE_URL in .env");

  const legacy = new pg.Client({ connectionString: process.env.LEGACY_DATABASE_URL });
  await legacy.connect();
  const read = async (sql: string): Promise<Row[]> => (await legacy.query(sql)).rows;

  // ---- start from empty
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  console.log("New database emptied. Loading:\n");

  const { summary } = await loadFromLegacy(prisma, read);
  await seedBase();
  await legacy.end();
  console.log(`\nDone. ${summary}`);
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

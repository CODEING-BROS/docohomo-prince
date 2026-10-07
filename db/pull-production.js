// ONE-TIME copy of the production MongoDB database into the local MongoDB.
// Read-only on production (find only). Every collection is copied as-is and replaces
// the local collection of the same name. After this, nothing needs production again:
// the API runs on the local copy and `npm run db:load` builds PostgreSQL from it.
//
// Run from the repo root:  npm run db:pull -- --yes
const path = require("path");
const dns = require("dns");
const { MongoClient } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const live = require("dotenv").config({ path: path.join(__dirname, "..", "apps", "api", ".env.live"), processEnv: {} }).parsed || {};

// some home routers refuse the SRV lookup that mongodb+srv:// needs
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const BATCH = 1000;

const run = async () => {
  if (!process.argv.includes("--yes")) {
    throw new Error("This replaces the local MongoDB data with a fresh production copy. Re-run with --yes to confirm.");
  }
  const localUri = process.env.MONGO_LOCAL_URI || "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(localUri)) {
    throw new Error("Refusing to run: MONGO_LOCAL_URI is not a local database.");
  }
  if (!live.MONGODB_URI) throw new Error("apps/api/.env.live has no MONGODB_URI.");

  const prod = new MongoClient(live.MONGODB_URI, { readPreference: "secondaryPreferred" });
  const local = new MongoClient(localUri);
  await Promise.all([prod.connect(), local.connect()]);
  const from = prod.db();
  const to = local.db();
  console.log(`production "${from.databaseName}"  ->  local "${to.databaseName}"\n`);

  const collections = (await from.listCollections({ type: "collection" }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  for (const name of collections) {
    await to.collection(name).deleteMany({});
    let copied = 0;
    let batch = [];
    for await (const doc of from.collection(name).find({})) {
      batch.push(doc);
      if (batch.length === BATCH) {
        await to.collection(name).insertMany(batch);
        copied += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await to.collection(name).insertMany(batch);
      copied += batch.length;
    }
    console.log(`${String(copied).padStart(7)}  ${name}`);
  }

  await Promise.all([prod.close(), local.close()]);
  console.log("\nDone. Production is no longer needed. Next: npm run seed && npm run db:load");
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

import dns from "node:dns";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import pg from "pg";
import { env } from "../config/env";
import { endCustomerSessions, STAFF_ROLES } from "../middleware/auth";
import { type Row, loadFromLegacy } from "./legacy-load";
import { STAGING_SCHEMA, stageFromMongo } from "./legacy-stage";
import { forgetAccess } from "./permissions";
import { prisma } from "./prisma";

// Admin → Import from old site: one button that brings the old site's current data into this database.
//
// What happens when the owner presses it:
//   1. the old site's MongoDB is READ (never written) into staging tables in a schema of their own
//   2. in ONE transaction: the tables that come from the old site are emptied and filled again
//   3. doctors are placed in a specialization, old customer sign-ins are ended, the staging tables are dropped
// If anything fails in step 1 or 2, this database is exactly as it was before the button was pressed.
//
// What is kept, because it is set up here and the old site has nothing like it: staff accounts and
// their roles, settings, message wording, consulting streams with their specializations and test
// questions, doctor levels and the B2B price tiers.
//
// The button is for the time BEFORE launch. Once this site has taken real money or booked a real
// courier it refuses for good (importLock). The terminal command (npm run db:import-legacy) is not
// bound by that, and is the deliberate way for anyone who truly needs it later.

/** Tables that are never emptied by the button. "User" is handled row by row: staff stay, everyone else goes. */
const KEPT = ["_prisma_migrations", "User", "Setting", "NotificationTemplate", "StaffRole", "ConsultingStream", "StreamSpecialization", "StreamQuestion", "DoctorTier", "PriceTier"];
const LAST_KEY = "data.import"; // what the last import did
const CUTOFF_KEY = "auth.customerSessionsValidAfter"; // customer and doctor sign-ins older than this are refused
export const CONFIRM_WORD = "IMPORT";
const PRIVATE_FILES = path.resolve(process.cwd(), "private", "consultations");

export type ImportSummary = { at: string; by: string; tookSeconds: number; counts: Record<string, number>; summary: string; notes: string[] };
type Job = { running: boolean; stage: string; lines: string[]; startedAt: string | null; finishedAt: string | null; error: string | null };
let job: Job = { running: false, stage: "", lines: [], startedAt: null, finishedAt: null, error: null };

export const importConfigured = () => Boolean(env.LEGACY_MONGODB_URI);

/** Why the button is closed for good, or null while it may still be used. */
export const importLock = async (): Promise<string | null> => {
  const [payment, parcel] = await Promise.all([
    // money that came through the payment gateway for something sold here (not carried over from the old site)
    prisma.payment.findFirst({
      where: { status: { in: ["SUCCESS", "REFUNDED"] }, provider: { notIn: ["TEST", "MANUAL", "COD"] }, OR: [{ order: { legacyId: null } }, { appointmentId: { not: null } }] },
      select: { id: true },
    }),
    // a parcel handed to the real courier
    prisma.shipment.findFirst({ where: { providerOrderId: { not: null }, NOT: { providerOrderId: { startsWith: "TEST-" } } }, select: { id: true } }),
  ]);
  if (payment) return "This site has already taken a real payment, so the import is closed for good. It would erase live orders.";
  if (parcel) return "This site has already booked a real courier, so the import is closed for good. It would erase live orders.";
  return null;
};

/** What the screen shows: where things stand now, and what the last import did. */
export const importStatus = async () => {
  const base = { configured: importConfigured(), confirmWord: CONFIRM_WORD, job };
  // while it runs, the tables being replaced are locked: read nothing from them
  if (job.running) return { ...base, locked: null, now: null, kept: null, last: null };
  const [locked, last, customers, products, orders, doctors, appointments, staff, streams, specializations, questions] = await Promise.all([
    importLock(),
    prisma.setting.findUnique({ where: { key: LAST_KEY } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.order.count(),
    prisma.doctorProfile.count(),
    prisma.appointment.count(),
    prisma.user.count({ where: { role: { in: STAFF_ROLES } } }),
    prisma.consultingStream.count(),
    prisma.streamSpecialization.count(),
    prisma.streamQuestion.count(),
  ]);
  return {
    ...base, locked,
    now: { customers, products, orders, doctors, appointments },
    kept: { staff, streams, specializations, questions },
    last: (last?.value ?? null) as ImportSummary | null,
  };
};

const say = (line: string) => {
  job.lines.push(line);
  if (job.lines.length > 200) job.lines.splice(0, job.lines.length - 200);
};

/**
 * Opens the old site's database for reading. A "mongodb+srv" address needs a special name lookup that
 * some office and home routers refuse; when that happens the lookup is tried once more through public
 * name servers. Only that kind of lookup is affected: ordinary connections never use these servers.
 */
const openOldSite = async (source: string) => {
  const open = async () => {
    const client = new MongoClient(source, { readPreference: "secondaryPreferred", serverSelectionTimeoutMS: 20_000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  };
  try {
    return await open();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!source.startsWith("mongodb+srv://") || !/querySrv|queryTxt|ENOTFOUND|ECONNREFUSED|ETIMEOUT|EAI_AGAIN|ESERVFAIL/i.test(reason)) throw error;
    const usual = dns.getServers();
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    try {
      return await open();
    } catch {
      throw new Error(`The old site's database could not be reached (${reason.slice(0, 200)}). Check the address in LEGACY_MONGODB_URI and that this server is allowed to connect to it.`);
    } finally {
      dns.setServers(usual);
    }
  }
};

/** A connection that reads the staging tables, with whole numbers and prices as plain numbers. */
const stagingReader = async (connectionString: string) => {
  const client = new pg.Client({
    connectionString,
    types: {
      getTypeParser: ((oid: number, format?: string) => (oid === 20 || oid === 1700 ? (value: string) => Number(value) : pg.types.getTypeParser(oid, format as "text"))) as typeof pg.types.getTypeParser,
    },
  });
  await client.connect();
  await client.query(`SET search_path TO ${STAGING_SCHEMA}`);
  return client;
};

/** Gives each doctor that came over a specialization of the Homeopathy stream, from what they say they treat. */
const placeDoctors = async () => {
  const stream = await prisma.consultingStream.findUnique({ where: { name: "Homeopathy" }, include: { specializations: { where: { isActive: true } } } });
  if (!stream || stream.specializations.length === 0) return 0;
  const general = stream.specializations.find((s) => s.isGeneral) ?? null;
  const doctors = await prisma.doctorProfile.findMany({ where: { stream: stream.name, specializationId: null }, select: { id: true, specialization: true, bio: true } });
  let placed = 0;
  for (const doctor of doctors) {
    const text = `${doctor.specialization ?? ""} ${doctor.bio ?? ""}`.toLowerCase();
    let best: { id: number; score: number } | null = null;
    for (const s of stream.specializations) {
      if (s.isGeneral) continue;
      const words = [...s.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3), ...s.symptoms.map((symptom) => symptom.toLowerCase())];
      const score = words.filter((word) => text.includes(word)).length;
      if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
    }
    const specializationId = best?.id ?? general?.id;
    if (!specializationId) continue;
    await prisma.doctorProfile.update({ where: { id: doctor.id }, data: { specializationId } });
    placed++;
  }
  return placed;
};

/**
 * The whole import. `source` is the old site's MongoDB address; `target` this database's.
 * Exported so it can be tried against a spare database; the button calls it through startImport.
 */
export const runImport = async (source: string, target: string, actor: { id: number; name: string }, log: (line: string) => void = say): Promise<ImportSummary> => {
  const started = Date.now();
  const notes: string[] = [];
  let mongo: MongoClient | null = null;
  let staging: pg.Client | null = null;
  let reader: pg.Client | null = null;
  try {
    // ── 1. read the old site into the staging tables (this database's own tables are not touched yet)
    job.stage = "Reading the old site";
    mongo = await openOldSite(source);
    staging = new pg.Client({ connectionString: target });
    await staging.connect();
    const staged = await stageFromMongo(mongo.db(), staging, log);
    notes.push(...staged.notes);
    await mongo.close();
    mongo = null;
    if (!staged.counts.users && !staged.counts.products && !staged.counts.orders) {
      throw new Error("The old site's database looks empty (no customers, products or orders), so nothing was changed. Check LEGACY_MONGODB_URI.");
    }

    // ── 2. replace what comes from the old site, all or nothing
    job.stage = "Replacing the data";
    reader = await stagingReader(target);
    const read = async (sql: string): Promise<Row[]> => (await reader!.query(sql)).rows;
    const loaded = await prisma.$transaction(
      async (tx) => {
        const tables = (await tx.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map((t) => t.tablename).filter((name) => !KEPT.includes(name));
        // no CASCADE: if a kept table ever came to depend on one of these, this stops instead of quietly emptying it
        await tx.$executeRawUnsafe(`TRUNCATE ${tables.map((name) => `"${name}"`).join(", ")} RESTART IDENTITY`);
        await tx.user.deleteMany({ where: { role: { notIn: STAFF_ROLES } } });
        const staff = await tx.user.findMany({ where: { role: { in: STAFF_ROLES } }, select: { id: true, email: true } });
        log(`Kept ${staff.length} staff ${staff.length === 1 ? "account" : "accounts"}, the roles, settings and consulting set-up. Loading:`);
        return loadFromLegacy(tx, read, {
          log,
          userIdShift: staff.reduce((max, s) => Math.max(max, s.id), 0), // old customers are numbered after the staff
          skipStaffEmails: new Set(staff.map((s) => (s.email ?? "").toLowerCase()).filter(Boolean)),
        });
      },
      { maxWait: 60_000, timeout: 45 * 60_000 },
    );

    // ── 3. tidy up
    job.stage = "Finishing";
    // a customer or doctor signed in before now would be looking at someone else's account
    // the data is in from here on: a problem below is noted, it does not undo or fail the import
    const later = (what: string) => (error: unknown) => { notes.push(`${what}: ${error instanceof Error ? error.message : String(error)}`); return null; };
    const cutoff = Math.floor(Date.now() / 1000);
    endCustomerSessions(cutoff);
    await prisma.setting.upsert({ where: { key: CUTOFF_KEY }, update: { value: cutoff }, create: { key: CUTOFF_KEY, value: cutoff } }).catch(later("Could not save the sign-in cut-off"));
    forgetAccess();
    const placed = (await placeDoctors().catch(later("Doctors were not given a specialization"))) ?? 0;
    if (placed) log(`${String(placed).padStart(7)}  doctors given a specialization`);
    // the reports and photos of bookings that no longer exist
    for (const name of await readdir(PRIVATE_FILES).catch(() => [] as string[])) await unlink(path.join(PRIVATE_FILES, name)).catch(() => undefined);

    const summary: ImportSummary = {
      at: new Date().toISOString(), by: actor.name, tookSeconds: Math.round((Date.now() - started) / 1000),
      counts: { ...loaded.counts, "doctors given a specialization": placed }, summary: loaded.summary, notes,
    };
    await prisma.setting.upsert({ where: { key: LAST_KEY }, update: { value: summary }, create: { key: LAST_KEY, value: summary } }).catch(later("Could not save the summary"));
    await prisma.auditLog.create({ data: { actorId: actor.id, action: "data.import", entity: "Database", changes: { counts: summary.counts, tookSeconds: summary.tookSeconds } } }).catch(later("Could not write the history line"));
    log(`Done in ${summary.tookSeconds} seconds. ${loaded.summary}`);
    return summary;
  } finally {
    await mongo?.close().catch(() => undefined);
    await reader?.end().catch(() => undefined);
    // the staging copy holds the old site's data in the raw: it is not left lying around
    if (staging) {
      await staging.query(`DROP SCHEMA IF EXISTS ${STAGING_SCHEMA} CASCADE`).catch(() => undefined);
      await staging.end().catch(() => undefined);
    }
  }
};

/** Starts the import in the background. The screen follows it through importStatus. */
export const startImport = (actor: { id: number; name: string }) => {
  if (job.running) return false;
  job = { running: true, stage: "Starting", lines: [], startedAt: new Date().toISOString(), finishedAt: null, error: null };
  runImport(env.LEGACY_MONGODB_URI!, env.DATABASE_URL, actor)
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[import]", reason);
      job.error = reason.slice(0, 600);
      say(`Stopped: ${job.error}`);
      say("Nothing was changed: the database is as it was before.");
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.stage = job.error ? "Stopped" : "Done";
    });
  return true;
};

/** On start-up: remember from when customer sign-ins count (set by the last import). */
export const restoreSessionCutoff = async () => {
  const saved = await prisma.setting.findUnique({ where: { key: CUTOFF_KEY } }).catch(() => null);
  if (typeof saved?.value === "number") endCustomerSessions(saved.value);
};

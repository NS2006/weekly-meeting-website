/**
 * Development seed: replaces the dummy data with the team's real weekly updates when they are on this machine, else
 * with a fresh, dense simulation of the last three weeks.
 *
 * - Real data: the gitignored folder dummy_data/pir-weekly-2026-q4/ (seed.json and its pictures, see
 *   seed/realData.ts): Team PIR, its people only (real names and work addresses, from the data file), its Thursday
 *   "Weekly Update" and every note of the team's Word and PDF weekly updates of Q4 2026, text as written.
 *   `--synthetic` uses the simulation anyway.
 * - Deletes every @example.com account, and every account the data file lists, with what it owns (the teams it leads,
 *   its notes and their image files, its projects). Every other account is left alone: other company emails, and the
 *   @example.test users the tests create. It refuses to run if the data file lists an ADMIN_EMAILS account.
 * - The simulation creates fictitious accounts (Admin Test, PIR Leader, PIR 1–10, an inactive former member and a
 *   new joiner waiting for activation) and gives them five teams, their meeting schedules and meetings (past, today and four weeks ahead,
 *   with a few cancelled, moved and titled ones), projects (some archived), notes with project sections, lists,
 *   tables, code, quotes, links and generated chart images, and the links between notes and meetings.
 *   The story is described in seed/scenario.ts; every note passes the app's own schema check before it is stored.
 *
 * Run from the repository root: npm run db:seed --prefix backend. Refuses to run with NODE_ENV=production.
 * The simulation's accounts are fictitious (example.com is reserved for documentation) and its images are drawn by
 * seed/png.ts.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../config/env.ts';
import { createObjectStorage, removeFiles } from '../modules/attachments/storage.ts';
import { createLogger } from '../utils/logger.ts';
import { createPool, withTransactions } from './pool.ts';
import { buildRealScenario, DATA_FILE, personEmails } from './seed/realData.ts';
import { buildScenario } from './seed/scenario.ts';
import { prepare, removeDummyData, writeScenario, type Removed } from './seed/write.ts';

const env = loadEnv();
if (env.NODE_ENV === 'production') {
  console.error('db:seed is for development only (NODE_ENV=production).');
  process.exit(1);
}

const logger = createLogger(env.LOG_LEVEL);
const pool = createPool({ connectionString: env.DATABASE_URL, max: 2 }, logger);
const db = withTransactions(pool);

try {
  const realDir = join(import.meta.dirname, '../../../dummy_data/pir-weekly-2026-q4');
  const hasRealData = existsSync(join(realDir, DATA_FILE));
  const real = !process.argv.includes('--synthetic') && hasRealData;
  // The real data's people are replaced in either mode, but never an admin's own account (ADMIN_EMAILS).
  const realEmails = hasRealData ? personEmails({ dir: realDir }) : [];
  if (realEmails.some((email) => env.ADMIN_EMAILS.includes(email))) {
    console.error('The data file lists an ADMIN_EMAILS account, and seeding would delete it. Take it out of seed.json first.');
    process.exit(1);
  }
  const scenario = real ? buildRealScenario({ now: new Date(), dir: realDir }) : buildScenario({ now: new Date() });
  const prepared = prepare(scenario);
  const storage = await createObjectStorage(env);

  // The new images go first (under new keys, so nothing is overwritten); if anything fails they are removed again.
  const uploaded: string[] = [];
  let removed: Removed;
  try {
    for (const file of prepared.files) {
      await storage.put(file.key, file.data, file.mimeType);
      uploaded.push(file.key);
    }
    removed = await db.transaction(async (tx) => {
      const old = await removeDummyData(tx, realEmails);
      await writeScenario(tx, prepared);
      return old;
    });
  } catch (err) {
    await removeFiles(storage, logger, uploaded);
    throw err;
  }
  // The old images go after the commit (best effort, as in the app).
  await removeFiles(storage, logger, removed.keys);

  const { users, teams, series, meetings, projects, notes } = scenario;
  const count = <T>(items: T[], test: (item: T) => boolean) => items.filter(test).length;
  const imageBytes = prepared.files.reduce((sum, file) => sum + file.data.length, 0);
  console.log(
    `Removed ${removed.accounts} dummy accounts, ${removed.teams} teams, ${removed.projects} projects, ${removed.notes} notes ` +
      `and ${removed.keys.length} image files.`,
  );
  console.log(`\nCreated for ${scenario.today} (Indonesia time), from ${real ? 'the real weekly updates' : 'the simulation'}:`);
  console.log(`  ${users.length} accounts (${count(users, (u) => u.status === 'inactive')} inactive)`);
  console.log(`  ${teams.length} teams (${count(teams, (t) => t.archivedAt !== null)} deleted, restorable by its leader)`);
  console.log(
    `  ${series.length} meeting schedules (${count(series, (s) => !s.active)} stopped) with ${meetings.length} meetings: ` +
      `${count(meetings, (m) => m.status === 'done')} done, ${count(meetings, (m) => m.status === 'scheduled')} upcoming, ` +
      `${count(meetings, (m) => m.status === 'cancelled')} cancelled, ${count(meetings, (m) => m.meetingDate !== m.scheduledDate)} moved`,
  );
  console.log(`  ${projects.length} projects (${count(projects, (p) => p.status === 'archived')} archived)`);
  console.log(
    `  ${notes.length} notes with ${prepared.notes.reduce((sum, n) => sum + n.sections.length, 0)} project updates, ` +
      `${notes.reduce((sum, n) => sum + n.meetingIds.length, 0)} meeting links and ${prepared.files.length} images ` +
      `(${Math.round(imageBytes / 1024)} KB, ${storage.driver} storage)`,
  );
  console.log('\nAccounts:');
  for (const u of users) {
    const notesOf = count(notes, (n) => n.userId === u.id);
    const tags = [u.admin ? 'admin' : '', u.status === 'inactive' ? 'inactive' : '', notesOf > 0 ? `${notesOf} note${notesOf === 1 ? '' : 's'}` : '']
      .filter(Boolean)
      .join(', ');
    console.log(`  ${u.name.padEnd(24)} ${u.email.padEnd(36)} ${tags}`);
  }
  const leaderName = users.find((u) => u.id === teams[0]?.createdBy)?.name ?? 'the leader';
  console.log(
    real
      ? `\nTry: ${leaderName} (leads ${teams[0]?.name ?? 'the team'}) or any writer above. Website admins come from ADMIN_EMAILS.`
      : '\nTry: PIR Leader (leads Squad A and the deleted Hackathon team), PIR 6 (leads Squad B), PIR 3 (leads Platform Guild), ' +
          'PIR 10 (Design review, no schedule yet), Admin Test (New Joiner waits for activation).',
  );
} finally {
  await pool.end();
}

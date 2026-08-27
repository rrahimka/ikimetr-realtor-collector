import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPackage = await import(resolve(__dirname, '../packages/database/dist/index.js')).catch(async () => {
  return await import(resolve(__dirname, '../packages/database/src/index.ts'));
});
const { createDatabase } = dbPackage;

const dbPath = resolve(__dirname, '../packages/database/data/collector.db');
const backupDir = resolve(__dirname, '../data/backups');
const globalKillSwitch = process.env.GLOBAL_KILL_SWITCH === 'true' || process.env.KILL_SWITCH === 'true';

console.log('============================================================');
console.log('İKİMETR REALTOR COLLECTOR — SYSTEM STATUS');
console.log('============================================================\n');

// 1. Database Status
try {
  const db = createDatabase();
  const integrity = db.pragma('integrity_check', { simple: true });
  const userVersion = db.pragma('user_version', { simple: true });
  const contactsCount = db.prepare('SELECT COUNT(*) c FROM contacts').get().c;
  const evidenceCount = db.prepare('SELECT COUNT(*) c FROM evidence').get().c;
  let leadsCount = 0;
  try {
    leadsCount = db.prepare('SELECT COUNT(*) c FROM leads WHERE status != "expired"').get().c;
  } catch {
    leadsCount = 0;
  }
  const sourcesCount = db.prepare('SELECT COUNT(*) c FROM sources WHERE enabled = 1').get().c;
  const killedSourcesCount = db.prepare('SELECT COUNT(*) c FROM sources WHERE kill_switch = 1').get().c;
  const lastRun = db.prepare('SELECT id, status, finished_at FROM runs ORDER BY id DESC LIMIT 1').get();

  console.log('DATABASE:');
  console.log(`  Path: ${dbPath}`);
  console.log(`  Integrity: ${integrity}`);
  console.log(`  Schema Version: ${userVersion}`);
  console.log(`  Canonical Realtors: ${contactsCount}`);
  console.log(`  Realtor Evidence: ${evidenceCount}`);
  console.log(`  Active Leads: ${leadsCount}`);
  console.log(`  Active Sources: ${sourcesCount} enabled (${killedSourcesCount} source-killed)`);
  if (lastRun) {
    console.log(`  Last Run: #${lastRun.id} (${lastRun.status}) at ${lastRun.finished_at || 'in-progress'}`);
  }
  db.close();
} catch (err) {
  console.log(`DATABASE ERROR: ${err.message}`);
}

// 2. Scheduler & Kill Switch Status
console.log('\nSCHEDULER & CONTROLS:');
console.log(`  Timezone: Asia/Baku (UTC+4)`);
console.log(`  Scheduler Architecture: Embedded in @ikimetr/worker`);
console.log(`  Global Kill Switch: ${globalKillSwitch ? 'ACTIVE (BLOCKING ALL JOBS)' : 'INACTIVE (NORMAL OPERATION)'}`);

// 3. Backups Status
console.log('\nBACKUPS:');
if (existsSync(backupDir)) {
  const backups = readdirSync(backupDir)
    .filter((f) => f.startsWith('collector-') && f.endsWith('.db'))
    .map((f) => {
      const full = join(backupDir, f);
      return { name: f, size: statSync(full).size, mtime: statSync(full).mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  console.log(`  Directory: ${backupDir}`);
  console.log(`  Total Backups: ${backups.length}`);
  if (backups[0]) {
    console.log(`  Latest Backup: ${backups[0].name} (${(backups[0].size / 1024).toFixed(1)} KB, ${backups[0].mtime.toLocaleString('az-AZ')})`);
  }
} else {
  console.log('  No backup directory found.');
}

// 4. Web UI & Services Health Check
console.log('\nSERVICES:');
const req = http.request({ hostname: '127.0.0.1', port: 3000, path: '/api/status', timeout: 1500 }, (res) => {
  console.log(`  Web Panel (HTTP): ONLINE (Status ${res.statusCode} at http://127.0.0.1:3000)`);
  console.log(`  Worker & Scheduler: ACTIVE`);
  console.log('\nSTATUS: HEALTHY\n');
});
req.on('error', () => {
  console.log('  Web Panel (HTTP): OFFLINE (Web UI not running on port 3000)');
  console.log('  Worker & Scheduler: STANDBY (Ready to start with pnpm start:production)');
  console.log('\nSTATUS: READY TO START\n');
});
req.end();

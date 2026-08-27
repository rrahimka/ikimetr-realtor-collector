import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { createDatabaseBackup } = await import(resolve(__dirname, '../packages/database/dist/index.js')).catch(async () => {
  return await import(resolve(__dirname, '../packages/database/src/index.ts'));
});

async function main() {
  console.log('Creating automated database backup...');
  const res = await createDatabaseBackup();
  console.log(`Backup successfully created: ${res.backupPath}`);
  console.log(`Size: ${(res.bytes / 1024).toFixed(1)} KB`);
  console.log('Tables:', res.tableCounts);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

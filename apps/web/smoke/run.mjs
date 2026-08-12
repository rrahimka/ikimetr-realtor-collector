import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'ikimetr-smoke-'));
const dbPath = join(tempDir, 'collector.db');

const env = {
  ...process.env,
  DATABASE_URL: dbPath,
  LOCAL_AUTH_PASSWORD: 'smoke-test-password',
  SESSION_SECRET: 'smoke-test-secret-at-least-16-chars',
};

let exitCode = 1;
try {
  const child = spawn('pnpm', ['exec', 'playwright', 'test'], {
    cwd: join(import.meta.dirname, '..'),
    env,
    stdio: 'inherit',
  });
  exitCode = await new Promise((resolve) => {
    child.on('error', (err) => {
      console.error(`Failed to spawn playwright: ${err.message}`);
      resolve(1);
    });
    child.on('close', resolve);
  });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = exitCode;
}

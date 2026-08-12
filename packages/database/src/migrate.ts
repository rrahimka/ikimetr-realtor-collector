import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase } from './client';

const path = resolve(process.env.DATABASE_URL ?? './data/collector.db');
mkdirSync(dirname(path), { recursive: true });
createDatabase(path).close();
console.log(`Migrated ${path}`);

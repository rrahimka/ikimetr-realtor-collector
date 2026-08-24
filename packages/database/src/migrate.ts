import { createDatabase, DEFAULT_DATABASE_PATH, resolveDatabasePath } from './client';

const path = resolveDatabasePath(process.env.DATABASE_URL ?? DEFAULT_DATABASE_PATH);
createDatabase(path).close();
console.log(`Migrated ${path}`);

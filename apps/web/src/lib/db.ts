import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDatabase,createRepositories } from '@ikimetr/database';

const globalDb=globalThis as unknown as {collectorDb?:ReturnType<typeof createDatabase>};
export function getDb(){if(!globalDb.collectorDb){const path=resolve(process.env.DATABASE_URL??'./data/collector.db');mkdirSync(dirname(path),{recursive:true});globalDb.collectorDb=createDatabase(path);}return globalDb.collectorDb;}
export const getRepositories=()=>createRepositories(getDb());

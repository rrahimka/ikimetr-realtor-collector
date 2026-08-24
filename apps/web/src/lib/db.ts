import { createDatabase,createRepositories } from '@ikimetr/database';

const globalDb=globalThis as unknown as {collectorDb?:ReturnType<typeof createDatabase>};
export function getDb(){if(!globalDb.collectorDb){globalDb.collectorDb=createDatabase();}return globalDb.collectorDb;}
export const getRepositories=()=>createRepositories(getDb());

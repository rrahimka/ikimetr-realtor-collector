import { createDatabase, createRepositories } from '@ikimetr/database';
import { createConnectorRunner } from './connectors';
import { runWorker } from './worker';

const db=createDatabase();const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>controller.abort());
console.log('Worker started');
await runWorker({repos:createRepositories(db),connector:createConnectorRunner(process.env),signal:controller.signal});
db.close();

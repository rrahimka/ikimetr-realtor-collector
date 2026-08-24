import { createDatabase, createRepositories } from '@ikimetr/database';
import { createConnectorRunner } from './connectors';
import { startBinaScheduler } from './scheduler';
import { runWorker } from './worker';

const db=createDatabase();const controller=new AbortController();const repos=createRepositories(db);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>controller.abort());
console.log('Worker started');
const scheduler=startBinaScheduler({repos,env:process.env,signal:controller.signal});
try{await scheduler.firstTick;await runWorker({repos,connector:createConnectorRunner(process.env),signal:controller.signal});}
finally{scheduler.stop();db.close();}

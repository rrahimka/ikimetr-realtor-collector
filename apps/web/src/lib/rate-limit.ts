export function createRateLimiter(options:{limit:number;windowMs:number}){const buckets=new Map<string,{start:number;count:number}>();return(key:string,at=Date.now())=>{const current=buckets.get(key);if(!current||at-current.start>=options.windowMs){buckets.set(key,{start:at,count:1});return true;}current.count++;return current.count<=options.limit;};}
export const apiRateLimit=createRateLimiter({limit:120,windowMs:60_000});
export const loginRateLimit=createRateLimiter({limit:10,windowMs:60_000});

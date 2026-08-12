import { crawlWebsite, type ConnectorResult } from '@ikimetr/connectors';
import type { SourceInput } from '@ikimetr/core';

type Source=SourceInput&{id:number};
export function createConnectorRunner(env:NodeJS.ProcessEnv){return async(source:Source):Promise<ConnectorResult>=>{
  if(source.type==='test_fixture'){if(env.NODE_ENV!=='test'||env.ALLOW_TEST_CONNECTOR!=='true')throw new Error('Test connector is disabled outside tests');return{pagesChecked:1,estimatedItems:1,items:[{sourceUrl:'https://fixture.invalid/realtor',locationType:'listing',excerpt:'Bakı əmlakçı. Mənzil satışı və kirayə. Telefon 050 123 45 67',rawPhone:'050 123 45 67',name:'Aysel Məmmədova',agency:'Bakı Emlak',platform:'fixture',fingerprint:'fixture-contact-0001'}]};}
  if(source.type==='website'||source.type==='listing_page')return crawlWebsite({startUrl:source.locator,maxPages:source.maxPages,maxDepth:source.maxDepth,delayMs:source.delayMs});
  if(source.type.startsWith('instagram')&&!env.APIFY_TOKEN)throw new Error('Instagram: Не настроено (APIFY_TOKEN)');
  if(source.type.startsWith('tiktok')&&!env.APIFY_TOKEN)throw new Error('TikTok: Не настроено (APIFY_TOKEN)');
  if(source.type==='google_maps_query'&&!env.APIFY_TOKEN)throw new Error('Google Maps Apify: Не настроено (APIFY_TOKEN)');
  throw new Error(`Connector configuration unavailable for ${source.type}`);
};}

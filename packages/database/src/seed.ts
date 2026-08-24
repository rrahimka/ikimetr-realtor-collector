import { createDatabase } from './client';
import { createRepositories } from './repositories';

const DEMO_KEYWORDS: Array<[string, 'AZ' | 'RU']> = [
  ['əmlakçı', 'AZ'], ['daşınmaz əmlak', 'AZ'], ['mənzil', 'AZ'], ['kirayə', 'AZ'],
  ['риелтор', 'RU'], ['недвижимость', 'RU'], ['продажа квартиры', 'RU'], ['аренда', 'RU'],
];

export function seedDemoData(db: ReturnType<typeof createDatabase>): { keywords: number; sourceCreated: boolean } {
  const repos = createRepositories(db);
  for (const [value, language] of DEMO_KEYWORDS) repos.keywords.create(value, language);
  const hadFixture = repos.sources.list().some((s) => s.type === 'test_fixture');
  if (!hadFixture) repos.sources.create({ name: 'Demo fixture', type: 'test_fixture', locator: 'fixture://contacts', language: 'mixed', maxPages: 1, maxDepth: 0, delayMs: 0, enabled: true, killSwitch: false });
  return { keywords: repos.keywords.list().length, sourceCreated: !hadFixture };
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const db = createDatabase();
  const result = seedDemoData(db);
  db.close();
  console.log(`Seeded ${result.keywords} keywords; fixture source ${result.sourceCreated ? 'created' : 'already present'}`);
}

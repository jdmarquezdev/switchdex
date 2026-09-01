import { syncCatalog } from '../server/catalog-sync';
import { loadLocalEnv } from './env';

await loadLocalEnv();

try {
  const summary = await syncCatalog();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  console.error(`[catalog] ${error instanceof Error ? error.message : 'error desconocido'}`);
  process.exitCode = 1;
}

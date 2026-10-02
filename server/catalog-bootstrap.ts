import { catalogHealth } from './catalog-api';
import { syncCatalog, type CatalogSyncOptions, type CatalogSyncSummary } from './catalog-sync';

/** Actualiza también el formato de cachés heredadas aunque el SHA no haya cambiado. */
export async function prepareCatalog(options: CatalogSyncOptions = {}): Promise<CatalogSyncSummary | undefined> {
  const health = await catalogHealth({ cacheDir: options.cacheDir });
  if (health.ready && !health.needsNormalization) return undefined;
  return syncCatalog(options);
}

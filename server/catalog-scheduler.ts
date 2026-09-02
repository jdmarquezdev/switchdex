import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { syncCatalog, type CatalogSyncOptions, type CatalogSyncSummary } from './catalog-sync';

export interface CatalogSourceState {
  sha: string;
  syncedAt: string;
}

export interface CatalogSyncCycleOptions extends CatalogSyncOptions {
  shaUrl?: string;
  syncImpl?: (options: CatalogSyncOptions) => Promise<CatalogSyncSummary>;
  log?: Pick<Console, 'log' | 'error'>;
}

export interface CatalogSchedulerOptions extends CatalogSyncCycleOptions {
  enabled?: boolean;
  intervalMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export type CatalogSyncCycleResult =
  | { status: 'unchanged'; sha: string }
  | { status: 'synced'; sha: string; summary: CatalogSyncSummary }
  | { status: 'check-failed'; error: unknown };

function sourceStatePath(cacheDir?: string): string {
  return resolve(cacheDir || process.env.CATALOG_CACHE_DIR || '.cache/catalog', 'source-state.json');
}

async function readSourceState(path: string): Promise<CatalogSourceState | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<CatalogSourceState>;
    return typeof parsed.sha === 'string' && typeof parsed.syncedAt === 'string'
      ? { sha: parsed.sha, syncedAt: parsed.syncedAt }
      : null;
  } catch {
    return null;
  }
}

async function writeSourceState(path: string, state: CatalogSourceState): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state), 'utf8');
  await rename(temporaryPath, path);
}

export function githubContentsUrl(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl) return undefined;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname !== 'raw.githubusercontent.com') return undefined;
    const [owner, repository, ref, ...fileParts] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repository || !ref || fileParts.length === 0) return undefined;
    const path = fileParts.map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  } catch {
    return undefined;
  }
}

export async function fetchRemoteCatalogSha(options: CatalogSyncCycleOptions = {}): Promise<string> {
  const sourceUrl = options.sourceUrl ?? process.env.CATALOG_SOURCE_URL?.trim();
  const shaUrl = options.shaUrl ?? process.env.CATALOG_SOURCE_SHA_URL?.trim() ?? githubContentsUrl(sourceUrl);
  if (!shaUrl) throw new Error('No se puede determinar el endpoint SHA; configura CATALOG_SOURCE_SHA_URL.');
  const parsedUrl = new URL(shaUrl);
  if (parsedUrl.protocol !== 'https:' && !(options.allowHttp ?? process.env.CATALOG_ALLOW_HTTP === 'true')) {
    throw new Error('CATALOG_SOURCE_SHA_URL debe usar HTTPS.');
  }
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? Number(process.env.CATALOG_FETCH_TIMEOUT_MS || 30_000);
  const userAgent = options.userAgent || process.env.CATALOG_USER_AGENT || 'switchdex/1.0';
  const response = await fetchImpl(parsedUrl, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': userAgent },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`GitHub respondió con HTTP ${response.status}.`);
  const body = await response.json() as { sha?: unknown };
  if (typeof body.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(body.sha)) {
    throw new Error('La respuesta de GitHub no contiene un SHA válido.');
  }
  return body.sha.toLowerCase();
}

function logSummary(log: Pick<Console, 'log'>, summary: CatalogSyncSummary): void {
  const { previous, current, added, updated, removed, skipped } = summary.counts;
  log.log(`[catalog] sync completed previous=${previous} current=${current} added=${added} updated=${updated} removed=${removed} skipped=${skipped}`);
}

export async function runCatalogSyncCycle(options: CatalogSyncCycleOptions = {}): Promise<CatalogSyncCycleResult> {
  const log = options.log || console;
  let sha: string;
  try {
    sha = await fetchRemoteCatalogSha(options);
  } catch (error) {
    log.error(`[catalog] SHA check failed; keeping current catalog: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { status: 'check-failed', error };
  }

  const statePath = sourceStatePath(options.cacheDir);
  const previousState = await readSourceState(statePath);
  if (previousState?.sha === sha) {
    log.log(`[catalog] no changes (sha=${sha})`);
    return { status: 'unchanged', sha };
  }

  const syncImpl = options.syncImpl || syncCatalog;
  const summary = await syncImpl(options);
  if (summary.source !== 'remote') {
    throw new Error('La descarga remota no terminó correctamente; el SHA no se actualizará.');
  }
  await writeSourceState(statePath, { sha, syncedAt: new Date().toISOString() });
  logSummary(log, summary);
  return { status: 'synced', sha, summary };
}

export function startCatalogSyncScheduler(options: CatalogSchedulerOptions = {}): { stop: () => void } {
  const enabled = options.enabled ?? process.env.CATALOG_SYNC_ENABLED?.trim().toLowerCase() !== 'false';
  if (!enabled) return { stop() {} };
  const sourceUrl = options.sourceUrl ?? process.env.CATALOG_SOURCE_URL?.trim();
  if (!sourceUrl) {
    (options.log || console).log('[catalog] automatic sync skipped (no remote source configured)');
    return { stop() {} };
  }

  const configuredMinutes = Number(process.env.CATALOG_SYNC_INTERVAL_MINUTES || 60);
  const intervalMs = options.intervalMs ?? (Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 60) * 60_000;
  const scheduleTimeout = options.setTimeoutImpl || setTimeout;
  const cancelTimeout = options.clearTimeoutImpl || clearTimeout;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = scheduleTimeout(async () => {
      try {
        await runCatalogSyncCycle({ ...options, sourceUrl });
      } catch (error) {
        (options.log || console).error(`[catalog] periodic sync failed; keeping current catalog: ${error instanceof Error ? error.message : 'unknown error'}`);
      } finally {
        scheduleNext();
      }
    }, intervalMs);
  };

  scheduleNext();
  (options.log || console).log(`[catalog] automatic sync enabled (interval=${Math.round(intervalMs / 60_000)}m)`);
  return {
    stop() {
      stopped = true;
      if (timer) cancelTimeout(timer);
    }
  };
}

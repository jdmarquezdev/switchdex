import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubContentsUrl, runCatalogSyncCycle, startCatalogSyncScheduler } from '../server/catalog-scheduler';
import type { CatalogSyncSummary } from '../server/catalog-sync';

const temporaryDirectories: string[] = [];
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'switchdex-scheduler-'));
  temporaryDirectories.push(directory);
  return directory;
}

function summary(current = 1): CatalogSyncSummary {
  return {
    updatedAt: '2026-09-02T00:00:00.000Z', source: 'remote',
    counts: { previous: 0, current, added: current, updated: 0, removed: 0, skipped: 0 },
    added: [], updated: [], removed: []
  };
}

function shaResponse(sha: string): Response {
  return new Response(JSON.stringify({ sha }), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('catalog SHA sync', () => {
  it('deduce el endpoint Contents para una URL raw de GitHub', () => {
    expect(githubContentsUrl('https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json'))
      .toBe('https://api.github.com/repos/Langegen/switch-games/contents/switch_games.json?ref=main');
  });

  it('sincroniza al cambiar y persiste el SHA solo después de éxito', async () => {
    const cacheDir = await temporaryDirectory();
    const syncImpl = vi.fn().mockResolvedValue(summary());
    const fetchImpl = vi.fn().mockImplementation(async () => shaResponse(shaA));
    const log = { log: vi.fn(), error: vi.fn() };

    const first = await runCatalogSyncCycle({ cacheDir, sourceUrl: 'https://raw.githubusercontent.com/a/b/main/catalog.json', fetchImpl, syncImpl, log });
    expect(first.status).toBe('synced');
    expect(syncImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(join(cacheDir, 'source-state.json'), 'utf8'))).toMatchObject({ sha: shaA });

    const second = await runCatalogSyncCycle({ cacheDir, sourceUrl: 'https://raw.githubusercontent.com/a/b/main/catalog.json', fetchImpl, syncImpl, log });
    expect(second.status).toBe('unchanged');
    expect(syncImpl).toHaveBeenCalledTimes(1);

    fetchImpl.mockImplementation(async () => shaResponse(shaB));
    await runCatalogSyncCycle({ cacheDir, sourceUrl: 'https://raw.githubusercontent.com/a/b/main/catalog.json', fetchImpl, syncImpl, log });
    expect(syncImpl).toHaveBeenCalledTimes(2);
  });

  it('mantiene catálogo y estado cuando falla GitHub o el sync', async () => {
    const cacheDir = await temporaryDirectory();
    const log = { log: vi.fn(), error: vi.fn() };
    const unavailable = await runCatalogSyncCycle({
      cacheDir, shaUrl: 'https://api.github.test/catalog',
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
      syncImpl: vi.fn(), log
    });
    expect(unavailable.status).toBe('check-failed');

    await expect(runCatalogSyncCycle({
      cacheDir, shaUrl: 'https://api.github.test/catalog',
      fetchImpl: vi.fn().mockResolvedValue(shaResponse(shaA)),
      syncImpl: vi.fn().mockRejectedValue(new Error('sync failed')), log
    })).rejects.toThrow('sync failed');
    await expect(readFile(join(cacheDir, 'source-state.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('no guarda el SHA si el sync tuvo que reutilizar el catálogo cacheado', async () => {
    const cacheDir = await temporaryDirectory();
    await expect(runCatalogSyncCycle({
      cacheDir, shaUrl: 'https://api.github.test/catalog',
      fetchImpl: vi.fn().mockResolvedValue(shaResponse(shaA)),
      syncImpl: vi.fn().mockResolvedValue({ ...summary(), source: 'cache' }),
      log: { log: vi.fn(), error: vi.fn() }
    })).rejects.toThrow('el SHA no se actualizará');
    await expect(readFile(join(cacheDir, 'source-state.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('catalog scheduler', () => {
  it('programa el siguiente timeout solo después de terminar el ciclo', async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const setTimeoutImpl = vi.fn((callback: () => Promise<void>) => {
      callbacks.push(callback);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    let finishSync!: () => void;
    const syncImpl = vi.fn(() => new Promise<CatalogSyncSummary>((resolve) => { finishSync = () => resolve(summary()); }));
    const scheduler = startCatalogSyncScheduler({
      cacheDir: await temporaryDirectory(), intervalMs: 10,
      sourceUrl: 'https://example.test/catalog.json', shaUrl: 'https://api.github.test/catalog', fetchImpl: vi.fn().mockResolvedValue(shaResponse(shaA)),
      syncImpl, setTimeoutImpl, clearTimeoutImpl: vi.fn(), log: { log: vi.fn(), error: vi.fn() }
    });

    expect(callbacks).toHaveLength(1);
    const running = callbacks[0]();
    await vi.waitFor(() => expect(syncImpl).toHaveBeenCalledTimes(1));
    expect(callbacks).toHaveLength(1);
    finishSync();
    await running;
    expect(callbacks).toHaveLength(2);
    scheduler.stop();
  });
});

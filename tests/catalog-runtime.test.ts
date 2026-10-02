import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCatalogRequest } from '../server/catalog-api';
import { syncCatalog } from '../server/catalog-sync';
import { descriptionHash } from '../scripts/catalog-translations';
import type { CatalogDocument } from '../src/data/schema';
import { toIndexItem } from '../src/data/catalog';
import { selectCatalogGames } from '../src/data/catalog-list';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'switchdex-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeFixture(path: string, games: unknown[]): Promise<void> {
  await writeFile(path, JSON.stringify({ games }), 'utf8');
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('catalog sync', () => {
  it('sube una demo a novedades al perder su etiqueta y persiste la fecha de release', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    const options = { cacheDir, fixturePath, sourceUrl: '', sourceType: 'langegen-switch-games' };
    const document = async () => JSON.parse(await readFile(join(cacheDir, 'normalized.json'), 'utf8')) as CatalogDocument;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z'));
      await writeFixture(fixturePath, [{ id: 'orchard', title: 'Z Orchard [DEMO]', year: 2000 }]);
      await syncCatalog(options);
      expect((await document()).games[0].isDemo).toBe(true);

      vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
      await writeFixture(fixturePath, [
        { id: 'orchard', title: 'Z Orchard [DEMO]', year: 2000 },
        { id: 'meadow', title: 'A Meadow', year: 2026 }
      ]);
      await syncCatalog(options);
      expect(selectCatalogGames((await document()).games.map(toIndexItem)).map((game) => game.id)).toEqual(['meadow']);

      vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
      await writeFixture(fixturePath, [
        { id: 'orchard', title: 'Z Orchard', year: 2000 },
        { id: 'meadow', title: 'A Meadow', year: 2026 }
      ]);
      const released = await syncCatalog(options);
      expect(released.counts).toMatchObject({ added: 0, updated: 1 });
      const index = selectCatalogGames((await document()).games.map(toIndexItem));
      expect(index.map((game) => game.id)).toEqual(['orchard', 'meadow']);
      expect(index[0]).toMatchObject({ isDemo: false, addedAt: released.updatedAt, releaseDate: '2000' });

      vi.setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
      expect((await syncCatalog(options)).counts.updated).toBe(0);
      expect((await document()).games.find((game) => game.id === 'orchard')?.addedAt).toBe(released.updatedAt);
      expect(JSON.parse(await readFile(join(cacheDir, 'first-seen.json'), 'utf8')).entries.orchard).toBe(released.updatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persiste la primera detección entre updates, eliminaciones y reapariciones', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    const document = async () => JSON.parse(await readFile(join(cacheDir, 'normalized.json'), 'utf8')) as CatalogDocument;
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha', year: 2026 }]);
    const first = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect((await document()).games[0].addedAt).toBe(first.updatedAt);

    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha revised' }, { id: 'beta', title: 'Beta', year: 2020 }]);
    const second = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect((await document()).games.map(({ id, addedAt }) => ({ id, addedAt }))).toEqual([
      { id: 'alpha', addedAt: first.updatedAt }, { id: 'beta', addedAt: second.updatedAt }
    ]);
    expect((await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' })).counts.updated).toBe(0);

    await writeFixture(fixturePath, [{ id: 'beta', title: 'Beta', year: 2020 }]);
    await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha returns' }, { id: 'beta', title: 'Beta', year: 2020 }]);
    await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect((await document()).games[0].addedAt).toBe(first.updatedAt);
  });

  it('migra cachés anteriores sin inventar fechas ni contabilizarlas como cambios del origen', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha' }]);
    await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    const path = join(cacheDir, 'normalized.json');
    const legacy = JSON.parse(await readFile(path, 'utf8')) as CatalogDocument;
    delete legacy.games[0].addedAt;
    delete legacy.games[0].isDemo;
    await writeFile(path, JSON.stringify(legacy));
    await unlink(join(cacheDir, 'source-normalized.json'));
    await unlink(join(cacheDir, 'first-seen.json'));
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha' }, { id: 'beta', title: 'Beta' }]);
    const result = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    const migrated = JSON.parse(await readFile(path, 'utf8')) as CatalogDocument;
    expect(migrated.games[0].addedAt).toBeUndefined();
    expect(migrated.games[1].addedAt).toBe(result.updatedAt);
    expect(result.counts).toMatchObject({ added: 1, updated: 0 });
    expect((await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' })).counts.updated).toBe(0);
  });

  it('conserva caché e historial cuando una descarga no contiene juegos válidos', async () => {
    const cacheDir = await temporaryDirectory();
    const fetchImpl = async () => new Response(JSON.stringify([{ id: 'alpha', title: 'Alpha' }]), { status: 200 });
    await syncCatalog({ cacheDir, sourceUrl: 'https://example.com/catalog.json', fetchImpl });
    const paths = ['source.json', 'source-normalized.json', 'normalized.json', 'first-seen.json'];
    const before = await Promise.all(paths.map((path) => readFile(join(cacheDir, path), 'utf8')));
    await expect(syncCatalog({ cacheDir, sourceUrl: 'https://example.com/catalog.json',
      fetchImpl: async () => new Response(JSON.stringify([{ id: 'bad' }]), { status: 200 })
    })).rejects.toThrow('Ninguna entrada');
    expect(await Promise.all(paths.map((path) => readFile(join(cacheDir, path), 'utf8')))).toEqual(before);
    const fallback = await syncCatalog({ cacheDir, sourceUrl: 'https://example.com/catalog.json',
      fetchImpl: async () => { throw new Error('offline'); }
    });
    expect(fallback.source).toBe('cache');
    expect(fallback.counts).toMatchObject({ added: 0, updated: 0 });
    expect(await readFile(join(cacheDir, 'first-seen.json'), 'utf8')).toBe(before[3]);
  });
  it('detecta added, updated y removed sin modificar translations.json', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    const translationsPath = join(cacheDir, 'translations.json');
    const translations = { version: 1, entries: { alpha: { sourceHash: 'hash', es: 'Texto', en: 'Text' } } };
    await writeFile(translationsPath, JSON.stringify(translations), 'utf8');
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha', year: 2025 }]);

    const first = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect(first.counts).toMatchObject({ previous: 0, current: 1, added: 1, updated: 0, removed: 0 });

    await writeFixture(fixturePath, [
      { id: 'alpha', title: 'Alpha revised', year: 2026 },
      { id: 'beta', title: 'Beta', year: 2026 }
    ]);
    const second = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect(second.added).toEqual([{ id: 'beta', title: 'Beta' }]);
    expect(second.updated).toEqual([{ id: 'alpha', title: 'Alpha revised' }]);

    await writeFixture(fixturePath, [{ id: 'beta', title: 'Beta', year: 2026 }]);
    const third = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect(third.removed).toEqual([{ id: 'alpha', title: 'Alpha revised' }]);
    expect(JSON.parse(await readFile(translationsPath, 'utf8'))).toEqual(translations);
  });

  it('no confunde traducciones heredadas con cambios del origen', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    const description = 'Original description for this game.';
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha', description }]);
    await writeFile(join(cacheDir, 'translations.json'), JSON.stringify({
      version: 1,
      entries: { alpha: { sourceHash: descriptionHash(description), es: 'Descripción original de este juego.', en: description } }
    }), 'utf8');
    await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });

    await unlink(join(cacheDir, 'source-normalized.json'));
    const migrated = await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    expect(migrated.counts).toMatchObject({ previous: 1, current: 1, added: 0, updated: 0, removed: 0 });
  });
});

describe('catalog API', () => {
  it('sirve el índice compacto, una ficha y un 404', async () => {
    const cacheDir = await temporaryDirectory();
    const fixturePath = join(cacheDir, 'fixture.json');
    const description = 'Original description for this game.';
    await writeFixture(fixturePath, [{ id: 'alpha', title: 'Alpha', description, magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567' }]);
    await syncCatalog({ cacheDir, fixturePath, sourceUrl: '' });
    await writeFile(join(cacheDir, 'translations.json'), JSON.stringify({
      version: 1,
      entries: { alpha: { sourceHash: descriptionHash(description), es: 'Descripción original de este juego.', en: description } }
    }), 'utf8');

    const server = createServer((request, response) => {
      void handleCatalogRequest(request, response, { cacheDir }).then((handled) => {
        if (!handled) { response.writeHead(404); response.end(); }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const index = await fetch(`${base}/api/catalog`).then((response) => response.json()) as { games: Array<Record<string, unknown>> };
      expect(index.games).toEqual([{ id: 'alpha', title: 'Alpha', isDemo: false, addedAt: expect.any(String) }]);
      expect(index.games[0]).not.toHaveProperty('description');

      const detailResponse = await fetch(`${base}/api/game/alpha`);
      expect(detailResponse.status).toBe(200);
      expect(await detailResponse.json()).toMatchObject({ game: {
        id: 'alpha', title: 'Alpha', magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
        descriptions: { es: 'Descripción original de este juego.', en: description }
      } });
      expect((await fetch(`${base}/api/game/missing`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

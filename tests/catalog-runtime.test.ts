import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleCatalogRequest } from '../server/catalog-api';
import { syncCatalog } from '../server/catalog-sync';
import { descriptionHash } from '../scripts/catalog-translations';

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
      expect(index.games).toEqual([{ id: 'alpha', title: 'Alpha' }]);
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

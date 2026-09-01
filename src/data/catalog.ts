import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adaptCompatibleJson } from './adapters/compatible-json';
import { normalizeCatalog } from './normalize';
import type { CatalogDocument, CatalogIndexItem, Game } from './schema';

const fixturePath = resolve('tests/fixtures/catalog.json');
const normalizedPath = resolve('.cache/catalog/normalized.json');

export async function loadCatalog(): Promise<CatalogDocument> {
  try {
    return JSON.parse(await readFile(normalizedPath, 'utf8')) as CatalogDocument;
  } catch {
    const input = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
    const { games, skipped } = normalizeCatalog(adaptCompatibleJson(input));
    return { updatedAt: new Date(0).toISOString(), source: 'fixture', games, skipped };
  }
}

export function toIndexItem(game: Game): CatalogIndexItem {
  return {
    id: game.id,
    title: game.title,
    year: game.year,
    releaseDate: game.releaseDate,
    cover: game.cover
  };
}

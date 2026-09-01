import type { CatalogIndexDocument, CatalogIndexItem, Game } from './schema';

const apiBase = () => (process.env.CATALOG_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function apiJson<T>(pathname: string): Promise<T | undefined> {
  const response = await fetch(`${apiBase()}${pathname}`, { headers: { accept: 'application/json' } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Catalog API responded with HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadCatalog(): Promise<CatalogIndexDocument> {
  const catalog = await apiJson<CatalogIndexDocument>('/api/catalog');
  if (!catalog) throw new Error('Catalog API did not return the index');
  return catalog;
}

export async function loadGame(id: string): Promise<Game | undefined> {
  const result = await apiJson<{ game: Game }>(`/api/game/${encodeURIComponent(id)}`);
  return result?.game;
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

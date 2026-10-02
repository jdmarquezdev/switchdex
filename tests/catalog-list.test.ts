import { describe, expect, it } from 'vitest';
import { catalogSortMode, selectCatalogGames } from '../src/data/catalog-list';
import type { CatalogIndexItem } from '../src/data/schema';

const games: CatalogIndexItem[] = [
  { id: 'legacy', title: 'Archive', releaseDate: '2026-12' },
  { id: 'old', title: 'Old addition', addedAt: '2026-09-01T10:00:00.000Z', releaseDate: '2026-10' },
  { id: 'new', title: 'Newest addition', addedAt: '2026-10-01T10:00:00.000Z', releaseDate: '2020' },
  { id: 'demo', title: 'Demo', addedAt: '2026-10-02T10:00:00.000Z', isDemo: true }
];
const ids = (items: CatalogIndexItem[]) => items.map((game) => game.id);

describe('catalog listing', () => {
  it('ordena por incorporación y usa el lanzamiento como aproximación en las entradas heredadas', () => {
    expect(ids(selectCatalogGames(games))).toEqual(['legacy', 'new', 'old']);
    expect(ids(selectCatalogGames(games, '', 'oldest'))).toEqual(['old', 'new', 'legacy']);
    expect(ids(selectCatalogGames(games, '', 'release-newest'))).toEqual(['legacy', 'old', 'new']);
    expect(ids(selectCatalogGames(games, '', 'release-oldest', true))).toEqual(['new', 'old', 'legacy', 'demo']);
  });

  it('usa el año cuando falta fecha de lanzamiento y deja al final las entradas sin fecha', () => {
    const undated: CatalogIndexItem = { id: 'undated', title: 'A Undated' };
    const dated: CatalogIndexItem = { id: 'year', title: 'Year only', year: 2025 };
    expect(ids(selectCatalogGames([undated, dated, games[2]]))).toEqual(['new', 'year', 'undated']);
    expect(ids(selectCatalogGames([undated, dated, games[2]], '', 'oldest'))).toEqual(['year', 'new', 'undated']);
  });

  it('oculta demos por defecto y combina el botón con búsqueda y orden', () => {
    expect(ids(selectCatalogGames(games, 'demo'))).toEqual([]);
    expect(ids(selectCatalogGames(games, 'DEMO', 'newest', true))).toEqual(['demo']);
    expect(ids(selectCatalogGames(games, '', 'title-desc', true))).toEqual(['old', 'new', 'demo', 'legacy']);
    expect(games[0].id).toBe('legacy');
  });

  it('desempata de forma estable y valida el modo de la URL', () => {
    expect(ids(selectCatalogGames([{ id: 'z', title: 'Same' }, { id: 'a', title: 'Same' }]))).toEqual(['a', 'z']);
    expect(catalogSortMode('invalid')).toBe('newest');
    expect(catalogSortMode(null)).toBe('newest');
    expect(catalogSortMode('release-newest')).toBe('release-newest');
  });
});

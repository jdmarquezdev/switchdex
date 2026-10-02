import type { CatalogIndexItem } from './schema';

export const SORT_MODES = ['newest', 'oldest', 'title-asc', 'title-desc', 'release-newest', 'release-oldest'] as const;
export type SortMode = typeof SORT_MODES[number];

export function catalogSortMode(value: string | null): SortMode {
  return SORT_MODES.find((mode) => mode === value) ?? 'newest';
}

export function selectCatalogGames(
  games: CatalogIndexItem[], query = '', mode: SortMode = 'newest', showDemos = false, locale = 'es'
): CatalogIndexItem[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const search = normalize(query);
  return games.filter((game) => (showDemos || !game.isDemo) && (!search || normalize(game.title).includes(search)))
    .sort((a, b) => {
      const titleOrder = a.title.localeCompare(b.title, locale) || a.id.localeCompare(b.id);
      if (mode === 'title-asc') return titleOrder;
      if (mode === 'title-desc') return -titleOrder;
      const release = mode.startsWith('release-');
      const aReleaseDate = String(a.releaseDate ?? a.year ?? '');
      const bReleaseDate = String(b.releaseDate ?? b.year ?? '');
      const aDate = release ? aReleaseDate : a.addedAt ?? aReleaseDate;
      const bDate = release ? bReleaseDate : b.addedAt ?? bReleaseDate;
      // Las fechas desconocidas quedan al final en ambas direcciones.
      if (!aDate || !bDate) return Number(!aDate) - Number(!bDate) || titleOrder;
      const dateOrder = aDate.localeCompare(bDate);
      return (mode === 'oldest' || mode === 'release-oldest' ? dateOrder : -dateOrder) || titleOrder;
    });
}

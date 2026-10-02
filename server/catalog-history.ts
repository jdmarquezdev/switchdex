import type { Game } from '../src/data/schema';

export interface CatalogHistory {
  version: 1;
  /** null indica una entrada heredada cuya fecha de incorporación se desconoce. */
  entries: Record<string, string | null>;
  /** Conserva el estado demo aunque una entrada desaparezca temporalmente. */
  demoIds: string[];
}

export function readHistory(value: unknown): CatalogHistory {
  const entries: CatalogHistory['entries'] = Object.create(null);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('entries' in value) || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    return { version: 1, entries, demoIds: [] };
  }
  for (const [id, date] of Object.entries(value.entries)) {
    if (date === null || (typeof date === 'string' && Number.isFinite(Date.parse(date)))) {
      entries[id] = date === null ? null : new Date(date).toISOString();
    }
  }
  const demoIds = 'demoIds' in value && Array.isArray(value.demoIds)
    ? [...new Set(value.demoIds.filter((id): id is string => typeof id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(id)))]
    : [];
  return { version: 1, entries, demoIds };
}

export function trackCatalogAdditions(games: Game[], previous: Game[], history: CatalogHistory, observedAt: string): Game[] {
  const demoIds = new Set(history.demoIds);
  for (const game of previous) {
    if (!Object.hasOwn(history.entries, game.id)) history.entries[game.id] = game.addedAt ?? null;
    if (game.isDemo) demoIds.add(game.id);
    else if (game.isDemo === false) demoIds.delete(game.id);
  }
  const trackedGames = games.map((game) => {
    const becameRelease = demoIds.has(game.id) && game.isDemo === false;
    if (!Object.hasOwn(history.entries, game.id) || becameRelease) history.entries[game.id] = observedAt;
    if (game.isDemo) demoIds.add(game.id);
    else if (game.isDemo === false) demoIds.delete(game.id);
    return { ...game, addedAt: history.entries[game.id] ?? undefined };
  });
  history.demoIds = [...demoIds].sort();
  return trackedGames;
}

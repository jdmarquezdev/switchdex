import { describe, expect, it } from 'vitest';
import { readHistory, trackCatalogAdditions } from '../server/catalog-history';
import { adaptCompatibleJson } from '../src/data/adapters/compatible-json';
import { normalizeCatalog } from '../src/data/normalize';

describe('catalog history validation', () => {
  it('tolera formatos inválidos y descarta fechas dañadas', () => {
    for (const value of [null, [], { version: 2, entries: {} }, { version: 1, entries: [] }]) {
      expect(readHistory(value)).toEqual({ version: 1, entries: {}, demoIds: [] });
    }
    expect(readHistory({ version: 1, entries: { legacy: null, invalid: 'bad', wrong: 42, valid: '2026-10-01T12:00:00Z' } }))
      .toEqual({ version: 1, entries: { legacy: null, valid: '2026-10-01T12:00:00.000Z' }, demoIds: [] });
  });

  it('valida el estado demo y acepta el historial anterior sin él', () => {
    expect(readHistory({ version: 1, entries: {}, demoIds: ['sample', 'sample', 42, '../bad'] }).demoIds).toEqual(['sample']);
    expect(readHistory({ version: 1, entries: {}, demoIds: 'sample' }).demoIds).toEqual([]);
  });

  it('renueva solo las demos que pasan a release, incluso después de desaparecer', () => {
    const games = (isDemo: boolean) => normalizeCatalog(adaptCompatibleJson([{ id: 'sample', title: 'Sample', is_demo: isDemo }])).games;
    const initialDate = '2026-09-01T12:00:00.000Z';
    const releaseDate = '2026-10-01T12:00:00.000Z';
    let history = readHistory(null);
    const demo = trackCatalogAdditions(games(true), [], history, initialDate);
    expect(demo[0].addedAt).toBe(initialDate);
    trackCatalogAdditions([], demo, history, initialDate);
    history = readHistory(JSON.parse(JSON.stringify(history)));
    const release = trackCatalogAdditions(games(false), [], history, releaseDate);
    expect(release[0].addedAt).toBe(releaseDate);
    expect(history.demoIds).toEqual([]);
    expect(trackCatalogAdditions(games(false), release, history, '2026-10-02T12:00:00.000Z')[0].addedAt).toBe(releaseDate);
  });

  it('renueva una demo heredada sin fecha y conserva la fecha de un juego completo que vuelve como demo', () => {
    const games = (isDemo: boolean) => normalizeCatalog(adaptCompatibleJson([{ id: 'sample', title: 'Sample', is_demo: isDemo }])).games;
    const date = '2026-10-01T12:00:00.000Z';
    const history = readHistory({ version: 1, entries: { sample: null } });
    const release = trackCatalogAdditions(games(false), games(true), history, date);
    expect(release[0].addedAt).toBe(date);
    expect(trackCatalogAdditions(games(true), release, history, '2026-10-02T12:00:00.000Z')[0].addedAt).toBe(date);
  });
});

import { loadCatalog } from '../src/data/catalog';

const catalog = await loadCatalog();
const ids = new Set(catalog.games.map((game) => game.id));

if (catalog.games.length === 0) throw new Error('El catálogo está vacío.');
if (ids.size !== catalog.games.length) throw new Error('El catálogo contiene IDs duplicados.');
if (catalog.games.some((game) => !game.title || !game.searchText)) {
  throw new Error('El catálogo contiene entradas sin título o índice de búsqueda.');
}

console.log(`[catalog] valid ${catalog.games.length} entries (${catalog.source})`);

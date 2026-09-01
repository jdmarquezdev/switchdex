import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { toIndexItem } from '../src/data/catalog';
import type { CatalogDocument } from '../src/data/schema';
import { applyTranslationCache, emptyTranslationCache, type TranslationCache } from '../scripts/catalog-translations';

export interface CatalogApiOptions { cacheDir?: string; }

function sendJson(response: ServerResponse, status: number, body: unknown, cacheControl = 'no-store'): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl, 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}

export async function readCatalogDocument(cacheDir = process.env.CATALOG_CACHE_DIR || '.cache/catalog'): Promise<CatalogDocument> {
  const catalog = JSON.parse(await readFile(resolve(cacheDir, 'normalized.json'), 'utf8')) as CatalogDocument;
  let translations = emptyTranslationCache();
  try {
    const parsed = JSON.parse(await readFile(resolve(cacheDir, 'translations.json'), 'utf8')) as TranslationCache;
    if (parsed.version === 1 && parsed.entries) translations = parsed;
  } catch { /* Optional cache. */ }
  return { ...catalog, games: applyTranslationCache(catalog.games, translations) };
}

export async function handleCatalogRequest(request: IncomingMessage, response: ServerResponse, options: CatalogApiOptions = {}): Promise<boolean> {
  if (request.method !== 'GET') return false;
  const pathname = new URL(request.url || '/', 'http://catalog.local').pathname.replace(/\/$/, '') || '/';
  if (pathname !== '/api/catalog' && !pathname.startsWith('/api/game/')) return false;
  const cacheDir = resolve(options.cacheDir || process.env.CATALOG_CACHE_DIR || '.cache/catalog');
  try {
    const catalog = await readCatalogDocument(cacheDir);
    const cacheControl = 'public, max-age=60, stale-while-revalidate=300';
    if (pathname === '/api/catalog') {
      sendJson(response, 200, { updatedAt: catalog.updatedAt, games: catalog.games.map(toIndexItem) }, cacheControl);
      return true;
    }
    const encodedId = pathname.slice('/api/game/'.length);
    let id: string;
    try { id = decodeURIComponent(encodedId); } catch { sendJson(response, 400, { error: 'ID no válido.' }); return true; }
    if (!/^[a-z0-9_-]{1,80}$/i.test(id)) { sendJson(response, 400, { error: 'ID no válido.' }); return true; }
    const game = catalog.games.find((candidate) => candidate.id === id);
    if (!game) { sendJson(response, 404, { error: 'Juego no encontrado.' }); return true; }
    sendJson(response, 200, { updatedAt: catalog.updatedAt, game }, cacheControl);
    return true;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === 'ENOENT';
    sendJson(response, 503, { error: missing ? 'El catálogo aún no se ha sincronizado.' : 'No se ha podido leer el catálogo.' });
    return true;
  }
}

export async function catalogHealth(options: CatalogApiOptions = {}): Promise<{ ready: boolean; updatedAt?: string; games?: number }> {
  const cacheDir = resolve(options.cacheDir || process.env.CATALOG_CACHE_DIR || '.cache/catalog');
  try {
    const catalog = await readCatalogDocument(cacheDir);
    return { ready: true, updatedAt: catalog.updatedAt, games: catalog.games.length };
  } catch { return { ready: false }; }
}

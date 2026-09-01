import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adaptCompatibleJson } from '../src/data/adapters/compatible-json';
import { adaptLangegenSwitchGames } from '../src/data/adapters/langegen-switch-games';
import { normalizeCatalog } from '../src/data/normalize';
import { toIndexItem } from '../src/data/catalog';
import type { CatalogDocument } from '../src/data/schema';
import { applyTranslationCache, emptyTranslationCache, type TranslationCache } from './catalog-translations';
import { loadLocalEnv } from './env';

await loadLocalEnv();

const cacheDir = resolve(process.env.CATALOG_CACHE_DIR || '.cache/catalog');
const sourceCachePath = resolve(cacheDir, 'source.json');
const normalizedPath = resolve(cacheDir, 'normalized.json');
const translationsPath = resolve(cacheDir, 'translations.json');
const fixturePath = resolve('tests/fixtures/catalog.json');
const publicIndexPath = resolve('public/data/catalog-index.json');
const sourceUrl = process.env.CATALOG_SOURCE_URL?.trim();
const timeoutMs = Number(process.env.CATALOG_FETCH_TIMEOUT_MS || 30_000);
const maxBytes = Number(process.env.CATALOG_MAX_BYTES || 52_428_800);
const sourceType = process.env.CATALOG_SOURCE_TYPE || 'compatible-json';
const includeSourceUrls = process.env.CATALOG_INCLUDE_SOURCE_URLS === 'true';

function adaptSource(input: unknown) {
  const entries = sourceType === 'langegen-switch-games'
    ? adaptLangegenSwitchGames(input)
    : adaptCompatibleJson(input);
  return includeSourceUrls ? entries : entries.map((entry) => ({ ...entry, sourceUrl: undefined }));
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

async function readTranslations(): Promise<TranslationCache> {
  try {
    const parsed = JSON.parse(await readFile(translationsPath, 'utf8')) as TranslationCache;
    return parsed.version === 1 && parsed.entries ? parsed : emptyTranslationCache();
  } catch {
    return emptyTranslationCache();
  }
}

function parseCatalog(text: string): unknown {
  const parsed = JSON.parse(text) as unknown;
  if (adaptSource(parsed).length === 0) {
    throw new Error('La estructura JSON no contiene entradas compatibles.');
  }
  return parsed;
}

async function downloadCatalog(url: string): Promise<string> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' && process.env.CATALOG_ALLOW_HTTP !== 'true') {
    throw new Error('CATALOG_SOURCE_URL debe usar HTTPS.');
  }

  console.log('[catalog] downloading');
  const response = await fetch(parsedUrl, {
    headers: { accept: 'application/json', 'user-agent': process.env.CATALOG_USER_AGENT || 'switchdex/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`El origen respondió con HTTP ${response.status}.`);

  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (declaredBytes > maxBytes) throw new Error('El catálogo supera el tamaño máximo configurado.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error('El catálogo supera el tamaño máximo configurado.');
  return new TextDecoder().decode(buffer);
}

async function readSource(): Promise<{ raw: unknown; source: CatalogDocument['source']; updatedAt: string }> {
  if (!sourceUrl) {
    console.log('[catalog] using local fixture');
    const text = await readFile(fixturePath, 'utf8');
    return { raw: parseCatalog(text), source: 'fixture', updatedAt: new Date().toISOString() };
  }

  try {
    const text = await downloadCatalog(sourceUrl);
    const raw = parseCatalog(text);
    await writeAtomic(sourceCachePath, text);
    return { raw, source: 'remote', updatedAt: new Date().toISOString() };
  } catch (error) {
    console.warn(`[catalog] update failed: ${error instanceof Error ? error.message : 'error desconocido'}`);
    try {
      const text = await readFile(sourceCachePath, 'utf8');
      const cacheStats = await stat(sourceCachePath);
      console.warn('[catalog] using cached copy');
      return { raw: parseCatalog(text), source: 'cache', updatedAt: cacheStats.mtime.toISOString() };
    } catch {
      throw new Error('No se ha podido actualizar el catálogo y no existe una copia válida en caché.');
    }
  }
}

if (!['compatible-json', 'langegen-switch-games'].includes(sourceType)) {
  throw new Error(`CATALOG_SOURCE_TYPE no soportado: ${sourceType}`);
}

await mkdir(cacheDir, { recursive: true });
await mkdir(resolve('public/data'), { recursive: true });
const source = await readSource();
console.log('[catalog] validating');
const normalized = normalizeCatalog(adaptSource(source.raw));
const games = applyTranslationCache(normalized.games, await readTranslations());
const { skipped } = normalized;
if (games.length === 0) throw new Error('Ninguna entrada del catálogo es válida.');

const document: CatalogDocument = { updatedAt: source.updatedAt, source: source.source, games, skipped };
await writeAtomic(normalizedPath, JSON.stringify(document));
await writeAtomic(publicIndexPath, JSON.stringify({ updatedAt: document.updatedAt, games: games.map(toIndexItem) }));
console.log(`[catalog] normalized ${games.length} entries`);
if (skipped > 0) console.warn(`[catalog] skipped ${skipped} invalid or duplicate entries`);

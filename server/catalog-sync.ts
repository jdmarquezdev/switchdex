import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adaptCompatibleJson } from '../src/data/adapters/compatible-json';
import { adaptLangegenSwitchGames } from '../src/data/adapters/langegen-switch-games';
import { normalizeCatalog } from '../src/data/normalize';
import type { CatalogDocument, Game } from '../src/data/schema';
import { applyTranslationCache, emptyTranslationCache, type TranslationCache } from '../scripts/catalog-translations';

export interface CatalogSyncOptions {
  cacheDir?: string;
  fixturePath?: string;
  sourceUrl?: string;
  sourceType?: string;
  timeoutMs?: number;
  maxBytes?: number;
  allowHttp?: boolean;
  includeSourceUrls?: boolean;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export interface ChangedGame { id: string; title: string; }
export interface CatalogSyncSummary {
  updatedAt: string;
  source: CatalogDocument['source'];
  counts: { previous: number; current: number; added: number; updated: number; removed: number; skipped: number };
  added: ChangedGame[];
  updated: ChangedGame[];
  removed: ChangedGame[];
}

function adaptSource(input: unknown, sourceType: string, includeSourceUrls: boolean) {
  const entries = sourceType === 'langegen-switch-games' ? adaptLangegenSwitchGames(input) : adaptCompatibleJson(input);
  return includeSourceUrls ? entries : entries.map((entry) => ({ ...entry, sourceUrl: undefined }));
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
  await rename(temporaryPath, path);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; }
}

function parseCatalog(text: string, sourceType: string, includeSourceUrls: boolean): unknown {
  const parsed = JSON.parse(text) as unknown;
  if (adaptSource(parsed, sourceType, includeSourceUrls).length === 0) throw new Error('La estructura JSON no contiene entradas compatibles.');
  return parsed;
}

async function downloadCatalog(url: string, options: Required<Pick<CatalogSyncOptions, 'timeoutMs' | 'maxBytes' | 'allowHttp' | 'userAgent' | 'fetchImpl'>>): Promise<string> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' && !options.allowHttp) throw new Error('CATALOG_SOURCE_URL debe usar HTTPS.');
  const response = await options.fetchImpl(parsedUrl, {
    headers: { accept: 'application/json', 'user-agent': options.userAgent },
    signal: AbortSignal.timeout(options.timeoutMs)
  });
  if (!response.ok) throw new Error(`El origen respondió con HTTP ${response.status}.`);
  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (declaredBytes > options.maxBytes) throw new Error('El catálogo supera el tamaño máximo configurado.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > options.maxBytes) throw new Error('El catálogo supera el tamaño máximo configurado.');
  return new TextDecoder().decode(buffer);
}

function changedGames(previous: Game[], current: Game[]) {
  const previousById = new Map(previous.map((game) => [game.id, game]));
  const currentById = new Map(current.map((game) => [game.id, game]));
  const added = current.filter((game) => !previousById.has(game.id));
  const updated = current.filter((game) => {
    const oldGame = previousById.get(game.id);
    return oldGame !== undefined && JSON.stringify(oldGame) !== JSON.stringify(game);
  });
  const removed = previous.filter((game) => !currentById.has(game.id));
  const pick = (games: Game[]): ChangedGame[] => games.map(({ id, title }) => ({ id, title }));
  return { added: pick(added), updated: pick(updated), removed: pick(removed) };
}

function withoutCachedTranslations(games: Game[], translations: TranslationCache): Game[] {
  return games.map((game) => {
    const cached = translations.entries[game.id];
    if (!cached) return game;
    const descriptions = { ...game.descriptions };
    if (descriptions.es === cached.es) delete descriptions.es;
    if (descriptions.en === cached.en) delete descriptions.en;
    return { ...game, descriptions };
  });
}

export async function syncCatalog(options: CatalogSyncOptions = {}): Promise<CatalogSyncSummary> {
  const cacheDir = resolve(options.cacheDir || process.env.CATALOG_CACHE_DIR || '.cache/catalog');
  const sourceCachePath = resolve(cacheDir, 'source.json');
  const sourceNormalizedPath = resolve(cacheDir, 'source-normalized.json');
  const normalizedPath = resolve(cacheDir, 'normalized.json');
  const translationsPath = resolve(cacheDir, 'translations.json');
  const fixturePath = resolve(options.fixturePath || 'tests/fixtures/catalog.json');
  const sourceUrl = options.sourceUrl ?? process.env.CATALOG_SOURCE_URL?.trim();
  const sourceType = options.sourceType || process.env.CATALOG_SOURCE_TYPE || 'compatible-json';
  const includeSourceUrls = options.includeSourceUrls ?? process.env.CATALOG_INCLUDE_SOURCE_URLS === 'true';
  const fetchOptions = {
    timeoutMs: options.timeoutMs ?? Number(process.env.CATALOG_FETCH_TIMEOUT_MS || 30_000),
    maxBytes: options.maxBytes ?? Number(process.env.CATALOG_MAX_BYTES || 52_428_800),
    allowHttp: options.allowHttp ?? process.env.CATALOG_ALLOW_HTTP === 'true',
    userAgent: options.userAgent || process.env.CATALOG_USER_AGENT || 'switchdex/1.0',
    fetchImpl: options.fetchImpl || fetch
  };
  if (!['compatible-json', 'langegen-switch-games'].includes(sourceType)) throw new Error(`CATALOG_SOURCE_TYPE no soportado: ${sourceType}`);

  await mkdir(cacheDir, { recursive: true });
  let raw: unknown;
  let source: CatalogDocument['source'];
  let updatedAt: string;
  if (!sourceUrl) {
    raw = parseCatalog(await readFile(fixturePath, 'utf8'), sourceType, includeSourceUrls);
    source = 'fixture';
    updatedAt = new Date().toISOString();
  } else {
    try {
      const text = await downloadCatalog(sourceUrl, fetchOptions);
      raw = parseCatalog(text, sourceType, includeSourceUrls);
      await writeAtomic(sourceCachePath, raw);
      source = 'remote';
      updatedAt = new Date().toISOString();
    } catch (error) {
      console.error(`[catalog] descarga fallida; usando caché: ${error instanceof Error ? error.message : 'error desconocido'}`);
      try {
        const text = await readFile(sourceCachePath, 'utf8');
        raw = parseCatalog(text, sourceType, includeSourceUrls);
        source = 'cache';
        updatedAt = (await stat(sourceCachePath)).mtime.toISOString();
      } catch {
        throw new Error('No se ha podido actualizar el catálogo y no existe una copia válida en caché.');
      }
    }
  }

  const normalized = normalizeCatalog(adaptSource(raw, sourceType, includeSourceUrls));
  if (normalized.games.length === 0) throw new Error('Ninguna entrada del catálogo es válida.');
  const parsedTranslations = await readJson<TranslationCache | null>(translationsPath, null);
  const translations = parsedTranslations?.version === 1 && parsedTranslations.entries
    ? parsedTranslations
    : emptyTranslationCache();
  const sourceBaseline = await readJson<CatalogDocument | null>(sourceNormalizedPath, null);
  const legacyBaseline = sourceBaseline ? null : await readJson<CatalogDocument | null>(normalizedPath, null);
  const previousGames = sourceBaseline?.games || withoutCachedTranslations(legacyBaseline?.games || [], translations);
  const changes = changedGames(previousGames, normalized.games);
  const sourceDocument: CatalogDocument = { updatedAt, source, games: normalized.games, skipped: normalized.skipped };
  const document: CatalogDocument = { ...sourceDocument, games: applyTranslationCache(normalized.games, translations) };
  await writeAtomic(sourceNormalizedPath, sourceDocument);
  await writeAtomic(normalizedPath, document);

  return {
    updatedAt, source,
    counts: {
      previous: previousGames.length,
      current: normalized.games.length,
      added: changes.added.length,
      updated: changes.updated.length,
      removed: changes.removed.length,
      skipped: normalized.skipped
    },
    ...changes
  };
}

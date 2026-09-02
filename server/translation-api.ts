import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPlausibleTranslation, splitDescription, descriptionSource as sourceOf, descriptionHash as hashOf } from '../scripts/catalog-translations';
import { createProvider, type Provider } from '../scripts/translation-providers';
import { loadLocalEnv } from '../scripts/env';
import type { Game } from '../src/data/schema';
import { catalogHealth, handleCatalogRequest } from './catalog-api';
import { syncCatalog } from './catalog-sync';
import { isAllowedOrigin, parseAllowedOrigins } from './translation-origin';

await loadLocalEnv();

const cacheDir = resolve(process.env.CATALOG_CACHE_DIR || '.cache/catalog');
const catalogPath = resolve(cacheDir, 'normalized.json');
const translationsPath = resolve(cacheDir, 'translations.json');
const usagePath = resolve(cacheDir, 'translation-usage.json');
const configuredModel = process.env.TRANSLATION_MODEL?.trim() ?? process.env.OLLAMA_MODEL?.trim();
const host = process.env.TRANSLATION_API_HOST || '127.0.0.1';
const port = positiveInteger(process.env.TRANSLATION_API_PORT, 8787);
const dailyLimit = positiveInteger(process.env.TRANSLATION_DAILY_LIMIT, 100);
const hourlyIpLimit = positiveInteger(process.env.TRANSLATION_HOURLY_IP_LIMIT, 10);
const allowedOrigins = parseAllowedOrigins(process.env.TRANSLATION_ALLOWED_ORIGINS);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface TranslationUsage { date: string; count: number; }
interface TranslationCacheFile { version: number; entries: Record<string, { sourceHash: string; es: string; en: string; model?: string; updatedAt?: string }>; }

let catalogMtime = 0;
let translationsMtime = 0;
let gamesById = new Map<string, Game>();
let translationCache: TranslationCacheFile = { version: 1, entries: {} };
const inFlight = new Map<string, Promise<{ es: string; en: string; cached: boolean }>>();
const requestsByIp = new Map<string, number[]>();
let translationQueue: Promise<unknown> = Promise.resolve();
let provider: Provider | undefined;

function currentProvider(): Provider {
  if (provider) return provider;
  const model = process.env.TRANSLATION_MODEL?.trim() ?? process.env.OLLAMA_MODEL?.trim();
  if (!model) throw Object.assign(new Error('TRANSLATION_MODEL no está configurado.'), { status: 500 });
  const thinkSetting = (process.env.TRANSLATION_THINK ?? process.env.OLLAMA_THINK)?.trim().toLocaleLowerCase();
  provider = createProvider({
    provider: process.env.TRANSLATION_PROVIDER ?? 'ollama',
    apiKey: process.env.TRANSLATION_API_KEY ?? process.env.OLLAMA_API_KEY,
    apiBase: process.env.TRANSLATION_URL ?? process.env.OLLAMA_URL,
    model,
    timeoutMs: positiveInteger(process.env.TRANSLATION_TIMEOUT_MS ?? process.env.OLLAMA_TIMEOUT_MS, 600_000),
    think: thinkSetting === 'true' ? true
      : thinkSetting === 'low' || thinkSetting === 'medium' || thinkSetting === 'high' ? thinkSetting
        : false
  });
  return provider;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; }
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
  await rename(temporaryPath, path);
}

async function loadCatalog(): Promise<void> {
  const info = await stat(catalogPath);
  if (info.mtimeMs === catalogMtime && gamesById.size > 0) return;
  const document = JSON.parse(await readFile(catalogPath, 'utf8')) as { games?: Game[] };
  gamesById = new Map((document.games || []).map((game) => [game.id, game]));
  catalogMtime = info.mtimeMs;
}

async function refreshTranslationCache(): Promise<void> {
  try {
    const info = await stat(translationsPath);
    if (info.mtimeMs === translationsMtime) return;
    translationCache = await readJson<TranslationCacheFile>(translationsPath, { version: 1, entries: {} });
    translationsMtime = info.mtimeMs;
  } catch {
    translationCache = { version: 1, entries: {} };
    translationsMtime = 0;
  }
}

function enqueueTranslation<T>(task: () => Promise<T>): Promise<T> {
  const queued = translationQueue.then(task, task);
  translationQueue = queued.catch(() => undefined);
  return queued as Promise<T>;
}

async function reserveDailyUse(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await readJson<TranslationUsage>(usagePath, { date: today, count: 0 });
  const current = usage.date === today ? usage : { date: today, count: 0 };
  if (current.count >= dailyLimit) return false;
  current.count += 1;
  await writeAtomic(usagePath, current);
  return true;
}

function allowIp(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 3_600_000;
  const recent = (requestsByIp.get(ip) || []).filter((time) => time > windowStart);
  if (recent.length >= hourlyIpLimit) return false;
  recent.push(now);
  requestsByIp.set(ip, recent);
  return true;
}

function validCachedEntry(game: Game, source: string) {
  const entry = translationCache.entries?.[game.id];
  return entry && entry.sourceHash === hashOf(source)
    && isPlausibleTranslation(source, entry.es) && isPlausibleTranslation(source, entry.en) ? entry : undefined;
}

async function translateLanguage(providerInstance: Provider, source: string, language: 'European Spanish' | 'English'): Promise<string> {
  const chunks: string[] = [];
  for (const chunk of splitDescription(source)) chunks.push(await providerInstance.translatePlain(chunk, language));
  return chunks.join(' ');
}

async function translateGame(game: Game, source: string): Promise<{ es: string; en: string; cached: boolean }> {
  await refreshTranslationCache();
  const cached = validCachedEntry(game, source);
  if (cached) return { es: cached.es, en: cached.en, cached: true };
  if (!await reserveDailyUse()) throw Object.assign(new Error('Se ha alcanzado el límite diario de traducciones.'), { status: 429 });
  const providerInstance = currentProvider();
  const es = game.descriptions?.es || await translateLanguage(providerInstance, source, 'European Spanish');
  const en = game.descriptions?.en || await translateLanguage(providerInstance, source, 'English');
  if (!isPlausibleTranslation(source, es) || !isPlausibleTranslation(source, en)) {
    throw new Error('La IA devolvió una traducción incompleta.');
  }
  translationCache.entries[game.id] = { sourceHash: hashOf(source), es, en, model: providerInstance.label, updatedAt: new Date().toISOString() };
  await writeAtomic(translationsPath, translationCache);
  return { es, en, cached: false };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<{ id?: unknown }> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_024) throw Object.assign(new Error('Petición demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(body || '{}') as { id?: unknown }; } catch {
    throw Object.assign(new Error('JSON no válido.'), { status: 400 });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (await handleCatalogRequest(request, response, { cacheDir })) return;
  if (request.method === 'GET' && request.url === '/health') {
    const catalog = await catalogHealth({ cacheDir });
    return sendJson(response, catalog.ready ? 200 : 503, { ok: catalog.ready, catalog });
  }
  if (request.method !== 'POST' || request.url !== '/api/translate') return sendJson(response, 404, { error: 'No encontrado.' });
  if (!isAllowedOrigin(request, allowedOrigins)) return sendJson(response, 403, { error: 'Origen no permitido.' });
  const ip = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim();
  if (!allowIp(ip)) return sendJson(response, 429, { error: 'Has alcanzado el límite temporal de traducciones.' });

  try {
    const { id } = await readBody(request);
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id)) return sendJson(response, 400, { error: 'Ficha no válida.' });
    await loadCatalog();
    const game = gamesById.get(id);
    const source = game ? sourceOf(game) : undefined;
    if (!game || !source) return sendJson(response, 404, { error: 'La ficha no tiene una descripción traducible.' });
    let task = inFlight.get(id);
    if (!task) {
      task = enqueueTranslation(() => translateGame(game, source)).finally(() => inFlight.delete(id));
      inFlight.set(id, task);
    }
    const result = await task;
    return sendJson(response, 200, { id, ...result });
  } catch (error) {
    console.error(`[translate-api] ${error instanceof Error ? error.message : 'unknown error'}`);
    const status = (error as { status?: number } | null)?.status;
    return sendJson(response, status || 500, { error: status === 429 ? (error as Error).message : 'No se ha podido traducir la ficha.' });
  }
}

if (!(await catalogHealth({ cacheDir })).ready) {
  try {
    const summary = await syncCatalog({ cacheDir });
    console.log(`[catalog] initial sync completed (${summary.counts.current} games)`);
  } catch (error) {
    console.error(`[catalog] initial sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
if (!configuredModel) console.warn('[translate-api] TRANSLATION_MODEL is not configured');
const server = createServer((request, response) => void handleRequest(request, response));
server.listen(port, host, () => console.log(`[translate-api] listening on http://${host}:${port}`));

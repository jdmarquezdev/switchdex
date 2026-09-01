import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CatalogDocument, Game } from '../src/data/schema';
import {
  descriptionHash,
  descriptionSource,
  emptyTranslationCache,
  isPlausibleTranslation,
  splitDescription,
  type TranslationCache,
  type TranslationCacheEntry,
  type TranslationResult
} from './catalog-translations';
import { createProvider, type Provider } from './translation-providers';
import { loadLocalEnv } from './env';

await loadLocalEnv();

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, '').split('=');
  return [key, value.join('=') || 'true'];
}));
const cacheDir = resolve(process.env.CATALOG_CACHE_DIR || '.cache/catalog');
const normalizedPath = resolve(cacheDir, 'normalized.json');
const translationsPath = resolve(cacheDir, 'translations.json');
const model = process.env.TRANSLATION_MODEL?.trim() ?? process.env.OLLAMA_MODEL?.trim();
const batchSize = positiveInteger(args.get('batch') || process.env.TRANSLATION_BATCH_SIZE || process.env.OLLAMA_BATCH_SIZE, 4);
const limit = positiveInteger(args.get('limit'), Number.POSITIVE_INFINITY);
const force = args.has('force');

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

async function readCache(): Promise<TranslationCache> {
  try {
    const parsed = JSON.parse(await readFile(translationsPath, 'utf8')) as TranslationCache;
    return parsed.version === 1 && parsed.entries ? parsed : emptyTranslationCache();
  } catch {
    return emptyTranslationCache();
  }
}

/** Elige el modelo exacto cuando la cuenta publica su lista de modelos. */
async function resolveModel(provider: Provider): Promise<string> {
  if (!provider.listModels) return provider.id === 'ollama' ? model! : model!;
  let available: string[];
  try {
    available = await provider.listModels();
  } catch {
    return model!;
  }
  const candidates = [model!, model!.replace(/-cloud$/, ''), model!.replace(/:cloud$/, '')];
  const selected = candidates.find((candidate) => available.includes(candidate));
  if (!selected) throw new Error(`El modelo "${model}" no aparece en la cuenta de ${provider.label}. Modelos disponibles: ${available.join(', ') || 'ninguno'}.`);
  return selected;
}

async function translatePlainLanguage(provider: Provider, game: Game, language: 'European Spanish' | 'English'): Promise<string> {
  const source = descriptionSource(game);
  if (!source) throw new Error(`La ficha ${game.id} no tiene descripción de origen.`);
  const translations: string[] = [];
  for (const chunk of splitDescription(source)) {
    translations.push(await provider.translatePlain(chunk, language));
  }
  return translations.join(' ');
}

let useTaggedResponses = false;
let batchUnsupported = false;

async function translateReliable(provider: Provider, games: Game[]): Promise<TranslationResult[]> {
  if (provider.translateBatch && !useTaggedResponses && !batchUnsupported) {
    try {
      const input = games.map((game) => ({ id: game.id, title: game.title, description: descriptionSource(game) ?? '' }));
      const translations = await provider.translateBatch(input);
      const expectedIds = new Set(games.map((game) => game.id));
      if (translations.length === games.length && translations.every((item) => expectedIds.has(item.id) && item.es?.trim() && item.en?.trim())) {
        return translations;
      }
      console.warn('[translate] respuesta por lotes incompleta; traduciendo ficha a ficha');
    } catch (error) {
      console.warn(`[translate] modo lotes no disponible (${error instanceof Error ? error.message : 'invalid response'}); traduciendo ficha a ficha`);
    }
    batchUnsupported = true;
  }

  const results: TranslationResult[] = [];
  for (const game of games) {
    const es = await translatePlainLanguage(provider, game, 'European Spanish');
    const en = await translatePlainLanguage(provider, game, 'English');
    const source = descriptionSource(game) ?? '';
    if (!isPlausibleTranslation(source, es) || !isPlausibleTranslation(source, en)) {
      throw new Error(`Traducción inválida para ${game.id}.`);
    }
    results.push({ id: game.id, es, en });
  }
  return results;
}

if (!model) throw new Error('Define TRANSLATION_MODEL en .env.');
const thinkSetting = (process.env.TRANSLATION_THINK ?? process.env.OLLAMA_THINK)?.trim().toLocaleLowerCase();
const provider = createProvider({
  provider: process.env.TRANSLATION_PROVIDER ?? 'ollama',
  apiKey: process.env.TRANSLATION_API_KEY ?? process.env.OLLAMA_API_KEY,
  apiBase: process.env.TRANSLATION_URL ?? process.env.OLLAMA_URL,
  model,
  timeoutMs: Number(process.env.TRANSLATION_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 600_000),
  think: thinkSetting === 'true' ? true
    : thinkSetting === 'low' || thinkSetting === 'medium' || thinkSetting === 'high' ? thinkSetting
      : false
});
const selectedModel = await resolveModel(provider);

const document = JSON.parse(await readFile(normalizedPath, 'utf8')) as CatalogDocument;
const cache = await readCache();
const pending = document.games.filter((game) => {
  const source = descriptionSource(game);
  if (!source || (!force && game.descriptions.es && game.descriptions.en)) return false;
  const cached = cache.entries[game.id];
  return force || !cached || cached.sourceHash !== descriptionHash(source)
    || !isPlausibleTranslation(source, cached.es) || !isPlausibleTranslation(source, cached.en);
}).slice(0, limit);

console.log(`[translate] ${pending.length} descriptions pending with ${provider.label} (${selectedModel})`);
await mkdir(cacheDir, { recursive: true });
let failed = 0;
for (let index = 0; index < pending.length; index += batchSize) {
  const batch = pending.slice(index, index + batchSize);
  let translations: TranslationResult[] = [];
  try {
    translations = await translateReliable(provider, batch);
  } catch (error) {
    if (batch.length === 1) {
      failed += 1;
      console.warn(`[translate] skipped ${batch[0].id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } else {
      for (const game of batch) {
        try {
          translations.push(...await translateReliable(provider, [game]));
        } catch (gameError) {
          failed += 1;
          console.warn(`[translate] skipped ${game.id}: ${gameError instanceof Error ? gameError.message : 'unknown error'}`);
        }
      }
    }
  }
  for (const translation of translations) {
    const game = batch.find((item) => item.id === translation.id);
    const source = game ? descriptionSource(game) : undefined;
    if (!source) continue;
    const entry: TranslationCacheEntry = {
      sourceHash: descriptionHash(source),
      es: translation.es.trim(),
      en: translation.en.trim(),
      model: selectedModel,
      updatedAt: new Date().toISOString()
    };
    cache.entries[translation.id] = entry;
  }
  await writeAtomic(translationsPath, JSON.stringify(cache));
  console.log(`[translate] ${Math.min(index + batch.length, pending.length)}/${pending.length}`);
}

console.log(`[translate] complete; ${failed} failed; run npm run build to apply the cached translations`);
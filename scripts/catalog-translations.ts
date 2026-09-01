import { createHash } from 'node:crypto';
import type { Game } from '../src/data/schema';

export interface TranslationCacheEntry {
  sourceHash: string;
  es: string;
  en: string;
  model: string;
  updatedAt: string;
}

export interface TranslationCache {
  version: 1;
  entries: Record<string, TranslationCacheEntry>;
}

export interface TranslationResult {
  id: string;
  es: string;
  en: string;
}

export function emptyTranslationCache(): TranslationCache {
  return { version: 1, entries: {} };
}

export function descriptionSource(game: Game): string | undefined {
  return game.description ?? game.descriptions.es ?? game.descriptions.en;
}

export function descriptionHash(description: string): string {
  return createHash('sha256').update(description).digest('hex');
}

export function isPlausibleTranslation(source: string, translation: string): boolean {
  const cleaned = translation.trim();
  const minimumLength = Math.max(4, Math.floor(source.length * 0.4));
  return cleaned.length >= minimumLength && cleaned.length <= source.length * 3;
}

export function splitDescription(source: string, maxLength = 1_800): string[] {
  if (source.length <= maxLength) return [source];
  const sentences = source.split(/(?<=[.!?…])\s+/u);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) chunks.push(current);
      for (let start = 0; start < sentence.length; start += maxLength) chunks.push(sentence.slice(start, start + maxLength));
      current = '';
      continue;
    }
    const combined = current ? `${current} ${sentence}` : sentence;
    if (combined.length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = combined;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export function applyTranslationCache(games: Game[], cache: TranslationCache): Game[] {
  return games.map((game) => {
    const source = descriptionSource(game);
    const cached = cache.entries[game.id];
    if (!source || !cached || cached.sourceHash !== descriptionHash(source)
      || !isPlausibleTranslation(source, cached.es) || !isPlausibleTranslation(source, cached.en)) return game;

    return {
      ...game,
      descriptions: {
        es: game.descriptions.es ?? cached.es,
        en: game.descriptions.en ?? cached.en
      }
    };
  });
}

export function parseTranslationResponse(content: string): TranslationResult[] {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const firstObject = cleaned.indexOf('{');
  const lastObject = cleaned.lastIndexOf('}');
  const objectBlock = firstObject >= 0 && lastObject > firstObject ? cleaned.slice(firstObject, lastObject + 1) : '';
  const candidates = [...new Set([
    cleaned,
    objectBlock,
    cleaned ? `[${cleaned}]` : '',
    objectBlock ? `[${objectBlock}]` : ''
  ].filter(Boolean))];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { translations?: TranslationResult[] } | TranslationResult[];
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.translations)) return parsed.translations;
    } catch {
      // Algunos modelos cloud omiten el objeto raíz y devuelven objetos separados por comas.
    }
  }

  throw new Error('Ollama no devolvió JSON interpretable.');
}

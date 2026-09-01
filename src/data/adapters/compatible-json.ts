import type { CompatibleCatalogEntry, LocalizedDescriptions } from '../schema';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pickString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function pickArray(record: UnknownRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value];
  }
  return [];
}

function pickDescriptions(record: UnknownRecord): LocalizedDescriptions {
  const nested = isRecord(record.descriptions) ? record.descriptions : undefined;
  return {
    es: pickString(record, ['description_es', 'descriptionEs', 'summary_es'])
      ?? (nested ? pickString(nested, ['es', 'es-ES', 'es_ES']) : undefined),
    en: pickString(record, ['description_en', 'descriptionEn', 'summary_en'])
      ?? (nested ? pickString(nested, ['en', 'en-US', 'en_GB', 'en_US']) : undefined)
  };
}

function findEntries(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return [];

  for (const key of ['games', 'items', 'data', 'catalog', 'results']) {
    if (Array.isArray(input[key])) return input[key] as unknown[];
  }

  const values = Object.values(input);
  if (values.length > 0 && values.every(isRecord)) return values;
  return [];
}

export function adaptCompatibleJson(input: unknown): CompatibleCatalogEntry[] {
  return findEntries(input).filter(isRecord).map((record) => ({
    id: pickString(record, ['id', 'game_id', 'slug']),
    title: pickString(record, ['title', 'name', 'game_title']),
    titleId: pickString(record, ['titleId', 'title_id', 'tid']),
    year: pickString(record, ['year', 'release_year']),
    releaseDate: pickString(record, ['releaseDate', 'release_date', 'date']),
    genres: pickArray(record, ['genres', 'genre', 'categories']),
    developer: pickString(record, ['developer', 'studio', 'developed_by']),
    publisher: pickString(record, ['publisher', 'published_by']),
    languages: pickArray(record, ['languages', 'language', 'langs']),
    interfaceLanguages: pickArray(record, ['interfaceLanguages', 'interface_lang', 'interface_language']),
    voiceLanguages: pickArray(record, ['voiceLanguages', 'voice_lang', 'audio_languages']),
    size: pickString(record, ['size', 'file_size', 'size_bytes']),
    cover: pickString(record, ['cover', 'cover_url', 'image', 'icon']),
    screenshots: pickArray(record, ['screenshots', 'images', 'gallery']),
    description: pickString(record, ['description', 'summary', 'about']),
    descriptions: pickDescriptions(record),
    region: pickString(record, ['region', 'regions']),
    version: pickString(record, ['version', 'game_version']),
    contentType: pickString(record, ['contentType', 'content_type', 'type']),
    sourceUrl: pickString(record, ['sourceUrl', 'source_url', 'url']),
    magnet: pickString(record, ['magnet', 'magnet_link', 'magnet_uri'])
  }));
}

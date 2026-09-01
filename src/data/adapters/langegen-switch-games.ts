import { adaptCompatibleJson } from './compatible-json';
import type { CompatibleCatalogEntry } from '../schema';

function cleanReleaseTitle(title?: string): string | undefined {
  if (!title) return undefined;
  let cleaned = title.replace(/(?:\s*\[[^\]]+\])+\s*$/g, '').trim();

  cleaned = cleaned.replace(/\s*\([^()]*[\u0400-\u04ff][^()]*\)/gu, ' ').replace(/\s{2,}/g, ' ').trim();

  const withoutTranslatedSuffix = cleaned.replace(/\s*\/\s*[^/]*[\u0400-\u04ff][^/]*$/u, '').trim();
  if (/[a-z]/i.test(withoutTranslatedSuffix)) cleaned = withoutTranslatedSuffix;

  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > -1) {
    const prefix = cleaned.slice(0, colonIndex);
    const suffix = cleaned.slice(colonIndex + 1).trim();
    if (/[\u0400-\u04ff]/u.test(prefix) && /[a-z]/i.test(suffix)) cleaned = suffix;
  }

  if (/[\u0400-\u04ff]/u.test(cleaned)) return undefined;

  return cleaned || title;
}

const LANGUAGE_PATTERNS: Array<[RegExp, string]> = [
  [/русск|russian|\brus\b/i, 'Ruso'],
  [/англ|english|\beng\b/i, 'Inglés'],
  [/испан|spanish|español|\bspa\b/i, 'Español'],
  [/франц|french|français|\bfra\b/i, 'Francés'],
  [/немец|german|deutsch|\bdeu\b/i, 'Alemán'],
  [/итал|italian|italiano|\bita\b/i, 'Italiano'],
  [/япон|japanese|日本語|\bjpn\b/i, 'Japonés'],
  [/португ|portuguese|português|\bpor\b/i, 'Portugués'],
  [/китай|chinese|中文|\bzho\b/i, 'Chino'],
  [/корей|korean|한국어|\bkor\b/i, 'Coreano'],
  [/голланд|dutch|nederlands/i, 'Neerlandés'],
  [/польск|polish|polski/i, 'Polaco'],
  [/украин|ukrainian|україн/i, 'Ucraniano'],
  [/чешск|czech|čeština/i, 'Checo'],
  [/турец|turkish|türkçe/i, 'Turco'],
  [/араб|arabic|العربية/i, 'Árabe']
];

function extractKnownLanguages(values: unknown[]): string[] {
  const source = values.filter((value): value is string => typeof value === 'string').join(' ');
  const languages = LANGUAGE_PATTERNS.filter(([pattern]) => pattern.test(source)).map(([, language]) => language);
  const multi = source.match(/\bmulti\s*[-:]?\s*(\d+)?\b/i);
  if (multi) languages.push(multi[1] ? `Multi ${multi[1]}` : 'Multi');
  return [...new Set(languages)];
}

/**
 * Adapta únicamente metadatos del catálogo publicado por Langegen/switch-games.
 */
export function adaptLangegenSwitchGames(input: unknown): CompatibleCatalogEntry[] {
  return adaptCompatibleJson(input).map((entry) => ({
    ...entry,
    title: cleanReleaseTitle(entry.title),
    languages: extractKnownLanguages(entry.languages),
    interfaceLanguages: extractKnownLanguages(entry.interfaceLanguages),
    voiceLanguages: extractKnownLanguages(entry.voiceLanguages),
    contentType: entry.contentType || 'base'
  }));
}

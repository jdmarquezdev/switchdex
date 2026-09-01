import type { CompatibleCatalogEntry, ContentType, Game } from './schema';

const LANGUAGE_LABELS: Record<string, string> = {
  es: 'Español', espanol: 'Español', español: 'Español', spanish: 'Español', испанский: 'Español',
  en: 'Inglés', eng: 'Inglés', english: 'Inglés', ingles: 'Inglés', inglés: 'Inglés', английский: 'Inglés',
  fr: 'Francés', fra: 'Francés', fre: 'Francés', french: 'Francés', frances: 'Francés', francés: 'Francés', французский: 'Francés',
  de: 'Alemán', deu: 'Alemán', ger: 'Alemán', german: 'Alemán', aleman: 'Alemán', alemán: 'Alemán', немецкий: 'Alemán',
  it: 'Italiano', ita: 'Italiano', italian: 'Italiano', italiano: 'Italiano', итальянский: 'Italiano',
  ja: 'Japonés', jpn: 'Japonés', japanese: 'Japonés', japones: 'Japonés', japonés: 'Japonés', японский: 'Japonés', 日本語: 'Japonés',
  pt: 'Portugués', por: 'Portugués', portuguese: 'Portugués', portugues: 'Portugués', português: 'Portugués',
  ru: 'Ruso', rus: 'Ruso', russian: 'Ruso', ruso: 'Ruso', русский: 'Ruso',
  zh: 'Chino', zho: 'Chino', chi: 'Chino', chinese: 'Chino', chino: 'Chino', 中文: 'Chino', 简体中文: 'Chino', 繁體中文: 'Chino',
  ko: 'Coreano', kor: 'Coreano', korean: 'Coreano', coreano: 'Coreano', 한국어: 'Coreano',
  nl: 'Neerlandés', dutch: 'Neerlandés', nederlands: 'Neerlandés', neerlandes: 'Neerlandés', neerlandés: 'Neerlandés',
  pl: 'Polaco', polish: 'Polaco', polski: 'Polaco', polaco: 'Polaco',
  uk: 'Ucraniano', ukrainian: 'Ucraniano', ucraniano: 'Ucraniano', українська: 'Ucraniano', український: 'Ucraniano',
  cs: 'Checo', czech: 'Checo', checo: 'Checo', čeština: 'Checo',
  tr: 'Turco', turkish: 'Turco', turco: 'Turco', türkçe: 'Turco',
  ar: 'Árabe', arabic: 'Árabe', arabe: 'Árabe', árabe: 'Árabe', العربية: 'Árabe',
  multi: 'Multi'
};

const EMPTY_LANGUAGE_VALUES = new Set(['нет', 'none', 'n/a', 'no', 'не озвучивается', 'sin voces', 'not voiced']);

export function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const cleaned = String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function flattenValues(values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return [];
    return String(value).split(/[,;|/]+/g);
  });
}

export function normalizeLanguages(values: unknown[]): string[] {
  const normalized = flattenValues(values)
    .map(cleanString)
    .filter((value): value is string => typeof value === 'string' && !EMPTY_LANGUAGE_VALUES.has(value.toLocaleLowerCase('es')))
    .map((value) => {
      const key = value.toLocaleLowerCase('es');
      const multi = key.match(/^multi\s*-?\s*(\d+)?$/i);
      if (multi) return multi[1] ? `Multi ${multi[1]}` : 'Multi';
      return LANGUAGE_LABELS[key] ?? value;
    });
  return [...new Set(normalized)];
}

export function normalizeGenres(values: unknown[]): string[] {
  const normalized = flattenValues(values)
    .map(cleanString)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1));
  return [...new Set(normalized)];
}

export function parseSize(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
  const text = cleanString(value);
  if (!text) return undefined;

  const match = text.replace(',', '.').match(/([\d.]+)\s*(b|bytes?|kb|kib|mb|mib|gb|gib|tb|tib)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  const unit = (match[2] ?? 'b').toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1, byte: 1, bytes: 1,
    kb: 1_000, kib: 1_024,
    mb: 1_000_000, mib: 1_048_576,
    gb: 1_000_000_000, gib: 1_073_741_824,
    tb: 1_000_000_000_000, tib: 1_099_511_627_776
  };
  return Math.round(amount * (multipliers[unit] ?? 1));
}

export function formatSize(bytes?: number): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(bytes < 10_000_000_000 ? 1 : 0)} GB`;
}

export function parseYear(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const match = String(value).match(/(?:19|20)\d{2}/);
  if (!match) return undefined;
  const year = Number(match[0]);
  const maxYear = new Date().getUTCFullYear() + 2;
  return year >= 1970 && year <= maxYear ? year : undefined;
}

const MONTH_STEMS: Array<[string, number]> = [
  ['january', 1], ['ener', 1], ['январ', 1],
  ['february', 2], ['febrer', 2], ['феврал', 2],
  ['march', 3], ['marzo', 3], ['март', 3],
  ['april', 4], ['abril', 4], ['апрел', 4],
  ['may', 5], ['mayo', 5], ['ма', 5],
  ['june', 6], ['junio', 6], ['июн', 6],
  ['july', 7], ['julio', 7], ['июл', 7],
  ['august', 8], ['agosto', 8], ['август', 8],
  ['september', 9], ['septiembre', 9], ['сентябр', 9],
  ['october', 10], ['octubre', 10], ['октябр', 10],
  ['november', 11], ['noviembre', 11], ['ноябр', 11],
  ['december', 12], ['diciembre', 12], ['декабр', 12]
];

const MONTH_PATTERN = '(?:january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|январ[а-яё]*|феврал[а-яё]*|март[а-яё]*|апрел[а-яё]*|ма[йяею]|июн[а-яё]*|июл[а-яё]*|август[а-яё]*|сентябр[а-яё]*|октябр[а-яё]*|ноябр[а-яё]*|декабр[а-яё]*)';

function parseMonth(value: string): number | undefined {
  const normalized = value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MONTH_STEMS.find(([stem]) => normalized.startsWith(stem))?.[1];
}

interface DateCandidate { year: number; month?: number; day?: number; }

function isValidDateCandidate(candidate: DateCandidate): boolean {
  const maxYear = new Date().getUTCFullYear() + 2;
  if (candidate.year < 1970 || candidate.year > maxYear) return false;
  if (candidate.month === undefined) return true;
  if (candidate.month < 1 || candidate.month > 12) return false;
  if (candidate.day === undefined) return true;
  const date = new Date(Date.UTC(candidate.year, candidate.month - 1, candidate.day));
  return date.getUTCFullYear() === candidate.year && date.getUTCMonth() === candidate.month - 1 && date.getUTCDate() === candidate.day;
}

/** Normaliza la fecha de publicación más reciente expresada por la fuente. */
export function parseReleaseDate(value: unknown): string | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  const candidates: DateCandidate[] = [];

  for (const match of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})\b/g)) {
    candidates.push({ year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) });
  }

  const dayFirstPattern = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\s*,?\\s*((?:19|20)\\d{2})\\b`, 'giu');
  for (const match of text.matchAll(dayFirstPattern)) {
    candidates.push({ year: Number(match[3]), month: parseMonth(match[2]), day: Number(match[1]) });
  }

  const yearFirstPattern = new RegExp(`\\b((?:19|20)\\d{2})(?:\\s*,?\\s*(\\d{1,2})?\\s*(${MONTH_PATTERN}))?`, 'giu');
  for (const match of text.matchAll(yearFirstPattern)) {
    candidates.push({ year: Number(match[1]), month: match[3] ? parseMonth(match[3]) : undefined, day: match[2] ? Number(match[2]) : undefined });
  }

  const years = [...new Set(candidates.map((candidate) => candidate.year))];
  if (years.length === 1) {
    const monthPattern = new RegExp(MONTH_PATTERN, 'giu');
    const months = [...text.matchAll(monthPattern)].map((match) => parseMonth(match[0])).filter((month): month is number => month !== undefined);
    if (months.length > 1) candidates.push({ year: years[0], month: Math.max(...months) });
  }

  const validCandidates = candidates.filter(isValidDateCandidate);
  const latest = validCandidates.sort((a, b) => {
    const aValue = a.year * 10_000 + (a.month ?? 0) * 100 + (a.day ?? 0);
    const bValue = b.year * 10_000 + (b.month ?? 0) * 100 + (b.day ?? 0);
    return bValue - aValue;
  })[0];
  if (!latest) return undefined;

  const year = String(latest.year);
  if (latest.month === undefined) return year;
  const month = String(latest.month).padStart(2, '0');
  if (latest.day === undefined) return `${year}-${month}`;
  return `${year}-${month}-${String(latest.day).padStart(2, '0')}`;
}

export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

export function sanitizeTitleId(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  return normalized.length >= 8 && normalized.length <= 32 ? normalized : undefined;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function createGameId(entry: Pick<CompatibleCatalogEntry, 'id' | 'titleId' | 'title' | 'version' | 'contentType'>): string {
  const titleId = sanitizeTitleId(cleanString(entry.titleId));
  if (titleId) return titleId.toLocaleLowerCase();
  const sourceId = cleanString(entry.id)?.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  if (sourceId) return sourceId.slice(0, 80);
  const signature = [entry.title, entry.version, entry.contentType].map((value) => cleanString(value) ?? '').join('|');
  return `game-${stableHash(normalizeForSearch(signature))}`;
}

function safeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Acepta solo enlaces magnet con hash info BitTorrent (xt=urn:btih:…) de la fuente. */
function safeMagnet(value?: string): string | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== 'magnet:') return undefined;
    if (!/^urn:btih:[a-z0-9]{32,40}$/i.test(url.searchParams.get('xt') ?? '')) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Algunas fuentes publican miniaturas de FastPic como si fueran capturas.
 * La ruta grande conserva el mismo recurso sin obligar al navegador a ampliar
 * una miniatura JPEG de unos pocos kilobytes.
 */
export function normalizeImageUrl(value?: string): string | undefined {
  const url = safeUrl(value);
  if (!url) return undefined;

  const parsed = new URL(url, 'https://catalog.invalid');
  if (/^i\d+\.fastpic\.(?:org|ru)$/i.test(parsed.hostname)) {
    parsed.protocol = 'https:';
    if (parsed.pathname.includes('/thumb/')) {
      parsed.pathname = parsed.pathname.replace('/thumb/', '/big/').replace(/\.jpeg$/i, '.jpg');
    }
    return parsed.href;
  }

  return url;
}

function inferContentType(entry: CompatibleCatalogEntry): ContentType {
  const value = normalizeForSearch(`${entry.contentType ?? ''} ${entry.title ?? ''}`);
  if (/\b(update|actualizacion|patch)\b/.test(value)) return 'update';
  if (/\b(dlc|addon|expansion|contenido adicional)\b/.test(value)) return 'dlc';
  if (/\b(homebrew|indie demo)\b/.test(value)) return 'homebrew';
  if (/\b(base|game|juego)\b/.test(value)) return 'base';
  return 'other';
}

export function normalizeEntry(entry: CompatibleCatalogEntry): Game | undefined {
  const title = cleanString(entry.title);
  if (!title) return undefined;

  const titleId = sanitizeTitleId(cleanString(entry.titleId));
  const releaseDate = parseReleaseDate(entry.releaseDate) ?? parseReleaseDate(entry.year);
  const year = parseYear(releaseDate) ?? parseYear(entry.year);
  const genres = normalizeGenres(entry.genres);
  const languages = normalizeLanguages(entry.languages);
  const interfaceLanguages = normalizeLanguages(entry.interfaceLanguages);
  const voiceLanguages = normalizeLanguages(entry.voiceLanguages);
  const allLanguages = [...new Set([...languages, ...interfaceLanguages, ...voiceLanguages])];
  const sizeBytes = parseSize(entry.size);
  const contentType = inferContentType(entry);
  const developer = cleanString(entry.developer);
  const publisher = cleanString(entry.publisher);
  const screenshots = [...new Set(entry.screenshots.map((value) => normalizeImageUrl(cleanString(value))).filter((value): value is string => Boolean(value)))];
  const descriptions = {
    es: cleanString(entry.descriptions.es),
    en: cleanString(entry.descriptions.en)
  };
  const searchText = normalizeForSearch([title, titleId, developer, publisher, ...genres].filter(Boolean).join(' '));

  return {
    id: createGameId(entry),
    title,
    normalizedTitle: normalizeForSearch(title),
    titleId,
    year,
    releaseDate,
    genres,
    developer,
    publisher,
    languages: allLanguages,
    generalLanguages: languages,
    interfaceLanguages,
    voiceLanguages,
    sizeBytes,
    sizeLabel: formatSize(sizeBytes),
    cover: normalizeImageUrl(cleanString(entry.cover)),
    screenshots,
    description: cleanString(entry.description),
    descriptions,
    region: cleanString(entry.region),
    version: cleanString(entry.version),
    contentType,
    sourceUrl: safeUrl(cleanString(entry.sourceUrl)),
    magnet: safeMagnet(entry.magnet),
    searchText
  };
}

export function normalizeCatalog(entries: CompatibleCatalogEntry[]): { games: Game[]; skipped: number } {
  const games: Game[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const entry of entries) {
    const game = normalizeEntry(entry);
    if (!game || seen.has(game.id)) {
      skipped += 1;
      continue;
    }
    seen.add(game.id);
    games.push(game);
  }

  games.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return { games, skipped };
}

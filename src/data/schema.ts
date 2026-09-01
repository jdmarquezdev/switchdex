export type ContentType = 'base' | 'update' | 'dlc' | 'homebrew' | 'other';

export type PageLocale = 'es' | 'en';

export type LocalizedDescriptions = Partial<Record<PageLocale, string>>;

export interface CompatibleCatalogEntry {
  id?: string;
  title?: string;
  titleId?: string;
  year?: string | number;
  releaseDate?: string;
  genres: unknown[];
  developer?: string;
  publisher?: string;
  languages: unknown[];
  interfaceLanguages: unknown[];
  voiceLanguages: unknown[];
  size?: string | number;
  cover?: string;
  screenshots: unknown[];
  description?: string;
  descriptions: LocalizedDescriptions;
  region?: string;
  version?: string;
  contentType?: string;
  sourceUrl?: string;
  magnet?: string;
}

export interface Game {
  id: string;
  title: string;
  normalizedTitle: string;
  titleId?: string;
  year?: number;
  releaseDate?: string;
  genres: string[];
  developer?: string;
  publisher?: string;
  languages: string[];
  /** Idiomas sin categoría explícita en la fuente. */
  generalLanguages: string[];
  interfaceLanguages: string[];
  voiceLanguages: string[];
  sizeBytes?: number;
  sizeLabel?: string;
  cover?: string;
  screenshots: string[];
  description?: string;
  descriptions: LocalizedDescriptions;
  region?: string;
  version?: string;
  contentType: ContentType;
  sourceUrl?: string;
  magnet?: string;
  searchText: string;
}

export interface CatalogDocument {
  updatedAt: string;
  source: 'fixture' | 'remote' | 'cache';
  games: Game[];
  skipped: number;
}

export interface CatalogIndexItem {
  id: string;
  title: string;
  year?: number;
  releaseDate?: string;
  cover?: string;
}

export interface CatalogIndexDocument {
  updatedAt: string;
  games: CatalogIndexItem[];
}

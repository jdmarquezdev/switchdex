import { describe, expect, it } from 'vitest';
import { createGameId, normalizeCatalog, normalizeImageUrl, normalizeLanguages, parseReleaseDate, parseSize, parseYear } from '../src/data/normalize';

describe('parseSize', () => {
  it('convierte unidades decimales y binarias a bytes', () => {
    expect(parseSize('1.5 GB')).toBe(1_500_000_000);
    expect(parseSize('2 MiB')).toBe(2_097_152);
    expect(parseSize(512)).toBe(512);
  });

  it('rechaza valores inválidos', () => {
    expect(parseSize('sin datos')).toBeUndefined();
    expect(parseSize(-1)).toBeUndefined();
  });
});

describe('parseYear', () => {
  it('extrae años de fechas y números', () => {
    expect(parseYear('Publicado: 2024-09-01')).toBe(2024);
    expect(parseYear(2021)).toBe(2021);
  });
});

describe('parseReleaseDate', () => {
  it('normaliza fechas de publicación con meses rusos y fechas completas', () => {
    expect(parseReleaseDate('2026, август')).toBe('2026-08');
    expect(parseReleaseDate('2019, 04 октября')).toBe('2019-10-04');
    expect(parseReleaseDate('18 Мая, 2021')).toBe('2021-05-18');
    expect(parseReleaseDate('08.08.2019')).toBe('2019-08-08');
  });

  it('elige la publicación más reciente en rangos y recopilaciones', () => {
    expect(parseReleaseDate('2017, июль - 2026, март')).toBe('2026-03');
    expect(parseReleaseDate('2020, март — декабрь')).toBe('2020-12');
    expect(parseReleaseDate('2018-2025')).toBe('2025');
    expect(parseReleaseDate('Unknown')).toBeUndefined();
  });
});

describe('normalizeLanguages', () => {
  it('mapea etiquetas conocidas y elimina duplicados', () => {
    expect(normalizeLanguages(['English / Испанский', 'EN'])).toEqual(['Inglés', 'Español']);
  });
});

describe('createGameId', () => {
  it('prioriza Title ID y produce hashes estables', () => {
    expect(createGameId({ title: 'A', titleId: '0100-abcd-0000-0001' })).toBe('0100abcd00000001');
    expect(createGameId({ title: 'Mismo', version: '1' })).toBe(createGameId({ title: 'Mismo', version: '1' }));
  });
});

describe('normalizeImageUrl', () => {
  it('usa la imagen grande cuando FastPic entrega una miniatura', () => {
    expect(normalizeImageUrl('http://i127.fastpic.org/thumb/2026/0701/c3/example.jpeg')).toBe(
      'https://i127.fastpic.org/big/2026/0701/c3/example.jpg'
    );
  });

  it('mantiene intactas las imágenes de otros proveedores', () => {
    expect(normalizeImageUrl('https://example.com/cover.webp')).toBe('https://example.com/cover.webp');
  });
});

describe('normalizeCatalog', () => {
  it('acepta magnets con hash BitTorrent válido y descarta el resto', () => {
    const result = normalizeCatalog([
      {
        id: 'with-magnet', title: 'Con magnet', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {},
        magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Example'
      },
      {
        id: 'bad-magnet', title: 'Magnet inválido', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {},
        magnet: 'magnet:?xt=urn:btih:not-a-valid-hash'
      },
      {
        id: 'http-url', title: 'URL no magnet', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {},
        magnet: 'https://example.com/file.torrent'
      }
    ]);

    expect(result.games[0].magnet).toBe('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Example');
    expect(result.games[1].magnet).toBeUndefined();
    expect(result.games[2].magnet).toBeUndefined();
  });

  it('omite entradas inválidas y IDs duplicados', () => {
    const result = normalizeCatalog([
      { id: 'one', title: 'Juego', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {} },
      { id: 'one', title: 'Duplicado', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {} },
      { id: 'bad', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [], descriptions: {} }
    ]);
    expect(result.games).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it('normaliza las descripciones en español e inglés', () => {
    const result = normalizeCatalog([{
      id: 'localized', title: 'Localized', genres: [], languages: [], interfaceLanguages: [], voiceLanguages: [], screenshots: [],
      descriptions: { es: '  Texto en español.  ', en: ' English text. ' }
    }]);

    expect(result.games[0].descriptions).toEqual({ es: 'Texto en español.', en: 'English text.' });
  });
});

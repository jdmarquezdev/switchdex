import { describe, expect, it } from 'vitest';
import { applyTranslationCache, descriptionHash, emptyTranslationCache, isPlausibleTranslation, parseTranslationResponse, splitDescription } from '../scripts/catalog-translations';
import type { Game } from '../src/data/schema';

function game(description: string): Game {
  return {
    id: 'game', title: 'Game', normalizedTitle: 'game', genres: [], languages: [], generalLanguages: [], interfaceLanguages: [],
    voiceLanguages: [], screenshots: [], description, descriptions: {}, contentType: 'base', searchText: 'game'
  };
}

describe('translation cache', () => {
  it('aplica traducciones cuyo origen no ha cambiado', () => {
    const source = game('Описание');
    const cache = emptyTranslationCache();
    cache.entries.game = {
      sourceHash: descriptionHash('Описание'), es: 'Descripción', en: 'Description', model: 'test', updatedAt: '2026-01-01'
    };

    expect(applyTranslationCache([source], cache)[0].descriptions).toEqual({ es: 'Descripción', en: 'Description' });
  });

  it('ignora traducciones obsoletas y respeta textos aportados por la fuente', () => {
    const source = { ...game('Nuevo texto'), descriptions: { es: 'Texto editorial' } };
    const cache = emptyTranslationCache();
    cache.entries.game = {
      sourceHash: descriptionHash('Texto anterior'), es: 'Antiguo', en: 'Old', model: 'test', updatedAt: '2026-01-01'
    };
    expect(applyTranslationCache([source], cache)[0].descriptions).toEqual({ es: 'Texto editorial' });
  });
});

describe('Ollama response parser', () => {
  it('acepta el contenedor esperado y objetos consecutivos de cloud', () => {
    expect(parseTranslationResponse('{"translations":[{"id":"a","es":"Uno","en":"One"}]}')).toHaveLength(1);
    expect(parseTranslationResponse('{"id":"a","es":"Uno","en":"One"},{"id":"b","es":"Dos","en":"Two"}')).toHaveLength(2);
    expect(parseTranslationResponse('Aquí está:\n```json\n{"translations":[{"id":"a","es":"Uno","en":"One"}]}\n```')).toHaveLength(1);
  });

  it('oculta el contenido cuando la respuesta no es JSON', () => {
    expect(() => parseTranslationResponse('descripción privada muy larga')).toThrow('Ollama no devolvió JSON interpretable.');
  });
});

describe('translation validation', () => {
  it('rechaza marcadores y traducciones claramente truncadas', () => {
    const source = 'О'.repeat(100);
    expect(isPlausibleTranslation(source, '...')).toBe(false);
    expect(isPlausibleTranslation(source, 'A'.repeat(60))).toBe(true);
  });

  it('segmenta descripciones largas sin perder contenido', () => {
    const source = `${'Primera frase. '.repeat(100)}Final.`;
    const chunks = splitDescription(source, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(source.replace(/\s+/g, ' ').trim());
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
  });
});

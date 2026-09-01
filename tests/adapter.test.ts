import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { adaptCompatibleJson } from '../src/data/adapters/compatible-json';
import { adaptLangegenSwitchGames } from '../src/data/adapters/langegen-switch-games';

describe('compatible-json adapter', () => {
  it('adapta wrappers y alias de campos', async () => {
    const fixture = JSON.parse(await readFile('tests/fixtures/catalog.json', 'utf8')) as unknown;
    const entries = adaptCompatibleJson(fixture);
    expect(entries.length).toBeGreaterThan(5);
    expect(entries[1]).toMatchObject({ title: 'Iron Orchard', developer: 'Moss & Motor' });
    expect(entries[1].interfaceLanguages).toEqual(['Русский, Английский, Испанский']);
    expect(entries[0].descriptions).toEqual({
      es: 'Recorre un archipiélago que despierta al caer la noche y devuelve la luz a sus antiguos observatorios.',
      en: 'Travel across an archipelago that awakens at nightfall and restore light to its ancient observatories.'
    });
    expect(entries[1].descriptions.en).toBe('Grow a mechanical farm and design production lines in a valley that changes with every season.');
  });
});

describe('Langegen switch-games adapter', () => {
  it('limpia etiquetas de distribución y conserva el enlace magnet de la fuente', () => {
    const entries = adaptLangegenSwitchGames([{
      title: 'Drakkar Crew [NSZ][RUS/Multi10]',
      interface_lang: 'Русский, Английский [RUS / ENG / Multi 10]',
      voice_lang: 'не озвучивается',
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Drakkar+Crew',
      topic_id: '6890951'
    }]);

    expect(entries[0].title).toBe('Drakkar Crew');
    expect(entries[0].interfaceLanguages).toEqual(['Ruso', 'Inglés', 'Multi 10']);
    expect(entries[0].contentType).toBe('base');
    expect(entries[0].magnet).toBe('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Drakkar+Crew');
  });

  it('retira traducciones cirílicas añadidas a un título latino', () => {
    const entries = adaptLangegenSwitchGames([
      { title: '911 Operator / Диспетчер 911', interface_lang: [], voice_lang: [] },
      { title: 'Moonlighter (Лунный свет)', interface_lang: [], voice_lang: [] },
      { title: 'Искра', interface_lang: [], voice_lang: [] }
    ]);

    expect(entries.map((entry) => entry.title)).toEqual(['911 Operator', 'Moonlighter', undefined]);
  });
});

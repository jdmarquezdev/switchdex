import { describe, expect, it } from 'vitest';
import { createProvider, parseBatchResponse } from '../scripts/translation-providers';

describe('parseBatchResponse', () => {
  it('acepta contenedores, arrays y objetos consecutivos', () => {
    expect(parseBatchResponse('{"translations":[{"id":"a","es":"Uno","en":"One"}]}')).toHaveLength(1);
    expect(parseBatchResponse('{"id":"a","es":"Uno","en":"One"},{"id":"b","es":"Dos","en":"Two"}')).toHaveLength(2);
    expect(parseBatchResponse('```json\n{"translations":[{"id":"a","es":"Uno","en":"One"}]}\n```')).toHaveLength(1);
  });

  it('rechaza respuestas sin JSON', () => {
    expect(() => parseBatchResponse('texto sin estructura')).toThrow();
  });
});

describe('createProvider', () => {
  it('requiere clave para proveedores cloud', () => {
    expect(() => createProvider({ provider: 'openai', model: 'gpt-4o-mini' })).toThrow('openai requiere TRANSLATION_API_KEY');
    expect(() => createProvider({ provider: 'anthropic', model: 'claude-sonnet-4-5' })).toThrow('anthropic requiere TRANSLATION_API_KEY');
    expect(() => createProvider({ provider: 'gemini', model: 'gemini-2.0-flash' })).toThrow('gemini requiere TRANSLATION_API_KEY');
    expect(() => createProvider({ provider: 'glm', model: 'glm-4.7' })).toThrow('glm requiere TRANSLATION_API_KEY');
    expect(() => createProvider({ provider: 'kimi', model: 'kimi-k2' })).toThrow('kimi requiere TRANSLATION_API_KEY');
    expect(() => createProvider({ provider: 'openrouter', model: 'qwen/qwen3' })).toThrow('openrouter requiere TRANSLATION_API_KEY');
  });

  it('permite IA local sin clave y deduce la URL', () => {
    const ollama = createProvider({ provider: 'ollama', model: 'qwen3' });
    expect(ollama.id).toBe('ollama');
    expect(ollama.translateBatch).toBeTypeOf('function');

    const lmstudio = createProvider({ provider: 'lmstudio', model: 'qwen3' });
    expect(lmstudio.id).toBe('lmstudio');
    expect(lmstudio.translateBatch).toBeTypeOf('function');
  });

  it('acepta cualquier proveedor con URL explícita', () => {
    const custom = createProvider({ provider: 'openai', apiKey: 'test', apiBase: 'http://localhost:8080/v1', model: 'mymodel' });
    expect(custom.id).toBe('openai');
  });

  it('omite translateBatch en Anthropic y Gemini', () => {
    const anthropic = createProvider({ provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-5' });
    expect(anthropic.translateBatch).toBeUndefined();
    const gemini = createProvider({ provider: 'gemini', apiKey: 'test', model: 'gemini-2.0-flash' });
    expect(gemini.translateBatch).toBeUndefined();
  });
});
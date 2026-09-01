import type { TranslationResult } from './catalog-translations';

/**
 * Proveedores de traducción soportados.
 *
 * openai-compatible cubre cualquier endpoint /v1/chat/completions:
 * OpenAI, GLM, Kimi, OpenRouter, LM Studio, llama.cpp server, etc.
 */
export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'glm'
  | 'kimi'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio';

interface ProviderConfig {
  apiKey?: string;
  apiBase: string;
  model: string;
  timeoutMs: number;
  think: boolean | 'low' | 'medium' | 'high';
}

export interface Provider {
  id: ProviderId;
  label: string;
  /** Traduce una descripción completa a un idioma y devuelve texto plano. */
  translatePlain(source: string, language: 'European Spanish' | 'English'): Promise<string>;
  /** Traduce un lote con respuesta JSON estructurada; opcional según capacidades. */
  translateBatch?(input: Array<{ id: string; title: string; description: string }>): Promise<TranslationResult[]>;
  /** Lista modelos de la cuenta, si el proveedor lo permite. */
  listModels?(): Promise<string[]>;
}

const SYSTEM_PLAIN = (language: string) =>
  `Translate video game descriptions faithfully into natural ${language}. Preserve every fact, name, paragraph and list. Do not summarize, censor, explain, add labels, or use placeholders.`;

const SYSTEM_LOCALIZER = 'You are a professional video game localizer. Translate every supplied description into natural European Spanish and natural English. Preserve names, formatting, facts, tone, and meaning. Do not summarize, censor, add commentary, or invent information. Return every id exactly once.';

/** Parsea respuestas de lotes: acepta contenedores, arrays y objetos consecutivos. */
export function parseBatchResponse(content: string): TranslationResult[] {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const firstObject = cleaned.indexOf('{');
  const lastObject = cleaned.lastIndexOf('}');
  const objectBlock = firstObject >= 0 && lastObject > firstObject ? cleaned.slice(firstObject, lastObject + 1) : '';
  const candidates = [...new Set([cleaned, objectBlock, cleaned ? `[${cleaned}]` : '', objectBlock ? `[${objectBlock}]` : ''].filter(Boolean))];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { translations?: TranslationResult[] } | TranslationResult[];
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.translations)) return parsed.translations;
    } catch {
      // Algunos modelos devuelven objetos separados por comas sin array raíz.
    }
  }
  throw new Error('La IA no devolvió JSON interpretable.');
}

async function postJson(url: string, headers: Record<string, string>, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json();
}

// --- OpenAI y compatibles (GLM, Kimi, OpenRouter, LM Studio, llama.cpp…) ---

function openAiHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
}

async function openAiPlain(config: ProviderConfig, source: string, language: 'European Spanish' | 'English'): Promise<string> {
  const payload = await postJson(`${config.apiBase}/chat/completions`, openAiHeaders(config), {
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PLAIN(language) },
      { role: 'user', content: `Return only the complete ${language} translation of the text below.\n\n${source}` }
    ]
  }, config.timeoutMs) as { choices?: Array<{ message?: { content?: string } }> };
  const translation = (payload.choices?.[0]?.message?.content ?? '').trim();
  if (!translation) throw new Error('La IA devolvió una respuesta vacía.');
  return translation;
}

async function openAiBatch(config: ProviderConfig, input: Array<{ id: string; title: string; description: string }>): Promise<TranslationResult[]> {
  const payload = await postJson(`${config.apiBase}/chat/completions`, openAiHeaders(config), {
    model: config.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_LOCALIZER },
      {
        role: 'user',
        content: `Translate every item in INPUT. Output exactly one JSON object shaped as {"translations":[{"id":"same id","es":"Spanish translation","en":"English translation"}]}. Use only the keys id, es and en inside each translated item. Do not repeat title or description. Do not use Markdown.\nINPUT:\n${JSON.stringify(input)}`
      }
    ]
  }, config.timeoutMs) as { choices?: Array<{ message?: { content?: string } }> };
  return parseBatchResponse(payload.choices?.[0]?.message?.content ?? '');
}

// --- Anthropic ---

function anthropicHeaders(config: ProviderConfig): Record<string, string> {
  return {
    'x-api-key': config.apiKey ?? '',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };
}

async function anthropicPlain(config: ProviderConfig, source: string, language: 'European Spanish' | 'English'): Promise<string> {
  const payload = await postJson(`${config.apiBase}/messages`, anthropicHeaders(config), {
    model: config.model,
    max_tokens: 4096,
    temperature: 0,
    system: SYSTEM_PLAIN(language),
    messages: [{ role: 'user', content: `Return only the complete ${language} translation of the text below.\n\n${source}` }]
  }, config.timeoutMs) as { content?: Array<{ type: string; text?: string }> };
  const translation = (payload.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('').trim();
  if (!translation) throw new Error('La IA devolvió una respuesta vacía.');
  return translation;
}

// --- Google Gemini ---

function geminiHeaders(config: ProviderConfig): Record<string, string> {
  return { 'x-goog-api-key': config.apiKey ?? '' };
}

async function geminiPlain(config: ProviderConfig, source: string, language: 'European Spanish' | 'English'): Promise<string> {
  const url = `${config.apiBase}/models/${encodeURIComponent(config.model)}:generateContent`;
  const payload = await postJson(url, geminiHeaders(config), {
    systemInstruction: { parts: [{ text: SYSTEM_PLAIN(language) }] },
    contents: [{ role: 'user', parts: [{ text: `Return only the complete ${language} translation of the text below.\n\n${source}` }] }],
    generationConfig: { temperature: 0 }
  }, config.timeoutMs) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const translation = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
  if (!translation) throw new Error('La IA devolvió una respuesta vacía.');
  return translation;
}

// --- Ollama (local o cloud) ---

function ollamaHeaders(config: ProviderConfig): Record<string, string> {
  return config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
}

async function ollamaPlain(config: ProviderConfig, source: string, language: 'European Spanish' | 'English'): Promise<string> {
  const payload = await postJson(`${config.apiBase}/chat`, ollamaHeaders(config), {
    model: config.model,
    stream: false,
    think: config.think,
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: SYSTEM_PLAIN(language) },
      { role: 'user', content: `Return only the complete ${language} translation of the text below.\n\n${source}` }
    ]
  }, config.timeoutMs) as { message?: { content?: string; thinking?: string } };
  const translation = (payload.message?.content?.trim() || payload.message?.thinking?.trim() || '')
    .replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!translation) throw new Error('La IA devolvió una respuesta vacía.');
  return translation;
}

async function ollamaBatch(config: ProviderConfig, input: Array<{ id: string; title: string; description: string }>): Promise<TranslationResult[]> {
  const payload = await postJson(`${config.apiBase}/chat`, ollamaHeaders(config), {
    model: config.model,
    stream: false,
    think: config.think,
    ...(config.apiBase.includes('ollama.com/api') ? {} : { format: 'object' }),
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: SYSTEM_LOCALIZER },
      {
        role: 'user',
        content: `Translate every item in INPUT. Output exactly one JSON object shaped as {"translations":[{"id":"same id","es":"Spanish translation","en":"English translation"}]}. Use only the keys id, es and en inside each translated item. Do not repeat title or description. Do not use Markdown.\nINPUT:\n${JSON.stringify(input)}`
      }
    ]
  }, config.timeoutMs) as { message?: { content?: string } };
  return parseBatchResponse(payload.message?.content ?? '');
}

async function openAiListModels(config: ProviderConfig): Promise<string[]> {
  const response = await fetch(`${config.apiBase}/models`, { headers: openAiHeaders(config), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return (payload.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
}

async function ollamaListModels(config: ProviderConfig): Promise<string[]> {
  const response = await fetch(`${config.apiBase}/tags`, { headers: ollamaHeaders(config), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
  return (payload.models ?? []).flatMap((item) => [item.name, item.model]).filter((name): name is string => Boolean(name));
}

const OPENAI_COMPATIBLE_ENDPOINTS: Partial<Record<ProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  lmstudio: 'http://127.0.0.1:1234/v1'
};

/** Crea el proveedor configurado mediante TRANSLATION_PROVIDER. */
export function createProvider(rawConfig: {
  provider?: string;
  apiKey?: string;
  apiBase?: string;
  model: string;
  timeoutMs?: number;
  think?: boolean | 'low' | 'medium' | 'high';
}): Provider {
  const id = (rawConfig.provider?.trim().toLocaleLowerCase() || 'ollama') as ProviderId;
  const defaults = OPENAI_COMPATIBLE_ENDPOINTS[id];
  const apiBase = (rawConfig.apiBase?.trim() || (id === 'ollama' ? 'http://127.0.0.1:11434/api' : defaults) || '').replace(/\/$/, '');

  if (!apiBase) throw new Error(`No se conoce la URL de ${id}; define TRANSLATION_URL en .env.`);
  if (id !== 'ollama' && id !== 'lmstudio' && !rawConfig.apiKey?.trim()) {
    throw new Error(`${id} requiere TRANSLATION_API_KEY en .env.`);
  }

  const config: ProviderConfig = {
    apiKey: rawConfig.apiKey?.trim(),
    apiBase,
    model: rawConfig.model,
    timeoutMs: rawConfig.timeoutMs ?? 600_000,
    think: rawConfig.think ?? false
  };

  switch (id) {
    case 'ollama':
      return {
        id,
        label: 'Ollama',
        translatePlain: (source, language) => ollamaPlain(config, source, language),
        translateBatch: (input) => ollamaBatch(config, input),
        listModels: () => ollamaListModels(config)
      };
    case 'anthropic':
      return {
        id,
        label: 'Anthropic',
        translatePlain: (source, language) => anthropicPlain(config, source, language)
      };
    case 'gemini':
      return {
        id,
        label: 'Google Gemini',
        translatePlain: (source, language) => geminiPlain(config, source, language)
      };
    case 'lmstudio':
    case 'openrouter':
    case 'kimi':
    case 'glm':
    case 'openai':
      return {
        id,
        label: id === 'lmstudio' ? 'LM Studio' : id === 'kimi' ? 'Kimi (Moonshot)' : id === 'glm' ? 'GLM (Zhipu)' : id === 'openrouter' ? 'OpenRouter' : 'OpenAI',
        translatePlain: (source, language) => openAiPlain(config, source, language),
        translateBatch: (input) => openAiBatch(config, input),
        listModels: () => openAiListModels(config)
      };
  }
}
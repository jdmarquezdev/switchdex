export {};

type Locale = 'es' | 'en';

const copy = {
  es: {
    loading: 'Traduciendo con IA… Puede tardar unos minutos.',
    success: 'Traducción guardada. Las próximas visitas usarán la copia en caché.',
    cached: 'Traducción recuperada de la caché.',
    error: 'No se ha podido traducir ahora. Inténtalo de nuevo más tarde.'
  },
  en: {
    loading: 'Translating with AI… This may take a few minutes.',
    success: 'Translation saved. Future visits will use the cached copy.',
    cached: 'Translation loaded from cache.',
    error: 'The description could not be translated right now. Try again later.'
  }
} as const;

interface TranslationResponse { es: string; en: string; cached: boolean; error?: string; }

const control = document.querySelector<HTMLElement>('[data-translation-control]');
const button = control?.querySelector<HTMLButtonElement>('[data-translation-button]');
const status = control?.querySelector<HTMLElement>('[data-translation-status]');
let state: keyof typeof copy.es | '' = '';

function locale(): Locale {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function setState(next: typeof state): void {
  state = next;
  if (status) status.textContent = next ? copy[locale()][next] : '';
}

function applyTranslation(language: Locale, value: string): void {
  const paragraph = document.querySelector<HTMLElement>(`[data-copy-locale="${language}"]`);
  if (paragraph) paragraph.textContent = value;
}

button?.addEventListener('click', async () => {
  if (!control?.dataset.gameId || !button) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  control.dataset.state = 'loading';
  setState('loading');

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: control.dataset.gameId })
    });
    const result = await response.json() as TranslationResponse;
    if (!response.ok || !result.es || !result.en) throw new Error(result.error || 'translation failed');
    applyTranslation('es', result.es);
    applyTranslation('en', result.en);
    control.dataset.state = 'success';
    button.hidden = true;
    setState(result.cached ? 'cached' : 'success');
  } catch {
    control.dataset.state = 'error';
    button.disabled = false;
    setState('error');
  } finally {
    button.removeAttribute('aria-busy');
  }
});

document.addEventListener('catalog:locale', () => setState(state));

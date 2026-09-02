type Locale = 'es' | 'en';

const messages = {
  es: {
    'skip.content': 'Saltar al contenido',
    'brand.home': 'SwitchDex, inicio',
    'nav.main': 'Navegación principal',
    'nav.catalog': 'Catálogo',
    'nav.about': 'Acerca de',
    'locale.label': 'Idioma',
    'theme.toggle': 'Cambiar tema',
    'footer.catalog': 'catálogo de títulos',
    'footer.private': 'Estático, pequeño y sin rastreo.',
    'footer.disclaimer': 'Proyecto independiente. No afiliado ni respaldado por Nintendo.',
    'hero.eyebrow': 'Colección digital',
    'hero.title': 'Encuentra tu',
    'hero.emphasis': 'próxima historia.',
    'hero.body': 'Una biblioteca rápida y serena para encontrar juegos por su título.',
    'hero.explore': 'Explora',
    'tools.label': 'Buscar y ordenar catálogo',
    'search.label': 'Buscar por título',
    'search.placeholder': 'Busca un título…',
    'sort.label': 'Ordenar',
    'sort.newest': 'Más recientes',
    'sort.titleAsc': 'Título A–Z',
    'sort.titleDesc': 'Título Z–A',
    'sort.oldest': 'Más antiguos',
    'results.kicker': 'Selección completa',
    'results.unit': 'títulos',
    'results.updated': 'Última actualización:',
    'results.singular': 'resultado',
    'results.plural': 'resultados',
    'results.error': 'No se ha podido cargar el índice de búsqueda.',
    'empty.title': 'Nada por aquí',
    'empty.body': 'Prueba con otro título o limpia la búsqueda.',
    'empty.action': 'Ver toda la colección',
    'load.more': 'Cargar más',
    'card.view': 'Ver ficha de',
    'card.cover': 'Portada de',
    'breadcrumb.label': 'Migas de pan',
    'gallery.kicker': 'Galería',
    'gallery.title': 'Momentos del juego',
    'gallery.capture': 'Captura',
    'gallery.of': 'de',
    'detail.descriptionKicker': 'Sinopsis',
    'detail.magnetLabel': 'Enlace magnet',
    'detail.magnetKicker': 'Descarga por magnet',
    'detail.magnetAction': 'Abrir enlace magnet',
    'detail.languagesLabel': 'Idiomas del juego',
    'detail.unspecifiedLanguages': 'Idiomas',
    'detail.textLanguages': 'Texto',
    'detail.voiceLanguages': 'Voces',
    'detail.magnetNote': 'El enlace lo proporciona la fuente del catálogo y requiere un cliente BitTorrent.',
    'detail.translateAction': 'Traducir ahora',
    'detail.back': 'Volver a la colección',
    'about.kicker': 'Acerca del archivo',
    'about.title': 'Una colección que',
    'about.emphasis': 'deja respirar a los juegos.',
    'about.lead': 'SwitchDex es un visor estático de títulos: rápido al abrir, sencillo de mantener y respetuoso con quien lo visita.',
    'about.body1': 'No aloja juegos ni ofrece descargas. La fuente del catálogo la configura cada operador y se procesa durante la construcción del sitio.',
    'about.body2': 'La página final funciona sin base de datos, sin servidor de aplicación y sin analítica de terceros. Solo HTML, CSS y el JavaScript imprescindible para buscar y ordenar.',
    'about.cta': 'Explorar catálogo',
    'notFound.kicker': '404 / Fuera de catálogo',
    'notFound.title': 'Esta historia no está',
    'notFound.emphasis': 'en la estantería.',
    'notFound.cta': 'Volver al catálogo'
  },
  en: {
    'skip.content': 'Skip to content',
    'brand.home': 'SwitchDex, home',
    'nav.main': 'Main navigation',
    'nav.catalog': 'Catalog',
    'nav.about': 'About',
    'locale.label': 'Language',
    'theme.toggle': 'Change theme',
    'footer.catalog': 'title catalog',
    'footer.private': 'Static, lightweight and tracking-free.',
    'footer.disclaimer': 'Independent project. Not affiliated with or endorsed by Nintendo.',
    'hero.eyebrow': 'Digital collection',
    'hero.title': 'Find your',
    'hero.emphasis': 'next story.',
    'hero.body': 'A fast, calm library for finding games by title.',
    'hero.explore': 'Explore',
    'tools.label': 'Search and sort catalog',
    'search.label': 'Search by title',
    'search.placeholder': 'Search for a title…',
    'sort.label': 'Sort',
    'sort.newest': 'Newest first',
    'sort.titleAsc': 'Title A–Z',
    'sort.titleDesc': 'Title Z–A',
    'sort.oldest': 'Oldest first',
    'results.kicker': 'Full selection',
    'results.unit': 'titles',
    'results.updated': 'Last updated:',
    'results.singular': 'result',
    'results.plural': 'results',
    'results.error': 'The search index could not be loaded.',
    'empty.title': 'Nothing here',
    'empty.body': 'Try another title or clear your search.',
    'empty.action': 'View the full collection',
    'load.more': 'Load more',
    'card.view': 'View details for',
    'card.cover': 'Cover for',
    'breadcrumb.label': 'Breadcrumb',
    'gallery.kicker': 'Gallery',
    'gallery.title': 'Game moments',
    'gallery.capture': 'Screenshot',
    'gallery.of': 'of',
    'detail.descriptionKicker': 'Synopsis',
    'detail.magnetLabel': 'Magnet link',
    'detail.magnetKicker': 'Magnet download',
    'detail.magnetAction': 'Open magnet link',
    'detail.languagesLabel': 'Game languages',
    'detail.unspecifiedLanguages': 'Languages',
    'detail.textLanguages': 'Text',
    'detail.voiceLanguages': 'Voices',
    'detail.magnetNote': 'The link is provided by the catalog source and requires a BitTorrent client.',
    'detail.translateAction': 'Translate now',
    'detail.back': 'Back to the collection',
    'about.kicker': 'About the archive',
    'about.title': 'A collection that',
    'about.emphasis': 'lets games breathe.',
    'about.lead': 'SwitchDex is a static title viewer: quick to open, easy to maintain and respectful of its visitors.',
    'about.body1': 'It does not host games or offer downloads. Each operator configures the catalog source, which is processed while the site is built.',
    'about.body2': 'The final site runs without a database, application server or third-party analytics. Just HTML, CSS and the minimum JavaScript needed to search and sort.',
    'about.cta': 'Explore catalog',
    'notFound.kicker': '404 / Not in catalog',
    'notFound.title': 'This story is not',
    'notFound.emphasis': 'on the shelf.',
    'notFound.cta': 'Back to catalog'
  }
} as const;

type MessageKey = keyof typeof messages.es;

function currentLocale(): Locale {
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}

function translate(locale: Locale, key: string): string | undefined {
  return messages[locale][key as MessageKey];
}

function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const value = translate(locale, element.dataset.i18n || '');
    if (value) element.textContent = value;
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((element) => {
    const value = translate(locale, element.dataset.i18nPlaceholder || '');
    if (value) element.placeholder = value;
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((element) => {
    const value = translate(locale, element.dataset.i18nAria || '');
    if (value) element.setAttribute('aria-label', value);
  });
  document.querySelectorAll<HTMLElement>('[data-game-link]').forEach((element) => {
    element.setAttribute('aria-label', `${messages[locale]['card.view']} ${element.dataset.gameTitle || ''}`);
  });
  document.querySelectorAll<HTMLImageElement>('[data-game-cover]').forEach((element) => {
    element.alt = `${messages[locale]['card.cover']} ${element.dataset.gameTitle || ''}`;
  });
  document.querySelectorAll<HTMLImageElement>('[data-game-screenshot]').forEach((element) => {
    element.alt = `${messages[locale]['gallery.capture']} ${element.dataset.screenshotIndex || ''} ${messages[locale]['gallery.of']} ${element.dataset.gameTitle || ''}`;
  });

  const selector = document.querySelector<HTMLSelectElement>('[data-locale-select]');
  if (selector) selector.value = locale;
  try { localStorage.setItem('catalog-locale', locale); } catch { /* storage can be disabled */ }
  document.dispatchEvent(new CustomEvent('catalog:locale', { detail: { locale } }));
}

document.querySelector<HTMLSelectElement>('[data-locale-select]')?.addEventListener('change', (event) => {
  applyLocale((event.currentTarget as HTMLSelectElement).value === 'en' ? 'en' : 'es');
});

applyLocale(currentLocale());

import type { CatalogIndexDocument, CatalogIndexItem } from '../data/schema';
type Locale = 'es' | 'en';

const grid = document.querySelector<HTMLElement>('[data-game-grid]');
const template = document.querySelector<HTMLTemplateElement>('[data-game-card-template]');
const search = document.querySelector<HTMLInputElement>('[data-search]');
const sort = document.querySelector<HTMLSelectElement>('[data-sort]');
const count = document.querySelector<HTMLElement>('[data-results-count]');
const live = document.querySelector<HTMLElement>('[data-results-live]');
const empty = document.querySelector<HTMLElement>('[data-empty-state]');
const loadMore = document.querySelector<HTMLButtonElement>('[data-load-more]');
const loadMoreWrap = document.querySelector<HTMLElement>('[data-load-more-wrap]');

let games: CatalogIndexItem[] = [];
let matchedGames: CatalogIndexItem[] = [];
let visibleLimit = 24;
let isAppending = false;

const PAGE_SIZE = 24;

const copy = {
  es: { view: 'Ver ficha de', cover: 'Portada de', result: 'resultado', results: 'resultados', error: 'No se ha podido cargar el índice de búsqueda.' },
  en: { view: 'View details for', cover: 'Cover for', result: 'result', results: 'results', error: 'The search index could not be loaded.' }
} as const;

const locale = (): Locale => document.documentElement.lang === 'en' ? 'en' : 'es';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

function matches(game: CatalogIndexItem, query: string): boolean {
  return !query || normalize(game.title).includes(query);
}

function sortGames(items: CatalogIndexItem[], mode: string): CatalogIndexItem[] {
  return [...items].sort((a, b) => {
    if (mode === 'title-desc') return b.title.localeCompare(a.title, locale());
    if (mode === 'newest') return String(b.releaseDate ?? b.year ?? '').localeCompare(String(a.releaseDate ?? a.year ?? ''));
    if (mode === 'oldest') return String(a.releaseDate ?? a.year ?? '').localeCompare(String(b.releaseDate ?? b.year ?? ''));
    return a.title.localeCompare(b.title, locale());
  });
}

function createCard(game: CatalogIndexItem, index: number): HTMLElement | undefined {
  const fragment = template?.content.cloneNode(true) as DocumentFragment | undefined;
  const card = fragment?.querySelector<HTMLElement>('.game-card');
  if (!card) return undefined;

  const gameUrl = `/game/${encodeURIComponent(game.id)}/`;
  const coverLink = card.querySelector<HTMLAnchorElement>('[data-card-cover-link]');
  const titleLink = card.querySelector<HTMLAnchorElement>('[data-card-title-link]');
  const cover = card.querySelector<HTMLImageElement>('[data-card-cover]');
  const text = copy[locale()];

  card.style.setProperty('--card-index', String(Math.min(index, 9)));
  if (coverLink) {
    coverLink.href = gameUrl;
    coverLink.ariaLabel = `${text.view} ${game.title}`;
    coverLink.dataset.gameLink = '';
    coverLink.dataset.gameTitle = game.title;
  }
  if (titleLink) { titleLink.href = gameUrl; titleLink.textContent = game.title; }
  if (cover) {
    cover.src = game.cover || '/images/cover-placeholder.svg';
    cover.alt = `${text.cover} ${game.title}`;
    cover.dataset.gameCover = '';
    cover.dataset.gameTitle = game.title;
    cover.addEventListener('error', () => { cover.src = '/images/cover-placeholder.svg'; }, { once: true });
  }
  const number = card.querySelector<HTMLElement>('[data-card-number]');
  if (number) number.textContent = String(index + 1).padStart(2, '0');
  return card;
}

function syncUrl(query: string, sortMode: string): void {
  const params = new URLSearchParams();
  if (query) params.set('q', search?.value.trim() || '');
  if (sortMode !== 'newest') params.set('sort', sortMode);
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
}

function updateResults(): void {
  const text = copy[locale()];
  if (count) count.textContent = String(matchedGames.length);
  if (live) live.textContent = `${matchedGames.length} ${matchedGames.length === 1 ? text.result : text.results}`;
  if (empty) empty.hidden = matchedGames.length !== 0;
  if (loadMoreWrap) loadMoreWrap.hidden = matchedGames.length <= visibleLimit;
}

function appendNextPage(): void {
  if (!grid || isAppending || visibleLimit >= matchedGames.length) return;

  isAppending = true;
  loadMoreWrap?.setAttribute('aria-busy', 'true');
  const nextLimit = Math.min(visibleLimit + PAGE_SIZE, matchedGames.length);
  const fragment = document.createDocumentFragment();
  matchedGames.slice(visibleLimit, nextLimit).forEach((game, offset) => {
    const card = createCard(game, visibleLimit + offset);
    if (card) fragment.append(card);
  });
  grid.append(fragment);
  visibleLimit = nextLimit;
  updateResults();
  loadMoreWrap?.removeAttribute('aria-busy');
  isAppending = false;
}

function render(resetLimit = false): void {
  if (!grid) return;
  if (resetLimit) visibleLimit = PAGE_SIZE;
  const query = normalize(search?.value || '');
  const sortMode = sort?.value || 'newest';
  matchedGames = sortGames(games.filter((game) => matches(game, query)), sortMode);
  const fragment = document.createDocumentFragment();
  matchedGames.slice(0, visibleLimit).forEach((game, index) => {
    const card = createCard(game, index);
    if (card) fragment.append(card);
  });
  grid.replaceChildren(fragment);

  updateResults();
  syncUrl(query, sortMode);
}

function clearSearch(): void {
  if (search) search.value = '';
  if (sort) sort.value = 'newest';
  render(true);
}

function enableInfiniteScroll(): void {
  if (!loadMoreWrap || !('IntersectionObserver' in window)) return;

  const loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) appendNextPage();
  }, { rootMargin: '800px 0px', threshold: 0 });
  loadMoreObserver.observe(loadMoreWrap);
}

const params = new URLSearchParams(location.search);
if (search) search.value = params.get('q') || '';
if (sort) sort.value = params.get('sort') || 'newest';

search?.addEventListener('input', () => render(true));
sort?.addEventListener('change', () => render(true));
loadMore?.addEventListener('click', appendNextPage);
document.querySelectorAll('[data-clear-search]').forEach((button) => button.addEventListener('click', clearSearch));
document.addEventListener('catalog:locale', () => render());
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); search?.focus(); }
  if (event.key === 'Escape' && search && document.activeElement === search) { search.value = ''; search.blur(); render(true); }
});

fetch('/api/catalog')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<CatalogIndexDocument>;
  })
  .then((catalog) => {
    games = catalog.games;
    render(true);
    enableInfiniteScroll();
  })
  .catch(() => { if (live) live.textContent = copy[locale()].error; });

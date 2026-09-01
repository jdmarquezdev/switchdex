import type { APIRoute } from 'astro';
import { proxyCatalogApi } from '../../../data/catalog-api-proxy';

export const GET: APIRoute = (context) => proxyCatalogApi(context, `/api/game/${encodeURIComponent(context.params.id || '')}`);

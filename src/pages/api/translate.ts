import type { APIRoute } from 'astro';
import { proxyCatalogApi } from '../../data/catalog-api-proxy';

export const POST: APIRoute = (context) => proxyCatalogApi(context, '/api/translate');

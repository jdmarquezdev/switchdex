import type { APIContext } from 'astro';

const apiBase = () => (process.env.CATALOG_API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

export async function proxyCatalogApi(context: APIContext, pathname: string): Promise<Response> {
  const headers = new Headers({ accept: 'application/json' });
  const contentType = context.request.headers.get('content-type');
  const origin = context.request.headers.get('origin');
  const host = context.request.headers.get('host');
  if (contentType) headers.set('content-type', contentType);
  if (origin) headers.set('origin', origin);
  if (host) headers.set('x-forwarded-host', host);

  try {
    const method = context.request.method;
    const response = await fetch(`${apiBase()}${pathname}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await context.request.arrayBuffer()
    });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'cache-control', 'x-content-type-options']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'El servicio de catálogo no está disponible.' }, { status: 502 });
  }
}

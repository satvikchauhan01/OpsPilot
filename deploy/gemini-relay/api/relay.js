// Passes the server's Gemini requests on from a region Gemini serves. Gemini refuses some
// locations outright ("User location is not supported"), Hong Kong among them, so a VM there
// can't call it directly. vercel.json pins this function to the US.
//
// The Gemini key travels with every request, so the relay stores none. Its token only keeps
// everyone else from using it.

const GEMINI = 'https://generativelanguage.googleapis.com';
const FORWARDED_HEADERS = ['content-type', 'x-goog-api-key'];

export function GET(request) {
  return relay(request);
}

export function POST(request) {
  return relay(request);
}

async function relay(request) {
  const token = process.env.RELAY_TOKEN;
  if (!token || request.headers.get('x-relay-token') !== token) {
    return Response.json({ error: 'unknown caller' }, { status: 401 });
  }

  // vercel.json rewrites /v1beta/models/... to /api/relay?path=v1beta/models/...
  const url = new URL(request.url);
  const target = new URL(GEMINI);
  target.pathname = `/${url.searchParams.get('path') ?? ''}`;
  url.searchParams.delete('path');
  target.search = url.search;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
  });
  return new Response(response.body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}

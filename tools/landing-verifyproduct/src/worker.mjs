// Interim landing for verifyproduct.app while the Verify Platform is being built.
// Every /v/<code> request serves the same static page; the page redacts the code client-side.
// Nothing is stored or logged here. When web-verify ships, this Worker is replaced by the real app.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers);
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('Cache-Control', url.pathname.startsWith('/v/') ? 'no-store' : 'public, max-age=300');
    h.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    return new Response(res.body, { status: res.status, headers: h });
  },
};

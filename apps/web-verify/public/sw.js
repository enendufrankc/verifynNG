// Minimal shell/font cache — never intercepts /v/** or /api/**, or any
// non-GET request, so a verdict can never be served stale or offline
// (T10). Registered by components/shell/ServiceWorkerRegistration.tsx.
const CACHE_NAME = 'verify-shell-v1';
const SHELL_PATHS = ['/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/v/') || url.pathname.startsWith('/api/')) {
    return;
  }

  const isShellAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(woff2?|ttf|otf)$/.test(url.pathname);
  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }),
  );
});

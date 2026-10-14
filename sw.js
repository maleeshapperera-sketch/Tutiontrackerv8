// ══════════════════════════════════════════════════════════
// TUITION TRACKER — SERVICE WORKER v3
// Deployed at: /Tutiontrackerv7/
// ══════════════════════════════════════════════════════════

const CACHE_NAME = 'tuition-tracker-v7';

const SHELL_FILES = [
  '/Tutiontrackerv7/',
  '/Tutiontrackerv7/index.html',
  '/Tutiontrackerv7/manifest.json',
  '/Tutiontrackerv7/sw.js',
  '/Tutiontrackerv7/icon-192.png',
  '/Tutiontrackerv7/icon-512.png',
  '/Tutiontrackerv7/icon-maskable-512.png',
];

const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r125/three.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap',
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Shell files are critical — log but don't fail
      for (const url of SHELL_FILES) {
        try { await cache.add(url); }
        catch(e) { console.warn('[SW] Could not cache:', url, e.message); }
      }
      // CDN files are best-effort
      for (const url of CDN_FILES) {
        try { await cache.add(url); }
        catch(e) { console.warn('[SW] CDN cache miss (OK offline):', url); }
      }
      console.log('[SW] Cache populated');
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;
  // Skip browser extensions
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;
  // Skip non-http
  if (!url.protocol.startsWith('http')) return;

  // Strategy: Cache-first for our app shell and CDN assets
  // Network-first for Google Fonts (they manage their own caching)
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isCDN  = CDN_FILES.some(f => req.url.startsWith(f.split('?')[0]));
  const isShell = url.hostname === self.location.hostname &&
                  url.pathname.startsWith('/Tutiontrackerv7/');

  // Navigations (the HTML page itself): NETWORK-FIRST.
  // Cache-first here is what makes a broken/old cached page 'stick' forever.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/Tutiontrackerv7/') {
    event.respondWith(
      // cache:'no-cache' makes the browser re-check GitHub Pages instead of
      // reusing its own HTTP-cached copy of the page (kept up to 10 min)
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() =>
        caches.match(req).then(c => c || caches.match('/Tutiontrackerv7/index.html'))
      )
    );
    return;
  }

  if (isShell || isCDN) {
    // Cache-first: serve from cache, fall back to network, update cache
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) {
          // Update cache in background
          fetch(req).then(resp => {
            if (resp && resp.ok) {
              caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        // Not in cache — fetch and cache it
        return fetch(req).then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone));
          }
          return resp;
        }).catch(() => {
          // Truly offline and not cached
          if (isShell) {
            return caches.match('/Tutiontrackerv7/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // For fonts: network-first, fall back to cache
  if (isFont) {
    event.respondWith(
      fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
  }
});

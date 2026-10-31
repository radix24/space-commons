// Space Commons service worker: keeps the app and its catalogs for offline use.
// App files: cache first, refreshed in the background. Live data (satellites, Wikipedia, sky images): network first, cache as fallback.
const CACHE = 'space-commons-v97';
const SHELL = ['./', 'index.html', 'version.js', 'style.css', 'app.js', 'i18n.js', 'craft.js', 'moon.js', 'bodyinfo.js', 'bodyinfo-en.js', 'sizes.js', 'labs2.js', 'atmos.js', 'quiz2.js', 'history.js', 'cards-en.js', 'data/smallbodies.json', 'orbits.js', 'sandbox.js', 'cards.js', 'content.js', 'content-missions.js', 'manifest.webmanifest', 'assets/sc-mark.svg', 'assets/favicon.svg',
  'assets/icon-192.png', 'data/probes.json', 'data/exoplanets.json', 'data/flybys.json', 'data/orbiters.json', 'data/korea.tle', 'data/asteroids.json', 'data/korean-constellations.json'];
const LIVE = /celestrak\.org|wikipedia\.org|alasky|hips2fits|gibs\.earthdata|swpc\.noaa|open-meteo|ssd-api\.jpl/; // network first, last copy when offline
// survey tiles and other third-party images: cache first (they never change), so places you have looked at stay sharp offline

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'space-commons-pack').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  if (LIVE.test(req.url)) {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // our own files: newest first so an update shows on the next load; the cache only covers being offline
  const own = new URL(req.url).origin === location.origin;
  if (own) { e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); } return r; }).catch(() => caches.match(req))); return; }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(req, c)); } return r; })));
});

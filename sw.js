/* Dice Tracker's service worker: lets the app OPEN with no signal.
   (Saving with no signal is a separate job, done by the outbox in js/store.js.)

   - The app's own files: network first, so a new upload shows up on the next
     load. With no answer in 3 seconds, or no signal at all, the copy saved on
     the phone is used instead.
   - Fonts and the pinned Supabase library: the saved copy first. Those exact
     URLs never change, so there's no reason to download them twice.
   - The database itself (*.supabase.co) is never touched here. Live data must
     never come from a stale copy.

   Bump CACHE only when this file's logic changes; app files refresh on their own. */
const CACHE = 'dt-shell-v1';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/config.js', 'js/logic.js', 'js/store.js', 'js/views.js', 'js/app.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dt-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/\.supabase\.(co|in)$/.test(url.hostname)) return;                  // live data: always the network
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  } else if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(networkFirst(req));
  }
});

function keep(key, res) {
  if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
  return res;
}

function cacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res)));
}

function networkFirst(req) {
  // every page load (any ?join=… link included) is saved and served as the one app page
  const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : req;
  const saved = () => caches.match(key).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined));
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const slow = setTimeout(() => saved().then(finish), 3000);           // weak signal: don't make people wait
    fetch(req).then((res) => {
      clearTimeout(slow);
      keep(key, res);
      finish(res);
    }, () => {
      clearTimeout(slow);
      saved().then((hit) => { finish(hit); if (!done) { done = true; resolve(Response.error()); } });
    });
  });
}

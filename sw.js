// Coach service worker: caches the app shell only. Backend data is never cached here.
const CACHE = 'coach-shell-v122';
const SHELL = ['./', 'index.html', 'app.js?v=122', 'parse.js?v=122', 'exlist.js?v=122', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // backend calls go straight to network
  // Network first so updates show up; cache fallback when offline.
  e.respondWith(
    fetch(e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' })).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('./')))
  );
});

// Tap a rest notification: focus the open app or open it.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});

// v86: rest alerts held by the service worker so they fire with the page in the background or the screen off.
// Chrome keeps a worker alive while an event's waitUntil promise is pending (up to about 5 minutes), which covers normal rests.
let restKey = null;
const waitUntilTime = ts => new Promise(r => setTimeout(r, Math.max(0, ts - Date.now())));
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'restCancel') { restKey = null; return; }
  if (d.type !== 'rest') return;
  restKey = d.key; const k = d.key;
  const show = (title, opt) => restKey === k ? self.registration.showNotification(title, opt).catch(() => {}) : null;
  const jobs = [];
  if (d.warnAt - Date.now() > 1000) jobs.push(waitUntilTime(d.warnAt).then(() => show(d.warnTitle, d.warn)));
  jobs.push(waitUntilTime(d.endAt).then(() => show(d.overTitle, d.over)));
  e.waitUntil(Promise.all(jobs));
});

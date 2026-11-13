// App shell: network first so a new deploy shows up right away, cache as the offline fallback.
// Scoped to /english/, so it never touches the planner's cache or pages.
const CACHE = 'eng-v10';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/state.js', 'js/data.js', 'js/ui.js', 'js/speech.js', 'js/quiz.js',
  'js/views/home.js', 'js/views/words.js', 'js/views/chapter.js', 'js/views/speak.js', 'js/views/wrong.js', 'js/views/chat.js', 'js/views/test.js', 'js/remind.js',
  'data/words-beginner.json', 'data/idioms-beginner.json', 'data/speaking.json'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('eng-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

// Daily study reminder (supabase/functions/eng-reminders).
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || "4WON'S ENGLISH", {
    body: data.body || '오늘의 영어 공부를 시작해 보세요.',
    icon: 'icons/icon-192.png',
    tag: data.tag || 'eng-daily',
    data: { url: data.url || './#home' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './#home', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then(c => (c.navigate ? c.navigate(target) : c));
    return self.clients.openWindow(target);
  }));
});

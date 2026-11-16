// 한 번 열어 두면 인터넷 없이도 열리게 파일을 저장해 두는 도우미입니다.
// 글꼴 파일(fonts 폴더, 크기가 커요)은 처음 쓸 때 저장됩니다.
const CACHE = 'noteprint-v22';
const FILES = ['./', 'index.html', 'style.css', 'core.js', 'pdf.js', 'app.js', 'lib/pdf-lib.min.js', 'lib/fontkit.umd.min.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 인터넷이 되면 최신 파일을 먼저 가져오고, 안 되면 저장해 둔 것을 씁니다.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});

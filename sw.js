const CACHE_NAME = 'sj-labs-v55'; // 🌟 नवीन बदल केल्यावर हा नंबर वाढवा (v55, v56 ...)
const urlsToCache = ['./', './index.html', './style.css', './script.js', './manifest.json'];

// बाहेरच्या libraries - एकदा लोड झाल्यावर फोनमध्ये सेव्ह राहतात (offline साठी)
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    // आपल्या फाईल्स: नेहमी ताज्या (HTTP cache टाळून)
    await cache.addAll(urlsToCache.map((u) => new Request(u, { cache: 'reload' })));
    // बाहेरच्या libraries: एखादी मिळाली नाही तरी install फेल होऊ नये
    await Promise.all(CDN_URLS.map((u) =>
      fetch(new Request(u, { mode: 'no-cors' })).then((r) => cache.put(u, r)).catch(() => {})
    ));
  }));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// आधी फोनची कॅशे, मागे इंटरनेटवरून नवीन आवृत्ती सेव्ह. Supabase चे API कधीच कॅशे होत नाहीत.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return network.then((res) => res || Response.error());
    })
  );
});

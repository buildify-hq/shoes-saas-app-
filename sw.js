const CACHE_NAME = 'sj-labs-v39'; // 🌟 इथे नंबर वाढवा (v30, v31 असं)
const urlsToCache = ['./', './index.html', './style.css', './script.js', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// 🌟 नवीन पद्धत: आधी कॅशे (फोनची मेमरी) बघा, नंतर इंटरनेट बघा
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // बॅकग्राउंडला नवीन फाईल आली आहे का ते चेक करा आणि सेव्ह करा
        fetch(req).then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
        }).catch(() => {});
        return cachedResponse; // जुनं असलं तरी लगेच दाखवा
      }
      // जर कॅशे मध्ये नसेल तर इंटरनेट वरून आणा
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});

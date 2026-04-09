const CACHE_VERSION = 'ai-model-v1';
const MODEL_FILES   = [
    './model/model.json',
    './model/group1-shard1of1.bin',

];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(MODEL_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = event.request.url;
    const isModel = MODEL_FILES.some(f => url.includes(f.replace('./', '/')));
    if (!isModel) return;

    event.respondWith(
        caches.open(CACHE_VERSION).then(async cache => {
            const hit = await cache.match(event.request);
            if (hit) return hit;
            const res = await fetch(event.request);
            if (res.ok) cache.put(event.request, res.clone());
            return res;
        })
    );
});

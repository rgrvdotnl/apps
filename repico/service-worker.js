const CACHE_NAME = 'regine-pico-v6';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './unitinfo.js',
    './vendor/pad-knob.js',
    './vendor/piano-keyboard.js',
    './manifest.json',
    './favicon.svg',
    './favicon-96x96.png',
    './apple-touch-icon.png',
    './icon-192x192.png',
    './icon-512x512.png',
    './vendor/logue.js',
    './vendor/webmidi.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                ASSETS.map((url) => cache.add(url).catch(() => {}))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.map((name) => name !== CACHE_NAME ? caches.delete(name) : null)
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                fetch(event.request).then((network) => {
                    if (network && network.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, network.clone());
                        });
                    }
                }).catch(() => {});
                return cached;
            }

            return fetch(event.request).then((network) => {
                if (network && network.status === 200) {
                    const copy = network.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, copy);
                    });
                }
                return network;
            }).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({ 'Content-Type': 'text/plain' })
                });
            });
        })
    );
});

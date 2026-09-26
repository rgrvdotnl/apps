/* One cache per build, stamped by CMake the same way the page's stamp is.
 *
 * It was the constant 'ambiancefx-v1', which meant the activate handler below
 * -- whose whole job is to delete caches that are not the current one -- never
 * had anything to delete, because the name never changed. Anything the install
 * handler had cached stayed cached across every rebuild, permanently. Naming
 * the cache after the build makes the purge automatic: a new build has a new
 * name, the old cache is deleted on activate, and nothing stale survives a
 * reload. */
const CACHE_NAME = 'ambiancefx-aaaefe7 2026-09-26 12:42Z';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './ambiancefx.js',
    './ambiancefx.wasm',
    './manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Caching AmbianceFX assets');
            return Promise.allSettled(
                ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('[ServiceWorker] Failed to cache:', url, err.message);
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

/* Fetch event.
 *
 * The shell -- the document, the stylesheet, the icons -- is cache first, which
 * is what a PWA wants: instant start, and it still opens with no network.
 *
 * The engine is the opposite, and this is a fix rather than a preference.
 * `ambiancefx.js` and `ambiancefx.wasm` are the two files a rebuild rewrites,
 * and serving them cache first meant a rebuild reached the browser *one load
 * late*: the reload that followed a build got the previous wasm out of the
 * cache and refreshed the cache behind it in the background, so the new engine
 * only appeared on the reload after that. When the whole loop is "rebuild,
 * reload, listen", that turns every iteration into listening to the build
 * before last -- and a change that has not arrived yet sounds exactly like a
 * change that did not work.
 *
 * Network first, falling back to the cache when the network is gone, so the
 * offline behaviour is unchanged and a reload after a build is always the
 * build. */
const ENGINE = ['./ambiancefx.js', './ambiancefx.wasm'];

function is_engine(request) {
    if (request.destination === 'script') return true;
    const url = new URL(request.url);
    return ENGINE.some((p) => url.pathname.endsWith(p.slice(1)));
}

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    if (is_engine(event.request)) {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                console.log('[ServiceWorker] Serving from cache:', event.request.url);
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
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

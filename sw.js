/**
 * Service worker: guarda el «esqueleto» de la app para que funcione sin señal.
 *
 * Estrategia: primero la caché para los archivos propios (arranque instantáneo),
 * y en segundo plano se busca una versión nueva para la próxima vez.
 * Los datos del usuario no pasan por acá: viven en localStorage.
 */

const CACHE_NAME = 'alana-meds-v5';

/** El SDK de Firebase vive en este host; se guarda en caché al usarlo. */
const SDK_HOST = 'www.gstatic.com';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/styles.css',
    './js/app.js',
    './js/firebase.js',
    './js/auth.js',
    './js/store.js',
    './js/seed.js',
    './js/schedule.js',
    './js/format.js',
    './js/ui.js',
    './js/views/today.js',
    './js/views/treatments.js',
    './js/views/glucose.js',
    './js/views/history.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
            .catch(error => console.warn('No se pudo precargar la caché:', error))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Solo se atienden los archivos propios y el SDK de Firebase. El tráfico de
    // datos hacia firestore.googleapis.com debe pasar sin tocarse: el SDK tiene
    // su propia caché offline y una intromisión acá rompería la sincronización.
    const isOwn = url.origin === self.location.origin;
    const isSdk = url.hostname === SDK_HOST && url.pathname.includes('/firebasejs/');
    if (!isOwn && !isSdk) return;

    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request)
                .then(response => {
                    const cacheable = response && response.status === 200 &&
                        (response.type === 'basic' || response.type === 'cors');
                    if (cacheable) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || network;
        })
    );
});

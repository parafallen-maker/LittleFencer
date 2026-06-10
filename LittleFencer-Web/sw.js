// Service Worker for LittleFencer PWA
//
// Versioning: bump VERSION only when ASSETS_TO_CACHE entries are
// added/removed (it triggers a full re-precache). Routine file edits do
// NOT need a bump — same-origin requests use stale-while-revalidate, so
// updated files are fetched in the background and served on next load.
const VERSION = 9;
const CACHE_NAME = `littlefencer-v${VERSION}`;
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/training.html',
    '/standards.html',
    '/annotator.html',
    '/css/style.css',
    '/css/training.css',
    '/css/standards.css',
    '/css/annotator.css',
    '/js/app.js',
    '/js/training-mode.js',
    '/js/camera.js',
    '/js/pose.js',
    '/js/engine.js',
    '/js/feedback.js',
    '/js/recorder.js',
    '/js/ui.js',
    '/js/skeleton.js',
    '/js/utils.js',
    '/js/config.js',
    '/js/platform.js',
    '/js/storage.js',
    '/js/filters.js',
    '/js/dtw.js',
    '/js/keyframeDetector.js',
    '/js/templateRecorder.js',
    '/js/annotator.js',
    '/js/detectors/index.js',
    '/manifest.json',
    '/assets/icons/ic_launcher.png',
    '/assets/icons/ic_launcher_round.png',
    '/assets/icons/ic_launcher_foreground.png',
    '/assets/images/badge_combo_5.webp',
    '/assets/images/badge_combo_10.webp',
    '/assets/images/badge_first_rep.webp',
    '/assets/images/badge_perfect_10.webp',
    '/assets/images/empty_gallery.webp',
    '/assets/images/onboard_1_setup.webp',
    '/assets/images/onboard_2_engarde.webp',
    '/assets/images/onboard_3_lunge.webp'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== 'mediapipe-cache')
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Stale-while-revalidate: serve cache immediately (offline-first feel),
// refresh from network in the background so the next load is up to date.
function staleWhileRevalidate(event, cacheName) {
    return caches.open(cacheName).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse); // Offline: fall back to cache

            return cachedResponse || fetchPromise;
        });
    });
}

// Fetch event
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests (browser handles them directly)
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // MediaPipe CDN requests
    if (url.hostname === 'cdn.jsdelivr.net') {
        event.respondWith(staleWhileRevalidate(event, 'mediapipe-cache'));
        return;
    }

    // Same-origin app assets
    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event, CACHE_NAME));
    }
    // Other cross-origin requests: let the browser handle them
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

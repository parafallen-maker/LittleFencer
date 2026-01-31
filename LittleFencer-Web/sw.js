// Service Worker for LittleFencer PWA
const CACHE_NAME = 'littlefencer-v5';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/camera.js',
    '/js/pose.js',
    '/js/engine.js',
    '/js/feedback.js',
    '/js/recorder.js',
    '/js/ui.js',
    '/js/skeleton.js',
    '/js/utils.js',
    '/js/platform.js',
    '/js/storage.js',
    '/js/detectors/index.js',
    '/manifest.json',
    '/assets/icons/ic_launcher.png',
    '/assets/icons/ic_launcher_round.png',
    '/assets/images/banner.png',
    '/assets/images/badge_combo_5.png',
    '/assets/images/badge_combo_10.png',
    '/assets/images/badge_first_rep.png',
    '/assets/images/badge_perfect_10.png',
    '/assets/images/empty_gallery.png',
    '/assets/images/onboard_1_setup.png',
    '/assets/images/onboard_2_engarde.png',
    '/assets/images/onboard_3_lunge.png'
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
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip MediaPipe CDN requests (always fetch fresh)
    if (event.request.url.includes('cdn.jsdelivr.net')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    });
            })
    );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * ByFlow POS — Service Worker
 * Offline support + caching for PWA
 */

const CACHE_NAME = 'byflow-pos-v1';
const OFFLINE_URL = '/pos-offline.html';

const PRECACHE_URLS = [
  '/pos.html',
  '/bares-v2.html',
  '/pos-manifest.json',
  '/pos-offline.html',
  'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Inter:wght@300;400;500;600;700;800;900&display=swap'
];

// Install: precache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[POS-SW] Precaching essential files');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: network only (never cache orders/payments)
  if (url.pathname.startsWith('/pos/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline, queue the request for later sync
        if (event.request.method === 'POST' || event.request.method === 'PUT') {
          return saveForSync(event.request.clone()).then(() => {
            return new Response(JSON.stringify({
              ok: true, offline: true, message: 'Guardado para sync'
            }), { headers: { 'Content-Type': 'application/json' } });
          });
        }
        return new Response(JSON.stringify({
          ok: false, error: 'Sin conexion', offline: true
        }), { headers: { 'Content-Type': 'application/json' } });
      })
    );
    return;
  }

  // Static files: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// Background sync for offline orders
async function saveForSync(request) {
  const body = await request.text();
  const db = await openSyncDB();
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now()
  });
}

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('byflow-pos-sync', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('pending', { keyPath: 'timestamp' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// When back online, sync pending requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'pos-sync') {
    event.waitUntil(syncPending());
  }
});

async function syncPending() {
  const db = await openSyncDB();
  const tx = db.transaction('pending', 'readonly');
  const store = tx.objectStore('pending');
  const all = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  for (const item of all) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      // Remove synced item
      const delTx = db.transaction('pending', 'readwrite');
      delTx.objectStore('pending').delete(item.timestamp);
    } catch (e) {
      console.log('[POS-SW] Sync failed, will retry:', e);
      break;
    }
  }
}

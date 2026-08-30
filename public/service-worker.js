const CACHE_NAME = 'vm-brasil-v15';
const IMAGE_CACHE_NAME = 'vm-brasil-images-v2';
const IMAGE_CACHE_MAX_ENTRIES = 400; // ~400 imagens (produtos + banners + ícones)
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/assets/new-notification-026-380249_1765220299583.mp3'
];

// Install — pre-cache core assets (resilient: never fail install if a single asset is missing)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache each asset individually so a single 404/401 doesn't break install
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Skipping uncacheable asset', url, err?.message || err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches (do NOT force-navigate clients; main.tsx handles version checks safely)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) =>
            (name.startsWith('vm-brasil-') && name !== CACHE_NAME && name !== IMAGE_CACHE_NAME)
          )
          .map((name) => caches.delete(name))
      );
    }).then(async () => {
      const ua = self.navigator?.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || ua.includes('Macintosh');
      if (isIOS) await self.registration.unregister();
    })
  );
  self.clients.claim();
});

// LRU trim para o cache de imagens — evita crescer indefinidamente
async function trimImageCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= IMAGE_CACHE_MAX_ENTRIES) return;
    const excess = keys.length - IMAGE_CACHE_MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch {}
}

// Push notification received
self.addEventListener('push', (event) => {
  let data = { title: '🔔 Novo Pedido!', body: 'Um novo pedido foi recebido' };
  
  try {
    if (event.data) {
      const text = event.data.text();
      try {
        data = JSON.parse(text);
      } catch {
        data.body = text;
      }
    }
  } catch {
    // use defaults
  }

  const options = {
    body: data.body || 'Novo pedido recebido!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [300, 100, 300, 100, 300],
    requireInteraction: true,
    tag: 'new-order',
    renotify: true,
    actions: [
      { action: 'open', title: '📋 Ver Pedido' },
      { action: 'dismiss', title: '✓ OK' }
    ],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Novo Pedido!', options)
  );
});

// Notification click — bring app to focus
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.action === 'open' 
    ? '/admin?tab=orders' 
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NEW_ORDER_FOCUS', data: event.notification.data });
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch — cache first, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/~')) return;

  const isSupabase = url.origin.includes('supabase');
  // Imagens públicas do Storage têm cacheControl=1 ano → CacheFirst (corta egress drasticamente)
  const isStorageImage = isSupabase && (url.pathname.includes('/storage/v1/object/public/') || url.pathname.includes('/storage/v1/render/image/public/'));

  if (isStorageImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone()).then(() => trimImageCache(cache));
          }
          return response;
        } catch {
          return cached || new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Demais requests Supabase (REST/Realtime/Edge): NetworkOnly — sempre dados frescos
  if (isSupabase) return;

  const isBuildAsset = url.pathname.startsWith('/assets/') || request.destination === 'script' || request.destination === 'style';

  // SPA: navigation requests → network-first, fallback to cached index.html
  const isNavigation =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(new Request(request, { cache: 'no-cache' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html').then((c) => c || caches.match('/')))
    );
    return;
  }

  // JS/CSS bundles: network-first sem fallback opaco para evitar misturar versões e causar tela preta.
  if (isBuildAsset) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Assets: cache-first, fallback to network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        event.waitUntil(
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
              }
            })
            .catch(() => {})
        );
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => new Response('Offline', { status: 503 }));
    })
  );
});

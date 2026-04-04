// Service Worker — SBD Elite Tracker
const CACHE_NAME = 'sbd-elite-v1';

// Fichiers à mettre en cache pour le mode offline
// Détection automatique du base path (GitHub Pages ou custom domain)
const BASE = self.location.pathname.replace(/\/sw\.js$/, '') || '';

const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Installation — mise en cache des assets statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On ignore les erreurs sur les CDN externes
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — stratégie Cache First pour les assets, Network First pour les données
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requêtes Supabase et API → toujours réseau (pas de cache)
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('garmin.com')) {
    return; // laisser passer normalement
  }

  // Assets statiques → Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Mettre en cache les nouvelles réponses valides
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback — retourner l'index.html pour la navigation
        if (event.request.mode === 'navigate') {
          return caches.match(BASE + '/index.html') || caches.match(BASE + '/');
        }
      });
    })
  );
});

// Notifications push (pour les rappels de séance)
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'SBD Elite', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow(event.notification.data.url || '/');
    })
  );
});

// Service Worker minimal — SBD Elite Tracker
// Pas de cache agressif, juste le nécessaire pour l'installation PWA

const CACHE_NAME = 'sbd-elite-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Supprimer les anciens caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Pas d'interception fetch — tout passe directement au réseau
// L'app reste fonctionnelle, juste pas offline
self.addEventListener('fetch', event => {
  // On laisse passer toutes les requêtes normalement
  return;
});

// Push notifications
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : { title: 'Training Hub', body: 'Notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      vibrate: [100, 50, 100]
    })
  );
});

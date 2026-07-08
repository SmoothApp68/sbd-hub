// ============================================================
// sentry-init.js — Monitoring d'erreurs (observabilité, LECTURE SEULE)
// Chargé APRÈS js/sentry.min.js et AVANT le reste (voir index.html).
// Zéro écriture db.* / cloud. Fail-silent : si le SDK n'a pas chargé
// (offline, CDN bloqué) ou si l'init échoue, l'app continue normalement.
// ============================================================

// DSN = clé d'envoi PUBLIQUE par conception (sûr en clair côté client).
// Produit "Surveillance des erreurs" uniquement — pas de tracing/replay.
var SENTRY_DSN = 'https://74136d3a8e913a805067413cef581520@o4511701283241984.ingest.de.sentry.io/4511701303689296';

// Release — bumpé avec le service worker (CACHE_NAME). Sert à savoir quelle
// version a produit une erreur dans le dashboard Sentry.
var SENTRY_RELEASE = 'sbd-hub@v308';

(function () {
  try {
    // Gate prod : n'envoyer qu'en production. En local/dev, ne pas polluer
    // le dashboard (bumps SW fréquents). __SENTRY_FORCE__ = hook de test.
    var isProd = (location.hostname === 'smoothapp68.github.io');
    if (!isProd && !window.__SENTRY_FORCE__) return;

    // Fail-silent : SDK absent (offline / bloqué) → ne rien faire.
    if (typeof window.Sentry === 'undefined' || typeof window.Sentry.init !== 'function') return;

    window.Sentry.init({
      dsn: SENTRY_DSN,
      release: SENTRY_RELEASE,
      environment: isProd ? 'production' : 'dev',
      sampleRate: 1.0,        // faible volume (~5 users) → 100 %, pas d'échantillonnage
      tracesSampleRate: 0,    // pas de performance monitoring (économise le quota)
      // Filtrage du bruit : ignorer les erreurs injectées par les extensions
      // navigateur (elles polluent le dashboard et ne sont pas nos bugs).
      denyUrls: [
        /extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i,
        /^moz-extension:\/\//i, /^safari-extension:\/\//i, /^safari-web-extension:\/\//i
      ],
      beforeSend: function (event) {
        try {
          var frames = event && event.exception && event.exception.values &&
            event.exception.values[0] && event.exception.values[0].stacktrace &&
            event.exception.values[0].stacktrace.frames;
          if (frames && frames.some(function (f) {
            return f && typeof f.filename === 'string' && /extension:\/\//i.test(f.filename);
          })) return null; // erreur d'extension → drop
        } catch (e) { /* fail-open : en cas de doute on laisse passer */ }
        return event;
      }
    });

    // Contexte NON sensible autorisé : onboardingVersion (lu en localStorage,
    // défensif — jamais de donnée d'entraînement). Best-effort.
    try {
      var raw = localStorage.getItem('SBD_HUB_V29');
      if (raw) {
        var ov = JSON.parse(raw);
        var v = ov && ov.user && ov.user.onboardingVersion;
        if (v !== undefined && v !== null) window.Sentry.setTag('onboardingVersion', String(v));
      }
    } catch (e) { /* ignore */ }
  } catch (e) {
    // Init Sentry ne doit JAMAIS casser l'app.
    if (typeof console !== 'undefined' && console.warn) console.warn('Sentry init skipped:', e && e.message);
  }
})();

// Helper de capture fail-silent pour le code applicatif. Toujours sûr à appeler
// (no-op si Sentry absent / non initialisé). `where` = étiquette de contexte
// technique (nom de fonction), JAMAIS de donnée d'entraînement.
function sentryCaptureSilent(err, where) {
  try {
    if (typeof window.Sentry === 'undefined' || typeof window.Sentry.captureException !== 'function') return;
    if (!window.Sentry.getClient || !window.Sentry.getClient()) return; // pas initialisé (local) → no-op
    window.Sentry.captureException(err instanceof Error ? err : new Error(String(err)),
      where ? { tags: { where: String(where) } } : undefined);
  } catch (e) { /* fail-silent */ }
}

// Associe l'utilisateur courant à ses erreurs via UUID uniquement (jamais
// email/pseudo). Appelé quand l'uid est résolu (cache _cachedUid).
function sentrySetUserId(uid) {
  try {
    if (!uid) return;
    if (typeof window.Sentry === 'undefined' || typeof window.Sentry.setUser !== 'function') return;
    if (!window.Sentry.getClient || !window.Sentry.getClient()) return;
    window.Sentry.setUser({ id: String(uid) });
  } catch (e) { /* fail-silent */ }
}

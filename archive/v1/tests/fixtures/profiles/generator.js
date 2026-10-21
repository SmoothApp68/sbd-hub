/**
 * SBD Hub — Générateur de profils de test RÉALISTES (Agent 09)
 * ============================================================
 *
 * ⚠️ PÉRIMÈTRE : ce fichier ne touche NI Supabase NI les RLS NI l'app.
 *    Il ne fait que PRODUIRE des blobs `db` synthétiques (le format
 *    stocké sous localStorage['SBD_HUB_V29']). AUCUN utilisateur réel.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Les fixtures historiques du repo (ex. `tests/audit-seances-betatester.spec.js`
 * → `buildLogs()`) étaient IDÉALISÉES : 20 séances étalées PILE tous les
 * `i*1.5` jours (aucun trou), 0 warm-up, aucun `series[]`/`repRecords`, jamais
 * de `rpe:null`, un seul store de check-in (`todayWellbeing`, obsolète depuis
 * C2-b). Résultat : des bugs partis en prod étaient STRUCTURELLEMENT invisibles
 * (facteur calorique volatile causé par un trou en début de fenêtre 28j ;
 * deadlift non reconnu quand le RDL est listé en premier ; e1RM plat pris pour
 * une progression ; etc.).
 *
 * Ce générateur reproduit ces pièges VOLONTAIREMENT.
 *
 * FORMAT (rétro-ingénieré depuis le code réel — voir audit/09-profils.md) :
 *   - Une SÉANCE = objet créé par createSession() (import.js:70) :
 *       { id, timestamp, date(fr-FR), shortDate(dd/mm), day, title, type,
 *         volume, duration, editedAt, exercises[] }
 *   - Un EXERCICE = createExercise() (import.js:93) puis finalisé par
 *       finalizeSessionFromSeries() (import.js:119) :
 *       { name, exoType, muscleGroup, sets(COMPTEUR numérique, pas un tableau),
 *         maxRM, maxRMDate, maxReps, ..., repRecords{ "5":100 }, series[], allSets[] }
 *   - Un SET vit à DEUX endroits (series[] = work sets curés, allSets[] = brut)
 *     et le warm-up existe sous DEUX formats coexistants :
 *       { isWarmup:true }           (booléen legacy, betatester spec)
 *       { setType:'warmup' }        (string, GO/import réels)
 *     Les lecteurs testent souvent LES DEUX : `s.isWarmup === true || s.setType === 'warmup'`.
 *   - Un CHECK-IN = readinessHistory[] (app.js:22437) :
 *       { ts, date, sleep, energy, motivation, soreness, score, pain }
 *       échelle 1-10 ; pain = string|null (null = « aucune douleur » explicite).
 *
 * API
 * ---
 *   Builders bas niveau : workSet, warmupLegacy, warmupTyped, dropSet,
 *     failSet, exercise, session, checkin, bodyEntry.
 *   Assembleur : baseUser, blankProfile.
 *   Générateur paramétrable : generateProfile(opts) — voir signature plus bas.
 *
 * Tout est now-relatif (param `now`, défaut Date.now()) pour que les fenêtres
 * glissantes (7j / 28j) restent réalistes quelle que soit la date d'exécution.
 */

'use strict';

const DAY = 86400000;
const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function pad2(n) { return String(n).padStart(2, '0'); }

// Réplique EXACTE de calcE1RM (app.js:1729) — Brzycki, cap 20 reps.
function calcE1RM(w, r) { r = Math.min(r, 20); return r <= 1 ? w : Math.round(w / (1.0278 - 0.0278 * r)); }

// Réplique du format de date de createSession (import.js:70-78).
function frDate(ts) {
  const d = new Date(ts);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}
function shortDate(ts) {
  const d = new Date(ts);
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
}
function dayName(ts) { return DAYS_FULL[new Date(ts).getDay()]; }

let _idc = 0;
function genId(prefix) { return (prefix || 'log') + '-' + (Date.now().toString(36)) + '-' + (_idc++); }

// ── SET BUILDERS ────────────────────────────────────────────────────────────
// rpe peut être un nombre OU null (piège réaliste : la saisie RPE est optionnelle).
function workSet(weight, reps, rpe, extra) {
  return Object.assign({ weight, reps, setType: 'normal', rpe: (rpe === undefined ? null : rpe) }, extra || {});
}
// Warm-up format LEGACY (booléen) — celui de la betatester spec.
function warmupLegacy(weight, reps) { return { weight, reps, isWarmup: true, rpe: null }; }
// Warm-up format TYPÉ (string) — celui du GO/import réels.
function warmupTyped(weight, reps) { return { weight, reps, setType: 'warmup', rpe: null }; }
function dropSet(weight, reps) { return { weight, reps, setType: 'dropset', rpe: null, isDropSet: true }; }
function failSet(weight, reps, rpe) { return { weight, reps, setType: 'failure', rpe: (rpe === undefined ? null : rpe), isAbandoned: true }; }

// Un set « de travail » compte-t-il pour les records ? (mirroir des lecteurs réels)
function isRecordable(s) {
  if (s.isWarmup === true) return false;
  if (s.setType === 'warmup') return false;
  if (s.setType === 'dropset' || s.setType === 'drop') return false;
  if (s.setType === 'failure' || s.setType === 'abandon') return false;
  if (s.isAbandoned) return false;
  return true;
}

// ── EXERCISE BUILDER ────────────────────────────────────────────────────────
// `sets` = tableau de sets bruts (warm-up + travail + drop…). Reproduit
// finalizeSessionFromSeries() : series[] = sets recordables, repRecords/maxRM/sets
// dérivés. muscleGroup laissé null par défaut (getMuscleGroup non dispo hors app ;
// aucun lecteur critique ne le rend obligatoire).
function exercise(name, sets, opts) {
  opts = opts || {};
  const ts = opts.ts || Date.now();
  const exoType = opts.exoType || 'weight';
  const exo = {
    name,
    exoType,
    muscleGroup: opts.muscleGroup || null,
    sets: 0,
    maxRM: 0, maxRMDate: null,
    maxReps: 0, maxRepsDate: null,
    maxTime: 0, maxTimeDate: null,
    distance: 0, cardioDate: null,
    totalReps: 0,
    repRecords: {},
    series: [],
    allSets: [],
    isCardio: exoType === 'cardio',
    isReps: exoType === 'reps',
    isTime: exoType === 'time'
  };
  if (opts.isPrimary) exo.isPrimary = true;
  (sets || []).forEach(function (s) {
    exo.allSets.push(s);
    if (!isRecordable(s)) return;
    const w = s.weight || 0, r = s.reps || 0;
    if (exoType === 'weight') {
      exo.series.push({ weight: w, reps: r, date: ts });
      if (w > 0 && r > 0) {
        const rm = calcE1RM(w, r);
        if (rm > exo.maxRM) { exo.maxRM = rm; exo.maxRMDate = ts; }
        const k = String(r);
        if (!exo.repRecords[k] || w > exo.repRecords[k]) exo.repRecords[k] = w;
      }
    } else if (exoType === 'reps') {
      exo.series.push({ weight: w, reps: r, date: ts });
      exo.totalReps += r;
      if (r > exo.maxReps) { exo.maxReps = r; exo.maxRepsDate = ts; }
    }
  });
  exo.sets = exo.series.length;
  return exo;
}

// ── SESSION BUILDER ─────────────────────────────────────────────────────────
function session(ts, title, exercises, opts) {
  opts = opts || {};
  let vol = 0;
  (exercises || []).forEach(function (exo) {
    (exo.series || []).forEach(function (s) {
      if ((s.weight || 0) > 0 && (s.reps || 0) > 0) vol += s.weight * s.reps;
    });
  });
  const s = {
    id: opts.id || genId('log'),
    timestamp: ts,
    date: frDate(ts),
    shortDate: shortDate(ts),
    day: dayName(ts),
    title: title || 'Séance',
    type: opts.type || '',
    volume: (opts.volume !== undefined ? opts.volume : vol),
    duration: (opts.duration !== undefined ? opts.duration : 3600 + Math.round((ts % 1800))),
    editedAt: ts,
    exercises: exercises || []
  };
  if (opts.readiness) s.readiness = opts.readiness;
  return s;
}

// ── CHECK-IN BUILDER (readinessHistory) ─────────────────────────────────────
// Entrées en échelle 1-10. score dérivé si non fourni (approximation ; le vrai
// calculateReadiness est interne app.js). pain = string|null.
function checkin(ts, o) {
  o = o || {};
  const sleep = o.sleep, energy = o.energy, motivation = o.motivation, soreness = o.soreness;
  let score = o.score;
  if (score === undefined) {
    // Approx : moyenne pondérée basique (sleep/energy/motiv positifs, soreness inversé).
    const parts = [];
    if (sleep != null) parts.push(sleep);
    if (energy != null) parts.push(energy);
    if (motivation != null) parts.push(motivation);
    if (soreness != null) parts.push(11 - soreness);
    score = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) : 50;
  }
  return {
    ts: ts,
    date: new Date(ts).toISOString().slice(0, 10),
    sleep: (sleep === undefined ? null : sleep),
    energy: (energy === undefined ? null : energy),
    motivation: (motivation === undefined ? null : motivation),
    soreness: (soreness === undefined ? null : soreness),
    score: score,
    pain: (o.pain === undefined ? null : o.pain)
  };
}

function bodyEntry(ts, weight, opts) {
  opts = opts || {};
  return {
    ts: ts,
    date: new Date(ts).toISOString().slice(0, 10),
    weight: weight,
    bw: weight,
    kcal: (opts.kcal !== undefined ? opts.kcal : null),
    prot: (opts.prot !== undefined ? opts.prot : null)
  };
}

// ── ASSEMBLEUR ──────────────────────────────────────────────────────────────
// User réaliste : onboarding refondu v337 (level/mode/coachingStyle séparés).
function baseUser(over) {
  return Object.assign({
    name: 'Test',
    age: 30, bw: 80, height: 178, gender: 'male',
    goal: 'masse',
    level: 'intermediaire',
    trainingMode: 'powerbuilding',
    coachingStyle: 'classique',
    onboarded: true,
    onboardingVersion: 4,
    onboardingPRs: null,
    units: 'kg', barWeight: 20,
    tier: 'free', plan: 'free',
    coachProfile: 'full', coachEnabled: true, vocabLevel: 2,
    lpActive: false, lpStrikes: {},
    injuries: [], secondaryActivities: [], activityTemplate: [],
    consentHealth: true, medicalConsent: true,
    tdeeAdjustment: 0, fatPct: null,
    menstrualEnabled: false
  }, over || {});
}

// Squelette de blob « saved » réaliste. On ne remplit PAS tous les champs de
// defaultDB : un vrai blob sauvegardé par une ancienne version est PARTIEL —
// c'est justement ce que la cascade de migrations `if (x === undefined)` de
// loadDB (app.js:110-270) doit rattraper. `_fixtureName` = sentinelle : si
// loadDB retombe sur defaultDB(), ce champ disparaît → fallback détecté.
function blankProfile(name, userOver) {
  return {
    _fixtureName: name,
    user: baseUser(userOver),
    logs: [],
    exercises: {},
    bestPR: { bench: 0, squat: 0, deadlift: 0 },
    readinessHistory: [],
    readiness: [],
    activityLogs: [],
    body: [],
    earnedBadges: {},
    gamification: { xpHighWaterMark: 0, earnedBadges: {} },
    weeklyPlan: null
  };
}

// Recalcule bestPR à la manière de recalcBestPR (app.js:1759) : vraies barres,
// plancher onboardingPRs. Utilisé par les profils pour rester COHÉRENTS avec ce
// que l'app recalculerait (sinon le blob mentirait sur ses propres records).
function recomputeBestPR(profile) {
  const bp = { bench: 0, squat: 0, deadlift: 0 };
  (profile.logs || []).forEach(function (log) {
    (log.exercises || []).forEach(function (exo) {
      const t = sbdType(exo.name);
      if (!t) return;
      const w = exoMaxRealWeight(exo);
      if (w > bp[t]) bp[t] = w;
    });
  });
  const ob = profile.user && profile.user.onboardingPRs;
  if (ob) ['bench', 'squat', 'deadlift'].forEach(function (k) { if ((ob[k] || 0) > bp[k]) bp[k] = ob[k]; });
  profile.bestPR = bp;
  return bp;
}

// Copie fidèle de _getSBDTypeRaw (engine.js:809) — pour garder les fixtures
// cohérentes (NE remplace PAS le vrai matcher : la validation, elle, appelle le
// vrai getSBDType extrait de engine.js).
const VARIANT_KEYWORDS = ['pause', 'spoto', 'deficit', 'board'];
function sbdType(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()]/g, ' ');
  if (VARIANT_KEYWORDS.some(function (kw) { return n.includes(kw); })) return null;
  if (n.includes('bench') || (n.includes('couche') && !n.includes('incline') && !n.includes('haltere') && !n.includes('decline'))) return 'bench';
  if (n.includes('squat') && !n.includes('hack') && !n.includes('goblet') && !n.includes('sissy') && !n.includes('bulgare') && !n.includes('front') && !n.includes('zercher') && !n.includes('split')) return 'squat';
  if (n.includes('deadlift') || (n.includes('souleve') && n.includes('terre'))) {
    if (/roumain|romanian|\brdl\b|jambes?\s+tendues?|stiff.?leg/.test(n)) return null;
    return 'deadlift';
  }
  return null;
}
function exoMaxRealWeight(exo) {
  let w = 0;
  if (exo.repRecords) Object.keys(exo.repRecords).forEach(function (r) { const v = exo.repRecords[r] || 0; if (v > w) w = v; });
  if (w > 0) return w;
  (exo.allSets || []).forEach(function (s) { if ((s.reps || 0) > 0 && s.setType !== 'warmup' && !s.isWarmup && (s.weight || 0) > w) w = s.weight; });
  if (w > 0) return w;
  (exo.series || []).forEach(function (s) { if ((s.reps || 0) > 0 && (s.weight || 0) > w) w = s.weight; });
  return w;
}

// ── GÉNÉRATEUR PARAMÉTRABLE ─────────────────────────────────────────────────
// generateProfile(opts) — produit un profil « backbone » sur plusieurs semaines,
// avec trous et progression contrôlés. Sert de socle aux profils spécialisés et
// permet à de futurs tests d'en dériver d'autres.
//
// opts (tous optionnels) :
//   name           string   nom-sentinelle (_fixtureName)
//   now            number   « maintenant » (défaut Date.now())
//   sessions       number   nb de séances à produire (défaut 20)
//   daysSpan       number   fenêtre calendaire couverte, en jours (défaut 90)
//   holes          number[] jours (offset depuis now) à laisser VIDES de force
//   holeAtWindowStart bool  si true, aucune séance entre J-28 et J-`firstWindowGap`
//   firstWindowGap number   1re séance de la fenêtre 28j à J-`firstWindowGap` (défaut 22)
//   progression    number   kg gagnés / semaine sur les mains lifts (0 = plateau)
//   bw             number   poids de corps
//   start          {squat,bench,deadlift}  charges de travail de départ (work weight)
//   user           object   overrides user
//   warmupMix      bool     alterne les 2 formats de warm-up (défaut true)
//   nullRpeEvery   number   1 séance sur N a des rpe:null (défaut 3)
function generateProfile(opts) {
  opts = opts || {};
  const now = opts.now || Date.now();
  const N = opts.sessions || 20;
  const span = opts.daysSpan || 90;
  const prog = opts.progression || 0;
  const bw = opts.bw || 80;
  const start = opts.start || { squat: 110, bench: 85, deadlift: 130 };
  const warmupMix = opts.warmupMix !== false;
  const nullRpeEvery = opts.nullRpeEvery || 3;
  const holes = opts.holes || [];

  const p = blankProfile(opts.name || 'generated', Object.assign({ bw: bw }, opts.user || {}));

  // Étale N séances sur `span` jours, plus récente à J0-ish, avec un léger jitter
  // pour éviter l'équidistance parfaite (le défaut idéalisé des anciennes fixtures).
  const logs = [];
  for (let i = 0; i < N; i++) {
    // offset croissant vers le passé, non-uniforme
    let offset = Math.round((i / Math.max(1, N - 1)) * span);
    // jitter déterministe ±1j
    offset += (i % 2 === 0 ? 1 : -1) * (i % 3);
    if (offset < 0) offset = 0;
    // trous forcés : décale la séance hors des jours interdits
    while (holes.indexOf(offset) >= 0) offset += 1;
    if (opts.holeAtWindowStart && offset < 28) {
      const gap = opts.firstWindowGap || 22;
      // aucune séance entre J-28 et J-gap : si offset tombe dans [gap+1, 28[, on la garde ;
      // si dans ]0, gap], on la garde. On vide juste la tranche [gap, 28[ SAUF la 1re.
      if (offset > gap && offset < 28 && i !== 0) offset = gap; // tasse vers le bord gap
    }
    const ts = now - offset * DAY - (i % 5) * 3600000; // heure variable
    const weeksAgo = offset / 7;
    // Charges : progression linéaire inverse (plus vieux = plus léger).
    const sq = Math.round((start.squat - prog * weeksAgo) / 2.5) * 2.5;
    const bp = Math.round((start.bench - prog * weeksAgo) / 2.5) * 2.5;
    const dl = Math.round((start.deadlift - prog * weeksAgo) / 2.5) * 2.5;
    const rpe = (i % nullRpeEvery === 0) ? null : (7 + (i % 3) * 0.5);
    const warm = (warmupMix && i % 2 === 0)
      ? [warmupTyped(20, 8), warmupTyped(Math.round(sq * 0.6 / 2.5) * 2.5, 5)]
      : [warmupLegacy(20, 8), warmupLegacy(Math.round(sq * 0.6 / 2.5) * 2.5, 5)];
    const exos = [];
    // Rotation squat/bench/deadlift pour varier les jours.
    if (i % 3 === 0) {
      exos.push(exercise('Squat (Barre)', warm.concat([workSet(sq, 5, rpe), workSet(sq, 5, rpe), workSet(sq, 4, rpe)]), { ts, isPrimary: true }));
      exos.push(exercise('Développé Couché (Barre)', [workSet(bp, 6, rpe), workSet(bp, 6, rpe)], { ts, isPrimary: true }));
    } else if (i % 3 === 1) {
      exos.push(exercise('Développé Couché (Barre)', warm.concat([workSet(bp, 5, rpe), workSet(bp, 5, rpe), workSet(bp, 5, rpe)]), { ts, isPrimary: true }));
      exos.push(exercise('Rowing Barre (Pronation)', [workSet(Math.round(bp * 0.9 / 2.5) * 2.5, 8, rpe), workSet(Math.round(bp * 0.9 / 2.5) * 2.5, 8, rpe)], { ts }));
    } else {
      exos.push(exercise('Soulevé de Terre (Barre)', warm.concat([workSet(dl, 3, rpe), workSet(dl, 3, rpe)]), { ts, isPrimary: true }));
      exos.push(exercise('Squat (Barre)', [workSet(Math.round(sq * 0.85 / 2.5) * 2.5, 6, rpe)], { ts }));
    }
    logs.push(session(ts, ['Push', 'Pull', 'Jambes'][i % 3], exos, { id: 'gen-' + i }));
  }
  // Ordre : plus récent en index 0 (convention CLAUDE.md §11 + chemin import.unshift).
  logs.sort(function (a, b) { return b.timestamp - a.timestamp; });
  p.logs = logs;
  recomputeBestPR(p);
  return p;
}

module.exports = {
  DAY, DAYS_FULL, calcE1RM,
  frDate, shortDate, dayName, genId,
  workSet, warmupLegacy, warmupTyped, dropSet, failSet, isRecordable,
  exercise, session, checkin, bodyEntry,
  baseUser, blankProfile, recomputeBestPR, sbdType, exoMaxRealWeight,
  generateProfile
};

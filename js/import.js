// ============================================================
// import.js — Hevy parsing, reports, debrief algorithmique
// ============================================================

// ============================================================
// REPORTS
// ============================================================
function purgeExpiredReports() { const now = Date.now(); const before = db.reports.length; db.reports = db.reports.filter(r => r.expires_at > now); if (db.reports.length !== before) saveDB(); }
function upsertReport(type, html, sessionId) { purgeExpiredReports(); db.reports = db.reports.filter(r => { if (type==='debrief' && r.type==='debrief' && r.sessionId===sessionId) return false; if (type==='weekly' && r.type==='weekly') return false; return true; }); const now = Date.now(); db.reports.push({ id: generateId(), type, html, created_at: now, expires_at: now+REPORT_TTL_MS, sessionId: sessionId||null, read: false }); saveDBNow(); updateCoachBadge(); renderReportsTimeline(); }
function markReportsRead() { let changed = false; db.reports.forEach(r => { if (!r.read) { r.read = true; changed = true; } }); if (changed) saveDB(); updateCoachBadge(); }
function updateCoachBadge() { const unread = db.reports.filter(r => !r.read && r.expires_at > Date.now()).length; const btn = document.querySelector('.tab-btn[data-tab="tab-ai"]'); const existing = btn.querySelector('.tab-badge'); if (unread > 0 && !existing) { const dot = document.createElement('span'); dot.className = 'tab-badge'; btn.appendChild(dot); } else if (unread === 0 && existing) existing.remove(); }
function shouldGenerateWeekly() { const today = new Date(); if (today.getDay() !== 6) return false; const existing = db.reports.find(r => r.type === 'weekly'); if (existing) { const created = new Date(existing.created_at); if (created.toDateString() === today.toDateString()) return false; } return getLogsInRange(7).length > 0; }
let reportsTimelineOpen = true;
function toggleReportsTimeline() {
  reportsTimelineOpen = !reportsTimelineOpen;
  const body = document.getElementById('reportsTimelineBody');
  const chev = document.getElementById('reportsTimelineChevron');
  if (body) { body.classList.toggle('open', reportsTimelineOpen); }
  if (chev) chev.style.transform = reportsTimelineOpen ? '' : 'rotate(-90deg)';
}
function renderReportsTimeline() {
  purgeExpiredReports();
  const container = document.getElementById('aiReportsTimeline');
  if (!container) return;
  const reports = db.reports.filter(r => r.expires_at > Date.now()).sort((a,b) => b.created_at - a.created_at);
  if (reports.length === 0) { container.innerHTML = ''; return; }
  // Auto-ouvrir si rapports non lus
  const hasUnread = reports.some(r => !r.read);
  if (hasUnread) reportsTimelineOpen = true;
  const cardsHtml = reports.map(r => {
    const typeLabel = r.type==='debrief'?'🏋️ Débrief Séance':'📊 Bilan Hebdo';
    const dl = daysLeft(r.expires_at);
    const unreadDot = r.read?'':'<span class="report-new-dot"></span>';
    return '<div class="report-card '+r.type+'" id="report-'+r.id+'">' +
      '<div class="report-card-header"><div class="report-card-type">'+unreadDot+' '+typeLabel+'</div>' +
      '<div style="text-align:right;"><div class="report-card-date">'+timeAgo(r.created_at)+'</div>' +
      '<div class="report-card-expiry">⏳ Expire dans '+dl+'j</div></div></div>' +
      '<div class="report-card-body" id="report-body-'+r.id+'" style="display:none;"><div class="ai-response-content">'+r.html+'</div></div>' +
      '<button class="report-toggle" onclick="toggleReport(\''+r.id+'\')">Voir le rapport ▾</button></div>';
  }).join('');
  const chevTransform = reportsTimelineOpen ? '' : 'rotate(-90deg)';
  const bodyClass = 'acc-body' + (reportsTimelineOpen ? ' open' : '');
  container.innerHTML =
    '<div class="acc-card" style="margin-bottom:12px;">' +
      '<div class="acc-header" onclick="toggleReportsTimeline()" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;">' +
        '<h2 style="margin:0;">📋 Rapports récents</h2>' +
        '<span id="reportsTimelineChevron" class="acc-chevron" style="transition:transform 0.3s;transform:'+chevTransform+';">▾</span>' +
      '</div>' +
      '<div id="reportsTimelineBody" class="'+bodyClass+'">' +
        '<p style="font-size:11px;color:var(--sub);margin:0 0 14px;">Auto-suppression après 7 jours</p>' +
        cardsHtml +
      '</div>' +
    '</div>';
}
function toggleReport(id) { const body = document.getElementById('report-body-'+id); const btn = body.parentElement.querySelector('.report-toggle'); if (body.style.display === 'none') { body.style.display = 'block'; btn.textContent = 'Masquer ▴'; } else { body.style.display = 'none'; btn.textContent = 'Voir le rapport ▾'; } }

// ============================================================
// SESSION FORMAT — HELPERS POUR LE JOURNAL (Phase 2)
// ============================================================
// Ces fonctions définissent le format canonique d'une session et
// de ses exercices. Le journal de séance les utilisera pour créer
// des entrées compatibles avec tout le système analytics existant.
// NE PAS modifier ces structures sans mettre à jour sanitizeDB().

/**
 * Crée une session vide au format attendu par db.logs[].
 * @param {string} title  - Intitulé de la séance (ex : "Push A")
 * @param {number} [ts]   - Timestamp de début (default: maintenant)
 */
function createSession(title, ts) {
  const t = ts || Date.now();
  const d = new Date(t);
  return {
    id:         generateId(),
    timestamp:  t,
    date:       d.toLocaleDateString('fr-FR'),
    shortDate:  String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'),
    day:        DAYS_FULL[d.getDay()],
    title:      title || 'Séance',
    volume:     0,        // kg×reps — calculé par finalizeSessionFromSeries()
    duration:   0,        // secondes — à remplir par le journal (timer)
    exercises:  []
  };
}

/**
 * Crée un exercice vide au format attendu dans session.exercises[].
 * Remplir .series[] puis appeler finalizeSessionFromSeries().
 * @param {string} name - Nom exact de l'exercice (correspond aux logs Hevy)
 */
function createExercise(name) {
  const exoType = getExoType(name);
  return {
    name,
    exoType,
    sets:        0,
    maxRM:       0,   maxRMDate:    null,
    maxReps:     0,   maxRepsDate:  null,
    maxTime:     0,   maxTimeDate:  null,
    distance:    0,   cardioDate:   null,
    totalReps:   0,
    repRecords:  {},  // { "5": 80, "8": 70 } — meilleur poids par compte de reps
    series:      [],  // [{ weight, reps, date }] — séries individuelles (sparklines + repRecords)
    allSets:     [],  // [{ weight, reps, setType, rpe }] — toutes les séries brutes conservées
    isCardio:    exoType === 'cardio' || exoType === 'cardio_stairs',
    isReps:      exoType === 'reps',
    isTime:      exoType === 'time',
  };
}

/**
 * Calcule volume, e1RM, repRecords et maxReps depuis session.exercises[].series.
 * À appeler juste avant de pousser la session dans db.logs.
 * @param {Object} session - Session créée par createSession()
 */
function finalizeSessionFromSeries(session) {
  let vol = 0;
  const ts = session.timestamp;
  session.exercises.forEach(exo => {
    exo.sets = exo.series.length;
    if (exo.isReps) {
      exo.totalReps = exo.series.reduce((s, x) => s + (x.reps || 0), 0);
      exo.series.forEach(s => {
        if ((s.reps || 0) > (exo.maxReps || 0)) { exo.maxReps = s.reps; exo.maxRepsDate = ts; }
        if ((s.weight || 0) > 0) {
          vol += s.weight * s.reps;
          const rm = calcE1RM(s.weight, s.reps);
          if (rm > (exo.maxRM || 0)) { exo.maxRM = rm; exo.maxRMDate = ts; }
          const rKey = String(s.reps);
          if (!exo.repRecords[rKey] || s.weight > exo.repRecords[rKey]) exo.repRecords[rKey] = s.weight;
        }
      });
    } else if (exo.isTime) {
      exo.series.forEach(s => {
        const t = s.reps || 0; // le temps est stocké dans le champ reps
        if (t > 1 && t < 3600 && t > (exo.maxTime || 0)) { exo.maxTime = t; exo.maxTimeDate = ts; }
      });
    } else if (exo.isCardio) {
      exo.series.forEach(s => {
        const distKm = (s.dist || 0) > 0 ? s.dist / 1000 : 0;
        if (distKm > (exo.distance || 0)) exo.distance = distKm;
        if ((s.duree || 0) > (exo.maxTime || 0)) { exo.maxTime = s.duree; exo.cardioDate = ts; }
      });
    } else {
      // Type weight (défaut)
      exo.series.forEach(s => {
        const w = s.weight || 0, r = s.reps || 0;
        if (w > 0 && r > 0) {
          vol += w * r;
          const rm = calcE1RM(w, r);
          if (rm > (exo.maxRM || 0)) { exo.maxRM = rm; exo.maxRMDate = ts; }
          const rKey = String(r);
          if (!exo.repRecords[rKey] || w > exo.repRecords[rKey]) exo.repRecords[rKey] = w;
        }
      });
    }
  });
  // Build allSets from series if not already populated
  session.exercises.forEach(exo => {
    if (!exo.allSets || exo.allSets.length === 0) {
      exo.allSets = (exo.series || []).map(s => ({
        weight: s.weight || 0,
        reps: s.reps || 0,
        setType: 'normal',
        rpe: null
      }));
    }
  });
  session.volume = vol;
  return session;
}


// ============================================================
// HEVY IMPORT — CORE
// ============================================================
const AI_EXTRACT_SYSTEM = `Tu es un parseur de données d'entraînement. Tu reçois un export texte brut de l'app Hevy et tu dois extraire les données sous forme de JSON strict.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec du JSON valide, rien d'autre (pas de markdown, pas de \`\`\`json)
- Ne jamais inventer de données absentes
- Les séries [Échauffement] sont des warmups (setType: "warmup"), ne comptent PAS dans les records
- Les séries [Abandon] = poussées à l'échec (setType: "abandon"), ne comptent PAS dans les records
- Les séries [Drop] ou [Drop set] = drop sets immédiats (setType: "drop"), ne comptent PAS dans les records
- Toutes les autres séries normales : setType: "normal"

FORMAT DE SORTIE :
{
  "title": "nom de la séance (avant le tiret)",
  "type": "type de séance (après le tiret, ex: Dos)",
  "date": "date brute trouvée dans le texte",
  "exercises": [
    {
      "name": "nom exact de l'exercice",
      "muscleGroup": "Pecs|Dos|Jambes|Épaules|Bras|Abdos|Cardio|Autre",
      "exoType": "weight|reps|time|cardio",
      "sets": [
        {
          "weight": 100,
          "reps": 5,
          "setType": "normal",
          "rpe": 8.5
        }
      ]
    }
  ]
}

RÈGLES DE CLASSIFICATION :
- exoType "weight" : exercices avec poids + reps (bench, squat, rowing...)
- exoType "reps" : poids de corps avec reps (pompes, tractions, dips...)
- exoType "time" : exercices chronométrés en secondes (planche, gainage...)
- exoType "cardio" : distance + temps (tapis, vélo, natation...)

Pour "time", les sets ont : { "duration": 60 } (en secondes)
Pour "cardio", les sets ont : { "distance": 1.5, "duration": 720 } (km et secondes)
Pour "reps" sans poids : { "reps": 10, "isWarmup": false }

muscleGroup :
- Pecs : bench, développé couché, écarté, pompes, dips pec
- Dos : traction, tirage, rowing, lat, tirage vers visage
- Jambes : squat, deadlift, leg press, fente, hip thrust, leg curl, mollets
- Épaules : militaire, élévation latérale, face pull, tirage vers visage, arnold
- Bras : curl biceps, extension triceps, skull crusher, dips triceps
- Abdos : planche, gainage, crunch, relevé de genoux, russian twist
- Cardio : tapis roulant, vélo, natation, rameur, escalier
- Autre : tout le reste`;

async function extractWithAI(rawText) {
  if (!cloudSyncEnabled) return null;
  try {
    const d = await callAnthropicProxy({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, system: AI_EXTRACT_SYSTEM, messages: [{ role: 'user', content: rawText }] });
    if (d.error) { console.warn('AI extract error:', d.error); return null; }
    const raw = d.content.map(b => b.text || '').join('').trim();
    return JSON.parse(raw);
  } catch (e) { console.warn('AI extract failed:', e); return null; }
}

function buildSessionFromAI(parsed, rawText) {
  const lines = rawText.split('\n');
  const firstLine = lines[0].trim();
  let sessionTimestamp = Date.now();
  let sessionDate = new Date().toLocaleDateString('fr-FR');
  if (parsed.date) {
    sessionTimestamp = parseHevyDate(parsed.date);
    sessionDate = parsed.date;
  } else {
    const dateLine = lines.find(l => l.toLowerCase().startsWith('le ') && l.includes('202'));
    if (dateLine) { sessionDate = dateLine.trim(); sessionTimestamp = parseHevyDate(sessionDate); }
  }
  const session = { date: sessionDate, shortDate: formatDate(sessionTimestamp), timestamp: sessionTimestamp, volume: 0, exercises: [], id: generateId(), title: parsed.title || firstLine.split('-')[0].trim(), type: parsed.type || '', day: DAYS_FULL[new Date(sessionTimestamp).getDay()] };
  (parsed.exercises || []).forEach(exo => {
    const exoType = exo.exoType || 'weight';
    const isCardio = exoType === 'cardio', isTime = exoType === 'time', isReps = exoType === 'reps';
    const obj = { name: exo.name, muscleGroup: exo.muscleGroup || getMuscleGroup(exo.name), exoType, isCardio, isTime, isReps, maxRM: 0, maxReps: 0, totalReps: 0, maxTime: 0, distance: 0, sets: 0, repRecords: {}, series: [], allSets: [], _rawSets: [] };
    (exo.sets || []).forEach(s => {
      const isW      = s.isWarmup || s.setType === 'warmup';
      const isAbandon= s.setType === 'abandon';
      const isDrop   = s.setType === 'drop';
      const countForRecord = !isW && !isAbandon && !isDrop;
      if (countForRecord) obj.sets++;
      const _aiSetType = isW ? 'warmup' : isAbandon ? 'failure' : isDrop ? 'drop' : 'normal';
      if (exoType === 'weight') {
        const w = s.weight||0, r = s.reps||0;
        obj.allSets.push({ weight: w, reps: r, setType: _aiSetType, rpe: s.rpe || null });
        if (countForRecord && w>0 && r>0) obj._rawSets.push({weight:w, reps:r});
        if (w>0&&r>0) { session.volume+=w*r; if(countForRecord){const rKey=String(r);if(!obj.repRecords[rKey]||w>obj.repRecords[rKey])obj.repRecords[rKey]=w;const ex=obj.series.find(x=>x.reps===r);if(ex){if(w>ex.weight)ex.weight=w;}else obj.series.push({weight:w,reps:r,date:sessionTimestamp});const rm=calcE1RM(w,r);if(rm>obj.maxRM){obj.maxRM=rm;obj.maxRMDate=sessionTimestamp;}}}
      } else if (exoType==='reps') {
        if(countForRecord){const r=s.reps||0,w=s.weight||0;obj.totalReps+=r;if(r>obj.maxReps){obj.maxReps=r;obj.maxRepsDate=sessionTimestamp;}if(w>0){session.volume+=w*r;const rm=calcE1RM(w,r);if(rm>obj.maxRM){obj.maxRM=rm;obj.maxRMDate=sessionTimestamp;}const rKey=String(r);if(!obj.repRecords[rKey]||w>obj.repRecords[rKey])obj.repRecords[rKey]=w;}}
      } else if (exoType==='time') {
        if(countForRecord){const t=s.duration||0;if(t>obj.maxTime){obj.maxTime=t;obj.maxTimeDate=sessionTimestamp;}session.volume+=t/10;}
      } else if (exoType==='cardio') {
        const d=s.distance||0,t=s.duration||0;if(d>obj.distance)obj.distance=d;if(t>obj.maxTime){obj.maxTime=t;obj.cardioDate=sessionTimestamp;}
      }
    });
    session.exercises.push(obj);
  });
  return session;
}

function processHevy() {
  const text = document.getElementById('hevyPaste').value;
  if (!text.trim()) return;
  const lines = text.split('\n');
  const firstLine = lines[0].trim();
  let sessionTimestamp = Date.now(), sessionDate = new Date().toLocaleDateString('fr-FR');
  let sessionTitle = '', sessionType = '';
  if (firstLine && !firstLine.toLowerCase().startsWith('le ')) { const parts = firstLine.split('-').map(p=>p.trim()); sessionTitle=parts[0]; if(parts[1])sessionType=parts[1]; }
  const dateLine = lines.find(l => l.toLowerCase().startsWith('le ') && l.includes('202'));
  if (dateLine) { sessionDate = dateLine.trim(); sessionTimestamp = parseHevyDate(sessionDate); }
  const shortDate = formatDate(sessionTimestamp);
  // Normaliser le dateKey pour la déduplication : utiliser le shortDate (dd/mm/yyyy)
  const dateKey = shortDate;
  const doImport = () => {
    executeImport(lines,sessionDate,sessionTimestamp,sessionTitle,sessionType,shortDate,firstLine);
  };
  if (db.logs.some(l => (l.shortDate || formatDate(l.timestamp)) === dateKey)) { showModal('Une séance du '+dateKey+' existe déjà. Continuer ?', 'Confirmer', 'var(--blue)', () => { db.logs = db.logs.filter(l => (l.shortDate || formatDate(l.timestamp)) !== dateKey); doImport(); }); return; }
  doImport();
}


// ── Détection de séries suspectes (erreurs de saisie) ──────────
function detectSuspiciousSets(session) {
  const suspicious = [];

  for (const exo of session.exercises) {
    if (exo.isCardio || exo.isTime || exo.isReps) continue;
    if (!exo.maxRM || exo.maxRM <= 0) continue;

    const rawSets = (exo._rawSets && exo._rawSets.length > 0) ? exo._rawSets : exo.series || [];
    if (!rawSets.length) continue;

    // Collecter l'historique pour cet exercice
    const histE1RMs = [];
    const histWeights = [];
    db.logs.forEach(log => {
      log.exercises.forEach(e => {
        if (!matchExoName(e.name, exo.name)) return;
        if (e.maxRM > 0) histE1RMs.push(e.maxRM);
        if (e.repRecords) Object.values(e.repRecords).forEach(w => { if (w > 0) histWeights.push(w); });
        if (e.series) e.series.forEach(s => { if (s.weight > 0) histWeights.push(s.weight); });
      });
    });

    // ── Critère 1 : Saut d'e1RM vs historique (>30% au-dessus du meilleur + hors IQR) ──
    if (histE1RMs.length >= 2) {
      const sorted = [...histE1RMs].sort((a, b) => a - b);
      const prevBest = sorted[sorted.length - 1];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1 || prevBest * 0.15;
      const upperFence = q3 + 2 * iqr;

      if (exo.maxRM > prevBest * 1.3 && exo.maxRM > upperFence) {
        // Identifier quelle(s) série(s) causent l'anomalie
        for (const s of rawSets) {
          const rm = calcE1RM(s.weight, s.reps);
          if (rm > prevBest * 1.3) {
            if (!suspicious.some(x => x.exoName === exo.name && x.weight === s.weight && x.reps === s.reps)) {
              suspicious.push({
                exoName: exo.name, exoRef: exo,
                weight: s.weight, reps: s.reps, e1rm: rm,
                reason: 'e1rm_jump', prevBest: Math.round(prevBest)
              });
            }
          }
        }
      }
    }

    // ── Critère 2 : Poids aberrant vs historique (IQR sur les poids) ──
    if (histWeights.length >= 5) {
      const sorted = [...histWeights].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1 || q3 * 0.2;
      const upperFence = q3 + 2.5 * iqr;

      for (const s of rawSets) {
        if (s.weight > upperFence && s.weight > q3 * 1.5) {
          if (!suspicious.some(x => x.exoName === exo.name && x.weight === s.weight && x.reps === s.reps)) {
            suspicious.push({
              exoName: exo.name, exoRef: exo,
              weight: s.weight, reps: s.reps, e1rm: calcE1RM(s.weight, s.reps),
              reason: 'weight_outlier', upperFence: Math.round(upperFence), q3: Math.round(q3)
            });
          }
        }
      }
    }

    // ── Critère 3 : Anomalie intra-session (une série >2× la médiane des autres) ──
    if (rawSets.length >= 3) {
      const weights = rawSets.filter(s => s.weight > 0).map(s => s.weight);
      if (weights.length >= 3) {
        const sortedW = [...weights].sort((a, b) => a - b);
        const medianW = sortedW[Math.floor(sortedW.length / 2)];
        for (const s of rawSets) {
          if (s.weight > medianW * 2 && s.weight - medianW > 20) {
            if (!suspicious.some(x => x.exoName === exo.name && x.weight === s.weight && x.reps === s.reps)) {
              suspicious.push({
                exoName: exo.name, exoRef: exo,
                weight: s.weight, reps: s.reps, e1rm: calcE1RM(s.weight, s.reps),
                reason: 'intra_session', median: Math.round(medianW)
              });
            }
          }
        }
      }
    }
  }

  return suspicious;
}

function buildSuspiciousMessage(item) {
  let msg = `<div style="text-align:left;line-height:1.7;">`;
  msg += `<div style="font-size:15px;font-weight:700;margin-bottom:8px;">⚠️ Série suspecte détectée</div>`;
  msg += `<div style="font-size:13px;"><strong style="color:var(--blue);">${item.exoName}</strong></div>`;
  msg += `<div style="font-size:14px;font-weight:700;color:var(--orange);margin:4px 0;">${item.weight}kg × ${item.reps} reps</div>`;
  msg += `<div style="font-size:12px;color:var(--sub);">e1RM calculé : <strong style="color:var(--text);">${Math.round(item.e1rm)}kg</strong></div>`;

  if (item.reason === 'e1rm_jump') {
    msg += `<div style="margin-top:6px;padding:6px 8px;background:rgba(255,159,10,0.08);border-radius:8px;font-size:11px;color:var(--orange);">`;
    msg += `Le e1RM fait un bond de <strong>+${Math.round(item.e1rm - item.prevBest)}kg</strong> vs le record précédent (${item.prevBest}kg) — soit +${Math.round((item.e1rm/item.prevBest - 1)*100)}%`;
    msg += `</div>`;
  } else if (item.reason === 'weight_outlier') {
    msg += `<div style="margin-top:6px;padding:6px 8px;background:rgba(255,159,10,0.08);border-radius:8px;font-size:11px;color:var(--orange);">`;
    msg += `Ce poids est bien au-dessus de ta fourchette habituelle (max habituel ~${item.q3}kg)`;
    msg += `</div>`;
  } else if (item.reason === 'intra_session') {
    msg += `<div style="margin-top:6px;padding:6px 8px;background:rgba(255,159,10,0.08);border-radius:8px;font-size:11px;color:var(--orange);">`;
    msg += `Ce poids est anormalement élevé par rapport aux autres séries de cet exercice (médiane : ${item.median}kg)`;
    msg += `</div>`;
  }

  msg += `<div style="margin-top:8px;font-size:11px;color:var(--sub);">Garder cette série dans tes records ?</div>`;
  msg += `</div>`;
  return msg;
}

function removeSuspiciousSet(exo, weight, reps) {
  // Retirer la série des repRecords
  const rKey = String(reps);
  if (exo.repRecords && exo.repRecords[rKey] === weight) {
    delete exo.repRecords[rKey];
  }
  // Retirer de series
  if (exo.series) {
    exo.series = exo.series.filter(s => !(s.weight === weight && s.reps === reps));
  }
  // Retirer de _rawSets
  if (exo._rawSets) {
    const idx = exo._rawSets.findIndex(s => s.weight === weight && s.reps === reps);
    if (idx >= 0) exo._rawSets.splice(idx, 1);
  }
  // Recalculer maxRM depuis les données restantes
  exo.maxRM = 0;
  if (exo.series) {
    exo.series.forEach(s => {
      const rm = calcE1RM(s.weight, s.reps);
      if (rm > exo.maxRM) { exo.maxRM = rm; exo.maxRMDate = s.date; }
    });
  }
  if (exo.repRecords) {
    Object.entries(exo.repRecords).forEach(([rk, w]) => {
      const rm = calcE1RM(w, parseInt(rk));
      if (rm > exo.maxRM) exo.maxRM = rm;
    });
  }
}

function processSuspiciousSets(list, idx, callback) {
  if (idx >= list.length) { callback(); return; }
  const item = list[idx];
  const msg = buildSuspiciousMessage(item);
  showModal(msg, '✓ Garder', 'var(--blue)', () => {
    // Gardé — on passe au suivant
    processSuspiciousSets(list, idx + 1, callback);
  }, () => {
    // Rejeté — supprimer la série et recalculer
    removeSuspiciousSet(item.exoRef, item.weight, item.reps);
    processSuspiciousSets(list, idx + 1, callback);
  });
}

function finalizeSession(session, rawText) {
  session.exercises = session.exercises.filter(e => !SESSION_NAME_BLACKLIST.test(e.name.toLowerCase()));

  // Traiter les "1RM est:" en attente — demander confirmation pour chaque
  const pending = session._pending1RM || [];
  delete session._pending1RM;

  const afterPending = () => {
    // Détecter les séries suspectes (erreurs de saisie potentielles)
    const suspicious = detectSuspiciousSets(session);
    // _rawSets sera nettoyé dans doFinalizeSession (après détection suspecte)
    if (suspicious.length > 0) {
      processSuspiciousSets(suspicious, 0, () => doFinalizeSession(session));
    } else {
      doFinalizeSession(session);
    }
  };

  if (pending.length) {
    processPending1RM(pending, 0, afterPending);
  } else {
    afterPending();
  }
}

function processPending1RM(list, idx, callback) {
  if (idx >= list.length) { callback(); return; }
  const item = list[idx];
  const exo = item.exoRef;
  const currentE1RM = exo.maxRM || 0;
  const msg = `Hevy indique un 1RM de <strong>${item.rm}kg</strong> pour <strong>${item.exoName}</strong>.` +
    (currentE1RM > 0 ? `<br>e1RM calculé depuis tes séries : ${Math.round(currentE1RM)}kg.` : '') +
    `<br><br>Accepter ce 1RM ?`;
  showModal(msg, 'Accepter', 'var(--blue)', () => {
    if (item.rm > exo.maxRM) exo.maxRM = item.rm;
    processPending1RM(list, idx + 1, callback);
  }, () => {
    // Refusé — on garde le e1RM calculé des séries
    processPending1RM(list, idx + 1, callback);
  });
}

function doFinalizeSession(session) {
  // Nettoyer les _rawSets temporaires avant de sauvegarder (allSets est conservé)
  session.exercises.forEach(e => { delete e._rawSets; });
  newPRs = { bench: false, squat: false, deadlift: false };

  // Collecter tous les nouveaux records AVANT d'écraser l'historique
  const allPRs = [];
  session.exercises.forEach(exo => {
    if (exo.isCardio || exo.isTime) return;
    const type = getSBDType(exo.name);

    // 1. e1RM all-time
    const isVariant = VARIANT_KEYWORDS.some(kw => exo.name.toLowerCase().includes(kw));
    const prevE1RM = findPreviousBestE1RM(exo.name, session.timestamp);
    if (exo.maxRM > 0 && exo.maxRM > prevE1RM) {
      allPRs.push({ exo: exo.name, kind: 'e1rm', old: prevE1RM, new: exo.maxRM, delta: Math.round((exo.maxRM - prevE1RM)*10)/10, isSBD: !!type });
      // Les variantes (pause, spoto, etc.) ne comptent pas pour les records SBD
      if (type && !isVariant) { newPRs[type] = true; }
    }

    // 2. Records par nb de répétitions (ex: nouveau record à 5 reps)
    if (exo.repRecords) {
      Object.entries(exo.repRecords).forEach(([rKey, w]) => {
        const reps = parseInt(rKey);
        const prevBest = getPrevRepRecord(exo.name, reps, session.timestamp);
        if (w > prevBest) {
          allPRs.push({ exo: exo.name, kind: 'rep', reps, old: prevBest, new: w, isSBD: !!type });
        }
      });
    }

    // 3. Record de reps (poids de corps)
    if (exo.isReps && exo.maxReps > 0) {
      const prevMaxReps = getPrevMaxReps(exo.name, session.timestamp);
      if (exo.maxReps > prevMaxReps) {
        allPRs.push({ exo: exo.name, kind: 'reps', old: prevMaxReps, new: exo.maxReps });
      }
    }
  });

  const oldPRsImport = { bench: db.bestPR.bench, squat: db.bestPR.squat, deadlift: db.bestPR.deadlift };

  db.logs.unshift(session);
  db.logs.sort((a,b)=>b.timestamp-a.timestamp);
  saveDBNow();
  document.getElementById('hevyPaste').value='';
  showImportSummary(session);
  showToast('✓ Séance importée');
  saveAlgoDebrief(session);
  checkAndGenerateWeeklyReport();
  refreshUI();

  // Social: publish session + PRs
  try {
    publishSessionActivity(session);
    recalcBestPR();
    SBD_TYPES.forEach(type => {
      if (db.bestPR[type] > oldPRsImport[type] && oldPRsImport[type] > 0) {
        const name = type === 'bench' ? 'Développé couché' : type === 'squat' ? 'Squat' : 'Soulevé de terre';
        publishPRActivity(name, db.bestPR[type], oldPRsImport[type]);
      }
    });
    updateLeaderboardSnapshot();
  } catch(e) {}

  // Afficher les modales de PR en séquence (après un court délai pour laisser l'UI se rendre)
  if (allPRs.length > 0) {
    setTimeout(() => showPRModals(allPRs, 0), 500);
  }
}

function getPrevRepRecord(exoName, reps, beforeTs) {
  let best = 0;
  db.logs.forEach(log => {
    if (log.timestamp >= beforeTs) return;
    log.exercises.forEach(exo => {
      if (!matchExoName(exo.name, exoName)) return;
      const w = (exo.repRecords || {})[String(reps)] || 0;
      if (w > best) best = w;
    });
  });
  return best;
}

function getPrevMaxReps(exoName, beforeTs) {
  let best = 0;
  db.logs.forEach(log => {
    if (log.timestamp >= beforeTs) return;
    log.exercises.forEach(exo => {
      if (!matchExoName(exo.name, exoName)) return;
      if ((exo.maxReps || 0) > best) best = exo.maxReps;
    });
  });
  return best;
}

function showPRModals(prs, idx) {
  if (idx >= prs.length) return;
  const pr = prs[idx];
  const next = () => showPRModals(prs, idx + 1);

  let title, detail, emoji;
  if (pr.kind === 'e1rm') {
    emoji = pr.isSBD ? '🏆' : '📈';
    title = `${emoji} Nouveau record — ${pr.exo}`;
    if (pr.old > 0) {
      detail = `e1RM : <strong>${Math.round(pr.old)}kg → <span style="color:var(--green)">${Math.round(pr.new)}kg</span></strong> (+${pr.delta}kg)`;
    } else {
      detail = `Premier e1RM enregistré : <strong style="color:var(--green)">${Math.round(pr.new)}kg</strong>`;
    }
  } else if (pr.kind === 'rep') {
    emoji = '💪';
    title = `${emoji} Record à ${pr.reps} rep${pr.reps > 1 ? 's' : ''} — ${pr.exo}`;
    if (pr.old > 0) {
      detail = `${pr.reps} rep${pr.reps > 1 ? 's' : ''} : <strong>${pr.old}kg → <span style="color:var(--green)">${pr.new}kg</span></strong>`;
    } else {
      detail = `Premier record à ${pr.reps} rep${pr.reps > 1 ? 's' : ''} : <strong style="color:var(--green)">${pr.new}kg</strong>`;
    }
  } else {
    emoji = '🔥';
    title = `${emoji} Record de reps — ${pr.exo}`;
    detail = pr.old > 0
      ? `Max reps : <strong>${pr.old} → <span style="color:var(--green)">${pr.new}</span></strong>`
      : `Premier record : <strong style="color:var(--green)">${pr.new} reps</strong>`;
  }

  const remaining = prs.length - idx - 1;
  const remainingText = remaining > 0 ? `<div style="font-size:11px;color:var(--sub);margin-top:8px;">+${remaining} autre${remaining > 1 ? 's' : ''} record${remaining > 1 ? 's' : ''} à valider</div>` : '';

  showPRModal(title, detail + remainingText, next);
}

function showPRModal(title, detail, onNext) {
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `
    <div class="modal-box" style="text-align:center;max-width:320px;">
      <div style="font-size:22px;margin-bottom:8px;">${title.split(' ')[0]}</div>
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px;">${title.split(' ').slice(1).join(' ')}</div>
      <div style="font-size:13px;color:var(--sub);margin-bottom:18px;line-height:1.5;">${detail}</div>
      <div style="display:flex;gap:8px;">
        <button class="pr-dismiss" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--sub);font-size:13px;font-weight:600;cursor:pointer;">Ignorer</button>
        <button class="pr-confirm" style="flex:1;padding:10px;border-radius:10px;border:none;background:var(--green);color:#000;font-size:13px;font-weight:700;cursor:pointer;">✓ Valider</button>
      </div>
    </div>`;
  document.body.appendChild(o);
  const dismiss = () => { o.remove(); onNext(); };
  o.querySelector('.pr-dismiss').onclick = dismiss;
  o.querySelector('.pr-confirm').onclick = dismiss;
}

function executeImport(lines, sessionDate, sessionTimestamp, sessionTitle, sessionType, shortDate, firstLine) {
  const session = { date:sessionDate, shortDate, timestamp:sessionTimestamp, volume:0, exercises:[], id:generateId(), title:sessionTitle, type:sessionType, day:DAYS_FULL[new Date(sessionTimestamp).getDay()] };
  let currExo = null;
  for (const line of lines) {
    const l = line.trim().toLowerCase();
    if (!l||l.includes('hevy')||(l.startsWith('le ')&&l.includes('202'))||l.includes('http')||line.trim()===firstLine) continue;
    if (/^\d+\/\d+\/\d+/.test(l)||(l.includes('"')&&(/\d+\/\d+\/\d+/.test(l)||l.includes('sec')||l.includes('iso')))) continue;
    if (l.startsWith('@')) continue;
    const isSerieData = l.startsWith('série')&&(l.includes('kg x')||l.includes('km')||l.includes('sec')||l.includes('min')||l.includes('répétitions')||l.includes('repetitions')||l.includes('reps')||/\d+s\b/.test(l));
    const isCompressedData = /^\d+x/.test(l)||/^\d+[.,]\d+km/.test(l)||l.includes('1rm est:');
    if (!isSerieData&&!isCompressedData) {
      if (currExo&&(currExo.maxRM>0||currExo.isCardio||currExo.isTime||currExo.isReps||currExo.sets>0)) session.exercises.push(currExo);
      const exoType=getExoType(line.trim());
      if (exoType==='session_name'){currExo=null;continue;}
      const cleanName=line.trim().replace(/\s*"[^"]*"\s*$/g,'').trim();
      const isCardio=exoType==='cardio'||exoType==='cardio_stairs';
      const isTime=exoType==='time',isReps=exoType==='reps';
      currExo={name:cleanName,maxRM:0,sets:0,isCardio,isTime,isReps,distance:0,maxTime:0,maxReps:0,totalReps:0,repRecords:{},series:[],allSets:[],exoType,_rawSets:[]};
      continue;
    }
    if (!currExo) continue;
    if (l.startsWith('série')&&l.includes('kg x')&&!currExo.isCardio&&!currExo.isReps) {
      const m=l.match(/(\d+\.?\d*)\s*kg\s*x\s*(\d+)/i);
      if(m){const w=parseFloat(m[1]),r=parseInt(m[2]);
        const isW      = line.includes('[Échauffement]')||line.includes('[échauffement]');
        // Abandon = poussé à l'échec volontaire ; Drop = série descendante immédiate
        // Ces séries ne comptent PAS pour les records (elles ne reflètent pas une vraie performance)
        const isAbandon= /\[abandon\]/i.test(line);
        const isDrop   = /\[drop(\s*set)?\]/i.test(line);
        const countForRecord = !isW && !isAbandon && !isDrop;
        const _setType = isW ? 'warmup' : isAbandon ? 'failure' : isDrop ? 'drop' : 'normal';
        const _rpeMatch = line.match(/RPE\s*:?\s*(\d+\.?\d*)/i);
        currExo.allSets.push({ weight: w, reps: r, setType: _setType, rpe: _rpeMatch ? parseFloat(_rpeMatch[1]) : null });
        if(countForRecord && w>0 && r>0) currExo._rawSets.push({weight:w, reps:r});
        session.volume+=w*r;
        if(countForRecord){currExo.sets++;const rKey=String(r);if(!currExo.repRecords[rKey]||w>currExo.repRecords[rKey])currExo.repRecords[rKey]=w;const ex=currExo.series.find(s=>s.reps===r);if(ex){if(w>ex.weight){ex.weight=w;ex.date=sessionTimestamp;}}else currExo.series.push({weight:w,reps:r,date:sessionTimestamp});const rm=calcE1RM(w,r);if(rm>currExo.maxRM){currExo.maxRM=rm;currExo.maxRMDate=sessionTimestamp;}}
        else if(isW){/* warmup : volume comptabilisé mais pas les records */}
        }
    } else if (currExo.isReps&&l.startsWith('série')) {
      const repMatch=l.match(/(\d+)\s*r[eé]p[eé]?t?i?t?i?o?n?s?/i)||l.match(/x\s*(\d+)/i)||l.match(/(\d+)\s*reps?\b/i);
      const kgMatch=l.match(/(\d+\.?\d*)\s*kg/i);
      if(repMatch){const reps=parseInt(repMatch[1]);const w=kgMatch?parseFloat(kgMatch[1]):0;currExo.sets++;currExo.totalReps+=reps;if(reps>currExo.maxReps){currExo.maxReps=reps;currExo.maxRepsDate=sessionTimestamp;}if(w>0){session.volume+=w*reps;const rm=calcE1RM(w,reps);if(rm>currExo.maxRM){currExo.maxRM=rm;currExo.maxRMDate=sessionTimestamp;}const rKey=String(reps);if(!currExo.repRecords[rKey]||w>currExo.repRecords[rKey])currExo.repRecords[rKey]=w;}}else{currExo.sets++;}
    } else if (l.startsWith('série')&&l.includes('km')&&currExo.isCardio) {
      parseCardioLine(l,currExo,sessionTimestamp);
    } else if (l.startsWith('série')&&(l.includes('min')||l.includes('sec')||/\d+s\b/.test(l))&&(currExo.isTime||currExo.exoType==='time')) {
      parsePlankLine(l,currExo,session,sessionTimestamp);
    } else if (l.startsWith('série')&&l.includes('sec')&&!currExo.isCardio&&!currExo.maxRM) {
      const sm=l.match(/(\d+)\s*sec/i);if(sm){currExo.isTime=true;const t=parseInt(sm[1]);if(t>(currExo.maxTime||0)){currExo.maxTime=t;currExo.maxTimeDate=sessionTimestamp;}currExo.sets++;session.volume+=t/10;}
    } else if (l.includes('1rm est:')&&!currExo.isCardio) {
      const m2=l.match(/(\d+)\s*kg/i);
      if(m2){
        const rm=parseInt(m2[1]);
        // Stocker pour confirmation ultérieure au lieu d'appliquer directement
        if(!session._pending1RM) session._pending1RM=[];
        session._pending1RM.push({exoName:currExo.name, rm, exoRef:currExo});
      }
    } else if (/\d+x/.test(l)&&!currExo.isCardio) {
      const mx=l.match(/\d+x/g);if(mx)currExo.sets=parseInt(mx[mx.length-1]);
    }
  }
  if (currExo&&(currExo.maxRM>0||currExo.isCardio||currExo.isTime||currExo.isReps||currExo.sets>0)) session.exercises.push(currExo);
  finalizeSession(session, lines.join('\n'));
}

function parseCardioLine(l, currExo, ts) {
  const km=l.match(/(\d+[.,]\d*|\d+)\s*km/);
  const hm=l.match(/(\d+)\s*h\s*(\d+)\s*m/i);const mm=l.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/i);const ms=l.match(/(\d+)\s*m(?:in)?(?:\s*(\d+)\s*s)?/i);const colon=l.match(/(\d+):(\d+):?(\d+)?/);
  let totalSec=null;
  if(hm)totalSec=parseInt(hm[1])*3600+parseInt(hm[2])*60;else if(mm)totalSec=parseInt(mm[1])*60+parseInt(mm[2]);else if(colon&&colon[3])totalSec=parseInt(colon[1])*3600+parseInt(colon[2])*60+parseInt(colon[3]);else if(colon)totalSec=parseInt(colon[1])*60+parseInt(colon[2]);else if(ms)totalSec=parseInt(ms[1])*60+(ms[2]?parseInt(ms[2]):0);
  if(km){const d=parseFloat(km[1].replace(',','.'));if(d>(currExo.distance||0))currExo.distance=d;if(totalSec){const kmh=d/(totalSec/3600);const curKmh=currExo.distance&&currExo.maxTime?currExo.distance/(currExo.maxTime/3600):0;if(kmh>curKmh||!currExo.maxTime){currExo.maxTime=totalSec;currExo.cardioDate=ts;}}}else if(totalSec){if(totalSec>(currExo.maxTime||0)){currExo.maxTime=totalSec;currExo.cardioDate=ts;}}
  if(!currExo.sets)currExo.sets=1;else currExo.sets++;
}

function parsePlankLine(l, currExo, session, ts) {
  const hm=l.match(/(\d+)\s*h\s*(\d+)\s*m/i);const mm=l.match(/(\d+)\s*m(?:in)?\s*(\d+)\s*s/i);const mOnly=l.match(/(\d+)\s*m(?:in)?(?!\d)/i);const sOnly=l.match(/(\d+)\s*s(?:ec)?(?!\d)/i);
  let t=0;
  if(hm)t=parseInt(hm[1])*3600+parseInt(hm[2])*60;else if(mm)t=parseInt(mm[1])*60+parseInt(mm[2]);else if(mOnly)t=parseInt(mOnly[1])*60+(sOnly?parseInt(sOnly[1]):0);else if(sOnly)t=parseInt(sOnly[1]);
  if(t>0){currExo.isTime=true;if(t>(currExo.maxTime||0)){currExo.maxTime=t;currExo.maxTimeDate=ts;}currExo.sets=(currExo.sets||0)+1;session.volume+=t/10;}
}

function showImportSummary(session) {
  document.getElementById('importSummary').style.display='block';
  const ts=session.type?' - '+session.type:'';
  document.getElementById('importDetails').innerHTML='<div style="padding:10px;background:var(--surface);border-radius:8px;position:relative;"><button onclick="deleteLog(\''+session.id+'\')" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--sub);cursor:pointer;font-size:18px;">✕</button><p style="margin:0 0 8px;font-size:13px;"><strong>'+session.title+ts+' - '+session.shortDate+'</strong></p><p style="margin:0 0 8px;font-size:12px;color:var(--purple);"><strong>Volume: '+(session.volume/1000).toFixed(1)+'t</strong></p><p style="margin:0;font-size:11px;color:var(--sub);">'+session.exercises.length+' exercice(s)</p></div>';
}

function deleteLog(logId) {
  showModal('Supprimer cette séance ?','Supprimer','var(--red)',()=>{db.logs=db.logs.filter(l=>l.id!==logId);db.reports=db.reports.filter(r=>!(r.type==='debrief'&&r.sessionId===logId));saveDBNow();document.getElementById('importSummary').style.display='none';document.getElementById('importDetails').innerHTML='';document.getElementById('hevyPaste').value='';document.getElementById('aiImportAnalysis').style.display='none';refreshUI();showToast('✓ Séance supprimée');});
}



// ── ALGO REPORTS : Debrief Séance + Bilan Hebdo ───────────────
// Stockés dans db.reports avec TTL 7j, affichés dans "Rapports récents"

function generateAlgoSessionDebrief(session) {
  if (!session || !session.exercises || !session.exercises.length) return null;
  const exos = session.exercises.filter(e => !e.isCardio);
  const cardioExos = session.exercises.filter(e => e.isCardio);
  const totalVol = session.volume || 0;
  const nbExos = session.exercises.length;
  const nbSets = session.exercises.reduce((s,e) => s + (e.sets||0), 0);
  const date = session.shortDate || session.date || '';
  const bw = db.user.bw || 80;

  // ── PRs ──
  const prs = [];
  session.exercises.forEach(exo => {
    if (!exo.maxRM || exo.maxRM <= 0) return;
    const prev = findPreviousBestE1RM(exo.name, session.timestamp);
    if (prev > 0 && exo.maxRM > prev) {
      prs.push({ name: exo.name, old: prev, new: exo.maxRM, delta: Math.round((exo.maxRM - prev)*10)/10 });
    } else if (prev === 0) {
      prs.push({ name: exo.name, old: 0, new: exo.maxRM, delta: 0, isFirst: true });
    }
  });

  // ── Sub-muscle groups ──
  const subMuscleMap = {};
  const parentMuscleMap = {};
  session.exercises.forEach(e => {
    const mg = getMuscleGroup(e.name);
    const parent = getMuscleGroupParent(mg);
    subMuscleMap[mg] = (subMuscleMap[mg]||0) + (e.sets||1);
    if (!parentMuscleMap[parent]) parentMuscleMap[parent] = { subs: new Set(), sets: 0 };
    parentMuscleMap[parent].sets += (e.sets||1);
    if (mg !== parent) parentMuscleMap[parent].subs.add(mg);
  });

  // ── Comparison vs last session per exercise ──
  // Pre-sort prior logs once (descending by timestamp) instead of re-scanning for each exercise
  const _priorLogs = db.logs.filter(l => l.timestamp < session.timestamp && l.id !== session.id)
    .sort((a,b) => b.timestamp - a.timestamp);
  const exoComparisons = [];
  session.exercises.forEach(exo => {
    if (exo.isCardio || exo.isTime) return;
    let prevExo = null, prevDate = '';
    for (const log of _priorLogs) {
      const match = log.exercises.find(e => matchExoName(e.name, exo.name));
      if (match) { prevExo = match; prevDate = log.shortDate || log.date || ''; break; }
    }
    const comp = { name: exo.name, e1rm: exo.maxRM || 0, sets: exo.sets || 0 };
    if (prevExo) {
      comp.prevE1RM = prevExo.maxRM || 0;
      comp.prevSets = prevExo.sets || 0;
      comp.prevDate = prevDate;
      if (comp.e1rm > 0 && comp.prevE1RM > 0) {
        comp.e1rmDelta = Math.round((comp.e1rm - comp.prevE1RM)*10)/10;
      }
    }
    // Strength level
    const sl = getStrengthLevel(exo.name, exo.maxRM, bw);
    if (sl) comp.strengthLevel = sl;
    exoComparisons.push(comp);
  });

  // ── Program compliance détaillée ──
  let compliance = null;
  let complianceScore = 0;
  const sessionDay = session.day || DAYS_FULL[new Date(session.timestamp).getDay()];
  const blocLabel = db.weeklyPlan?.blocLabel || '';
  const isDeloadBloc = blocLabel.toLowerCase().includes('deload');
  const isAccumulationBloc = blocLabel.toLowerCase().includes('accumulation');

  // Readiness adjustment for weight comparison
  const readinessAdj = session.readiness && typeof getReadinessLoadAdjustment === 'function'
    ? getReadinessLoadAdjustment(session.readiness.score) : 1;

  if (db.weeklyPlan && db.weeklyPlan.days) {
    const planDay = db.weeklyPlan.days.find(d => d.day === sessionDay && !d.rest);
    if (planDay && planDay.exercises && planDay.exercises.length > 0) {
      const planned = planDay.exercises.filter(e => !e.noData);
      const details = [];
      const missed = [];
      const extras = [];
      let nbWeightOk = 0, nbRepsOk = 0, nbSetsOk = 0;

      planned.forEach(pe => {
        const sessMatch = session.exercises.find(se => matchExoName(se.name, pe.name));
        if (!sessMatch) { missed.push(pe.name); return; }

        const plannedWorkSets = (pe.sets || []).filter(s => !s.isWarmup && !s.isBackoff);
        const sessWorkSets = (sessMatch.series || sessMatch.allSets || []).filter(s => s.setType !== 'warmup');

        const plannedWeight = plannedWorkSets[0]?.weight || 0;
        const adjustedTarget = plannedWeight > 0 ? round05(plannedWeight * readinessAdj) : 0;
        const sessMaxWeight = sessWorkSets.length ? Math.max(...sessWorkSets.map(s => s.weight || 0)) : 0;
        const plannedReps = plannedWorkSets[0]?.reps || 0;
        const plannedNbSets = plannedWorkSets.length;
        const sessNbSets = sessWorkSets.length;

        const weightOk = adjustedTarget <= 0 || (sessMaxWeight > 0 && Math.abs(sessMaxWeight - adjustedTarget) <= adjustedTarget * 0.05);
        const repsOk = plannedReps <= 0 || sessWorkSets.every(s => Math.abs((s.reps || 0) - plannedReps) <= 1);
        const setsOk = Math.abs(sessNbSets - plannedNbSets) <= 1;

        if (weightOk) nbWeightOk++;
        if (repsOk) nbRepsOk++;
        if (setsOk) nbSetsOk++;
        details.push({ name: pe.name, weightOk, repsOk, setsOk, plannedWeight: adjustedTarget, sessMaxWeight, plannedReps, plannedNbSets, sessNbSets });
      });

      session.exercises.forEach(se => {
        if (!planned.find(p => matchExoName(se.name, p.name))) extras.push(se.name);
      });

      const nbExercises = details.length;
      complianceScore = nbExercises > 0 ? Math.round(((nbWeightOk + nbRepsOk + nbSetsOk) / (nbExercises * 3)) * 100) : 0;
      compliance = {
        total: planned.length, matched: details.length, details, missed, extras,
        weightOk: nbWeightOk, repsOk: nbRepsOk, setsOk: nbSetsOk,
        complianceScore, title: planDay.title
      };
    }
  }
  // Fallback: check routine text
  if (!compliance && db.generatedProgram) {
    const planDay = db.generatedProgram.find(d => d.day === sessionDay && !d.isRest);
    if (planDay && planDay.exos && planDay.exos.length > 0) {
      let matched = 0;
      planDay.exos.forEach(exoId => {
        const exoName = (EXO_DB[exoId] || {}).name || exoId;
        if (session.exercises.some(se => matchExoName(se.name, exoName))) matched++;
      });
      compliance = { total: planDay.exos.length, matched, weightOk: 0, complianceScore: 0, title: planDay.label };
    }
  }

  // ── Session score (0-100) ──
  let score = 40;
  if (prs.length >= 1) score += 10;
  if (prs.length >= 3) score += 10;
  if (nbSets >= 12) score += 5;
  if (nbSets >= 20) score += 5;
  const logs7 = getLogsInRange(7).filter(l => l.id !== session.id);
  const avgVol7 = logs7.length ? logs7.reduce((s,l) => s+l.volume, 0) / logs7.length : 0;
  // Volume comparison — contextualisé au bloc
  if (avgVol7 > 0) {
    const ratio = totalVol / avgVol7;
    if (isDeloadBloc) {
      // En deload, volume bas = bon
      if (ratio <= 0.7) score += 10;
      else if (ratio <= 1.0) score += 5;
    } else if (isAccumulationBloc) {
      // En accumulation, volume haut = normal
      if (ratio >= 0.8 && ratio <= 1.5) score += 10;
      else if (ratio > 1.5) score += 5;
    } else {
      if (ratio >= 0.8 && ratio <= 1.3) score += 10;
      else if (ratio > 1.3) score += 5;
    }
  } else if (totalVol > 0) { score += 10; }
  // Compliance bonus
  if (compliance && complianceScore >= 95 && !(compliance.missed||[]).length) {
    score = Math.max(score, 90); // Exécution parfaite = min 90
  } else if (compliance && complianceScore >= 80) {
    score = Math.max(score, 80);
  }
  if (compliance) {
    const pct = compliance.total > 0 ? compliance.matched / compliance.total : 0;
    score += Math.round(pct * 15);
    if (compliance.weightTotal > 0) score += Math.round((compliance.weightOk / compliance.weightTotal) * 5);
  }
  const hasProgressions = exoComparisons.filter(c => c.e1rmDelta > 0).length;
  score += Math.min(10, hasProgressions * 3);
  score = Math.min(100, Math.max(0, score));

  // ── BUILD HTML ──
  let html = '';
  const title = session.title || 'Séance';
  const scoreColor = score >= 80 ? 'green' : score >= 60 ? 'blue' : score >= 40 ? 'orange' : 'red';
  const scoreEmoji = score >= 80 ? '🔥' : score >= 60 ? '💪' : score >= 40 ? '👍' : '📈';

  // En-tête + score
  html += `<div class="ai-section"><div class="ai-section-title">${scoreEmoji} ${title} — ${date}</div>`;
  html += `<div style="display:flex;align-items:center;gap:12px;">`;
  html += `<div style="flex:1;"><strong>${nbExos}</strong> exercices · <strong>${nbSets}</strong> séries · <strong>${(totalVol/1000).toFixed(1)}t</strong> de volume`;
  if (cardioExos.length) html += ` · <strong>${cardioExos.length}</strong> cardio`;
  html += `</div>`;
  html += `<div style="text-align:center;min-width:50px;"><div style="font-size:22px;font-weight:800;color:var(--${scoreColor});">${score}</div><div style="font-size:9px;color:var(--sub);text-transform:uppercase;">Score</div></div>`;
  html += `</div></div>`;

  // Readiness pré-séance
  if (session.readiness) {
    const rs = session.readiness;
    const rsColor = rs.score >= 70 ? 'green' : rs.score >= 50 ? 'orange' : 'red';
    html += `<div class="ai-section"><div class="ai-section-title">😴 Readiness pré-séance</div>`;
    html += `Score : <span class="ai-highlight ${rsColor}">${rs.score}%</span>`;
    if (rs.score < 70) html += '<br>Charges ajustées automatiquement — bonne décision de s\'adapter.';
    html += '</div>';
  }

  // Compliance parfaite → message positif
  if (compliance && complianceScore >= 95 && !(compliance.missed||[]).length) {
    html += '<div class="ai-section" style="background:rgba(50,215,75,0.06);border-radius:10px;padding:12px;text-align:center;">';
    html += '<div style="font-size:24px;margin-bottom:6px;">🎯</div>';
    html += '<div style="font-size:14px;font-weight:700;color:var(--green);">Exécution parfaite</div>';
    html += '<div style="font-size:12px;color:var(--sub);margin-top:4px;">Tu as suivi le plan à la lettre. Continue comme ça.</div>';
    html += '</div>';
  } else if (compliance && complianceScore >= 80) {
    html += '<div class="ai-section" style="background:rgba(10,132,255,0.06);border-radius:10px;padding:8px 12px;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--blue);">👍 Très bonne séance</div>';
    html += '<div style="font-size:11px;color:var(--sub);margin-top:2px;">Quelques ajustements mineurs par rapport au plan.</div>';
    html += '</div>';
  }

  // Conformité programme détaillée
  if (compliance) {
    const pct = compliance.complianceScore || (compliance.total > 0 ? Math.round(compliance.matched / compliance.total * 100) : 0);
    const pctColor = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red';
    html += `<div class="ai-section"><div class="ai-section-title">📋 Conformité programme</div>`;
    html += `<div style="margin-bottom:4px;">Programme du jour : <strong>${compliance.title}</strong></div>`;
    html += `<div>Compliance globale : <span class="ai-highlight ${pctColor}">${pct}%</span></div>`;
    if (compliance.details && compliance.details.length) {
      html += `<div style="margin-top:4px;font-size:11px;">`;
      html += `Charges : ${compliance.weightOk||0}/${compliance.details.length} ✓ · `;
      html += `Reps : ${compliance.repsOk||0}/${compliance.details.length} ✓ · `;
      html += `Séries : ${compliance.setsOk||0}/${compliance.details.length} ✓`;
      html += `</div>`;
    }
    if (compliance.missed && compliance.missed.length) {
      html += `<div style="margin-top:4px;font-size:11px;color:var(--orange);">Manqués : ${compliance.missed.join(', ')}</div>`;
    }
    if (compliance.extras && compliance.extras.length) {
      html += `<div style="margin-top:4px;font-size:11px;color:var(--blue);">Bonus : ${compliance.extras.join(', ')}</div>`;
    }
    html += '</div>';
  }

  // Muscles travaillés (sub-groups)
  const parentEntries = Object.entries(parentMuscleMap).sort((a,b) => b[1].sets - a[1].sets);
  if (parentEntries.length) {
    html += '<div class="ai-section"><div class="ai-section-title">💪 Muscles travaillés</div>';
    parentEntries.forEach(([parent, data]) => {
      const subsArr = [...data.subs];
      if (subsArr.length > 0) {
        html += `<div style="margin-bottom:3px;"><span class="ai-highlight blue">${parent}</span> <span style="font-size:11px;color:var(--sub);">(${subsArr.join(', ')})</span> — ${data.sets} séries</div>`;
      } else {
        html += `<div style="margin-bottom:3px;"><span class="ai-highlight blue">${parent}</span> — ${data.sets} séries</div>`;
      }
    });
    html += '</div>';
  }

  // PRs
  if (prs.length) {
    html += '<div class="ai-section"><div class="ai-section-title">🏆 Records</div>';
    prs.forEach(pr => {
      if (pr.isFirst) {
        html += `<div>🆕 <strong>${pr.name}</strong> — premier e1RM : <span class="ai-highlight green">${Math.round(pr.new)}kg</span></div>`;
      } else {
        html += `<div>📈 <strong>${pr.name}</strong> : ${Math.round(pr.old)}kg → <span class="ai-highlight green">${Math.round(pr.new)}kg (+${pr.delta}kg)</span></div>`;
      }
    });
    html += '</div>';
  }

  // Détails par exercice (vs dernière séance + niveau)
  const weightExos = exoComparisons.filter(c => c.e1rm > 0);
  if (weightExos.length) {
    html += '<div class="ai-section"><div class="ai-section-title">📊 Détails par exercice</div>';
    weightExos.forEach(comp => {
      html += `<div style="margin-bottom:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">`;
      html += `<div><strong>${comp.name}</strong> — e1RM <span class="ai-highlight blue">${Math.round(comp.e1rm)}kg</span> · ${comp.sets} séries</div>`;
      // vs last session
      if (comp.prevE1RM) {
        const arrow = comp.e1rmDelta > 0 ? '↑' : comp.e1rmDelta < 0 ? '↓' : '=';
        const color = comp.e1rmDelta > 0 ? 'var(--green)' : comp.e1rmDelta < 0 ? 'var(--red)' : 'var(--sub)';
        html += `<div style="font-size:11px;color:var(--sub);">vs dernière (${comp.prevDate}) : ${Math.round(comp.prevE1RM)}kg <span style="color:${color};font-weight:600;">${arrow} ${comp.e1rmDelta > 0 ? '+' : ''}${comp.e1rmDelta}kg</span></div>`;
      }
      // strength level
      if (comp.strengthLevel) {
        const sl = comp.strengthLevel;
        html += `<div style="font-size:11px;margin-top:2px;">`;
        html += `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${sl.color}22;color:${sl.color};">${sl.label}</span>`;
        html += ` <span style="color:var(--sub);">${sl.topPct}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    });
    html += '</div>';
  }

  // Coaching contextuel enrichi — conscient du bloc
  const tips = [];
  if (avgVol7 > 0) {
    const ratio = totalVol / avgVol7;
    if (ratio > 1.3) {
      if (isAccumulationBloc) tips.push('📈 Volume en hausse comme prévu dans le bloc accumulation — bien joué 💪');
      else tips.push('⚡ Volume élevé (+' + Math.round((ratio-1)*100) + '% vs ta moyenne). Assure-toi de bien récupérer.');
    } else if (ratio < 0.6) {
      if (isDeloadBloc) tips.push('✅ Volume allégé — parfait pour le deload, ton corps récupère.');
      else tips.push('🧘 Volume léger — parfait pour un deload ou une récupération active.');
    } else {
      tips.push('✅ Volume dans ta zone habituelle — bonne régularité.');
    }
  }
  if (prs.length >= 2) tips.push('🎯 Plusieurs PRs en une séance — tu es clairement en forme ! Profite de cette dynamique.');
  else if (prs.length === 0 && exos.length > 3) tips.push('📊 Pas de record aujourd\'hui, mais la constance est ta meilleure arme. Les PRs viendront.');

  // Déséquilibre agoniste/antagoniste
  const pecSets = parentMuscleMap['Pecs'] ? parentMuscleMap['Pecs'].sets : 0;
  const dosSets = parentMuscleMap['Dos'] ? parentMuscleMap['Dos'].sets : 0;
  if (pecSets > 0 && dosSets === 0) tips.push('⚠️ Beaucoup de pecs sans dos — pense à équilibrer (rowing, tractions) pour éviter les déséquilibres posturaux.');
  if (dosSets > 0 && pecSets === 0 && session.exercises.some(e => getMuscleGroupParent(getMuscleGroup(e.name)) === 'Bras')) {
    tips.push('👌 Bonne séance dos + bras — combo efficace pour le développement du haut du corps.');
  }

  // Quadriceps vs ischio
  const quadSets = subMuscleMap['Quadriceps'] || 0;
  const ischioSets = subMuscleMap['Ischio-jambiers'] || 0;
  if (quadSets > 6 && ischioSets === 0) tips.push('⚠️ Beaucoup de quadriceps sans ischios — ajoute du leg curl ou RDL pour protéger tes genoux.');

  const plateaux = ['bench','squat','deadlift'].map(t => detectPlateau(t)).filter(Boolean);
  const _sbdDebriefNames={bench:'Bench Press (Barbell)',squat:'Squat (Barbell)',deadlift:'Deadlift (Barbell)'};
  plateaux.forEach(p => {
    const sugg = { bench: 'Spoto press, larsen press ou tempo bench', squat: 'Pause squat, pin squat ou tempo', deadlift: 'Déficit deadlift, Romanian ou block pulls' };
    let plateauTip = `📉 ${p.type.charAt(0).toUpperCase()+p.type.slice(1)} en plateau`;
    const analysis = analyzePlateauCauses(_sbdDebriefNames[p.type]||p.type);
    if (analysis && analysis.causes.length > 0) {
      plateauTip += ` — Causes : ${analysis.causes.slice(0,2).join(', ')}`;
      if (analysis.suggestions.length > 0) plateauTip += `. Ajoute : ${analysis.suggestions[0]}`;
    } else {
      plateauTip += ` — essaie : ${sugg[p.type]}`;
    }
    tips.push(plateauTip + '.');
  });
  if (nbSets > 25) tips.push('🏋️ Grosse séance (+25 séries). Vise 7-8h de sommeil et 2g/kg de protéines.');
  if (cardioExos.length && exos.length) tips.push('🏃 Combo muscu + cardio — excellent pour la santé cardiovasculaire.');

  // Compliance tips
  if (compliance && compliance.total > 0 && compliance.matched < compliance.total * 0.5) {
    tips.push('📋 Séance assez éloignée du programme prévu. Essaie de suivre le plan pour optimiser ta progression.');
  }

  if (tips.length) {
    html += '<div class="ai-section"><div class="ai-section-title">💡 Coaching</div>';
    tips.forEach(t => { html += `<div style="margin-bottom:6px;line-height:1.4;">${t}</div>`; });
    html += '</div>';
  }

  html += '<div class="ai-timestamp">Coach Algo · Debrief automatique · Sans IA</div>';
  return html;
}

// ── STRENGTH STANDARDS — Niveaux par exercice ──────────────
// Ratios e1RM / poids de corps pour classifier le niveau
// 5 niveaux: Débutant, Novice, Intermédiaire, Avancé, Élite

function generateAlgoWeeklyReport() {
  const logs7 = getLogsInRange(7);
  if (!logs7.length) return null;

  const bw = db.user.bw;
  const bench = db.bestPR.bench, squat = db.bestPR.squat, dead = db.bestPR.deadlift;
  const ipf = calcIPFGLTotal(bench, squat, dead, bw);
  const tonnage7 = logs7.reduce((s,l) => s+l.volume, 0);
  const logs14 = getLogsInRange(14);
  const tonnagePrev7 = logs14.filter(l => !logs7.includes(l)).reduce((s,l) => s+l.volume, 0);
  const nbSessions = logs7.length;

  // Muscles de la semaine
  const muscleMap = {};
  logs7.forEach(log => {
    log.exercises.forEach(e => {
      const mg = getMuscleGroup(e.name);
      muscleMap[mg] = (muscleMap[mg]||0) + (e.sets||1);
    });
  });
  const muscles = Object.entries(muscleMap).filter(([k]) => k !== 'Cardio' && k !== 'Autre').sort((a,b) => b[1]-a[1]);

  // PRs de la semaine
  const weekPRs = [];
  const now = Date.now(), oneWeek = 7*86400000;
  logs7.forEach(log => {
    log.exercises.forEach(exo => {
      if (!exo.maxRM || exo.maxRM <= 0) return;
      const prev = findPreviousBestE1RM(exo.name, log.timestamp);
      if (prev > 0 && exo.maxRM > prev) {
        weekPRs.push({ name: exo.name, delta: Math.round((exo.maxRM-prev)*10)/10 });
      }
    });
  });

  // Momentum SBD
  const momB = calcMomentum('bench'), momS = calcMomentum('squat'), momD = calcMomentum('deadlift');
  const plateaux = ['bench','squat','deadlift'].map(t => detectPlateau(t)).filter(Boolean);

  // Programme actuel : quelle semaine ?
  const weekNum = db.weeklyPlan ? db.weeklyPlan.week : null;
  const nextWeek = weekNum ? (weekNum >= 4 ? 1 : weekNum + 1) : null;

  let html = '';

  // En-tête
  html += '<div class="ai-section"><div class="ai-section-title">📊 Bilan de la semaine</div>';
  html += `<strong>${nbSessions}</strong> séance${nbSessions>1?'s':''} · <strong>${(tonnage7/1000).toFixed(1)}t</strong> de volume total`;
  if (tonnagePrev7 > 0) {
    const delta = Math.round((tonnage7/tonnagePrev7 - 1)*100);
    const color = delta > 0 ? 'green' : delta < -10 ? 'orange' : 'blue';
    html += ` · <span class="ai-highlight ${color}">${delta>0?'+':''}${delta}% vs semaine précédente</span>`;
  }
  html += '</div>';

  // Muscles
  if (muscles.length) {
    html += '<div class="ai-section"><div class="ai-section-title">💪 Répartition musculaire</div>';
    const totalSets = muscles.reduce((s,[,v]) => s+v, 0);
    muscles.forEach(([mg, sets]) => {
      const pct = Math.round(sets/totalSets*100);
      html += `<div style="margin-bottom:3px;"><strong>${mg}</strong> : ${sets} séries (${pct}%)</div>`;
    });
    // Détection déséquilibre
    const topMg = muscles[0], botMg = muscles[muscles.length-1];
    if (muscles.length >= 3 && topMg[1] > botMg[1] * 3) {
      html += `<div style="margin-top:6px;color:var(--orange);">⚠️ Déséquilibre : ${topMg[0]} surreprésenté vs ${botMg[0]}. Pense à rééquilibrer.</div>`;
    }
    html += '</div>';
  }

  // PRs
  if (weekPRs.length) {
    html += '<div class="ai-section"><div class="ai-section-title">🏆 Records de la semaine</div>';
    weekPRs.slice(0, 8).forEach(pr => {
      html += `<div>📈 <strong>${pr.name}</strong> : <span class="ai-highlight green">+${pr.delta}kg</span></div>`;
    });
    html += '</div>';
  }

  // Force & IPF
  if (ipf > 0 || momB || momS || momD) {
    html += '<div class="ai-section"><div class="ai-section-title">🏋️ Force</div>';
    if (ipf > 0) {
      const ipfLabel = ipf<300?'débutant':ipf<400?'intermédiaire':ipf<500?'avancé':'élite';
      html += `Score IPF GL : <span class="ai-highlight blue">${ipf} pts</span> (${ipfLabel})<br>`;
    }
    const moms = [momB&&`Bench ${momB>0?'+':''}${momB}kg/sem`, momS&&`Squat ${momS>0?'+':''}${momS}kg/sem`, momD&&`Dead ${momD>0?'+':''}${momD}kg/sem`].filter(Boolean);
    if (moms.length) html += `Momentum : ${moms.join(' · ')}`;
    html += '</div>';
  }

  // Alertes
  if (plateaux.length) {
    html += '<div class="ai-section"><div class="ai-section-title">⚠️ Alertes</div>';
    const sugg = {bench:'Spoto Bench, larsen press ou tempo bench',squat:'Pause squat, pin squat ou tempo',deadlift:'Déficit deadlift, Romanian ou block pulls'};
    const _sbdWeeklyNames={bench:'Bench Press (Barbell)',squat:'Squat (Barbell)',deadlift:'Deadlift (Barbell)'};
    plateaux.forEach(p => {
      html += `<div class="plateau-alert">📉 <strong>${p.type.toUpperCase()}</strong> plateau depuis ${p.sessions} séances`;
      const analysis = analyzePlateauCauses(_sbdWeeklyNames[p.type]||p.type);
      if (analysis && analysis.causes.length > 0) {
        html += `<div style="margin-top:6px;font-size:11px;">Causes probables :<br>`;
        analysis.causes.forEach(c => { html += `• ${c}<br>`; });
        if (analysis.suggestions.length > 0) html += `→ Ajoute : ${analysis.suggestions.slice(0,2).join(', ')}`;
        html += `</div>`;
      } else {
        html += ` — essaie : ${sugg[p.type]}`;
      }
      html += `</div>`;
    });
    html += '</div>';
  }

  // Coaching semaine prochaine
  html += '<div class="ai-section"><div class="ai-section-title">🚀 Semaine prochaine</div>';
  const encouragements = [];

  if (nextWeek) {
    const weekNames = {1:'Base (volume modéré, pose les fondations)', 2:'Accumulation (monte progressivement)', 3:'Intensification (charges lourdes, technique)', 4:'Peak (c\'est le moment de tout donner !)'};
    encouragements.push(`Semaine ${nextWeek} — ${weekNames[nextWeek]||''}`);
  }

  if (weekPRs.length >= 3) encouragements.push('Excellente dynamique cette semaine ! Continue sur cette lancée, tu es en pleine progression.');
  else if (weekPRs.length > 0) encouragements.push('De beaux records cette semaine. La régularité paie, continue comme ça.');
  else if (nbSessions >= 3) encouragements.push('Bonne fréquence d\'entraînement. Les résultats viendront avec la constance.');
  else encouragements.push('Chaque séance compte. Essaie de garder au moins 3 séances par semaine pour progresser.');

  if (tonnagePrev7 > 0 && tonnage7 > tonnagePrev7 * 1.15) encouragements.push('Volume en hausse — attention à la fatigue. N\'hésite pas à prendre un jour off si tu te sens claqué.');
  if (plateaux.length) encouragements.push('Un plateau n\'est pas un échec — c\'est un signal pour adapter. Variantes et deload sont tes meilleurs outils.');
  if (nbSessions >= 4 && !muscles.some(([mg]) => mg === 'Abdos')) encouragements.push('N\'oublie pas le gainage et les abdos — importants pour la stabilité sur les gros lifts.');

  encouragements.forEach(e => { html += `<div style="margin-bottom:4px;">→ ${e}</div>`; });
  html += '</div>';

  html += '<div class="ai-timestamp">Coach Algo · Bilan hebdomadaire · Sans IA</div>';
  return html;
}

function saveAlgoDebrief(session) {
  const html = generateAlgoSessionDebrief(session);
  if (!html) return;
  upsertReport('debrief', html, session.id);
}

function saveAlgoWeekly() {
  const html = generateAlgoWeeklyReport();
  if (!html) return;
  upsertReport('weekly', html, null);
}

function checkAndGenerateWeeklyReport() {
  // Générer un bilan hebdomadaire si : dernier jour d'entraînement du programme cette semaine
  const routine = getRoutine();
  const todayDay = DAYS_FULL[new Date().getDay()];
  const trainingDays = DAYS_FULL.filter(d => {
    const label = routine[d] || '';
    return label && !/repos|😴/i.test(label);
  });
  if (!trainingDays.length) return;

  // Trouver le dernier jour d'entraînement de la semaine
  const orderedDays = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const lastTrainingDay = [...trainingDays].sort((a,b) => orderedDays.indexOf(b) - orderedDays.indexOf(a))[0];

  if (todayDay !== lastTrainingDay) return;

  // Vérifier qu'on n'a pas déjà un bilan cette semaine
  const existingWeekly = db.reports.find(r => r.type === 'weekly' && r.expires_at > Date.now());
  if (existingWeekly) {
    const created = new Date(existingWeekly.created_at);
    const now = new Date();
    // Si créé aujourd'hui, ne pas recréer
    if (created.toDateString() === now.toDateString()) return;
  }

  // Au moins 1 séance cette semaine
  if (getLogsInRange(7).length === 0) return;

  saveAlgoWeekly();
}

function saveBodyEntry() {
  const bwVal=parseFloat(document.getElementById('inputBodyWeight').value);
  if (!bwVal||bwVal<30||bwVal>300){showToast('Poids invalide');return;}
  if (!db.body) db.body=[];
  const today=new Date().toDateString();
  db.body=db.body.filter(e=>new Date(e.ts).toDateString()!==today);
  db.body.unshift({ts:Date.now(),bw:bwVal,prot:0,carb:0,fat:0,kcal:0});
  db.body=db.body.slice(0,90);
  db.user.bw=bwVal;
  saveDB();
  document.getElementById('inputBodyWeight').value='';
  showToast('✓ Poids enregistré');
  renderCorpsTab();
}
function saveMacroEntry() {
  const prot=parseFloat(document.getElementById('inputProt').value)||0;
  const carb=parseFloat(document.getElementById('inputCarb').value)||0;
  const fat=parseFloat(document.getElementById('inputFat').value)||0;
  const kcalManual=parseFloat(document.getElementById('inputKcal').value)||0;
  const kcal=kcalManual>0?kcalManual:Math.round(prot*4+carb*4+fat*9);
  if (!db.body) db.body=[];
  const today=new Date().toDateString();
  const existing=db.body.find(e=>new Date(e.ts).toDateString()===today);
  if (existing){existing.prot=prot;existing.carb=carb;existing.fat=fat;existing.kcal=kcal;}
  else{db.body.unshift({ts:Date.now(),bw:db.user.bw,prot,carb,fat,kcal});db.body=db.body.slice(0,90);}
  saveDB();
  ['inputProt','inputCarb','inputFat','inputKcal'].forEach(id=>document.getElementById(id).value='');
  showToast('✓ Macros enregistrées');
  renderCorpsTab();
}
function updateCalcCalories() {
  const p=parseFloat(document.getElementById('inputProt').value)||0;
  const c=parseFloat(document.getElementById('inputCarb').value)||0;
  const f=parseFloat(document.getElementById('inputFat').value)||0;
  const calc=Math.round(p*4+c*4+f*9);
  if (calc>0) document.getElementById('inputKcal').placeholder=calc+' (calculé)';
}

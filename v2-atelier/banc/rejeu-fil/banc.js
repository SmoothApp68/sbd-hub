// Banc de rejeu du fil (« Le coach en un fil », lots 1 et 2) : outil de CHANTIER, hors CI, hors du dossier publié.
// Il rejoue des histoires de séances contre DEUX versions de v2/js/ et compare, séance par séance, une signature de ce que le coach décide.
//   node v2-atelier/banc/rejeu-fil/banc.js --contre <dossier js>             B contre A (A = v2/js/ du dépôt, ou --base <dossier>)
//   node v2-atelier/banc/rejeu-fil/banc.js --muter [--filtre <regex>]        les mutations de mutations.json, une à la fois
//   node v2-atelier/banc/rejeu-fil/banc.js --contre <js> --fixture <f.json>  rejeu de vraies séances (format : LISEZ-MOI.txt)
// Options : --n 200 (histoires tirées) · --graine 20261125 · --erreurs · --couverture · --base <dossier js>
// Chaque variante joue SA trajectoire : la personne suit la consigne de la variante, avec le même tirage par (histoire, séance).
// Signature d'une séance : état, ligne, haut, zone, phrase d'en-tête (gris), réserve affichée, clés du fondement, TEXTE des erreurs de
// verifierPlan, paris ratés ; pour les cas ajoutés (corps, aide, élastique, lest, décharge, veille, test) : la partie du plan que le cas exerce.
// Les nouveaux cas s'ajoutent APRÈS les histoires d'origine, avec leur propre tirage : les histoires d'origine jouent exactement ce qu'elles jouaient.
process.env.TZ = 'Europe/Paris';
const vm = require('vm'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const RACINE = path.resolve(__dirname, '..', '..', '..'), ICI = __dirname;
const JS_DU_DEPOT = path.join(RACINE, 'v2', 'js');
const ARGS = process.argv.slice(2);
const opt = (nom, defaut) => { const i = ARGS.indexOf('--' + nom); return i < 0 ? defaut : (ARGS[i + 1] === undefined || ARGS[i + 1].startsWith('--') ? true : ARGS[i + 1]); };
const NH = Number(opt('n', 200)), GRAINE = Number(opt('graine', 20261125));
const BUT = require('./but.js');
const FICHIERS = ['modele', 'palier', 'semaine', 'profil', 'periode', 'generateur', 'bilan', 'moteur', 'seance', 'reserve', 'plan', 'faits'];

function contexte(dir) {
  const ctx = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, Intl, isNaN, parseFloat, parseInt, setTimeout };
  ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  FICHIERS.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f + '.js'), 'utf8'), ctx, { filename: f }));
  return { M: ctx.THMoteur, S: ctx.THSeance, T: ctx.THPlan, F: ctx.THFaits.creer(), B: ctx.THBilan, G: ctx.THGenerateur };
}
function alea(graine) { let s = graine % 2147483648; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const EXOS = { squat_barre: { nom: 'Squat', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, kg: 100, famille: 'squat_barre' },
  souleve_de_terre_barre: { nom: 'Soulevé de terre', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, kg: 140, famille: 'souleve_de_terre_barre' },
  curl_halteres: { nom: 'Curl', equipement: 'haltere', mesure: 'charge_reps', pas: 2, kg: 14, famille: null },
  rowing_halteres: { nom: 'Rowing', equipement: 'haltere', mesure: 'charge_reps', pas: 2, kg: 30, famille: null },
  developpe_militaire_barre: { nom: 'Développé militaire', equipement: 'barre', mesure: 'charge_reps', pas: 2.5, kg: 40, famille: 'developpe_militaire_barre' },
  // Les cas ajoutés : le poids du corps (une charge qui vaut 0), l'aide (une charge négative), l'élastique (une salle de crans virtuels).
  tractions: { nom: 'Tractions', equipement: 'poids_du_corps', mesure: 'reps', pas: 0, kg: 0, famille: null },
  tractions_assistees: { nom: 'Tractions assistées', equipement: 'machine', mesure: 'charge_reps', pas: 5, kg: -40, famille: null },
  curl_elastique: { nom: 'Curl à l’élastique', equipement: 'elastique', mesure: 'charge_reps', pas: 5, kg: 10, famille: null,
    salle: { materiel: 'elastique', charges: [10, 15, 20, 25, 30], aide: false } } };
// Les équipements que le moteur connaît (REPLI_MATERIEL, plan.js MATERIELS_DE_CHAUFFE) : un banc qui en déclare un autre (`halteres` au pluriel a produit
// 483 `test_propose` sans charge, un artefact) échoue au lieu de produire un faux écart.
const EQUIPEMENTS = ['barre', 'haltere', 'haltere_seul', 'machine', 'poulie', 'kettlebell', 'machine_smith', 'poids_du_corps', 'elastique', 'disque', 'aucun', 'lest'];
function verifierEquipements(table, d) { Object.keys(table).forEach(k => { if (EQUIPEMENTS.indexOf(table[k].equipement) < 0) throw new Error('banc : équipement « ' + table[k].equipement + ' » de ' + k + ' absent de la liste réelle (' + (d || 'EXOS') + ')'); }); }
verifierEquipements(EXOS);
const BAS = { lourd: 3, mix: 6, hypertrophie: 8, volume: 10 };
const CAS_AJOUTES = ['corps', 'aide', 'elastique', 'lest', 'decharge', 'veille', 'test'];

function histoires(n) {
  const r = alea(GRAINE), pick = a => a[Math.floor(r() * a.length)], H = [];
  for (let h = 0; h < n; h++) { const age = r() < 0.2 ? pick([52, 58, 67, 72, 80]) : null;
    H.push({ age, slug: pick(['squat_barre', 'squat_barre', 'souleve_de_terre_barre', 'curl_halteres', 'rowing_halteres']), zone: pick(['lourd', 'mix', 'hypertrophie', 'volume', null]),
    reglage: pick(['normal', 'normal', 'franc', 'prudent']), protegee: r() < 0.2, debutant: r() < 0.2, nseries: pick([3, 3, 4, 5]),
    noteR: r() < 0.5, nseances: 10 + Math.floor(r() * 10), graine: Math.floor(r() * 1e9) }); }
  // HISTOIRES DIRIGÉES : un script d'actions par séance, sur des réglages, zones et exercices tirés au hasard. Elles visent les
  // branches qu'un tirage libre ne joue presque jamais.
  const SCRIPTS = {
    legere_a_P: ['suit', 'suit', 'suit', 'zero', 'avant', 'suit', 'suit', 'suit'],
    zero_dessus: ['suit', 'suit', 'suit', 'zeroDessus', 'suit', 'suit', 'suit', 'suit'],
    jeton_rate: ['suit', 'suit', 'suit', 'zero', 'suit', 'suit', 'sousBas', 'zero', 'suit', 'suit'],
    retour: ['suit', 'suit', 'depasse3', 'zero', 'suit', 'suit', 'suit', 'suit'],
    saut: ['suit', 'depasse3', 'depasse3', 'depasse3', 'depasse3', 'depasse3', 'depasse3'],
    legere_apres_pause: ['suit', 'suit', 'suit', 'zero', 'pause21moins', 'suit', 'suit', 'suit'],
    reprise_haute: ['suit', 'suit', 'suit', 'suit', 'pause100', 'suit', 'suit', 'suit'],
    // LOT 3 (qui vote) : des séances neutres (« Sans coach » : SC, « J'ai mal » : DL) et une décharge (`decharges` : les rangs en semaine allégée) qui tombent dans un jour sans.
    neutre_sc: ['suit', 'suit', 'suit', 'zero', 'legereSC', 'suit', 'suit', 'suit'],
    neutre_dl: ['suit', 'suit', 'suit', 'zero', 'legereDL', 'suit', 'suit', 'suit'],
    neutre_lues: ['suit', 'suitSC', 'suitDL', 'zero', 'legere', 'suit', 'suit', 'suit'],
    neutre_jeton: ['suit', 'suit', 'suit', 'zero', 'legere', 'suitSC', 'zero', 'suit', 'suit'],
    decharge_legere: ['suit', 'suit', 'suit', 'zero', 'legere', 'suit', 'suit', 'suit'],
    decharge_zero: ['suit', 'suit', 'suit', 'zero', 'legere', 'suit', 'suit', 'suit'],
    decharge_lues: ['suit', 'suit', 'suit', 'zero', 'legere', 'suit', 'suit', 'suit'],
    decharge_jeton: ['suit', 'suit', 'suit', 'zero', 'legere', 'suit', 'zero', 'suit', 'suit'],
    decharge_compteur: ['suit', 'suit', 'suit', 'suit', 'suit', 'suit', 'suit', 'suit', 'suit', 'suit']
  };
  const EXTRA = { neutre_sc: { age: null }, decharge_legere: { cas: 'decharge', decharges: [4] }, decharge_zero: { cas: 'decharge', decharges: [3] }, decharge_lues: { cas: 'decharge', decharges: [1, 2] },
    decharge_jeton: { cas: 'decharge', decharges: [5] }, decharge_compteur: { cas: 'decharge', decharges: [2, 3, 4, 5, 6] } };
  Object.keys(SCRIPTS).forEach(nom => { for (let k = 0; k < (nom === 'decharge_zero' ? 90 : nom === 'saut' || /^(neutre|decharge)_/.test(nom) ? 30 : 15); k++) {
    const saut = nom === 'saut', rh = nom === 'reprise_haute';
    H.push(Object.assign({ script: SCRIPTS[nom], dirigee: nom, age: saut ? pick([67, 70, 72, null]) : null, slug: saut ? 'developpe_militaire_barre' : pick(['squat_barre', 'souleve_de_terre_barre', 'developpe_militaire_barre', 'curl_halteres']),
      zone: rh ? pick(['lourd', 'mix']) : saut ? pick(['lourd', 'hypertrophie']) : pick(['lourd', 'mix', 'hypertrophie', 'volume']), reglage: saut ? 'franc' : rh ? 'normal' : pick(['normal', 'franc', 'prudent']), protegee: false,
      debutant: saut ? r() < 0.5 : false, nseries: pick([3, 4]), noteR: nom === 'reprise_haute', nseances: SCRIPTS[nom].length, graine: Math.floor(r() * 1e9) }, EXTRA[nom] || {}));
  } });
  // LES CAS AJOUTÉS (lot 1) : tirage à part, ajoutés à la suite. Chaque cas vise ce que la consigne seule ne joue pas.
  const q = alea(GRAINE + 4242), qp = a => a[Math.floor(q() * a.length)];
  const fiche = (cas, slug, extra) => Object.assign({ cas, age: null, slug, zone: qp(['lourd', 'mix', 'hypertrophie', 'volume']), reglage: qp(['normal', 'franc', 'prudent']), protegee: false,
    debutant: false, nseries: qp([3, 4]), noteR: q() < 0.5, nseances: 10 + Math.floor(q() * 8), graine: Math.floor(q() * 1e9) }, extra || {});
  for (let k = 0; k < 12; k++) H.push(fiche('corps', 'tractions', { debutant: k % 4 === 3 }));                                  // poids du corps : les reps montent, jamais de charge
  for (let k = 0; k < 12; k++) H.push(fiche('aide', 'tractions_assistees', { debutant: k % 4 === 3 }));                         // aide : moins d'aide, c'est monter
  for (let k = 0; k < 12; k++) H.push(fiche('elastique', 'curl_elastique', { zone: qp(['hypertrophie', 'volume']) }));            // salle d'élastiques : les crans
  for (let k = 0; k < 18; k++) H.push(fiche('lest', 'tractions', { zone: qp(['lourd', 'mix']), lest: [null, 'oui', 'non'][k % 3], reglage: 'normal', noteR: false, nseances: 14 })); // la carte du lest
  for (let k = 0; k < 18; k++) H.push(fiche('decharge', qp(['squat_barre', 'curl_halteres', 'developpe_militaire_barre']), { nseances: 14 }));   // la décharge (allegee)
  for (let k = 0; k < 18; k++) H.push(fiche('veille', qp(['squat_barre', 'souleve_de_terre_barre']), { zone: 'lourd', reglage: qp(['normal', 'franc']), nseances: 12 }));  // la veille d'une activité dure
  for (let k = 0; k < 12; k++) H.push(fiche('test', qp(['squat_barre', 'souleve_de_terre_barre']), { nseances: 12 }));          // la semaine de test
  // LOT 4 : le débutant de 50 à 59 ans (un cran à la fois, `AGE_UN_CRAN`) : le saut de plusieurs crans au squat (100 kg : 10 % = 4 crans), que le tirage libre ne joue jamais.
  for (let k = 0; k < 24; k++) H.push(Object.assign(fiche('debutant50', 'squat_barre', { zone: qp(['lourd', 'hypertrophie']), reglage: 'franc', debutant: true, nseances: SCRIPTS.saut.length }), { cas: null, dirigee: 'saut50', script: SCRIPTS.saut, age: [50, 54, 59][k % 3], noteR: false }));
  return H;
}
const esp = t => String(t == null ? '' : t).replace(/[  \s]+/g, ' ').trim();
const jourDe = iso => iso.slice(0, 10);

// La signature d'une séance, calculée une fois : `H` décrit l'exercice (slug, zone, réglage…), `groupes` les séances d'avant, `i` le rang.
// `X` : les modules d'une version. `etat` : { parisRates, cartes (décharges déjà posées) }. Rend { sig, x, k }.
function signer(X, H, groupes, i, avant, etat) {
  const E = EXOS[H.slug], cas = H.cas || null;
  const cat = { [H.slug]: Object.assign({ muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] }, E) };
  delete cat[H.slug].famille; delete cat[H.slug].kg; delete cat[H.slug].salle;
  const o = { mesure: E.mesure, equipement: E.equipement, intention: 'progresser', reglage: H.reglage, edition: false,
    debutant: H.debutant, protegee: H.protegee || H.debutant || (H.age !== null && H.age >= 65), correction: H.zone, famille: E.famille,
    prudence: X.M.prudenceDeMontee({ debutant: H.debutant, age: H.age }) };
  if (E.salle) o.salle = E.salle;
  if (cas === 'lest') { o.lestReponse = H.lest; o.lestPossible = true; }
  if (cas === 'decharge') o.periodesAllegees = etat.periodes;
  o.seancesSousConsigne = groupes.map(g => g.seance.id);   // B3 : toutes les séances d'avant comptent comme sous consigne (le banc d'origine n'en passe aucune)
  let R; try { R = X.M.consigneDExercice(groupes, undefined, avant, o); } catch (e) { R = { consigne: null, erreur: String(e).slice(0, 80) }; }
  const k = R.consigne;
  let x = null, p = null, err = [];
  try {
    let n = 0; const id = () => 'q' + i + '_' + (++n);
    let se = X.S.creer({ id: 'S' + i, userId: 'u', idSerie: id });
    se = X.S.ajouterExercice(se, H.slug, id, { series: H.nseries });
    const e = { seance: { id: 'S' + i, debut: avant, edition: false, exercices: se.exercices }, consignes: { [H.slug]: R }, paris: [], suites: {},
      reglage: H.reglage, objectif: Object.prototype.hasOwnProperty.call(H, 'objectif') ? H.objectif : H.protegee ? 'forme' : 'muscle', debutant: H.debutant, plus65: H.age !== null && H.age >= 65, prudence: o.prudence, parisRates: etat.parisRates, catalogue: cat };
    const jour = jourDe(avant);
    if (cas === 'decharge' && etat.decharge(i)) e.escalier = { cartes: [{ reponse: 'acceptee', debut: jour, fin: jour, declencheur: 'banc', jour }], seriesRoutine: { [H.slug]: H.nseries } };
    if (cas === 'veille') { e.activiteVeille = { seanceId: 'a', slug: 'football', nom: 'Football', jour }; e.veilleChoix = etat.veille(i); }
    if (cas === 'test' && etat.test(i)) e.semaineDeTest = { debut: jour, fin: jour, modes: {}, mesures: {}, refus: {}, maxEstimes: { [H.slug]: Math.round(E.kg * 1.3) } };
    p = X.T.planDeSeance(e); x = p.exercices[0]; err = X.T.verifierPlan(p, e).erreurs || [];
  } catch (e) { err = ['exception ' + String(e).slice(0, 60)]; }
  const f = (k && k.fondement) || {};
  const sig = [k && k.etat, k && k.ligne, k && k.haut, k && k.zone, R.erreur || null, x && esp(x.entete && x.entete.gris), x && x.reserveAffichee,
    f.cibleAvant, f.capacite ? 1 : 0, f.effortVise ? f.effortVise.effet : null, f.zeroRep ? (f.zeroRep.jourSans ? 'js' : 'B') : null,
    f.plafondZero ? !!f.plafondZero.mord : null, f.jourSans ? !!f.jourSans.retour : null, err.map(y => String(y).replace(/exercice \d+ /, '')).sort(), etat.parisRates[H.slug] ? etat.parisRates[H.slug].n : 0];
  if (cas) {
    const c = x && x.consigne || null, vl = c && c.veilleLegere || null, va = p && p.veilleActivite || null, st = p && p.semaineDeTest || null;
    sig.push(c && [c.etat, c.ligne, c.haut, c.n, c.couvre, c.allegee || null, c.carteLest || null], vl, va && [va.slug, va.phrase, va.boutons], p && p.veilleReprise ? esp(p.veilleReprise.phrase) : null,
      st && [st.testee && (st.testee.slug || st.testee), st.barres], x && x.semaineDeTest ? JSON.stringify(x.semaineDeTest).slice(0, 400) : null, x && x.pourquoi ? esp(JSON.stringify(x.pourquoi)).slice(0, 300) : null);
  }
  sig.push(R.compteur ? R.compteur.compteur : null, x && x.entete ? esp(x.entete.compteur) : null, x && x.escalier ? x.escalier.marche : null);   // B3 : le compteur, sa phrase, la marche
  sig.push(etat.compte ? [etat.compte.verifies, etat.compte.tenus] : null);   // le compte du bilan (`Bilan.compteLe`), en dernier : les rangs d'avant ne bougent pas
  return { sig: JSON.stringify(sig), x, k };
}

function jouer(X, H) {
  const sigs = [], groupes = [], paris = []; let t = Date.UTC(2026, 0, 5, 17);
  const etat = { parisRates: {}, periodes: [],
    decharge: i => H.cas === 'decharge' && (H.decharges ? H.decharges.indexOf(i) >= 0 : i % 4 === 3), veille: i => H.cas === 'veille' ? [null, 'leger', 'garder'][i % 3] : null, test: i => H.cas === 'test' && i % 3 === 1 };
  const E = EXOS[H.slug];
  for (let i = 0; i < H.nseances; i++) {
    const r = alea(H.graine + 7919 * i);
    const brut = H.script ? H.script[i] : null, marque = brut && /SC$/.test(brut) ? 'sans_coach' : brut && /DL$/.test(brut) ? 'douleur' : null;
    const act = brut ? brut.replace(/(SC|DL)$/, '') : null;
    const u = act === 'pause100' ? -1 : act === 'pause21moins' ? -2 : act ? 1 : r(); t += (u === -2 ? 21 : u < 0 ? 100 : u < 0.04 ? 100 + Math.floor(r() * 30) : u < 0.08 ? 38 + Math.floor(r() * 62) : u < 0.13 ? 18 + Math.floor(r() * 20) : u < 0.18 ? 8 + Math.floor(r() * 10) : 3 + Math.floor(r() * 2)) * 864e5;
    const avant = new Date(t).toISOString();
    if (H.cas === 'decharge' && etat.decharge(i)) etat.periodes = etat.periodes.concat([{ debut: jourDe(avant), fin: jourDe(avant) }]);
    let k = null, sig = 'première';
    if (groupes.length) {
      const s = signer(X, H, groupes, i, avant, etat); k = s.k; sig = s.sig;
      (s.x && s.x.paris || []).forEach((q, j) => { if (q && q.valeur_predite != null) paris.push({ j, q, seance: 'S' + i, date: avant }); });
    }
    sigs.push(sig);
    // ce que fait la personne
    let charge = k && k.ligne && k.ligne.charge ? k.ligne.charge : E.kg;
    const desob = act || H.cas ? 1 : groupes.length ? r() : 1;   // 10 % : la personne ne suit pas la charge de la consigne
    if (desob < 0.10) { const pas = E.pas, prec = groupes[groupes.length - 1].series[0].charge_kg;
      charge = desob < 0.033 ? prec : desob < 0.066 ? charge + pas : Math.max(pas, charge - pas); }
    if (act === 'pause21moins' || act === 'legere') { const prec = groupes.slice().reverse().find(g => g.series.some(s => s.reps > 0)); const P = prec ? prec.series[0].charge_kg : charge, pas = E.pas;
      charge = Math.round(P * 0.95 / pas) * pas; if (charge >= P) charge = P - pas; }
    if (act === 'avant' || act === 'zeroDessus') { const prec = groupes.slice().reverse().find(g => g.series.some(s => s.reps > 0));
      charge = prec ? prec.series[0].charge_kg : charge; if (act === 'zeroDessus') charge += E.pas; }
    const vise = k && k.ligne && k.ligne.vise ? k.ligne.vise : (BAS[H.zone] || 8) + 1;
    // un zéro récent (dans les 3 dernières séances) rend le suivant plus probable : c'est ce qui joue le yo-yo (zéro, légère, retour, zéro)
    const zeroRecent = groupes.slice(-3).some(g => g.series.every(s => s.reps === 0));
    const zero = act ? (act === 'zero' || act === 'zeroDessus') : r() < (zeroRecent ? 0.35 : 0.07);
    const essai = (act ? act === 'suit' : desob >= 0.10 && r() < 0.75) && k && k.haut && k.haut.charge;
    let base = act === 'depasse3' ? vise + 3 : act === 'pause100' ? vise + 2 : act === 'sousBas' ? Math.max(1, (BAS[k && k.zone] || 8) - 2) : act ? vise :
      Math.max(1, vise + (r() < 0.3 ? 1 : 0) - (r() < 0.25 ? 1 : 0));
    if (H.cas === 'lest' && !zero) base = vise + 3;   // les reps du poids du corps montent : la carte du lest finit par parler
    const series = [];
    for (let j = 0; j < H.nseries; j++) {
      let kg = charge, reps = base;
      if (zero) reps = 0;
      else if (essai && j === H.nseries - 1) { kg = k.haut.charge; const v = k.haut.vise || 3; reps = act ? v : r() < 0.15 ? 0 : Math.max(1, v + (r() < 0.3 ? 1 : 0) - (r() < 0.35 ? 1 : 0)); }
      else if (act) reps = base;
      else if (j === H.nseries - 1 && r() < 0.25) reps = Math.max(1, base - 2 - Math.floor(r() * 3));
      else if (j >= 1 && r() < 0.2) reps = Math.max(1, base - 1);
      const R = H.noteR && j === H.nseries - 1 && reps > 0 ? (act === 'pause100' ? 1 : act ? null : Math.floor(r() * 4)) : null;
      series.push({ id: 'h' + i + '_' + j, session_id: 'S' + i, exercise_slug: H.slug, charge_kg: kg, reps, type_serie: reps === 0 && j === 0 ? 'echec' : 'travail',
        rang: j + 1, rpe: R === null ? null : 10 - R, ressenti: null, validee_a: avant, source: 'app' });
      if (marque) series[series.length - 1][marque] = true;
    }
    groupes.push({ seance: { id: 'S' + i, debut: avant }, series });
    observer(X, H, paris, 'S' + i, series, etat);
  }
  return sigs;
}
// les paris du plan, observés à la séance suivante : ils nourrissent le plan d'après
function observer(X, H, paris, id, series, etat) {
  paris.filter(p => p.seance === id).forEach(p => { p.observee = series[p.j] ? series[p.j].reps : null; });
  const obs = paris.filter(p => p.observee != null).map(p => ({ seance: p.seance, date: p.date, exercice: H.slug, predite: p.q.valeur_predite, observee: p.observee,
    charge: p.q.fondement ? p.q.fondement.charge : null,
    allegee: !!(p.q.fondement && p.q.fondement.allegee), jourSans: !!(p.q.fondement && p.q.fondement.jourSans) }));
  try { etat.compte = X.B.compterParis(obs, () => true); } catch (e) { etat.compte = null; }
  try { etat.parisRates = X.F.parisRatesALaSuite(obs, null, []); } catch (e) { etat.parisRates = {}; }
}

// LE LECTEUR DE FIXTURE : de vraies séances (exportées par Claude.ai), rejouées telles quelles. Pas de personne simulée : à chaque séance,
// la consigne et le plan sont calculés sur les séances d'avant et signés. Format : voir LISEZ-MOI.txt.
function histoiresDeFixture(chemin) {
  const J = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  const liste = Array.isArray(J) ? J : J.histoires;
  if (!Array.isArray(liste) || !liste.length) throw new Error('fixture : aucune histoire dans ' + chemin);
  return liste.map((h, n) => {
    if (!h.slug || !Array.isArray(h.seances)) throw new Error('fixture : l’histoire ' + n + ' n’a ni slug ni seances');
    const slug = h.slug;
    if (!EXOS[slug]) EXOS[slug] = { nom: h.nom || slug, equipement: h.equipement || 'barre', mesure: h.mesure || 'charge_reps', pas: h.pas || 2.5, kg: h.kg || 0, famille: h.famille || null,
      salle: h.salle || undefined };
    verifierEquipements({ [slug]: EXOS[slug] }, 'fixture');
    const seances = h.seances.slice().sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
    return { fixture: true, id: h.id || slug + '#' + n, slug, age: h.age == null ? null : h.age, zone: h.zone || null, reglage: h.reglage || 'normal', protegee: !!h.protegee, debutant: !!h.debutant,
      nseries: h.nseries || 3, noteR: false, nseances: seances.length, graine: 1, reelles: seances };
  }).map((H, n) => {
    const h = liste[n]; if (Object.prototype.hasOwnProperty.call(h, 'objectif')) H.objectif = h.objectif == null || h.objectif === '' ? null : h.objectif;   // absent : la règle d'avant (protegee ? forme : muscle)
    return H;
  });
}
function jouerFixture(X, H) {
  const sigs = [], groupes = [], paris = [], etat = { parisRates: {}, periodes: [], decharge: () => false, veille: () => null, test: () => false };
  H.reelles.forEach((s, i) => {
    const avant = new Date(s.debut).toISOString();
    let sig = 'première';
    if (groupes.length) { const g = signer(X, H, groupes, i, avant, etat); sig = g.sig; (g.x && g.x.paris || []).forEach((q, j) => { if (q && q.valeur_predite != null) paris.push({ j, q, seance: 'S' + i, date: avant }); }); }
    sigs.push(sig);
    const series = (s.series || []).map((y, j) => ({ id: 'f' + i + '_' + j, session_id: 'S' + i, exercise_slug: H.slug, charge_kg: y.charge_kg, reps: y.reps, type_serie: y.type_serie || (y.reps === 0 && j === 0 ? 'echec' : 'travail'),
      rang: y.rang || j + 1, rpe: y.rpe == null ? null : y.rpe, ressenti: y.ressenti || null, validee_a: y.validee_a || avant, source: 'app' }));
    groupes.push({ seance: s.sousConsigne === true ? { id: 'S' + i, debut: avant, sousConsigne: true } : { id: 'S' + i, debut: avant }, series });
    observer(X, H, paris, 'S' + i, series, etat);
  });
  return sigs;
}

function comparer(A, B, HS, rejouer) {
  let pas = 0, ecarts = 0, hE = 0; const ex = [], couverture = {};
  const ST = { autres: 0, dph: 0, derr: 0, exAutres: [], n: 0, a4: 0, b4: 0, am: 0, bm: 0, aph: 0, bph: 0, dc: 0, dm: 0, d: {} }; process.on('exit', () => console.log('B3 compteur : ' + JSON.stringify(ST)));
  HS.forEach((H, h) => {
    const a = rejouer(A, H), b = rejouer(B, H); let premier = -1;
    if (H.but) { a.forEach((s, i) => { pas++; couverture['cas:but'] = (couverture['cas:but'] || 0) + 1; if (s !== b[i]) { ecarts++; if (premier < 0) premier = i; } });
      if (premier >= 0) { hE++; if (ex.length < 5) ex.push('h' + h + ' (but ' + H.objectif + ' ' + H.slug + ' ' + H.script + ' ' + H.zone + ' ' + H.reglage + ') série ' + premier + '\n     A ' + a[premier] + '\n     B ' + b[premier]); }
      return; }
    const lire = (x) => { if (x === 'première') return null; const e = JSON.parse(x); return { c: e[e.length - 4], ph: e[e.length - 3], m: e[e.length - 2] }; };
    a.forEach((s, i) => { const A1 = lire(s), B1 = lire(b[i]); if (!A1 || !B1) return; ST.n++;
      if (A1.c >= 4) ST.a4++; if (B1.c >= 4) ST.b4++; if (A1.m) ST.am++; if (B1.m) ST.bm++; if (A1.ph) ST.aph++; if (B1.ph) ST.bph++;
      { const ea = JSON.parse(s), eb = JSON.parse(b[i]); const autres = ea.filter((v, k) => k < ea.length - 4 || k === ea.length - 1).map(JSON.stringify).join('|') !== eb.filter((v, k) => k < eb.length - 4 || k === eb.length - 1).map(JSON.stringify).join('|');
        if (autres) { ST.autres++; if (ST.exAutres.length < 3) ST.exAutres.push([ea, eb]); } if (A1.ph !== B1.ph) ST.dph++; if (JSON.stringify(ea[13]) !== JSON.stringify(eb[13])) ST.derr++; }
      if (A1.c !== B1.c) { ST.dc++; const d = B1.c - A1.c; ST.d[d] = (ST.d[d] || 0) + 1; } if (A1.m !== B1.m) ST.dm++; });
    a.forEach((s, i) => { pas++; const e = JSON.parse(s === 'première' ? '[]' : s); const et = e[0], z = e[10];
      if (et) couverture[et] = (couverture[et] || 0) + 1; if (z) couverture['zero:' + z] = (couverture['zero:' + z] || 0) + 1;
      if (e[11]) couverture.plafond_mord = (couverture.plafond_mord || 0) + 1; if (e[3] === null && et && et !== 'silence') couverture.sans_zone = (couverture.sans_zone || 0) + 1;
      if (H.cas) { const c = e[15]; if (c && c[5]) couverture.allegee = (couverture.allegee || 0) + 1; if (e[16]) couverture.veille_legere = (couverture.veille_legere || 0) + 1;
        if (e[17]) couverture.veille_proposee = (couverture.veille_proposee || 0) + 1; if (e[19]) couverture.test_du_jour = (couverture.test_du_jour || 0) + 1; couverture['cas:' + H.cas] = (couverture['cas:' + H.cas] || 0) + 1; }
      if (s !== b[i]) { ecarts++; if (premier < 0) premier = i; } });
    if (premier >= 0) { hE++; if (ex.length < 5) ex.push('h' + h + ' (' + H.slug + ' ' + H.zone + ' ' + H.reglage + (H.cas ? ' cas ' + H.cas : '') + (H.protegee ? ' protégé' : '') + ') séance ' + premier + '\n     A ' + a[premier] + '\n     B ' + b[premier]); }
  });
  return { pas, ecarts, hE, ex, couverture };
}
const rejouerDe = (fix) => fix ? jouerFixture : (X, H) => H.but ? BUT.jouerBut(X, H) : jouer(X, H);
const erreursDe = sigs => sigs.reduce((n, x) => { if (x === 'première') return n; const e = JSON.parse(x)[13]; return n + (Array.isArray(e) && e.length ? 1 : 0); }, 0);

function banc() {
  const dirA = path.resolve(opt('base', JS_DU_DEPOT)), dirB = path.resolve(opt('contre', ''));
  if (!opt('contre') || opt('contre') === true) { console.error('usage : banc.js --contre <dossier js> | --muter   (voir LISEZ-MOI.txt)'); process.exit(2); }
  const fix = opt('fixture', null);
  const A = contexte(dirA), B = contexte(dirB), HS = fix ? histoiresDeFixture(fix) : histoires(NH).concat(BUT.histoiresBut());
  const res = comparer(A, B, HS, rejouerDe(fix));
  if (opt('erreurs', false)) { let ea = 0, eb = 0; const ids = {};
    HS.filter(H => !H.but).forEach(H => { const a = rejouerDe(fix)(A, H), b = rejouerDe(fix)(B, H); ea += erreursDe(a); eb += erreursDe(b);
      b.forEach(x => { if (x !== 'première') (JSON.parse(x)[13] || []).forEach(t => { const c = String(t).split(' ')[0]; ids[c] = (ids[c] || 0) + 1; }); }); });
    console.log('séances en erreur de verifierPlan : A ' + ea + ' · B ' + eb + ' · invariants (B) ' + JSON.stringify(ids)); }
  console.log(`banc · ${fix ? 'fixture ' + path.basename(fix) : 'graine ' + GRAINE} · ${HS.length} histoires · ${res.pas} séances · ${res.ecarts} signatures différentes dans ${res.hE} histoires`);
  if (opt('couverture', false)) console.log('couverture (A) :', JSON.stringify(res.couverture));
  res.ex.forEach(e => console.log('  ' + e));
  let tables = 0;
  if (!fix) [['programmes', BUT.tableProgrammes()], ['blocs', BUT.tableBlocs()]].forEach(([nom, lignes]) => {
    const t = BUT.comparerTable(A, B, lignes); tables += t.diff;
    console.log(`table ${nom} · ${t.n} lignes · ${t.diff} lignes différentes`); t.ex.forEach(e => console.log(e)); });
  process.exitCode = res.ecarts === 0 && tables === 0 ? 0 : 1;
}

// LES MUTATIONS, une à la fois (7 Go de mémoire) : chacune est appliquée à une COPIE de v2/js/ (dossier temporaire du système), puis le banc
// la compare à la base. Tuée si au moins SEUIL histoires diffèrent ; un témoin (« temoin »: true) doit survivre.
function muter() {
  const SEUIL = 5, base = path.resolve(opt('base', JS_DU_DEPOT));
  const filtre = new RegExp(opt('filtre', '.') === true ? '.' : opt('filtre', '.'));
  const muts = JSON.parse(fs.readFileSync(path.join(ICI, 'mutations.json'), 'utf8')).filter(m => filtre.test(m.nom));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rejeu-fil-'));
  const out = ['| Mutation | séances / histoires qui diffèrent | verdict (seuil : ' + SEUIL + ' histoires) |', '|---|---|---|']; let mal = 0;
  try {
    muts.forEach(m => {
      const dir = path.join(tmp, 'js'); fs.rmSync(dir, { recursive: true, force: true }); fs.cpSync(base, dir, { recursive: true });
      const f = path.join(dir, m.fichier), s = fs.readFileSync(f, 'utf8'), nb = s.split(m.ancien).length - 1;
      if (nb !== 1) { out.push('| ' + m.nom + ' | texte trouvé ' + nb + ' fois | non appliquée |'); mal++; return; }
      fs.writeFileSync(f, s.split(m.ancien).join(m.nouveau));
      const r = cp.spawnSync(process.execPath, [path.join(ICI, 'banc.js'), '--base', base, '--contre', dir, '--n', String(NH), '--graine', String(GRAINE)], { maxBuffer: 1e8 });
      const l = r.stdout.toString().split('\n')[0], mm = l.match(/(\d+) signatures différentes dans (\d+) histoires/);
      if (!mm) { out.push('| ' + m.nom + ' | sortie illisible : ' + (r.stderr.toString().slice(0, 100) || l) + ' | ERREUR |'); mal++; return; }
      const se = +mm[1], hi = +mm[2];
      const lt = r.stdout.toString().split('\n').filter(x => /^table /.test(x)).map(x => x.match(/^table (\w+) · (\d+) lignes · (\d+) lignes différentes/)).filter(Boolean), td = lt.reduce((n, x) => n + +x[3], 0);
      const v = m.temoin ? (se === 0 && td === 0 ? 'survit (attendu)' : 'TUÉE À TORT') : hi >= SEUIL || td >= 1 ? 'TUÉE' : se > 0 ? 'SOUS LE SEUIL' : 'SURVIT';
      if (!/^(TUÉE|survit \(attendu\))$/.test(v)) mal++;
      out.push('| ' + m.nom + ' | ' + se + ' séances dans ' + hi + ' histoires' + (lt.length ? ' · ' + lt.map(x => x[1] + ' ' + x[3] + '/' + x[2]).join(' · ') : '') + ' | ' + v + ' |');
      console.error(m.nom + ' → ' + v);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(out.join('\n'));
  process.exitCode = mal ? 1 : 0;
}
if (ARGS.includes('--muter')) muter(); else banc();

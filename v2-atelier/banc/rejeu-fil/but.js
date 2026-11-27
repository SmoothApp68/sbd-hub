// Banc de rejeu du fil, PR 0 de « la fiche de spécialité » (26/11/2026) : LE BANC VOIT LE BUT. Outil de chantier, hors CI, hors du dossier publié.
// Trois ajouts, tous À LA SUITE des histoires d'origine (un tirage à part : celles-ci jouent exactement ce qu'elles jouaient) :
//   1. le cas `but`   : 6 buts (force, muscle, les_deux, forme, calisthenie, null) × 2 exercices (squat à la barre, curl aux haltères) × 16 (4 scripts de raté × 4 zones),
//                       la séance rejouée APRÈS CHAQUE SÉRIE validée (`Seance.modifierSerie`, `Seance.valider`, `planDeSeance`) ;
//   2. la table `programmes` : `Generateur.generer` sur 6 buts × 2 à 6 jours × débutant × matériel × plus65 × entretien × ménager (2 880 lignes), plus `carteCycles` ;
//   3. la table `blocs` : 8 buts (les 6 + '' + 'inconnu') × bloc Lourd, Mix, Hyp × phases oui / non (`zonesDeBloc`, `zoneDuPremierBloc`, `grosseSerieParDefaut`,
//                       `blocSuivant`, le texte `suivant` de `carteFinDeBloc`, `carteSchema(…).detail`).
// Une ligne de table = une clé et une chaîne ; une ligne qui diffère entre A et B est un écart.
const fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..', '..', '..');

const BUTS = ['force', 'muscle', 'les_deux', 'forme', 'calisthenie', null];
const BAS = { lourd: 3, mix: 6, hypertrophie: 8, volume: 10 };
// Les scripts de raté : l'écart de chaque série au BAS de la zone (0 = au bas, négatif = sous le bas) ; `zero` : 0 rep, charge > 0.
const SCRIPTS_BUT = {
  sousBas: [-2, -2, -1, -1],
  sousUn: [-1, -1, 0, 0],
  aBas: [0, 0, -1, 0],
  zero: ['zero', 'zero', 'zero', 'zero']
};
const EXOS_BUT = { squat_barre: { nom: 'Squat', equipement: 'barre', pas: 2.5, kg: 100 }, curl_halteres: { nom: 'Curl', equipement: 'haltere', pas: 2, kg: 14 } };

function histoiresBut() {
  const H = [];
  BUTS.forEach(objectif => ['squat_barre', 'curl_halteres'].forEach(slug => Object.keys(SCRIPTS_BUT).forEach(script =>
    ['lourd', 'mix', 'hypertrophie', 'volume'].forEach((zone, k) => H.push({ but: true, cas: 'but', objectif, slug, script, zone, reglage: ['normal', 'normal', 'franc', 'normal'][k], nseries: 4 })))));
  return H;   // 6 × 2 × 4 × 4 = 192
}

const esp = t => String(t == null ? '' : t).replace(/[  \s]+/g, ' ').trim();
// Rejoue UNE séance de quatre séries : la signature est lue après chaque série validée. La charge est celle de la consigne (la 1re série prend `vise` = bas + 1).
function jouerBut(X, H) {
  const E = EXOS_BUT[H.slug], bas = BAS[H.zone], vise = bas + 1, sigs = [];
  const cat = { [H.slug]: { nom: E.nom, equipement: E.equipement, mesure: 'charge_reps', pas: E.pas, muscles_primaires: ['quadriceps'], muscles_secondaires: [], muscles_stabilisateurs: [] } };
  let n = 0; const id = () => 'b' + (++n);
  let se = X.S.creer({ id: 'SB', userId: 'u', idSerie: id });
  se = X.S.ajouterExercice(se, H.slug, id, { series: H.nseries });
  se.exercices[0].series.forEach(s => { s.reps_visees = vise; });
  const consigne = { consigne: { etat: 'progression', zone: H.zone, palier: E.kg, n: 3, ligne: { charge: E.kg, vise }, haut: null }, contexte: { cran: E.kg + E.pas, haut: null }, pas: E.pas };
  const script = SCRIPTS_BUT[H.script];
  const lire = () => {
    let sig;
    try {
      const e = { seance: { id: 'SB', debut: '2026-11-03T10:00:00Z', edition: false, exercices: se.exercices, gestes: se.gestes }, consignes: { [H.slug]: consigne },
        reglage: H.reglage, objectif: H.objectif, paris: [], catalogue: cat };
      const p = X.T.planDeSeance(e), x = p.exercices[0], r = x.rate || null, pr = x.proposition || null, ch = x.chauffes || null;
      const err = (X.T.verifierPlan(p, e).erreurs || []).map(y => String(y).replace(/exercice \d+ /, '')).sort();
      // la réaction au raté, la raison de la proposition de chauffes, la réserve affichée, la garde, les cartes, les erreurs d'invariant
      sig = [r && [r.niveau, r.cas, esp(r.phrase), r.boutons, r.charge, r.garde, r.recale, r.iSerie, r.sousZone, r.sous, r.protege, r.zero], r && r.fourchette || null,
        pr && [pr.raison || null, pr.mode || null, esp(pr.pourquoi), esp(JSON.stringify(pr.lignes || null)).slice(0, 200)], ch && [ch.situation, esp(ch.phrase), ch.origine],
        x.reserveAffichee, x.gardeDeLigne === undefined ? null : x.gardeDeLigne,
        x.escalier && x.escalier.carte ? esp(JSON.stringify(x.escalier.carte)).slice(0, 300) : null, x.carteForme ? esp(JSON.stringify(x.carteForme)).slice(0, 300) : null,
        x.parisRates ? esp(JSON.stringify(x.parisRates)).slice(0, 300) : null, err];
    } catch (e) { sig = ['exception', String(e).slice(0, 80)]; }
    sigs.push(JSON.stringify(sig));
  };
  lire();   // avant toute série : la proposition de chauffes, la réserve
  for (let j = 0; j < H.nseries; j++) {
    const reps = script[j] === 'zero' ? 0 : Math.max(1, bas + script[j]);
    se = X.S.modifierSerie(se, 0, j, { charge_kg: E.kg, reps });
    se = X.S.valider(se, 0, j, new Date(Date.UTC(2026, 10, 3, 10, 0, 0) + (j + 1) * 150000));
    lire();
  }
  return sigs;
}

// ── Les tables ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function catalogueDeLaFixture() {
  const C = JSON.parse(fs.readFileSync(path.join(RACINE, 'tests', 'unit', 'fixtures', 'cas-60-6-generateur.json'), 'utf8')), c = {};
  Object.keys(C.catalogue).forEach(slug => { const [equipement, p, s] = C.catalogue[slug]; c[slug] = { equipement, muscles_primaires: p.slice(), muscles_secondaires: s.slice() }; });
  // Les barres à pause (la 2e exposition d'une barre en Force, `PAUSE`) manquent à la fixture de 60-6 : on les ajoute, sinon la pause ne se joue pas.
  [['squat_avec_pause_barre', 'squat_barre'], ['developpe_couche_avec_pause', 'developpe_couche_barre']].forEach(([pause, barre]) => {
    if (!c[pause] && c[barre]) c[pause] = { equipement: 'barre', muscles_primaires: c[barre].muscles_primaires.slice(), muscles_secondaires: c[barre].muscles_secondaires.slice() }; });
  return { catalogue: c, faits: C.generer[0].entree.faits };
}
const sur = (f) => { try { const v = f(); return JSON.stringify(v === undefined ? null : v); } catch (e) { return 'exception ' + String(e).slice(0, 60); } };

// 6 × 5 × 2 × 2 × 3 × 4 × 2 = 2 880 programmes + les cartes des cycles. Une ligne : [clé, une fonction de X qui rend une chaîne].
function tableProgrammes() {
  const L = [], { catalogue, faits } = catalogueDeLaFixture();
  const ENTRETIENS = [[], ['force'], ['calisthenie'], ['forme']], MENAGER = [[], ['dos']];
  BUTS.forEach(o => [2, 3, 4, 5, 6].forEach(j => [false, true].forEach(d => ['salle_complete', 'poids_du_corps'].forEach(m => [true, false, null].forEach(p65 => ENTRETIENS.forEach((en, ie) => MENAGER.forEach((mg, im) => {
    const entree = { jours: j, objectif: o, phase: 'maintien', materiel: m, priorites: [], menager: mg, ecartes: [], faits, plus65: p65, objectifs_entretien: en };
    if (d) entree.anciennete = 'moins_1_an';
    L.push(['programmes|' + [o, j, d ? 'deb' : 'exp', m, p65, ie, im].join('|'), X => sur(() => X.G.generer(JSON.parse(JSON.stringify(catalogue)), JSON.parse(JSON.stringify(entree))))]);
  })))))));
  BUTS.forEach(o => [20, 21].forEach(jd => [5, 6].forEach(sc => [false, true].forEach(ep => [false, true].forEach(ca => [false, true].forEach(dv =>
    L.push(['cycles|' + [o, jd, sc, ep, ca, dv].join('|'), X => sur(() => X.G.carteCycles({ objectif: o, joursDepuisCreation: jd, seancesDuDossier: sc, estProgramme: ep, carnet: ca, dejaVue: dv }))])))))));
  return L;
}
const BILAN = { exercices: {}, paris: 0, tenus: 0 };
// 8 buts × 3 blocs × 2 (phases) = 48 lignes.
function tableBlocs() {
  const L = [];
  [].concat(BUTS, ['', 'inconnu']).forEach(o => ['lourd', 'mix', 'hypertrophie'].forEach(z => [false, true].forEach(ph => {
    const bloc = { id: 'b1', dossier: 'Haut', zone: z, debut: '2026-11-02', semaines: 4, decharge: true, exercices: ['squat_barre'], statut: 'en_cours', grosse_serie: false };
    L.push(['blocs|' + [o === null ? 'null' : o === '' ? 'vide' : o, z, ph ? 'phases' : 'blocs'].join('|'), X => JSON.stringify([
      sur(() => X.M.zonesDeBloc(o)), sur(() => X.M.zoneDuPremierBloc(o)), sur(() => X.M.grosseSerieParDefaut(o)), sur(() => X.M.blocSuivant(bloc, ph, o)),
      sur(() => { const k = X.M.carteFinDeBloc(bloc, BILAN, {}, null, ph, o); return k && [k.suivant, k.commencer, k.suivantZone]; }),
      sur(() => { const k = X.M.carteSchema(z, { niveau: 1, reps: 8, charge: 100 }, 3, false, o); return k && [k.phrase, k.detail]; })])]);
  })));
  return L;
}
function comparerTable(A, B, lignes) {
  let diff = 0; const ex = [];
  lignes.forEach(([cle, f]) => { const a = f(A), b = f(B); if (a !== b) { diff++; if (ex.length < 3) ex.push('  ' + cle + '\n     A ' + a.slice(0, 300) + '\n     B ' + b.slice(0, 300)); } });
  return { n: lignes.length, diff, ex };
}
module.exports = { histoiresBut, jouerBut, tableProgrammes, tableBlocs, comparerTable };

/** @jest-environment node */
//
// PR 4b (R-A, SPEC §4.2, O13) — LA CAMPAGNE SYNTHÉTIQUE DES ZÉROS. Un générateur à graine fixe (déterministe) joue des pratiquants sur 14 séances : leur capacité monte,
// un mauvais jour les met parfois à zéro rep ; trois comportements (suivre la consigne, retenter la charge du zéro, « Tenter ») × deux typages (`travail` et `echec`
// à 0 rep, comme « Oui, manquée » l'écrit) × trois grilles (barre 2,5 · machine 5 · haltères 2 ; la grille de 1 kg n'est pas jouée ici). Assertions dures : la tenue ne dure pas
// plus de 2 séances quand la personne suit ; jamais sous le palier ; jamais au-dessus de la consigne d'avant plafond ; sans zéro, la consigne est octet pour octet celle de
// sans-plafond. IMPRIMÉ pour D-A1 : plafonds posés / mordants / levés par (A) / levés par (N) / zéros répétés à la même charge, et le taux de séances où le plafond mord.

process.env.TZ = 'Europe/Paris';
global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/semaine.js');
require('../../v2/js/profil.js');
require('../../v2/js/generateur.js');
const M = require('../../v2/js/moteur.js');

const PROFILS = Number(process.env.CAMPAGNE_PROFILS || 50);
const SEANCES = 14;
const GRILLES = [{ nom: 'barre 2,5', equipement: 'barre', pas: 2.5 }, { nom: 'machine 5', equipement: 'machine', pas: 5 }, { nom: 'haltères 2', equipement: 'haltere', pas: 2 }];
const COMPORTEMENTS = ['suit', 'retente', 'tente'];
const TYPAGES = ['travail', 'echec'];

let graine = 20261113;
const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };
let nb = 0;
const brute = (kg, reps, type) => ({ id: 'c' + (++nb), rang: nb, charge_kg: kg, reps, rpe: null, ressenti: reps >= 8 ? 'reste_3_plus' : null, type_serie: type || 'travail', exercise_slug: 'dc' });
const jour = (i) => new Date(Date.UTC(2026, 8, 1 + i * 3, 18)).toISOString();
const arrondi = (v, pas) => Math.max(pas, Math.round(v / pas) * pas);

function jouer(grille, typage, comportement) {
  const cap0 = 40 + Math.floor(alea() * 100);
  const croissance = 0.004 + alea() * 0.01;
  const mauvais = 0.06 + alea() * 0.12;   // la part des séances où la forme est mauvaise
  let cap = arrondi(cap0, grille.pas);
  const histoire = [];
  const opt = { mesure: 'charge_reps', equipement: grille.equipement, intention: 'progresser', reglage: 'normal', edition: false, debutant: false };
  const sortie = { seances: 0, mord: 0, zeros: 0, poses: 0, repetes: 0, plafonds: 0, leveA: 0, leveN: 0, violations: [], serie: 0, max: 0 };
  let courant = 0, dernierZero = null, derniereCharge = null, plafondOuvert = false;
  for (let i = 0; i < SEANCES; i++) {
    const avant = new Date(Date.parse(jour(i)) - 1000).toISOString();
    let charge, tentee = false;
    const reel = histoire.length ? M.consigneDExercice(histoire, undefined, avant, opt) : null;
    const k = reel ? reel.consigne : null;
    if (k) {
      // sans zéro : octet pour octet
      if (!histoire.some((h) => h.series.some((q) => q.reps === 0))) {
        const nu = M.consigneDExercice(histoire, undefined, avant, Object.assign({ sansZero: true }, opt)).consigne;
        if (JSON.stringify(nu) !== JSON.stringify(k)) sortie.violations.push('consigne sans zéro différente (séance ' + i + ')');
      }
      const pz = k.fondement ? k.fondement.plafondZero : null;
      const ligne = k.ligne ? Number(k.ligne.charge) : null;
      if (k.etat === 'tenue_apres_zero') {
        sortie.mord++; courant++; sortie.max = Math.max(sortie.max, courant);
        if (!plafondOuvert) { sortie.plafonds++; plafondOuvert = true; }
        const palier = Number(k.palier);
        if (!(ligne !== null && Math.abs(ligne - palier) < 1e-9)) sortie.violations.push('sous ou hors du palier (' + ligne + ' pour ' + palier + ')');
        const sans = pz && pz.sans && pz.sans.ligne ? Number(pz.sans.ligne.charge) : null;
        if (sans !== null && ligne > sans + 1e-9) sortie.violations.push('au-dessus de la consigne d\'avant plafond (' + ligne + ' > ' + sans + ')');
        charge = ligne;
        if (comportement === 'retente' && dernierZero !== null) charge = dernierZero;
        if (comportement === 'tente' && pz && pz.sans) { const t = M.boutonsDeLaTenue(k); if (t && t.charge !== null) { charge = t.charge; tentee = true; } }
      } else {
        if (plafondOuvert) { plafondOuvert = false; if (courant < 2) sortie.leveA++; else sortie.leveN++; }
        courant = 0;
        charge = k.haut && Number(k.haut.charge) > 0 ? Number(k.haut.charge) : (k.ligne ? Number(k.ligne.charge) : null);
      }
      if (charge === null || !(charge > 0)) charge = arrondi(cap * 0.85, grille.pas);
    } else {
      charge = arrondi(cap * 0.85, grille.pas);
    }
    // la séance : 3 séries, la forme du jour, la fatigue d'une série à l'autre
    const forme = (alea() < mauvais ? 0.9 : 1) * (1 + (alea() - 0.5) * 0.03);
    const series = [];
    for (let s = 0; s < 3; s++) {
      const e1 = cap * forme * (1 - 0.025 * s);
      const reps = Math.max(0, Math.min(12, Math.floor(30 * (e1 / charge - 1))));
      series.push(brute(charge, reps, reps === 0 ? typage : 'travail'));
    }
    // un zéro « de porte » : une série à 0 rep PLUS LOURDE que tout succès (de l'histoire et de la séance) — celui qui pose un plafond
    const succes = Math.max(0, ...histoire.concat([{ series }]).reduce((a, h) => a.concat(h.series.filter((q) => q.reps > 0).map((q) => q.charge_kg)), []));
    const zeroDePorte = series.some((q) => q.reps === 0 && q.charge_kg > succes + 1e-9);
    if (series.some((q) => q.reps === 0)) sortie.zeros++;
    if (zeroDePorte) {
      sortie.poses++;
      if (derniereCharge !== null && Math.abs(derniereCharge - charge) < 1e-9) sortie.repetes++;
      derniereCharge = charge;
      dernierZero = charge;
    }
    sortie.seances++;
    histoire.push({ seance: { id: 'H' + i, debut: jour(i) }, series });
    cap = cap * (1 + croissance);
  }
  return sortie;
}

describe('campagne synthétique des zéros (SPEC §4.2, O13) — déterministe, à graine fixe', () => {
  const total = { seances: 0, mord: 0, zeros: 0, poses: 0, repetes: 0, plafonds: 0, leveA: 0, leveN: 0, sims: 0 };
  const violations = [];
  let plusLong = 0;
  GRILLES.forEach((g) => TYPAGES.forEach((t) => COMPORTEMENTS.forEach((c) => {
    test(g.nom + ' · typage ' + t + ' · ' + c, () => {
      for (let p = 0; p < PROFILS; p++) {
        const r = jouer(g, t, c);
        total.sims++;
        ['seances', 'mord', 'zeros', 'poses', 'repetes', 'plafonds', 'leveA', 'leveN'].forEach((k) => { total[k] += r[k]; });
        r.violations.forEach((v) => violations.push(g.nom + '/' + t + '/' + c + ' : ' + v));
        if (c === 'suit') plusLong = Math.max(plusLong, r.max);
      }
      expect(violations).toEqual([]);
    }, 120000);
  })));
  test('la tenue ne dure pas plus de 2 séances quand la personne suit la consigne ; le bilan est imprimé', () => {
    const taux = total.seances ? Math.round(1000 * total.mord / total.seances) / 10 : 0;
    const reviennent = total.poses ? Math.round(1000 * total.repetes / total.poses) / 10 : 0;
    // eslint-disable-next-line no-console
    console.log('CAMPAGNE ZÉROS : ' + total.sims + ' parcours, ' + total.seances + ' séances ; séances avec un 0 rep ' + total.zeros + ' ; zéros de porte (posent un plafond) ' + total.poses +
      ' ; séances où le plafond mord ' + total.mord + ' (' + taux + ' % des séances) ; plafonds mordants ' + total.plafonds + ' ; levés par (A) ' + total.leveA + ' ; par (N) ' + total.leveN +
      ' ; zéros de porte revenus à la même charge ' + total.repetes + ' (' + reviennent + ' % ; seuil d\'alerte D-A1 : 25 %) ; plus longue tenue suivie ' + plusLong);
    expect(plusLong).toBeLessThanOrEqual(2);
    expect(total.mord).toBeGreaterThan(0);
  });
});

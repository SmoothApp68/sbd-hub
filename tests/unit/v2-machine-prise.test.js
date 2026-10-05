/** @jest-environment node */
//
// 51-2 — « Machine prise » (MOTEUR §9.19, delta 51-2).
//
//   · `plusTard` et `freresProposes`, sur les 9 cas de
//     `cas-51-2-machine-prise.json` (une méthode : superset, dernier bloc,
//     exercice commencé, frères avec et sans historique, sans mouvement) ;
//   · « Plus tard » sur une vraie séance, par le geste existant
//     (`reordonnerBlocs`) : le superset bouge en entier, et la consigne ne
//     change pas — ni ses lignes, ni ses lignes figées (I4) ;
//   · un bloc est une occurrence : deux occurrences voisines d'un même
//     exercice, deux blocs ;
//   · le fait sous un frère est « Dernière séance » de sa page d'exercice
//     (`derniereSeanceDe`), et le frère passe par le remplacement existant.
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES : un exercice déplacé APRÈS un exercice
// commencé (ses lignes figées remontent : I4 les suit) ; des frères dont l'ordre
// par nom et l'ordre par historique diffèrent ; deux occurrences VOISINES (non
// voisines, elles étaient déjà deux blocs).

const fs = require('fs');
const path = require('path');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
const T = require('../../v2/js/plan.js');
const Modele = require('../../v2/js/modele.js');

const CAS = require('./fixtures/cas-51-2-machine-prise.json');
const FANTOME = require('./fixtures/cas-49u2-fantome.json');
const F044 = FANTOME.cas.find((x) => x.id === 'F044');
const CONSIGNE = { etat: F044.consigne.etat, zone: F044.consigne.zone === null ? null : F044.consigne.zone.nom,
  palier: F044.consigne.palier, n: F044.consigne.n, ligne: F044.consigne.ligne, haut: F044.consigne.haut };

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

const copie = (o) => JSON.parse(JSON.stringify(o));

// ══ 1. LES 9 CAS ═════════════════════════════════════════════════════════════

describe('51-2 — les 9 cas de référence', () => {
  test('le fichier de cas : 5 « plus tard », 4 « frères »', () => {
    expect(CAS.cas.plus_tard).toHaveLength(5);
    expect(CAS.cas.freres).toHaveLength(4);
  });

  CAS.cas.plus_tard.forEach((c) => {
    test('plus tard — ' + c.titre, () => {
      const avant = copie(c.blocs);
      expect(S.plusTard(c.blocs, c.i)).toEqual(c.attendu);
      expect(c.blocs).toEqual(avant);
    });
  });

  CAS.cas.freres.forEach((c) => {
    test('frères — ' + c.titre, () => {
      const avant = copie([c.faits, c.presents, CAS.catalogue]);
      expect(S.freresProposes(c.slug, CAS.catalogue, c.faits, c.presents)).toEqual(c.attendu);
      expect([c.faits, c.presents, CAS.catalogue]).toEqual(avant);
    });
  });

  test('⚠️ DISCRIMINANT — l’ordre par nom seul serait faux : l’historique passe devant le nom', () => {
    // Dans le cas du hip thrust, la barre (avec historique) passe devant
    // « une jambe », que le nom seul mettrait aussi devant. Un cas forgé où le
    // nom et l'historique s'opposent : « Spoto bench », seul fait, en tête.
    const faits = { spoto_bench: { date: '2026-09-01', charge_kg: 100, reps: 5 } };
    expect(S.freresProposes('chest_press_machine', CAS.catalogue, faits, []).map((f) => f.slug))
      .toEqual(['spoto_bench', 'developpe_couche_barre', 'developpe_couche_haltere']);
  });

  test('« plus tard » d’un exercice commencé au dernier bloc : « dernier » d’abord', () => {
    const blocs = [{ id: 'a', exercices: [{ slug: 'x', travail_valide: false }] },
      { id: 'b', exercices: [{ slug: 'y', travail_valide: true }] }];
    expect(S.plusTard(blocs, 1)).toEqual({ possible: false, raison: 'dernier' });
  });

  test('un exercice d’un superset commencé suffit : tout le bloc reste', () => {
    const blocs = [{ id: 'a', exercices: [{ slug: 'x', travail_valide: false }, { slug: 'y', travail_valide: true }] },
      { id: 'b', exercices: [{ slug: 'z', travail_valide: false }] }];
    expect(S.plusTard(blocs, 0)).toEqual({ possible: false, raison: 'commencé' });
  });
});

// ══ 2. « PLUS TARD » SUR UNE VRAIE SÉANCE ════════════════════════════════════

const QUAND = new Date('2026-10-05T10:30:00Z');
const CAT = [
  { slug: 'w', nom: 'W', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [] },
  { slug: 'x', nom: 'X', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [] },
  { slug: 'y', nom: 'Y', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [] },
  { slug: 'z', nom: 'Z', mesure: 'charge_reps', charge: 'externe', muscles_primaires: [] }
];
function decor(slugs, n) {
  let k = 0;
  const id = () => 'm-s' + (++k);
  let se = S.creer({ id: 'S', userId: 'u', idSerie: id });
  slugs.forEach((slug) => { se = S.ajouterExercice(se, slug, id, { series: n || 3 }); });
  return { se, id };
}
const faire = (se, i, j, kg, reps) =>
  S.valider(S.modifierSerie(se, i, j, { charge_kg: kg, reps: reps }), i, j, QUAND);
const entreesDe = (se, paris) => ({
  seance: { id: 'S', debut: '2026-10-05T10:00:00Z', edition: false, exercices: se.exercices },
  consignes: { x: { consigne: CONSIGNE, contexte: F044.contexte } }, reglage: 'normal', paris: paris.slice()
});
function validerEtParier(etat, i, j, kg, reps) {
  etat.se = faire(etat.se, i, j, kg, reps);
  const q = (T.planDeSeance(entreesDe(etat.se, etat.paris)).exercices[i].paris || [])[j];
  if (q) etat.paris.push(Object.assign({}, q, { id: 'pari-' + etat.paris.length, set_observe: etat.se.exercices[i].series[j].id }));
  return q;
}
// Le câblage de l'app, rejoué : les blocs de l'écran, ce que `plusTard` lit,
// puis le geste existant.
const indicesDe = (b) => b.exercices.map((x) => x._iExo).filter((i) => i !== null && i !== undefined);
const blocsPourPlusTard = new Function('return ' + extraire('blocsPourPlusTard'))();
function plusTardDans(se, iBloc) {
  const blocs = Modele.blocsDeSeance(se, CAT);
  const r = S.plusTard(blocsPourPlusTard(blocs), iBloc);
  if (!r.possible) return { r, se };
  return { r, se: S.reordonnerBlocs(se, r.ordre.map((k) => indicesDe(blocs[k]))) };
}
const lignesDe = (p, slug) => p.exercices.filter((q) => q.slug === slug)[0].lignes
  .map((l) => ({ role: l.role, charge: l.charge, reps: l.reps, figee: !!l.figee }));

describe('51-2 — « Plus tard » sur une séance : le geste existant, la consigne intacte', () => {
  test('⚠️ DISCRIMINANT — x passe après y : son plan (rôles, charges, reps) ne change pas, et I4 se tait', () => {
    const etat = decor(['w', 'x', 'y', 'z']);
    etat.paris = [];
    const avant = T.planDeSeance(entreesDe(etat.se, etat.paris));
    expect(avant.exercices[1].consigne).toBeTruthy();
    const { r, se } = plusTardDans(etat.se, 1);
    expect(r.possible).toBe(true);
    expect(se.exercices.map((e) => e.exercise_slug)).toEqual(['w', 'y', 'x', 'z']);
    const e = entreesDe(se, etat.paris);
    const apres = T.planDeSeance(e);
    expect(lignesDe(apres, 'x')).toEqual(lignesDe(avant, 'x'));
    expect(apres.exercices[2].consigne).toEqual(avant.exercices[1].consigne);
    expect(T.verifierPlan(apres, e, avant).erreurs).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — w passe après x COMMENCÉ : les lignes figées de x remontent, I4 les suit', () => {
    const etat = decor(['w', 'x', 'z']);
    etat.paris = [];
    validerEtParier(etat, 1, 0, 50, 8);
    const avant = T.planDeSeance(entreesDe(etat.se, etat.paris));
    expect(lignesDe(avant, 'x').filter((l) => l.figee)).toHaveLength(1);
    const { se } = plusTardDans(etat.se, 0);
    expect(se.exercices.map((e) => e.exercise_slug)).toEqual(['x', 'w', 'z']);
    const e = entreesDe(se, etat.paris);
    const apres = T.planDeSeance(e);
    expect(lignesDe(apres, 'x')).toEqual(lignesDe(avant, 'x'));
    expect(T.verifierPlan(apres, e, avant).erreurs).toEqual([]);
  });

  test('un exercice commencé ne recule pas : `plusTard` le refuse, la séance ne bouge pas', () => {
    const etat = decor(['w', 'x', 'z']);
    etat.paris = [];
    validerEtParier(etat, 1, 0, 50, 8);
    const { r, se } = plusTardDans(etat.se, 1);
    expect(r).toEqual({ possible: false, raison: 'commencé' });
    expect(se).toBe(etat.se);
  });

  test('une chauffe validée ne compte pas comme un exercice commencé', () => {
    let { se } = decor(['w', 'x', 'z']);
    se = S.changerType(se, 1, 0, 'echauffement');
    se = faire(se, 1, 0, 20, 10);
    expect(plusTardDans(se, 1).r.possible).toBe(true);
  });

  test('⚠️ DISCRIMINANT — un superset bouge en entier, et reste un superset', () => {
    let { se } = decor(['w', 'x', 'y', 'z']);
    se = S.grouperBlocs(se, [1], [2]);
    const blocs = Modele.blocsDeSeance(se, CAT);
    expect(blocs.map((b) => b.exercices.map((x) => x.slug).join('+'))).toEqual(['w', 'x+y', 'z']);
    const { se: apres } = plusTardDans(se, 1);
    const b2 = Modele.blocsDeSeance(apres, CAT);
    expect(b2.map((b) => b.exercices.map((x) => x.slug).join('+'))).toEqual(['w', 'z', 'x+y']);
    expect(b2[2].superset).toBe(true);
  });

  test('le dernier bloc ne recule pas', () => {
    const { se } = decor(['w', 'x']);
    expect(plusTardDans(se, 1).r).toEqual({ possible: false, raison: 'dernier' });
  });

  test('deux fois de suite : il recule de deux', () => {
    const { se } = decor(['w', 'x', 'y', 'z']);
    const une = plusTardDans(se, 0).se;
    const deux = plusTardDans(une, 1).se;
    expect(deux.exercices.map((e) => e.exercise_slug)).toEqual(['x', 'y', 'w', 'z']);
  });
});

// ══ 3. UN BLOC EST UNE OCCURRENCE ════════════════════════════════════════════

describe('51-2 — deux occurrences voisines d’un même exercice : deux blocs', () => {
  test('⚠️ DISCRIMINANT — x, x : deux blocs, chacun son occurrence et ses lignes', () => {
    const { se } = decor(['x', 'x'], 4);
    const blocs = Modele.blocsDeSeance(se, CAT);
    expect(blocs).toHaveLength(2);
    expect(blocs.map((b) => b.exercices.map((x) => [x._iExo, x.series.length]))).toEqual([[[0, 4]], [[1, 4]]]);
  });

  test('« Plus tard » qui amène deux occurrences côte à côte : toujours deux blocs', () => {
    const { se } = decor(['x', 'y', 'x']);
    const { se: apres } = plusTardDans(se, 1);
    expect(apres.exercices.map((e) => e.exercise_slug)).toEqual(['x', 'x', 'y']);
    expect(Modele.blocsDeSeance(apres, CAT).map((b) => b.exercices.length)).toEqual([1, 1, 1]);
  });

  test('les lignes lues en base (sans occurrence) gardent la règle par exercice : le détail d’une séance enregistrée', () => {
    const plat = [1, 2, 3].map((k) => ({ exercise_slug: 'x', rang: k, groupe_superset: null, type_serie: 'travail' }));
    expect(Modele.construireBlocs(plat, CAT)).toHaveLength(1);
  });
});

// ══ 4. LE CÂBLAGE : LE FAIT DU FRÈRE, LE REMPLACEMENT ════════════════════════

describe('51-2 — le fait sous un frère est « Dernière séance », et le frère est un remplacement', () => {
  test('la page d’exercice et les frères passent par la MÊME fonction (`derniereSeanceDe`)', () => {
    expect(extraire('rendreExercice')).toMatch(/\bderniereSeanceDe\(slug, groupes\)/);
    expect(extraire('faitsDesFreres')).toMatch(/\bderniereSeanceDe\(s\)/);
    expect(extraire('derniereSeanceDe')).toMatch(/Modele\.meilleureSerieDe\(/);
  });

  test('« Dernière séance » : la meilleure série de la séance la plus récente, datée de cette séance', () => {
    const local = { exercices: CAT };
    const groupes = [
      { seance: { debut: '2026-09-12T08:00:00Z' }, series: [
        { exercise_slug: 'x', charge_kg: 80, reps: 10, type_serie: 'travail' },
        { exercise_slug: 'x', charge_kg: 70, reps: 12, type_serie: 'travail' }] },
      { seance: { debut: '2026-09-01T08:00:00Z' }, series: [{ exercise_slug: 'x', charge_kg: 90, reps: 10, type_serie: 'travail' }] }];
    const f = new Function('local', 'Modele', 'Palier', 'etatsExercices', 'seancesDeLExercice',
      'return ' + extraire('derniereSeanceDe'))(local, Modele, require('../../v2/js/palier.js'), {}, () => groupes);
    const d = f('x');
    expect([d.charge, d.reps, d.date]).toEqual([80, 10, '2026-09-12T08:00:00Z']);
    expect(f('x', [])).toBe(null);
  });

  test('le catalogue et le frère remplacent par le même chemin (`remplacerDansLaSeance`)', () => {
    expect(extraire('rendreCatalogue')).toMatch(/remplacerDansLaSeance\(intentionCatalogue\.remplace, exo\.slug\)/);
    expect(extraire('vueMachinePrise')).toMatch(/remplacerDansLaSeance\(iExo, f\.slug\)/);
    expect(extraire('remplacerDansLaSeance')).toMatch(/heriterRoutine\(iExo, slug\)[\s\S]*Seance\.remplacerExercice\(/);
  });

  test('« Plus tard » passe par le geste du mode Réorganiser, rien d’autre', () => {
    const corps = extraire('vueMachinePrise');
    expect(corps).toMatch(/Seance\.plusTard\(blocsPourPlusTard\(blocs\), iBloc\)/);
    expect(corps).toMatch(/Seance\.reordonnerBlocs\(/);
    expect(corps).not.toMatch(/\bconsignes\s*=/);
  });
});

// « La routine apprend de tes gestes » (16/11/2026, MOTEUR §9.27 quater, I208 à I213).
// Le décompte (3 sur 4 dernières séances terminées de la routine), ses exclusions, la carte (le coach parle), le report
// plafonné à 6 séries, l'écriture pure (`Routines.retraitDExercice`) et sa vérification, la réponse durable « garder ».
global.self = global;
const H = require('./helpers-equilibres.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;
const { Eq, CAT, construire, entree, routine, EXOS_A, EXOS_B, R_A, R_B, equilibrees } = H;
const Routines = require('../../v2/js/routines.js');
const fs = require('fs');
const path = require('path');

const sansCurl = Object.assign({}, EXOS_A);
delete sansCurl.curl;
const RETRAIT_CURL = [{ geste: 'retrait', slug: 'curl' }];

// Quatre séances de « Haut A » (semaines 0 à 3) : le curl retiré à la main dans `retirees` d'entre elles.
function quatre(retirees, autres) {
  const sem = {};
  for (let i = 0; i < 4; i++) {
    const retire = retirees.indexOf(i) >= 0;
    const o = autres && autres(i);
    sem[i] = [Object.assign({ routine: 'r-a', exos: retire ? sansCurl : EXOS_A, gestes: retire ? RETRAIT_CURL : [] }, o || {})];
  }
  return construire(sem);
}
const gestesDe = (a) => a.cartes.filter((c) => c.kind === 'geste');
const tout = (a) => a.cartes.concat(a.constats).filter((c) => c.kind === 'geste');

describe('§9.27 quater — le décompte (I208, I212)', () => {
  test('3 retraits sur 4 : une carte, le coach parle à la 1re personne, avec le fait et la proposition', () => {
    const e = entree(quatre([0, 1, 3]));
    const a = Eq.analyser(e);
    const c = gestesDe(a);
    expect(c.length).toBe(1);
    expect(c[0].titre).toBe('Le coach te dit');
    expect(c[0].phrases[0]).toBe('Tu as retiré Curl Biceps 3 fois sur tes 4 dernières séances « Haut A ».');
    expect(c[0].phrases[1]).toBe('Je peux l’enlever de « Haut A ».');
    // La conséquence : ce que les routines prévoient pour le biceps (curl 3 + rowing ½ × 4 + tractions ½ × 3), avant et après.
    expect(c[0].phrases[2]).toBe('Biceps : tes routines prévoient 6,5 séries par semaine, 3,5 sans cet exercice.');
    expect(c[0].propositions.map((p) => p.libelle)).toEqual(['Retirer de « Haut A »', 'Garder']);
    expect(c[0].propositions[0].fait).toBe('C’est fait : « Haut A » sans Curl Biceps.');
    expect(c[0].propositions[1].fait).toBe('Noté : je garde Curl Biceps dans « Haut A » et je ne te le redemande plus.');
    expect(Eq.verifierGestes(e, a)).toEqual([]);
  });

  test('2 retraits sur 4 : rien (le seuil est 3)', () => {
    expect(gestesDe(Eq.analyser(entree(quatre([0, 2]))))).toEqual([]);
  });

  test('seulement 3 séances de la routine : rien (la fenêtre est de 4)', () => {
    const b = quatre([0, 1, 2]);
    b.seances = b.seances.filter((s, i) => i < 3);
    expect(gestesDe(Eq.analyser(entree(b)))).toEqual([]);
  });

  test('les 4 DERNIÈRES : trois retraits anciens et une séance récente sans retrait ne suffisent plus', () => {
    // Semaines 1, 2, 3 retirées, la 0 (la plus récente) faite, et une 5ᵉ plus ancienne faite : la fenêtre = 0..3, soit 3 sur 4 ; on
    // ajoute une séance récente (semaine 0, 2ᵉ du jour) faite : la fenêtre glisse, plus que 2 sur 4.
    const sem = {};
    for (let i = 0; i < 4; i++) sem[i] = [{ routine: 'r-a', exos: i >= 1 ? sansCurl : EXOS_A, gestes: i >= 1 ? RETRAIT_CURL : [] }];
    sem[0].push({ routine: 'r-a', exos: EXOS_A });
    expect(gestesDe(Eq.analyser(entree(construire(sem))))).toEqual([]);
  });

  test('(a) exclusions : sans routine, décharge, semaine allégée, raccourci, machine prise, séance en cours', () => {
    const cas = {
      'sans routine': (b) => { b.seances.forEach((s) => { s.routine_id = null; }); },
      'décharge': (b) => { b.seances[0].decharge = true; b.seances[1].decharge = true; },
      'en cours': (b) => { b.seances[0].statut = 'en_cours'; b.seances[1].statut = 'en_cours'; },
      'raccourci': (b) => { b.seances.slice(0, 2).forEach((s) => { s.gestes = [{ geste: 'raccourci', retires: ['curl'] }, { geste: 'retrait', slug: 'curl' }]; }); },
      'machine prise': (b) => { b.seances.slice(0, 2).forEach((s) => { s.gestes = [{ geste: 'machine_prise', slug: 'curl' }, { geste: 'retrait', slug: 'curl' }]; }); }
    };
    Object.keys(cas).forEach((k) => {
      const b = quatre([0, 1, 2, 3]);
      cas[k](b);
      expect([k, gestesDe(Eq.analyser(entree(b))).length]).toEqual([k, 0]);
    });
    // La semaine allégée : deux séances dans une période allégée.
    const b = quatre([0, 1, 2, 3]);
    const jours = b.seances.slice(0, 2).map((s) => s.debut.slice(0, 10));
    const periodes = jours.map((j) => { const d = new Date(Date.parse(j) + 86400000); return { debut: j, fin: d.toISOString().slice(0, 10) }; });
    const a = Eq.analyser(entree(b, { periodesAllegees: periodes.concat(b.seances.slice(0, 2).map((s) => {
      const d = new Date(s.debut); const j = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { debut: j, fin: j };
    })) }));
    expect(gestesDe(a)).toEqual([]);
  });

  test('(a) un exercice hors routine retiré à la main : rien ; un exercice FAIT malgré le geste : ne compte pas', () => {
    const b = quatre([], () => ({ gestes: [{ geste: 'retrait', slug: 'leg_curl' }] }));
    expect(gestesDe(Eq.analyser(entree(b)))).toEqual([]);
    const c = quatre([], () => ({ gestes: RETRAIT_CURL }));   // le curl est fait chaque fois
    expect(gestesDe(Eq.analyser(entree(c)))).toEqual([]);
  });

  test('« Juste un carnet » : aucune carte', () => {
    expect(tout(Eq.analyser(entree(quatre([0, 1, 2]), { intention: 'entretien' })))).toEqual([]);
  });

  test('(e) le décompte est un : `gestesRecurrents` lit `gesteDeLExercice`, et les causes d’équilibre aussi', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/equilibres.js'), 'utf8');
    // Le type « retrait » ne se compare qu'à un endroit : `gesteDeLExercice` (et le décompte qui lit SA sortie).
    const comparaisons = src.split('\n').filter((l) => /geste\s*===\s*'retrait'|de\('retrait'\)/.test(l) && !/^\s*\/\//.test(l));
    expect(comparaisons.length).toBe(4);   // de('retrait') ; le décompte ; la cause d'équilibre ; la relecture indépendante de I208
    expect(/function causesDe[\s\S]*gesteDeLExercice\(s, slug\)[\s\S]*function semainesFaites/.test(src)).toBe(true);
    expect(/function gestesRecurrents[\s\S]*gesteDeLExercice\(s, slug\)[\s\S]*function reportDuRetrait/.test(src)).toBe(true);
  });

  test('une carte en peu de recul (moins de 12 séances) : la section s’ouvre quand même pour elle', () => {
    const a = Eq.analyser(entree(quatre([0, 1, 2])));
    expect(a.etat).toBe('peu');
    expect(gestesDe(a).length).toBe(1);
  });

  test('avec un long historique (état ok) : la carte rejoint les autres, après le temps et avant les équilibres', () => {
    const sem = equilibrees(14, { a: (i) => (i < 4 ? { curl: 0 } : {}) });
    const b = construire(sem);
    b.seances.forEach((s, i) => { if (s.routine_id === 'r-a' && !b.series.some((x) => x.session_id === s.id && x.exercise_slug === 'curl')) s.gestes = RETRAIT_CURL; });
    const a = Eq.analyser(entree(b, { reglage: 'franc' }));
    expect(a.etat).toBe('ok');
    expect(gestesDe(a).length).toBe(1);
    expect(Eq.ORDRE_DES_FAMILLES.indexOf('gestes')).toBe(Eq.ORDRE_DES_FAMILLES.indexOf('temps') + 1);
  });
});

describe('§9.27 quater — le remplacement par la même paire', () => {
  const remplace = (i) => {
    const exos = Object.assign({}, sansCurl, { curl_marteau: 3 });
    return i < 3 ? { exos, gestes: [{ geste: 'remplacement', slug: 'curl', vers: 'curl_marteau' }] } : null;
  };
  const CAT2 = Object.assign({}, CAT, { curl_marteau: { nom: 'Curl Marteau', muscles_primaires: ['biceps'], muscles_secondaires: [], muscles_stabilisateurs: [] } });
  test('3 fois A → B : « Je mets B à sa place ? », Remplacer · Garder A', () => {
    const e = entree(quatre([], remplace), { catalogue: CAT2 });
    const c = gestesDe(Eq.analyser(e));
    expect(c.length).toBe(1);
    expect(c[0].cle).toBe('geste|r-a|curl|curl_marteau');
    expect(c[0].phrases).toEqual(['Tu as remplacé Curl Biceps par Curl Marteau 3 fois sur tes 4 dernières séances « Haut A ».',
      'Je mets Curl Marteau à sa place ? Mêmes séries ; la charge repart de ton historique sur Curl Marteau.']);
    expect(c[0].propositions.map((p) => p.libelle)).toEqual(['Remplacer', 'Garder Curl Biceps']);
    expect(c[0].propositions[0].fait).toBe('C’est fait : Curl Marteau à la place de Curl Biceps dans « Haut A ».');
    expect(Eq.verifierGestes(e, Eq.analyser(e))).toEqual([]);
  });
  test('deux remplaçants différents (2 + 1) : rien — la paire compte, pas le retrait', () => {
    const b = quatre([], (i) => (i < 3 ? { exos: sansCurl, gestes: [{ geste: 'remplacement', slug: 'curl', vers: i < 2 ? 'curl_marteau' : 'leg_curl' }] } : null));
    expect(gestesDe(Eq.analyser(entree(b, { catalogue: CAT2 })))).toEqual([]);
  });
  test('un remplaçant déjà dans la routine : rien (un doublon)', () => {
    const b = quatre([], (i) => (i < 3 ? { exos: sansCurl, gestes: [{ geste: 'remplacement', slug: 'curl', vers: 'extension_triceps' }] } : null));
    expect(gestesDe(Eq.analyser(entree(b)))).toEqual([]);
  });
});

describe('§9.27 quater — le report (I213)', () => {
  // Une routine de pectoraux : couché 4 et incliné 3 ; l'incliné retiré 3 fois.
  const exos = { developpe_couche_barre: 4, developpe_incline_halteres: 3, rowing_barre: 3 };
  const R = routine('r-p', 'Pecs', exos);
  const sans = { developpe_couche_barre: 4, rowing_barre: 3 };
  const base = (rt) => {
    const sem = {};
    for (let i = 0; i < 4; i++) sem[i] = [{ routine: rt.id, exos: i < 3 ? sans : exos, gestes: i < 3 ? [{ geste: 'retrait', slug: 'developpe_incline_halteres' }] : [] }];
    return construire(sem);
  };
  test('le couché (même muscle primaire) prend les séries, plafonné à 6 : « 2 de ses 3 séries »', () => {
    const e = entree(base(R), { routines: [R] });
    const a = Eq.analyser(e);
    const c = gestesDe(a)[0];
    expect(c.phrases[1]).toBe('Je peux l’enlever et mettre 2 de ses 3 séries de pectoraux sur Développé Couché (Barre), que tu fais déjà : 6 séries au lieu de 4.');
    expect(c.propositions.map((p) => p.libelle)).toEqual(['D’accord', 'Garder Développé Incliné (Haltères)']);
    expect(c.propositions[0].report).toEqual({ vers: 'developpe_couche_barre', muscle: 'pectoraux', n: 3, ajout: 2, avant: 4, apres: 6 });
    expect(c.propositions[0].fait).toBe('C’est fait : « Pecs » sans Développé Incliné (Haltères), Développé Couché (Barre) à 6 séries.');
    expect(Eq.verifierGestes(e, a)).toEqual([]);
  });
  test('toutes les séries quand il y a la place : « ses 3 séries », 6 au lieu de 3', () => {
    const R3 = routine('r-p', 'Pecs', { developpe_couche_barre: 3, developpe_incline_halteres: 3 });
    const c = gestesDe(Eq.analyser(entree(base(R3), { routines: [R3] })))[0];
    expect(c.phrases[1]).toBe('Je peux l’enlever et mettre ses 3 séries de pectoraux sur Développé Couché (Barre), que tu fais déjà : 6 séries au lieu de 3.');
  });
  test('l’autre exercice est déjà à 6 séries : pas de report, « Je peux l’enlever de … »', () => {
    const R6 = routine('r-p', 'Pecs', { developpe_couche_barre: 6, developpe_incline_halteres: 3 });
    const c = gestesDe(Eq.analyser(entree(base(R6), { routines: [R6] })))[0];
    expect(c.phrases[1]).toBe('Je peux l’enlever de « Pecs ».');
    expect(c.propositions[0].report).toBe(null);
  });
  test('l’écriture : `retraitDExercice` retire l’exercice, ajoute 2 copies (même charge), rien d’autre ; vérifiée', () => {
    const Rc = { id: 'r-p', nom: 'Pecs', exercices: [
      { exercise_slug: 'developpe_couche_barre', groupe_superset: null, series: [
        { type_serie: 'echauffement', charge_kg: 40 }, { type_serie: 'travail', charge_kg: 80, reps_visees: 6 },
        { type_serie: 'travail', charge_kg: 80, reps_visees: 6 }, { type_serie: 'travail', charge_kg: 80, reps_visees: 6 },
        { type_serie: 'travail', charge_kg: 80, reps_visees: 6 }] },
      { exercise_slug: 'developpe_incline_halteres', groupe_superset: 1, series: [{ type_serie: 'travail' }, { type_serie: 'travail' }, { type_serie: 'travail' }] },
      { exercise_slug: 'rowing_barre', groupe_superset: 1, series: [{ type_serie: 'travail', charge_kg: 60 }] }] };
    const p = { slug: 'developpe_incline_halteres', report: { vers: 'developpe_couche_barre', ajout: 2, n: 3, avant: 4, apres: 6 } };
    const v = Routines.retraitDExercice(Rc, p.slug, p.report);
    expect(v.map((x) => x.exercise_slug)).toEqual(['developpe_couche_barre', 'rowing_barre']);
    expect(v[0].series.filter((s) => s.type_serie === 'travail').map((s) => s.charge_kg)).toEqual([80, 80, 80, 80, 80, 80]);
    expect(v[1].groupe_superset).toBe(null);   // le superset tombé à un exercice se dissout
    expect(Eq.verifierRetrait(Rc, v, p)).toEqual([]);
    expect(Rc.exercices.length).toBe(3);        // une copie, jamais en place
    // Mutations de la vérification : un report à 7, une charge changée, un exercice touché.
    const sept = Routines.retraitDExercice(Rc, p.slug, { vers: 'developpe_couche_barre', ajout: 3 });
    expect(Eq.verifierRetrait(Rc, sept, p).length).toBeGreaterThan(0);
    const lourd = JSON.parse(JSON.stringify(v)); lourd[0].series[5].charge_kg = 85;
    expect(Eq.verifierRetrait(Rc, lourd, p).length).toBeGreaterThan(0);
    const touche = JSON.parse(JSON.stringify(v)); touche[1].series.push({ type_serie: 'travail' });
    expect(Eq.verifierRetrait(Rc, touche, p).length).toBeGreaterThan(0);
    expect(Routines.retraitDExercice(Rc, 'absent', null)).toBe(null);
  });
  test('I213 relu sur la carte : un report qui dépasserait 6 est une faute', () => {
    const e = entree(base(R), { routines: [R] });
    const a = Eq.analyser(e);
    const faux = JSON.parse(JSON.stringify(a));
    faux.cartes.filter((c) => c.kind === 'geste')[0].propositions[0].report.apres = 7;
    expect(Eq.verifierGestes(e, faux).some((f) => /^I213/.test(f))).toBe(true);
  });
});

describe('§9.27 quater — la réponse durable (I209, I210)', () => {
  test('(b) « Garder » : plus jamais pour ce (routine, exercice), même avec de nouveaux retraits', () => {
    const cartes = Eq.reponseAuGeste({}, 'r-a', 'curl', 'garder');
    expect(cartes).toEqual({ geste_routine: { 'r-a': { curl: 'garder' } } });
    expect(gestesDe(Eq.analyser(entree(quatre([0, 1, 2, 3]), { cartes })))).toEqual([]);
    // Une carte forcée pour un exercice gardé : I209.
    const e = entree(quatre([0, 1, 2]));
    const a = Eq.analyser(e);
    expect(Eq.verifierGestes(Object.assign({}, e, { cartes }), a).some((f) => /^I209/.test(f))).toBe(true);
  });
  test('« Pas maintenant » : la mécanique des cartes (le silence du réglage)', () => {
    const b = quatre([0, 1, 2]);
    const cle = 'geste|r-a|curl';
    const cartes = { [cle]: Eq.reponse({}, cle, 'non', '2026-10-27') };
    expect(gestesDe(Eq.analyser(entree(b, { cartes })))).toEqual([]);
  });
  test('effacer une réponse : la carte peut revenir ; « Ce que le coach a retenu » liste les réponses', () => {
    let c = Eq.reponseAuGeste({ x: { r: 'non' } }, 'r-a', 'curl', 'garder');
    c = Eq.reponseAuGeste(c, 'r-b', 'leg_curl', 'retirer');
    expect(Eq.gestesRetenus(c)).toEqual([{ routine_id: 'r-a', slug: 'curl', r: 'garder' }, { routine_id: 'r-b', slug: 'leg_curl', r: 'retirer' }]);
    c = Eq.reponseAuGeste(c, 'r-a', 'curl', null);
    expect(c).toEqual({ x: { r: 'non' }, geste_routine: { 'r-b': { leg_curl: 'retirer' } } });
    c = Eq.reponseAuGeste(c, 'r-b', 'leg_curl', null);
    expect(c).toEqual({ x: { r: 'non' } });
    expect(gestesDe(Eq.analyser(entree(quatre([0, 1, 2]), { cartes: c }))).length).toBe(1);
  });
  test('(c) l’analyse n’écrit rien : l’entrée est identique après deux analyses', () => {
    const e = entree(quatre([0, 1, 2]));
    const avant = JSON.stringify({ s: e.seances, r: e.routines, c: e.cartes });
    Eq.analyser(e); Eq.analyser(e);
    expect(JSON.stringify({ s: e.seances, r: e.routines, c: e.cartes })).toBe(avant);
  });
});

describe('§9.27 quater — la voix (I211) et le programme du coach', () => {
  test('(d) aucune phrase d’assiduité ni de cause ; une phrase fautive est vue', () => {
    const e = entree(quatre([0, 1, 2]));
    const a = Eq.analyser(e);
    tout(a).forEach((c) => c.phrases.forEach((t) => expect(/assidu|manqu|oubli|parce que|!|bravo/i.test(t)).toBe(false)));
    const faux = JSON.parse(JSON.stringify(a));
    faux.cartes[0].phrases.push('Tu as manqué tes séances.');
    expect(Eq.verifierGestes(e, faux).some((f) => /^I211/.test(f))).toBe(true);
  });
  test('le programme construit par le coach : la même carte', () => {
    const c = gestesDe(Eq.analyser(entree(quatre([0, 1, 2]), { programmeDuCoach: true })));
    expect(c.length).toBe(1);
    expect(c[0].propositions[0].type).toBe('geste_retirer');
  });
  test('I208 relu : une carte d’un exercice hors routine est une faute', () => {
    const e = entree(quatre([0, 1, 2]));
    const a = Eq.analyser(e);
    expect(Eq.verifierGestes(Object.assign({}, e, { routines: [R_B] }), a).some((f) => /^I208/.test(f))).toBe(true);
  });
});

describe('§9.27 quater — le rendu (la carte du coach, rien sans un toucher)', () => {
  const texte = (n) => n.textContent.replace(/[ \t\n\u00a0\u202f]+/g, ' ').trim();
  test('peu de recul : la section s’ouvre pour la carte ; tête « Le coach te dit », trois boutons, aucun geste au rendu', () => {
    const a = Eq.analyser(entree(quatre([0, 1, 2])));
    const c = document.createElement('div');
    const ecrit = [];
    Rendu.rendreEquilibres(c, { analyse: a, fait: null, surProposition: (k, p) => ecrit.push(p.type), surPlusTard: () => ecrit.push('plus-tard') });
    expect(ecrit).toEqual([]);
    const carte = c.querySelector('[data-equilibre="geste|r-a|curl"]');
    expect(carte.classList.contains('eq-coach')).toBe(true);
    expect(carte.querySelector('.eq-titre').textContent).toBe('Le coach te dit');
    expect(Array.from(carte.querySelectorAll('.eq-fait, .pc-note')).map(texte)).toEqual(['Tu as retiré Curl Biceps 3 fois sur tes 4 dernières séances « Haut A ».',
      'Je peux l’enlever de « Haut A ».', 'Biceps : tes routines prévoient 6,5 séries par semaine, 3,5 sans cet exercice.']);
    expect(Array.from(carte.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Retirer de « Haut A »', 'Garder', 'Pas maintenant']);
    carte.querySelector('[data-proposition="geste_retirer"]').click();
    expect(ecrit).toEqual(['geste_retirer']);
  });
  test('peu de recul, aucune carte : rien ; « C’est fait » reste visible avec « Annuler » après le geste', () => {
    const a = Eq.analyser(entree(quatre([0])));
    const c = document.createElement('div');
    Rendu.rendreEquilibres(c, { analyse: a, fait: null });
    expect(c.children.length).toBe(0);
    let annule = 0;
    Rendu.rendreEquilibres(c, { analyse: a, fait: { texte: 'C’est fait : « Haut A » sans Curl Biceps.', surAnnuler: () => { annule++; } } });
    expect(texte(c)).toMatch(/C’est fait : « Haut A » sans Curl Biceps\./);
    c.querySelector('[data-annuler-equilibre]').click();
    expect(annule).toBe(1);
  });
  test('en silence (constat) : le fait seul, sans bouton', () => {
    const cle = 'geste|r-a|curl';
    const sem = equilibrees(14, { a: (i) => (i < 4 ? { curl: 0 } : {}) });
    const b = construire(sem);
    b.seances.forEach((s) => { if (s.routine_id === 'r-a' && !b.series.some((x) => x.session_id === s.id && x.exercise_slug === 'curl')) s.gestes = RETRAIT_CURL; });
    const a = Eq.analyser(entree(b, { cartes: { [cle]: Eq.reponse({}, cle, 'non', '2026-10-27') } }));
    const c = document.createElement('div');
    Rendu.rendreEquilibres(c, { analyse: a, fait: null, surProposition: () => {}, surPlusTard: () => {} });
    const carte = c.querySelector('[data-equilibre="' + cle + '"]');
    expect(carte.classList.contains('eq-constat')).toBe(true);
    expect(carte.querySelectorAll('button').length).toBe(0);
    expect(Array.from(carte.children).map(texte)).toEqual(['Le coach te dit', 'Tu as retiré Curl Biceps 4 fois sur tes 4 dernières séances « Haut A ».']);
  });
});

//
// 60-2c — « MOINS EN CE MOMENT » DEMANDE COMBIEN (QUESTIONNAIRE-COACH-V2 §3, écran 7).
//
// Choisir « Moins en ce moment » fait apparaître JUSTE DESSOUS quatre durées, 45 · 60 · 75 · 90 min :
// sans durée, la réponse n'a pas de lecteur (`Moteur.reponseDeTemps` ne lit que `duree_seance_min`).
// UNE SEULE fonction compose ces puces (`Profil.pucesDeMoins`) pour l'écran 7 du questionnaire ET pour
// la feuille « Ton temps » du Profil ; l'écriture reste `Profil.preparerChamps` (`duree_seance_min`
// avec `temps_reponse`, la même que la ligne « Durée visée »), et rien n'est écrit sans puce.
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES (CADRAGE-V2 §2 quater) : la durée habituelle est 75 min dans tous les
// cas (sinon « sous la durée habituelle » ne se distingue pas de « sans habituelle ») ; la durée
// déclarée prend les valeurs 60 (sous, dans la liste), 75 (égale), 90 (au-dessus) et 50 (sous, hors liste).
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const Q = require('../../v2/js/questionnaire.js');
const R = () => window.THRendu;

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
};

const NB = ' ';
const sp = (t) => String(t).replace(/[  ]/g, ' ');
const cible = () => { const n = document.createElement('div'); document.body.appendChild(n); return n; };

// ── 1. LA FONCTION UNIQUE ────────────────────────────────────────────────────
describe('`Profil.pucesDeMoins` : quatre durées, une coche', () => {
  test('les quatre durées, en minutes, dans l’ordre — la clé du choix est `dureeMoins`', () => {
    const p = Profil.pucesDeMoins(null, 75, null);
    expect(p.cle).toBe('dureeMoins');
    expect(p.titre).toBe('Combien de temps par séance ?');
    expect(p.options).toEqual([
      { cle: 45, libelle: '45 min' }, { cle: 60, libelle: '60 min' },
      { cle: 75, libelle: '75 min' }, { cle: 90, libelle: '90 min' }]);
    expect(Profil.DUREES_DE_MOINS).toEqual([45, 60, 75, 90]);
  });

  test('⚠️ DISCRIMINANT — pré-cochée sur la durée visée SI elle est dans la liste ET sous l’habituelle (75)', () => {
    expect(Profil.pucesDeMoins(60, 75, null).valeur).toBe(60);
    expect(Profil.pucesDeMoins(45, 75, null).valeur).toBe(45);
    // égale à l'habituelle : ce n'est pas « moins » → aucune
    expect(Profil.pucesDeMoins(75, 75, null).valeur).toBeNull();
    // au-dessus de l'habituelle → aucune
    expect(Profil.pucesDeMoins(90, 75, null).valeur).toBeNull();
    // sous l'habituelle mais hors de la liste (50) → aucune puce à cocher
    expect(Profil.pucesDeMoins(50, 75, null).valeur).toBeNull();
  });

  test('sans durée déclarée, ou sans habituelle : aucune coche — jamais une durée devinée', () => {
    expect(Profil.pucesDeMoins(null, 75, null).valeur).toBeNull();
    expect(Profil.pucesDeMoins(undefined, 75, null).valeur).toBeNull();
    expect(Profil.pucesDeMoins('', 75, null).valeur).toBeNull();
    expect(Profil.pucesDeMoins(60, null, null).valeur).toBeNull();
    expect(Profil.pucesDeMoins(60, undefined, null).valeur).toBeNull();
    expect(Profil.pucesDeMoins(null, null, null).valeur).toBeNull();
  });

  test('la puce TOUCHÉE passe devant la durée visée ; une valeur hors liste n’est pas une puce', () => {
    expect(Profil.pucesDeMoins(60, 75, 45).valeur).toBe(45);
    expect(Profil.pucesDeMoins(null, null, 90).valeur).toBe(90);
    expect(Profil.pucesDeMoins(60, 75, 50).valeur).toBe(60);          // 50 n'est pas une puce : la coche retombe sur 60
    expect(Profil.pucesDeMoins(null, 75, 50).valeur).toBeNull();
  });

  test('une durée lue en texte (un cache) se lit comme un nombre', () => {
    expect(Profil.pucesDeMoins('60', 75, null).valeur).toBe(60);
    expect(Profil.pucesDeMoins(null, 75, '45').valeur).toBe(45);
  });
});

// ── 2. L'ÉCRAN 7 DU QUESTIONNAIRE ────────────────────────────────────────────
describe('l’écran 7 : les puces s’ouvrent juste sous « Moins en ce moment », et seulement alors', () => {
  const vue = (rep, faits) => Q.vueDe('temps', { rep: Object.assign(Q.reponsesInitiales({}, {}), rep || {}),
    aDesSeances: true, faits: faits === undefined ? { dureeMin: 75 } : faits });
  const options = (v) => v.blocs.filter((b) => b.type === 'options')[0].options;
  const lignes = (v) => v.blocs.filter((b) => b.type === 'ligne');
  const puces = (v) => v.blocs.filter((b) => b.type === 'puces').map((b) => b.cle);

  test('⚠️ DISCRIMINANT — « Moins » choisi : SA réponse porte les quatre puces (`apres`) ; aucune autre réponse n’en porte', () => {
    const o = options(vue({ temps: 'moins' }));
    expect(o.filter((x) => x.apres).map((x) => x.cle)).toEqual(['moins']);
    const moins = o.find((x) => x.cle === 'moins');
    expect(moins.apres.cle).toBe('dureeMoins');
    expect(moins.apres.options.map((x) => x.libelle)).toEqual(['45 min', '60 min', '75 min', '90 min']);
    // La sous-ligne de « Moins » reste celle de 60-2b (chaîne figée par un autre test).
    expect(moins.sous).toBe('Je te proposerai des séances plus courtes');
  });

  test('⚠️ DISCRIMINANT — rien choisi, ou une autre réponse : aucune puce, et la ligne « Durée visée » reste là', () => {
    ['max', 'marge', 'varie', null].forEach((t) => {
      const v = vue({ temps: t });
      expect([t, options(v).filter((x) => x.apres).length]).toEqual([t, 0]);
      expect([t, lignes(v).map((l) => l.libelle)]).toEqual([t, ['Durée visée']]);
    });
  });

  test('« Moins » choisi : la ligne « Durée visée » s’efface — les puces la remplacent', () => {
    expect(lignes(vue({ temps: 'moins' }))).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — pré-coche : la durée visée déclarée (60) est cochée parce qu’elle est sous l’habituelle (75)', () => {
    const coche = (rep, faits) => options(vue(Object.assign({ temps: 'moins' }, rep), faits)).find((x) => x.cle === 'moins').apres.valeur;
    expect(coche({ duree: 60 })).toBe(60);
    expect(coche({ duree: 75 })).toBeNull();
    expect(coche({ duree: 90 })).toBeNull();
    expect(coche({ duree: 50 })).toBeNull();
    expect(coche({ duree: null })).toBeNull();
    // Sans habituelle montrée (aucune séance avec heure de fin) : aucune.
    expect(coche({ duree: 60 }, { dureeMin: null })).toBeNull();
    // La puce touchée l'emporte.
    expect(coche({ duree: 60, dureeMoins: 45 })).toBe(45);
  });

  test('187 (A6) — le titre est la question, jamais la durée dite comme un fait : une puce touchée ne le change pas', () => {
    expect(sp(vue({ temps: 'moins', dureeMoins: 45 }).titre)).toBe('Combien de temps pour t’entraîner, en ce moment ?');
    // Sans historique, les puces de la durée viennent d'abord ; la matière (le matériel) se répond à « Où tu t’entraînes ? ».
    const sans = vue({ temps: 'moins', dureeMoins: 45 }, null);
    expect(sans.titre).toBe('Combien de temps pour t’entraîner, en ce moment ?');
    expect(puces(sans)).toEqual(['duree']);
  });

  test('« Continuer » reste actif avec ou sans puce (la réponse n’a simplement pas de durée)', () => {
    expect(vue({ temps: 'moins' }).bouton.actif).toBe(true);
    expect(vue({ temps: 'moins', dureeMoins: 60 }).bouton.actif).toBe(true);
  });

  test('le récapitulatif dit la puce (« 60 min · j’ai moins de temps… »), jamais l’habituelle quand rien ne l’écrit', () => {
    const recap = (rep) => sp(Q.vueDe('recap', { rep: Object.assign(Q.reponsesInitiales({}, {}), rep), aDesSeances: true,
      faits: { dureeMin: 75 } }).blocs[0].lignes.find((l) => l.libelle === 'Temps').valeur);
    expect(recap({ temps: 'moins', dureeMoins: 60 })).toBe('60 min · j’ai moins de temps en ce moment');
    expect(recap({ temps: 'moins', duree: 45 })).toBe('45 min · j’ai moins de temps en ce moment');
    expect(recap({ temps: 'moins', dureeMoins: 90, duree: 45 })).toBe('90 min · j’ai moins de temps en ce moment');
    // ⚠️ sans puce ni durée déclarée : pas de « 75 min » — c'est un fait, pas une réponse
    expect(recap({ temps: 'moins' })).toBe('j’ai moins de temps en ce moment');
    // les autres réponses gardent le repli sur l'habituelle
    expect(recap({ temps: 'marge' })).toBe('75 min · j’ai de la marge pour en faire plus');
  });
});

// ── 3. CE QUI S'ÉCRIT ────────────────────────────────────────────────────────
describe('l’écriture : une puce écrit `duree_seance_min` avec `temps_reponse` ; sans puce, rien pour la durée', () => {
  const MAINTENANT = new Date('2026-10-08T10:00:00.000Z');
  const ecrit = (rep, profil) => Q.champsDeLEcran('temps', rep, profil || {}, { pesees: [], jour: '2026-10-08', maintenant: MAINTENANT }).champs;

  test('⚠️ DISCRIMINANT — « Moins » + une puce : la réponse ET la durée, dans la même écriture', () => {
    expect(ecrit({ temps: 'moins', dureeMoins: 60, materiel: 'salle_complete' }))
      .toEqual({ temps_reponse: 'moins', duree_seance_min: 60 });          // 187 : le matériel s'écrit à l'écran « Où tu t’entraînes ? »
  });

  test('⚠️ DISCRIMINANT — « Moins » sans puce : la réponse seule, AUCUNE durée (même quand une habituelle de 75 est montrée)', () => {
    expect(ecrit({ temps: 'moins' })).toEqual({ temps_reponse: 'moins' });
    expect(ecrit({ temps: 'moins', duree: null })).toEqual({ temps_reponse: 'moins' });
  });

  test('la puce est la durée visée : la même colonne, la même règle que la ligne « Durée visée » (rien ne s’écrit sans changement)', () => {
    // Même durée que celle déjà en base : rien de plus que la réponse.
    expect(ecrit({ temps: 'moins', dureeMoins: 60 }, { duree_seance_min: 60 })).toEqual({ temps_reponse: 'moins' });
    // Une autre : elle s'écrit.
    expect(ecrit({ temps: 'moins', dureeMoins: 45 }, { duree_seance_min: 60 }))
      .toEqual({ temps_reponse: 'moins', duree_seance_min: 45 });
    // Sans puce, une durée déjà en base n'est pas touchée.
    expect(ecrit({ temps: 'moins', duree: 60 }, { duree_seance_min: 60 })).toEqual({ temps_reponse: 'moins' });
  });

  test('⚠️ DISCRIMINANT — la puce de « Moins » ne s’écrit pas quand la réponse a changé : « Ça varie » après « Moins » n’écrit pas 60', () => {
    expect(ecrit({ temps: 'varie', dureeMoins: 60 })).toEqual({ temps_reponse: 'varie' });
    expect(ecrit({ temps: 'marge', dureeMoins: 60, duree: 90 }, { duree_seance_min: 75 }))
      .toEqual({ temps_reponse: 'marge', duree_seance_min: 90 });          // la durée visée (ligne) reste celle de la ligne
  });

  test('le brouillon de la puce se range avec les autres réponses de l’écran (`appliquerChoix`)', () => {
    const rep = Q.appliquerChoix(Q.reponsesInitiales({}, {}), 'dureeMoins', 60);
    expect(rep.dureeMoins).toBe(60);
    // L'état de départ n'a pas de clé de plus (14 réponses, `programme` depuis 60-3, `menager` depuis 60-4).
    expect(Object.keys(Q.reponsesInitiales({}, {})).length).toBe(27);   // 195 : + 4 dep ; 194-1 : + raides ; + dep_tractions, dep_pompes, dep_dips, dep_pistol ; 187 : + depuis, notees, halteresMax, halteresPas ; 190 : + plusPetitDisque, barreTraction
    expect('dureeMoins' in Q.reponsesInitiales({}, {})).toBe(false);
  });
});

// ── 3 bis. CE QUI A ÉTÉ ÉCRIT EST LA DURÉE VISÉE (relecture adverse de 60-2c) ──
describe('la puce écrite devient la durée visée du brouillon : « Retour » puis une autre réponse ne la contredit pas', () => {
  const MAINTENANT = new Date('2026-10-08T10:00:00.000Z');
  const vueTemps = (rep, faits) => Q.vueDe('temps', { rep: Object.assign(Q.reponsesInitiales({}, {}), rep), aDesSeances: true, faits });
  const ecrit = (rep, profil) => Q.champsDeLEcran('temps', rep, profil || {}, { pesees: [], jour: '2026-10-08', maintenant: MAINTENANT }).champs;

  test('`apresEcriture` : la durée écrite rejoint `duree` ; sans durée écrite, rien ne bouge ; le brouillon d’origine est intact', () => {
    const rep = { temps: 'moins', dureeMoins: 45, duree: null };
    const apres = Q.apresEcriture(rep, { temps_reponse: 'moins', duree_seance_min: 45 });
    expect(apres.duree).toBe(45);
    expect(rep.duree).toBeNull();                                  // une COPIE
    expect(Q.apresEcriture(rep, { temps_reponse: 'moins' }).duree).toBeNull();
    expect(Q.apresEcriture(rep, {}).duree).toBeNull();
    expect(Q.apresEcriture(rep, null).duree).toBeNull();
    expect(Q.apresEcriture(rep, { duree_seance_min: null }).duree).toBeNull();
    expect(Q.apresEcriture({ duree: 60 }, { materiel: 'salle_complete' }).duree).toBe(60);
  });

  test('⚠️ DISCRIMINANT — Moins + 45 écrit, puis « Retour » et « Ça varie » : la ligne « Durée visée » dit 45 (pas l’habituelle 75), et « Continuer » n’écrit pas autre chose', () => {
    // Profil vierge côté durée, habituelle 75.
    let rep = Object.assign(Q.reponsesInitiales({}, {}), { temps: 'moins', dureeMoins: 45 });
    const champs = ecrit(rep);
    expect(champs).toEqual({ temps_reponse: 'moins', duree_seance_min: 45 });
    rep = Q.apresEcriture(rep, champs);
    // « Retour », puis une autre réponse : le même écran, relu.
    rep = Q.appliquerChoix(rep, 'temps', 'varie');
    const ligne = vueTemps(rep, { dureeMin: 75 }).blocs.filter((b) => b.type === 'ligne')[0];
    expect(sp(ligne.valeur)).toBe('45 min');
    // Le profil porte maintenant 45 : « Continuer » n'écrit que la réponse, la durée ne bouge pas.
    expect(ecrit(rep, { duree_seance_min: 45 })).toEqual({ temps_reponse: 'varie' });
    // Et le récapitulatif dit ce que la base porte.
    const recap = Q.vueDe('recap', { rep, aDesSeances: true, faits: { dureeMin: 75 } }).blocs[0].lignes.find((l) => l.libelle === 'Temps').valeur;
    expect(sp(recap)).toBe('45 min · ça varie beaucoup');
  });

  test('⚠️ DISCRIMINANT — une durée DÉJÀ déclarée (60) : Moins + 45 écrit 45, et revenir à « C’est mon maximum » ne REMET PAS 60', () => {
    let rep = Object.assign(Q.reponsesInitiales({ duree_seance_min: 60 }, {}), { temps: 'moins', dureeMoins: 45 });
    expect(rep.duree).toBe(60);
    const champs = ecrit(rep, { duree_seance_min: 60 });
    expect(champs).toEqual({ temps_reponse: 'moins', duree_seance_min: 45 });
    rep = Q.apresEcriture(rep, champs);
    rep = Q.appliquerChoix(rep, 'temps', 'max');
    // Sans le rapatriement, `rep.duree` valait encore 60 et « Continuer » réécrivait 60 sur le 45 choisi.
    expect(ecrit(rep, { duree_seance_min: 45 })).toEqual({ temps_reponse: 'max' });
  });
});

// ── 4. LE RENDU : JUSTE DESSOUS ──────────────────────────────────────────────
describe('le rendu : les puces s’ouvrent juste sous la réponse, dans la même colonne', () => {
  test('questionnaire : la colonne est « Max · Marge · Moins · [question + puces] · Varie »', () => {
    const c = cible();
    const surChoix = [];
    const v = Q.vueDe('temps', { rep: Object.assign(Q.reponsesInitiales({}, {}), { temps: 'moins', duree: 60 }),
      aDesSeances: true, faits: { dureeMin: 75 } });
    R().rendreQuestionnaire(c, v, { surChoix: (cle, val) => surChoix.push([cle, val]), surContinuer: () => {}, surRetour: () => {},
      surPlusTard: () => {}, surLigne: () => {}, surChanger: () => {} });
    const col = c.querySelector('.q-options');
    const enfants = Array.from(col.children).map((n) => n.className.split(' ')[0] + (n.dataset.cle ? ':' + n.dataset.cle : ''));
    expect(enfants).toEqual(['q-opt:max', 'q-opt:marge', 'q-opt:moins', 'q-sous-titre', 'q-puces', 'q-opt:varie']);
    expect(col.querySelector('.q-sous-titre').textContent).toBe('Combien de temps par séance ?');
    const pu = Array.from(col.querySelectorAll('.q-puces .q-puce'));
    expect(pu.map((n) => n.textContent)).toEqual(['45 min', '60 min', '75 min', '90 min']);
    expect(pu.filter((n) => n.classList.contains('on')).map((n) => n.dataset.cle)).toEqual(['60']);
    pu[0].click();
    expect(surChoix).toEqual([['dureeMoins', 45]]);
  });

  test('questionnaire : sans « Moins », la colonne est celle d’avant (quatre réponses, aucune puce dedans)', () => {
    const c = cible();
    const v = Q.vueDe('temps', { rep: Object.assign(Q.reponsesInitiales({}, {}), { temps: 'marge' }), aDesSeances: true, faits: { dureeMin: 75 } });
    R().rendreQuestionnaire(c, v, { surChoix: () => {}, surContinuer: () => {}, surRetour: () => {}, surPlusTard: () => {}, surLigne: () => {}, surChanger: () => {} });
    expect(c.querySelector('.q-options').querySelectorAll('.q-puces').length).toBe(0);
    expect(c.querySelector('.q-options').children.length).toBe(4);
  });

  test('feuille : les puces sont HORS du `.feuille-menu`, avec « Annuler » et « Valider » — et le toucher d’une puce n’écrit rien', () => {
    const c = cible();
    const touches = [];
    R().rendreFeuilleChoix(c, {
      titre: 'Ton temps', valeur: 'moins',
      options: [{ cle: 'max', libelle: 'C’est mon maximum' }, { cle: 'moins', libelle: 'J’ai moins de temps',
        apres: Profil.pucesDeMoins(60, 75, null) }, { cle: 'varie', libelle: 'Ça varie' }],
      surChoix: () => touches.push('choix'), surPuce: (n) => touches.push(['puce', n]),
      surValider: () => touches.push('valider'), surAnnuler: () => touches.push('annuler') });
    expect(Array.from(c.children).map((n) => n.className.split(' ')[0])).toEqual(
      ['feuille-t', 'feuille-menu', 'choix-puces', 'feuille-menu', 'feuille-pied']);
    // Les puces ne sont dans aucun menu : le sélecteur des lignes (`.feuille-menu button[data-cle]`) ne les voit pas.
    expect(Array.from(c.querySelectorAll('.feuille-menu button[data-cle]')).map((b) => b.dataset.cle)).toEqual(['max', 'moins', 'varie']);
    const pu = Array.from(c.querySelectorAll('.choix-puces .q-puce'));
    expect(pu.map((b) => b.textContent)).toEqual(['45 min', '60 min', '75 min', '90 min']);
    expect(pu.filter((b) => b.classList.contains('on')).map((b) => b.dataset.cle)).toEqual(['60']);
    pu[0].click();
    expect(touches).toEqual([['puce', 45]]);
    expect(Array.from(c.querySelectorAll('.feuille-pied button')).map((b) => b.textContent)).toEqual(['Annuler', 'Valider']);
    c.querySelector('.feuille-pied .pri').click();
    expect(touches[1]).toBe('valider');
  });

  test('feuille sans puces : exactement comme avant (un seul menu, « Annuler » seul)', () => {
    const c = cible();
    R().rendreFeuilleChoix(c, { titre: 'Objectif', valeur: 'force', options: Profil.OBJECTIFS,
      surChoix: () => {}, surEffacer: null, surAnnuler: () => {} });
    expect(Array.from(c.children).map((n) => n.className.split(' ')[0])).toEqual(['feuille-t', 'feuille-menu', 'feuille-pied']);
    expect(Array.from(c.querySelectorAll('.feuille-pied button')).map((b) => b.textContent)).toEqual(['Annuler']);
  });
});

// ── 5. LA FEUILLE « TON TEMPS » DU PROFIL (app.js, rejoué) ───────────────────
describe('la feuille « Ton temps » du Profil : « Moins » ne ferme pas, demande combien, et n’écrit qu’à « Valider »', () => {
  function bac(profil, habituelle) {
    const ecrits = [];
    const vues = [];
    const ctx = {
      Profil, Date, Object, Array,
      profil,
      feuilleProfil: null,
      $: () => ({}),
      valeurProfil: (cle) => (ctx.profil ? ctx.profil[cle] : null),
      defObjet: (cle, v) => { const o = {}; o[cle] = v; return o; },
      ecrireProfil: (champs) => { ecrits.push(champs); },
      fermerVoile: () => { ctx.ferme = (ctx.ferme || 0) + 1; },
      ouvrirFeuilleProfil: () => { ctx.feuilleProfil({}); },
      dureeHabituelleDesSeances: () => (habituelle === undefined ? 75 : habituelle),
      Rendu: { rendreFeuilleChoix: (c, v) => { vues.push(v); }, rendreFeuilleChoixMultiple: () => {} }
    };
    vm.createContext(ctx);
    ['ecrireReponse', 'ouvrirReponseProfil', 'ouvrirPrioritesProfil'].forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, ecrits, vues, derniere: () => vues[vues.length - 1],
             ouvrir: (cle) => vm.runInContext('ouvrirReponseProfil(' + JSON.stringify(cle) + ')', ctx) };
  }
  const moinsDe = (v) => v.options.find((o) => o.cle === 'moins');

  test('⚠️ DISCRIMINANT — toucher « Moins » : la feuille RESTE ouverte, rien ne s’écrit, les quatre puces apparaissent sous « Moins »', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge', duree_seance_min: 60 });
    b.ouvrir('temps_reponse');
    expect(b.derniere().options.some((o) => o.apres)).toBe(false);       // à l'ouverture : la feuille d'avant
    expect(b.derniere().surValider).toBe(null);
    b.derniere().surChoix('moins');
    expect(b.ctx.ferme || 0).toBe(0);
    expect(b.ecrits).toEqual([]);
    const v = b.derniere();
    expect(v.valeur).toBe('moins');
    expect(moinsDe(v).apres.options.map((o) => o.cle)).toEqual([45, 60, 75, 90]);
    expect(moinsDe(v).apres.valeur).toBe(60);                              // pré-cochée : 60 déclarée, sous l'habituelle (75)
    expect(typeof v.surValider).toBe('function');
    expect(v.options.filter((o) => o.apres).length).toBe(1);
  });

  test('⚠️ DISCRIMINANT — une puce, puis « Valider » : la réponse ET la durée, en UNE écriture', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge', duree_seance_min: 90 });
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    expect(moinsDe(b.derniere()).apres.valeur).toBeNull();                 // 90 > 75 : rien de coché
    b.derniere().surPuce(45);
    expect(moinsDe(b.derniere()).apres.valeur).toBe(45);                   // la coche suit le doigt
    expect(b.ecrits).toEqual([]);                                          // toucher une puce n'écrit rien
    b.derniere().surValider();
    expect(b.ecrits).toEqual([{ temps_reponse: 'moins', duree_seance_min: 45 }]);
    expect(b.ctx.ferme).toBe(1);
  });

  test('« Valider » sans puce : la réponse seule, aucune durée', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge', duree_seance_min: 90 });
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    b.derniere().surValider();
    expect(b.ecrits).toEqual([{ temps_reponse: 'moins' }]);
  });

  test('« Valider » avec la durée déjà en base et pré-cochée : rien de plus que la réponse', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge', duree_seance_min: 60 });
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    b.derniere().surValider();
    expect(b.ecrits).toEqual([{ temps_reponse: 'moins' }]);
  });

  test('« Annuler » après « Moins » et une puce n’écrit rien', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge' });
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    b.derniere().surPuce(60);
    b.derniere().surAnnuler();
    expect(b.ecrits).toEqual([]);
    expect(b.ctx.ferme).toBe(1);
  });

  test('les autres réponses font ce qu’elles ont toujours fait : elles ferment et écrivent seules', () => {
    ['max', 'marge', 'varie'].forEach((t) => {
      const b = bac({ id: 'u1', temps_reponse: 'moins' });
      b.ouvrir('temps_reponse');
      b.derniere().surChoix(t);
      expect([t, b.ecrits, b.ctx.ferme]).toEqual([t, [{ temps_reponse: t }], 1]);
    });
  });

  test('après « Moins » puis une autre réponse : elle ferme et écrit SEULE, la puce touchée n’est pas écrite', () => {
    const b = bac({ id: 'u1', temps_reponse: 'max' });
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    b.derniere().surPuce(60);
    b.derniere().surChoix('varie');
    expect(b.ecrits).toEqual([{ temps_reponse: 'varie' }]);
  });

  test('sans habituelle (aucune séance avec heure de fin) : aucune puce pré-cochée', () => {
    const b = bac({ id: 'u1', temps_reponse: 'marge', duree_seance_min: 60 }, null);
    b.ouvrir('temps_reponse');
    b.derniere().surChoix('moins');
    expect(moinsDe(b.derniere()).apres.valeur).toBeNull();
  });

  test('l’objectif n’a pas de puces : son toucher ferme et écrit comme avant', () => {
    const b = bac({ id: 'u1', objectif: null });
    b.ouvrir('objectif');
    expect(b.derniere().options.some((o) => o.apres)).toBe(false);
    expect(b.derniere().surValider).toBe(null);
    b.derniere().surChoix('muscle');
    expect(b.ecrits).toHaveLength(1);
    expect(b.ecrits[0].objectif).toBe('muscle');
  });
});

// ── 6. GARDES DE STRUCTURE ───────────────────────────────────────────────────
describe('GARDES — une seule fonction, deux écrans', () => {
  test('le questionnaire ET la feuille du Profil composent leurs puces par `pucesDeMoins`, aucun ne recopie la liste', () => {
    const questionnaire = fs.readFileSync(path.join(__dirname, '../../v2/js/questionnaire.js'), 'utf8');
    expect(questionnaire).toMatch(/Profil\(\)\.pucesDeMoins\(/);
    expect(extraire('ouvrirReponseProfil')).toMatch(/Profil\.pucesDeMoins\(/);
    expect(questionnaire).not.toMatch(/\[45,\s*60,\s*75,\s*90\]\s*\.map/);
    expect(extraire('ouvrirReponseProfil')).not.toMatch(/\b45\b/);
  });

  test('l’habituelle de la feuille vient du fait des séances (`ceQueJeSais`), lue quand elle sert — pas au rendu', () => {
    expect(extraire('dureeHabituelleDesSeances')).toMatch(/\.ceQueJeSais\(/);
    const f = extraire('ouvrirReponseProfil');
    // Appelée dans le toucher de « Moins », pas à l'ouverture de la feuille.
    expect(f.indexOf('dureeHabituelleDesSeances()')).toBeGreaterThan(f.indexOf('surChoix'));
  });

  test('typographie : les puces disent « 45 min » avec une espace simple, comme `PUCES_DUREES`', () => {
    Profil.pucesDeMoins(null, null, null).options.forEach((o) => expect(o.libelle).toMatch(/^\d+ min$/));
    expect(NB).toBe(' ');
  });
});

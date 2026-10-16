//
// 60-4 (6/7) — LE PROGRAMME CONSTRUIT, AU PROFIL (ECRAN-PROFIL §4 bis, G10).
//
//   · trois lignes dans la section du matériel : « Zone à ménager » (une feuille à puces), « Exercices écartés »
//     (la liste, « Reprendre » sur chacun ; vide : la ligne ne s'affiche pas), « Refaire mon programme » ;
//     leurs phrases, au mot près ;
//   · « Refaire mon programme » : les DEUX questions de l'écran 8b seules (pas de barre, pas de « Plus tard », un
//     retour qui ramène au Profil, « Voir mon programme »), les mêmes écritures, puis l'aperçu ; rien n'est écrit
//     avant le bouton, et un retour n'écrit rien.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const Generateur = require('../../v2/js/generateur.js');
const Questionnaire = require('../../v2/js/questionnaire.js');
require('../../v2/js/rendu.js');
const { profilEcran } = require('./aide-profil-ecran.js');
const Rendu = () => window.THRendu;

const texte = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const clone = (o) => JSON.parse(JSON.stringify(o));

// ═══ LES LIGNES (`profil.js`) ═══════════════════════════════════════════════
describe('Profil.lignesProgramme — trois lignes, leurs phrases au mot près', () => {
  const ouvertes = [];
  const lignes = (p) => Profil.lignesProgramme(p, (quoi) => ouvertes.push(quoi));

  test('« Zone à ménager », « Exercices écartés » (si non vide), « Refaire mon programme », dans cet ordre', () => {
    expect(lignes({ exercices_ecartes: ['squat_barre'] }).map((l) => l.libelle))
      .toEqual(['Zone à ménager', 'Exercices écartés', 'Refaire mon programme']);
  });

  test('⚠️ DISCRIMINANT — la liste vide : la ligne « Exercices écartés » ne s’affiche pas (null, [] ou absente)', () => {
    [{}, { exercices_ecartes: null }, { exercices_ecartes: [] }, { exercices_ecartes: 'x' }].forEach((p) => {
      expect(lignes(p).map((l) => l.libelle)).toEqual(['Zone à ménager', 'Refaire mon programme']);
    });
  });

  test('les phrases d’aide, telles que la spec les écrit (G10)', () => {
    const l = lignes({ exercices_ecartes: ['a'] });
    expect(l[0].sous).toBe('Ton programme construit la garde sans série lourde. Rien ne change en séance.');
    expect(l[1].sous).toBe('Un exercice écarté n’est plus proposé dans tes programmes. Il reste au catalogue, en fin de liste.');
    expect(l[2].sous).toBe('Je te pose deux questions et je te construis un nouveau dossier. Le tien reste tel quel.');
  });

  test('les valeurs : les zones en clair (« Aucune » par défaut), le nombre d’écartés, rien pour « Refaire »', () => {
    expect(lignes({})[0].valeur).toBe('Aucune');
    expect(lignes({ zones_a_menager: [] })[0].valeur).toBe('Aucune');
    expect(lignes({ zones_a_menager: ['genou'] })[0].valeur).toBe('Genou');
    expect(lignes({ zones_a_menager: ['hanche', 'dos', 'genou'] })[0].valeur).toBe('Dos, Genou, Hanche');   // l'ordre de la liste, pas celui du clic
    expect(lignes({ zones_a_menager: ['bras'] })[0].valeur).toBe('Aucune');                                   // une valeur inconnue n'est pas une zone
    expect(lignes({ exercices_ecartes: ['a', 'b', 'c'] })[1].valeur).toBe('3');
    expect(lignes({})[1].sansValeur).toBe(true);
  });

  test('chaque ligne ouvre SA feuille : zones, ecartes, refaire', () => {
    ouvertes.length = 0;
    lignes({ exercices_ecartes: ['a'] }).forEach((l) => l.surChoix());
    expect(ouvertes).toEqual(['zones', 'ecartes', 'refaire']);
  });
});

// ═══ L'ÉCRAN PROFIL ═════════════════════════════════════════════════════════
describe('l’écran Profil : la section du matériel porte le programme construit', () => {
  test('« CE QUE JE FAIS » : Matériel, Ma salle (108), puis les trois lignes ; chaque ligne ouvre sa feuille par `ouvrirProgrammeProfil`', () => {
    const e = profilEcran({ id: 'u1', exercices_ecartes: ['squat_barre'] });
    const s = e.section('CE QUE JE FAIS');
    expect(s.lignes.map((l) => l.libelle)).toEqual(['Matériel', 'Ma salle', 'Zone à ménager', 'Exercices écartés', 'Refaire mon programme']);
    s.lignes.slice(2).forEach((l) => l.surChoix());
    expect(e.programmesOuverts).toEqual(['zones', 'ecartes', 'refaire']);
    s.lignes[1].surChoix();
    expect(e.sallesOuvertes).toEqual([true]);
  });

  test('sans écarté : trois lignes seulement (et Ma salle)', () => {
    const e = profilEcran({ id: 'u1' });
    expect(e.section('CE QUE JE FAIS').lignes.map((l) => l.libelle)).toEqual(['Matériel', 'Ma salle', 'Zone à ménager', 'Refaire mon programme']);
  });

  test('le rendu réel : la phrase d’aide sous chaque libellé, « à renseigner » jamais pour « Refaire »', () => {
    const cible = document.createElement('div');
    Rendu().rendreProfil(cible, { kpis: [], sections: [{ titre: 'CE QUE JE FAIS',
      lignes: Profil.lignesProgramme({ zones_a_menager: ['dos'], exercices_ecartes: ['a', 'b'] }, () => {}) }] });
    const l = Array.from(cible.querySelectorAll('.p-ligne'));
    expect(l.map((n) => [n.querySelector('.p-lib').firstChild.textContent, texte(n.querySelector('.p-lib small'))])).toEqual([
      ['Zone à ménager', 'Ton programme construit la garde sans série lourde. Rien ne change en séance.'],
      ['Exercices écartés', 'Un exercice écarté n’est plus proposé dans tes programmes. Il reste au catalogue, en fin de liste.'],
      ['Refaire mon programme', 'Je te pose deux questions et je te construis un nouveau dossier. Le tien reste tel quel.']]);
    expect(texte(l[0].querySelector('.p-val'))).toBe('Dos');
    expect(texte(l[1].querySelector('.p-val'))).toBe('2');
    expect(l[2].querySelector('.p-val')).toBeNull();
  });
});

// ═══ LE RENDU ═══════════════════════════════════════════════════════════════
describe('le rendu : la feuille des écartés, et le questionnaire sans barre', () => {
  test('« Exercices écartés » : une ligne par exercice avec « Reprendre », puis « Fermer »', () => {
    const cible = document.createElement('div');
    const repris = []; let ferme = 0;
    Rendu().rendreFeuilleEcartes(cible, { titre: 'Exercices écartés', aide: Profil.PHRASE_ECARTES,
      exercices: [{ nom: 'Squat', surReprendre: () => repris.push('squat') }, { nom: 'Tractions', surReprendre: () => repris.push('tractions') }],
      surFermer: () => { ferme++; } });
    expect(texte(cible.querySelector('.feuille-t'))).toBe('Exercices écartés');
    expect(texte(cible.querySelector('.feuille-aide'))).toBe(Profil.PHRASE_ECARTES);
    expect(Array.from(cible.querySelectorAll('.ecarte-ligne .ecarte-nom')).map(texte)).toEqual(['Squat', 'Tractions']);
    const boutons = Array.from(cible.querySelectorAll('.ecarte-reprendre'));
    expect(boutons.map(texte)).toEqual(['Reprendre', 'Reprendre']);
    boutons[1].click();
    expect(repris).toEqual(['tractions']);
    cible.querySelector('.feuille-pied button').click();
    expect(ferme).toBe(1);
  });

  const vueQ = (extra) => Object.assign({ id: 'construit', etape: 'Ton programme', titre: 'Combien de jours par semaine, réalistement ?',
    voix: null, blocs: [], progression: { total: 11, rang: 9, pourcent: 90 }, retour: true, bouton: { libelle: 'Continuer', actif: true } }, extra);

  test('le questionnaire sans progression : pas de barre, pas de « Plus tard », le retour reste', () => {
    const cible = document.createElement('div');
    Rendu().rendreQuestionnaire(cible, vueQ({ progression: null, sansPlusTard: true }), {});
    expect(cible.querySelector('[role="progressbar"]')).toBeNull();
    expect(cible.querySelector('.q-plus-tard')).toBeNull();
    expect(texte(cible.querySelector('.q-retour'))).toBe('‹ Retour');
    expect(cible.querySelector('.q-prog.vide')).not.toBeNull();                 // la tête garde sa place
  });

  test('non-régression : le questionnaire du parcours garde sa barre et son « Plus tard »', () => {
    const cible = document.createElement('div');
    Rendu().rendreQuestionnaire(cible, vueQ(), {});
    expect(cible.querySelector('[role="progressbar"]').getAttribute('aria-valuemax')).toBe('11');
    expect(texte(cible.querySelector('.q-plus-tard'))).toBe('Plus tard');
  });
});

describe('l’écran 8b rejoué seul (`vueDe` avec `refaire`)', () => {
  const etat = (extra) => Object.assign({ rep: { seances: 4, menager: [] }, faits: null, aDesSeances: true,
    textes: {}, erreurs: {}, visibles: [Questionnaire.CONSTRUIT] }, extra);

  test('⚠️ DISCRIMINANT — refaire : pas de progression, pas de « Plus tard », un retour, « Voir mon programme »', () => {
    const v = Questionnaire.vueDe(Questionnaire.CONSTRUIT, etat({ refaire: true }));
    expect(v.progression).toBeNull();
    expect(v.sansPlusTard).toBe(true);
    expect(v.retour).toBe(true);
    expect(v.bouton).toEqual({ libelle: 'Voir mon programme', actif: true });
    expect(v.titre).toBe('Combien de jours par semaine, réalistement ?');
  });

  test('sans jours valides : « Voir mon programme » attend', () => {
    expect(Questionnaire.vueDe(Questionnaire.CONSTRUIT, etat({ refaire: true, rep: { seances: null, menager: [] } })).bouton.actif).toBe(false);
  });

  test('non-régression : sans `refaire`, l’écran 8b du parcours est celui d’avant', () => {
    const v = Questionnaire.vueDe(Questionnaire.CONSTRUIT, etat({ visibles: [Questionnaire.PROGRAMME, Questionnaire.CONSTRUIT, Questionnaire.COACH] }));
    expect(v.progression).not.toBeNull();
    expect(v.sansPlusTard).toBeUndefined();
    expect(v.bouton.libelle).toBe('Continuer');
  });
});

// ═══ LES GESTES (`app.js`) ══════════════════════════════════════════════════
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
}
const FONCTIONS = ['ouvrirProgrammeProfil', 'ouvrirZonesProfil', 'ouvrirEcartesProfil', 'reprendreEcarte', 'ecrireReponse',
  'ouvrirFeuilleProfil', 'refaireMonProgramme', 'validerRefaire', 'ouvrirQuestionnaire', 'fermerQuestionnaire',
  'continuerQuestionnaire', 'reculerQuestionnaire', 'rendreQuestionnaire', 'ecransDuQuestionnaire', 'actualiserFaitsDuQuestionnaire'];

const CATALOGUE = [
  { slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps' },
  { slug: 'tractions', nom: 'Tractions', mesure: 'reps' },
  { slug: 'developpe_couche_barre', nom: 'Développé couché (Barre)', mesure: 'charge_reps' }
];

function bac(options) {
  const o = options || {};
  const journal = { ecrits: [], poses: [], voile: 0, ferme: 0, feuilles: [], vuesQ: [], apercus: 0, saisie: 0, profilRendu: 0,
                    ordre: [], gardes: 0, vus: 0 };
  const ctx = {
    Profil, Modele, Questionnaire,
    profil: Object.assign({ id: 'u1', seances_par_semaine: null, zones_a_menager: null, exercices_ecartes: null }, o.profil || {}),
    local: { exercices: CATALOGUE, pesees: [], seances: o.seances || [{ id: 's1' }] },
    Poids: { resume: () => null },
    faits: { ceQueJeSais: () => (o.faits || { seances: 12, depuis: new Date(2026, 4, 1), rythme: 3.4, dureeMin: null, maximums: [], autres: [] }) },
    corpus: () => ({}),
    jourDuJour: () => '2026-10-08',
    questionnaire: null,
    gardeQuestionnaire: null,
    feuilleProfil: null,
    seance: null,
    voileOuvert: null,
    vues: { saisie: { hidden: false } },
    etatRoutines: { code: 'ok' },
    chargerRoutines: () => Promise.resolve(),
    marquerQuestionnaireVuIci: () => { journal.vus++; },
    ajouterGarde: () => { journal.gardes++; },
    retirerGarde: () => {},
    montrer: (nom) => { journal.ordre.push('montrer:' + nom); },
    $: (id) => ({ id }),
    Rendu: {
      rendreFeuilleChoixMultiple: (c, v) => { ctx.__multi = v; journal.feuilles.push('multi'); },
      rendreFeuilleEcartes: (c, v) => { ctx.__ecartes = v; journal.feuilles.push('ecartes'); },
      rendreQuestionnaire: (c, vue, actions) => { ctx.__q = vue; ctx.__actions = actions; journal.vuesQ.push(vue); }
    },
    ouvrirVoile: (noeud, apres) => { journal.voile++; ctx.voileOuvert = noeud; ctx.__apres = apres; },
    fermerVoile: () => { journal.ferme++; ctx.voileOuvert = null; const a = ctx.__apres; ctx.__apres = null; if (a) a(); },
    poserProfil: (champs) => { journal.poses.push(clone(champs)); Object.assign(ctx.profil, champs); return Promise.resolve(); },
    ecrireProfil: (champs) => { journal.ecrits.push(clone(champs)); Object.assign(ctx.profil, champs); journal.profilRendu++; return Promise.resolve(); },
    rendreProfilEcran: () => { journal.profilRendu++; journal.ordre.push('profil'); },
    afficherSaisie: () => { journal.saisie++; journal.ordre.push('saisie'); return Promise.resolve(); },
    ouvrirApercuProgramme: () => { journal.apercus++; journal.ordre.push('apercu'); return Promise.resolve(); },
    plusTardQuestionnaire: () => {}, choisirDansQuestionnaire: () => {}, saisirDansQuestionnaire: () => {},
    ouvrirDureeDuQuestionnaire: () => {}, changerDepuisLeRecap: () => {}, terminerQuestionnaire: () => {},
    Date, Object, Array, Promise
  };
  vm.createContext(ctx);
  FONCTIONS.forEach((f) => vm.runInContext(extraire(f), ctx));
  return { ctx, journal, appel: (code) => vm.runInContext(code, ctx) };
}

describe('les gestes : « Zone à ménager »', () => {
  test('la feuille à puces : les cinq zones et « Aucune » ; on bascule, « Valider » écrit par le chemin des réponses', () => {
    const b = bac({ profil: { zones_a_menager: ['genou'] } });
    b.appel('ouvrirProgrammeProfil("zones")');
    const f = b.ctx.__multi;
    expect(f.titre).toBe('Zone à ménager');
    expect(f.aide).toBe(Profil.PHRASE_ZONES);
    expect(f.groupes[0].options.map((o) => o.cle)).toEqual(['epaule', 'dos', 'genou', 'coude', 'hanche']);
    expect(f.valeurs).toEqual(['genou']);
    expect(f.aucune).toEqual({ libelle: 'Aucune', actif: false });
    f.surBasculer('dos');
    expect(b.ctx.__multi.valeurs).toEqual(['dos', 'genou']);              // l'ordre de la liste
    expect(b.journal.ecrits).toEqual([]);                                  // rien n'est écrit avant « Valider »
    b.ctx.__multi.surValider();
    expect(b.journal.ecrits).toEqual([{ zones_a_menager: ['dos', 'genou'] }]);
    expect(b.journal.ferme).toBe(1);
  });

  test('« Aucune » retire les autres et écrit le vide (`null`) ; inchangé, rien ne s’écrit', () => {
    const b = bac({ profil: { zones_a_menager: ['genou', 'dos'] } });
    b.appel('ouvrirProgrammeProfil("zones")');
    b.ctx.__multi.surAucune();
    expect(b.ctx.__multi.aucune.actif).toBe(true);
    b.ctx.__multi.surValider();
    expect(b.journal.ecrits).toEqual([{ zones_a_menager: null }]);
    const c = bac({ profil: { zones_a_menager: ['genou'] } });
    c.appel('ouvrirProgrammeProfil("zones")');
    c.ctx.__multi.surValider();
    expect(c.journal.ecrits).toEqual([]);                                  // la même sélection : rien à écrire
  });

  test('« Annuler » ne touche à rien', () => {
    const b = bac();
    b.appel('ouvrirProgrammeProfil("zones")');
    b.ctx.__multi.surBasculer('coude');
    b.ctx.__multi.surAnnuler();
    expect(b.journal.ecrits).toEqual([]);
    expect(b.journal.ferme).toBe(1);
  });
});

describe('les gestes : « Exercices écartés »', () => {
  test('la liste, dans l’ordre où on les a écartés, avec leur nom ; « Reprendre » en retire UN, la feuille reste ouverte', () => {
    const b = bac({ profil: { exercices_ecartes: ['squat_barre', 'tractions'] } });
    b.appel('ouvrirProgrammeProfil("ecartes")');
    expect(b.ctx.__ecartes.titre).toBe('Exercices écartés');
    expect(b.ctx.__ecartes.exercices.map((x) => x.nom)).toEqual(['Squat (Barre)', 'Tractions']);
    b.ctx.__ecartes.exercices[0].surReprendre();
    expect(b.journal.ecrits).toEqual([{ exercices_ecartes: ['tractions'] }]);
    expect(b.journal.ferme).toBe(0);
    expect(b.ctx.__ecartes.exercices.map((x) => x.nom)).toEqual(['Tractions']);      // la feuille est redessinée
  });

  test('⚠️ DISCRIMINANT — le dernier repris écrit le VIDE (`null`) et ferme la feuille (la ligne du Profil s’efface)', () => {
    const b = bac({ profil: { exercices_ecartes: ['tractions'] } });
    b.appel('ouvrirProgrammeProfil("ecartes")');
    b.ctx.__ecartes.exercices[0].surReprendre();
    expect(b.journal.ecrits).toEqual([{ exercices_ecartes: null }]);
    expect(b.journal.ferme).toBe(1);
    expect(Profil.lignesProgramme(b.ctx.profil, () => {}).map((l) => l.libelle)).toEqual(['Zone à ménager', 'Refaire mon programme']);
  });

  test('un slug qui n’est plus au catalogue se lit quand même (son nom de repli)', () => {
    const b = bac({ profil: { exercices_ecartes: ['exercice_retire'] } });
    b.appel('ouvrirProgrammeProfil("ecartes")');
    expect(b.ctx.__ecartes.exercices.length).toBe(1);
    expect(typeof b.ctx.__ecartes.exercices[0].nom).toBe('string');
    expect(b.ctx.__ecartes.exercices[0].nom.length).toBeGreaterThan(0);
  });
});

describe('les gestes : « Refaire mon programme »', () => {
  test('ouvre l’écran 8b SEUL : les jours déjà dits, la zone du profil, rien d’écrit, le questionnaire n’est pas « vu ici »', () => {
    const b = bac({ profil: { seances_par_semaine: 5, zones_a_menager: ['genou'] } });
    b.appel('ouvrirProgrammeProfil("refaire")');
    const q = b.ctx.questionnaire;
    expect(q.refaire).toBe(true);
    expect(q.ecran).toBe('construit');
    expect(q.rep.seances).toBe(5);
    expect(q.rep.menager).toEqual(['genou']);
    expect(b.journal.vus).toBe(0);
    expect(b.journal.poses).toEqual([]);
    const v = b.ctx.__q;
    expect(v.progression).toBeNull();
    expect(v.sansPlusTard).toBe(true);
    expect(v.bouton).toEqual({ libelle: 'Voir mon programme', actif: true });
    expect(b.journal.gardes).toBe(1);                                      // le retour d'Android recule
  });

  test('les jours sans réponse : pré-cochés par le rythme des séances (arrondi, borné)', () => {
    const b = bac({ profil: { seances_par_semaine: null } });
    b.appel('refaireMonProgramme()');
    expect(b.ctx.questionnaire.rep.seances).toBe(3);                       // 3,4 → 3
  });

  test('« Voir mon programme » : écrit les jours et la zone (chemin du profil), ferme, Saisie, puis l’aperçu — dans cet ordre', async () => {
    const b = bac({ profil: { seances_par_semaine: 3, zones_a_menager: null } });
    b.appel('refaireMonProgramme()');
    b.ctx.questionnaire.rep.seances = 5;
    b.ctx.questionnaire.rep.menager = ['dos'];
    b.ctx.continuerQuestionnaire();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.journal.poses).toEqual([{ seances_par_semaine: 5, zones_a_menager: ['dos'] }]);
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.journal.ordre.filter((x) => x === 'saisie' || x === 'apercu')).toEqual(['saisie', 'apercu']);
    expect(b.journal.apercus).toBe(1);
  });

  test('inchangé : rien à écrire, l’aperçu s’ouvre quand même', async () => {
    const b = bac({ profil: { seances_par_semaine: 4, zones_a_menager: ['genou'] } });
    b.appel('refaireMonProgramme()');
    b.ctx.continuerQuestionnaire();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.journal.poses).toEqual([]);
    expect(b.journal.apercus).toBe(1);
  });

  test('⚠️ DISCRIMINANT — « Retour » ramène au Profil SANS rien écrire ni ouvrir d’aperçu', () => {
    const b = bac({ profil: { seances_par_semaine: 4 } });
    b.appel('refaireMonProgramme()');
    b.ctx.questionnaire.rep.seances = 6;
    b.ctx.reculerQuestionnaire();
    expect(b.ctx.questionnaire).toBeNull();
    expect(b.journal.poses).toEqual([]);
    expect(b.journal.apercus).toBe(0);
    expect(b.journal.ordre[b.journal.ordre.length - 1]).toBe('profil');
  });

  test('sans jours valides, « Voir mon programme » n’écrit rien', () => {
    const b = bac({ profil: { seances_par_semaine: null }, faits: { seances: 0, depuis: null, rythme: null, dureeMin: null, maximums: [], autres: [] } });
    b.appel('refaireMonProgramme()');
    expect(b.ctx.questionnaire.rep.seances).toBeNull();
    b.ctx.continuerQuestionnaire();
    expect(b.journal.poses).toEqual([]);
    expect(b.ctx.questionnaire).not.toBeNull();
  });

  test('pas pendant une séance ni quand un voile est ouvert', () => {
    const a = bac();
    a.ctx.seance = { id: 'x' };
    a.appel('refaireMonProgramme()');
    expect(a.ctx.questionnaire).toBeNull();
    const b = bac();
    b.ctx.voileOuvert = {};
    b.appel('refaireMonProgramme()');
    expect(b.ctx.questionnaire).toBeNull();
  });
});

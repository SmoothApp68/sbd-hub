/** @jest-environment node */
//
// 60-2a — LE QUESTIONNAIRE DU COACH, ses RÈGLES (QUESTIONNAIRE-COACH-V2 §2, §3).
//
// Trois couches, toutes pures :
//   · `Profil.doitOuvrirQuestionnaire` — QUAND il s'ouvre ;
//   · `Profil.preparerChamps` — QUELLES colonnes une réponse écrit (la fonction
//     que le Profil appelle aussi) ;
//   · `THQuestionnaire` — QUELS écrans, QUAND « Continuer » s'allume, ce que
//     chaque écran écrit, ses textes.
//
// ⚠️ CHAQUE RÈGLE A SON TÉMOIN OU SON DISCRIMINANT : un test « la pesée n'est
// pas écrite si elle n'a pas changé » ne prouve rien tant qu'un test voisin ne
// prouve pas qu'elle l'est quand elle change.

process.env.TZ = 'Europe/Paris';

require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Periode = require('../../v2/js/periode.js');
const Poids = require('../../v2/js/poids.js');
const Profil = require('../../v2/js/profil.js');
const Q = require('../../v2/js/questionnaire.js');
const FIXTURE = require('./fixtures/cas-51-1-peu-de-temps.json');

const MAINTENANT = new Date(2026, 9, 7, 10, 30);          // 7 octobre 2026, heure locale
const ISO = MAINTENANT.toISOString();

describe('60-2a — QUAND le questionnaire s’ouvre (la ligne de profil est connue)', () => {
  test('profil inconnu : faux — on n’ouvre rien sur une supposition', () => {
    expect(Profil.doitOuvrirQuestionnaire(null, false)).toBe(false);
    expect(Profil.doitOuvrirQuestionnaire(undefined, false)).toBe(false);
  });

  test('DISCRIMINANT — une ligne SANS la colonne (cache d’avant, ligne partielle hors ligne) : faux ; `null` : vrai', () => {
    expect(Profil.doitOuvrirQuestionnaire({ username: 'x', onboarding_completed: true }, false)).toBe(false);
    expect(Profil.doitOuvrirQuestionnaire({ username: 'x', questionnaire_fait_le: null }, false)).toBe(true);
  });

  test('rempli : faux ; déjà ouvert sur cet appareil : faux', () => {
    expect(Profil.doitOuvrirQuestionnaire({ questionnaire_fait_le: '2026-10-07T08:00:00.000Z' }, false)).toBe(false);
    expect(Profil.doitOuvrirQuestionnaire({ questionnaire_fait_le: null }, true)).toBe(false);
  });

  test('`onboarding_completed` n’est PLUS lu : vrai ou faux, seul compte `questionnaire_fait_le`', () => {
    expect(Profil.doitOuvrirQuestionnaire({ onboarding_completed: false, questionnaire_fait_le: '2026-10-07T08:00:00Z' }, false)).toBe(false);
    expect(Profil.doitOuvrirQuestionnaire({ onboarding_completed: true, questionnaire_fait_le: null }, false)).toBe(true);
  });
});

describe('60-2a — les LISTES sont celles de la base (relevées par Claude.ai le 07/10)', () => {
  test('objectif, temps, historique : les clés des CHECK de v2_065', () => {
    expect(Profil.OBJECTIFS.map((o) => o.cle)).toEqual(['force', 'muscle', 'les_deux', 'forme']);
    expect(Profil.TEMPS_REPONSES.map((o) => o.cle)).toEqual(['max', 'marge', 'moins', 'varie']);
    expect(Profil.HISTORIQUES.map((o) => o.cle)).toEqual(['import', 'non_note', 'debutant']);
  });

  test('un libellé par valeur : ceux du questionnaire sont ceux du Profil', () => {
    expect(Profil.OBJECTIFS.map((o) => o.libelle)).toEqual(['Force', 'Muscle', 'Les deux', 'Forme et santé']);
    expect(Profil.HISTORIQUES.map((o) => o.libelle)).toEqual([
      'Oui, dans une autre app', 'Oui, mais je ne l’ai pas noté', 'Non, je débute']);
  });

  test('les cinq exercices prioritaires sont des slugs réels (la fixture tirée de la base les porte)', () => {
    const texte = JSON.stringify(FIXTURE);
    Profil.EXERCICES_PRIORITAIRES.forEach((x) => {
      expect(texte).toContain('"slug":"' + x.cle + '"');
    });
    expect(Profil.EXERCICES_PRIORITAIRES.map((x) => x.libelle)).toEqual(
      ['Squat', 'Couché', 'Soulevé', 'Militaire', 'Tractions']);
  });

  test('les six muscles sont les ZONES de semaine.js, dans l’ordre du radar de periode.js', () => {
    const m = Profil.musclesPrioritaires();
    expect(m.map((x) => x.cle)).toEqual(Periode.ORDRE);
    expect(m.map((x) => x.cle).sort()).toEqual(Semaine.ZONES.map((z) => z.cle).sort());
    m.forEach((x) => expect(x.libelle).toBe(Semaine.ZONES.filter((z) => z.cle === x.cle)[0].libelle));
  });

  test('la liste blanche porte les 7 colonnes écrites… et PAS celles de 60-2b et 60-3', () => {
    ['objectif', 'objectif_depuis', 'priorites', 'temps_reponse', 'historique_declare',
      'phase_confirmee_le', 'questionnaire_fait_le'].forEach((c) => expect(Profil.CHAMPS_ECRITS).toContain(c));
    ['programme_choix', 'zones_a_menager', 'zone_force_reponse', 'zone_force_reponse_le', 'is_admin', 'tier']
      .forEach((c) => expect(Profil.CHAMPS_ECRITS).not.toContain(c));
    expect(Profil.champsEcrits({ objectif: 'force', is_admin: true, programme_choix: 'x' })).toEqual({ objectif: 'force' });
  });
});

describe('60-2a — la préparation des champs (une fois, pour le questionnaire et le Profil)', () => {
  const prep = (profil, entrees) => Profil.preparerChamps(profil, entrees, MAINTENANT);

  test('rien qui n’ait changé n’est écrit ; une réponse vide ne vide rien', () => {
    const p = { objectif: 'force', sexe: 'homme', materiel: 'salle_complete', taille_cm: 182 };
    expect(prep(p, { objectif: 'force', sexe: 'homme', materiel: 'salle_complete', taille_cm: 182 })).toEqual({});
    expect(prep(p, { objectif: null, sexe: '', materiel: undefined, taille_cm: null })).toEqual({});
    expect(prep({}, {})).toEqual({});
  });

  test('une valeur hors liste ou hors bornes ne part pas (un 23514 retenterait le profil ENTIER sans fin)', () => {
    expect(prep({}, { objectif: 'gagner', temps_reponse: 'toujours', historique_declare: 'peut-etre',
      materiel: 'garage', taille_cm: 99, seances_par_semaine: 15, duree_seance_min: 9, annee_naissance: 2026 })).toEqual({});
  });

  describe('l’objectif', () => {
    test('témoin : un objectif qui change écrit `objectif` ET `objectif_depuis`', () => {
      expect(prep({ objectif: 'force' }, { objectif: 'muscle' })).toEqual({ objectif: 'muscle', objectif_depuis: ISO });
      expect(prep({}, { objectif: 'les_deux' })).toEqual({ objectif: 'les_deux', objectif_depuis: ISO });
    });
    test('DISCRIMINANT : le même objectif ne réécrit rien — `objectif_depuis` garde sa date', () => {
      expect(prep({ objectif: 'force', objectif_depuis: '2026-09-01T00:00:00Z' }, { objectif: 'force' })).toEqual({});
    });
  });

  describe('la phase', () => {
    test('une phase qui change écrit `phase`, `phase_depuis` ET `phase_confirmee_le`', () => {
      expect(prep({ phase: 'seche', phase_depuis: '2026-09-01T00:00:00Z' }, { phase: 'prise_de_masse' }))
        .toEqual({ phase: 'prise_de_masse', phase_depuis: ISO, phase_confirmee_le: ISO });
    });
    test('DISCRIMINANT : la même phase ne touche PAS `phase_depuis`, mais `phase_confirmee_le` est TOUJOURS posée', () => {
      expect(prep({ phase: 'seche', phase_depuis: '2026-09-01T00:00:00Z' }, { phase: 'seche' }))
        .toEqual({ phase_confirmee_le: ISO });
    });
    test('« Je ne sais pas » vaut maintien : la clé `inconnue` ne part jamais', () => {
      const c = prep({ phase: 'seche', phase_depuis: '2026-09-01T00:00:00Z' }, { phase: 'inconnue' });
      expect(c).toEqual({ phase: 'maintien', phase_depuis: ISO, phase_confirmee_le: ISO });
      expect(JSON.stringify(c)).not.toContain('inconnue');
    });
    test('un vide valait déjà maintien : répondre maintien écrit la phase mais ne date pas un changement', () => {
      expect(prep({ phase: null }, { phase: 'maintien' })).toEqual({ phase: 'maintien', phase_confirmee_le: ISO });
      expect(prep({}, { phase: 'inconnue' })).toEqual({ phase: 'maintien', phase_confirmee_le: ISO });
    });
  });

  describe('l’année de naissance', () => {
    test('une année nouvelle écrit le 1er janvier de cette année', () => {
      expect(prep({}, { annee_naissance: 1997 })).toEqual({ date_naissance: '1997-01-01' });
      expect(prep({ date_naissance: '1990-05-12' }, { annee_naissance: 1997 })).toEqual({ date_naissance: '1997-01-01' });
    });
    test('DISCRIMINANT : la même année GARDE la date complète déjà saisie (aurel_br : 1997-10-28)', () => {
      expect(prep({ date_naissance: '1997-10-28' }, { annee_naissance: 1997 })).toEqual({});
    });
    test('une année absurde ne part pas', () => {
      expect(prep({}, { annee_naissance: 1850 })).toEqual({});
      expect(prep({}, { annee_naissance: 2026 })).toEqual({});
    });
  });

  describe('les priorités', () => {
    test('trois au plus, connues, sans doublon, dans l’ordre choisi', () => {
      expect(prep({}, { priorites: ['squat_barre', 'dos', 'squat_barre', 'jambes', 'bras', 'inconnu'] }))
        .toEqual({ priorites: ['squat_barre', 'dos', 'jambes'] });
    });
    test('« Pas de priorité » est `[]` — une RÉPONSE, qui s’écrit ; null n’est pas une réponse', () => {
      expect(prep({}, { priorites: [] })).toEqual({ priorites: [] });
      expect(prep({ priorites: null }, { priorites: [] })).toEqual({ priorites: [] });
      expect(prep({}, { priorites: null })).toEqual({});
      expect(prep({}, { priorites: undefined })).toEqual({});
    });
    test('la même liste ne réécrit rien', () => {
      expect(prep({ priorites: ['squat_barre', 'dos'] }, { priorites: ['squat_barre', 'dos'] })).toEqual({});
      expect(prep({ priorites: [] }, { priorites: [] })).toEqual({});
    });
  });

  test('la durée de séance : écrite seulement si elle a changé', () => {
    expect(prep({ duree_seance_min: 90 }, { duree_seance_min: 90 })).toEqual({});
    expect(prep({ duree_seance_min: 90 }, { duree_seance_min: 60 })).toEqual({ duree_seance_min: 60 });
    expect(prep({}, { duree_seance_min: 120 })).toEqual({ duree_seance_min: 120 });
  });

  test('`fait` pose `questionnaire_fait_le`, et seulement lui', () => {
    expect(prep({}, { fait: true })).toEqual({ questionnaire_fait_le: ISO });
    expect(prep({}, { fait: false })).toEqual({});
  });

  test('l’horloge est passée : deux appels à la même heure rendent les mêmes dates', () => {
    expect(prep({}, { objectif: 'force' }).objectif_depuis).toBe(prep({}, { objectif: 'force' }).objectif_depuis);
  });
});

describe('60-2a — la pesée à écrire (écran « Toi »)', () => {
  const LIGNES = [{ id: 'a', date: '2026-09-01', poids_kg: 97.5, source: 'import_hevy' },
                  { id: 'b', date: '2026-09-20', poids_kg: 98, source: 'manuel' }];

  test('un poids qui diffère de la dernière pesée s’écrit, au jour de la personne', () => {
    expect(Poids.peseeAEcrire(LIGNES, 98.4, '2026-10-07')).toEqual({ date: '2026-10-07', poids_kg: 98.4 });
  });
  test('DISCRIMINANT : le même poids que la dernière pesée n’écrit RIEN — confirmer n’est pas se peser', () => {
    expect(Poids.peseeAEcrire(LIGNES, 98, '2026-10-07')).toBeNull();
    expect(Poids.peseeAEcrire(LIGNES, 98.04, '2026-10-07')).toBeNull();   // même dixième
  });
  test('sans aucune pesée, un poids valide s’écrit', () => {
    expect(Poids.peseeAEcrire([], 84, '2026-10-07')).toEqual({ date: '2026-10-07', poids_kg: 84 });
    expect(Poids.peseeAEcrire(null, 84, '2026-10-07')).toEqual({ date: '2026-10-07', poids_kg: 84 });
  });
  test('la dernière pesée est la plus RÉCENTE par date, pas la dernière de la liste', () => {
    const desordre = [LIGNES[1], LIGNES[0]];
    expect(Poids.peseeAEcrire(desordre, 98, '2026-10-07')).toBeNull();
    expect(Poids.peseeAEcrire(desordre, 97.5, '2026-10-07')).not.toBeNull();
  });
  test('les bornes de la base : 20 < p < 400, au dixième', () => {
    expect(Poids.poidsValide(20)).toBeNull();
    expect(Poids.poidsValide(20.1)).toBe(20.1);
    expect(Poids.poidsValide(399.9)).toBe(399.9);
    expect(Poids.poidsValide(400)).toBeNull();
    expect(Poids.poidsValide('abc')).toBeNull();
    expect(Poids.poidsValide(null)).toBeNull();
    expect(Poids.poidsValide(84.46)).toBe(84.5);
  });
  test('rien ne part sans poids valide ni sans jour lisible', () => {
    expect(Poids.peseeAEcrire(LIGNES, null, '2026-10-07')).toBeNull();
    expect(Poids.peseeAEcrire(LIGNES, 99, 'demain')).toBeNull();
    expect(Poids.peseeAEcrire(LIGNES, 12, '2026-10-07')).toBeNull();
  });

  describe('la synchronisation n’efface pas une pesée en attente', () => {
    const serveur = [{ id: 'u1', date: '2026-10-05', poids_kg: 98 }, { id: 'u2', date: '2026-10-07', poids_kg: 97 }];
    const locales = [{ id: 'pesee-2026-10-07', date: '2026-10-07', poids_kg: 98.4, source: 'app' }, serveur[0]];
    test('témoin : sans attente, la liste du serveur fait foi', () => {
      expect(Poids.fondreEnAttente(serveur, locales, {})).toEqual(serveur);
    });
    test('DISCRIMINANT : une pesée en attente est gardée et REMPLACE celle du serveur pour le même jour', () => {
      const r = Poids.fondreEnAttente(serveur, locales, { 'pesee-2026-10-07': true });
      expect(r.map((x) => x.id).sort()).toEqual(['pesee-2026-10-07', 'u1']);
      expect(r.filter((x) => x.date === '2026-10-07')).toHaveLength(1);
      expect(r.filter((x) => x.date === '2026-10-07')[0].poids_kg).toBe(98.4);
    });
    test('une pesée locale qui n’attend plus n’est pas réinjectée (le serveur la connaît)', () => {
      expect(Poids.fondreEnAttente(serveur, locales, { autre: true })).toEqual(serveur);
    });
  });
});

describe('60-2a — les ÉCRANS visibles, dans l’ordre', () => {
  const ids = (ctx) => Q.ecransVisibles(ctx);

  test('avec des séances en base : 3a (« Ce que je sais »), jamais 3b', () => {
    expect(ids({ aDesSeances: true, historique: 'import' })).toEqual(
      ['bienvenue', 'donnees', 'sait', 'toi', 'but', 'priorites', 'temps', 'coach', 'recap']);
    expect(ids({ aDesSeances: true, historique: null })).toContain('sait');
    expect(ids({ aDesSeances: true, historique: 'non_note' })).toContain('sait');
  });
  test('sans séance : 3b (« Sans historique »), jamais 3a', () => {
    expect(ids({ aDesSeances: false, historique: 'debutant' })).toEqual(
      ['bienvenue', 'donnees', 'sans_historique', 'toi', 'but', 'priorites', 'temps', 'coach', 'recap']);
    expect(ids({ aDesSeances: false, historique: 'import' })).toContain('sans_historique');
    expect(ids({ aDesSeances: false, historique: 'import' })).not.toContain('sait');
  });
  test('DISCRIMINANT : des séances MAIS « je débute » : 3b, pas 3a', () => {
    expect(ids({ aDesSeances: true, historique: 'debutant' })).toContain('sans_historique');
    expect(ids({ aDesSeances: true, historique: 'debutant' })).not.toContain('sait');
  });
  test('l’écran du programme (8, 8a, 8b) n’existe pas', () => {
    expect(Q.ECRANS.join(',')).not.toMatch(/programme/);
    expect(ids({ aDesSeances: true, historique: 'import' })).toHaveLength(9);
  });
  test('la barre compte les écrans visibles : 0 % au premier, 100 % au dernier', () => {
    const v = ids({ aDesSeances: true, historique: 'import' });
    expect(Q.progression(v, 'bienvenue')).toEqual({ rang: 0, total: 9, pourcent: 0 });
    expect(Q.progression(v, 'recap')).toEqual({ rang: 8, total: 9, pourcent: 100 });
    expect(Q.ecranSuivant(v, 'donnees')).toBe('sait');
    expect(Q.ecranPrecedent(v, 'toi')).toBe('sait');
    expect(Q.ecranSuivant(v, 'recap')).toBeNull();
    expect(Q.ecranPrecedent(v, 'bienvenue')).toBeNull();
  });
});

describe('60-2a — « Continuer » : obligatoire aux écrans 2, 5 et 9, actif ailleurs', () => {
  test('2 (historique), 5 (objectif ET phase), 9 (coach)', () => {
    expect(Q.ecranPret('donnees', {})).toBe(false);
    expect(Q.ecranPret('donnees', { historique: 'import' })).toBe(true);
    expect(Q.ecranPret('but', { objectif: 'force' })).toBe(false);
    expect(Q.ecranPret('but', { phase: 'seche' })).toBe(false);
    expect(Q.ecranPret('but', { objectif: 'force', phase: 'seche' })).toBe(true);
    expect(Q.ecranPret('coach', {})).toBe(false);
    expect(Q.ecranPret('coach', { coach: 'carnet' })).toBe(true);
  });
  test('tous les autres : actif sans réponse (priorités et temps comprises)', () => {
    ['bienvenue', 'sait', 'sans_historique', 'toi', 'priorites', 'temps', 'recap'].forEach((id) => {
      expect(Q.ecranPret(id, {})).toBe(true);
    });
  });
});

describe('60-2a — ce que chaque écran ÉCRIT', () => {
  const ecrit = (id, rep, profil, ctx) => Q.champsDeLEcran(id, rep, profil || {}, Object.assign(
    { pesees: [], jour: '2026-10-07', maintenant: MAINTENANT }, ctx || {}));

  test('2 → historique_declare ; 3a, 1 → rien', () => {
    expect(ecrit('donnees', { historique: 'import' })).toEqual({ champs: { historique_declare: 'import' }, pesee: null });
    expect(ecrit('sait', {}).champs).toEqual({});
    expect(ecrit('bienvenue', {}).champs).toEqual({});
  });
  test('3b → ancienneté, séances par semaine, durée', () => {
    expect(ecrit('sans_historique', { anciennete: '1_a_3_ans', seances: 4, duree: 75 }).champs)
      .toEqual({ anciennete: '1_a_3_ans', seances_par_semaine: 4, duree_seance_min: 75 });
  });
  test('4 → sexe, année, taille ET la pesée, à part', () => {
    const r = ecrit('toi', { sexe: 'homme', annee: 1997, taille: 182, poids: 98.4 }, {}, { pesees: [{ date: '2026-09-20', poids_kg: 98 }] });
    expect(r.champs).toEqual({ sexe: 'homme', date_naissance: '1997-01-01', taille_cm: 182 });
    expect(r.pesee).toEqual({ date: '2026-10-07', poids_kg: 98.4 });
  });
  test('4 : le poids inchangé n’écrit pas de pesée, l’année inchangée garde la date complète', () => {
    const r = ecrit('toi', { annee: 1997, taille: 182, poids: 98 }, { date_naissance: '1997-10-28', taille_cm: 182 },
      { pesees: [{ date: '2026-09-20', poids_kg: 98 }] });
    expect(r).toEqual({ champs: {}, pesee: null });
  });
  test('5 → objectif (+ date) et phase (+ dates)', () => {
    expect(ecrit('but', { objectif: 'force', phase: 'inconnue' }).champs).toEqual({
      objectif: 'force', objectif_depuis: ISO, phase: 'maintien', phase_confirmee_le: ISO });
  });
  test('6 → priorités ; « Pas de priorité » → []', () => {
    expect(ecrit('priorites', { priorites: ['squat_barre'] }).champs).toEqual({ priorites: ['squat_barre'] });
    expect(ecrit('priorites', { priorites: [] }).champs).toEqual({ priorites: [] });
    expect(ecrit('priorites', { priorites: null }).champs).toEqual({});
  });
  test('7 → temps, matériel ; la durée SEULEMENT si la personne l’a changée (la médiane montrée n’est pas une réponse)', () => {
    expect(ecrit('temps', { temps: 'moins', materiel: 'salle_basique', duree: null }, { duree_seance_min: 90 }).champs)
      .toEqual({ temps_reponse: 'moins', materiel: 'salle_basique' });
    expect(ecrit('temps', { temps: 'moins', duree: 60 }, { duree_seance_min: 90 }).champs)
      .toEqual({ temps_reponse: 'moins', duree_seance_min: 60 });
    expect(ecrit('temps', { duree: 90 }, { duree_seance_min: 90 }).champs).toEqual({});
  });
  test('9 → un rythme + progresser, ou « Juste un carnet » = entretien (le rythme est gardé)', () => {
    expect(ecrit('coach', { coach: 'franc' }).champs).toEqual({ intention: 'progresser', rythme_progression: 'franc' });
    expect(ecrit('coach', { coach: 'carnet' }).champs).toEqual({ intention: 'entretien' });
    expect(ecrit('coach', { coach: 'franc' }, { intention: 'progresser', rythme_progression: 'franc' }).champs).toEqual({});
    expect(ecrit('coach', { coach: 'carnet' }, { intention: 'entretien', rythme_progression: 'franc' }).champs).toEqual({});
  });
  test('10 → `questionnaire_fait_le`', () => {
    expect(ecrit('recap', {}).champs).toEqual({ questionnaire_fait_le: ISO });
  });
  test('toute colonne écrite passe la liste blanche du profil', () => {
    const tout = [
      ecrit('donnees', { historique: 'debutant' }), ecrit('sans_historique', { anciennete: 'plus_5_ans', seances: 5, duree: 90 }),
      ecrit('toi', { sexe: 'femme', annee: 1990, taille: 170 }), ecrit('but', { objectif: 'muscle', phase: 'seche' }),
      ecrit('priorites', { priorites: ['dos'] }), ecrit('temps', { temps: 'max', materiel: 'maison_equipee', duree: 60 }),
      ecrit('coach', { coach: 'prudent' }), ecrit('recap', {})];
    tout.forEach((r) => expect(Profil.champsEcrits(r.champs)).toEqual(r.champs));
  });
});

describe('60-2a — les réponses de départ sont ce qui est DÉJÀ en base', () => {
  test('un profil rempli est pré-rempli : on vérifie, on ne retape pas', () => {
    const rep = Q.reponsesInitiales({
      historique_declare: 'import', anciennete: '3_a_5_ans', seances_par_semaine: 5, duree_seance_min: 90,
      sexe: 'homme', date_naissance: '1997-10-28', taille_cm: 182, objectif: 'force', phase: 'seche',
      priorites: ['squat_barre'], temps_reponse: 'max', materiel: 'salle_complete',
      intention: 'progresser', rythme_progression: 'franc' }, { poids: 98 });
    expect(rep).toEqual({
      historique: 'import', anciennete: '3_a_5_ans', seances: 5, duree: 90, sexe: 'homme', annee: 1997,
      taille: 182, poids: 98, objectif: 'force', phase: 'seche', priorites: ['squat_barre'], temps: 'max',
      materiel: 'salle_complete', coach: 'franc' });
  });
  test('un profil neuf : rien de répondu, sauf le rythme par défaut et la phase vide', () => {
    const rep = Q.reponsesInitiales({}, {});
    expect(rep.objectif).toBeNull();
    expect(rep.phase).toBeNull();
    expect(rep.priorites).toBeNull();
    expect(rep.coach).toBe('normal');
  });
  test('entretien se lit « Juste un carnet » ; une priorité vide `[]` reste une réponse', () => {
    expect(Q.reponsesInitiales({ intention: 'entretien', priorites: [] }).coach).toBe('carnet');
    expect(Q.reponsesInitiales({ priorites: [] }).priorites).toEqual([]);
  });
  test('une phase en base se lit ; « inconnue » n’est jamais une phase de départ', () => {
    expect(Q.reponsesInitiales({ phase: 'prise_de_masse' }).phase).toBe('prise_de_masse');
    expect(Q.reponsesInitiales({ phase: 'peu importe' }).phase).toBeNull();
  });
});

describe('60-2a — les priorités : trois au plus, « Pas de priorité » vide la liste', () => {
  test('toucher ajoute, retoucher retire', () => {
    expect(Q.basculerPriorite(null, 'dos')).toEqual(['dos']);
    expect(Q.basculerPriorite(['dos'], 'jambes')).toEqual(['dos', 'jambes']);
    expect(Q.basculerPriorite(['dos', 'jambes'], 'dos')).toEqual(['jambes']);
  });
  test('la quatrième est sans effet', () => {
    expect(Q.basculerPriorite(['dos', 'jambes', 'bras'], 'tronc')).toEqual(['dos', 'jambes', 'bras']);
    expect(Q.basculerPriorite(['dos', 'jambes', 'bras'], 'bras')).toEqual(['dos', 'jambes']);
  });
});

describe('60-2a — les TEXTES des écrans (la maquette v4, avec ses écarts décidés le 07/10)', () => {
  const vue = (id, etat) => Q.vueDe(id, Object.assign({ rep: Q.reponsesInitiales({}, {}), aDesSeances: true, faits: null }, etat || {}));
  const blocs = (v, type) => v.blocs.filter((b) => b.type === type);

  test('bienvenue : sans la ligne « Ton programme » ; « C’est parti »', () => {
    const v = vue('bienvenue');
    expect(v.titre).toBe('Je suis ton coach. Deux minutes pour te connaître.');
    expect(blocs(v, 'faits')[0].lignes.map((l) => l.libelle)).toEqual(['Tes données', 'Toi', 'Ton but', 'Ton coach']);
    expect(v.bouton).toEqual({ libelle: 'C’est parti', actif: true });
    expect(v.retour).toBe(false);
  });

  test('tes données : trois réponses avec leurs sous-lignes ; « Continuer » éteint tant qu’on n’a pas répondu', () => {
    const v = vue('donnees');
    expect(blocs(v, 'options')[0].options.map((o) => [o.libelle, o.sous])).toEqual([
      ['Oui, dans une autre app', 'Hevy, Strong'],
      ['Oui, mais je ne l’ai pas noté', 'Trois questions de plus'],
      ['Non, je débute', 'Je pars de zéro avec toi, prudemment']]);
    expect(v.voix).toBe('C’est lui qui me dit le plus de choses sur toi.');
    expect(v.bouton.actif).toBe(false);
    expect(vue('donnees', { rep: Object.assign(Q.reponsesInitiales({}, {}), { historique: 'import' }) }).bouton.actif).toBe(true);
  });

  test('sans historique : l’import « arrive plus tard » SEULEMENT pour « dans une autre app » sans séance', () => {
    const rep = (h) => Object.assign(Q.reponsesInitiales({}, {}), { historique: h });
    const dit = 'L’import dans l’app arrive plus tard. Ces trois réponses suffisent pour commencer.';
    expect(vue('sans_historique', { rep: rep('import'), aDesSeances: false }).voix).toBe(dit);
    expect(vue('sans_historique', { rep: rep('non_note'), aDesSeances: false }).voix).toBeNull();
    expect(vue('sans_historique', { rep: rep('debutant'), aDesSeances: true }).voix).toBeNull();
  });

  test('sans historique : ancienneté à QUATRE valeurs (celles de la colonne), séances 2 à 6+, durée 45 à « Plus »', () => {
    const v = vue('sans_historique');
    expect(blocs(v, 'options')[0].options.map((o) => o.cle)).toEqual(['moins_1_an', '1_a_3_ans', '3_a_5_ans', 'plus_5_ans']);
    expect(blocs(v, 'puces')[0].options.map((o) => [o.cle, o.libelle])).toEqual(
      [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6+']]);
    expect(blocs(v, 'puces')[1].options.map((o) => [o.cle, o.libelle])).toEqual(
      [[45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min'], [120, 'Plus']]);
  });

  test('toi : les libellés du profil, l’ANNÉE (pas l’âge), les phrases au futur', () => {
    const v = vue('toi');
    expect(blocs(v, 'puces')[0].options.map((o) => o.libelle)).toEqual(['Homme', 'Femme', 'Non précisé']);
    const champs = blocs(v, 'champs')[0].champs;
    expect(champs.map((c) => c.libelle)).toEqual(['Année de naissance', 'Taille', 'Poids']);
    expect(champs[0].aide).toBe('Elle servira à régler la prudence de tes charges de départ, quand je construirai ton programme.');
    expect(champs[1].aide).toBe('Avec ton poids, ta corpulence : elle servira à tes charges de départ, quand je construirai ton programme.');
    expect(champs[2].aide).toBe('Tractions, dips et pompes, et ta force rapportée à ton poids.');
    expect(v.etape).toBe('Toi · facultatif');
  });

  test('toi : les champs montrent ce qui est connu, le poids avec sa virgule, et ce qui est TAPÉ d’abord', () => {
    const rep = Object.assign(Q.reponsesInitiales({}, {}), { annee: 1997, taille: 182, poids: 98.4 });
    const champs = blocs(vue('toi', { rep }), 'champs')[0].champs;
    expect(champs.map((c) => c.valeur)).toEqual(['1997', '182', '98,4']);
    const tape = blocs(vue('toi', { rep, textes: { poids: '98,', taille: '' } }), 'champs')[0].champs;
    expect(tape.map((c) => c.valeur)).toEqual(['1997', '', '98,']);
    const erreur = blocs(vue('toi', { rep, erreurs: { taille: 'Une taille entre 100 et 250 cm.' } }), 'champs')[0].champs;
    expect(erreur[1].erreur).toBe('Une taille entre 100 et 250 cm.');
  });

  test('ton but : objectif, puis la phase avec « Je compte comme maintien » ; il faut les DEUX', () => {
    const v = vue('but');
    expect(blocs(v, 'puces')[0].options.map((o) => o.libelle)).toEqual(['Force', 'Muscle', 'Les deux', 'Forme et santé']);
    const phases = blocs(v, 'options')[0];
    expect(phases.titre).toBe('Et en ce moment, côté alimentation ?');
    expect(phases.options.map((o) => [o.libelle, o.sous || null])).toEqual([
      ['Prise de masse', null], ['Maintien ou recomposition', null], ['Sèche', null],
      ['Je ne sais pas', 'Je compte comme maintien']]);
    expect(v.bouton.actif).toBe(false);
  });

  test('priorités : « Jusqu’à trois. » — et EN SÈCHE, la phrase du coach', () => {
    const rep = (phase) => Object.assign(Q.reponsesInitiales({}, {}), { phase });
    expect(vue('priorites', { rep: rep('maintien') }).voix).toBe('Jusqu’à trois.');
    expect(vue('priorites', { rep: rep(null) }).voix).toBe('Jusqu’à trois.');
    expect(vue('priorites', { rep: rep('seche') }).voix).toBe(
      'En sèche, je garde surtout tes charges : une priorité musculaire attendra ta prochaine prise de masse. Un exercice prioritaire, oui.');
    expect(JSON.stringify(vue('priorites'))).not.toMatch(/fin de chaque bloc/);
  });

  test('priorités : cinq exercices, six muscles dans l’ordre du radar, « Pas de priorité » ; « Continuer » actif', () => {
    const v = vue('priorites');
    const puces = blocs(v, 'puces');
    expect(puces[0].options.map((o) => o.libelle)).toEqual(['Squat', 'Couché', 'Soulevé', 'Militaire', 'Tractions']);
    expect(puces[1].options.map((o) => o.cle)).toEqual(Periode.ORDRE);
    expect(puces[2].options).toEqual([{ cle: 'aucune', libelle: 'Pas de priorité' }]);
    expect(v.bouton.actif).toBe(true);
  });

  test('priorités : « Pas de priorité » est coché quand la réponse est `[]`, et seulement alors', () => {
    const cochee = (priorites) => blocs(vue('priorites', { rep: Object.assign(Q.reponsesInitiales({}, {}), { priorites }) }), 'puces')[2].valeurs;
    expect(cochee([])).toEqual(['aucune']);
    expect(cochee(null)).toEqual([]);
    expect(cochee(['dos'])).toEqual([]);
  });

  test('temps : la durée habituelle est MONTRÉE ; les quatre réponses, sous-lignes au futur ; la durée visée ouvre le Profil', () => {
    const v = vue('temps', { faits: { dureeMin: 75 } });
    expect(v.titre).toBe('Tes séances durent environ 75 min.');
    const reponses = blocs(v, 'options')[0].options;
    expect(reponses.map((o) => [o.libelle, o.sous || null])).toEqual([
      ['C’est mon maximum', null],
      ['J’ai de la marge pour en faire plus', null],
      ['J’ai moins de temps en ce moment', 'Je te proposerai des séances plus courtes'],
      ['Ça varie beaucoup', 'Je te montrerai la durée des longues séances']]);
    expect(blocs(v, 'ligne')).toEqual([{ type: 'ligne', cle: 'duree', libelle: 'Durée visée', valeur: '75 min' }]);
    expect(blocs(v, 'puces').map((b) => b.cle)).toEqual(['materiel']);
    expect(blocs(v, 'puces')[0].options.map((o) => o.libelle)).toEqual(
      ['Salle complète', 'Salle basique', 'Maison équipée', 'Maison, minimum', 'Poids du corps']);
  });

  test('temps : SANS durée connue, on la demande (les puces de 3b) ; la durée du profil sert quand il n’y a pas de médiane', () => {
    const sans = vue('temps', { faits: { dureeMin: null } });
    expect(sans.titre).toBe('Combien de temps dure une séance, en général ?');
    expect(blocs(sans, 'puces')[0].cle).toBe('duree');
    expect(blocs(sans, 'ligne')).toEqual([]);
    const rep = Object.assign(Q.reponsesInitiales({}, {}), { duree: 60 });
    const profil = vue('temps', { faits: { dureeMin: null }, rep });
    expect(profil.titre).toBe('Tes séances durent environ 60 min.');
    // La durée VISÉE (la ligne, la feuille, le récapitulatif) : la réponse de la personne
    // d'abord, sinon la médiane. (Inversé le 07/10 : la médiane masquait la réponse.)
    expect(Q.dureeMontree(rep, { dureeMin: 75 })).toBe(60);
    expect(Q.dureeMontree(rep, null)).toBe(60);
    expect(Q.dureeMontree(Q.reponsesInitiales({}, {}), { dureeMin: 75 })).toBe(75);
    expect(Q.dureeMontree(Q.reponsesInitiales({}, {}), null)).toBeNull();
    expect(Q.dureeHabituelle({ dureeMin: 75 })).toBe(75);
    expect(Q.dureeHabituelle({ dureeMin: null })).toBeNull();
    expect(Q.dureeHabituelle(null)).toBeNull();
  });

  const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
  test('⚠️ DISCRIMINANT — temps : la durée choisie dans la feuille se VOIT (la ligne, le récapitulatif) ; le titre garde le fait (la médiane)', () => {
    // Avec 75 min de médiane et 45 min déjà en base : la ligne dit 45, le titre 75.
    const rep45 = Object.assign(Q.reponsesInitiales({ duree_seance_min: 45 }, {}), {});
    const v = vue('temps', { faits: { dureeMin: 75 }, rep: rep45 });
    expect(sp(v.titre)).toBe('Tes séances durent environ 75 min.');
    expect(sp(blocs(v, 'ligne')[0].valeur)).toBe('45 min');
    // La personne choisit 60 : la ligne et le récapitulatif disent 60, jamais 75.
    const rep60 = Q.appliquerChoix(rep45, 'duree', 60);
    const v2 = vue('temps', { faits: { dureeMin: 75 }, rep: rep60 });
    expect(sp(v2.titre)).toBe('Tes séances durent environ 75 min.');
    expect(sp(blocs(v2, 'ligne')[0].valeur)).toBe('60 min');
    const lignes = blocs(vue('recap', { faits: { dureeMin: 75 }, rep: Object.assign({}, rep60, { temps: 'max' }) }), 'resume')[0].lignes;
    expect(sp(lignes[3].valeur)).toBe('60 min · c’est mon maximum');
    // Rien de répondu ni en base : la ligne reprend la médiane.
    const vide = vue('temps', { faits: { dureeMin: 75 } });
    expect(sp(blocs(vide, 'ligne')[0].valeur)).toBe('75 min');
  });

  test('ce que j’ai compris : « Je ne sais pas » est dit « Maintien » (maquette) — c’est ce qui s’écrit', () => {
    const rep = Object.assign(Q.reponsesInitiales({}, {}), { objectif: 'force', phase: 'inconnue' });
    const lignes = blocs(vue('recap', { rep }), 'resume')[0].lignes;
    expect(lignes[1]).toMatchObject({ libelle: 'Phase', valeur: 'Maintien', ecran: 'but' });
    const maintien = blocs(vue('recap', { rep: Object.assign({}, rep, { phase: 'maintien' }) }), 'resume')[0].lignes[1];
    expect(maintien.valeur).toBe('Maintien ou recomposition');
  });

  test('ton coach : les libellés et les phrases du PROFIL, puis « Juste un carnet »', () => {
    const o = blocs(vue('coach'), 'options')[0].options;
    expect(o.map((x) => x.libelle)).toEqual(['Prudent', 'Normal', 'Franc', 'Juste un carnet']);
    expect(o[0].sous).toBe('Monte quand toutes tes séries touchent le haut de ta zone, deux séances de suite.');
    expect(o[3]).toEqual({ cle: 'carnet', libelle: 'Juste un carnet', sous: 'Je me tais : aucune proposition, aucune phrase.' });
  });

  test('ce que j’ai compris : sans la ligne Programme, chaque ligne ramène à son écran ; « Commencer »', () => {
    const rep = Object.assign(Q.reponsesInitiales({}, {}), { objectif: 'force', phase: 'seche', priorites: ['squat_barre', 'dos'],
      temps: 'moins', materiel: 'maison_minimal', coach: 'franc', duree: 60 });
    const v = vue('recap', { rep });
    const lignes = blocs(v, 'resume')[0].lignes;
    expect(lignes.map((l) => l.libelle)).toEqual(['Objectif', 'Phase', 'Priorités', 'Temps', 'Matériel', 'Coach']);
    expect(lignes.map((l) => l.valeur)).toEqual(['Force', 'Sèche', 'Squat, Dos', '60 min · j’ai moins de temps en ce moment',
      'Maison, minimum', 'Franc']);
    expect(lignes.map((l) => l.ecran)).toEqual(['but', 'but', 'priorites', 'temps', 'temps', 'coach']);
    expect(v.bouton).toEqual({ libelle: 'Commencer', actif: true });
    expect(v.voix).toBe('À ta première séance, je te propose tes charges. Tu peux toujours taper autre chose.');
  });

  test('ce que j’ai compris : en carnet, la voix se tait ; une ligne sans réponse dit « — »', () => {
    const v = vue('recap', { rep: Object.assign(Q.reponsesInitiales({}, {}), { coach: 'carnet' }) });
    expect(v.voix).toBe('Je me tais. Un geste dans Profil si tu veux mes propositions.');
    expect(blocs(v, 'resume')[0].lignes[0].valeur).toBe('—');
    expect(blocs(v, 'resume')[0].lignes[5].valeur).toBe('Juste un carnet');
  });

  test('chaque écran visible a une vue, un bouton, une progression ; « Retour » existe sauf au premier', () => {
    Q.ecransVisibles({ aDesSeances: true, historique: 'import' }).forEach((id, i) => {
      const v = vue(id, { faits: { seances: 3, depuis: new Date(2025, 4, 1), rythme: 5, dureeMin: 75, maximums: [], autres: [] } });
      expect(v.id).toBe(id);
      expect(typeof v.titre).toBe('string');
      expect(v.progression.rang).toBe(i);
      expect(v.retour).toBe(i > 0);
      expect(v.bouton.libelle).toBe(i === 0 ? 'C’est parti' : id === 'recap' ? 'Commencer' : 'Continuer');
    });
    expect(Q.vueDe('inexistant', {})).toBeNull();
  });
});

describe('60-2a — « Ce que je sais » : les faits mis en mots', () => {
  test('une ligne par fait connu, dans l’ordre ; une ligne dont le fait manque n’existe pas', () => {
    const lignes = Q.lignesDeCeQueJeSais({
      seances: 164, depuis: new Date(2025, 4, 12), rythme: 6, dureeMin: 75,
      maximums: [{ slug: 'developpe_couche_barre', charge: 95 }, { slug: 'squat_barre', charge: 125 },
                 { slug: 'souleve_de_terre_barre', charge: 140 }, { slug: 'developpe_militaire_barre', charge: 60 }],
      autres: ['randonnée', 'escalade'] });
    expect(lignes).toEqual([
      { libelle: 'Historique', valeur: '164 séances · depuis mai 2025' },
      { libelle: 'Rythme (12 dernières semaines)', valeur: 'environ 6 par semaine' },
      { libelle: 'Durée habituelle', valeur: '≈ 75 min' },
      { libelle: 'Couché · squat · soulevé · militaire', valeur: '95 · 125 · 140 · 60 kg' },
      { libelle: 'Autres activités', valeur: 'randonnée, escalade' }]);
  });
  test('seulement les barres faites ; sans rythme, sans durée, sans sortie : l’historique seul', () => {
    const lignes = Q.lignesDeCeQueJeSais({ seances: 1, depuis: new Date(2026, 9, 1), rythme: null, dureeMin: null,
      maximums: [{ slug: 'squat_barre', charge: 80 }], autres: [] });
    expect(lignes).toEqual([
      { libelle: 'Historique', valeur: '1 séance · depuis octobre 2026' },
      { libelle: 'Squat', valeur: '80 kg' }]);
    expect(Q.lignesDeCeQueJeSais(null)).toEqual([]);
  });
  test('les barres montrées sont des exercices prioritaires du catalogue', () => {
    Q.BARRES.forEach((slug) => expect(Profil.EXERCICES_PRIORITAIRES.map((x) => x.cle)).toContain(slug));
  });
});

// 27/11/2026 (MOTEUR §9.24 et §9.18, « La semaine qui déborde », amélioration 6) — UNE SEULE NOTION, « la séance d'aujourd'hui » :
// après « Jambes aujourd'hui · la suite se décale », l'accueil montre Jambes (le planning décalé), pas la routine qui suit la dernière faite.
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/semaine.js');
require('../../v2/js/moteur.js');
require('../../v2/js/generateur.js');
const fs = require('fs');
const path = require('path');
const D = require('../../v2/js/deraille.js');
const Routines = require('../../v2/js/routines.js');

const CAT = {
  couche: { nom: 'Développé Couché (Barre)', muscles_primaires: ['pectoraux'], muscles_secondaires: ['triceps'], muscles_stabilisateurs: [] },
  squat: { nom: 'Squat (Barre)', muscles_primaires: ['quadriceps', 'fessiers'], muscles_secondaires: [], muscles_stabilisateurs: ['bas_du_dos'] },
  tractions: { nom: 'Tractions', muscles_primaires: ['grand_dorsal'], muscles_secondaires: ['biceps'], muscles_stabilisateurs: [] }
};
const ex = (slug, n) => ({ exercise_slug: slug, repos_cible_s: 120,
  series: [{ type_serie: 'echauffement', reps: 8 }].concat(Array.from({ length: n }, () => ({ type_serie: 'travail', reps: 6 }))) });
const PUSH = { id: 'r-push', nom: 'Lundi — Push', rang: 1, dossier: 'P', jours: [1, 5], exercices: [ex('couche', 4)] };
const JAMBES = { id: 'r-jambes', nom: 'Mardi — Jambes', rang: 2, dossier: 'P', jours: [2, 6], exercices: [ex('squat', 4)] };
const PULL = { id: 'r-pull', nom: 'Mercredi — Pull', rang: 3, dossier: 'P', jours: [3], exercices: [ex('tractions', 4)] };
const ROUTINES = [PUSH, JAMBES, PULL];

// Mercredi 14/10/2026 : Push lundi fait, Jambes mardi non.
const MERCREDI = '2026-10-14';
const FAITES = [{ jour: '2026-10-12', routine_id: 'r-push', slugs: ['couche'] }];
const SEANCES = [{ routine_id: 'r-push', debut: '2026-10-12T09:00:00' }];
const carte = D.semaineQuiDeraille({ jour: MERCREDI, catalogue: CAT, debutant: false, dureeMax_s: null, volume: {}, etat: null, routines: ROUTINES, seances: FAITES });
const decale = D.decider(null, carte, 'decaler', MERCREDI);

describe('la séance d\'aujourd\'hui lit le planning décalé', () => {
  test('sans choix, rien : l\'accueil garde la routine qui suit (Pull après Jambes… ici Jambes après Push)', () => {
    expect(D.routineDuJour(null, ROUTINES, SEANCES, MERCREDI)).toBeNull();
    expect(Routines.routineSuivante(ROUTINES, SEANCES).routine.id).toBe('r-jambes');
  });

  test('après « Jambes aujourd\'hui · la suite se décale » : Jambes aujourd\'hui, Pull demain', () => {
    expect(carte.choix[0].cle).toBe('decaler');
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, MERCREDI)).toBe('r-jambes');
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, '2026-10-15')).toBe('r-pull');
  });

  test('le cas qui sépare : la routine qui suit la dernière faite dit Pull, le planning dit Jambes', () => {
    // Pull est la routine qui suit si Jambes a été faite plus tôt dans la semaine ; ici Push fait lundi, Jambes avant lui dans la liste.
    const seances = [{ routine_id: 'r-jambes', debut: '2026-10-10T09:00:00' }];
    expect(Routines.routineSuivante(ROUTINES, seances).routine.id).toBe('r-pull');
    expect(D.routineDuJour(decale, ROUTINES, seances, MERCREDI)).toBe('r-jambes');
  });

  test('une séance déjà commencée aujourd\'hui rend la main (la carte ne remontre pas ce qui est fait)', () => {
    const faite = SEANCES.concat([{ routine_id: 'r-jambes', debut: MERCREDI + 'T08:30:00' }]);
    expect(D.routineDuJour(decale, ROUTINES, faite, MERCREDI)).toBeNull();
  });

  test('annulé, archivé, autre semaine, jour sans placement : rien', () => {
    const l = D.lignesDuChoix(carte, 'decaler', MERCREDI, 'u', '2026-10-14T08:00:00.000Z');
    const annule = D.lignesDAnnulation(l, '2026-10-14T09:00:00.000Z');
    expect(D.routineDuJour(D.etatDepuisLignes(l.concat(annule), MERCREDI), ROUTINES, SEANCES, MERCREDI)).toBeNull();
    expect(D.routineDuJour(decale, ROUTINES.map((r) => (r.id === 'r-jambes' ? Object.assign({}, r, { archivee_a: '2026-10-01' }) : r)), SEANCES, MERCREDI)).toBeNull();
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, '2026-10-21')).toBeNull();
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, '2026-10-18')).toBeNull();   // dimanche : rien de placé
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, 'n\'importe quoi')).toBeNull();
  });

  test('« Garder » ou « Répartir » ne déplace rien : le planning reste nul', () => {
    expect(D.routineDuJour(D.decider(null, carte, 'garder', MERCREDI), ROUTINES, SEANCES, MERCREDI)).toBeNull();
  });

  test('le geste de Saisie (carte.manquee) et l\'accueil nomment la même routine', () => {
    expect(D.routineDuJour(decale, ROUTINES, SEANCES, MERCREDI)).toBe(carte.manquee.routine);
  });
});

describe('une seule fonction câblée (le code de app.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('`Routines.routineSuivante` n\'est lue que par `laSeanceDAujourdhui` ; « Prochaine séance » passe par elle', () => {
    expect((src.match(/Routines\.routineSuivante\(/g) || []).length).toBe(1);
    const i = src.indexOf('function laSeanceDAujourdhui');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 900)).toMatch(/Routines\.routineSuivante\(/);
    const j = src.indexOf('function rendreProchaineSeance');
    expect(src.slice(j, j + 900)).toMatch(/laSeanceDAujourdhui\(\)/);
  });
  test('le coach muet (« Juste un carnet ») ne lit aucun planning', () => {
    const i = src.indexOf('function laSeanceDAujourdhui');
    expect(src.slice(i, i + 500)).toMatch(/coachSeTait/);
  });
});

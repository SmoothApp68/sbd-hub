//
// 173 (refonte « Vivant », lot 1) — la séance en cours : la consigne du jour en héros (même texte, même phrase pour les
// lecteurs d'écran), « Si ça passe » en bulle, la série validée qui s'allume (« fait »). Environnement jsdom.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');
const Modele = window.THModele;
const Seance = require('../../v2/js/seance.js');
const Rendu = () => window.THRendu;
const NB = ' ';
let n = 0;
const uuid = () => 'v-' + (++n);

const EXOS = [{ slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }];

function rendre(s, libelles, extra) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, s, Object.assign({
    blocs: Modele.blocsDeSeance(s, EXOS),
    modifier: false, selection: null, programme: false,
    surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
    tourAtteint: () => 0,
    exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
    precedent: () => null, fantome: () => ({}),
    libelles: libelles,
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surNote: () => {}, surRepos: () => {},
    surSupprimerSerie: () => {}, surAjoutSerie: () => {}
  }, extra || {}));
  return cible;
}
function seance(k) {
  let s = Seance.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = Seance.ajouterExercice(s, 'dc', uuid);
  for (let i = 1; i < k; i++) s = Seance.ajouterSerie(s, 0, uuid);
  return s;
}

describe('la consigne du jour en héros (173)', () => {
  const AUJ = 'Aujourd\'hui' + NB + ': 105' + NB + 'kg' + NB + '×' + NB + '5.';
  const SI = 'Si ça passe, 107,5' + NB + 'kg' + NB + '×' + NB + '4, à la série que tu veux.';

  test('le texte est le même (textContent et aria-label), la charge et les reps ont leur étiquette', () => {
    const c = rendre(seance(3), () => ({ jaune: [AUJ, SI] }));
    const h = c.querySelector('.consigne-heros');
    expect(h).not.toBeNull();
    expect(h.textContent).toBe(AUJ);
    expect(h.getAttribute('aria-label')).toBe(AUJ);
    expect(h.querySelector('.c-charge').textContent).toBe('105');
    expect(h.querySelector('.c-reps').textContent).toBe('5');
  });

  test('« Si ça passe » est une bulle dont la charge × reps est en gras, texte inchangé', () => {
    const c = rendre(seance(3), () => ({ jaune: [AUJ, SI] }));
    const b = c.querySelector('.si-ca-passe');
    expect(b.textContent).toBe(SI);
    expect(b.querySelector('b.sp-chiffre').textContent).toBe('107,5' + NB + 'kg' + NB + '×' + NB + '4');
  });

  const F = (kg, n) => kg + NB + 'kg' + NB + '×' + NB + n;
  const forme = (lignes, extra) => rendre(seance(3), () => ({ jaune: lignes }), extra);

  test('la forme zone « X kg × N » (sans « Aujourd\'hui ») prend le héros, sans étiquette AUJOURD\'HUI, texte identique', () => {
    const c = forme([F('102,5', 9)], { reserveVisee: () => 1 });
    const h = c.querySelector('.consigne-heros');
    expect(h).not.toBeNull();
    expect(h.classList.contains('avec-mot')).toBe(false);
    expect(h.textContent).toBe(F('102,5', 9));
    expect(h.getAttribute('aria-label')).toBe(F('102,5', 9));
    expect(h.querySelector('.c-charge').textContent).toBe('102,5');
    expect(h.querySelector('.c-reps').textContent).toBe('9');
    expect(h.getAttribute('data-garde')).toBe('garde-en' + NB + '1');
  });

  test('« Aujourd\'hui : » garde son étiquette ; « ≈ », « sur les 2 dernières séries », décharge : le chiffre en héros, texte identique', () => {
    [['Aujourd\'hui' + NB + ': ' + F('105', 5) + '.', true],
     ['≈' + NB + F('35', 8), false],
     [F('130', 4) + ' sur les 2 dernières séries', false],
     [F('142,5', 12), false]].forEach(([t, mot]) => {
      const h = forme([t]).querySelector('.consigne-heros');
      expect(h).not.toBeNull();
      expect(h.textContent).toBe(t);
      expect(h.getAttribute('aria-label')).toBe(t);
      expect(h.classList.contains('avec-mot')).toBe(mot);
    });
  });

  test('temps / distance : un nombre en tête prend le héros ; « le cran au-dessus », « puis … » : la phrase en grand, texte identique', () => {
    ['45 s', '1 min 30', '2,5 km'].forEach((t) => {
      const h = forme([t]).querySelector('.consigne-heros');
      expect(h.textContent).toBe(t);
      expect(h.querySelector('.c-charge').textContent).toMatch(/^\d/);
    });
    ['Le cran au-dessus', 'puis ' + F('125', 5) + ' sur celle d\'avant'].forEach((t) => {
      const c = forme([t]);
      expect(c.querySelector('.consigne-heros')).toBeNull();
      const l = c.querySelector('.consigne');
      expect(l.textContent).toBe(t);
      expect(l.classList.contains('consigne-grande')).toBe(true);
    });
  });
});

describe('une série validée s\'allume (173)', () => {
  test('la ligne validée porte « fait », et son bouton d\'effort le mot « fait » tant qu\'il est vide', () => {
    let s = seance(2);
    s = Seance.modifierSerie(s, 0, 0, { charge_kg: 100, reps: 5 });
    s = Seance.valider(s, 0, 0, '2026-10-25T10:00:00+00:00');
    const c = rendre(s, () => null);
    const rangs = [...c.querySelectorAll('.serie')];
    expect(rangs[0].classList.contains('fait')).toBe(true);
    expect(rangs[0].querySelector('.eff-serie').getAttribute('data-fait')).toBe('fait');
    expect(rangs[0].querySelector('.eff-serie').textContent).toBe('');
    expect(rangs[1].classList.contains('fait')).toBe(false);
    expect(rangs[1].querySelector('.eff-serie').hasAttribute('data-fait')).toBe(false);
  });
});

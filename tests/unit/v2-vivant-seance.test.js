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

  test('les autres formes gardent leur phrase, en plus grand', () => {
    const T = '130' + NB + 'kg' + NB + '×' + NB + '4 sur les 2 dernières séries';
    const c = rendre(seance(3), () => ({ jaune: [T, 'puis 125' + NB + 'kg' + NB + '×' + NB + '5 sur celle d\'avant'] }));
    const l = [...c.querySelectorAll('.consigne')];
    expect(l[0].textContent).toBe(T);
    expect(l[0].classList.contains('consigne-grande')).toBe(true);
    expect(c.querySelector('.consigne-heros')).toBeNull();
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

//
// Lot 4 (décision 70, 27/11/2026) — « un journal, pas un tableur » : la bande « Mardi : 90 kg × 8, 8, 8 » (n° 1), la ligne plus
// basse (n° 2), « REPS SEULES » hors de la tête (n° 5), le mot « fait » retiré (n° 4a). Environnement jsdom.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');
const fs = require('fs');
const Modele = window.THModele;
const Seance = require('../../v2/js/seance.js');
const NB = ' ';
let n = 0;
const uuid = () => 'l4-' + (++n);

const EXOS = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] },
  { slug: 'tr', nom: 'Tractions', mesure: 'reps', equipement: 'poids_du_corps', muscles_primaires: ['dos'] }
];
const MAINTENANT = new Date(2026, 10, 27, 10, 0, 0);   // vendredi 27/11/2026
const prec = (series, jour) => ({ seance: { id: 'P', date: new Date(2026, 10, jour || 24, 18, 0, 0).toISOString() }, series });
const W = (charge, reps) => ({ charge_kg: charge, reps: reps, type_serie: 'travail', elastique: null });
const C = (charge, reps) => ({ charge_kg: charge, reps: reps, type_serie: 'echauffement', elastique: null });

describe('la bande (n° 1) : Seance.bandeDePrecedent', () => {
  test('même charge sur les séries de travail : une phrase, le jour dit une fois', () => {
    const b = Seance.bandeDePrecedent(prec([W(90, 8), W(90, 8), W(90, 8)]), MAINTENANT);
    expect(b.texte).toBe('Mardi : 90' + NB + 'kg × 8, 8, 8');
    expect(b.jour).toBe('Mardi');
  });
  test('les chauffes ne comptent pas (toujours à des charges différentes)', () => {
    const b = Seance.bandeDePrecedent(prec([C(40, 8), C(60, 5), W(90, 8), W(90, 8)]), MAINTENANT);
    expect(b && b.phrase).toBe('90' + NB + 'kg × 8, 8');
  });
  test('la condition porte sur la charge seule : des reps différentes restent sur la bande', () => {
    expect(Seance.bandeDePrecedent(prec([W(90, 9), W(90, 8), W(90, 7)]), MAINTENANT).phrase).toBe('90' + NB + 'kg × 9, 8, 7');
  });
  test('charges différentes (pyramide, dégressive) : pas de bande, la colonne PRÉC. reste', () => {
    expect(Seance.bandeDePrecedent(prec([W(100, 5), W(90, 8), W(90, 8)]), MAINTENANT)).toBeNull();
  });
  test('rien à dire : pas de séance, que des chauffes, une série sans reps, une série notée par nom', () => {
    expect(Seance.bandeDePrecedent(null, MAINTENANT)).toBeNull();
    expect(Seance.bandeDePrecedent(prec([C(40, 8)]), MAINTENANT)).toBeNull();
    expect(Seance.bandeDePrecedent(prec([W(90, null), W(90, 8)]), MAINTENANT)).toBeNull();
    expect(Seance.bandeDePrecedent(prec([{ charge_kg: null, reps: 12, type_serie: 'travail', elastique: 'noir' }]), MAINTENANT)).toBeNull();
  });
  test('au-delà de la semaine, le jour porte sa date (jamais une durée)', () => {
    expect(Seance.bandeDePrecedent(prec([W(90, 8)], 12), MAINTENANT).jour).toBe('Jeudi 12' + NB + 'nov.');
  });
});

function rendre(s, precedent, programme) {
  const cible = document.createElement('div');
  window.THRendu.rendreBlocsSeance(cible, s, {
    blocs: Modele.blocsDeSeance(s, EXOS),
    modifier: false, selection: null, programme: !!programme,
    surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
    tourAtteint: () => 0,
    exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0],
    precedent: precedent, fantome: () => ({}),
    libelles: () => null,
    surChamp: () => {}, surValider: () => {}, surNumero: () => {},
    surEffort: () => {}, surNote: () => {}, surRepos: () => {},
    surSupprimerSerie: () => {}, surAjoutSerie: () => {}
  });
  return cible;
}
function seance(slug, k) {
  let s = Seance.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = Seance.ajouterExercice(s, slug, uuid);
  for (let i = 1; i < k; i++) s = Seance.ajouterSerie(s, 0, uuid);
  return s;
}
const aujourdhui = () => new Date().toISOString();

describe('l\'écran lit la bande', () => {
  test('même charge : une ligne « Jour : … » au-dessus des en-têtes, plus de colonne PRÉC. ni de .prec', () => {
    const p = { seance: { id: 'P', date: aujourdhui() }, series: [W(90, 8), W(90, 8), W(90, 8)] };
    const c = rendre(seance('dc', 3), () => p);
    const bande = c.querySelector('.bande');
    expect(bande).not.toBeNull();
    expect(bande.textContent).toMatch(/: 90.kg × 8, 8, 8$/);
    expect(bande.nextElementSibling.classList.contains('cols-seance')).toBe(true);
    expect(c.querySelectorAll('.prec').length).toBe(0);
    expect(c.textContent).not.toMatch(/PRÉC\./);
    expect(c.querySelector('.cols-seance').classList.contains('sans-prec')).toBe(true);
    expect(c.querySelector('.serie').classList.contains('sans-prec')).toBe(true);
  });
  test('charges différentes : la colonne PRÉC. reste, ligne à ligne, sans bande', () => {
    const p = { seance: { id: 'P', date: aujourdhui() }, series: [W(100, 5), W(90, 8), W(90, 8)] };
    const c = rendre(seance('dc', 3), () => p);
    expect(c.querySelector('.bande')).toBeNull();
    expect(c.querySelectorAll('.prec').length).toBe(3);
    expect(c.textContent).toMatch(/PRÉC\./);
  });
  test('jamais fait : colonne PRÉC. inchangée, pas de bande', () => {
    const c = rendre(seance('dc', 2), () => null);
    expect(c.querySelector('.bande')).toBeNull();
    expect(c.querySelectorAll('.prec').length).toBe(2);
  });
  test('l\'éditeur (programme) ne reçoit pas la bande', () => {
    const p = { seance: { id: 'P', date: aujourdhui() }, series: [W(90, 8), W(90, 8)] };
    const c = rendre(seance('dc', 2), () => p, true);
    expect(c.querySelector('.bande')).toBeNull();
  });
});

describe('« REPS SEULES » quitte la tête (n° 5)', () => {
  test('un exercice en reps seules en séance n\'écrit plus le type de mesure ; l\'éditeur le garde', () => {
    expect(rendre(seance('tr', 2), () => null).querySelector('.type-mesure')).toBeNull();
    const e = rendre(seance('tr', 2), () => null, true).querySelector('.type-mesure');
    expect(e && e.textContent).toBe('REPS SEULES');
  });
});

describe('les styles (n° 2, n° 4a)', () => {
  const css = fs.readFileSync(require('path').join(__dirname, '../../v2/styles.css'), 'utf8');
  test('la ligne de saisie : 2 px de marge (49 px, cible de 44 px gardée)', () => {
    expect(css).toMatch(/\.serie\.grille\{position:relative;z-index:1;align-items:center;\s*padding:2px var\(--e3\)/);
  });
  test('le mot « fait » n\'est plus dessiné', () => {
    expect(css).not.toMatch(/content:attr\(data-fait\)/);
  });
});

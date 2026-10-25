//
// 173 (refonte « Vivant », lot 2) — la Progression : le volume par muscle en barres (mêmes nombres), le mois en héros
// (même texte), le dernier record en pastille (même texte), « Peser » et « Tous mes exercices » (deux portes de plus).
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/moteur.js');
require('../../v2/js/rendu.js');

function sommaire(extra) {
  const cible = document.createElement('div');
  const vue = Object.assign({
    mois: { titre: 'Septembre', kg: 13000, series: 40, records: 14, paris: { verifies: 30, tenus: 27 }, surChoix: () => {} },
    records: { dernier: { texte: 'Couché 130 kg × 4', nom: 'Couché', mesure: '130 kg × 4', date: '22 sept.' }, surChoix: () => {} },
    volume: { quand: '19-25 oct.', zones: [{ libelle: 'Pectoraux', series: 12 }, { libelle: 'Dos', series: 6 }, { libelle: 'Jambes', series: 0 }], surChoix: () => {} },
    poids: { resume: { poids: 96.8, date: new Date(2026, 9, 20), variation: { valeur: -0.4, depuis: new Date(2026, 9, 13) }, nb: 5 }, surChoix: () => {} },
    exercices: { quand: '3 exercices', lignes: [{ slug: 'dc', nom: 'Couché', mesure: '100 kg × 5', jour: new Date(2026, 9, 20) }] }
  }, extra || {});
  window.THRendu.rendreSommaire(cible, vue);
  return cible;
}

describe('la Progression « Vivant » (173)', () => {
  test('le volume par muscle : mêmes nombres, barres proportionnelles au plus grand', () => {
    const c = sommaire();
    const zones = [...c.querySelectorAll('.bloc-zone')];
    expect(zones.map((z) => z.querySelector('b').textContent)).toEqual(['12', '6', '0']);
    expect(zones.map((z) => z.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Pectoraux 12', 'Dos 6', 'Jambes 0']);
    expect(zones.map((z) => z.querySelector('.bz-barre').style.width)).toEqual(['100%', '50%', '0%']);
  });

  test('le mois garde sa phrase, le chiffre en héros', () => {
    const c = sommaire();
    const l = c.querySelector('.bloc-heros');
    expect(l.textContent).toBe('13 t soulevées · 14 records · 27 paris tenus sur 30');
    expect(l.querySelector('.bh-premier .bh-n').textContent).toBe('13 t');
  });

  test('le dernier record garde son texte, la charge × reps en gras', () => {
    const c = sommaire();
    const l = c.querySelector('.bloc-dernier');
    expect(l.textContent).toBe('Le dernier : Couché 130 kg × 4, le 22 sept.');
    expect(l.querySelector('b.rec-mesure').textContent).toBe('130 kg × 4');
  });

  test('« Peser » et « Tous mes exercices » appellent leur porte ; sans porte, rien ne s\'ajoute', () => {
    let peser = 0, tous = 0;
    const c = sommaire({
      poids: { resume: { poids: 96.8, date: new Date(2026, 9, 20), variation: null, nb: 1 }, surChoix: () => {}, surPeser: () => { peser++; } },
      exercices: { quand: '1 exercice', lignes: [], surTous: () => { tous++; } }
    });
    c.querySelector('.bloc-peser').click();
    c.querySelector('.bloc-tous').click();
    expect([peser, tous]).toEqual([1, 1]);
    const sans = sommaire();
    expect(sans.querySelector('.bloc-peser')).toBeNull();
    expect(sans.querySelector('.bloc-tous')).toBeNull();
  });
});

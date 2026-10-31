// 194-1 (MOTEUR §9.31) — LA CARTE DU BLOC DE MOBILITÉ À L'ÉCRAN : lue sur le plan, jamais calculée par le rendu. Environnement jsdom.

require('../../v2/js/routeur.js');
require('../../v2/js/semaine.js');
require('../../v2/js/modele.js');
require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const MOB = {
  avant: { zone: 'chevilles', libelle: 'Chevilles', sert: 'squat', minutes: 2, consigne: 'Sans douleur : une tension nette, pas plus.',
    titre: 'Préparation · 2 min', sousTitre: 'Ta cheville sert ton squat aujourd’hui · en mouvement, jamais tenu',
    pourquoi: 'Tenu longtemps juste avant de soulever, un étirement baisse ta force. Avant la séance, seulement du mouvement.',
    exercices: [{ slug: 'flexion_cheville_genou_mur', series: 2, duree_s: 30, cote: true, minutes: 2 }] },
  fin: { minutes: 6, consigne: 'Sans douleur : une tension nette, pas plus.', kine: ['Ta hanche est à ménager : pour l’étirer, demande l’avis d’un kiné.'],
    titre: 'Mobilité · 6 min', sousTitre: 'Ischios · facultatif', pourquoi: 'Ischios : 6 min aujourd’hui, 6 cette semaine sur 10.',
    zones: [{ zone: 'ischios', libelle: 'Ischios', minutes: 6, exercices: [{ slug: 'etirement_ischios', series: 3, duree_s: 40, cote: true, minutes: 6 }] }] }
};
function rendre(mob) {
  const appels = [];
  const vue = { nomMobilite: (s) => 'Nom ' + s, surAjouterMobilite: (ou) => appels.push(['ajouter', ou]), surRefuserMobilite: () => appels.push(['refuser']) };
  const cible = document.createElement('div');
  if (mob && mob.avant) cible.appendChild(Rendu().carteDeMobilite(mob.avant, 'avant', vue));
  if (mob && mob.fin) cible.appendChild(Rendu().carteDeMobilite(mob.fin, 'fin', vue));
  return { cible, appels };
}

describe('194-1 — la carte de mobilité', () => {
  test('sans bloc au plan : aucune carte', () => {
    expect(rendre(null).cible.querySelector('.carte-mobilite')).toBeNull();
    // séance sans exercice : le rendu des blocs s'arrête avant, aucune carte
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, {}, { blocs: [], propositionMobilite: () => MOB });
    expect(cible.querySelector('.carte-mobilite')).toBeNull();
  });
  test('la préparation avant, le bloc après ; titre, doses, consigne, « Pourquoi » et la phrase du kiné viennent du plan', () => {
    const { cible } = rendre(MOB);
    const cartes = Array.from(cible.querySelectorAll('.carte-mobilite'));
    expect(cartes.map((c) => c.getAttribute('data-mobilite'))).toEqual(['avant', 'fin']);
    const fin = cartes[1];
    expect(fin.querySelector('.cm-titre').textContent).toBe('Mobilité · 6 min');
    expect(fin.querySelector('.cm-ligne').textContent).toMatch(/Nom etirement_ischios/);
    expect(fin.querySelector('.cm-dose').textContent.replace(/ /g, ' ')).toBe('3 × 40 s par côté');
    expect(fin.querySelector('.cm-consigne').textContent).toBe('Sans douleur : une tension nette, pas plus.');
    expect(fin.querySelector('.cm-kine').textContent).toMatch(/demande l’avis d’un kiné/);
    expect(fin.querySelector('.cm-pourquoi p').textContent).toMatch(/cette semaine sur 10/);
  });
  test('« Ajouter » et « Non merci » : deux gestes, rien d’écrit par le rendu', () => {
    const { cible, appels } = rendre(MOB);
    const fin = cible.querySelector('[data-mobilite="fin"]');
    Array.from(fin.querySelectorAll('button')).filter((b) => b.textContent === 'Ajouter')[0].click();
    Array.from(fin.querySelectorAll('button')).filter((b) => b.textContent === 'Non merci')[0].click();
    cible.querySelector('[data-mobilite="avant"] .pc-ajouter').click();
    expect(appels).toEqual([['ajouter', 'fin'], ['refuser'], ['ajouter', 'avant']]);
  });
  test('toutes les zones à ménager : la phrase du kiné seule, sans geste', () => {
    const { cible } = rendre({ avant: null, fin: { zones: [], minutes: 0, consigne: 'x', kine: ['Ta hanche est à ménager : pour l’étirer, demande l’avis d’un kiné.'] } });
    const carte = cible.querySelector('[data-mobilite="fin"]');
    expect(carte.querySelector('.cm-kine')).not.toBeNull();
    expect(carte.querySelectorAll('button')).toHaveLength(0);
  });
});

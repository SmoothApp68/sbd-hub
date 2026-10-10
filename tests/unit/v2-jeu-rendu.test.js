//
// 64B — LES TEXTES DU JEU (JEU-V1 §9.2), sur le vrai rendu (jsdom) : le singulier, les restes arrondis à l'entier
// SUPÉRIEUR, « Niveau 100 » sans prochain ni Ω, une série à 0 qui ne dit que la meilleure, aucun bloc série sans
// semaine active, les libellés des succès. Le rendu ne nomme pas le jeu : il reçoit des données.

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;

const MUSCLES = ['poitrine', 'dos', 'epaules', 'bras', 'jambes', 'tronc', 'cardio'];
function etat(o) {
  const muscles = {};
  MUSCLES.forEach((m) => { muscles[m] = Object.assign({ points: 0, niveau: 0, prochain: 3 }, (o.muscles || {})[m]); });
  return {
    semaines: Object.assign({ actives: 10, serie: 10, meilleure: 10, reserve: 0, gelsGagnes: 0, gelsUtilises: [], prochainGel: 2 }, o.semaines),
    muscles,
    niveau: Object.assign({ niveau: 12, omega: null, prochain: 7.2, reserve: 1000 }, o.niveau),
    succes: Object.assign({ nombre: 3, points: 30, ids: [] }, o.succes),
    titre: o.titre === undefined ? null : o.titre
  };
}
// Les espaces ordinaires seulement : l'espace fine et l'insécable font partie des textes.
const texte = (n) => n.textContent.replace(/[ \t\n]+/g, ' ').trim();
function accueil(e, proches) {
  const c = document.createElement('div');
  Rendu.rendreJeuAccueil(c, { etat: e, jauge: 0.4, proches: proches || [], gelsMax: 2,
    surMuscles() {}, surSucces() {}, surDeblocages() {} });
  return c;
}

describe('l’accueil du jeu — les textes', () => {
  test('le niveau : « niveau N+1 dans R points », R arrondi à l’entier SUPÉRIEUR, le titre s’il y en a un', () => {
    const c = accueil(etat({ niveau: { niveau: 87, prochain: 759.2 }, titre: 'polyvalent' }));
    expect(texte(c)).toContain('Niveau 87 · Polyvalent');
    expect(texte(c)).toContain('niveau 88 dans 760 points');
  });

  test('un reste de 1 : le singulier ; un reste entier ne monte pas d’un cran', () => {
    expect(texte(accueil(etat({ niveau: { prochain: 0.4 } })))).toContain('niveau 13 dans 1 point');
    expect(texte(accueil(etat({ niveau: { prochain: 7 } })))).toContain('dans 7 points');
  });

  test('⚠️ à 100 : « Niveau 100 », sans prochain et sans Ω (l’Ω ne se montre qu’au Profil)', () => {
    const t = texte(accueil(etat({ niveau: { niveau: 100, omega: 3, prochain: 1200 } })));
    expect(t).toContain('Niveau 100');
    expect(t).not.toContain('niveau 101');
    expect(t).not.toContain('Ω');
  });

  test('la série : « S semaines d’affilée » et les gels ; à 0, seule la meilleure ; sans semaine active, pas de bloc', () => {
    let t = texte(accueil(etat({ semaines: { serie: 1, meilleure: 14, reserve: 1 } })));
    expect(t).toContain('1 semaine d’affilée');
    expect(t).toContain('gels : 1 sur 2');
    expect(t).toContain('Meilleure série14 semaines');
    const zero = accueil(etat({ semaines: { serie: 0, meilleure: 14 } }));
    t = texte(zero);
    expect(t).not.toContain('d’affilée');
    expect(texte(zero.querySelector('.j-serie'))).not.toContain('gels');
    expect(t).not.toMatch(/\b0 semaine/);
    expect(t).toContain('Meilleure série14 semaines');
    const c = accueil(etat({ semaines: { actives: 0, serie: 0, meilleure: 0 } }));
    expect(c.querySelector('.j-serie')).toBeNull();
  });

  test('⚠️ le plus proche : les restes à l’entier supérieur, les unités, le singulier', () => {
    const c = accueil(etat({}), [
      { type: 'muscle', cle: 'tronc', cible: 23, reste: 6.5, fait: 0.9 },
      { type: 'muscle', cle: 'cardio', cible: 9, reste: 29.916667, fait: 0.8 },
      { type: 'categorie', cle: 'seances', cible: 1000, reste: 387, fait: 0.7 }]);
    const lignes = Array.from(c.querySelectorAll('.j-proches .j-ligne')).map(texte);
    expect(lignes).toEqual(['Tronc, niveau 23dans 7 points', 'Cardio, niveau 9dans 30 min', 'Séances : 1 000dans 387 séances']);
    const d = accueil(etat({}), [{ type: 'categorie', cle: 'serie', cible: 26, reste: 1, fait: 0.9 },
      { type: 'categorie', cle: 'rando', cible: 250, reste: 92.3, fait: 0.5 },
      { type: 'categorie', cle: 'decouverte', cible: 25, reste: 1, fait: 0.4 }]);
    expect(Array.from(d.querySelectorAll('.j-proches .j-ligne')).map(texte))
      .toEqual(['Série : 26 semainesdans 1 semaine', 'Randonnée : 250 kmdans 93 km', 'Découverte : 25 exercicesdans 1 exercice']);
  });

  test('les trois portes', () => {
    const t = Array.from(accueil(etat({ succes: { nombre: 69, points: 1365 } })).querySelectorAll('.j-porte')).map(texte);
    expect(t).toEqual(['Muscles7›', 'Succès69 · 1 365 points›', 'Déblocagescadres, gels›']);
  });
});

describe('les libellés des succès (§9.2)', () => {
  const d = (categorie, palier, cle, nom) => Rendu.libelleSucces({ categorie, palier, cle: cle || null, nom });
  test('par catégorie et palier ; un cap rond par le nom court de l’exercice', () => {
    expect(d('seances', 1000)).toBe('1 000 séances');
    expect(d('serie', 104)).toBe('104 semaines');
    expect(d('records', 1)).toBe('1 record');
    expect(d('muscle', 40, 'epaules')).toBe('Épaules niveau 40');
    expect(d('tous', 30)).toBe('Tous les muscles à 30');
    expect(d('sortie', 20)).toBe('Grande sortie : 20 km');
    expect(d('cap', 140, 'developpe_couche_barre', 'développé couché')).toBe('Cap rond : développé couché 140 kg');
  });
});

describe('les vues Muscles, Succès, Déblocages', () => {
  test('Muscles : sept lignes dans l’ordre reçu, « min » pour Cardio, « niveau maximal » à 50', () => {
    const c = document.createElement('div');
    const e = etat({ muscles: { dos: { niveau: 50, prochain: null }, cardio: { niveau: 3, prochain: 4.2 }, tronc: { niveau: 0, prochain: 1 } } });
    Rendu.rendreJeuMuscles(c, { etat: e, ordre: MUSCLES, jauges: { muscles: {} } });
    const l = Array.from(c.querySelectorAll('.j-metier')).map((x) => x.dataset.muscle);
    expect(l).toEqual(MUSCLES);
    expect(texte(c.querySelector('[data-muscle="dos"]'))).toContain('niveau maximal');
    expect(texte(c.querySelector('[data-muscle="cardio"]'))).toContain('niveau 4 dans 5 min');
    expect(texte(c.querySelector('[data-muscle="tronc"]'))).toContain('niveau 1 dans 1 point');
  });

  test('Succès : « obtenus / total · prochain », les caps sans total, les titres', () => {
    const c = document.createElement('div');
    Rendu.rendreJeuSucces(c, { etat: etat({ succes: { nombre: 69, points: 1365 } }),
      categories: [{ cle: 'seances', obtenus: 5, total: 6, prochain: 1000 }, { cle: 'decouverte', obtenus: 4, total: 4, prochain: null },
        { cle: 'rando', obtenus: 2, total: 5, prochain: 250 }, { cle: 'cap', obtenus: 21, total: null, prochain: null }],
      raretes: [{ rarete: 'commun', points: 10 }, { rarete: 'majeur', points: 100 }],
      titres: [{ cle: 'equilibre', niveau: 10, obtenu: true, affiche: false, manque: null },
        { cle: 'polyvalent', niveau: 20, obtenu: true, affiche: true, manque: null },
        { cle: 'athlete', niveau: 30, obtenu: false, affiche: false, manque: { cle: 'tronc', niveau: 22 } },
        { cle: 'collectionneur', succes: 50, obtenu: true, affiche: false, manque: null }] });
    expect(Array.from(c.querySelectorAll('.j-cat')).map(texte)).toEqual(['Séances5 / 6 · prochain : 1 000',
      'Découverte4 / 4', 'Randonnée2 / 5 · prochain : 250 km', 'Caps ronds21']);
    const t = Array.from(c.querySelectorAll('.j-titres .j-ligne')).map(texte);
    expect(t).toEqual(['Équilibrétous les muscles à 10 · ✓', 'Polyvalent · affichétous les muscles à 20 · ✓',
      'Athlètetous les muscles à 30 · Tronc à 22', 'Collectionneur50 succès · ✓']);
  });

  test('Déblocages : les cadres et leur condition, les gels, « réserve pleine », les semaines protégées', () => {
    const c = document.createElement('div');
    Rendu.rendreJeuDeblocages(c, { cadres: [{ cle: 'vitrine', obtenu: true, affiche: false }, { cle: 'or', obtenu: true, affiche: true },
      { cle: 'grave', obtenu: false, affiche: false }],
    semaines: { reserve: 2, prochainGel: null, gelsUtilises: ['2025-08-04'] },
    conditions: { vitrine: 10, grave: 'athlete' }, gels: { premier: 12, pas: 26, max: 2 } });
    const t = Array.from(c.querySelectorAll('.j-ligne')).map(texte);
    expect(t).toEqual(['Cadre de vitrine10 succès · ✓', 'Cadre d’or · affichéun succès exceptionnel · ✓',
      'Cadre gravéle titre Athlète', 'En réserve2 sur 2', 'Prochain gelréserve pleine', 'Utiliséssemaine du 4 août 2025']);
  });
});

//
// 67B — CHERCHER UN EXERCICE PAR MATÉRIEL ET PAR MUSCLE (ECRAN-SAISIE §7 quindecies.10). La recherche filtrée
// (`Routines.chercher`, 5ᵉ argument), les choix proposés (`Routines.filtresDuCatalogue`), la table des libellés
// d'équipement (`Profil.libelleEquipement`), le rendu (`rendreFiltresExo`, la sous-ligne de `rendreResultatsExo`) et
// le câblage d'app.js (les filtres remis à zéro à chaque ouverture, le choix dans le catalogue).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

require('../../v2/js/modele.js');
const Semaine = require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');
const Routines = require('../../v2/js/routines.js');
require('../../v2/js/rendu.js');
const Rendu = () => window.THRendu;

const ex = (slug, nom, equipement, prim, sec) => ({ slug, nom, equipement, muscles_primaires: prim || [],
  muscles_secondaires: sec || [] });
const CAT = [
  ex('tirage_machine', 'Tirage Poitrine (Machine)', 'machine', ['grand_dorsal'], ['biceps']),
  ex('tirage_convergent', 'Tirage Poitrine Convergent (Machine)', 'machine', ['grand_dorsal']),
  ex('tirage_poulie', 'Tirage Poitrine Poulie', 'poulie', ['grand_dorsal']),
  ex('rowing_machine', 'Rowing Divergent (Machine)', 'machine', ['haut_du_dos'], ['grand_dorsal']),
  ex('squat', 'Squat (Barre)', 'barre', ['quadriceps'], ['fessiers']),
  ex('hip_thrust', 'Hip Thrust (Barre)', 'barre', ['fessiers']),
  ex('velo', 'Vélo', 'machine', [])
];
const slugs = (l) => l.map((e) => e.slug);

describe('67B — Routines.chercher : les filtres, avant l’ordre et la limite', () => {
  test('sans filtre : à l’identique (le 5ᵉ argument absent, nul ou vide)', () => {
    ['', 'tirage', 'squat barre'].forEach((q) => {
      const avant = slugs(Routines.chercher(CAT, q));
      expect(slugs(Routines.chercher(CAT, q, undefined, undefined, null))).toEqual(avant);
      expect(slugs(Routines.chercher(CAT, q, undefined, undefined, { equipement: null, muscle: null }))).toEqual(avant);
    });
  });

  test('le matériel seul, le muscle seul, les deux, et avec un nom : nom ET matériel ET muscle', () => {
    expect(slugs(Routines.chercher(CAT, '', 30, null, { equipement: 'machine' })))
      .toEqual(['tirage_machine', 'tirage_convergent', 'rowing_machine', 'velo']);
    expect(slugs(Routines.chercher(CAT, '', 30, null, { muscle: 'grand_dorsal' })))
      .toEqual(['tirage_machine', 'tirage_convergent', 'tirage_poulie']);
    expect(slugs(Routines.chercher(CAT, '', 30, null, { equipement: 'machine', muscle: 'grand_dorsal' })))
      .toEqual(['tirage_machine', 'tirage_convergent']);
    expect(slugs(Routines.chercher(CAT, 'convergent', 30, null, { equipement: 'machine', muscle: 'grand_dorsal' })))
      .toEqual(['tirage_convergent']);
    expect(slugs(Routines.chercher(CAT, 'rowing', 30, null, { muscle: 'grand_dorsal' }))).toEqual([]);
  });

  test('⚠️ un muscle SECONDAIRE ne fait pas sortir l’exercice (le squat n’est pas dans « Fessiers »)', () => {
    expect(slugs(Routines.chercher(CAT, '', 30, null, { muscle: 'fessiers' }))).toEqual(['hip_thrust']);
    expect(slugs(Routines.chercher(CAT, '', 30, null, { muscle: 'biceps' }))).toEqual([]);
  });

  test('le cardio (sans muscle) sort sans filtre de muscle, jamais avec', () => {
    expect(slugs(Routines.chercher(CAT, 'velo', 30, null, { equipement: 'machine' }))).toEqual(['velo']);
    expect(slugs(Routines.chercher(CAT, 'velo', 30, null, { equipement: 'machine', muscle: 'quadriceps' }))).toEqual([]);
  });

  test('⚠️ la limite après les filtres : un 31ᵉ exercice filtré n’est jamais perdu derrière 30 non filtrés', () => {
    const grand = [];
    for (let i = 1; i <= 30; i++) grand.push(ex('a' + i, 'Aaa ' + String(i).padStart(2, '0'), 'barre', ['pectoraux']));
    grand.push(ex('zz', 'Zzz Machine', 'machine', ['pectoraux']));
    expect(slugs(Routines.chercher(grand, '', undefined, null, { equipement: 'machine' }))).toEqual(['zz']);
    expect(Routines.chercher(grand, '', undefined, null, null).length).toBe(30);
  });

  test('l’ordre du profil (4ᵉ argument) s’applique au résultat filtré, sans le recouper', () => {
    const inverse = (l) => l.slice().reverse();
    expect(slugs(Routines.chercher(CAT, '', 30, inverse, { equipement: 'machine', muscle: 'grand_dorsal' })))
      .toEqual(['tirage_convergent', 'tirage_machine']);
  });
});

describe('67B — les choix proposés et la table des libellés', () => {
  test('seulement ce que le catalogue contient : le matériel dans l’ordre de `EQUIPEMENTS`, le muscle dans l’ordre du radar', () => {
    const f = Routines.filtresDuCatalogue(CAT.concat([ex('inconnu', 'X', 'trx', ['muscle_x'])]));
    expect(f.equipements).toEqual(['barre', 'machine', 'poulie', 'trx']);
    expect(f.muscles).toEqual(['quadriceps', 'fessiers', 'grand_dorsal', 'haut_du_dos', 'muscle_x']);
    const radar = [];
    Semaine.ZONES.forEach((z) => z.muscles.forEach((m) => radar.push(m)));
    expect(f.muscles.slice(0, -1)).toEqual(radar.filter((m) => f.muscles.indexOf(m) >= 0));
  });

  test('les libellés de §7 quindecies.10, au mot près ; une valeur inconnue se rend telle quelle', () => {
    expect(Profil.EQUIPEMENTS.map(Profil.libelleEquipement)).toEqual(['Sans matériel', 'Barre', 'Haltère', 'Machine',
      'Machine Smith', 'Poulie', 'Élastique', 'Kettlebell', 'Disque']);
    expect(Profil.libelleEquipement('trx')).toBe('trx');
    expect(Profil.libelleEquipement(null)).toBe('');
  });

  test('une seule table : le libellé « Sans matériel » n’est écrit qu’une fois (en chaîne) dans les fichiers servis', () => {
    const dossier = path.join(__dirname, '../../v2/js');
    const n = fs.readdirSync(dossier).filter((f) => f.endsWith('.js'))
      .reduce((t, f) => t + (fs.readFileSync(path.join(dossier, f), 'utf8').match(/['"`]Sans matériel['"`]/g) || []).length, 0);
    expect(n).toBe(1);
  });
});

describe('67B — le rendu', () => {
  const texte = (n) => n.textContent;

  test('deux boutons inactifs : « Tout le matériel ▾ », « Tous les muscles ▾ », pas de « ✕ », pas de compte', () => {
    const c = document.createElement('div'), compte = document.createElement('p');
    Rendu().rendreFiltresExo(c, compte, { filtres: [
      { cle: 'equipement', libelle: 'Tout le matériel', actif: false }, { cle: 'muscle', libelle: 'Tous les muscles', actif: false }],
      compte: null, surOuvrir: () => {}, surRetirer: () => {} });
    expect(Array.from(c.querySelectorAll('.filtre-ouvrir')).map(texte)).toEqual(['Tout le matériel▾', 'Tous les muscles▾']);
    expect(c.querySelectorAll('.filtre-retirer').length).toBe(0);
    expect(compte.hidden).toBe(true);
  });

  test('actif : son choix, en ambre (`.actif`), son « ✕ » qui le retire ; le compte « 2 exercices »', () => {
    const c = document.createElement('div'), compte = document.createElement('p');
    const ouverts = [], retires = [];
    Rendu().rendreFiltresExo(c, compte, { filtres: [
      { cle: 'equipement', libelle: 'Machine', actif: true }, { cle: 'muscle', libelle: 'Tous les muscles', actif: false }],
      compte: '2 exercices', surOuvrir: (k) => ouverts.push(k), surRetirer: (k) => retires.push(k) });
    const p = c.querySelectorAll('.filtre-exo');
    expect([p[0].classList.contains('actif'), p[1].classList.contains('actif')]).toEqual([true, false]);
    expect(texte(p[0].querySelector('.filtre-ouvrir'))).toBe('Machine');
    expect(texte(p[0].querySelector('.filtre-retirer'))).toBe('✕');
    expect(p[0].querySelector('.filtre-retirer').getAttribute('aria-label')).toBe('Retirer le filtre Machine');
    p[0].querySelector('.filtre-retirer').click();
    p[1].querySelector('.filtre-ouvrir').click();
    expect([retires, ouverts]).toEqual([['equipement'], ['muscle']]);
    expect([compte.textContent, compte.hidden]).toEqual(['2 exercices', false]);
  });

  test('chaque résultat : son nom, puis « Machine · Grand dorsal » ; « écarté » inchangé ; sans `decrire`, rien', () => {
    const c = document.createElement('div');
    Rendu().rendreResultatsExo(c, [CAT[0], CAT[6]], () => {}, ['velo'],
      (e) => [Profil.libelleEquipement(e.equipement), e.muscles_primaires[0] ? Semaine.libelleMuscle(e.muscles_primaires[0]) : '']
        .filter(Boolean).join(' · '));
    const b = c.querySelectorAll('.resultat');
    expect([b[0].firstChild.textContent, texte(b[0].querySelector('.resultat-sous'))])
      .toEqual(['Tirage Poitrine (Machine)', 'Machine · Grand dorsal']);
    expect([texte(b[1].querySelector('.resultat-sous')), texte(b[1].querySelector('.resultat-mention'))]).toEqual(['Machine', 'écarté']);
    const sans = document.createElement('div');
    Rendu().rendreResultatsExo(sans, [CAT[0]], () => {});
    expect(sans.querySelector('.resultat-sous')).toBe(null);
  });
});

// Le câblage : les VRAIS `ouvrirCatalogue`, `rendreCatalogue`, `ouvrirChoixFiltre`, `retirerFiltre`, `descriptionExo`
// d'app.js, sur les vrais Routines, Profil, Semaine.
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const extraire = (nom) => {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : ' + nom);
  return m[0];
};
const varDe = (nom) => {
  const m = APP.match(new RegExp('^  var ' + nom + ' = [\\s\\S]*?^  };?$', 'm'));
  if (!m) throw new Error('introuvable dans v2/js/app.js : var ' + nom);
  return m[0];
};

function bac() {
  const noeuds = {};
  const $ = (id) => noeuds[id] || (noeuds[id] = { id, value: '', hidden: false, focus: () => {} });
  const vues = [];
  const ctx = {
    Routines, Profil, Semaine, profil: {}, local: { exercices: CAT }, seance: null, vues: { seance: { hidden: true } },
    faits: { datesDesExercices: () => ({}) }, corpus: () => ({}), $,
    Rendu: {
      rendreFiltresExo: (c, compte, v) => { ctx.__filtres = v; },
      rendreResultatsExo: (c, liste, choisir, ecartes, decrire) => { ctx.__liste = liste.map((e) => e.slug); ctx.__decrire = decrire; },
      rendreFeuilleChoix: (c, v) => { ctx.__choix = v; },
      message: () => {}
    },
    ouvrirVoile: () => {}, fermerVoile: () => {}, intentionCatalogue: null, faitsDuCatalogue: null,
    indiceOuNul: (v) => (v === undefined || v === null ? null : v), vues2: vues
  };
  vm.createContext(ctx);
  vm.runInContext(varDe('FILTRES_CATALOGUE'), ctx);
  vm.runInContext('var filtresCatalogue = { equipement: null, muscle: null };', ctx);
  ['ordreDuCatalogue', 'rendreCatalogue', 'ouvrirCatalogue', 'ouvrirChoixFiltre', 'retirerFiltre', 'descriptionExo']
    .forEach((n) => vm.runInContext(extraire(n), ctx));
  ctx.noeuds = noeuds;
  return ctx;
}
const lancer = (c, code) => vm.runInContext(code, c);

describe('67B — le câblage du catalogue (app.js)', () => {
  test('le choix d’un filtre : la feuille de choix À LA PLACE des résultats, seuls les choix présents, la 1ʳᵉ ligne remet à zéro', () => {
    const c = bac();
    lancer(c, 'ouvrirCatalogue(null, null)');
    lancer(c, 'ouvrirChoixFiltre("equipement")');
    expect(c.__choix.titre).toBe('Matériel');
    expect(c.__choix.options.map((o) => [o.cle, o.libelle])).toEqual([['', 'Tout le matériel'], ['barre', 'Barre'],
      ['machine', 'Machine'], ['poulie', 'Poulie']]);
    expect([c.noeuds['choix-filtre-exo'].hidden, c.noeuds['resultats-exo'].hidden]).toEqual([false, true]);
    c.__choix.surChoix('machine');
    expect([c.noeuds['choix-filtre-exo'].hidden, c.noeuds['resultats-exo'].hidden]).toEqual([true, false]);
    lancer(c, 'ouvrirChoixFiltre("muscle")');
    expect(c.__choix.titre).toBe('Muscle principal');
    expect(c.__choix.options[0]).toEqual({ cle: '', libelle: 'Tous les muscles' });
    c.__choix.surChoix('grand_dorsal');
    expect(c.__liste).toEqual(['tirage_machine', 'tirage_convergent']);
    expect(c.__filtres.compte).toBe('2 exercices');
    expect(c.__filtres.filtres.map((f) => [f.libelle, f.actif])).toEqual([['Machine', true], ['Grand dorsal', true]]);
    lancer(c, 'ouvrirChoixFiltre("muscle")');
    expect(c.__choix.valeur).toBe('grand_dorsal');
    c.__choix.surChoix('');                                          // « Tous les muscles » : remis à zéro
    expect(c.__liste).toEqual(['tirage_machine', 'tirage_convergent', 'rowing_machine', 'velo']);
    expect(c.__filtres.compte).toBe('4 exercices');
  });

  test('le « ✕ » retire un filtre d’un geste ; le nom se combine', () => {
    const c = bac();
    lancer(c, 'ouvrirCatalogue(null, null)');
    lancer(c, 'filtresCatalogue.equipement = "machine"; filtresCatalogue.muscle = "grand_dorsal";');
    c.noeuds['champ-recherche-exo'].value = 'convergent';
    lancer(c, 'rendreCatalogue()');
    expect([c.__liste, c.__filtres.compte]).toEqual([['tirage_convergent'], '1 exercice']);
    c.__filtres.surRetirer('equipement');
    c.noeuds['champ-recherche-exo'].value = '';
    lancer(c, 'rendreCatalogue()');
    expect(c.__liste).toEqual(['tirage_machine', 'tirage_convergent', 'tirage_poulie']);
  });

  test('⚠️ DISCRIMINANT — fermer puis rouvrir : les filtres reviennent à zéro (pas de compte, toute la liste)', () => {
    const c = bac();
    lancer(c, 'ouvrirCatalogue(null, null)');
    lancer(c, 'filtresCatalogue.equipement = "barre"; filtresCatalogue.muscle = "fessiers"; rendreCatalogue();');
    expect(c.__liste).toEqual(['hip_thrust']);
    lancer(c, 'ouvrirChoixFiltre("muscle")');
    lancer(c, 'ouvrirCatalogue(null, null)');
    expect(c.__filtres.compte).toBe(null);
    expect(c.__filtres.filtres.map((f) => f.actif)).toEqual([false, false]);
    expect(c.__liste.length).toBe(CAT.length);
    expect([c.noeuds['choix-filtre-exo'].hidden, c.noeuds['resultats-exo'].hidden]).toEqual([true, false]);
  });

  test('la sous-ligne de chaque résultat : « Machine · Grand dorsal » ; sans muscle, le matériel seul', () => {
    const c = bac();
    lancer(c, 'ouvrirCatalogue(null, null)');
    expect(CAT.map(c.__decrire)).toEqual(['Machine · Grand dorsal', 'Machine · Grand dorsal', 'Poulie · Grand dorsal',
      'Machine · Haut du dos', 'Barre · Quadriceps', 'Barre · Fessiers', 'Machine']);
  });
});

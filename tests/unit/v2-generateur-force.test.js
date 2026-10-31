/** @jest-environment node */
//
// 193-2 — LES FAMILLES DE FORCE (Force = powerlifting, Les deux = powerbuilding), 2 à 6 jours, comptes sans historique.
//
// Référence : la table « Les règles » de `maquette-programmes-force-v2.html` (31/10/2026), pas `gen60b.py` (une trace épinglée par
// empreinte, jamais étendue). Les cas sont dans `fixtures/cas-193-2-programmes-force.json` ; les cas de 60-6 qui changent (Force et
// Les deux avec barre) y sont rejoués, avec leur raison, dans `reprises_de_60_6`. Ce que le fichier ne dit pas, les règles ci-dessous
// le vérifient sur CHAQUE famille, de 2 à 6 jours : fréquence, espacement, places liées, reculs, zones.
const fs = require('fs');
const path = require('path');

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-193-2-programmes-force.json'), 'utf8'));
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cas-60-6-generateur.json'), 'utf8'));

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
require('../../v2/js/profil.js');
const G = require('../../v2/js/generateur.js');

const catalogue = () => {
  const c = {};
  Object.keys(CAS.catalogue).forEach((slug) => {
    const [equipement, primaires, secondaires] = CAS.catalogue[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice() };
  });
  Object.keys(F.catalogue_ajouts).forEach((slug) => {
    const [equipement, primaires, secondaires, mouvement] = F.catalogue_ajouts[slug];
    c[slug] = { equipement, muscles_primaires: primaires.slice(), muscles_secondaires: secondaires.slice(), mouvement };
  });
  return c;
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const champs = (x) => [x.exercise_slug, x.motif, x.role, x.series, x.reps, x.zone || null, x.reculs || 0, x.reps_recul || null,
  !!x.lourd, x.lien || null, x.prioritaire, x.menage, x.barre_fixe, !!x.au_max];
const vue = (cat, rs) => rs.map((rt) => ({ nom: rt.nom, pourquoi: G.pourquoi(cat, rt), exercices: rt.exercices.map(champs) }));
const BASE = { materiel: 'salle_complete', anciennete: '3_a_5_ans', phase: 'maintien', priorites: [], menager: [], ecartes: [], faits: {} };
const entree = (o) => Object.assign(clone(BASE), o);
const lignes = (rs) => [].concat.apply([], rs.map((rt) => rt.exercices));
const SQUAT = 'squat_barre', COUCHE = 'developpe_couche_barre', SOULEVE = 'souleve_de_terre_barre';

describe('193-2 — le format du fichier de cas', () => {
  test('les 14 champs sont ceux que le module rend, dans cet ordre', () => {
    expect(F.format_exercice).toEqual(['exercise_slug', 'motif', 'role', 'series', 'reps', 'zone', 'reculs', 'reps_recul', 'lourd', 'lien',
      'prioritaire', 'menage', 'barre_fixe', 'au_max']);
  });
});

describe('193-2 — generer : les cas du fichier, à l’identique', () => {
  F.cas.forEach((c) => {
    test(c.id + ' — ' + c.raison, () => {
      const cat = catalogue();
      expect(vue(cat, G.generer(cat, clone(c.entree)))).toEqual(c.attendu);
    });
  });
  F.reprises_de_60_6.forEach((c) => {
    test('cas de 60-6 « ' + c.id + ' » — nouvelle sortie des familles', () => {
      const cat = catalogue();
      expect(vue(cat, G.generer(cat, clone(c.entree)))).toEqual(c.attendu);
    });
  });
});

describe('193-2 — Muscle et Forme sont inchangés, octet pour octet', () => {
  test('aucun objectif hors Force / Les deux n’a de famille : même sortie avec ou sans l’interrupteur, sur tous les jours et les matériels', () => {
    const cat = catalogue();
    let n = 0;
    ['muscle', 'forme', undefined, null].forEach((objectif) => {
      ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps', null].forEach((materiel) => {
        [1, 2, 3, 4, 5, 6, 7].forEach((jours) => {
          ['moins_1_an', '3_a_5_ans'].forEach((anciennete) => {
            const e = entree({ objectif, materiel, jours, anciennete, priorites: ['squat_barre'], menager: ['genou'] });
            expect(G.familleApplicable(cat, e)).toBe(false);
            expect(JSON.stringify(G.generer(cat, e))).toBe(JSON.stringify(G.generer(cat, Object.assign({}, e, { famille: false }))));
            n++;
          });
        });
      });
    });
    expect(n).toBeGreaterThan(300);
  });

  test('les 32 programmes de 60-6 qui ne sont ni Force ni Les deux (avec barre) sont ceux du fichier de 60-6', () => {
    const cat = catalogue();
    const autres = CAS.generer.filter((c) => !G.familleApplicable(cat, c.entree));
    expect(autres.length).toBe(CAS.generer.length - F.reprises_de_60_6.length);
    autres.forEach((c) => {
      const rs = G.generer(cat, clone(c.entree));
      expect(rs.map((rt) => ({ nom: rt.nom, pourquoi: G.pourquoi(cat, rt),
        exercices: rt.exercices.map((x) => [x.exercise_slug, x.motif, x.role, x.series, x.reps, x.prioritaire, x.menage, x.barre_fixe]) })))
        .toEqual(c.attendu);
    });
  });

  test('sans barre (maison minimale, poids du corps) ou sans le couché à la barre au catalogue : le gabarit d’avant, même pour Force', () => {
    const cat = catalogue();
    expect(G.familleApplicable(cat, entree({ objectif: 'force', jours: 3, materiel: 'maison_minimal' }))).toBe(false);
    expect(G.familleApplicable(cat, entree({ objectif: 'les_deux', jours: 4, materiel: 'poids_du_corps' }))).toBe(false);
    const sans = clone(cat); delete sans[COUCHE];
    expect(G.familleApplicable(sans, entree({ objectif: 'force', jours: 3 }))).toBe(false);
    expect(G.familleApplicable(cat, entree({ objectif: 'force', jours: 3 }))).toBe(true);
    expect(G.familleApplicable(cat, entree({ objectif: 'force', jours: 3, famille: false }))).toBe(false);
  });
});

describe('193-2 — les règles, sur chaque famille de 2 à 6 jours', () => {
  const cat = catalogue();
  const programme = (objectif, jours, o) => G.generer(cat, entree(Object.assign({ objectif, jours }, o || {})));
  // Une barre « est faite » dans une séance : son exercice, ou une variante de sa famille (la prise serrée est un couché).
  const COUCHES = [COUCHE, 'developpe_couche_prise_serree'];
  const compte = (rs, slugs, filtre) => lignes(rs).filter((x) => slugs.indexOf(x.exercise_slug) >= 0 && (!filtre || filtre(x))).length;

  ['force', 'les_deux'].forEach((objectif) => {
    [2, 3, 4, 5, 6].forEach((jours) => {
      describe(objectif + ' · ' + jours + ' jours', () => {
        const rs = programme(objectif, jours);

        test('autant de séances que de jours, aucune vide', () => {
          expect(rs.length).toBe(jours);
          rs.forEach((rt) => expect(rt.exercices.length).toBeGreaterThan(0));
        });

        test('la fréquence : le squat 2 fois (une seule à 2 jours), le couché 2 fois (Force : 3 dès 3 jours), le soulevé 1 fois lourd', () => {
          const squat = compte(rs, [SQUAT]);
          const couche = compte(rs, COUCHES);
          const souleve = compte(rs, [SOULEVE]);
          expect(squat).toBe(jours === 2 ? 1 : 2);
          expect(couche).toBe(objectif === 'force' ? (jours === 2 ? 2 : 3) : (jours === 2 ? 1 : 2));
          expect(souleve).toBe(1);
          expect(compte(rs, [SOULEVE], (x) => x.zone === 'lourd')).toBe(1);
          // la charnière légère (le roumain) : Force dès 2 jours, Les deux dès 3 jours
          const roumain = compte(rs, ['souleve_de_terre_roumain_barre']);
          expect(roumain).toBe(objectif === 'force' || jours >= 3 ? 1 : 0);
        });

        test('chaque barre lourde porte sa zone : Force en séries égales, Les deux en grosse série + reculs', () => {
          lignes(rs).filter((x) => x.lourd).forEach((x) => {
            expect(x.zone).toBe('lourd');
            if (objectif === 'force') { expect(x.reculs).toBeUndefined(); expect(x.series).toBeGreaterThanOrEqual(3); }
            else { expect(x.series).toBe(1); expect(x.reculs).toBeGreaterThanOrEqual(2); expect(x.reps_recul).toBeGreaterThan(0); }
          });
          // Force : jamais un recul (l’écart de départ n’est pas réglable, MOTEUR §9.28)
          if (objectif === 'force') lignes(rs).forEach((x) => expect(x.reculs).toBeUndefined());
        });

        test('l’espacement : squat lourd et soulevé lourd jamais dans la même séance ; dès 4 jours, jamais dans deux séances qui se suivent', () => {
          const lourde = (rt, slug) => rt.exercices.some((x) => x.exercise_slug === slug && x.zone === 'lourd');
          const i = rs.findIndex((rt) => lourde(rt, SQUAT)), j = rs.findIndex((rt) => lourde(rt, SOULEVE));
          expect(i).toBeGreaterThanOrEqual(0);
          expect(j).toBeGreaterThanOrEqual(0);
          expect(i).not.toBe(j);
          if (jours >= 4) expect(Math.abs(i - j)).toBeGreaterThan(1);
        });

        test('les places liées : la même barre, deux zones DIFFÉRENTES, le même exercice', () => {
          const parLien = {};
          lignes(rs).filter((x) => x.lien).forEach((x) => { (parLien[x.lien] = parLien[x.lien] || []).push(x); });
          Object.keys(parLien).forEach((lien) => {
            const l = parLien[lien];
            expect(new Set(l.map((x) => x.exercise_slug)).size).toBe(1);
            if (l.length > 1) expect(new Set(l.map((x) => x.zone)).size).toBe(l.length);
          });
        });

        test('aucune charge, aucune chauffe, aucun repos : le générateur n’en pose pas', () => {
          lignes(rs).forEach((x) => expect(Object.keys(x).filter((k) => /charge|chauffe|repos/.test(k))).toEqual([]));
        });

        test('pur : deux appels, même sortie ; l’entrée n’est pas modifiée', () => {
          const e = entree({ objectif, jours }), avant = clone(e);
          expect(JSON.stringify(G.generer(cat, e))).toBe(JSON.stringify(G.generer(cat, e)));
          expect(e).toEqual(avant);
        });
      });
    });
  });

  test('Force 5 et 6 jours : la base de 4 jours puis « Haut du corps » (5), puis « Bas du corps » (6), sans barre lourde ni zone', () => {
    const f6 = programme('force', 6);
    expect(f6.slice(0, 4).map((r) => r.nom)).toEqual(programme('force', 4).map((r) => r.nom));
    expect(f6.slice(4).map((r) => r.nom)).toEqual(['Haut du corps', 'Bas du corps']);
    lignes(f6.slice(4)).forEach((x) => { expect(x.zone).toBeUndefined(); expect(x.lourd).toBeUndefined(); });
    expect(programme('les_deux', 5).slice(4).map((r) => r.nom)).toEqual(['Haut du corps']);
  });

  test('la prise serrée est la 3ᵉ séance du couché : Force dès 3 jours, jamais en Les deux ni chez le débutant', () => {
    expect(compte(programme('force', 2), ['developpe_couche_prise_serree'])).toBe(0);
    [3, 4, 5, 6].forEach((j) => expect(compte(programme('force', j), ['developpe_couche_prise_serree'])).toBe(1));
    [2, 3, 4].forEach((j) => expect(compte(programme('les_deux', j), ['developpe_couche_prise_serree'])).toBe(0));
    expect(compte(programme('force', 4, { anciennete: 'moins_1_an' }), ['developpe_couche_prise_serree'])).toBe(0);
  });

  test('moins d’un an : 3 × 5 sur les barres, sans zone, sans recul, la même fréquence ; aucune phase (rien n’est lourd à protéger… sauf la grosse série)', () => {
    ['force', 'les_deux'].forEach((objectif) => {
      [2, 3, 4].forEach((jours) => {
        const rs = programme(objectif, jours, { anciennete: 'moins_1_an' });
        lignes(rs).forEach((x) => { expect(x.zone).toBeUndefined(); expect(x.reculs).toBeUndefined(); });
        lignes(rs).filter((x) => x.lien).forEach((x) => { expect(x.series).toBe(3); expect(x.reps).toBe(5); });
        expect(compte(rs, [SQUAT])).toBe(jours === 2 ? 1 : 2);
      });
    });
  });

  test('priorité : +1 série à une barre de Force ; à une grosse série, +1 RECUL, jamais une seconde grosse série', () => {
    const f = lignes(programme('force', 4, { priorites: [SQUAT] })).filter((x) => x.exercise_slug === SQUAT);
    expect(f.map((x) => x.series).sort()).toEqual([5, 5]);
    const d = lignes(programme('les_deux', 4, { priorites: [SQUAT] })).filter((x) => x.exercise_slug === SQUAT && x.zone === 'lourd')[0];
    expect(d.series).toBe(1);
    expect(d.reculs).toBe(3);                                  // 2 reculs de la table + 1
  });

  test('la zone à ménager : plus de série lourde ; zone Mix (Force) ou Hypertrophie (Les deux), reculs → séries égales, reps au moins celles d’un secondaire', () => {
    const f = lignes(programme('force', 3, { menager: ['dos'] }));
    const sq = f.filter((x) => x.motif === 'squat');
    expect(sq.length).toBe(2);
    sq.forEach((x) => { expect(x.menage).toBe(true); expect(x.zone).not.toBe('lourd'); expect(x.reps).toBeGreaterThanOrEqual(7); });
    expect(new Set(sq.map((x) => x.exercise_slug)).size).toBe(1);                       // la même variante douce aux deux endroits
    expect(sq[0].exercise_slug).toBe('belt_squat_machine');
    const d = lignes(programme('les_deux', 4, { menager: ['genou'] })).filter((x) => x.motif === 'squat');
    d.forEach((x) => { expect(x.zone).toBe('hypertrophie'); expect(x.reculs).toBeUndefined(); expect(x.reps).toBeGreaterThanOrEqual(9); });
    expect(d.map((x) => x.series)).toEqual([3, 3]);                                      // la grosse série + 2 reculs : 3 séries égales (la reprise en a 3)
  });

  test('un exercice écarté : le lourd ET sa reprise prennent le même remplaçant ; la prise serrée écartée → Larsen → la barre en Hypertrophie', () => {
    const a = lignes(programme('force', 3, { ecartes: [COUCHE] })).filter((x) => x.lien === 'c');
    expect(a.length).toBe(2);
    expect(new Set(a.map((x) => x.exercise_slug))).toEqual(new Set(['developpe_couche_haltere']));
    const l = lignes(programme('force', 3, { ecartes: ['developpe_couche_prise_serree'] })).filter((x) => x.zone === 'hypertrophie' && x.motif === 'couche_serre');
    expect(l[0].exercise_slug).toBe('developpe_couche_larsen');
    const b = lignes(programme('force', 3, { ecartes: ['developpe_couche_prise_serree', 'developpe_couche_larsen'] }))
      .filter((x) => x.motif === 'couche_serre');
    expect(b[0].exercise_slug).toBe(COUCHE);
    expect(b[0].zone).toBe('hypertrophie');
  });
});

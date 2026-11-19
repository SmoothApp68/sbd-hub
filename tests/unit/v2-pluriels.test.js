/** @jest-environment node */
//
// 19/11/2026 — LES PLURIELS : un nombre qui peut valoir 1 ne s'écrit pas au pluriel (« tes 1 dernières séances », « a fait 1 reps »).
// Une seule fonction, `Modele.pluriel` ; les phrases corrigées sont jouées à n = 1 et n = 2.

const fs = require('fs');
const path = require('path');
const Modele = require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
const Moteur = require('../../v2/js/moteur.js');

describe('Modele.pluriel / tesDernieresSeances / uniteReps : la table', () => {
  test.each([
    [0, 'série'], [1, 'série'], [2, 'séries'], [8, 'séries'],
  ])('pluriel(%s, série) = « %s »', (n, mot) => { expect(Modele.pluriel(n, 'série')).toBe(mot); });
  test('un pluriel irrégulier se donne en entier', () => {
    expect(Modele.pluriel(1, 'journal', 'journaux')).toBe('journal');
    expect(Modele.pluriel(3, 'journal', 'journaux')).toBe('journaux');
  });
  test('« ta dernière séance » à 1, « tes N dernières séances » à 2 et plus', () => {
    expect(Modele.tesDernieresSeances(1)).toBe('ta dernière séance');
    expect(Modele.tesDernieresSeances(2)).toBe('tes 2 dernières séances');
    expect(Modele.tesDernieresSeances(8, 'huit')).toBe('tes huit dernières séances');
  });
  test('« rep » à 1', () => { expect(Modele.uniteReps(1)).toBe('rep'); expect(Modele.uniteReps(2)).toBe('reps'); });
});

describe('les phrases corrigées, à n = 1 et n = 2', () => {
  const Equilibres = require('../../v2/js/equilibres.js');
  test('equilibres.js ne garde plus de copie locale de `pluriel`', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/equilibres.js'), 'utf8');
    expect(src).not.toMatch(/^\s*function pluriel\(/m);
    expect(Equilibres).toBeTruthy();
  });

  test('poids : « Calculée sur tes N pesées de ces M semaines. » (la pesée et la semaine seules au singulier)', () => {
    const Poids = require('../../v2/js/poids.js');
    expect(Poids.noteDeTendance({ pesees: 2, semaines: 2 })).toBe('Calculée sur tes 2 pesées de ces 2 semaines.');
    expect(Poids.noteDeTendance({ pesees: 1, semaines: 1 })).toBe('Calculée sur ta pesée de la semaine.');
  });

  const CAS = require('./fixtures/consigne-48b7.json');
  const consigneDe = (id) => {
    const c = CAS.filter((x) => x.id === id)[0];
    return { c, r: Moteur.consignePour(c.seances, c.avant, { reglage: c.reglage, equipement: c.equipement, correction: null }) };
  };
  const esp = (t) => String(t).replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ');

  test('moteur — l’habitude de reps de la zone : « Sur ta dernière séance » à 1, « Sur tes 2 dernières séances » à 2', () => {
    const { c, r } = consigneDe('N1');
    const dit = (n) => {
      const k = JSON.parse(JSON.stringify(r));
      k.fondement.habitude.seances = n;
      return esp(Moteur.pourquoiConsigne(k, c.reglage).zone);
    };
    expect(dit(1)).toContain('Sur ta dernière séance, tu fais 5 reps d\'habitude.');
    expect(dit(1)).not.toMatch(/tes 1 /);
    expect(dit(2)).toContain('Sur tes 2 dernières séances, tu fais 5 reps d\'habitude.');
  });

  test('moteur — la zone choisie : « D’après ta dernière séance » à 1, « D’après tes 2 dernières séances » à 2', () => {
    const { c, r } = consigneDe('N1');
    const dit = (n) => {
      const k = JSON.parse(JSON.stringify(r));
      k.fondement.habitude = { valeur: 12, seances: n };
      k.fondement.correction = { zoneDeduite: 'volume' };
      return esp(Moteur.pourquoiConsigne(k, c.reglage).zone);
    };
    expect(dit(1)).toContain('D\'après ta dernière séance, ce serait');
    expect(dit(2)).toContain('D\'après tes 2 dernières séances, ce serait');
  });

  test('moteur — le test qui tient : « a fait 1 rep, le bas de ta zone » / « 3 reps »', () => {
    const { c, r } = consigneDe('N3');
    const dit = (n) => {
      const k = JSON.parse(JSON.stringify(r));
      k.fondement.test.reps = n;
      return esp(Moteur.pourquoiConsigne(k, c.reglage).etat);
    };
    expect(dit(1)).toMatch(/^Ton test à 130 kg a fait 1 rep, /);
    expect(dit(3)).toMatch(/^Ton test à 130 kg a fait 3 reps, /);
  });

  test('moteur — « Ton test à 130 kg a fait 1 rep » / « 3 reps »', () => {
    const { c, r } = consigneDe('N7');
    const dit = (n) => {
      const k = JSON.parse(JSON.stringify(r));
      k.fondement.test.reps = n;
      return esp(Moteur.pourquoiConsigne(k, c.reglage).etat);
    };
    expect(dit(1)).toMatch(/a fait 1 rep\b(?!s)/);
    expect(dit(3)).toMatch(/a fait 3 reps\b/);
  });
});

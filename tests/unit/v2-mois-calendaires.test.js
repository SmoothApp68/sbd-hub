/** @jest-environment node */
//
// « UN SEUL MOIS » (MOTEUR §9.51 ter, 15/11/2026) — PR B de « un seul max et un seul mois ».
//
// Le défaut : « il y a N mois » s'écrivait de six façons, dont `setMonth` / `setUTCMonth`, qui DÉBORDENT (31 mai − 3 mois = le 3 mars,
// pas le 28 février), et des fenêtres de 365 jours qui disaient « 12 mois ». Une date « il y a N mois » est maintenant calculée par
// `THPeriode` (calendaire, fuseau local, jour plafonné à la fin du mois) ; une durée reste en jours.
//
//   I178  les bornes de mois : `moisAvant` / `moisApres` plafonnent à la fin du mois d'arrivée ;
//   I185  une date, un résultat : le moteur, la fiche (faits), l'objectif, le social et le Poids lisent le même jour.
//
// (I184 et I186 — aucune arithmétique de mois, aucune durée de mois hors `periode.js` — sont dans `v2-architecture.test.js`.)
// Chaque cas est joué sous DEUX fuseaux (Europe/Paris et UTC) : un bord de mois qui ne tient qu'à l'un des deux est un défaut.

global.self = global;
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
const P = require('../../v2/js/periode.js');
const Mo = require('../../v2/js/moteur.js');
const Poids = require('../../v2/js/poids.js');
const Social = require('../../v2/js/social.js');
require('../../v2/js/bilan.js');
require('../../v2/js/seance.js');
const O = require('../../v2/js/objectif.js');
const M = global.THModele;

const jour = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

['Europe/Paris', 'UTC'].forEach((tz) => {
  describe('[' + tz + ']', () => {
    const avant = process.env.TZ;
    beforeAll(() => { process.env.TZ = tz; });
    afterAll(() => { process.env.TZ = avant; });

    describe('I178 — les bornes de mois (THPeriode.moisAvant / moisApres)', () => {
      test.each([
        ['2026-05-31', 3, '2026-02-28'],     // le défaut mesuré : setMonth donnait le 3 mars
        ['2026-08-31', 6, '2026-02-28'],
        ['2026-12-31', 3, '2026-09-30'],
        ['2028-02-29', 12, '2027-02-28'],    // bissextile → non bissextile
        ['2028-02-29', 48, '2024-02-29'],    // bissextile → bissextile : le 29 tient
        ['2026-03-31', 1, '2026-02-28'],
        ['2026-01-31', 2, '2025-11-30'],
        ['2026-01-15', 1, '2025-12-15'],     // passage d'année
        ['2026-11-15', 12, '2025-11-15'],
        ['2026-11-15', 0, '2026-11-15']
      ])('moisAvant(%s, %i) = %s', (j, n, attendu) => { expect(P.moisAvant(j, n)).toBe(attendu); });

      test.each([
        ['2026-01-31', 1, '2026-02-28'],
        ['2028-01-31', 1, '2028-02-29'],     // bissextile
        ['2028-02-29', 12, '2029-02-28'],
        ['2026-11-30', 3, '2027-02-28'],
        ['2026-12-15', 1, '2027-01-15'],
        ['2026-11-15', 12, '2027-11-15']
      ])('moisApres(%s, %i) = %s', (j, n, attendu) => { expect(P.moisApres(j, n)).toBe(attendu); });

      test('moisApres est l’inverse sans dépasser : moisApres(moisAvant(j, n), n) ≤ j, jamais au-delà', () => {
        for (let k = 0; k < 400; k++) {
          const d = new Date(2024, 0, 1 + k * 3), j = jour(d);
          [1, 3, 6, 12, 24].forEach((n) => {
            expect(P.moisApres(P.moisAvant(j, n), n) <= j).toBe(true);
            expect(P.moisAvant(P.moisApres(j, n), n) <= j).toBe(true);
          });
        }
      });

      test('une entrée illisible rend null, jamais une date inventée', () => {
        expect(P.moisAvant('demain', 3)).toBeNull();
        expect(P.moisApres(null, 3)).toBeNull();
        expect(P.instantMoisAvant('x', 3)).toBeNull();
        expect(P.instantMoisApres(NaN, 3)).toBeNull();
      });
    });

    describe('instantMoisAvant / instantMoisApres — le jour calendaire, la même heure locale', () => {
      test('31 mai 2026 à 18 h 30 − 3 mois = 28 février 2026 à 18 h 30 (et non le 3 mars)', () => {
        const t = new Date(2026, 4, 31, 18, 30, 15, 250);
        const d = P.instantMoisAvant(t.getTime(), 3);
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()])
          .toEqual([2026, 1, 28, 18, 30, 15, 250]);
      });
      test('hors fin de mois, le résultat est celui de l’ancien code : le même instant à la milliseconde', () => {
        const t = new Date(2026, 10, 15, 9, 41, 7, 33);
        const ancien = new Date(t); ancien.setFullYear(ancien.getFullYear() - 1);
        expect(P.instantMoisAvant(t.getTime(), 12).getTime()).toBe(ancien.getTime());
        const anc2 = new Date(t); anc2.setMonth(anc2.getMonth() + 12);
        expect(P.instantMoisApres(t.getTime(), 12).getTime()).toBe(anc2.getTime());
      });
      test('un instant à 00 h 30 le 1er mars est le 1er mars : −1 mois = 1er février, pas un 28 février', () => {
        const t = new Date(2027, 2, 1, 0, 30);
        expect(jour(P.instantMoisAvant(t.getTime(), 1))).toBe('2027-02-01');
      });
      test('le dimanche du changement d’heure : même heure locale avant et après', () => {
        // 29 mars 2026 (passage à l'heure d'été en Europe) et 25 octobre 2026 (passage à l'heure d'hiver)
        [new Date(2026, 2, 29, 15, 0), new Date(2026, 9, 25, 15, 0), new Date(2026, 4, 29, 15, 0), new Date(2026, 3, 25, 15, 0)].forEach((t) => {
          const d = P.instantMoisAvant(t.getTime(), 1);
          expect(d.getHours()).toBe(15);
          expect(d.getDate()).toBe(t.getDate());
        });
        const d = P.instantMoisAvant(new Date(2026, 3, 29, 15, 0).getTime(), 1);   // 29 avril → 29 mars, jour du changement d'heure
        expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([2, 29, 15]);
      });
    });

    describe('debutDeFenetreDeMois — le lendemain du même jour il y a N mois', () => {
      test.each([
        ['2026-11-15', 12, '2025-11-16'],
        ['2026-11-15', 3, '2026-08-16'],
        ['2026-05-31', 3, '2026-03-01'],      // 28 février + 1 jour (setMonth donnait le 4 mars)
        ['2028-02-29', 12, '2027-03-01'],     // 28 février 2027 + 1 jour (le code du social donnait le 2 mars)
        ['2026-12-31', 3, '2026-10-01'],
        ['2026-01-31', 12, '2025-02-01']
      ])('debutDeFenetreDeMois(%s, %i) = %s', (j, n, attendu) => { expect(P.debutDeFenetreDeMois(j, n)).toBe(attendu); });
    });

    describe('les quatre périodes de la courbe restent des DURÉES (MOTEUR §9.51 ter.4, PR 6)', () => {
      test('3 mois = 90 j, 6 mois = 183 j, 1 an = 366 j, JOURS_DE non touché', () => {
        expect(P.JOURS_DE).toEqual({ '3m': 90, '6m': 183, '1a': 366 });
      });
    });

    describe('I185 — le moteur : le plancher des 12 mois et le pas de salle', () => {
      test('plancherDuMateriel : 29 février 2028 à 12 h − 12 mois = 28 février 2027 à 12 h (setUTCMonth : 1er mars)', () => {
        const t = new Date(2028, 1, 29, 12, 0).getTime();
        const p = Mo.plancherDuMateriel('machine', t);
        expect(new Date(p).getTime()).toBe(new Date(2027, 1, 28, 12, 0).getTime());
      });
      test('plancherDuMateriel : 31 mai 2026 − 12 mois : le 31 mai 2025, aucun déplacement', () => {
        const t = new Date(2026, 4, 31, 9, 0).getTime();
        expect(Mo.plancherDuMateriel('haltere', t)).toBe(new Date(2025, 4, 31, 9, 0).getTime());
      });
      test('plancherDuMateriel : la barre n’a pas de fenêtre', () => {
        expect(Mo.plancherDuMateriel('barre', new Date(2026, 4, 31).getTime())).toBeNull();
      });
      test('le plancher tombe sur le jour de THPeriode.moisAvant, pour toutes les dates du lot', () => {
        [new Date(2028, 1, 29, 12), new Date(2026, 4, 31, 9), new Date(2026, 2, 29, 15), new Date(2026, 11, 31, 23, 59), new Date(2027, 2, 1, 0, 30)]
          .forEach((d) => {
            expect(jour(new Date(Mo.plancherDuMateriel('poulie', d.getTime())))).toBe(P.moisAvant(jour(d), 12));
          });
      });
      test('pasDeSalle : une séance du 28 février 2026 est dans la fenêtre de 24 mois du 29 février 2028 (setUTCMonth l’en sortait)', () => {
        const une = (kg, d) => ({ debut: d.toISOString(), palier: kg, retenues: [{ charge_kg: kg, reps: 5 }], votantes: [{ charge_kg: kg, reps: 5 }] });
        const avantT = new Date(2028, 1, 29, 12, 0);
        // deux charges distinctes seulement si la séance du 28 février 2026 à 13 h (APRÈS la borne du 28 février à 12 h) est dans la fenêtre
        const recentes = [une(100, new Date(2027, 5, 1, 10, 0)), une(100, new Date(2027, 8, 1, 10, 0))];
        const ancienne = une(102.5, new Date(2026, 1, 28, 13, 0));
        expect(Mo.pasDeSalle([ancienne].concat(recentes), avantT.toISOString())).not.toBeNull();
        expect(Mo.pasDeSalle(recentes, avantT.toISOString())).toBeNull();     // témoin : sans elle, une seule charge, aucun pas
        // et une séance du 27 février 2026 est dehors
        expect(Mo.pasDeSalle([une(102.5, new Date(2026, 1, 27, 13, 0))].concat(recentes), avantT.toISOString())).toBeNull();
      });
    });

    describe('I185 — faits.exercicesRecents (« les plus faits » sur 3 mois) lit la même borne', () => {
      const CAT = [{ slug: 'squat_barre', nom: 'Squat (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['quadriceps'] }];
      const corpus = (debut) => {
        const index = M.indexerExercices(CAT);
        const series = [{ id: 'a-0', session_id: 'a', type_serie: 'travail', rang: 0, exercise_slug: 'squat_barre', charge_kg: 100, reps: 5 }];
        return { seances: [{ id: 'a', debut: debut.toISOString(), fin: null }], series, exercices: CAT,
          seriesDe: (id) => (id === 'a' ? series : []), catalogue: () => index, journal: [] };
      };
      test('31 mai 2026 à midi : une séance du 28 février 2026 à 13 h compte (setMonth : la borne était le 3 mars)', () => {
        const f = require('../../v2/js/faits.js').creer();
        expect(f.exercicesRecents(corpus(new Date(2026, 1, 28, 13, 0)), new Date(2026, 4, 31, 12, 0), null).plusFaits).toEqual(['squat_barre']);
      });
      test('et une séance du 27 février 2026 ne compte pas', () => {
        const f = require('../../v2/js/faits.js').creer();
        expect(f.exercicesRecents(corpus(new Date(2026, 1, 27, 13, 0)), new Date(2026, 4, 31, 12, 0), null).plusFaits).toEqual([]);
      });
    });

    describe('I185 — l’objectif : la référence « il y a un an »', () => {
      let n = 0;
      const seance = (j, series) => {
        const id = 'o' + (++n); const [a, m, d] = j.split('-').map(Number);
        return { id, debut: new Date(a, m - 1, d, 18, 0, 0).toISOString(),
          series: series.map(([c, r], i) => ({ id: id + '-' + i, session_id: id, exercise_slug: 'squat', charge_kg: c, reps: r,
            type_serie: 'travail', rang: i + 1, validee_a: null })) };
      };
      test('maintenant = 29 février 2028 : la référence est datée du 28 février 2027 (setFullYear : le 1er mars)', () => {
        const BARRE = M.optionsDeRecord({ mesure: 'charge_reps', charge: 'externe', equipement: 'barre' });
        const p = O.projection({
          seances: [seance('2026-09-01', [[130, 1]]), seance('2027-01-01', [[132.5, 1]]), seance('2027-09-01', [[137.5, 1]]),
            seance('2027-12-01', [[140, 1]]), seance('2028-02-01', [[144, 1]])],
          charge: 150, reps: 1, maintenant: new Date(2028, 1, 29, 12, 0, 0), anciennete: null, options: BARRE });
        expect(p.reference).toEqual({ charge: 132.5, le: '2027-02-28' });
      });
    });

    describe('I185 — le social : la fenêtre « 12 mois » et « 3 mois » comme la base (le lendemain du même jour)', () => {
      test('bornesDouzeMois : 29 février 2028 → du 1er mars 2027', () => {
        expect(Social.bornesDouzeMois(new Date(2028, 1, 29, 12, 0))).toEqual({ de: '2027-03-01', a: '2028-02-29' });
      });
      test('bornesDouzeMois : 15 novembre 2026 → du 16 novembre 2025 (inchangé hors fin de mois)', () => {
        expect(Social.bornesDouzeMois(new Date(2026, 10, 15, 12, 0))).toEqual({ de: '2025-11-16', a: '2026-11-15' });
      });
      test('bornesDePeriode(3mois) : 31 mai 2026 → du 1er mars 2026 (new Date(y, m − 3, d + 1) : le 4 mars)', () => {
        expect(Social.bornesDePeriode('3mois', new Date(2026, 4, 31, 12, 0))).toEqual({ de: '2026-03-01', a: '2026-05-31' });
      });
      test('bornesDePeriode : le mois et l’année ne bougent pas', () => {
        expect(Social.bornesDePeriode('mois', new Date(2026, 4, 31, 12, 0))).toEqual({ de: '2026-05-01', a: '2026-05-31' });
        expect(Social.bornesDePeriode('annee', new Date(2026, 4, 31, 12, 0))).toEqual({ de: '2026-01-01', a: '2026-05-31' });
      });
      test('debutSixMois : le mois en cours et les 5 d’avant, premier du mois', () => {
        expect(jour(Social.debutSixMois(new Date(2026, 4, 31, 12, 0)))).toBe('2025-12-01');
        expect(jour(Social.debutSixMois(new Date(2026, 1, 28, 12, 0)))).toBe('2025-09-01');
      });
    });

    describe('I185 — le Poids : « 3 mois » et « 1 an » sont des mois civils, comme le social', () => {
      const pesees = (jours) => jours.map((j) => ({ date: j, poids: 80 }));
      const lignes = (js) => js.map((j) => { const [a, m, d] = j.split('-').map(Number); return { date: new Date(a, m - 1, d, 8, 0), poids: 80, jour: j }; });
      test('PERIODES : les mois, pas les jours', () => {
        expect(Poids.PERIODES.map((p) => [p.cle, p.mois])).toEqual([['3mois', 3], ['1an', 12], ['tout', null]]);
        Poids.PERIODES.forEach((p) => expect(p.jours).toBeUndefined());
      });
      test('1 an au 29 février 2028 : la fenêtre commence le 1er mars 2027', () => {
        const dedans = Poids.filtrer(lignes(['2027-02-28', '2027-03-01', '2028-02-29']), 12, new Date(2028, 1, 29, 12, 0));
        expect(dedans.map((p) => jour(p.date))).toEqual(['2027-03-01', '2028-02-29']);
      });
      test('3 mois au 31 mai 2026 : la fenêtre commence le 1er mars 2026', () => {
        const dedans = Poids.filtrer(lignes(['2026-02-28', '2026-03-01', '2026-05-31']), 3, new Date(2026, 4, 31, 12, 0));
        expect(dedans.map((p) => jour(p.date))).toEqual(['2026-03-01', '2026-05-31']);
      });
      test('« Tout » ne filtre rien', () => {
        expect(Poids.filtrer(lignes(['2000-01-01', '2026-05-31']), null, new Date(2026, 4, 31, 12, 0))).toHaveLength(2);
      });
      void pesees;
    });
  });
});

// 84 (12/10/2026) — UNE SÉANCE VIVANTE D'UN AUTRE APPAREIL NE SE FERME NI NE SE
// REPREND EN SILENCE (ECRAN-SAISIE §7 duovicies.1 ter).
//
// Vivante : `en_cours`, et sa dernière série validée (`validee_a`) — à défaut son
// début — date de MOINS de 45 minutes. Pure : « maintenant » est un paramètre.
const Modele = require('../../v2/js/modele.js');
const S = require('../../v2/js/seance.js');

const MAINTENANT = '2026-10-12T18:00:00.000Z';
const ilYa = (min) => new Date(Date.parse(MAINTENANT) - min * 60000).toISOString();
const ligne = (debutMin, autre) => Object.assign({ id: 'x', statut: 'en_cours', titre: 'Pecs - Dos', debut: ilYa(debutMin) }, autre || {});
const serie = (min) => ({ id: 's' + min, validee_a: ilYa(min) });

describe('84 — `Seance.estVivante` : moins de 45 minutes depuis la dernière activité', () => {
  test('la constante : 45 minutes', () => {
    expect(S.MINUTES_VIVANTE).toBe(45);
  });

  test('dernière série à −44 min → vivante ; −46 min → abandonnée', () => {
    expect(S.estVivante(ligne(90), [serie(80), serie(44)], MAINTENANT)).toBe(true);
    expect(S.estVivante(ligne(90), [serie(80), serie(46)], MAINTENANT)).toBe(false);
  });

  test('sans série : le début — −10 min → vivante ; −60 min → abandonnée', () => {
    expect(S.estVivante(ligne(10), [], MAINTENANT)).toBe(true);
    expect(S.estVivante(ligne(60), [], MAINTENANT)).toBe(false);
  });

  test('⚠️ exactement 45 min → abandonnée (strict « moins de »)', () => {
    expect(S.estVivante(ligne(90), [serie(45)], MAINTENANT)).toBe(false);
    expect(S.estVivante(ligne(45), [], MAINTENANT)).toBe(false);
  });

  test('la plus RÉCENTE des séries compte, pas la dernière de la liste ; une série sans `validee_a` ne compte pas', () => {
    expect(S.estVivante(ligne(90), [serie(10), serie(80)], MAINTENANT)).toBe(true);
    expect(S.estVivante(ligne(90), [{ id: 'z', validee_a: null }], MAINTENANT)).toBe(false);
  });

  test('une séance terminée n’est jamais vivante', () => {
    expect(S.estVivante(ligne(5, { statut: 'terminee' }), [serie(1)], MAINTENANT)).toBe(false);
  });
});

describe('84 — les mots des deux feuilles (la maquette, au mot près)', () => {
  const h = (min) => Modele.heureMinute(ilYa(min));

  test('cas 1 — j’ouvre l’app, pas de séance ici : « La continuer ici » / « Pas maintenant »', () => {
    expect(S.feuilleAutreAppareil(ligne(90), [serie(80), serie(20)], 'reprendre')).toEqual({
      titre: 'Une séance est en cours sur un autre appareil',
      aide: 'Pecs - Dos · dernière série à ' + h(20) + '.',
      libelle: 'La continuer ici', libelleAnnuler: 'Pas maintenant'
    });
  });

  test('cas 2 — je commence une séance : « La terminer et commencer » / « Annuler »', () => {
    expect(S.feuilleAutreAppareil(ligne(90), [serie(20)], 'commencer')).toEqual({
      titre: 'Une séance est en cours sur un autre appareil',
      aide: 'Pecs - Dos · dernière série à ' + h(20) + '. Une seule séance à la fois : la terminer pour commencer celle-ci ?',
      libelle: 'La terminer et commencer', libelleAnnuler: 'Annuler'
    });
  });

  test('sans série : « commencée à » ; sans titre : « Séance »', () => {
    expect(S.feuilleAutreAppareil(ligne(10, { titre: null }), [], 'reprendre').aide)
      .toBe('Séance · commencée à ' + h(10) + '.');
  });

  test('l’heure se dit « 18 h 40 » (le formateur du récap, à l’heure du téléphone)', () => {
    expect(h(20)).toMatch(/^\d{1,2} h \d{2}$/);
  });
});

/** @jest-environment node */
//
// PR 6 des mots (14/11/2026) — « les périodes disent vrai ». Les formateurs de période (`Modele.libelleDePeriode`,
// `Modele.plageDeJours`, `Modele.quandTexte` avec l'année) : G2.
//
// CONFIGURATIONS DISCRIMINANTES : J = 11/10/2026 (fixture du Parcours) ET J = 14/11/2026 ; une période qui CONTIENT J et la
// même qui ne le contient pas (« ce mois-ci » contre « en septembre ») ; une plage à cheval sur deux années ; un mois d'une
// autre année ; une semaine tronquée par un changement de mois.
require('../../v2/js/modele.js');
require('../../v2/js/periode.js');
const Modele = global.THModele;
const NB = ' ';

describe('G2 — Modele.libelleDePeriode : un nom de période ne s’écrit qu’ici', () => {
  const J = '2026-10-11';

  test('fenêtre datée : du 12 avr. au 11 oct. ; année sur les deux bornes si le début n’est pas de l’année de J', () => {
    expect(Modele.libelleDePeriode({ genre: 'fenetre', debut: '2026-04-12', fin: '2026-10-11' }, J)).toBe('du 12 avr. au 11 oct.');
    expect(Modele.libelleDePeriode({ genre: 'fenetre', debut: '2025-10-11', fin: '2026-04-11' }, J)).toBe('du 11 oct. 2025 au 11 avr. 2026');
    expect(Modele.libelleDePeriode({ genre: 'fenetre', debut: '2025-10-11', fin: '2026-10-11' }, J)).toBe('du 11 oct. 2025 au 11 oct. 2026');
  });

  test('jours comptés : « du 28 au 30 sept. », « du 1er au 4 oct. », « le 6 oct. », sans année dans l’année de J', () => {
    expect(Modele.libelleDePeriode({ genre: 'jours', debut: '2026-09-28', fin: '2026-09-30' }, J)).toBe('du 28 au 30 sept.');
    expect(Modele.libelleDePeriode({ genre: 'jours', debut: '2026-10-01', fin: '2026-10-04' }, J)).toBe('du 1er au 4 oct.');
    expect(Modele.libelleDePeriode({ genre: 'jours', debut: '2026-09-28', fin: '2026-10-04' }, J)).toBe('du 28 sept. au 4 oct.');
    expect(Modele.libelleDePeriode({ genre: 'jours', debut: '2026-10-06', fin: '2026-10-06' }, J)).toBe('le 6 oct.');
    expect(Modele.libelleDePeriode({ genre: 'jours', debut: '2025-07-06', fin: '2025-07-12' }, J)).toBe('du 6 au 12 juil. 2025');
  });

  test('semaine : « cette semaine » SEULEMENT si elle contient J, sinon la plage', () => {
    const courante = { genre: 'semaine', debut: '2026-10-05', fin: '2026-10-11' };
    const passee = { genre: 'semaine', debut: '2026-09-28', fin: '2026-10-04' };
    expect(Modele.libelleDePeriode(courante, J)).toBe('cette semaine');
    expect(Modele.libelleDePeriode(passee, J)).toBe('du 28 sept. au 4 oct.');
    expect(Modele.libelleDePeriode(courante, '2026-10-12')).toBe('du 5 au 11 oct.');   // le lundi suivant : la semaine n'est plus « cette semaine »
  });

  test('mois : phrase (« ce mois-ci » / « en septembre » / « en septembre 2025 »), pied (« oct. 2026 (en cours) »), axe', () => {
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10' }, J)).toBe('ce mois-ci');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-09' }, J)).toBe('en septembre');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2025-09' }, J)).toBe('en septembre 2025');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10', forme: 'pied' }, J)).toBe('oct. 2026 (en cours)');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-09', forme: 'pied' }, J)).toBe('sept. 2026');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2024-03', forme: 'pied' }, J)).toBe('mars 2024');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10', forme: 'axe' }, J)).toBe('oct. 2026');   // l'axe ne dit jamais « en cours »
  });

  test('le même mois, J changé : le 1er octobre « septembre » est encore septembre, le 1er novembre « octobre » ne l’est plus « ce mois-ci »', () => {
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10' }, '2026-11-01')).toBe('en octobre');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10' }, '2026-10-31')).toBe('ce mois-ci');
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10' }, new Date(2026, 9, 31, 23, 59))).toBe('ce mois-ci');
  });

  test('année et saison : « cette année » / « en 2025 » ; « cet été » / « en été » selon que J est dans la saison', () => {
    expect(Modele.libelleDePeriode({ genre: 'annee', cle: '2026' }, J)).toBe('cette année');
    expect(Modele.libelleDePeriode({ genre: 'annee', cle: '2025' }, J)).toBe('en 2025');
    const ete = { genre: 'saison', ce: 'cet été', en: 'en été', debut: '2026-06-01', fin: '2026-08-31' };
    expect(Modele.libelleDePeriode(ete, '2026-08-31')).toBe('cet été');
    expect(Modele.libelleDePeriode(ete, J)).toBe('en été');
    const hiver = { genre: 'saison', ce: 'cet hiver', en: 'en hiver', debut: '2025-12-01', fin: '2026-02-28' };
    expect(Modele.libelleDePeriode(hiver, '2026-01-15')).toBe('cet hiver');   // l'hiver chevauche deux années
    expect(Modele.libelleDePeriode(hiver, '2026-03-01')).toBe('en hiver');
  });

  test('sans jour lisible : jamais « ce / cette », toujours la période nommée', () => {
    expect(Modele.libelleDePeriode({ genre: 'mois', cle: '2026-10' }, null)).toBe('en octobre');
    expect(Modele.libelleDePeriode({ genre: 'semaine', debut: '2026-10-05', fin: '2026-10-11' }, null)).toBe('du 5 au 11 oct.');
    expect(Modele.libelleDePeriode(null, J)).toBe('');
    expect(Modele.libelleDePeriode({ genre: 'inconnu' }, J)).toBe('');
  });
});

describe('Q7 — Modele.quand : une date d’une autre année porte son année', () => {
  test('« le 12 mars 2025 » pour une référence de 2026 ; sans référence, inchangé', () => {
    expect(Modele.quand('2025-03-12T10:00:00+01:00', '2026-10-11T10:00:00+02:00')).toBe('le 12' + NB + 'mars 2025');
    expect(Modele.quand('2026-03-12T10:00:00+01:00', '2026-10-11T10:00:00+02:00')).toBe('le 12' + NB + 'mars');
    expect(Modele.quand('2025-03-12T10:00:00+01:00')).toBe('le 12' + NB + 'mars');
    expect(Modele.quand('2025-12-30T10:00:00+01:00', '2026-01-02T10:00:00+01:00')).toBe('mardi');   // 3 jours : le nom du jour
  });
});

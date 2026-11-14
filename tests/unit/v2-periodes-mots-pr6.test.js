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

describe('B7 — Modele.phraseDeSemaineVide : « cette semaine » seulement si la semaine contient J', () => {
  const J = new Date(2026, 10, 14, 10);   // samedi 14/11/2026 : la semaine du lundi 9 au dimanche 15
  test('la semaine courante : « Aucune séance cette semaine. »', () => {
    expect(Modele.phraseDeSemaineVide(new Date(2026, 10, 9), new Date(2026, 10, 15), J)).toBe('Aucune séance cette semaine.');
  });
  test('une semaine passée : ses dates (même mois, mois différents, autre année)', () => {
    expect(Modele.phraseDeSemaineVide(new Date(2026, 6, 6), new Date(2026, 6, 12), J)).toBe('Aucune séance du 6 au 12 juil.');
    expect(Modele.phraseDeSemaineVide(new Date(2026, 8, 28), new Date(2026, 9, 4), J)).toBe('Aucune séance du 28 sept. au 4 oct.');
    expect(Modele.phraseDeSemaineVide(new Date(2025, 11, 29), new Date(2026, 0, 4), J)).toBe('Aucune séance du 29 déc. 2025 au 4 janv. 2026.');
  });
  test('la semaine de J, vue le lundi suivant : plus « cette semaine »', () => {
    expect(Modele.phraseDeSemaineVide(new Date(2026, 10, 9), new Date(2026, 10, 15), new Date(2026, 10, 16, 8))).toBe('Aucune séance du 9 au 15 nov.');
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

describe('Bilans.periodeDesDerniersMois : « 6 derniers mois » = la fenêtre de 183 jours de `THPeriode`', () => {
  require('../../v2/js/bilans.js');
  const Bilans = global.THBilans;
  test('à J = 11/10/2026 : du 12 avr. au 11 oct., contre du 11 oct. 2025 au 11 avr. 2026', () => {
    const p = Bilans.periodeDesDerniersMois(6, '2026-10-11');
    expect([p.debut, p.fin]).toEqual(['2026-04-12', '2026-10-11']);
    expect([p.precedente.debut, p.precedente.fin]).toEqual(['2025-10-11', '2026-04-11']);
    expect(p.libelle).toBe('6 derniers mois');
  });
  test('un 31 : plus de « N mois pile » — la fenêtre reste de 183 jours (J = 31/08/2026 : du 2 mars)', () => {
    const p = Bilans.periodeDesDerniersMois(6, '2026-08-31');
    expect([p.debut, p.precedente.fin]).toEqual(['2026-03-02', '2026-03-01']);
  });
  test('un jour illisible : rien', () => {
    expect(Bilans.periodeDesDerniersMois(6, 'demain')).toBeNull();
  });
});

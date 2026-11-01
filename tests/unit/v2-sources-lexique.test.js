/** @jest-environment node */
//
// 201 — D'OÙ ÇA VIENT, ET LES MOTS DU COACH (MOTEUR §9.38).
//
//   · le registre `SOURCES` : des types connus, une étude dit son auteur, son année, son effectif ;
//   · HONNÊTETÉ : aucun texte de source ne dit « prouvé », « garanti » ou « toujours » ;
//   · les règles sans source sont LISTÉES (un rapport, pas un échec) ;
//   · le lexique : la liste fixe, une phrase chacun, les sources résolues ;
//   · le « Pourquoi » ne porte une ligne « D'où ça vient » que pour une règle qui a une source.

global.self = global;
const fs = require('fs');
const path = require('path');
require('../../v2/js/modele.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const INTERDITS = /prouv|garanti|toujours/i;
const toutes = () => Object.keys(M.SOURCES).reduce((a, k) => a.concat(M.sourcesDe(k).map((s) => Object.assign({ cle: k }, s))), []);

describe('201 — le registre SOURCES', () => {
  test('chaque entrée a un texte, un type connu et son étiquette', () => {
    const t = toutes();
    expect(t.length).toBeGreaterThan(10);
    t.forEach((s) => {
      expect([s.cle, typeof s.texte === 'string' && s.texte.length > 10]).toEqual([s.cle, true]);
      expect([s.cle, Object.keys(M.TYPES_DE_SOURCE).indexOf(s.type) >= 0]).toEqual([s.cle, true]);
      expect(s.etiquette).toBe(M.TYPES_DE_SOURCE[s.type]);
    });
    expect(M.TYPES_DE_SOURCE).toEqual({ etude: 'Étude', coachs: 'Pratique de coachs', convention: 'Convention' });
  });

  test('une étude dit son auteur, son année et son effectif, et le texte les cite', () => {
    toutes().filter((s) => s.type === 'etude').forEach((s) => {
      expect([s.cle, !!s.auteur, typeof s.annee === 'number', !!s.effectif]).toEqual([s.cle, true, true, true]);
      expect([s.cle, s.texte.indexOf(String(s.annee)) >= 0, s.texte.indexOf(s.auteur) >= 0]).toEqual([s.cle, true, true]);
    });
  });

  test('une pratique de coachs dit qui ; une convention se dit convention', () => {
    toutes().filter((s) => s.type === 'coachs').forEach((s) => expect([s.cle, !!s.auteur]).toEqual([s.cle, true]));
    toutes().filter((s) => s.type === 'convention').forEach((s) => expect([s.cle, /choix de l.app/.test(s.texte)]).toEqual([s.cle, true]));
  });

  test('⚠️ HONNÊTETÉ : aucun texte de source ne dit « prouvé », « garanti » ou « toujours »', () => {
    expect(toutes().filter((s) => INTERDITS.test(s.texte)).map((s) => s.cle)).toEqual([]);
    M.lexique().forEach((m) => {
      expect([m.cle, INTERDITS.test(m.phrase)]).toEqual([m.cle, false]);
      m.sources.forEach((s) => expect([m.cle, INTERDITS.test(s.texte)]).toEqual([m.cle, false]));
    });
  });

  test('`sourcesDeRegles` : sans doublon, dans l\'ordre ; une clé sans entrée n\'ajoute rien (jamais devinée)', () => {
    const a = M.sourcesDeRegles(['reserve', 'inconnue', 'reserve', 'degressive']);
    expect(a.map((s) => s.auteur)).toEqual(['Refalo', 'Robinson', 'Sodal']);
    expect(M.sourcesDeRegles(['inconnue'])).toEqual([]);
    expect(M.sourcesDeRegles(null)).toEqual([]);
  });

  test('RAPPORT — les règles citées (regle(\'…\')) sans source au registre', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/moteur.js'), 'utf8');
    const cles = new Set();
    let m;
    const re = /regle\('([a-z_.0-9]+)'/g;
    while ((m = re.exec(src)) !== null) cles.add(m[1]);
    const sans = Array.from(cles).filter((c) => !Object.prototype.hasOwnProperty.call(M.SOURCES, c)).sort();
    // Un rapport : la liste sert à remplir le registre quand une source est LUE, jamais à en inventer.
    // eslint-disable-next-line no-console
    console.log('201 — règles sans source (' + sans.length + '/' + cles.size + ') : ' + sans.join(', '));
    expect(Array.isArray(sans)).toBe(true);
  });
});

describe('201 — le lexique', () => {
  const ATTENDUS = ['zone', 'palier', 'recul', 'max_du_jour', 'max_estime', 'au_max', 'cinq_plus', 'garde', 'allegee', 'phase', 'semaine_de_test',
    'marche', 'figure', 'rest_pause', 'zone_a_menager'];
  test('la liste fixe, une phrase chacun, dans l\'ordre', () => {
    const l = M.lexique();
    expect(l.map((m) => m.cle)).toEqual(ATTENDUS);
    l.forEach((m) => {
      expect([m.cle, m.mot.length > 0, m.phrase.length > 10]).toEqual([m.cle, true, true]);
      expect([m.cle, /bravo|prouv|e1RM|1RM/i.test(m.phrase)]).toEqual([m.cle, false]);
    });
  });
  test('la zone dit les bornes du moteur, pas des siennes', () => {
    const z = M.motDuLexique('zone').phrase;
    M.ZONES.forEach((x) => expect(z.indexOf(x.libelle + ' ' + x.bas + '-' + x.haut) >= 0).toBe(true));
  });
  test('« Garde N » prend son N (« garde 1 » : une rep possible), avec la source de Refalo', () => {
    const g1 = M.motDuLexique('garde', 1), g2 = M.motDuLexique('garde', 2);
    expect(g1.mot).toBe('Garde 1');
    expect(g1.phrase).toMatch(/il te reste 1 rep possible\./);
    expect(g2.phrase).toMatch(/il te reste 2 reps possibles\./);
    expect(g1.sources[0].auteur).toBe('Refalo');
    expect(M.motDuLexique('garde').mot).toBe('Garde N');
    expect(M.motDuLexique('inconnu')).toBeNull();
  });
  test('les mots qui ont une source la résolvent ; les autres n\'en inventent pas', () => {
    expect(M.motDuLexique('au_max').sources[0].type).toBe('coachs');
    expect(M.motDuLexique('phase').sources[0].type).toBe('convention');
    expect(M.motDuLexique('palier').sources).toEqual([]);
    expect(M.motDuLexique('figure').sources).toEqual([]);
  });
  test('toute clé `source` du lexique existe au registre', () => {
    M.LEXIQUE.filter((m) => m.source).forEach((m) => expect([m.cle, M.sourcesDe(m.source).length > 0]).toEqual([m.cle, true]));
  });
});

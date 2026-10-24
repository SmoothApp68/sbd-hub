/** @jest-environment node */
//
// 135 puis 143 — LES DÉLAIS FIXES DES BANCS : ON N'EN AJOUTE PLUS, ET CEUX QUI RESTENT DISENT POURQUOI.
//
// Un délai fixe (`attendre(900)`) est calibré sur la machine où on l'écrit. Sous charge (deux ou trois agents,
// six navigateurs pour deux cœurs), il devient une intermittence : le contrôle lit l'écran d'avant. Au 135, les
// bancs des routines, de la création du profil et du service worker attendent l'ÉTAT que lit le contrôle suivant ;
// ce qui y reste de délais fixes est marqué :
//   · « VOULU » (sur la ligne ou dans les trois au-dessus), SUIVI DE SON MOTIF : un vrai temps — le rythme d'un doigt
//     qui glisse, ou l'absence d'un évènement, qu'aucun état ne prouve (un envoi qui ne part pas, un rechargement qui
//     ne vient pas) ;
//   · « le pas d » : le pas d'une boucle qui lit l'état à chaque tour ;
//   · « plafond » : la borne d'une course (`Promise.race`) — l'état gagne dès qu'il vient ;
//   · « retenue » : une réponse que le faux serveur retient exprès — le délai est la mesure (143, type I du diagnostic) ;
//   · « temps réel » : un compte à rebours ou un délai de l'app qu'on observe (143, type K).
// Le banc de séance en garde encore des centaines : leur nombre ne peut que BAISSER, SECTION PAR SECTION (143 : un
// total seul laisse un lot en retirer trente ici et en poser trente là). Qui en retire baisse le plafond de sa section ;
// qui en ajoute fait échouer ce test.
//
// 143 — CE QUE LA GARDE VOIT, EN PLUS DES `attendre(900)` LITTÉRAUX : `attendre(expr)`, un délai par défaut
// (`pause || 350`), toute minuterie (`setTimeout(`, sous n'importe quel nom — `new Promise(… setTimeout …)`, ou dans
// un `page.evaluate`), et le second argument numérique d'un `cliquerQ/F/R(sel, 500)` (un délai posé au site d'appel).
const fs = require('fs');
const os = require('os');
const path = require('path');

const BANC = path.join(__dirname, '../banc');
const DELAI = /\b(attendre|pause)\(\s*\d+\s*\)|setTimeout\(\s*r\s*,\s*\d+\s*\)/;
const DELAI_ETENDU = [
  /\battendre\(\s*(?!\d+\s*\))[^)\s]/,         // attendre(expr)
  /\b(attendre|pause)\([^)]*\|\|\s*\d+/,        // un paramètre de délai à défaut
  /setTimeout\(/,                               // toute minuterie
  /\bcliquer[QFR]\([^)]*,\s*\d+\s*\)/           // un délai passé à un cliquerX
];
const DEFINITION = /=\s*(async\s*)?\(ms\)\s*=>/;
const SECTION = /console\.log\('\\n══ (.*?) ══'\)/;
const RAISON = /le pas d|plafond|retenue|temps réel/;
const MOTIF = /VOULU[^:—\n]{0,12}[:—]\s*\S.{5,}/;

// Les lignes qui portent un délai non marqué, avec la section qui les contient (lue sur la ligne `══` qui précède).
function delaisNusParSection(fichier, dossier) {
  const lignes = fs.readFileSync(path.join(dossier || BANC, fichier), 'utf8').split('\n');
  const nus = [];
  let section = '(préambule)';
  lignes.forEach((l, i) => {
    const m = SECTION.exec(l);
    if (m) section = m[1].split('.')[0].trim().replace(/\s+/g, '-');
    const code = l.replace(/\s\/\/.*$/, '');
    if (DEFINITION.test(l)) return;
    if (!(DELAI.test(code) || DELAI_ETENDU.some((r) => r.test(code)))) return;
    if (RAISON.test(l)) return;
    if (lignes.slice(Math.max(0, i - 3), i + 1).some((x) => /VOULU/.test(x))) return;
    nus.push({ section, texte: fichier + ':' + (i + 1) + '  ' + l.trim() });
  });
  return nus;
}
const delaisNus = (fichier, dossier) => delaisNusParSection(fichier, dossier).map((x) => x.texte);

// Chaque « VOULU » dit POURQUOI : sans motif écrit, c'est un délai nu qui se déguise.
function voulusSansMotif(fichier, dossier) {
  return fs.readFileSync(path.join(dossier || BANC, fichier), 'utf8').split('\n')
    .map((l, i) => ({ l, i }))
    .filter((x) => /VOULU/.test(x.l) && !MOTIF.test(x.l))
    .map((x) => fichier + ':' + (x.i + 1) + '  ' + x.l.trim());
}

const BANCS = ['routines-ecran.js', 'profil-creation.js', 'sw-navigation.js', 'journal-mesure.js'];

describe('135 — les délais fixes des bancs', () => {
  test.each(BANCS)(
    '⚠️ %s : aucun délai fixe sans sa raison (« VOULU : … », « le pas d », « plafond », « retenue », « temps réel »)', (f) => {
      expect(delaisNus(f)).toEqual([]);
    });

  test.each(BANCS.concat(['seance-ecran.js']))('⚠️ %s : un « VOULU » dit son motif', (f) => {
    expect(voulusSansMotif(f)).toEqual([]);
  });

  // 143 — LE POINT DE DÉPART RÉEL, SECTION PAR SECTION. Le total est la somme : 1 028 sites au 142 (1 000 littéraux que
  // la garde du 135 comptait, plus 28 qu'elle ne voyait pas : trois aides à délai par défaut, 25 `cliquerX(sel, N)`),
  // 1 020 une fois les huit `attendreQue` locaux rendus à l'unique du préambule (lot 0), 942 après les aides communes (lot 1). La section est lue sur la ligne
  // `══` qui précède. Une section absente de cette table n'a droit à AUCUN délai fixe.
  const PLAFONDS_PAR_SECTION = {
  'retrouver': 39, 'questionnaire': 38, 'cycles': 37, '7-nonies': 26, '115': 22, '7-septies': 20,
  '7-G-octodecies': 20, 'barre': 20, 'recap': 20, 'objectif': 18, '(préambule)': 17, '7-G-sexies': 17,
  '7-octovicies': 16, 'organiser': 16, 'jeu': 16, 'filtres': 16, 'deux-appareils': 16, '7-G-duovicies': 14,
  'remplacer': 14, '7-septvicies': 13, '7-G-novodecies': 13, '7-G-vicies': 13, 'progression': 12, 'recherche': 12,
  '5-ter': 11, '7-tertricies': 11, 'quitter': 11, 'rappel': 11, 'mesures': 11, 'elastiques': 11,
  '7-quatervicies': 10, '7-novovicies': 10, '7-duotricies': 10, '7-G-septies': 10, '7-G-quindecies': 10, 'forge': 10,
  'import-hevy': 10, 'echelle': 10, '7-sexdecies': 9, '7-quinquatricies': 9, 'a-fond': 9, '7-undecies': 8,
  '7-tricies': 8, '7-untricies': 8, '7-G-undecies': 8, '7-G-unvicies': 8, 'relecture': 8, 'construis': 8,
  '49': 7, '108': 7, '7-octodecies': 7, '47-bis': 7, '7-sexvicies': 7, '7-G-octies': 7,
  '7-G-septdecies': 7, '7': 6, '7-vicies': 6, '7-quinvicies': 6, '7-G-terdecies': 6, '7-G-duodecies': 6, 'report': 6,
  'famille': 6, 'ecarts': 6, 'degressive-proposee': 6, 'chauffes-ajoutees': 6, 'comment': 6, '7-terdecies': 5,
  '7-novodecies': 5, '7-G-quater': 5, 'annee': 5, '3': 4, '4-bis': 4, '4-ter': 4, '7-ter': 4, '7-quinquies': 4,
  '7-tervicies': 4, '7-G': 4, '7-G-quinquies': 4, '7-G-quaterdecies': 4, 'parcours': 4, 'charge-obligatoire': 4,
  'Q78': 4, 'deraille': 4, '5': 3, '7-quindecies': 3, '7-unvicies': 3, '7-quatertricies': 3, '7-G-decies': 3,
  'journal': 3, 'groupe': 3, 'case-vide': 3, 'mon-objectif': 3, '4': 2, '6': 2, '5-quater': 2, '7-sexies': 2,
  '7-quater': 2, '7-duodecies': 2, '7-G-ter': 2, '7-G-nonies': 2, 'social': 2, 'saison-mois': 2, '2': 1, '5-bis': 1,
  '7-octies': 1, '7-quaterdecies': 1, '7-G-sexdecies': 1, 'sans-marge': 1,
  };
  const PLAFOND_SEANCE = Object.keys(PLAFONDS_PAR_SECTION).reduce((n, k) => n + PLAFONDS_PAR_SECTION[k], 0);

  test('⚠️ seance-ecran.js : le nombre de délais fixes ne monte pas, section par section (il ne peut que baisser)', () => {
    const parSection = {};
    delaisNusParSection('seance-ecran.js').forEach((x) => { parSection[x.section] = (parSection[x.section] || 0) + 1; });
    const depasse = Object.keys(parSection)
      .filter((k) => parSection[k] > (PLAFONDS_PAR_SECTION[k] || 0))
      .map((k) => k + ' : ' + parSection[k] + ' pour ' + (PLAFONDS_PAR_SECTION[k] || 0) + ' permis');
    expect(depasse).toEqual([]);
  });

  test('⚠️ seance-ecran.js : le total ne monte pas non plus', () => {
    expect(delaisNus('seance-ecran.js').length).toBeLessThanOrEqual(PLAFOND_SEANCE);
  });

  test('⚠️ chaque section a son plafond : une section qui ne porte plus de délai en garde un (le cliquet descend)', () => {
    const parSection = {};
    delaisNusParSection('seance-ecran.js').forEach((x) => { parSection[x.section] = (parSection[x.section] || 0) + 1; });
    const trop = Object.keys(PLAFONDS_PAR_SECTION)
      .filter((k) => (parSection[k] || 0) < PLAFONDS_PAR_SECTION[k])
      .map((k) => k + ' : ' + (parSection[k] || 0) + ' pour ' + PLAFONDS_PAR_SECTION[k] + ' permis — baisse le plafond');
    expect(trop).toEqual([]);
  });

  // 143 — UNE AIDE D'ATTENTE SE DÉCLARE UNE FOIS (`attendreQue` l'était huit fois, avec des pas et des budgets
  // différents) : un doublon se corrige à un endroit et dérive aux sept autres.
  const AIDES_UNIQUES = ['attendreQue', 'jusqua', 'serieMontee', 'enBase', 'fileVide', 'feuilleOuverte', 'feuilleFermee',
    'vueAffichee', 'texteVaut', 'seanceSortie', 'reseauCalme', 'ecranPose', 'brouillonPose', 'calmeApres', 'departGeste'];
  const declarations = (texte, nom) => (texte.match(new RegExp('^\\s*(const|let|function|async function)\\s+' + nom + '\\b', 'gm')) || []).length;
  test('⚠️ seance-ecran.js : chaque aide d’attente n’est déclarée qu’une fois', () => {
    const texte = fs.readFileSync(path.join(BANC, 'seance-ecran.js'), 'utf8');
    const doubles = AIDES_UNIQUES.filter((n) => declarations(texte, n) !== 1).map((n) => n + ' ×' + declarations(texte, n));
    expect(doubles).toEqual([]);
  });

  test('la garde voit vraiment un délai nu, et accepte un délai marqué', () => {
    // Hors de `tests/banc` : un fichier de passage y serait vu par les autres gardes qui parcourent le dépôt.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'delais-'));
    const essai = (texte) => {
      fs.writeFileSync(path.join(dossier, 'essai.js'), texte);
      return delaisNus('essai.js', dossier).length;
    };
    const sections = (texte) => {
      fs.writeFileSync(path.join(dossier, 'essai.js'), texte);
      return delaisNusParSection('essai.js', dossier).map((x) => x.section);
    };
    expect(essai("const attendre = (ms) => new Promise((r) => setTimeout(r, ms));\n")).toBe(0);
    expect(essai("  await attendre(900);\n")).toBe(1);
    expect(essai("  await new Promise((r) => setTimeout(r, 500));\n")).toBe(1);
    expect(essai("  // VOULU : le rythme d'un doigt\n  await attendre(18);\n")).toBe(0);
    expect(essai("    await attendre(200);   // le pas d'une attente d'état\n")).toBe(0);
    // 143 — ce que la garde ne voyait pas
    expect(essai("  await attendre(delai);\n")).toBe(1);
    expect(essai("  await attendre(LENTEUR_Q + 2000);\n")).toBe(1);
    expect(essai("  const cliquerQ = async (sel, pause) => { await attendre(pause || 350); };\n")).toBe(1);
    expect(essai("  await new Promise((fin) => setTimeout(fin, delai));\n")).toBe(1);
    expect(essai("  await page.evaluate(() => new Promise((f) => setTimeout(f, 300)));\n")).toBe(1);
    expect(essai("  await cliquerQ('.q-continuer', 500);\n")).toBe(1);
    expect(essai("  await cliquerQ('.q-continuer');\n")).toBe(0);
    expect(essai("  await attendre(2600);   // retenue : la réponse est retenue exprès\n")).toBe(0);
    expect(essai("  await attendre(20000);   // temps réel : le compte à rebours observé\n")).toBe(0);
    // la section est lue sur la ligne `══` qui précède
    expect(sections("  console.log('\\n══ 7 nonies. LA DÉVIATION ══');\n  await attendre(900);\n")).toEqual(['7-nonies']);
    expect(sections("  await attendre(900);\n")).toEqual(['(préambule)']);
  });

  test('la garde refuse un « VOULU » sans motif, et un doublon d’aide', () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'delais-'));
    const voulu = (texte) => {
      fs.writeFileSync(path.join(dossier, 'essai.js'), texte);
      return voulusSansMotif('essai.js', dossier).length;
    };
    expect(voulu("  await attendre(18);   // VOULU\n")).toBe(1);
    expect(voulu("  await attendre(18);   // VOULU :\n")).toBe(1);
    expect(voulu("  await attendre(18);   // VOULU : le rythme d'un doigt\n")).toBe(0);
    expect(voulu("  await attendre(18);   // VOULU (135) : le rythme d'un doigt\n")).toBe(0);
    expect(declarations("  const attendreQue = async () => 1;\n    const attendreQue = async () => 2;\n", 'attendreQue')).toBe(2);
    expect(declarations("  const attendreQueLe = 1;\n", 'attendreQue')).toBe(0);
  });
});

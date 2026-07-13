// Coach étape 5 — budget de blocs. Caractérisation structurelle de
// renderCoachTodayHTML (fonction DOM-lourde → source-asserts + logique
// d'ordonnancement extraite et testée en vm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

function fnBody(name) {
  const m = APP.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!m) throw new Error('NOT FOUND: ' + name);
  let depth = 0, i = APP.indexOf('{', m.index), started = false;
  for (; i < APP.length; i++) {
    if (APP[i] === '{') { depth++; started = true; }
    else if (APP[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
  }
  return APP.slice(m.index, i);
}
const BODY = fnBody('renderCoachTodayHTML');

describe('budget de blocs — structure', () => {
  test('cap = 6 (constante) + collecteur _pushCard présents', () => {
    expect(BODY).toContain('var COACH_CARD_CAP = 6;');
    expect(BODY).toContain('function _pushCard(pri, frag)');
  });
  test('P1 sécurité reste en html += direct (jamais dans les cartes)', () => {
    // le verdict et le bouton deload ne passent PAS par _pushCard
    expect(BODY).toContain('html += renderIntensityVerdictCard(_verdict, _intensityCtx);');
    expect(BODY).toContain("html += '<div class=\"coach-deload\">'");
    expect(BODY).not.toContain('_pushCard(1,'); // pas de priorité 1 dans le collecteur
  });
  test('tri stable (pri puis seq) + slice au cap + Voir plus', () => {
    expect(BODY).toContain('a.pri - b.pri || a.seq - b.seq');
    expect(BODY).toContain('_sorted.slice(0, COACH_CARD_CAP)');
    expect(BODY).toContain('Voir plus (');
  });
  test('toggle en mémoire seulement — _coachShowMore jamais écrit dans db', () => {
    expect(APP).toContain('var _coachShowMore = false;');
    expect(/db\.[a-zA-Z_.]*coachShowMore/.test(APP)).toBe(false);
    expect(APP.includes("_coachShowMore=true;renderCoachToday()")).toBe(true);
  });
  test('Tendance SBD retirée du Coach (classe coach-sbd absente du render)', () => {
    expect(BODY).not.toContain('coach-sbd'); // le bloc émetteur est parti
    expect(BODY).not.toContain('📈 Tendance SBD'); // le titre émis (le commentaire de retrait reste)
  });
  test('volume 1× : jauge coach-gauges retirée, carte unique avec header + under/over migrés', () => {
    expect(BODY).not.toContain("'<div class=\"coach-gauges\">'");
    expect(BODY).toContain('💪 Volume / semaine');
    expect(BODY.indexOf('Volume insuffisant')).toBeGreaterThan(-1);
    // les items volume ne sont plus des recos : ils vivent dans _voHtml
    const recoZone = BODY.slice(BODY.indexOf('recos.push({ dot'), BODY.indexOf('_rcHtml'));
    expect(recoZone).not.toContain('Volume insuffisant');
    expect(recoZone).not.toContain('Survolume');
  });
  test('carte activité unifiée (cap 1) : un seul HEADER de carte 🏃 Activités', () => {
    // header exact de la carte (le label « 🏃 Activités X% » du Budget Récup est distinct)
    expect((BODY.match(/>🏃 Activités<\/div>/g) || []).length).toBe(1);
  });
});

describe('ordonnanceur — logique de tri/cap (extraite, comportement)', () => {
  function schedule(cards, cap) {
    const sorted = cards.slice().sort((a, b) => a.pri - b.pri || a.seq - b.seq);
    return { visible: sorted.slice(0, cap), hidden: sorted.slice(cap) };
  }
  const mk = (pri, seq) => ({ pri, seq, html: 'c' + pri + '-' + seq });
  test('P2 avant P3 avant P4, ordre d\'apparition préservé dans chaque priorité', () => {
    const cards = [mk(3, 0), mk(2, 1), mk(4, 2), mk(2, 3), mk(3, 4)];
    const r = schedule(cards, 6);
    expect(r.visible.map(c => c.html)).toEqual(['c2-1', 'c2-3', 'c3-0', 'c3-4', 'c4-2']);
  });
  test('cap 6 : 9 cartes → 6 visibles + 3 repliées (les P4 sautent en premier)', () => {
    const cards = [mk(2,0), mk(2,1), mk(3,2), mk(3,3), mk(3,4), mk(3,5), mk(4,6), mk(4,7), mk(4,8)];
    const r = schedule(cards, 6);
    expect(r.visible.length).toBe(6);
    expect(r.hidden.length).toBe(3);
    expect(r.hidden.every(c => c.pri === 4)).toBe(true);
  });
});

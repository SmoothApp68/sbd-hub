// Chantier 235 — le son de fin de repos : la cloche de fin de round (trois dings), WebAudio seul.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');

function extraire(nom) {
  const m = APP.match(new RegExp('^  function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
}

function monter({ sourdine = false, ctx = true, vibreur = true } = {}) {
  const journal = { oscs: [], gains: [], vibrations: [] };
  const audio = {
    currentTime: 10, destination: { id: 'dest' }, state: 'running',
    createOscillator() {
      const o = { type: '', frequency: { value: 0 }, starts: [], stops: [], connect(x) { o.vers = x; }, start(t) { o.starts.push(t); }, stop(t) { o.stops.push(t); } };
      journal.oscs.push(o); return o;
    },
    createGain() {
      const g = { gain: { value: 1, rampes: [], setValueAtTime() {}, exponentialRampToValueAtTime(v, t) { g.gain.rampes.push([v, t]); } }, connect(x) { g.vers = x; } };
      journal.gains.push(g); return g;
    }
  };
  const racine = {
    AudioContext: function () { return audio; },
    navigator: vibreur ? { vibrate: (d) => { journal.vibrations.push(d); return true; } } : {}
  };
  const code = [
    'var sourdine = ' + sourdine + '; var audio = null; var racine = this.racine;',
    'var VIBRATION_VALIDATION = 35;',
    (APP.match(/^  var VIBRATION_ECHEANCE = .*$/m) || [''])[0],
    ctx ? extraire('contexteAudio') : 'function contexteAudio() { return null; }',
    extraire('sonnerCloche'), extraire('vibrer'), extraire('signalerEcheance'),
    'this.signalerEcheance = signalerEcheance;'
  ].join('\n');
  const sandbox = { racine, console: { warn() {} } };
  vm.runInNewContext(code, sandbox);
  return { signaler: sandbox.signalerEcheance, journal };
}

test('trois dings aux bons instants, trois partiels de cloche chacun', () => {
  const { signaler, journal } = monter();
  signaler();
  expect(journal.oscs).toHaveLength(9);
  const departs = [...new Set(journal.oscs.map((o) => o.starts[0]))].map((t) => +(t - 10).toFixed(2));
  expect(departs).toEqual([0, 0.35, 0.7]);
  for (let d = 0; d < 3; d++) {
    const f = journal.oscs.slice(d * 3, d * 3 + 3).map((o) => o.frequency.value);
    expect(f[0]).toBeCloseTo(1320, 5);
    expect(f[1]).toBeCloseTo(1320 * 2.76, 5);
    expect(f[2]).toBeCloseTo(1320 * 5.4, 5);
  }
  journal.oscs.forEach((o) => { expect(o.type).toBe('sine'); expect(o.stops[0]).toBeGreaterThan(o.starts[0] + 0.6); });
});

test('gain de crête 0,9 par ding, attaque 5 ms, partiels plus faibles, aucune saturation', () => {
  const { signaler, journal } = monter();
  signaler();
  const maitres = journal.gains.filter((g) => g.vers && g.vers.id === 'dest');
  expect(maitres).toHaveLength(3);
  maitres.forEach((g, i) => {
    expect(g.gain.rampes[0][0]).toBeCloseTo(0.9, 5);
    expect(g.gain.rampes[0][1] - (10 + [0, 0.35, 0.7][i])).toBeCloseTo(0.005, 5);
    expect(g.gain.rampes[1][0]).toBeLessThan(0.001);
    expect(g.gain.rampes[1][1] - g.gain.rampes[0][1]).toBeCloseTo(0.6, 5);
  });
  const poids = journal.oscs.slice(0, 3).map((o) => o.vers.gain.value);
  expect(poids[0]).toBeGreaterThan(poids[1]); expect(poids[1]).toBeGreaterThan(poids[2]);
  expect(poids.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1.0000001);
  expect(0.9 * poids.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(0.9000001);
});

test('vibration en trois temps alignée sur les dings', () => {
  const { signaler, journal } = monter();
  signaler();
  expect(journal.vibrations).toEqual([[200, 150, 200, 150, 200]]);
});

test('sourdine : pas de son, la vibration reste', () => {
  const { signaler, journal } = monter({ sourdine: true });
  signaler();
  expect(journal.oscs).toHaveLength(0);
  expect(journal.vibrations).toHaveLength(1);
});

test('sans AudioContext ou sans vibreur : rien ne casse', () => {
  expect(() => monter({ ctx: false }).signaler()).not.toThrow();
  expect(() => monter({ vibreur: false }).signaler()).not.toThrow();
});

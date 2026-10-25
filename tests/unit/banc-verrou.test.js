/** @jest-environment node */
//
// 168 — DEUX BANCS NE TOURNENT JAMAIS ENSEMBLE, ET AUCUN PORT N'EST FIXE.
// Le verrou (tests/banc/verrou.js) : pris, attendu, repris si son PID est mort, rendu à la sortie même sur exception,
// jamais d'interblocage sous un parent qui le tient. Et les serveurs de banc écoutent sur un port libre.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const V = require('../banc/verrou.js');
const { creer } = require('../../v2-atelier/banc/serveur-pages.js');

const VERROU_JS = path.join(__dirname, '../banc/verrou.js');
const frais = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verrou-test-')), 'v.verrou');
const opt = (fichier, plus) => Object.assign({ fichier, env: {}, surSortie: false, pas: 20, dire: () => {} }, plus || {});

// Un PID mort, sûr : un processus lancé puis fini.
function pidMort() { return spawnSync(process.execPath, ['-e', '0']).pid; }

describe('168 — le verrou des bancs', () => {
  test('pris : le fichier porte notre PID, rendu : il disparaît', async () => {
    const f = frais();
    const rendre = await V.prendre(opt(f));
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.pid));
    rendre();
    expect(fs.existsSync(f)).toBe(false);
  });

  test('attendu : un second preneur attend, le dit, puis passe quand le premier rend', async () => {
    const f = frais();
    // Un détenteur vivant qui n'est pas nous : un processus qui dort.
    const { spawn } = require('child_process');
    const dort = spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)']);
    try {
      fs.writeFileSync(f, String(dort.pid));
      const dits = [];
      let passe = false;
      const attente = V.prendre(opt(f, { dire: (m) => dits.push(m) })).then((r) => { passe = true; return r; });
      await new Promise((r) => setTimeout(r, 300));
      expect(passe).toBe(false);
      expect(dits.length).toBe(1);
      expect(dits[0]).toBe('banc en attente : un autre tourne, PID ' + dort.pid);
      dort.kill();                                   // le détenteur meurt : son verrou est repris
      const rendre = await attente;
      expect(passe).toBe(true);
      expect(fs.readFileSync(f, 'utf8')).toBe(String(process.pid));
      rendre();
    } finally { dort.kill(); }
  });

  test('repris : le verrou d\'un PID mort (ou d\'un fichier vide) ne bloque pas', async () => {
    const f = frais();
    fs.writeFileSync(f, String(pidMort()));
    const dits = [];
    const rendre = await V.prendre(opt(f, { dire: (m) => dits.push(m) }));
    expect(dits).toEqual([]);
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.pid));
    rendre();
    fs.writeFileSync(f, '');
    const r2 = await V.prendre(opt(f));
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.pid));
    r2();
  });

  test('--sans-verrou : rien n\'est pris, même si le verrou est tenu', async () => {
    const f = frais();
    fs.writeFileSync(f, String(process.ppid));       // un PID vivant
    const rendre = await V.prendre(opt(f, { sans: true }));
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.ppid));
    rendre();
    expect(fs.existsSync(f)).toBe(true);
  });

  test('pas d\'interblocage : sous le verrou d\'un parent vivant, un banc fils passe sans attendre', async () => {
    const f = frais();
    fs.writeFileSync(f, String(process.ppid));
    const rendre = await V.prendre(opt(f, { env: { BANC_VERROU_TENU: String(process.ppid) } }));
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.ppid));   // il n'a pas touché au fichier du parent
    rendre();
    expect(fs.readFileSync(f, 'utf8')).toBe(String(process.ppid));   // et ne le rend pas non plus
  });

  test('rendu à la sortie du processus, y compris sur exception non rattrapée, et le fils hérite de la variable', () => {
    const f = frais();
    const prog = (fin) => `const V=require(${JSON.stringify(VERROU_JS)});
      V.prendre({fichier:${JSON.stringify(f)},dire:()=>{}}).then(()=>{
        if(!require('fs').existsSync(${JSON.stringify(f)})) process.exit(9);
        if(process.env.BANC_VERROU_TENU!==String(process.pid)) process.exit(8);
        ${fin}
      });`;
    const env = Object.assign({}, process.env); delete env.BANC_VERROU_TENU; delete env.BANC_SANS_VERROU;
    const a = spawnSync(process.execPath, ['-e', prog('throw new Error("boum")')], { env });
    expect(a.status).toBe(1);
    expect(fs.existsSync(f)).toBe(false);
    const b = spawnSync(process.execPath, ['-e', prog('process.exit(0)')], { env });
    expect(b.status).toBe(0);
    expect(fs.existsSync(f)).toBe(false);
  });

  test('de bout en bout : deux processus ensemble, le second attend le premier et le dit', async () => {
    const f = frais();
    const { spawn } = require('child_process');
    const prog = (nom) => `const V=require(${JSON.stringify(VERROU_JS)});
      V.prendre({fichier:${JSON.stringify(f)},pas:50}).then(()=>{console.log('${nom} debut');
        setTimeout(()=>{console.log('${nom} fin');process.exit(0)},600)});`;
    const env = Object.assign({}, process.env); delete env.BANC_VERROU_TENU; delete env.BANC_SANS_VERROU;
    const lancer = (nom) => new Promise((ok) => {
      let sortie = '';
      const p = spawn(process.execPath, ['-e', prog(nom)], { env });
      p.stdout.on('data', (d) => { sortie += d; });
      p.stderr.on('data', (d) => { sortie += 'ERR:' + d; });
      p.on('exit', (code) => ok({ code, sortie }));
    });
    const A = lancer('A');
    await new Promise((r) => setTimeout(r, 250));
    const B = lancer('B');
    const [ra, rb] = await Promise.all([A, B]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);
    expect(rb.sortie).toMatch(/ERR:banc en attente : un autre tourne, PID \d+/);
    expect(ra.sortie).not.toMatch(/en attente/);
    // B ne commence qu'après la fin de A.
    expect(rb.sortie.indexOf('B debut')).toBeGreaterThan(-1);
  }, 20000);
});

describe('168 — aucun port fixe', () => {
  test('deux serveurs de banc démarrés ensemble ont deux ports différents', async () => {
    const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'serveur-test-'));
    fs.writeFileSync(path.join(racine, 'index.html'), '<!doctype html>');
    const s1 = creer({ racine }), s2 = creer({ racine });
    try {
      const [p1, p2] = await Promise.all([V.ecouter(s1), V.ecouter(s2)]);
      expect(p1).toBeGreaterThan(0);
      expect(p2).toBeGreaterThan(0);
      expect(p1).not.toBe(p2);
      const code = (p) => new Promise((ok) => http.get({ host: '127.0.0.1', port: p, path: '/' }, (r) => { r.resume(); ok(r.statusCode); }));
      expect(await code(p1)).toBeGreaterThan(0);
    } finally { await Promise.all([new Promise((r) => s1.close(r)), new Promise((r) => s2.close(r))]); }
  });

  test('aucun banc ne garde un port fixe en repli', () => {
    const dossier = path.join(__dirname, '../banc');
    const fautifs = fs.readdirSync(dossier).filter((f) => f.endsWith('.js'))
      .filter((f) => /BANC_PORT\s*\|\|\s*[1-9]\d{3}|BANC_PORT:\s*String\(\d{4,5}\s*\+/.test(fs.readFileSync(path.join(dossier, f), 'utf8')));
    expect(fautifs).toEqual([]);
    // le banc de séance est copié par le découpeur dans /tmp : un require relatif y casse.
    expect(fs.readFileSync(path.join(dossier, 'seance-ecran.js'), 'utf8')).not.toMatch(/require\('\.\/verrou\.js'\)/);
    expect(fs.readFileSync(path.join(__dirname, '../../v2-atelier/banc/serveur-pages.js'), 'utf8')).not.toMatch(/\|\|\s*8788/);
  });
});

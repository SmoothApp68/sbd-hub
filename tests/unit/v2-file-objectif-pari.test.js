/** @jest-environment node */
//
// 157 (24/10/2026, décision d'Aurélien) — L'OBJECTIF PART TOUJOURS APRÈS SON PARI.
// Diagnostic : DIAG-FK-PARI. Deux trous : la compression gardait l'ancien rang de l'objectif reposé (son nouveau pari
// passait derrière), et un pari refusé définitivement ne retenait rien. Avant la clé étrangère `objectifs.pari_id`.
//
// `ecrireObjectif` (app.js) se REJOUE dans un bac vm : un test qui lirait son texte ne verrait pas une branche morte.

require('../../v2/js/modele.js');
const vm = require('vm');
const A = require('../../v2/js/attente.js');
const { extraire } = require('./aide-profil-ecran.js');

const pari = (id) => ({ id, user_id: 'u', exercise_slug: 'squat' });
const ligne = (pariId) => ({ exercise_slug: 'squat', pari_id: pariId });

// `ecrireObjectif` telle qu'`app.js` la définit, sur la vraie file.
function bac() {
  const etat = { file: [] };
  const ctx = {
    versionObjectifs: 0, local: {}, CLE_OBJECTIFS: 'o', CLE_PARIS_OBJECTIF: 'p',
    Cache: { ecrireBrouillon: () => Promise.resolve() }, Attente: A,
    poser: async (op) => { etat.file = A.poser(etat.file, op); }
  };
  vm.createContext(ctx);
  vm.runInContext(extraire('ecrireObjectif'), ctx);
  return { etat, ecrire: (pr) => ctx.ecrireObjectif('squat', ligne(pr && pr.id), pr) };
}

// Un faux serveur à clé étrangère (refuse un pari_id inconnu en 23503) qui rejoue la boucle de `vidanger`.
function serveur(refuser) {
  const paris = {}; const objectifs = {}; const envoyes = []; const erreurs = [];
  return {
    paris, objectifs, envoyes, erreurs,
    envoyer(op) {
      envoyes.push(op.cle);
      if (op.table === A.PREDICTIONS) {
        if (refuser && refuser.indexOf(op.id) >= 0) return { code: '42501' };
        paris[op.id] = true; return null;
      }
      if (op.table === A.OBJECTIFS) {
        const p = op.donnees && op.donnees.pari_id;
        if (p && !paris[p]) { erreurs.push(op.cle); return { code: '23503', message: 'objectifs_pari_fk' }; }
        objectifs[op.id] = op.donnees; return null;
      }
      return null;
    }
  };
}
function vidanger(file, srv) {
  let f = file;
  for (let n = 0; n < 50; n++) {
    const op = A.prochaine(f);
    if (!op) break;
    const echec = srv.envoyer(op);
    if (!echec) { f = A.apresSucces(f, op); continue; }
    f = A.apresEchec(f, op, echec).file;
  }
  return f;
}

describe('157 — la pose', () => {
  test('l’objectif dépend de son pari et se pose en fin de file', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    const o = b.etat.file.find((e) => e.table === A.OBJECTIFS);
    expect(o.depend).toBe('P1');
    expect(A.ordonnee(b.etat.file).map((e) => e.table)).toEqual([A.PREDICTIONS, A.OBJECTIFS]);
  });
  test('« Juste un carnet » (sans pari) : inchangé, sans dépendance', async () => {
    const b = bac(); await b.ecrire(null);
    expect(b.etat.file.find((e) => e.table === A.OBJECTIFS).depend).toBeNull();
  });
});

describe('157 A — reposé hors ligne, le nouveau pari part avant l’objectif', () => {
  test('prochaine rend le pari avant l’objectif', async () => {
    const b = bac(); await b.ecrire(pari('P1')); await b.ecrire(pari('P2'));
    const ordre = A.ordonnee(b.etat.file).map((e) => e.cle);
    expect(ordre.indexOf('predictions:P2')).toBeLessThan(ordre.indexOf('objectifs:squat'));
    let f = b.etat.file; const vus = [];
    for (let op = A.prochaine(f); op; op = A.prochaine(f)) { vus.push(op.cle); f = A.apresSucces(f, op); }
    expect(vus.indexOf('predictions:P2')).toBeLessThan(vus.indexOf('objectifs:squat'));
  });
  test('retiré puis reposé hors ligne : idem', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    b.etat.file = A.poser(b.etat.file, { table: A.OBJECTIFS, op: A.SUPPRIMER, id: 'squat' });
    await b.ecrire(pari('P2'));
    const ordre = A.ordonnee(b.etat.file).map((e) => e.cle);
    expect(ordre.indexOf('predictions:P2')).toBeLessThan(ordre.indexOf('objectifs:squat'));
  });
});

describe('157 B — un pari refusé retient l’objectif', () => {
  test('pari bloquée : l’objectif n’est pas rendu', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    const p = A.prochaine(b.etat.file);
    b.etat.file = A.apresEchec(b.etat.file, p, { code: '42501' }).file;
    expect(A.prochaine(b.etat.file)).toBeNull();
  });
  test('depend = id d’un pari ne déclenche rien de « séance »', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    const o = b.etat.file.find((e) => e.table === A.OBJECTIFS);
    // retirerSeance ne le prend pas pour une séance dont l’id serait celui du pari ; apresSucces du pari n’y touche pas
    expect(A.retirerSeance(b.etat.file, 'sess-1', []).length).toBe(2);
    const p = b.etat.file.find((e) => e.table === A.PREDICTIONS);
    const apres = A.apresSucces(b.etat.file, p);
    expect(apres.length).toBe(1); expect(apres[0].cle).toBe(o.cle); expect(apres[0].attend || null).toBeNull();
  });
});

describe('157 C — faux serveur à clé étrangère', () => {
  test('nominal : pari puis objectif, aucun 23503, file vide', async () => {
    const b = bac(); await b.ecrire(pari('P1')); const s = serveur();
    expect(vidanger(b.etat.file, s)).toEqual([]);
    expect(s.erreurs).toEqual([]); expect(s.objectifs.squat.pari_id).toBe('P1');
  });
  test('reposé hors ligne : aucun 23503, file vide, le dernier pari tient', async () => {
    const b = bac(); await b.ecrire(pari('P1')); await b.ecrire(pari('P2')); const s = serveur();
    expect(vidanger(b.etat.file, s)).toEqual([]);
    expect(s.erreurs).toEqual([]); expect(s.objectifs.squat.pari_id).toBe('P2');
  });
  test('pari refusé : l’objectif ne part pas (aucun 23503), il reste retenu', async () => {
    const b = bac(); await b.ecrire(pari('P1')); const s = serveur(['P1']);
    const f = vidanger(b.etat.file, s);
    expect(s.erreurs).toEqual([]); expect(s.objectifs.squat).toBeUndefined();
    expect(f.map((e) => e.cle)).toEqual(['predictions:P1', 'objectifs:squat'].filter((c) => f.some((e) => e.cle === c)));
  });
  test('23503 sur l’objectif, pari encore en file : il attend, puis repart quand le pari monte', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    const o = b.etat.file.find((e) => e.table === A.OBJECTIFS);
    const r = A.apresEchec(b.etat.file, o, { code: '23503' });
    expect(r.suite).toBe('attend');
    const p = r.file.find((e) => e.table === A.PREDICTIONS);
    const apres = A.apresSucces(r.file, p);
    expect(apres[0].attend).toBeNull();
    expect(A.prochaine(apres).cle).toBe('objectifs:squat');
  });
  test('23503 sur l’objectif, pari absent de la file : abandonné (raison dite), pas de refus définitif', async () => {
    const b = bac(); await b.ecrire(pari('P1'));
    const o = b.etat.file.find((e) => e.table === A.OBJECTIFS);
    const sans = b.etat.file.filter((e) => e.table === A.OBJECTIFS);
    const r = A.apresEchec(sans, o, { code: '23503' });
    expect(r.suite).toBe('abandonnee'); expect(r.file).toEqual([]);
  });
  test('un 23503 sur une autre table ne change pas', () => {
    const f = A.poser([], { table: A.ZONES, op: A.UPSERT, id: 'z', depend: null, donnees: {} });
    expect(A.apresEchec(f, f[0], { code: '23503' }).suite).toBe('bloquee');
  });
});

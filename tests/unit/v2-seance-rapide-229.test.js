/** @jest-environment node */
//
// 229 — LA SÉANCE RAPIDE : trois calculs refaits à chaque geste sur tout l'historique (plusieurs secondes par série validée sur un
// téléphone, 627 séances). Les résultats ne changent pas : ce test compare le nouveau calcul à l'ancien, sur des historiques tirés.

process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
const M = require('../../v2/js/moteur.js');

const JOUR = 86400000;
// L'ancien calcul, tel quel (avant 229) : `repriseDe` sur chaque préfixe trié.
function ancienneCoupure(debuts, depuisLe, jusquAu, apres) {
  const inst = (v) => { const t = Date.parse(v); return isFinite(t) ? t : null; };
  const liste = debuts.map((d) => ({ debut: d })).filter((s) => inst(s.debut) !== null).sort((a, b) => inst(a.debut) - inst(b.debut));
  const num = (j) => Math.round(Date.parse(j + 'T12:00:00Z') / JOUR);
  const borne = num(depuisLe) - apres, fin = num(jusquAu);
  for (let i = 1; i < liste.length; i++) {
    const k = num(M.jourCivil(liste[i].debut));
    if (k < borne || k > fin) continue;
    if (M.repriseDe(liste.slice(0, i), liste[i].debut) !== 'aucune') return true;
  }
  return false;
}
let x = 229; const alea = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };

describe('229 — la coupure dans la fatigue : le même résultat, sans retrier l’historique à chaque séance', () => {
  test('300 historiques tirés (avec des trous, des égalités de date) : nouveau = ancien', () => {
    let vrais = 0;
    for (let n = 0; n < 300; n++) {
      const debuts = []; let t = Date.parse('2026-01-05T17:00:00Z');
      const nb = 5 + Math.floor(alea() * 60);
      for (let k = 0; k < nb; k++) {
        t += (alea() < 0.1 ? 20 + alea() * 40 : 1 + alea() * 4) * JOUR;
        debuts.push(new Date(t).toISOString());
        if (alea() < 0.05) debuts.push(new Date(t).toISOString());
      }
      const fin = new Date(t).toISOString().slice(0, 10);
      const depuis = new Date(t - (20 + alea() * 60) * JOUR).toISOString().slice(0, 10);
      const nouveau = M.coupureDansLaFatigue(debuts, depuis, fin);
      const ancien = ancienneCoupure(debuts, depuis, fin, 21);
      if (nouveau) vrais++;
      expect(nouveau).toBe(ancien);
    }
    expect(vrais).toBeGreaterThan(10);   // la fixture déclenche vraiment des coupures
  });
});

#!/usr/bin/env node
// tests/banc/fixtures/banc-factice.js — un banc de trois sections, sans
// navigateur, pour tester l'outillage (`seance-sections.js`, `seance-rapide.js`).
// (Quatre depuis le 07/10/2026 : D suit C, qui peut planter.)
//
// Même forme que le vrai : un préambule, des sections ouvertes par
// `console.log('\n══ NOM ══')`, `await clore()`, un rapport JSON dans
// `BANC_RAPPORT`. `BANC_FACTICE_ECHEC=B` fait échouer un contrôle de la
// section B ; `BANC_FACTICE_PLANTE=C` fait planter la section C (pas de rapport).

const rapport = { debut: Date.now(), sections: [], controles: [] };
let sectionRapport = '(préambule)';
let echecs = 0;
{
  const log = console.log;
  console.log = function () {
    const m = /^\n══ (.*) ══$/.exec(String(arguments[0]));
    if (m) {
      const prec = rapport.sections[rapport.sections.length - 1];
      if (prec && prec.fin === null) prec.fin = Date.now();
      rapport.sections.push({ nom: m[1], debut: Date.now(), fin: null });
      sectionRapport = m[1];
    }
    return log.apply(console, arguments);
  };
}
const ok = (nom, cond) => {
  if (!cond) echecs++;
  rapport.controles.push({ section: sectionRapport, nom: nom, ok: !!cond });
  console.log('   ' + (cond ? '✅' : '❌') + ' ' + nom);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const echoue = process.env.BANC_FACTICE_ECHEC || '';
  const plante = process.env.BANC_FACTICE_PLANTE || '';
  const port = Number(process.env.BANC_PORT || 0);
  const clore = async () => {
    const fin = rapport.sections[rapport.sections.length - 1];
    if (fin && fin.fin === null) fin.fin = Date.now();
    if (process.env.BANC_RAPPORT) {
      require('fs').writeFileSync(process.env.BANC_RAPPORT, JSON.stringify({
        debut: rapport.debut, fin: Date.now(), echecs: echecs, erreurs: [],
        sections: rapport.sections, controles: rapport.controles,
        garde: { plans: 0, violations: 0, rapports: [], liste: [], sections: {} }
      }));
    }
    process.exit(echecs ? 1 : 0);
  };
  // 161 — l'état que laisse une section : « la séance est ouverte ». `remettreAPropre` (comme celle du vrai banc, appelée par
  // le découpeur résistant dans son `catch`) le referme ; sans elle, la section suivante part d'un état sale.
  let seanceOuverte = false;
  let reseauCoupe = false;   // le faux serveur : C le coupe avant de planter (comme `base.reseau = false` du groupe, 91)
  const remettreAPropre = async () => { seanceOuverte = false; reseauCoupe = false; };
  // Un helper déclaré DANS une section et servi dans une autre.
  ok('le préambule a reçu un port', port > 0);

  console.log('\n══ A. LA PREMIÈRE ══');
  const doubler = (x) => x * 2;
  const deja = await pause(5);
  ok('A — un', doubler(2) === 4);
  ok('A — deux', echoue !== 'A');

  console.log('\n══ B. LA DEUXIÈME ══');
  ok('B — un', echoue !== 'B');

  console.log('\n══ C. LA TROISIÈME ══');
  seanceOuverte = true;   // 161 — C ouvre une séance… et coupe le réseau du faux serveur…
  reseauCoupe = true;
  if (plante === 'C') throw new Error('la section C plante');
  ok('C — se sert du helper de A', doubler(3) === 6);
  ok('C — deux', echoue !== 'C');

  // D vient APRÈS une section qui peut planter : le séquentiel résistant doit
  // la jouer quand même (07/10/2026).
  console.log('\n══ D. LA QUATRIÈME ══');
  const triple = doubler(1) + 1;
  ok('D — après C', triple === 3 && echoue !== 'D');
  // 161 — … et D repart d'un état propre quand C a planté (sans plantage, C la laisse ouverte : seul le plantage nettoie).
  ok('D — la séance de C est refermée (état propre)', plante !== 'C' || !seanceOuverte);
  ok('D — le réseau coupé par C est rendu (état propre)', plante !== 'C' || !reseauCoupe);

  await clore();
})().catch((e) => { console.error(String(e)); process.exit(3); });

// tests/banc/charge-ralentir.js — préchargé par `charge.js` (NODE_OPTIONS=--require) : chaque page qu'un banc
// ouvre par `Garde.lancer` a son processeur ralenti par Chrome lui-même (CDP `Emulation.setCPUThrottlingRate`,
// `BANC_RALENTI` = le facteur). Ne lance aucun navigateur : il enveloppe `Garde.lancer`, rien d'autre.
//
// 135 — c'est l'outil qui a REPRODUIT l'instabilité du banc des routines « sous charge » : sans lui, un banc
// ne voit jamais la page lente que voit un téléphone ou une machine partagée entre trois agents.
const Module = require('module');
const taux = Number(process.env.BANC_RALENTI || 0);
const charger = Module._load;
Module._load = function (demande) {
  const m = charger.apply(this, arguments);
  if (taux > 1 && /garde-reseau(\.js)?$/.test(demande) && m && m.lancer && !m.__ralenti) {
    const lancer = m.lancer;
    m.lancer = async (moteur, options) => {
      const nav = await lancer(moteur, options);
      const nouveauContexte = nav.newContext;
      nav.newContext = async (o) => {
        const ctx = await nouveauContexte(o);
        const freiner = async (page) => {
          try { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: taux }); } catch (e) { /* page déjà fermée */ }
        };
        ctx.on('page', freiner);
        const nouvellePage = ctx.newPage.bind(ctx);
        ctx.newPage = async () => { const p = await nouvellePage(); await freiner(p); return p; };
        return ctx;
      };
      return nav;
    };
    m.__ralenti = true;
  }
  return m;
};

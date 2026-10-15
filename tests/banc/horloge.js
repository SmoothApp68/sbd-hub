//
// tests/banc/horloge.js — l'heure du banc d'écran, décalée sur demande (96).
//
//   BANC_HORLOGE=2026-10-15T00:05:00 node tests/banc/seance-ecran.js
//
// Sans la variable, rien ne change : le banc vit à l'heure réelle, et c'est le
// décor (`decor-dates.js`) qui le rend indépendant du jour et de l'heure.
// Avec elle, Node ET le navigateur partent de cette heure (heure locale), puis
// le temps AVANCE normalement : c'est un DÉCALAGE, pas une horloge gelée — les
// minuteries, les attentes et `performance.now` gardent leur vitesse réelle.
//
// Pourquoi un décalage et pas `page.clock` : l'horloge de Playwright remplace
// aussi `setTimeout`, et le banc mesure de vraies attentes (chronomètre, file).
// À quoi ça sert : rejouer une section « un lundi à 00 h 05 » sans attendre le
// lundi — c'est ainsi que le défaut [D7] du 15/10 se reproduit à volonté.
'use strict';

function decalage() {
  const v = process.env.BANC_HORLOGE;
  if (!v) return 0;
  const t = new Date(v).getTime();
  if (!isFinite(t)) throw new Error('BANC_HORLOGE illisible : ' + v);
  return t - Date.now();
}

// Le script injecté dans chaque page (`addInitScript`), avec le décalage fixé
// au moment où le contexte s'ouvre.
function scriptNavigateur(ms) {
  return '(' + function (d) {
    if (!d) return;
    const Vrai = Date;
    function D(...a) {
      if (!new.target) return new Vrai(Vrai.now() + d).toString();
      return a.length ? new Vrai(...a) : new Vrai(Vrai.now() + d);
    }
    D.prototype = Vrai.prototype;
    D.now = () => Vrai.now() + d;
    D.parse = Vrai.parse;
    D.UTC = Vrai.UTC;
    // eslint-disable-next-line no-global-assign
    self.Date = D;
  }.toString() + ')(' + Number(ms || 0) + ')';
}

// Node : le même décalage, posé une fois, avant que le banc ne date son décor.
function installerNode(ms) {
  if (!ms) return;
  const Vrai = Date;
  class D extends Vrai {
    constructor(...a) { if (a.length) super(...a); else super(Vrai.now() + ms); }
    static now() { return Vrai.now() + ms; }
  }
  global.Date = D;
}

const DECALAGE = decalage();
installerNode(DECALAGE);

module.exports = { DECALAGE, scriptNavigateur };

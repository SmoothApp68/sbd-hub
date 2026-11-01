//
// tests/banc/horloge.js — l'heure du banc d'écran, décalée sur demande (96).
//
//   BANC_HORLOGE=2026-10-15T00:05:00 node tests/banc/seance-ecran.js
//
// Sans la variable, le banc vit à l'heure réelle (hors les deux frontières décrites plus bas), et c'est le
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

// ⚠️ DEUX FRONTIÈRES QUE LE DÉCOR DU BANC NE FRANCHIT PAS (01/11/2026 : social-2, social, groupe et leurs suiveuses
// échouaient sans qu'une ligne de l'app n'ait changé) :
//   1. LE MOIS. Les sections datent leurs séances « hier », « il y a deux jours » ; l'écran ouvre « ce mois » ou
//      la grille du mois en cours. Du 1er au 7, ces séances tombent dans le mois d'avant : le calendrier de lea est
//      vide, « son mois » de jordan est à 0. L'écran est juste, le décor non.
//   2. LE JOUR LOCAL ≠ LE JOUR UTC. La base compare des dates à des instants en UTC (`s.debut >= p_de`, v2_079) et
//      le faux serveur social en fait autant (`jour(iso)` = les 10 premiers caractères de l'ISO), alors que l'app
//      envoie ses bornes en jour LOCAL. Entre minuit local et minuit UTC (1 à 2 h par nuit à Paris), une séance
//      forgée « il y a 10 minutes » est datée de la veille UTC.
// Sans BANC_HORLOGE, l'heure du banc est donc décalée au plus juste pour n'être ni dans les 7 premiers jours d'un
// mois (elle passe au 8, à la même heure), ni dans la fenêtre de la deuxième frontière (elle avance d'heure en
// heure). Un décalage, comme le reste de ce fichier ; BANC_HORLOGE le remplace.
const JOUR_MIN = 8;
function jourLocal(t) { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function jourUtc(t) { const d = new Date(t); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function decalageDuDecor(t) {
  let d = 0;
  const l = new Date(t);
  if (l.getDate() < JOUR_MIN) {
    d = new Date(l.getFullYear(), l.getMonth(), JOUR_MIN, l.getHours(), l.getMinutes(), l.getSeconds(), l.getMilliseconds()).getTime() - t;
  }
  const fin = d + 24 * 3600000;
  while (d < fin && jourLocal(t + d) !== jourUtc(t + d)) d += 3600000;
  return d;
}

function decalage() {
  const v = process.env.BANC_HORLOGE;
  if (!v) return decalageDuDecor(Date.now());
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

module.exports = { DECALAGE, scriptNavigateur, decalageDuDecor };

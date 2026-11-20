/** @jest-environment node */
//
// MOTEUR §9.39 — `rate_ignoree` porte `cas` et `boutons` : une réaction SANS bouton (une phrase seule) n'est pas une
// proposition refusée. On joue le vrai `noterLesPropositionsPassees` d'`app.js` (extrait), avec le vrai `Seance.noterGeste`.

process.env.TZ = 'Europe/Paris';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
const S = require('../../v2/js/seance.js');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const m = APP.match(/^  function noterLesPropositionsPassees\b[\s\S]*?^  }/m);
if (!m) throw new Error('introuvable dans v2/js/app.js : noterLesPropositionsPassees');

function jouer(rate, gestes) {
  const ctx = {
    Seance: S, enEdition: () => false,
    seance: { id: 's1', gestes: gestes || [] },
    planDeLExercice: () => ({ slug: 'rowing', rate })
  };
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.noterLesPropositionsPassees = noterLesPropositionsPassees;', ctx);
  ctx.noterLesPropositionsPassees(0, 1);   // la personne passe à la série 1 sans répondre à la réaction de la série 0
  return ctx.seance.gestes;
}

describe('MOTEUR §9.39 — `rate_ignoree` porte `cas` et `boutons`', () => {
  test('une réaction sans bouton, ignorée : `boutons: []` et son cas', () => {
    expect(jouer({ iSerie: 0, cas: 'Z2', boutons: [], fait: false }))
      .toEqual([{ geste: 'rate_ignoree', slug: 'rowing', rang: 0, cas: 'Z2', boutons: [] }]);
  });
  test('une réaction à boutons, ignorée : leurs clés, dans l’ordre', () => {
    expect(jouer({ iSerie: 0, cas: 'Z1', fait: false, boutons: [{ cle: 'prendre', texte: 'a', pris: false }, { cle: 'approche', texte: 'b', pris: false }] }))
      .toEqual([{ geste: 'rate_ignoree', slug: 'rowing', rang: 0, cas: 'Z1', boutons: ['prendre', 'approche'] }]);
  });
  test('même condition qu’avant : une réaction répondue, déjà notée ou sur la série courante ne s’écrit pas', () => {
    expect(jouer({ iSerie: 0, cas: 'Z1', boutons: [], fait: true })).toEqual([]);
    expect(jouer({ iSerie: 1, cas: 'Z1', boutons: [], fait: false })).toEqual([]);
    expect(jouer({ iSerie: 0, cas: 'Z1', boutons: [], fait: false }, [{ geste: 'rate_ignoree', slug: 'rowing', rang: 0 }])).toHaveLength(1);
  });
  test('un `boutons` mal formé est assaini ; les autres gestes n’en portent pas', () => {
    const s = S.noterGeste({ id: 's', gestes: [] }, { geste: 'rate_ignoree', slug: 'a', rang: 0, cas: 'Z1', boutons: ['x', 3, '', null] });
    expect(s.gestes[0].boutons).toEqual(['x']);
    const p = S.noterGeste({ id: 's', gestes: [] }, { geste: 'rate_prise', slug: 'a', rang: 0, bouton: 'x', cas: 'Z1', boutons: ['x'] });
    // 19/11/2026 — `cas: 'Z1'` suit « Prendre » (la décision reste appliquée si le zéro est corrigé) ; tout autre cas est écarté, et jamais de `boutons`.
    expect(p.gestes[0]).toEqual({ geste: 'rate_prise', slug: 'a', rang: 0, bouton: 'x', cas: 'Z1' });
    const q = S.noterGeste({ id: 's', gestes: [] }, { geste: 'rate_prise', slug: 'a', rang: 0, bouton: 'x', cas: 'B', boutons: ['x'] });
    expect(q.gestes[0]).toEqual({ geste: 'rate_prise', slug: 'a', rang: 0, bouton: 'x' });
  });
});

//
// 25/11/2026 (ECRAN-SAISIE §7 quinvicies quinquies, décision d'Aurélien) — la case des REPS : la touche d'action du clavier dit « OK »
// (enterkeyhint="done") et Entrée ferme le clavier, rien d'autre : jamais de validation. La case de charge ne change pas.
process.env.TZ = 'Europe/Paris';
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
require('../../v2/js/profil.js');
require('../../v2/js/periode.js');
require('../../v2/js/moteur.js');
const S = require('../../v2/js/seance.js');
require('../../v2/js/plan.js');
require('../../v2/js/rendu.js');
const Modele = window.THModele;

const EXOS = [{ slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', equipement: 'barre', muscles_primaires: ['pectoraux'] }];
function rendre(extra) {
  let m = 0;
  const uuid = () => 'v-' + (++m);
  let s = S.creer({ id: 'S', userId: 'u', idSerie: uuid });
  s = S.ajouterExercice(s, 'dc', uuid);
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  window.THRendu.rendreBlocsSeance(cible, s, Object.assign({
    blocs: Modele.blocsDeSeance(s, EXOS), modifier: false, selection: null, programme: false,
    surGrouper: () => {}, surDeplacerBloc: () => {}, surMenuBloc: () => {}, surMenuExercice: () => {},
    tourAtteint: () => 0, exercice: (slug) => EXOS.filter((e) => e.slug === slug)[0], precedent: () => null, fantome: () => ({}),
    libelles: () => ({}), surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {}, surNote: () => {},
    surRepos: () => {}, surSupprimerSerie: () => {}, surAjoutSerie: () => {}
  }, extra || {}));
  return cible;
}
const champ = (c, nom) => c.querySelector('.serie [data-champ="' + nom + '"] input');
const entree = (n) => { const e = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); n.dispatchEvent(e); return e; };

describe('la case des reps : « OK » ferme le clavier et ne valide rien', () => {
  test('la touche d’action dit « OK » sur les reps, pas sur la charge', () => {
    const c = rendre();
    expect(champ(c, 'reps').getAttribute('enterkeyhint')).toBe('done');
    expect(champ(c, 'charge_kg').getAttribute('enterkeyhint')).toBeNull();
  });
  test('Entrée sur les reps : le champ perd le focus, la frappe est retenue, rien n’est validé', () => {
    const valider = jest.fn(), surChamp = jest.fn();
    const c = rendre({ surValider: valider, surChamp });
    const r = champ(c, 'reps');
    r.focus();
    expect(document.activeElement).toBe(r);
    const e = entree(r);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(r);
    expect(valider).not.toHaveBeenCalled();
    expect(surChamp).not.toHaveBeenCalled();
    expect(c.querySelector('.ok-serie.cochee')).toBeNull();
  });
  test('DISCRIMINANT — Entrée sur la charge ne ferme rien (comportement d’avant)', () => {
    const c = rendre();
    const k = champ(c, 'charge_kg');
    k.focus();
    const e = entree(k);
    expect(e.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(k);
  });
  test('dans l’éditeur de routine, la case des reps n’est pas touchée', () => {
    const c = rendre({ programme: true });
    expect(champ(c, 'reps').getAttribute('enterkeyhint')).toBeNull();
  });
});

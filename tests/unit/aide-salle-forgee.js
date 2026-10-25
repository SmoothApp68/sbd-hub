// 163 (24/10/2026, décision d'Aurélien) — « Ma salle » ne garde que les élastiques : `Profil.salleDeLExercice` ne rend
// plus de salle pour une barre fixe ni pour des haltères. LE MOTEUR, LUI, sait toujours lire une salle (`{ materiel,
// charges }`, MOTEUR §10 bis) : les élastiques en sont une. Ces tests-ci couvrent le MÉCANISME de la liste fermée (le
// cran, l'arrondi, le plafond, I46/I47/I48, la réaction) avec des salles de barres et d'haltères FORGÉES — la résolution
// que l'app faisait avant 163, recopiée ici à des fins de test SEULEMENT. L'app ne s'en sert plus.
const Profil = require('../../v2/js/profil.js');
const Moteur = require('../../v2/js/moteur.js');

const CRAN_CHARGEE = 2.5, BARRE_MAX = 100;

function avecIsolation(salle, fiche) {
  const muscles = { prim: fiche.muscles_primaires || [], sec: fiche.muscles_secondaires || [], stab: fiche.muscles_stabilisateurs || [] };
  return Moteur.estIsolation(muscles) ? Object.assign(salle, { isolation: true }) : salle;
}

function salleForgee(profil, slug, index) {
  const s = Profil.salleDe(profil);
  const fiche = index && slug && Object.prototype.hasOwnProperty.call(index, slug) ? index[slug] : null;
  if (!s || !fiche) return null;
  if (fiche.equipement === 'haltere') {
    if (!s.halteres) return null;
    const charges = Profil.chargesDesTranches(Profil.tranchesDe(s.halteres)).map((v) => Math.round(2 * v * 100) / 100);
    return avecIsolation({ materiel: 'halteres', charges }, fiche);
  }
  if (fiche.equipement !== 'barre') return null;
  if (fiche.barre_charge_fixe === false) return null;
  if (fiche.barre_charge_fixe !== true) {
    const G = require('../../v2/js/generateur.js');
    if (G && G.estBarreLourde(slug, index)) return null;
  }
  const ez = Profil.estBarreEZ(Object.assign({ slug }, fiche));
  let liste = ez ? s.barres_ez : s.barres_droites;
  if (liste.length && (ez ? s.barre_ez_chargee : s.barre_droite_chargee) === true) {
    const etendue = liste.slice();
    for (let k = 1; ; k++) {
      const c = Math.round((liste[liste.length - 1] + k * CRAN_CHARGEE) * 100) / 100;
      if (c > BARRE_MAX) break;
      etendue.push(c);
    }
    liste = etendue;
  }
  return liste.length ? avecIsolation({ materiel: ez ? 'barre_ez' : 'barre_droite', charges: liste.slice() }, fiche) : null;
}

module.exports = { salleForgee };

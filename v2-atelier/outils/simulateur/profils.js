'use strict';
// Les 36 profils de l'audit (AUDIT-PLAN §1) : 17 du plan orthogonal + 19 cas extrêmes.
const NIV = { deb: 'moins_1_an', int: '1_a_3_ans', ava: 'plus_5_ans', int35: '3_a_5_ans' };
const MAT = { salle: 'salle_complete', halt: 'maison_minimal', elas: 'maison_minimal', pdc: 'poids_du_corps' };
const OBJ = { force: 'force', muscle: 'muscle', deux: 'les_deux', forme: 'forme' };
const PH = { masse: 'prise_de_masse', maintien: 'maintien', seche: 'seche' };
const REG = { P: 'prudent', N: 'normal', F: 'franc' };
function p(id, niv, sexe, obj, mat, reg, ph, freq, cartes, res, extra) {
  return Object.assign({ id, nom: id, niveau: niv, anciennete: NIV[niv], sexe: sexe === 'H' ? 'homme' : 'femme',
    objectif: OBJ[obj], materielCle: mat, materiel: MAT[mat], reglage: REG[reg], phase: PH[ph], freq,
    cartes, reserve: res, intention: 'progresser', special: {} }, extra || {});
}
const P = [
  p('P01', 'deb', 'H', 'force', 'salle', 'P', 'masse', 3, 'accepte', 'notee'),
  p('P02', 'int', 'F', 'force', 'halt', 'N', 'maintien', 4, 'refuse', 'non'),
  p('P03', 'ava', 'H', 'muscle', 'elas', 'F', 'seche', 5, 'melange', 'non'),
  p('P04', 'ava', 'F', 'deux', 'pdc', 'P', 'masse', 4, 'melange', 'notee'),
  p('P05', 'int', 'F', 'forme', 'halt', 'F', 'seche', 3, 'accepte', 'notee'),
  p('P06', 'deb', 'H', 'forme', 'pdc', 'N', 'maintien', 5, 'refuse', 'notee'),
  p('P07', 'deb', 'F', 'deux', 'elas', 'N', 'maintien', 3, 'accepte', 'non'),
  p('P08', 'int', 'F', 'muscle', 'salle', 'P', 'masse', 5, 'refuse', 'non'),
  p('P09', 'deb', 'H', 'deux', 'salle', 'F', 'seche', 4, 'refuse', 'notee'),
  p('P10', 'ava', 'H', 'forme', 'salle', 'N', 'maintien', 3, 'melange', 'non'),
  p('P11', 'int', 'H', 'muscle', 'pdc', 'F', 'maintien', 3, 'accepte', 'notee'),
  p('P12', 'deb', 'H', 'muscle', 'halt', 'N', 'masse', 4, 'melange', 'notee'),
  p('P13', 'int', 'H', 'forme', 'elas', 'P', 'masse', 4, 'accepte', 'notee'),
  p('P14', 'ava', 'H', 'force', 'halt', 'P', 'seche', 5, 'accepte', 'notee'),
  p('P15', 'int', 'H', 'force', 'pdc', 'N', 'seche', 3, 'melange', 'non'),
  p('P16', 'ava', 'H', 'force', 'elas', 'F', 'masse', 3, 'refuse', 'notee'),
  p('P17', 'int', 'H', 'deux', 'halt', 'P', 'maintien', 5, 'accepte', 'notee')
];
const X = [
  p('X01', 'ava', 'H', 'deux', 'salle', 'F', 'maintien', 6, 'melange', 'rare', { special: { pdc: 98, reserve11: true, force: { squat: 145, dc: 140, dl: 170 } } }),
  p('X02', 'ava', 'F', 'deux', 'salle', 'N', 'maintien', 5, 'accepte', 'notee', { special: { pdc: 63 } }),
  p('X03', 'int', 'H', 'deux', 'salle', 'N', 'maintien', 3, 'accepte', 'notee', { intention: 'entretien' }),
  p('X04', 'deb', 'F', 'forme', 'pdc', 'N', 'maintien', 2, 'accepte', 'notee'),
  p('X05', 'int', 'H', 'deux', 'salle', 'N', 'maintien', 3, 'melange', 'notee', { special: { irregulier: true } }),
  p('X06', 'int', 'H', 'deux', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { mal: { semaine: 5 } } }),
  p('X07', 'int', 'H', 'force', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { forme: 0.9 } }),
  p('X08', 'int', 'H', 'deux', 'salle', 'F', 'masse', 4, 'accepte', 'notee', { special: { progres: 2, reserveHaute: true } }),
  p('X09', 'ava', 'H', 'force', 'salle', 'N', 'maintien', 6, 'accepte', 'notee', { special: { progres: 0 } }),
  p('X10', 'int', 'H', 'muscle', 'halt', 'N', 'maintien', 4, 'accepte', 'notee', { special: { plafondHaltere: 40 } }),
  p('X11', 'int', 'H', 'muscle', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { pasMachine: 10 } }),
  p('X12', 'int', 'F', 'forme', 'elas', 'N', 'maintien', 3, 'accepte', 'notee', { special: { elastiquesParNom: true } }),
  p('X13', 'int', 'H', 'forme', 'pdc', 'N', 'maintien', 3, 'accepte', 'notee', { special: { figures: true } }),
  p('X14', 'int', 'H', 'muscle', 'pdc', 'N', 'maintien', 3, 'refuse', 'notee', { special: { lest: 'non' } }),
  p('X15', 'ava', 'F', 'muscle', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { pdc: 55, leger: true } }),
  p('X16', 'ava', 'H', 'force', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { pdc: 125, force: { squat: 250, dc: 200, dl: 300 } } }),
  p('X17', 'int', 'H', 'deux', 'salle', 'N', 'masse', 4, 'accepte', 'notee', { special: { phaseA: { semaine: 8, phase: 'seche' }, reglageA: { semaine: 6, reglage: 'franc' } } }),
  p('X18', 'int', 'H', 'deux', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { special: { cycles: true } }),
  p('X19', 'int35', 'H', 'deux', 'salle', 'N', 'maintien', 4, 'accepte', 'notee', { sexe: 'non_precise' })
];
// X01 : « réserve 11 % » ; les autres : notée = toujours, non = 11 %.
module.exports = { PROFILS: P.concat(X), PRIORITAIRES_B: ['X15', 'X03', 'X07', 'X09', 'X10', 'X01', 'X05', 'X18', 'X14', 'X11', 'P03', 'P04'] };

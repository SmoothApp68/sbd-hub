'use strict';
const fs = require('fs'); const path = require('path');
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
function ligneLisible(profil, l) {
  const d = new Date(l.date);
  const sorti = [`S${String(l.semaine).padStart(2, '0')} · ${JOURS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · « ${l.routine} » · ${profil.id} (${profil.niveau} ${profil.sexe[0].toUpperCase()}, ${profil.objectif}, ${profil.reglage}, ${profil.materielCle}, ${profil.phase})`];
  l.exos.forEach((x) => {
    const k = x.consigne;
    sorti.push(`  ${x.slug} — « ${x.entete ? (x.entete.jaune || []).join(' / ') : '(silence)'} » état ${k ? k.etat : '-'} compteur ${k ? k.compteur : '-'} · capacité ${x.capacite}`);
    if (x.entete && x.entete.gris) sorti.push(`      gris : ${x.entete.gris}`);
    sorti.push(`      fait ${x.fait.map((f) => `${f.kg === null ? '-' : f.kg}×${f.reps}${f.ratee ? '!' : ''}${f.notee ? '@' + f.notee.replace('reste_', 'R') : ''}`).join(', ')}`);
    if (x.constat) sorti.push(`      constat : ${x.constat.verdict} ${x.constat.suite}`);
  });
  sorti.push(`  Cartes : ${l.cartes.length ? l.cartes.map((c) => c.type + (c.exo ? ':' + c.exo : '')).join(', ') : 'aucune'} · violations ${l.violations.length}`);
  return sorti.join('\n');
}
function ecrire(dossier, profil, graine, lignes) {
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, `${profil.id}-g${graine}.jsonl`), lignes.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.writeFileSync(path.join(dossier, `${profil.id}-g${graine}.txt`), lignes.map((l) => ligneLisible(profil, l)).join('\n\n') + '\n');
}
module.exports = { ecrire };

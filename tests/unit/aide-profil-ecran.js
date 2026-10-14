// Aide de test — rejoue `rendreProfilEcran` (v2/js/app.js) dans un bac à sable,
// avec le VRAI `profil.js`, et rend ce qu'elle passe à `Rendu.rendreProfil` :
// les sections telles que l'écran les reçoit, et ce que leurs gestes écrivent.
//
// 54-1 — remplace les gardes qui cherchaient du TEXTE dans `app.js`
// (`toContain("titre: 'TA SEMAINE'")`, `toContain('Profil.sectionRythme(p,
// ecrireProfil)')`…). Celles-ci passaient tant que la ligne existait, même
// morte ; ici, une section absente, renommée, ou branchée sur autre chose
// qu'`ecrireProfil` fait tomber le test.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
function extraire(nom) {
  const m = APP.match(new RegExp('^  (async )?function ' + nom + '\\b[\\s\\S]*?^  }', 'm'));
  if (!m) throw new Error('introuvable : ' + nom);
  return m[0];
}

function profilEcran(profil, options) {
  const opt = options || {};
  require('../../v2/js/modele.js');
  require('../../v2/js/semaine.js');
  const Profil = require('../../v2/js/profil.js');
  const ecrits = [];
  const ouverts = [];
  const questionnairesOuverts = [];
  const programmesOuverts = [];
  let vue = null;
  let bandeau = null;
  const element = () => ({ textContent: '' });
  const ctx = {
    Profil, Date,
    profil: profil || {},
    local: { pesees: [], seances: [], series: [], exercices: [] },
    sessionActive: null,
    Routeur: { PROFIL: 'profil', EXERCICES: 'exercices', POIDS: 'poids' },
    Poids: { resume: () => null },
    Modele: { nombreSigne: (n) => String(n), nombreGroupe: (n) => String(n), quand: (d) => String(d) },
    Rendu: { rendreProfil: (cible, v) => { vue = v; }, dateCourte: (d) => String(d),
             // 64B — le bandeau du jeu : ce que l'écran lui passe (l'état, ou `null` jeu éteint).
             rendreBandeauJeu: (rond, ligne, etat, initiale) => { bandeau = { etat, initiale }; } },
    // 64B — le jeu (JEU-V1 §9.3) : `jeuAllume` est le VRAI (extrait), l'état est de papier (`options.etatJeu`).
    etatDuJeuCourant: () => opt.etatJeu || { succes: { ids: [] } },
    Jeu: { vitrine: (e) => (e.succes.ids || []).slice(0, 3) },
    succesDecrit: (id) => ({ id }),
    montrer: () => {}, $: element,
    // 58-1 : le compte des exercices faits vient du module des faits.
    faits: { compterExercices: () => ({ total: 0, faits: 0 }) }, corpus: () => ({}),
    ecrireProfil: (champs) => { ecrits.push(champs); },
    nombreGroupe: (n) => String(n),
    ligneChoix: (cle, libelle) => ({ cle, libelle }),
    marquerProfilVu: () => {}, afficherSaisie: () => {}, allerA: () => {},
    rendreMesExercices: () => {}, rendrePoids: () => {}, ouvrirSaisieProfil: () => {},
    ouvrirRythmeProfil: () => {}, ouvrirJoursProfil: () => {}, ouvrirMotDePasseProfil: () => {},
    ouvrirPeseeProfil: () => {}, jourDuJour: () => '2026-10-14',   // 92 — la ligne « Poids » saisit
    demanderDeconnexion: () => {}, demanderSuppressionCompte: () => {},
    // 60-2a — « Ton but », « Ton temps » et « Terminer mon questionnaire » : ce que
    // l'écran ouvre, relevé (`ouverts`), et le questionnaire (`questionnairesOuverts`).
    ouvrirReponseProfil: (cle) => { ouverts.push(cle); },
    ouvrirQuestionnaire: () => { questionnairesOuverts.push(true); },
    // 60-4 — le programme construit : « Zone à ménager », « Exercices écartés », « Refaire mon programme ».
    ouvrirProgrammeProfil: (quoi) => { programmesOuverts.push(quoi); },
    // 60-3b — « pris entre-temps » : l'état retenu en local par compte (`pseudoPrisSignale`, app.js).
    pseudoPrisSignale: () => !!opt.pseudoPris,
    // 70 — la phrase en tête du Profil après un changement de mot de passe (aucune ici).
    noteProfil: null
  };
  vm.createContext(ctx);
  vm.runInContext(extraire('jeuAllume'), ctx);
  vm.runInContext(extraire('rendreProfilEcran'), ctx);
  vm.runInContext('rendreProfilEcran()', ctx);
  return { vue, bandeau, ecrits, ouverts, questionnairesOuverts, programmesOuverts, section: (titre) => (vue.sections || []).filter((s) => s && s.titre === titre)[0] || null };
}

module.exports = { profilEcran, extraire };

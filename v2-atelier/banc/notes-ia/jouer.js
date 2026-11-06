#!/usr/bin/env node
// v2-atelier/banc/notes-ia/jouer.js — joue les 60 cas de « Lire mes notes » (250, L9) contre la fonction `lire-notes` DÉPLOYÉE.
//
// Décision d'Aurélien du 05/11/2026 : les 60 cas sont joués par Claude.ai contre la fonction déployée, AVANT l'ouverture aux
// utilisateurs ; tant qu'ils ne sont pas passés, `THConfig.NOTES_IA_OUVERTE` reste éteint.
//
//   node v2-atelier/banc/notes-ia/jouer.js --corps                     # n'appelle rien : imprime le corps envoyé pour chaque cas
//   node v2-atelier/banc/notes-ia/jouer.js --url https://<projet>.supabase.co/functions/v1/lire-notes --jeton <JWT> [--sortie f.json]
//   (le jeton peut venir de NOTES_IA_JETON ; c'est celui d'un compte de test qui a donné son accord : profiles.notes_ia_accord_a)
//
// Les cas sont ceux de tests/unit/fixtures/notes-ia-cas.json (écrits pour le test, aucune donnée personnelle). Le script refuse de
// tourner si `CI` est posé (il appelle le vrai modèle : jamais en intégration continue), et n'écrit rien sur la base.
// ⚠️ QUOTA : la fonction partage le quota de « Demander au coach » (10 appels par jour et par compte) ; 60 cas en consomment davantage
// (un appel par cas dont une note part). Il faut donc un compte de test dont le quota est remis à zéro AVANT et, si besoin, EN COURS de
// route (Claude.ai le fait) ; le script s'arrête avec le code 3 et un message clair dès que la fonction répond `quota: 'epuise'`.
// Verdict (le critère de la conception) : moins d'une fausse proposition sur 20 montrées ; ZÉRO proposition sur un cas qui n'en attend
// aucune quand la note parle d'un tiers, d'une injection ou d'un simple « ok ». Code de retour 1 si le verdict est « non ».
'use strict';

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '../../..');
const args = process.argv.slice(2);
const arg = (nom) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : null; };
const soloCorps = args.indexOf('--corps') >= 0;

if (process.env.CI && !soloCorps) { console.error('Refus : CI est posé. Ce script appelle le vrai modèle ; à lancer à la main.'); process.exit(2); }

['modele', 'sync', 'semaine', 'bilan', 'palier', 'moteur', 'seance', 'periode', 'parcours', 'reserve', 'assistant'].forEach((m) => {
  try { require(path.join(RACINE, 'v2/js', m + '.js')); } catch (e) { /* un module optionnel */ }
});
const Faits = require(path.join(RACINE, 'v2/js/faits.js')).creer();
const N = require(path.join(RACINE, 'v2/js/notes-ia.js'));
require(path.join(RACINE, 'supabase/functions/demander-coach/controle.js'));
const K = require(path.join(RACINE, 'supabase/functions/lire-notes/controle-notes.js'));
const cas = require(path.join(RACINE, 'tests/unit/fixtures/notes-ia-cas.json')).cas;

const slug = (nom) => nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function finieDe(c) {
  return {
    id: 's' + c.id, statut: 'terminee', gestes: [], note: c.niveau === 'S' ? c.note : null,
    exercices: c.exercices.map((e, i) => ({
      exercise_slug: slug(e.nom), note: c.niveau === 'E' && i === c.exo ? c.note : null,
      series: e.series.map((s, j) => ({ id: 's' + i + '-' + j, type_serie: s[0], charge_kg: s[1], reps: s[2], validee_a: '2026-11-05T10:00:00Z', rpe: null, ressenti: null, note: null, source: null }))
    }))
  };
}
function contexteDe(c) {
  const noms = {};
  c.exercices.forEach((e) => { noms[slug(e.nom)] = e.nom; });
  return { nom: (s) => noms[s] || s, consignes: () => (c.consigne ? [c.consigne] : []), noteEcrite: (t, cs) => Faits.estUneNote(t, cs), pseudos: [] };
}
const cle = (p) => [p.genre, p.exercice, p.series, p.rpe, p.reserve, p.type].join('|');

async function appeler(url, jeton, corps) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jeton, apikey: jeton }, body: JSON.stringify(corps) });
  if (!r.ok) return { statut: r.status, propositions: null };
  const j = await r.json();
  return { statut: r.status, propositions: Array.isArray(j.propositions) ? j.propositions : null, quota: j.quota === 'epuise' };
}

(async () => {
  const url = arg('--url');
  const jeton = arg('--jeton') || process.env.NOTES_IA_JETON;
  if (!soloCorps && (!url || !jeton)) { console.error('Il faut --url et --jeton (ou NOTES_IA_JETON), ou --corps.'); process.exit(2); }

  const lignes = [];
  let montrees = 0, fausses = 0, attendues = 0, trouvees = 0, erreurs = 0;
  const graves = [];

  for (const c of cas) {
    const f = finieDe(c);
    const ctx = contexteDe(c);
    const r = N.candidates(f, ctx);
    const envoye = r.envoyer.length > 0;
    const corps = envoye ? N.corps(f, r.envoyer, ctx) : null;
    const ideal = (c.attendu.sortie || []);
    if (soloCorps) { console.log(JSON.stringify({ id: c.id, envoye, corps })); continue; }
    if (!envoye) { lignes.push({ id: c.id, envoye: false, ok: !ideal.length }); continue; }
    let rep;
    try { rep = await appeler(url, jeton, corps); } catch (e) { rep = { statut: 0, propositions: null }; }
    // Le quota PARTAGÉ avec « Demander au coach » (10 par jour et par compte) est épuisé : la fonction rend alors 200 et une liste vide,
    // indiscernable d'un « rien à proposer » sans ce champ. On s'ARRÊTE : continuer fausserait le verdict.
    if (rep.quota) { console.error('ARRÊT au cas ' + c.id + ' : le quota du compte de test est épuisé (200 + quota: epuise). Claude.ai remet le quota à zéro (table assistant_quota, ligne du compte), puis on relance. Aucun verdict.'); process.exit(3); }
    if (rep.propositions === null) { erreurs++; lignes.push({ id: c.id, envoye: true, erreur: rep.statut }); continue; }
    // Ce que le téléphone montrerait : `retenir` revérifie tout contre la note locale.
    const vues = N.retenir({ propositions: rep.propositions }, f, r.envoyer, [], Object.assign({}, ctx, { noteExistante: () => c.noteActuelle || null }));
    const attendu = c.attendu.vues || [];
    montrees += vues.length;
    attendues += attendu.length;
    const faux = vues.filter((v) => !attendu.some((a) => a.genre === v.genre && a.exercice === v.iExo &&
      (v.genre === 'reglage' || (JSON.stringify(a.rangs) === JSON.stringify(v.rangs) && a.valeur === v.valeur))));
    const justes = vues.length - faux.length;
    trouvees += justes;
    fausses += faux.length;
    if (!attendu.length && vues.length && (K.raisonDeRetrait(c.note) === 'tiers' || /\b(?:ok|ignore|instruction|prompt)\b/i.test(c.note) || N.parleDUnTiers(c.note))) graves.push(c.id);
    lignes.push({ id: c.id, envoye: true, note: c.note, attendu: ideal.map(cle), recu: rep.propositions.map(cle), montrees: vues.length, fausses: faux.length });
  }
  if (soloCorps) return;

  const taux = montrees ? fausses / montrees : 0;
  const verdict = { cas: cas.length, erreurs, montrees, fausses, tauxDeFausses: Number(taux.toFixed(3)), attendues, trouvees, graves, ok: erreurs === 0 && taux < 0.05 && graves.length === 0 };
  const sortie = { date: new Date().toISOString(), url, verdict, lignes };
  const f = arg('--sortie');
  if (f) fs.writeFileSync(f, JSON.stringify(sortie, null, 1));
  lignes.filter((l) => l.fausses || l.erreur).forEach((l) => console.log('à relire : cas ' + l.id + ' ' + JSON.stringify(l)));
  console.log(JSON.stringify(verdict));
  process.exit(verdict.ok ? 0 : 1);
})();

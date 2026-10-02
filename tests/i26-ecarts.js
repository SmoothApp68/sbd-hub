// tests/i26-ecarts.js — I26 (MOTEUR §20 bis) : LIRE ET IDENTIFIER UN ÉCART.
//
// Partagé par le test des cas (`tests/unit/v2-coherence-phrases.test.js`) et
// le compte du banc (`tests/banc/garde-compte.js`).
//
// ⚠️ UN ÉCART S'IDENTIFIE PAR SA CAUSE ET SON ENDROIT, PAS PAR SON TEXTE
// (consolidation, PR 7 ; recommandation de #357 validée par Claude.ai). Les
// chiffres d'un constat dépendent des séances laissées par les sections jouées
// avant lui : le séquentiel disait « 80 kg : 6 reps… 7 », le parallèle « 7…
// 8 » — la même cause, au même endroit. L'identité d'un écart est donc :
// son plan (le cas) ou sa section (le banc), son exercice, l'endroit de la
// phrase (`ou`), sa cause et sa LECTURE — la formule qui l'a produit. Le
// séquentiel et le parallèle donnent alors la même liste.

// LA LECTURE DE LA CAUSE, pour chaque écart. Un chiffre écrit à la main se
// reconnaît au gabarit qui l'entoure (`N` : un nombre) ; les autres causes ont
// chacune leur lecture, écrite ici — et un écart qu'aucune ne décrit fait
// échouer le test (une cause qu'on n'a pas lue).
const N_ = '(\\d+(?:,\\d+)?)';
const GABARITS = [
  ['sur les ' + N_ + ' dernières séries', 'lignesJaunes / enteteDeDisposition : le nombre de séries du haut (`haut.k`) est écrit à la main'],
  ['sur les ' + N_ + ' d\'avant', 'lignesJaunes : le nombre de séries de la ligne (`n − k`) est écrit à la main'],
  [' sur ' + N_ + ' séries', 'enteteDeDisposition : le nombre de séries d\'un segment est écrit à la main'],
  [N_ + ' de plus que (?:visé|prévu)', 'phraseReaction : la marge (`m.marge`) est écrite à la main'],
  ['(?:ta série|dès la série) ' + N_, 'phraseReaction : le numéro de la série (`m.rang + 1`) est écrit à la main'],
  ['vise ' + N_ + ' à ' + N_, 'phraseReaction : les bornes de la zone (`z.bas`, `z.haut`) sont écrites à la main'],
  ['tient sur ' + N_ + ' séries', 'phraseExtension : le nombre de séries (`e.k`) est écrit à la main'],
  ['Il te manque ' + N_ + ' reps', 'suiteDuJour : le manque (`z.haut − fait`) est écrit à la main'],
  ['quand tu y feras ' + N_ + ' reps', 'phraseGrise (« attend ») : le seuil (`f.seuil`) est écrit à la main'],
  ['quand tu feras ' + N_ + ' reps', 'phraseGrise / suiteDuJour (étirement) : la cible (`f.cible`) est écrite à la main'],
  ['^' + N_ + ' reps à ', 'phraseGrise (« retest ») : la cible (`f.cible`) est écrite à la main'],
  [N_ + ' séries? au lieu de ' + N_, 'detailAllegee : les séries de la semaine allégée sont écrites à la main'],
  ['jusqu’au ' + N_, 'bandeauAllegee : la date est écrite à la main, pas par `quand`'],
  ['va jusqu\'à ' + N_ + ' : je vise ' + N_, 'phraseBorneZone : la borne de la zone (`z.haut`) est écrite à la main'],
  [N_ + ' reps (?:le |lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|hier|aujourd)', 'verdictDuJour : le niveau d\'avant (`nivAvant`) est écrit à la main'],
  [', ' + N_ + ' aujourd\'hui', 'verdictDuJour : le niveau du jour (`fait`) est écrit à la main'],
  [N_ + ' reps au-dessus du haut', 'phraseGrise (« test proposé ») : la constante `PREUVE_DEPASSEMENT` est écrite à la main'],
  ['^Sous ' + N_ + ' reps', 'phraseGrise (« bord ») : la borne du rangement est écrite à la main'],
  ['jusqu\'à ' + N_ + ' reps', 'phraseGrise (« garde ») : le haut de la zone est écrit à la main'],
  ['à RPE ' + N_, 'phraseGrise (série à fond) : « RPE 10 » est écrit à la main'],
  ['compte pour ' + N_, 'phraseGrise (série à fond) : les reps comptées (`a.comptees`) sont écrites à la main'],
  [N_ + ' % des séries', 'DETAIL_CARTE : la constante (60 %) est écrite dans le texte'],
  [N_ + ' reps de moins', 'DETAIL_CARTE : la constante (2 reps) est écrite dans le texte'],
  ['pendant ' + N_ + ' jours', 'DETAIL_CARTE : la constante (7 jours) est écrite dans le texte'],
  ['depuis ' + N_ + ' séances', 'phraseCarte : le compteur est écrit à la main'],
  ['et ' + N_ + ' autres exercices', 'phraseCarte : le nombre d\'exercices est écrit à la main']
].map(([m, l]) => [new RegExp(m, 'g'), l]);
// Les écarts de fond, lus un par un (la phrase n'est pas corrigée ici).
const LECTURES = [
  [(e) => e.cause === 'fait_different' && /pas encore dans ta zone\. Ta machine ne permet pas/.test(e.phrase),
   'verdictDuJour : après un étirement, le test de la consigne suivante (`fondement.test`) date d\'une séance ANTÉRIEURE, mais le verdict le raconte comme celui du jour — la séance du jour n\'a fait que la ligne'],
  [(e) => e.cause === 'fait_different' && /^Aujourd'hui/.test(e.phrase),
   'verdictDuJour (séance plus légère) : la charge et les reps viennent de la consigne suivante (`cApres.palier`), pas d\'une ligne couverte du jour ; soit une série hors plan, soit le verdict cite une autre séance — à trancher'],
  [(e) => e.cause === 'fait_different' && /faite.*le cran au-dessus/.test(e.phrase),
   'lignesDeLaFeuille : une ligne validée sans charge se dit « faite : le cran au-dessus × 3 » — le repli de la charge INCONNUE du coach sert à dire une série FAITE'],
  [(e) => e.cause === 'cible_hors_lignes' && /passera à|y passera/.test(e.phrase),
   '« attend » (phrase grise et feuille « Pourquoi ») : la charge annoncée (`haut.charge`) n\'est sur aucune ligne du jour — la routine ne porte pas la ligne haute'],
  [(e) => e.cause === 'cible_hors_lignes',
   'une cible du jour qui n\'est sur aucune ligne couverte du plan'],
  [(e) => e.cause === 'fait_sans_source', 'un fait passé sans source dans le plan'],
  [(e) => e.cause === 'mot_interdit', 'un « null » ou « undefined » écrit dans la phrase']
];
function lectureDe(e) {
  if (e.cause === 'hors_formateur') {
    const t = e.phrase.replace(/ /g, ' ');
    for (const [re, l] of GABARITS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t))) if (m.slice(1).indexOf(e.citation) >= 0) return l;
    }
    return null;
  }
  const l = LECTURES.filter(([f]) => f(e))[0];
  return l ? l[1] : null;
}

// Un écart de la liste : le cas, l'exercice, la phrase (où et quoi), la
// citation, ce que la garde attendait, et la cause. Les doublons d'un même cas
// (le même plan revu à chaque geste) n'en font qu'un.
const cleDEcart = (e) => [e.plan, e.section || '', e.exercice || '', e.ou, e.cause,
  lectureDe(e) || ('(sans lecture) ' + e.phrase)].map((v) => String(v)).join(' ¦ ');
function listeDe(ecarts) {
  const vus = new Map();
  ecarts.forEach((e) => {
    const k = cleDEcart(e);
    if (!vus.has(k)) {
      vus.set(k, { plan: e.plan, section: e.section || null, exercice: e.exercice || null, ou: e.ou, phrase: e.phrase,
                   citation: e.citation, attendu: e.attendu, cause: e.cause, lecture: lectureDe(e) });
    }
  });
  return Array.from(vus.values()).sort((a, b) => (cleDEcart(a) < cleDEcart(b) ? -1 : cleDEcart(a) > cleDEcart(b) ? 1 : 0));
}


module.exports = { lectureDe, cleDEcart, listeDe, GABARITS, LECTURES };

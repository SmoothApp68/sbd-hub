//
// Chantier 46 §2 — l'écran profil, et l'écran d'entrée (ECRAN-PROFIL-V1).
//
// ══ CE QUE CE FICHIER TIENT ════════════════════════════════════════════════
//
//   · test 6  — un profil vide affiche « à renseigner » PARTOUT, sans alarme ;
//   · test 7  — le bandeau d'accueil, et sa sortie « plus tard » ;
//   · test 9  — le segment Progresser / Entretenir, et ce qu'il enregistre ;
//   · test 11 — la confirmation de suppression DIT CE QUI PART, en chiffres ;
//   · l'écran d'entrée, ses deux modes, et sa remise à zéro.
//
// (Le test 8 du prompt — « niveau mesuré affiché, non saisissable » — est VIDE
// par décision de spec : `ECRAN-PROFIL-V1` §2.4 ter retire le niveau mesuré le
// 18/09. `standards_opl.json` interdit d'afficher ses percentiles, et
// restreindre aux premières compétitions ne baisse la médiane que de 5 %. Seul
// le niveau DÉCLARÉ subsiste — et il est testé ici comme les autres.)
//
// ⚠️ CONFIGURATIONS DISCRIMINANTES (CADRAGE-V2 §2 quater) :
//
//   · pour le test 6, un profil VIDE et un profil PLEIN dans le même fichier.
//     Sur un profil vide seul, « j'affiche à renseigner » et « je n'affiche
//     rien » se ressemblent trop ; sur un profil plein seul, la mention ne
//     serait jamais exercée ;
//   · pour le test 11, des chiffres NON NULS et DIFFÉRENTS les uns des autres
//     (1221 séances, 28103 séries, 116 pesées). Avec des zéros, ou avec trois
//     fois le même nombre, une phrase qui recopierait le mauvais compte
//     passerait sans qu'on le voie ;
//   · pour l'entrée, la bascule dans les DEUX SENS. Un test qui n'irait que
//     vers l'inscription ne verrait jamais un champ oublié ouvert.
//
// Environnement jsdom (PAS de docblock `node`) : `rendu.js` se termine par `this`.

require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Profil = require('../../v2/js/profil.js');
const R = () => window.THRendu;

const AUJ = new Date(2026, 8, 18);

function cible() {
  const n = document.createElement('div');
  document.body.appendChild(n);
  return n;
}

// La déclaration des sections, telle qu'app.js la construit — reproduite ici
// avec les mêmes libellés, pour que le test dise quelque chose de l'écran réel.
function vueProfil(p, options) {
  const o = options || {};
  const lib = (liste, cle) => Profil.libelleDe(liste, p[cle]);
  return {
    accueil: p.onboarding_completed === false
      ? { surPlusTard: o.surPlusTard || (() => {}) } : null,
    kpis: [
      { valeur: String(o.seances || 0), libelle: 'séances' },
      { valeur: String(o.series || 0), libelle: 'séries' },
      { valeur: Profil.libelleAnciennete(o.annees === undefined ? null : o.annees),
        libelle: 'd’historique' }
    ],
    sections: [
      { titre: 'CE QUE JE FAIS', lignes: [
        { libelle: 'Discipline', valeur: lib(Profil.DISCIPLINES_CONNUES, 'mode_entrainement'),
          surChoix: () => {} },
        { libelle: 'Matériel', sous: 'Décide des exercices proposés',
          valeur: lib(Profil.MATERIELS, 'materiel'), surChoix: () => {} }
      ] },
      // ⚠️ LA VRAIE FONCTION AUSSI (60-1) : « Progresser » / « Juste un
      // carnet » et sa phrase se construisent dans `profil.js`, pour l'écran
      // comme pour ce test.
      Profil.sectionIntention(p, o.surIntention || (() => {})),
      // ⚠️ LA VRAIE FONCTION, PAS UNE COPIE. Tout le reste de cette vue
      // reproduit la déclaration d'`app.js` ; la section du rythme, elle,
      // porte une règle et une colonne écrite, et `profil.js` la construit
      // pour l'écran comme pour ce test. C'est le banc de mutation qui l'a
      // imposé : muté dans `app.js`, rien ne tombait.
      Profil.sectionRythme(p, o.surRythme || (() => {})),
      { titre: 'DEPUIS QUAND', lignes: [
        { libelle: 'Entraînement régulier', valeur: lib(Profil.ANCIENNETES, 'anciennete'),
          surChoix: () => {} },
        { libelle: 'Niveau déclaré', valeur: lib(Profil.NIVEAUX, 'niveau_declare'),
          surChoix: () => {} }
      ] },
      { titre: 'MON CORPS', lignes: [
        { libelle: 'Taille', valeur: p.taille_cm ? p.taille_cm + ' cm' : null, surChoix: () => {} },
        { libelle: 'Date de naissance', valeur: p.date_naissance || null, surChoix: () => {} },
        { libelle: 'Sexe', valeur: lib(Profil.SEXES, 'sexe'), surChoix: () => {} }
      ] },
      { titre: 'TA SEMAINE', lignes: [
        { libelle: 'Séances par semaine', valeur: p.seances_par_semaine || null, surChoix: () => {} },
        { libelle: 'Jours', valeur: Profil.libelleJours(p.jours_vises), surChoix: () => {} },
        { libelle: 'Durée d’une séance',
          valeur: p.duree_seance_min ? p.duree_seance_min + ' min' : null, surChoix: () => {} }
      ] }
    ],
    surQuitter: o.surQuitter || (() => {}),
    surSupprimer: o.surSupprimer || (() => {})
  };
}

const lignes = (c) => Array.from(c.querySelectorAll('.p-ligne'));
const valeurs = (c) => lignes(c).map((l) => {
  const v = l.querySelector('.p-val');
  return v ? v.textContent : null;
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 6 — UN PROFIL VIDE
// ════════════════════════════════════════════════════════════════════════════

describe('test 6 — profil vide : tous les champs « à renseigner »', () => {
  // Ce que la base rend pour un compte tout neuf : quatre colonnes NOT NULL à
  // leur défaut, tout le reste à null. Pas un objet vide inventé pour le test.
  const NEUF = {
    username: null, bio: '', sexe: 'non_precise', taille_cm: null,
    date_naissance: null, mode_entrainement: 'musculation', unites: 'kg',
    anciennete: null, intention: 'progresser', materiel: null,
    niveau_declare: null, seances_par_semaine: null, jours_vises: null,
    duree_seance_min: null, onboarding_completed: false
  };

  test('chaque champ non renseigné le dit, en toutes lettres', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(NEUF));
    const vides = lignes(c).filter((l) => l.querySelector('.p-val.vide'));
    // Les cinq champs vraiment vides : matériel, ancienneté, niveau, taille,
    // naissance, séances/semaine, jours, durée.
    expect(vides.length).toBe(8);
    vides.forEach((l) => expect(l.querySelector('.p-val').textContent).toBe('à renseigner'));
  });

  // ⚠️ RIEN N'EST ROUGE, RIEN NE BLOQUE (§4). Un profil vide est un état, pas
  // une erreur : aucune classe d'alarme, aucun bouton désactivé.
  test('« à renseigner » n’est pas une alarme : ni erreur, ni manque, ni blocage', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(NEUF));
    expect(c.querySelectorAll('.erreur, .feuille-err, .manque').length).toBe(0);
    expect(Array.from(c.querySelectorAll('button')).some((b) => b.disabled)).toBe(false);
  });

  // Les colonnes NOT NULL portent leur DÉFAUT, pas un vide : les afficher
  // « à renseigner » annoncerait un manque qui n'existe pas en base.
  test('ce qui a un défaut en base s’affiche, il ne se dit pas vide', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(NEUF));
    expect(valeurs(c)).toContain('Musculation');
    expect(valeurs(c)).toContain('Non précisé');
  });

  test('un profil PLEIN n’affiche plus aucun « à renseigner »', () => {
    const plein = Object.assign({}, NEUF, {
      taille_cm: 182, date_naissance: '1998-03-12', materiel: 'salle_complete',
      anciennete: '3_a_5_ans', niveau_declare: 'avance', sexe: 'homme',
      mode_entrainement: 'powerbuilding', seances_par_semaine: 5,
      jours_vises: ['lun', 'mar', 'jeu', 'ven', 'sam'], duree_seance_min: 90,
      onboarding_completed: true
    });
    const c = cible();
    R().rendreProfil(c, vueProfil(plein));
    expect(c.querySelectorAll('.p-val.vide').length).toBe(0);
    expect(valeurs(c)).toContain('Powerbuilding');
    expect(valeurs(c)).toContain('Salle complète');
    expect(valeurs(c)).toContain('3 à 5 ans');
    expect(valeurs(c)).toContain('Avancé');
    expect(valeurs(c)).toContain('Lu · Ma · Je · Ve · Sa');
    expect(valeurs(c)).toContain('90 min');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 7 — LE BANDEAU D'ACCUEIL ET SA SORTIE
// ════════════════════════════════════════════════════════════════════════════

describe('test 7 — l’onboarding EST le profil, et il est contournable', () => {
  test('un compte neuf voit le bandeau, et sa sortie', () => {
    const c = cible();
    let sorti = false;
    R().rendreProfil(c, vueProfil({ onboarding_completed: false },
      { surPlusTard: () => { sorti = true; } }));
    const bandeau = c.querySelector('.p-accueil');
    expect(bandeau).not.toBe(null);
    const plus = bandeau.querySelector('.p-plus-tard');
    expect(plus.textContent).toContain('Plus tard');
    plus.click();
    expect(sorti).toBe(true);
  });

  // ⚠️ CONTOURNABLE, OBLIGATOIREMENT. La sortie est un VRAI bouton, pas un lien
  // discret : « un utilisateur avec 138 séances d'historique n'a aucune raison
  // de répondre à cinq questions avant de voir ce qu'il a fait » (§4).
  test('la sortie est un bouton, pas un lien qu’on cherche', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ onboarding_completed: false }));
    const plus = c.querySelector('.p-plus-tard');
    expect(plus.tagName).toBe('BUTTON');
    expect(plus.disabled).toBe(false);
  });

  test('un compte déjà vu n’a plus de bandeau', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ onboarding_completed: true }));
    expect(c.querySelector('.p-accueil')).toBe(null);
  });

  // `undefined` — le cas d'un profil pas encore chargé — ne déclenche RIEN :
  // on n'ouvre pas un formulaire de bienvenue sur une supposition.
  test('un profil inconnu ne déclenche pas la bienvenue', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({}));
    expect(c.querySelector('.p-accueil')).toBe(null);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 9 — PROGRESSER / ENTRETENIR
// ════════════════════════════════════════════════════════════════════════════

describe('test 9 — l’intention se règle, et ce qui part est la clé de la base', () => {
  // ⚠️ PORTÉ SUR SON GROUPE LE 19/09/2026 (48b-4). Ces trois tests
  // interrogeaient `.p-seg button` sur TOUT l'écran, ce qui était sans
  // ambiguïté tant que l'intention était le seul sélecteur. « Ton rythme » en
  // ajoute un second, de trois boutons : un sélecteur global lirait désormais
  // cinq boutons et mélangerait les deux réglages. Les assertions, elles, sont
  // exactement celles d'avant.
  const segIntention = (c) => {
    const t = Array.from(c.querySelectorAll('.p-sect')).find((n) => n.textContent === 'POURQUOI');
    return t.nextElementSibling.querySelectorAll('.p-seg button');
  };

  test('deux crans, et celui en vigueur est marqué', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ intention: 'progresser' }));
    const seg = segIntention(c);
    expect(seg.length).toBe(2);
    expect(seg[0].textContent).toBe('Progresser');
    expect(seg[1].textContent).toBe('Juste un carnet');
    expect(seg[0].className).toBe('on');
    expect(seg[0].getAttribute('aria-pressed')).toBe('true');
    expect(seg[1].getAttribute('aria-pressed')).toBe('false');
  });

  // ⚠️ CE QUI PART EST « entretien », PAS « Juste un carnet ». `profiles_intention_ok`
  // n'accepte que `progresser` et `entretien` — envoyer le libellé partirait en
  // 23514, code que la file classe DÉFINITIF. `ecrire` reçoit l'objet COMPLET,
  // comme pour « Ton rythme ».
  test('choisir « Juste un carnet » enregistre la clé, pas le libellé', () => {
    const c = cible();
    let ecrit = null;
    R().rendreProfil(c, vueProfil({ intention: 'progresser' },
      { surIntention: (v) => { ecrit = v; } }));
    segIntention(c)[1].click();
    expect(ecrit).toEqual({ intention: 'entretien' });
  });

  test('une fois en Entretenir, c’est lui qui est marqué', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ intention: 'entretien' }));
    const seg = segIntention(c);
    expect(seg[1].className).toBe('on');
    expect(seg[0].className).toBe('');
  });

  test('la note dit ce que le moteur fait, et ce qu’il ne fait pas', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({}));
    // Portée sur son groupe pour la même raison : l'écran porte maintenant
    // deux notes, et la première n'est la bonne que par accident d'ordre.
    const t = Array.from(c.querySelectorAll('.p-sect')).find((n) => n.textContent === 'POURQUOI');
    const note = t.nextElementSibling.querySelector('.p-note').textContent;
    expect(note).toContain('propose des charges');
    expect(note).toContain('Juste un carnet');
  });

  test('en « Juste un carnet », la note dit ce qu’il se passe : je me tais, les séries restent pré-remplies', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ intention: 'entretien' }));
    const t = Array.from(c.querySelectorAll('.p-sect')).find((n) => n.textContent === 'POURQUOI');
    const note = t.nextElementSibling.querySelector('.p-note').textContent;
    expect(note).toContain('Je me tais');
    expect(note).toContain('pré-remplies');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 11 — SUPPRIMER SON COMPTE
// ════════════════════════════════════════════════════════════════════════════

describe('test 11 — la confirmation dit ce qui part', () => {
  test('les deux gestes existent, dans l’ordre, et ne se confondent pas', () => {
    const c = cible();
    let quitte = false, supprime = false;
    R().rendreProfil(c, vueProfil({}, {
      surQuitter: () => { quitte = true; },
      surSupprimer: () => { supprime = true; }
    }));
    const q = c.querySelector('.p-quitter'), s = c.querySelector('.p-supprimer');
    expect(q.textContent).toBe('Quitter');
    expect(s.textContent).toBe('Supprimer mon compte');
    // L'ordre dans le DOM EST l'ordre à l'écran : Quitter d'abord, Supprimer
    // dessous. Les inverser rendrait le geste irréversible le plus accessible.
    expect(q.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    q.click(); expect(quitte).toBe(true); expect(supprime).toBe(false);
    s.click(); expect(supprime).toBe(true);
  });

  // ⚠️ « ES-TU SÛR ? » NE DIT RIEN. Des chiffres réels se comprennent sans
  // réfléchir — et ce sont trois nombres DIFFÉRENTS, pour qu'une phrase qui
  // recopierait le mauvais compte se voie.
  test('la confirmation nomme ce qui part, en chiffres', () => {
    const c = cible();
    let confirme = false;
    R().rendreFeuilleConfirmer(c, {
      titre: 'Supprimer mon compte',
      aide: 'Partent définitivement : ton profil, tes 1 221 séances et leurs ' +
            '28 103 séries, tes 116 pesées, tes routines. ' +
            'Rien n’est conservé et rien ne se récupère.',
      libelle: 'Supprimer définitivement',
      danger: true,
      surConfirmer: () => { confirme = true; },
      surAnnuler: () => {}
    });
    const aide = c.querySelector('.feuille-aide').textContent;
    expect(aide).toContain('1 221 séances');
    expect(aide).toContain('28 103 séries');
    expect(aide).toContain('116 pesées');
    expect(aide).toContain('rien ne se récupère');

    // Le bouton de confirmation porte le danger, et il n'est pas le premier
    // qu'on touche par réflexe : « Annuler » existe et est distinct.
    const boutons = Array.from(c.querySelectorAll('.feuille-menu button'));
    expect(boutons.map((b) => b.textContent))
      .toEqual(['Supprimer définitivement', 'Annuler']);
    expect(boutons[0].className).toBe('danger');
    boutons[0].click();
    expect(confirme).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LES FEUILLES DU PROFIL
// ════════════════════════════════════════════════════════════════════════════

describe('la feuille de choix', () => {
  test('elle marque ce qui est en vigueur, et rend la CLÉ', () => {
    const c = cible();
    let choisi = null;
    R().rendreFeuilleChoix(c, {
      titre: 'Matériel', options: Profil.MATERIELS, valeur: 'salle_basique',
      surChoix: (v) => { choisi = v; }, surAnnuler: () => {}
    });
    const b = Array.from(c.querySelectorAll('.feuille-menu button'));
    expect(b.length).toBe(5);
    expect(b.filter((x) => x.className === 'choisi').length).toBe(1);
    expect(b.find((x) => x.className === 'choisi').dataset.cle).toBe('salle_basique');
    expect(c.querySelectorAll('.choix-coche').length).toBe(1);
    b[0].click();
    expect(choisi).toBe('salle_complete');
  });

  // ⚠️ « Effacer » N'EST OFFERT QUE SUR UNE COLONNE QUI ACCEPTE NULL. `sexe`,
  // `mode_entrainement` et `unites` sont NOT NULL : le proposer promettrait une
  // écriture que Postgres refuserait en 23502.
  test('« Effacer » n’apparaît que quand la colonne accepte NULL', () => {
    const avec = cible();
    R().rendreFeuilleChoix(avec, { titre: 'Matériel', options: Profil.MATERIELS,
      valeur: null, surChoix: () => {}, surEffacer: () => {}, surAnnuler: () => {} });
    expect(avec.querySelector('.feuille-pied .des')).not.toBe(null);

    const sans = cible();
    R().rendreFeuilleChoix(sans, { titre: 'Sexe', options: Profil.SEXES,
      valeur: 'homme', surChoix: () => {}, surEffacer: null, surAnnuler: () => {} });
    expect(sans.querySelector('.feuille-pied .des')).toBe(null);
  });
});

describe('la feuille de saisie', () => {
  // ⚠️ UN REFUS NE FERME PAS LA FEUILLE. Fermer sur une valeur invalide
  // perdrait la saisie sans rien dire.
  test('une valeur refusée affiche sa phrase et reste dans la feuille', () => {
    const c = cible();
    let valide = 0;
    R().rendreFeuilleSaisie(c, {
      titre: 'Taille', etiquette: 'En centimètres', valeur: 182,
      surValider: (v) => {
        valide++;
        return Profil.tailleValide(v) === null ? 'Une taille entre 100 et 250 cm.' : null;
      },
      surAnnuler: () => {}
    });
    const champ = c.querySelector('.champ-texte input');
    const valider = c.querySelector('.feuille-pied .pri');
    expect(champ.value).toBe('182');

    champ.value = '3';
    valider.click();
    expect(c.querySelector('.feuille-err').textContent).toContain('entre 100 et 250');

    champ.value = '184';
    valider.click();
    expect(valide).toBe(2);
  });

  test('un textarea quand on demande plusieurs lignes', () => {
    const c = cible();
    R().rendreFeuilleSaisie(c, { titre: 'Bio', lignes: 3, max: 280, valeur: 'salut',
      surValider: () => null, surAnnuler: () => {} });
    const n = c.querySelector('.champ-texte textarea');
    expect(n).not.toBe(null);
    expect(n.rows).toBe(3);
    expect(n.maxLength).toBe(280);
  });
});

describe('la feuille des jours', () => {
  // ⚠️ MULTI-CHOIX : on coche, PUIS on valide. Une fermeture au premier doigt
  // rendrait impossible d'en choisir cinq.
  test('cocher n’enregistre pas ; valider rend la semaine entière', () => {
    const c = cible();
    let rendu = null;
    R().rendreFeuilleJours(c, {
      jours: Profil.JOURS, valeur: ['lun'],
      surValider: (l) => { rendu = l; }, surAnnuler: () => {}
    });
    const b = Array.from(c.querySelectorAll('.p-jours button'));
    expect(b.length).toBe(7);
    expect(b[0].className).toBe('on');
    b[3].click();          // jeudi
    b[0].click();          // lundi décoché
    expect(rendu).toBe(null);
    c.querySelector('.feuille-pied .pri').click();
    expect(Profil.joursValides(rendu)).toEqual(['jeu']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// L'ÉCRAN D'ENTRÉE — CONNEXION ET INSCRIPTION
// ════════════════════════════════════════════════════════════════════════════

describe('l’écran d’entrée : un écran, deux modes', () => {
  function monter() {
    const c = cible();
    c.innerHTML =
      '<div id="ph"></div><div id="env-pseudo" hidden></div>' +
      '<button id="ou"></button><em id="am" hidden></em>' +
      '<button id="bt"></button><button id="ba"></button><span id="bav"></span>' +
      '<input id="ce"><input id="cm">';
    return {
      phrase: c.querySelector('#ph'), pseudo: c.querySelector('#env-pseudo'),
      oubli: c.querySelector('#ou'), aideMdp: c.querySelector('#am'),
      bouton: c.querySelector('#bt'), bascule: c.querySelector('#ba'),
      basculeAvant: c.querySelector('#bav'),
      champEmail: c.querySelector('#ce'), champMdp: c.querySelector('#cm')
    };
  }

  test('en connexion : la phrase d’accueil, pas de pseudo, « mot de passe oublié »', () => {
    const v = monter(); v.mode = 'connexion';
    R().rendreEntree(v);
    expect(v.phrase.textContent).toBe('Le carnet qui ne raconte pas d’histoires.');
    expect(v.pseudo.hidden).toBe(true);
    expect(v.oubli.hidden).toBe(false);
    expect(v.bouton.textContent).toBe('Se connecter');
    expect(v.basculeAvant.textContent).toBe('Pas encore de compte ? ');
    expect(v.bascule.textContent).toBe('Créer un compte');
    expect(v.champEmail.autocomplete).toBe('username');
    expect(v.champMdp.autocomplete).toBe('current-password');
  });

  test('en inscription : trois champs, et rien de plus', () => {
    const v = monter(); v.mode = 'inscription';
    R().rendreEntree(v);
    expect(v.phrase.textContent).toBe('Ton profil se remplit après, à ton rythme.');
    expect(v.pseudo.hidden).toBe(false);
    expect(v.oubli.hidden).toBe(true);
    expect(v.aideMdp.hidden).toBe(false);
    expect(v.bouton.textContent).toBe('Créer mon compte');
    expect(v.basculeAvant.textContent).toBe('Déjà un compte ? ');
    expect(v.bascule.textContent).toBe('Se connecter');
  });

  // ⚠️ L'AUTO-REMPLISSAGE CHANGE AVEC LE MODE. En connexion l'identifiant est
  // l'e-mail ; à l'inscription c'est le pseudo, et un gestionnaire de mots de
  // passe qui reçoit `current-password` sur une CRÉATION propose l'ancien.
  test('l’auto-remplissage suit le mode, dans les deux sens', () => {
    const v = monter();
    v.mode = 'inscription'; R().rendreEntree(v);
    expect(v.champEmail.autocomplete).toBe('email');
    expect(v.champMdp.autocomplete).toBe('new-password');
    v.mode = 'connexion'; R().rendreEntree(v);
    expect(v.champEmail.autocomplete).toBe('username');
    expect(v.champMdp.autocomplete).toBe('current-password');
    expect(v.pseudo.hidden).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════════════════
// 48b-4 — « TON RYTHME » (MOTEUR §9.8 · ECRAN-PROFIL §2.3)
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ CONFIGURATION DISCRIMINANTE (`CADRAGE-V2` §2 quater) : les TROIS valeurs,
// plus l'absence de valeur, plus l'Entretenir. Sur le seul défaut, « j'affiche
// Normal parce que c'est la valeur » et « j'affiche Normal quoi qu'il arrive »
// se ressemblent ; sur le seul Progresser, la condition d'affichage ne serait
// jamais exercée. Et les trois phrases doivent être vérifiées SÉPARÉMENT :
// deux d'entre elles permutées passeraient un test qui n'en lit qu'une.
describe('48b-4 — le réglage de rythme, dans Profil', () => {
  const BASE = {
    username: 'aurel_br', bio: '', sexe: 'homme', taille_cm: 182,
    date_naissance: '1998-01-01', mode_entrainement: 'musculation', unites: 'kg',
    anciennete: '5_ans_plus', intention: 'progresser', materiel: 'salle',
    niveau_declare: 'avance', seances_par_semaine: 5, jours_vises: null,
    duree_seance_min: 90, onboarding_completed: true
  };
  const avec = (o) => Object.assign({}, BASE, o);
  const titres = (c) => Array.from(c.querySelectorAll('.p-sect')).map((n) => n.textContent);
  // Le groupe qui suit le titre « TON RYTHME » — c'est lui qui porte le
  // sélecteur et la note.
  const groupeRythme = (c) => {
    const t = Array.from(c.querySelectorAll('.p-sect')).find((n) => n.textContent === 'TON RYTHME');
    return t ? t.nextElementSibling : null;
  };
  const boutons = (g) => Array.from(g.querySelectorAll('.p-seg button'));
  const actif = (g) => {
    const b = boutons(g).find((x) => x.getAttribute('aria-pressed') === 'true');
    return b ? b.textContent : null;
  };
  const note = (g) => g.querySelector('.p-note').textContent;

  test('sans valeur en base, le choix affiché est Normal, avec SA phrase', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ rythme_progression: undefined })));
    const g = groupeRythme(c);
    expect(g).not.toBeNull();
    expect(boutons(g).map((b) => b.textContent)).toEqual(['Prudent', 'Normal', 'Franc']);
    expect(actif(g)).toBe('Normal');
    expect(note(g)).toContain('Monte quand tes deux premières séries touchent le haut de ta zone.');
    expect(note(g)).toContain('La prochaine consigne en tient compte.');
  });

  test('DISCRIMINANT — Prudent : son bouton actif ET sa phrase', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ rythme_progression: 'prudent' })));
    const g = groupeRythme(c);
    expect(actif(g)).toBe('Prudent');
    expect(note(g)).toContain('Monte quand toutes tes séries touchent le haut de ta zone, deux séances de suite.');
    // Et pas celle d'un autre : deux phrases permutées passeraient sans ça.
    expect(note(g)).not.toContain('deux premières séries');
    expect(note(g)).not.toContain('pour son compte');
  });

  test('DISCRIMINANT — Franc : son bouton actif ET sa phrase', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ rythme_progression: 'franc' })));
    const g = groupeRythme(c);
    expect(actif(g)).toBe('Franc');
    expect(note(g)).toContain('Dès qu\u2019une série touche le haut de ta zone, la charge monte, et deux crans d\u2019un coup quand tu dépasses nettement.');
    expect(note(g)).not.toContain('deux premières séries');
    expect(note(g)).not.toContain('deux séances de suite');
  });

  test('DISCRIMINANT — en Entretenir, la section N’EXISTE PAS', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ intention: 'entretien', rythme_progression: 'franc' })));
    expect(titres(c)).not.toContain('TON RYTHME');
    expect(groupeRythme(c)).toBeNull();
    // Elle ne se grise pas : aucun bouton de rythme nulle part sur l'écran.
    expect(c.textContent).not.toContain('Prudent');
    // Contre-épreuve : en Progresser, elle est là.
    const c2 = cible();
    R().rendreProfil(c2, vueProfil(avec({ intention: 'progresser' })));
    expect(titres(c2)).toContain('TON RYTHME');
  });

  test('DISCRIMINANT — un toucher sur Prudent écrit `rythme_progression`, et rien d’autre', () => {
    // C'est l'OBJET envoyé à `ecrireProfil` qu'on lit, pas seulement la valeur :
    // une clé changée — `intention`, `seances_par_semaine` — partirait sans
    // qu'un test de valeur seule le voie.
    const ecrits = [];
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ rythme_progression: 'normal' }),
      { surRythme: (champs) => ecrits.push(champs) }));
    boutons(groupeRythme(c)).find((b) => b.textContent === 'Prudent').click();
    expect(ecrits).toEqual([{ rythme_progression: 'prudent' }]);
  });

  // 54-1 — LA GARDE NE LIT PLUS LE SOURCE : elle REJOUE `rendreProfilEcran`
  // (le vrai `profil.js`, `aide-profil-ecran.js`) et regarde les sections que
  // l'écran reçoit. Remettre « RYTHME VISÉ », retirer la section du rythme, ou
  // la brancher sur autre chose qu'`ecrireProfil` fait tomber ce test — y
  // compris quand la ligne de code existe encore, morte.
  test('GARDE — l’écran reçoit « TA SEMAINE », et la section du rythme écrit par `ecrireProfil`', () => {
    const { profilEcran } = require('./aide-profil-ecran.js');
    const e = profilEcran({ intention: 'progresser', rythme_progression: 'normal' });
    const titres = e.vue.sections.filter(Boolean).map((x) => x.titre);
    // Le renommage — sans quoi l'écran porte de nouveau deux « rythme ».
    expect(titres).toContain('TA SEMAINE');
    expect(titres).not.toContain('RYTHME VISÉ');
    // Et le BRANCHEMENT : la section existe, et son choix part par l'écriture
    // du profil (passée `null`, elle afficherait Normal pour tout le monde).
    const rythme = e.section('TON RYTHME');
    expect(rythme).not.toBe(null);
    expect(rythme.segment.valeur).toBe('normal');
    rythme.segment.surChoix('prudent');
    expect(e.ecrits).toEqual([{ rythme_progression: 'prudent' }]);
    // En Entretenir, elle n'est pas là (la règle vit dans `profil.js`).
    expect(profilEcran({ intention: 'entretien' }).section('TON RYTHME')).toBe(null);
  });

  test('l’écran dit « TA SEMAINE », et plus jamais « RYTHME VISÉ »', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({})));
    expect(titres(c)).toContain('TA SEMAINE');
    expect(titres(c)).not.toContain('RYTHME VISÉ');
    expect(c.textContent).not.toContain('Rythme visé');
    // Les deux sections coexistent sans se confondre.
    expect(titres(c)).toContain('TON RYTHME');
  });

  test('DISCRIMINANT — `rendreProfil` saute une section absente sans broncher', () => {
    // La garde vit dans `rendu.js`, à UN endroit : sans elle, l'écran entier
    // plante en Entretenir — sur la lecture du `titre` d'un `null`.
    const c = cible();
    expect(() => R().rendreProfil(c, {
      kpis: [], sections: [null, { titre: 'APRÈS', lignes: [] }, null],
      surQuitter: () => {}, surSupprimer: () => {}
    })).not.toThrow();
    expect(Array.from(c.querySelectorAll('.p-sect')).map((n) => n.textContent))
      .toEqual(['APRÈS']);
  });

  test('une valeur inconnue en base retombe sur Normal plutôt que sur rien', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil(avec({ rythme_progression: 'turbo' })));
    const g = groupeRythme(c);
    expect(actif(g)).toBe('Normal');
    expect(note(g)).toContain('deux premières séries');
  });
});

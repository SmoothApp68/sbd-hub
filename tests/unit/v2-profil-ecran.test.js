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
      { titre: 'POURQUOI',
        segment: { options: Profil.INTENTIONS, valeur: p.intention || 'progresser',
                   surChoix: o.surIntention || (() => {}) },
        note: { fort: 'Le moteur propose des charges',
                reste: 'en mode Progresser. En Entretenir, il se tait sur la charge.' } },
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
      { titre: 'RYTHME VISÉ', lignes: [
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
  test('deux crans, et celui en vigueur est marqué', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ intention: 'progresser' }));
    const seg = c.querySelectorAll('.p-seg button');
    expect(seg.length).toBe(2);
    expect(seg[0].textContent).toBe('Progresser');
    expect(seg[1].textContent).toBe('Entretenir');
    expect(seg[0].className).toBe('on');
    expect(seg[0].getAttribute('aria-pressed')).toBe('true');
    expect(seg[1].getAttribute('aria-pressed')).toBe('false');
  });

  // ⚠️ CE QUI PART EST « entretien », PAS « Entretenir ». `profiles_intention_ok`
  // n'accepte que `progresser` et `entretien` — envoyer le libellé partirait en
  // 23514, code que la file classe DÉFINITIF.
  test('choisir Entretenir enregistre la clé, pas le libellé', () => {
    const c = cible();
    let ecrit = null;
    R().rendreProfil(c, vueProfil({ intention: 'progresser' },
      { surIntention: (v) => { ecrit = v; } }));
    c.querySelectorAll('.p-seg button')[1].click();
    expect(ecrit).toBe('entretien');
  });

  test('une fois en Entretenir, c’est lui qui est marqué', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({ intention: 'entretien' }));
    const seg = c.querySelectorAll('.p-seg button');
    expect(seg[1].className).toBe('on');
    expect(seg[0].className).toBe('');
  });

  test('la note dit ce que le moteur fait, et ce qu’il ne fait pas', () => {
    const c = cible();
    R().rendreProfil(c, vueProfil({}));
    const note = c.querySelector('.p-note').textContent;
    expect(note).toContain('propose des charges');
    expect(note).toContain('se tait sur la charge');
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

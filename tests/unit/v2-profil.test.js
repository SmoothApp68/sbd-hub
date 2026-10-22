/** @jest-environment node */
//
// v2/js/profil.js — les règles du profil, du pseudo et de l'inscription
// (chantier 46 §2).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// Trois pièges, et chacun a son test bâti pour y tomber si la règle saute :
//
//  1. LES DEUX ALTERNATIVES. La maquette montre « melodie » et « mel_d » pour
//     « mel » — deux propositions qu'un pseudo SEUL ne peut pas produire
//     (« melodie » est une expansion). Elles se dérivent de l'ADRESSE E-MAIL.
//     Un test sans e-mail à point ne distinguerait donc pas la vraie règle d'un
//     simple « base + 2 » : il passerait dans les deux cas.
//
//  2. LE TROISIÈME ÉTAT. `pris` vaut true, false, ou NULL — « on ne sait pas ».
//     Vérifié en base : `profiles_select_own` est `auth.uid() = id`,
//     `public_profiles` est en `security_invoker=on`, et `anon` n'a aucun GRANT.
//     Le client ne PEUT pas répondre. Un test binaire (pris / libre) laisserait
//     passer un code qui annonce « libre » sur une question sans réponse.
//
//  3. LA LISTE BLANCHE. `profiles` porte `is_admin` et `tier`, qu'un trigger
//     SECURITY DEFINER remet en place pour un non-admin. Une liste NOIRE
//     laisserait passer toute colonne ajoutée plus tard ; il faut donc un test
//     qui présente une colonne PRIVILÉGIÉE et une colonne INCONNUE.

// PR 6 de la consolidation — la série de travail et son compte vivent dans
// `modele.js` et `semaine.js`, lus à l'appel par les autres modules.
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
const Profil = require('../../v2/js/profil.js');

const AUJ = new Date(2026, 8, 18);   // 18 septembre 2026, heure locale

describe('les référentiels suivent les CHECK de la base', () => {
  // Relevées sur `pg_constraint` le 18/09/2026. Une valeur hors liste part en
  // 23514 — code que la file classe DÉFINITIF : la ligne ne reviendrait jamais.
  const EN_BASE = {
    materiel: ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps'],
    anciennete: ['moins_1_an', '1_a_3_ans', '3_a_5_ans', 'plus_5_ans'],
    sexe: ['homme', 'femme', 'non_precise'],
    intention: ['progresser', 'entretien']
  };
  const LISTES = {
    materiel: Profil.MATERIELS, anciennete: Profil.ANCIENNETES,
    sexe: Profil.SEXES, intention: Profil.INTENTIONS
  };

  Object.keys(EN_BASE).forEach((col) => {
    test(col + ' : aucune clé que Postgres refuserait', () => {
      LISTES[col].forEach((o) => expect(EN_BASE[col]).toContain(o.cle));
    });
  });

  // 60-1 (QUESTIONNAIRE-COACH-V2 §6) — la discipline, le niveau déclaré, les
  // unités et les jours visés ont quitté l'écran : leurs listes n'existent plus
  // ici, et aucune n'est écrite.
  test('⚠️ la discipline, le niveau déclaré, les unités et les jours visés ne sont ni listés ni écrits', () => {
    ['DISCIPLINES', 'DISCIPLINES_CONNUES', 'NIVEAUX', 'UNITES', 'JOURS', 'joursValides', 'libelleJours']
      .forEach((k) => expect(Profil[k]).toBeUndefined());
    ['mode_entrainement', 'niveau_declare', 'unites', 'jours_vises']
      .forEach((c) => expect(Profil.CHAMPS_ECRITS).not.toContain(c));
    expect(Profil.champsEcrits({ mode_entrainement: 'powerlifting', niveau_declare: 'expert', unites: 'lb', jours_vises: ['lun'] }))
      .toEqual({});
  });

  // `profiles_rythme_borne` : 1..14 séances, 10..300 minutes.
  test('les durées proposées tiennent dans la borne de la base', () => {
    Profil.DUREES.forEach((d) => { expect(d).toBeGreaterThanOrEqual(10); expect(d).toBeLessThanOrEqual(300); });
    expect(Profil.SEANCES_MIN).toBe(1);
    expect(Profil.SEANCES_MAX).toBe(14);
  });
});

// ── TEST 10 — le pseudo déjà pris propose DEUX alternatives ────────────────
describe('test 10 — pseudo déjà pris → deux alternatives', () => {
  // La configuration de la maquette, à la lettre : « mel » refusé, et
  // « melodie » / « mel_d » proposés. Elle n'est reproductible QUE si les
  // alternatives se dérivent de l'e-mail.
  const CTX = { email: 'melodie.dupont@exemple.fr' };

  test('les deux propositions de la maquette sortent de l’e-mail', () => {
    const v = Profil.verdictPseudo('mel', true, CTX);
    expect(v.code).toBe('pris');
    expect(v.alternatives).toHaveLength(2);
    expect(v.alternatives).toContain('melodie');
    expect(v.alternatives).toContain('mel_d');
    expect(v.message).toContain('Déjà pris');
    expect(v.message).toContain('melodie');
  });

  // ⚠️ LE TEST QUI MORD. Sans e-mail exploitable, la règle ne peut plus
  // qu'inventer des suffixes — et si elle se contentait TOUJOURS de suffixes,
  // le test précédent échouerait. Les deux ensemble distinguent les deux codes.
  test('sans e-mail, le repli est numéroté — et il propose quand même DEUX noms', () => {
    const v = Profil.verdictPseudo('mel', true, {});
    expect(v.alternatives).toEqual(['mel2', 'mel3']);
  });

  test('une alternative déjà prise est sautée, pas proposée', () => {
    const v = Profil.verdictPseudo('mel', true, { email: 'melodie.dupont@x.fr',
                                                  pris: ['melodie', 'mel_d'] });
    expect(v.alternatives).not.toContain('melodie');
    expect(v.alternatives).not.toContain('mel_d');
    expect(v.alternatives).toHaveLength(2);
  });

  test('jamais le pseudo refusé lui-même', () => {
    const v = Profil.verdictPseudo('melodie', true, { email: 'melodie@exemple.fr' });
    expect(v.alternatives).not.toContain('melodie');
    expect(v.alternatives).toHaveLength(2);
  });

  // ── LE TROISIÈME ÉTAT ────────────────────────────────────────────────────
  test('sans réponse de la base, l’écran se TAIT — il n’annonce pas « libre »', () => {
    const v = Profil.verdictPseudo('melodie', null, {});
    expect(v.code).toBe('inconnu');
    expect(v.message).toBe(null);
    expect(v.alternatives).toEqual([]);
  });

  // ⚠️ `=== true` ET `=== false`, PAS « truthy ». La sonde rend aujourd'hui
  // trois valeurs ; le jour où elle rendrait un COMPTE — `0` pour libre, `1`
  // pour pris — une comparaison lâche lirait « libre » sur un zéro et
  // « pris » sur un un, c'est-à-dire juste par accident. Tout ce qui n'est ni
  // `true` ni `false` est « on ne sait pas », et l'écran se tait.
  test('tout ce qui n’est ni vrai ni faux est « on ne sait pas »', () => {
    [1, 0, 'oui', '', {}, undefined].forEach((v) => {
      expect(Profil.verdictPseudo('melodie', v, {}).code).toBe('inconnu');
    });
  });

  test('libre ne dit rien non plus : c’est l’état normal', () => {
    const v = Profil.verdictPseudo('melodie', false, {});
    expect(v.code).toBe('libre');
    expect(v.message).toBe(null);
  });

  test('trop court, et ce n’est pas la base qui le dit', () => {
    expect(Profil.verdictPseudo('me', null, {}).code).toBe('court');
    expect(Profil.verdictPseudo('me', null, {}).message).toContain('3');
  });

  test('un pseudo qui commence par un chiffre est refusé', () => {
    expect(Profil.verdictPseudo('2fast', false, {}).code).toBe('invalide');
  });

  test('accents, espaces et majuscules se replient sans perdre le nom', () => {
    expect(Profil.normaliserPseudo('  Mélodie Dupont  ')).toBe('melodie_dupont');
    expect(Profil.normaliserPseudo('jean--luc!!')).toBe('jean_luc');
    expect(Profil.normaliserPseudo('___')).toBe('');
  });

  test('un pseudo ne dépasse jamais 20 caractères, et ne finit pas sur un tiret bas', () => {
    const long = Profil.normaliserPseudo('abcdefghij klmnopqrst uvwxyz');
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith('_')).toBe(false);
  });
});

describe('le bouton d’inscription', () => {
  const OK = { pseudo: 'melodie', email: 'm@x.fr', mdp: 'motdepasse1', pseudoPris: false };

  test('s’allume quand les trois champs tiennent', () => {
    expect(Profil.inscriptionPrete(OK)).toBe(true);
  });

  // ⚠️ « On ne sait pas » NE RETIENT PERSONNE. C'est la conséquence directe du
  // troisième état : puisque la base ne peut pas répondre aujourd'hui, exiger
  // un « libre » explicite rendrait l'inscription IMPOSSIBLE.
  test('s’allume aussi quand la base n’a pas pu répondre', () => {
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { pseudoPris: null }))).toBe(true);
  });

  test('reste éteint sur un pseudo pris, un e-mail bancal, un mot de passe court', () => {
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { pseudoPris: true }))).toBe(false);
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { email: 'melodie' }))).toBe(false);
    expect(Profil.inscriptionPrete(Object.assign({}, OK, { mdp: 'court' }))).toBe(false);
  });
});

// ── LA LISTE BLANCHE D'ÉCRITURE ────────────────────────────────────────────
describe('ce qu’on a le droit d’écrire', () => {
  test('les colonnes privilégiées ne traversent jamais', () => {
    const sortie = Profil.champsEcrits({
      username: 'aurel_br', intention: 'entretien',
      is_admin: true, tier: 'premium', tier_awarded_at: '2026-01-01',
      xp_high_water_mark: 99999, friend_code: 'ABC123', visibility_prs: 'public',
      colonne_inventee: 42
    });
    expect(sortie).toEqual({ username: 'aurel_br', intention: 'entretien' });
  });

  // ⚠️ La distinction liste blanche / liste noire. Une clé ABSENTE ne devient
  // pas `undefined` dans la sortie : envoyer `{taille_cm: undefined}` à
  // PostgREST écrirait `null` sur une colonne qu'on n'a pas voulu toucher.
  test('un champ non fourni reste absent, il ne devient pas null', () => {
    const sortie = Profil.champsEcrits({ bio: 'salut' });
    expect(Object.prototype.hasOwnProperty.call(sortie, 'taille_cm')).toBe(false);
    expect(Object.keys(sortie)).toEqual(['bio']);
  });

  test('un null explicite passe : c’est ce qui efface un champ', () => {
    expect(Profil.champsEcrits({ materiel: null })).toEqual({ materiel: null });
  });
});

describe('l’identité affichée', () => {
  test('« 98 kg · 182 cm · 28 ans » quand tout est là', () => {
    const p = { taille_cm: 182, date_naissance: '1998-03-12' };
    expect(Profil.sousTitre(p, 98, AUJ)).toBe('98 kg · 182 cm · 28 ans');
  });

  // ⚠️ CE QUI MANQUE NE LAISSE PAS DE TROU. Un profil neuf rend une chaîne
  // VIDE, pas « — · — · — » : un champ vide est un état, pas une erreur (§4).
  test('un profil neuf ne raconte rien plutôt que trois tirets', () => {
    expect(Profil.sousTitre({}, null, AUJ)).toBe('');
  });

  test('ce qui est connu s’affiche seul, sans séparateur orphelin', () => {
    expect(Profil.sousTitre({ taille_cm: 182 }, null, AUJ)).toBe('182 cm');
    expect(Profil.sousTitre({}, 98, AUJ)).toBe('98 kg');
  });

  test('un poids décimal se lit à la française', () => {
    expect(Profil.sousTitre({}, 97.4, AUJ)).toBe('97,4 kg');
  });

  test('l’âge est en années révolues, pas une soustraction d’années', () => {
    // Anniversaire DEMAIN : 27, pas 28. Une soustraction d'années dirait 28.
    expect(Profil.age('1998-09-19', AUJ)).toBe(27);
    expect(Profil.age('1998-09-18', AUJ)).toBe(28);
    expect(Profil.age(null, AUJ)).toBe(null);
  });

  test('l’initiale, et ce qu’elle vaut sans pseudo', () => {
    expect(Profil.initiale('aurel_br')).toBe('A');
    expect(Profil.initiale(null)).toBe('?');
  });
});

describe('les trois chiffres', () => {
  const SEANCES = [
    { id: 'a', debut: '2023-12-01T10:00:00Z' },
    { id: 'b', debut: '2026-09-01T10:00:00Z' }
  ];

  // ⚠️ « 3 ans » SE COMPTE DE LA PREMIÈRE SÉANCE À AUJOURD'HUI, pas en
  // soustrayant les millésimes : décembre 2023 → septembre 2026 fait 2 ans, pas
  // 3. Une fixture à cheval sur un changement d'année est la configuration
  // discriminante — deux séances de la même année ne diraient rien.
  test('l’historique compte en durée réelle, pas en millésimes', () => {
    const s = Profil.statsDe(SEANCES, [{}, {}, {}], AUJ);
    expect(s.seances).toBe(2);
    expect(s.series).toBe(3);
    expect(Profil.libelleAnciennete(s.annees)).toBe('2 ans');
  });

  test('sous l’année, les mois disent quelque chose', () => {
    const s = Profil.statsDe([{ id: 'a', debut: '2026-06-18T10:00:00Z' }], [], AUJ);
    expect(Profil.libelleAnciennete(s.annees)).toBe('3 mois');
  });

  test('sans séance, aucun chiffre n’est inventé', () => {
    const s = Profil.statsDe([], [], AUJ);
    expect(s.annees).toBe(null);
    expect(Profil.libelleAnciennete(s.annees)).toBe('—');
  });

  test('une séance sans début ne fausse pas la plus ancienne', () => {
    const s = Profil.statsDe([{ id: 'x' }].concat(SEANCES), [], AUJ);
    expect(Profil.libelleAnciennete(s.annees)).toBe('2 ans');
  });
});

// ── TEST 7 (sa moitié pure) — quand le questionnaire s'ouvre d'office ──────
//
// 60-2a — L'ancienne règle (`doitOuvrirProfil`, sur `onboarding_completed`) est
// REMPLACÉE : c'est le questionnaire du coach qui accueille, sur
// `questionnaire_fait_le` (ECRAN-PROFIL §4 bis). La leçon des trois états est
// gardée, tout entière.
describe('test 7 — le questionnaire est une règle de routage', () => {
  test('l’ancienne règle n’existe plus : le profil ne s’ouvre plus d’office', () => {
    expect(Profil.doitOuvrirProfil).toBeUndefined();
  });

  test('un profil dont le questionnaire n’a jamais été rempli l’ouvre', () => {
    expect(Profil.doitOuvrirQuestionnaire({ questionnaire_fait_le: null }, false)).toBe(true);
    expect(Profil.questionnaireAFaire({ questionnaire_fait_le: null })).toBe(true);
  });

  test('un questionnaire rempli n’ouvre rien : l’URL demandée gagne', () => {
    expect(Profil.doitOuvrirQuestionnaire({ questionnaire_fait_le: '2026-10-07T09:00:00.000Z' }, false)).toBe(false);
    expect(Profil.questionnaireAFaire({ questionnaire_fait_le: '2026-10-07T09:00:00.000Z' })).toBe(false);
  });

  // ⚠️ LE TROISIÈME CAS, ET C'EST LUI QUI COMPTE. « Absent » n'est pas « vide ».
  // Un profil pas encore chargé, un cache d'avant la colonne, un premier
  // démarrage hors ligne, une ligne partielle écrite sans réseau : dans tous ces
  // cas la colonne manque. Une lecture lâche (`!p.questionnaire_fait_le`) les
  // confondrait avec « jamais rempli » — et un compte qui a trois ans
  // d'historique rouvrirait le questionnaire à chaque démarrage hors ligne.
  test('« on ne sait pas » n’ouvre RIEN — on ne suppose pas', () => {
    [null, undefined, {}, { questionnaire_fait_le: undefined }, { onboarding_completed: false },
      { intention: 'entretien' }].forEach((p) => {
      expect(Profil.doitOuvrirQuestionnaire(p, false)).toBe(false);
      expect(Profil.questionnaireAFaire(p)).toBe(false);
    });
  });

  test('« déjà ouvert sur cet appareil » le ferme, mais le bandeau et la ligne le proposent encore', () => {
    expect(Profil.doitOuvrirQuestionnaire({ questionnaire_fait_le: null }, true)).toBe(false);
    expect(Profil.questionnaireAFaire({ questionnaire_fait_le: null })).toBe(true);
  });
});

describe('les bornes doublées de la base', () => {
  test('la taille refuse ce que `profiles_taille_ok` refuserait', () => {
    expect(Profil.tailleValide('182')).toBe(182);
    expect(Profil.tailleValide('182.4')).toBe(182);
    expect(Profil.tailleValide('99')).toBe(null);
    expect(Profil.tailleValide('251')).toBe(null);
    expect(Profil.tailleValide('grand')).toBe(null);
  });

  test('une date de naissance dans le futur n’en est pas une', () => {
    expect(Profil.naissanceValide('1998-03-12', AUJ)).toBe('1998-03-12');
    expect(Profil.naissanceValide('2030-01-01', AUJ)).toBe(null);
    expect(Profil.naissanceValide('1820-01-01', AUJ)).toBe(null);
    expect(Profil.naissanceValide('12/03/1998', AUJ)).toBe(null);
  });
});

// ── TEST 6 (sa moitié pure) — ce qui reste à renseigner ────────────────────
describe('test 6 — un profil vide est un ÉTAT, pas une erreur', () => {
  test('un profil neuf a six champs à renseigner', () => {
    expect(Profil.manquants({})).toEqual(Profil.A_RENSEIGNER);
  });

  // ⚠️ LES NOT NULL N'Y FIGURENT PAS. `sexe` et `intention` ont un DÉFAUT en
  // base : ils ne peuvent pas manquer. Les compter comme « à renseigner »
  // afficherait un manque qui n'existe pas. Et ce qui n'est plus demandé
  // (60-1) ne manque pas non plus.
  test('ce qui a un défaut en base, ou n’est plus demandé, n’est jamais « manquant »', () => {
    ['sexe', 'intention', 'mode_entrainement', 'unites', 'niveau_declare', 'jours_vises']
      .forEach((c) => expect(Profil.A_RENSEIGNER).not.toContain(c));
  });

  test('un champ rempli sort de la liste', () => {
    expect(Profil.manquants({ taille_cm: 182 })).not.toContain('taille_cm');
  });

  // Une chaîne vide et un tableau vide sont des champs vides, pas des valeurs.
  test('« » et [] comptent comme vides', () => {
    expect(Profil.manquants({ materiel: '' })).toContain('materiel');
    expect(Profil.manquants({ anciennete: [] })).toContain('anciennete');
  });
});


// ── MOTEUR §9.8 — LE RÉGLAGE DE RYTHME (48b-4) ─────────────────────────────
describe('le réglage de rythme — une seule table, et la garde d’écriture', () => {
  test('la garde blanche laisse passer `rythme_progression`', () => {
    // Sans elle, le choix ne partirait jamais en base : `champsEcrits` est une
    // liste BLANCHE, donc tout ce qui n'y figure pas est silencieusement jeté.
    expect(Profil.champsEcrits({ rythme_progression: 'franc' }))
      .toEqual({ rythme_progression: 'franc' });
    // Et elle ne laisse toujours pas passer ce qui n'est pas à nous.
    expect(Profil.champsEcrits({ rythme_progression: 'franc', is_admin: true, tier: 'premium' }))
      .toEqual({ rythme_progression: 'franc' });
  });

  test('les trois clés, et rien d’autre — ce sont celles de `v2_046`', () => {
    expect(Profil.RYTHMES.map((r) => r.cle)).toEqual(['prudent', 'normal', 'franc']);
    expect(Profil.RYTHME_DEFAUT).toBe('normal');
    // Le défaut est l'une des trois : un défaut hors liste afficherait un
    // sélecteur sans bouton actif.
    expect(Profil.RYTHMES.map((r) => r.cle)).toContain(Profil.RYTHME_DEFAUT);
  });

  test('chaque rythme a SA phrase, et les trois sont distinctes', () => {
    const phrases = Profil.RYTHMES.map((r) => r.phrase);
    phrases.forEach((ph) => {
      expect(typeof ph).toBe('string');
      expect(ph.length).toBeGreaterThan(20);
    });
    expect(new Set(phrases).size).toBe(3);
  });

  test('DISCRIMINANT — `phraseRythme` rend la phrase de la clé demandée', () => {
    expect(Profil.phraseRythme('prudent')).toContain('deux séances de suite');
    expect(Profil.phraseRythme('normal')).toContain('deux premières séries');
    expect(Profil.phraseRythme('franc')).toContain('Dès qu\u2019une série touche le haut');
    // Deux phrases permutées feraient tomber deux de ces trois lignes.
    expect(Profil.phraseRythme('prudent')).not.toBe(Profil.phraseRythme('normal'));
  });

  test('une clé inconnue, ou absente, rend la phrase du défaut', () => {
    expect(Profil.phraseRythme('turbo')).toBe(Profil.phraseRythme('normal'));
    expect(Profil.phraseRythme(null)).toBe(Profil.phraseRythme('normal'));
    expect(Profil.phraseRythme(undefined)).toBe(Profil.phraseRythme('normal'));
  });

  test('DISCRIMINANT — `sectionRythme` n’existe pas en Entretenir', () => {
    // La règle vit ici, et c'est ce qui la rend vérifiable : dans `app.js`,
    // aucune mutation de cette condition ne faisait tomber un test.
    expect(Profil.sectionRythme({ intention: 'entretien' }, () => {})).toBeNull();
    expect(Profil.sectionRythme({ intention: 'entretien', rythme_progression: 'franc' }, () => {}))
      .toBeNull();
    // Et elle existe partout ailleurs, y compris sans intention du tout.
    expect(Profil.sectionRythme({ intention: 'progresser' }, () => {}).titre).toBe('TON RYTHME');
    expect(Profil.sectionRythme({}, () => {}).titre).toBe('TON RYTHME');
    expect(Profil.sectionRythme(null, () => {}).titre).toBe('TON RYTHME');
  });

  test('DISCRIMINANT — la section écrit `rythme_progression`, et cette clé-là', () => {
    const ecrits = [];
    const sec = Profil.sectionRythme({ rythme_progression: 'normal' }, (c) => ecrits.push(c));
    sec.segment.surChoix('franc');
    expect(ecrits).toEqual([{ rythme_progression: 'franc' }]);
  });

  test('la section porte le bouton actif du PROFIL et la phrase qui va avec', () => {
    const sec = Profil.sectionRythme({ rythme_progression: 'prudent' }, () => {});
    expect(sec.segment.options).toBe(Profil.RYTHMES);
    expect(sec.segment.valeur).toBe('prudent');
    expect(sec.note.fort).toBe(Profil.phraseRythme('prudent'));
    expect(sec.note.reste).toBe('La prochaine consigne en tient compte.');
    // Sans valeur en base : Normal, et la phrase de Normal.
    const neuf = Profil.sectionRythme({}, () => {});
    expect(neuf.segment.valeur).toBe('normal');
    expect(neuf.note.fort).toBe(Profil.phraseRythme('normal'));
  });

  test('`rythmeDe` lit le profil, et retombe sur le défaut', () => {
    expect(Profil.rythmeDe({ rythme_progression: 'franc' })).toBe('franc');
    expect(Profil.rythmeDe({ rythme_progression: 'prudent' })).toBe('prudent');
    // Un profil créé avant `v2_046`, ou relu d'un cache d'alors.
    expect(Profil.rythmeDe({})).toBe('normal');
    expect(Profil.rythmeDe(null)).toBe('normal');
    // Une valeur que la base ne pourrait pas contenir ne fait pas taire l'écran.
    expect(Profil.rythmeDe({ rythme_progression: 'turbo' })).toBe('normal');
    expect(Profil.rythmeDe({ rythme_progression: '' })).toBe('normal');
  });
});

// 136 (audit du 16/10/2026, 03 #18) — `onboarding_completed` NE S'ÉCRIT PLUS. Claude.ai a vérifié en base qu'aucune
// fonction ne la lit ; l'app ne la lisait plus depuis 60-2a (`questionnaire_fait_le` décide). Retirée des écritures
// (`Profil.CHAMPS_ECRITS`, la création de la ligne, « quitter le profil »), et de la lecture (`donnees.js`). La colonne
// reste en base.
describe('136 — 03 #18 : `onboarding_completed` ne s’écrit plus', () => {
  const fs = require('fs');
  const path = require('path');
  const lire = (f) => fs.readFileSync(path.join(__dirname, '../../v2/js/', f), 'utf8');
  test('DISCRIMINANT — `champsEcrits` ne la laisse plus partir', () => {
    expect(Profil.CHAMPS_ECRITS).not.toContain('onboarding_completed');
    expect(Profil.champsEcrits({ onboarding_completed: true, username: 'x' })).toEqual({ username: 'x' });
  });
  test('aucun fichier de l’app ne l’écrit ni ne la lit (hors commentaires)', () => {
    const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const fautes = fs.readdirSync(path.join(__dirname, '../../v2/js')).filter((f) => /\.js$/.test(f))
      .filter((f) => /onboarding_completed/.test(sansCommentaires(lire(f))));
    expect(fautes).toEqual([]);
  });
});

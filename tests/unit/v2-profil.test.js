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

const Profil = require('../../v2/js/profil.js');

const AUJ = new Date(2026, 8, 18);   // 18 septembre 2026, heure locale

describe('les référentiels suivent les CHECK de la base', () => {
  // Relevées sur `pg_constraint` le 18/09/2026. Une valeur hors liste part en
  // 23514 — code que la file classe DÉFINITIF : la ligne ne reviendrait jamais.
  const EN_BASE = {
    materiel: ['salle_complete', 'salle_basique', 'maison_equipee', 'maison_minimal', 'poids_du_corps'],
    anciennete: ['moins_1_an', '1_a_3_ans', '3_a_5_ans', 'plus_5_ans'],
    niveau_declare: ['debutant', 'intermediaire', 'avance', 'expert'],
    sexe: ['homme', 'femme', 'non_precise'],
    unites: ['kg', 'lb'],
    intention: ['progresser', 'entretien']
  };
  const LISTES = {
    materiel: Profil.MATERIELS, anciennete: Profil.ANCIENNETES,
    niveau_declare: Profil.NIVEAUX, sexe: Profil.SEXES,
    unites: Profil.UNITES, intention: Profil.INTENTIONS
  };

  Object.keys(EN_BASE).forEach((col) => {
    test(col + ' : aucune clé que Postgres refuserait', () => {
      LISTES[col].forEach((o) => expect(EN_BASE[col]).toContain(o.cle));
    });
  });

  test('la discipline proposée est un sous-ensemble de ce que la base accepte', () => {
    const accepte = ['bien_etre', 'musculation', 'powerbuilding', 'powerlifting', 'calisthenics'];
    Profil.DISCIPLINES.forEach((o) => expect(accepte).toContain(o.cle));
  });

  // §2.3 — « Bien-être n'est pas une discipline » : la base l'accepte, l'écran
  // ne le propose pas. Mais une ligne qui le porte DÉJÀ doit s'afficher, pas se
  // vider : c'est pour ça que `DISCIPLINES_CONNUES` existe à côté.
  test('« bien-être » n’est pas proposé mais reste lisible', () => {
    expect(Profil.DISCIPLINES.map((o) => o.cle)).not.toContain('bien_etre');
    expect(Profil.libelleDe(Profil.DISCIPLINES, 'bien_etre')).toBe(null);
    expect(Profil.libelleDe(Profil.DISCIPLINES_CONNUES, 'bien_etre')).toBe('Bien-être');
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

  // ⚠️ L'ORDRE DE LA SEMAINE, PAS L'ORDRE DES CLICS. Une fixture déjà triée ne
  // distinguerait pas « je trie » de « je recopie ».
  test('les jours se rangent dans l’ordre de la semaine, quel que soit l’ordre des clics', () => {
    expect(Profil.joursValides(['sam', 'lun', 'jeu'])).toEqual(['lun', 'jeu', 'sam']);
    expect(Profil.libelleJours(['sam', 'lun', 'jeu'])).toBe('Lu · Je · Sa');
  });

  test('un jour inventé ou répété ne passe pas', () => {
    expect(Profil.joursValides(['lun', 'lun', 'lundi', 'octidi'])).toEqual(['lun']);
    expect(Profil.libelleJours([])).toBe(null);
    expect(Profil.libelleJours(null)).toBe(null);
  });
});

// ── TEST 6 (sa moitié pure) — ce qui reste à renseigner ────────────────────
describe('test 6 — un profil vide est un ÉTAT, pas une erreur', () => {
  test('un profil neuf a sept champs à renseigner', () => {
    expect(Profil.manquants({})).toEqual(Profil.A_RENSEIGNER);
  });

  // ⚠️ LES NOT NULL N'Y FIGURENT PAS. `sexe`, `mode_entrainement`, `unites` et
  // `intention` ont un DÉFAUT en base : ils ne peuvent pas manquer. Les compter
  // comme « à renseigner » afficherait un manque qui n'existe pas.
  test('ce qui a un défaut en base n’est jamais « manquant »', () => {
    ['sexe', 'mode_entrainement', 'unites', 'intention']
      .forEach((c) => expect(Profil.A_RENSEIGNER).not.toContain(c));
  });

  test('un champ rempli sort de la liste', () => {
    expect(Profil.manquants({ taille_cm: 182 })).not.toContain('taille_cm');
  });

  // Une chaîne vide et un tableau vide sont des champs vides, pas des valeurs.
  test('« » et [] comptent comme vides', () => {
    expect(Profil.manquants({ materiel: '' })).toContain('materiel');
    expect(Profil.manquants({ niveau_declare: null })).toContain('niveau_declare');
  });
});

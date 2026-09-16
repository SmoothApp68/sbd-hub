//
// v2 — la saisie d'une durée par décalage (chantier 25).
//
// ══ CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) ═════════════════════
//
// **UNE DURÉE QUI DÉPASSE UNE HEURE.**
//
// Sous une heure, un pavé à DEUX groupes (MM:SS) et un pavé à TROIS
// (HH:MM:SS) rendent exactement la même chose : `5·0` donne 00:50 dans les
// deux cas, `1·3·0·0` donne 13:00 dans les deux cas. Rien ne les sépare.
// Et toutes les durées d'essai évidentes — planche, gainage, L-sit — sont
// sous la minute, donc un banc « raisonnable » passerait à côté du seul
// groupe qui peut manquer.
//
// Chaque test de décalage porte donc au moins un cas à cinq chiffres :
// `2·0·0·0·0` (2 h) et `6·3·5·0·0` (6 h 35, la plus longue série réelle du
// corpus). Un pavé à deux groupes les rendrait 20:00 et 63:50 — ce que les
// assertions rejettent.

require('../../v2/js/modele.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const Rendu = () => window.THRendu;

// Taper une suite de chiffres, comme un clavier numérique : un `beforeinput`
// par caractère, annulable — c'est la seule voie d'entrée du champ.
function taper(input, suite) {
  for (const c of String(suite)) {
    input.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertText', data: c, cancelable: true, bubbles: true }));
  }
}

// Toute la suite dans UN seul `insertText` — ce que fait une autocomplétion.
function taper2(input, suite) {
  input.dispatchEvent(new InputEvent('beforeinput',
    { inputType: 'insertText', data: String(suite), cancelable: true, bubbles: true }));
}

function effacer(input, n) {
  for (let i = 0; i < (n || 1); i++) {
    input.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'deleteContentBackward', cancelable: true, bubbles: true }));
  }
}

// Le pavé tel qu'il est réellement monté dans une ligne de séance.
const CATALOGUE = [
  { slug: 'pl', nom: 'Planche', mesure: 'temps', charge: 'aucune',
    muscles_primaires: ['abdominaux'], muscles_secondaires: [] },
  { slug: 'ma', nom: 'Marche', mesure: 'distance_temps', charge: 'aucune',
    muscles_primaires: [], muscles_secondaires: [] },
  { slug: 'dc', nom: 'Développé Couché', mesure: 'charge_reps', charge: 'externe',
    muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);

let graine = 0;
const uuid = () => 'set-' + (++graine);

function seanceDe(slugs) {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: { id: 'r', exercices: slugs.map((slug) => (
      { exercise_slug: slug, series: progTravail(1, null), repos_cible_s: null })) }
  });
}

// Monte l'écran et rend { champs, valeurs } avec le dernier `surChamp` reçu.
function monter(slugs, options) {
  const o = options || {};
  let seance = seanceDe(slugs);
  const recus = [];
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, {
    blocs: Modele.blocsDeSeance(seance, CATALOGUE),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (s) => INDEX[s],
    precedent: o.precedent || (() => null),
    fantome: (i, j) => Seance.fantome(seance, i, j,
      (o.precedent || (() => null))(seance.exercices[i].exercise_slug)),
    surChamp: (i, j, champ, valeur) => {
      recus.push({ champ, valeur });
      seance = Seance.modifierSerie(seance, i, j, { [champ]: valeur });
    },
    surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {}
  });
  return {
    cible, recus,
    seance: () => seance,
    input: (iBloc, iChamp) => cible.querySelectorAll('.bloc-seance')[iBloc]
      .querySelectorAll('.serie input')[iChamp || 0]
  };
}

// ── 1. Le décalage ─────────────────────────────────────────────────────────
describe('1 — les chiffres entrent par la droite et poussent les autres', () => {
  const suite = (s) => {
    let b = '';
    for (const c of String(s)) b = Modele.poserChiffreDuree(b, c);
    return Modele.dureeDeChiffres(b);
  };

  test('les trois cas de la spec, à la seconde', () => {
    expect(suite('50')).toBe(50);          // 00:50
    expect(suite('1300')).toBe(780);       // 13:00
    expect(suite('20000')).toBe(7200);     // 02:00:00 — au-delà d'une heure
  });

  // ⚠️ LE CAS DISCRIMINANT : la plus longue série réelle du corpus. Un pavé à
  // deux groupes en ferait 63 min 50 s (3 830 s), pas 6 h 35.
  test('6 h 35 — la plus longue série réelle — en cinq appuis', () => {
    expect(suite('63500')).toBe(23700);
    expect(suite('63500')).not.toBe(3830);
  });

  test('chaque appui pousse : tous les états intermédiaires sont exacts', () => {
    const etats = [];
    let b = '';
    for (const c of '63500') {
      b = Modele.poserChiffreDuree(b, c);
      etats.push(Modele.formatChrono(Modele.dureeDeChiffres(b)));
    }
    expect(etats).toEqual(['00:06', '01:03', '06:35', '01:03:50', '06:35:00']);
  });

  // Un tampon est un état, pas une déduction : « 6350 » et « 10350 » valent la
  // même durée mais ne se poursuivent pas pareil. C'est ce qui interdit de
  // recalculer le tampon depuis la valeur à chaque frappe.
  test('la forme canonique d’une durée ne se poursuit pas comme le tampon tapé', () => {
    const tampon = '6350';
    const valeur = Modele.dureeDeChiffres(tampon);        // 3 830 s
    expect(Modele.chiffresDeDuree(valeur)).toBe('10350'); // 1 h 03 min 50
    expect(Modele.dureeDeChiffres(Modele.poserChiffreDuree(tampon, '0'))).toBe(23700);
    expect(Modele.dureeDeChiffres(
      Modele.poserChiffreDuree(Modele.chiffresDeDuree(valeur), '0'))).not.toBe(23700);
  });

  test('les zéros de tête ne consomment pas de place', () => {
    let b = '';
    for (const c of '00050') b = Modele.poserChiffreDuree(b, c);
    expect(b).toBe('50');
    expect(Modele.dureeDeChiffres(b)).toBe(50);
  });

  test('rien qui ne soit un chiffre n’entre', () => {
    expect(Modele.poserChiffreDuree('5', ',')).toBe('5');
    expect(Modele.poserChiffreDuree('5', 'a')).toBe('5');
    expect(Modele.poserChiffreDuree('5', '')).toBe('5');
    expect(Modele.poserChiffreDuree('5', '12')).toBe('5');
  });
});

// ── 2. L'effacement ───────────────────────────────────────────────────────
describe('2 — effacer retire le dernier chiffre, par la droite', () => {
  test('geste inverse exact de la saisie', () => {
    expect(Modele.retirerChiffreDuree('63500')).toBe('6350');
    expect(Modele.retirerChiffreDuree('6350')).toBe('635');
    expect(Modele.retirerChiffreDuree('6')).toBe('');
    expect(Modele.retirerChiffreDuree('')).toBe('');
  });

  test('et l’affichage se resserre : les heures disparaissent avec leur chiffre', () => {
    expect(Modele.formatChrono(Modele.dureeDeChiffres('63500'))).toBe('06:35:00');
    expect(Modele.formatChrono(Modele.dureeDeChiffres(
      Modele.retirerChiffreDuree('63500')))).toBe('01:03:50');
    expect(Modele.formatChrono(Modele.dureeDeChiffres('635'))).toBe('06:35');
  });

  test('tout effacer rend le champ VIDE, pas zéro', () => {
    expect(Modele.dureeDeChiffres('')).toBeNull();
    expect(Modele.formatChrono(null)).toBe('');
  });
});

// ── 3. L'affichage ────────────────────────────────────────────────────────
describe('3 — les heures ne s’affichent que si elles existent', () => {
  test('sous une heure, deux groupes', () => {
    expect(Modele.formatChrono(9)).toBe('00:09');
    expect(Modele.formatChrono(50)).toBe('00:50');
    expect(Modele.formatChrono(780)).toBe('13:00');
    expect(Modele.formatChrono(3599)).toBe('59:59');
  });

  // Cinq caractères inutiles sur un gainage de dix secondes, c'est cinq de trop.
  test('à partir d’une heure, trois groupes — et pas avant', () => {
    expect(Modele.formatChrono(3600)).toBe('01:00:00');
    expect(Modele.formatChrono(7200)).toBe('02:00:00');
    expect(Modele.formatChrono(23700)).toBe('06:35:00');
    expect(Modele.formatChrono(3599)).not.toMatch(/^\d\d:\d\d:\d\d$/);
  });
});

// ── 4. Les bornes ─────────────────────────────────────────────────────────
describe('4 — le pavé est borné, et il n’invente pas d’horloge impossible', () => {
  const suite = (s) => {
    let b = '';
    for (const c of String(s)) b = Modele.poserChiffreDuree(b, c);
    return b;
  };

  // UNE seule borne — la valeur. Les cinq chiffres en sont la conséquence, et
  // c'est le test suivant qui le vérifie, pas une seconde garde dans le code.
  test('la borne est 9:59:59, et cinq chiffres en découlent', () => {
    expect(Modele.MAX_CHIFFRES_DUREE).toBe(5);
    expect(Modele.MAX_DUREE_S).toBe(35999);
    expect(Modele.formatChrono(Modele.MAX_DUREE_S)).toBe('09:59:59');
    // Le maximum s'atteint, il ne se devine pas : 9 h 59 min 59 s en cinq appuis.
    expect(Modele.dureeDeChiffres(suite('95959'))).toBe(35999);
    expect(suite('959590')).toBe('95959');        // le sixième n'entre pas
  });

  test('`9·9·9·9·9·9` ne produit pas une durée absurde', () => {
    const b = suite('999999');
    const v = Modele.dureeDeChiffres(b);
    // Le cinquième 9 ferait 10 h 40 min 39 s : au-delà de la borne, il n'entre
    // pas. Ce qui reste est 1 h 40 min 39 s — une durée, pas une aberration.
    expect(b).toBe('9999');
    expect(v).toBe(6039);
    expect(v).toBeLessThanOrEqual(Modele.MAX_DUREE_S);
  });

  // ⚠️ L'INVARIANT QUI JUSTIFIE LA SECONDE BORNE : le pavé ne produit jamais
  // une durée qu'il ne sait pas reprendre. Sans elle, « 99999 » valait 38 439 s
  // dont la forme canonique fait SIX chiffres — le champ affichait la bonne
  // heure et refusait ensuite tout chiffre. Invisible en CI, visible sur device
  // à la réédition d'une série.
  test('tout ce que le pavé produit se reprend en édition', () => {
    const frappes = ['5', '50', '1300', '20000', '63500', '95959', '999999',
                     '00000', '9', '123456'];
    frappes.forEach((f) => {
      const v = Modele.dureeDeChiffres(suite(f));
      const canon = Modele.chiffresDeDuree(v);
      expect(canon.length).toBeLessThanOrEqual(Modele.MAX_CHIFFRES_DUREE);
      expect(Modele.dureeDeChiffres(canon)).toBe(v);
    });
  });

  // ⚠️ « mm < 60 et ss < 60 » SEUL serait tautologique : `formatChrono` les
  // calcule modulo, c'est vrai de tout entier. Ce qui peut réellement tomber,
  // c'est que l'écran montre les GROUPES BRUTS du tampon au lieu de l'horloge.
  // On le vérifie donc par l'écart : « 9999 » ne doit PAS s'afficher « 99:99 ».
  test('l’écran montre l’horloge, jamais les groupes bruts du tampon', () => {
    const brut = (t) => t.length <= 2 ? '00:' + t.padStart(2, '0')
      : t.slice(0, -2).padStart(2, '0') + ':' + t.slice(-2);
    [['9999', '01:40:39'], ['99', '01:39'], ['6350', '01:03:50'], ['0099', '01:39']]
      .forEach(([frappe, attendu]) => {
        const tampon = suite(frappe);
        const texte = Modele.formatChrono(Modele.dureeDeChiffres(tampon));
        expect(texte).toBe(attendu);
        expect(texte).not.toBe(brut(tampon));       // ← ce qui peut tomber
        const [mm, ss] = texte.split(':').map(Number).slice(-2);
        expect(mm).toBeLessThan(60);
        expect(ss).toBeLessThan(60);
      });
  });

  test('aucune durée négative ne peut naître du pavé', () => {
    expect(Modele.dureeDeChiffres('00000')).toBe(0);
    expect(Modele.chiffresDeDuree(-5)).toBe('0');
    expect(Modele.formatChrono(-5)).toBe('00:00');
  });
});

// ── 5. Le stockage ────────────────────────────────────────────────────────
describe('5 — `duree_s` en secondes, quelle que soit la forme saisie', () => {
  test('le champ envoie des SECONDES, et la séance les garde telles quelles', () => {
    const e = monter(['pl']);
    taper(e.input(0), '20000');
    expect(e.recus[e.recus.length - 1]).toEqual({ champ: 'duree', valeur: 7200 });
    expect(e.seance().exercices[0].series[0].duree_s).toBe(7200);
  });

  test('et la ligne montée en base porte des secondes, rien d’autre', () => {
    let s = seanceDe(['pl']);
    s = Seance.modifierSerie(s, 0, 0, { duree: 23700 });
    s = Seance.valider(s, 0, 0, new Date('2026-09-12T10:00:00Z'));
    const l = Seance.lignes(s)[0];
    expect(l.duree_s).toBe(23700);
    expect(l.charge_kg).toBeNull();
    expect(l.reps).toBeNull();
    expect(l.distance_m).toBeNull();
  });

  test('le champ montre l’horloge et n’accepte QUE chiffres et effacement', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    expect(i.inputMode).toBe('numeric');
    taper(i, '50');
    expect(i.value).toBe('00:50');
    // virgule, lettre, collage, dictée : rien ne passe.
    taper(i, ',a');
    i.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertFromPaste', data: '999', cancelable: true, bubbles: true }));
    expect(i.value).toBe('00:50');
    expect(e.seance().exercices[0].series[0].duree_s).toBe(50);
  });

  test('effacer dans le champ resserre l’affichage et la valeur', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '63500');
    expect(i.value).toBe('06:35:00');
    effacer(i);
    expect(i.value).toBe('01:03:50');
    effacer(i, 4);
    expect(i.value).toBe('');
    expect(e.seance().exercices[0].series[0].duree_s).toBeNull();
  });

  test('une valeur déjà enregistrée se reprend là où elle est', () => {
    let s = seanceDe(['pl']);
    s = Seance.modifierSerie(s, 0, 0, { duree: 23700 });
    const cible = document.createElement('div');
    Rendu().rendreBlocsSeance(cible, s, {
      blocs: Modele.blocsDeSeance(s, CATALOGUE),
      tourAtteint: (g) => Seance.tourAtteint(s, g),
      exercice: (x) => INDEX[x],
      precedent: () => null,
      fantome: (i, j) => Seance.fantome(s, i, j, null),
      surChamp: () => {}, surValider: () => {}, surNumero: () => {},
      surEffort: () => {}, surAjoutSerie: () => {}, surSupprimerSerie: () => {}
    });
    const i = cible.querySelector('.serie input');
    expect(i.value).toBe('06:35:00');
    expect(i.dataset.chiffres).toBe('63500');
  });
});

// ── 6. La distance ne change pas ──────────────────────────────────────────
describe('6 — la distance garde un champ simple, avec son unité', () => {
  test('deux champs sur une sortie : un pavé, puis un nombre en km', () => {
    const e = monter(['ma']);
    const bloc = e.cible.querySelector('.bloc-seance');
    const enveloppes = bloc.querySelectorAll('.serie .ch-serie, .serie .rp-serie');
    expect(enveloppes.length).toBe(2);
    expect(enveloppes[0].classList.contains('chrono')).toBe(true);
    expect(enveloppes[1].classList.contains('chrono')).toBe(false);
    expect(enveloppes[1].querySelector('u').textContent).toBe('km');
    expect(enveloppes[1].querySelector('input').inputMode).toBe('decimal');
  });

  test('la distance accepte une virgule, et le décalage ne la touche pas', () => {
    const e = monter(['ma']);
    const km = e.input(0, 1);
    km.value = '8,76';
    km.dispatchEvent(new Event('input', { bubbles: true }));
    expect(e.recus[e.recus.length - 1]).toEqual({ champ: 'distance_km', valeur: '8,76' });
    expect(e.seance().exercices[0].series[0].distance_m).toBe(8760);
  });

  test('l’affichage de la distance est inchangé : mètres sous 1 000, km au-delà', () => {
    expect(Modele.formatDistance(850)).toBe('850 m');
    expect(Modele.formatDistance(1000)).toBe('1 km');
    expect(Modele.formatDistance(22660)).toBe('22,7 km');
  });
});

// ── 7. Non-régression des trois autres mesures ────────────────────────────
describe('7 — `charge_reps` et `reps` ne sont pas touchés', () => {
  test('un développé garde ses deux champs numériques et son unité', () => {
    const e = monter(['dc']);
    const bloc = e.cible.querySelector('.bloc-seance');
    const enveloppes = bloc.querySelectorAll('.serie .ch-serie, .serie .rp-serie');
    expect(enveloppes.length).toBe(2);
    expect(Array.from(enveloppes).some((x) => x.classList.contains('chrono'))).toBe(false);
    expect(enveloppes[0].querySelector('u').textContent).toBe('kg');
    expect(enveloppes[0].querySelector('input').inputMode).toBe('decimal');
  });

  test('et il se saisit comme avant, à la virgule près', () => {
    const e = monter(['dc']);
    const kg = e.input(0, 0);
    kg.value = '122,5';
    kg.dispatchEvent(new Event('input', { bubbles: true }));
    expect(e.seance().exercices[0].series[0].charge_kg).toBe(122.5);
  });

  // La table des champs est la seule source : plus de `duree_min`, donc plus
  // de facteur 60 nulle part.
  test('il n’y a plus qu’une seule unité de durée', () => {
    expect(Modele.CHAMPS_MESURE.duree_min).toBeUndefined();
    expect(Modele.CHAMPS_MESURE.duree.facteur).toBe(1);
    expect(Modele.CHAMPS_MESURE.duree.saisie).toBe('chrono');
    expect(Modele.GABARITS.temps.champs).toEqual(['duree']);
    expect(Modele.GABARITS.distance_temps.champs).toEqual(['duree', 'distance_km']);
  });
});

// ── 8. Le champ tient même si le navigateur n'obéit pas ───────────────────
//
// `beforeinput` n'est pas annulable partout, ni tout le temps. Si le navigateur
// insère quand même son caractère, l'affichage doit revenir au tampon — sinon
// la valeur montrée et la valeur enregistrée divergent sans que rien ne le
// dise.
describe('8 — l’affichage ne peut pas diverger du tampon', () => {
  test('une insertion que le navigateur aurait forcée est réaffirmée', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '50');
    expect(i.value).toBe('00:50');

    // Le navigateur passe outre : il écrit dans le champ et signale `input`.
    i.value = '00:509';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    expect(i.value).toBe('00:50');
    expect(i.dataset.chiffres).toBe('50');
    expect(e.seance().exercices[0].series[0].duree_s).toBe(50);
  });

  // ⚠️ Un clavier qui COMPOSE livre la composition entière à chaque événement,
  // pas le caractère ajouté. La traiter comme une frappe doublerait tout :
  // `5` puis `50` donnerait « 5 5 0 ». Trouvé en revue, reproduit en navigateur
  // réel. Rien n'entre par ce chemin — c'est le seul comportement sûr.
  test('une composition ne fait rien, elle ne double pas la saisie', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    const composer = (d) => i.dispatchEvent(new InputEvent('beforeinput',
      { inputType: 'insertCompositionText', data: d, cancelable: true, bubbles: true }));
    composer('5');
    composer('50');
    expect(i.dataset.chiffres).toBe('');
    expect(i.value).toBe('');
    expect(e.seance().exercices[0].series[0].duree_s).toBeNull();
    // Et la frappe franche continue de marcher juste après.
    taper(i, '50');
    expect(i.value).toBe('00:50');
  });

  // ⚠️ LE CHAMP REFUSE À LA SOURCE, IL NE RÉPARE PAS APRÈS COUP.
  //
  // L'écouteur `input` ci-dessus est une ceinture : il remet l'affichage sur le
  // tampon si le navigateur passe outre. Il rend le symptôme invisible, donc
  // retirer `preventDefault` ne fait plus rien voir — le banc de mutation l'a
  // montré. Mais les deux ne sont pas interchangeables : sans le refus à la
  // source, le caractère est inséré puis retiré, le caret saute, et l'écran
  // montre une valeur fausse le temps d'une image. On vérifie donc le
  // MÉCANISME, pas seulement son résultat.
  test('chaque `beforeinput` est annulé — rien n’est inséré puis réparé', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    const essayer = (type, data) => {
      const ev = new InputEvent('beforeinput',
        { inputType: type, data: data, cancelable: true, bubbles: true });
      i.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(essayer('insertText', '5')).toBe(true);            // un chiffre
    expect(essayer('insertText', ',')).toBe(true);            // ce qui n'en est pas un
    expect(essayer('deleteContentBackward', null)).toBe(true); // l'effacement
    expect(essayer('insertFromPaste', '99')).toBe(true);       // le collage
    expect(essayer('insertCompositionText', '50')).toBe(true); // la composition
  });

  // ⚠️ Le pavé n'a pas de curseur : les chiffres entrent toujours par la droite.
  // Ignorer la sélection donnait une valeur silencieusement fausse — tout
  // sélectionner puis taper `9` AJOUTAIT le 9 au lieu de remplacer.
  test('tout sélectionner puis taper REMPLACE, ça ne s’ajoute pas', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '1300');
    expect(i.value).toBe('13:00');
    i.setSelectionRange(0, i.value.length);
    taper(i, '9');
    expect(i.dataset.chiffres).toBe('9');
    expect(i.value).toBe('00:09');
    expect(e.seance().exercices[0].series[0].duree_s).toBe(9);
  });

  // ⚠️ Régression introduite PAR la correction de la sélection, trouvée en
  // revue : vider d'abord et poser ensuite effaçait la durée quand le caractère
  // était refusé. On ne remplace que si quelque chose remplace.
  test('un caractère REFUSÉ sur une sélection totale ne détruit rien', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '1300');
    i.setSelectionRange(0, i.value.length);
    taper(i, ',');
    expect(i.dataset.chiffres).toBe('1300');
    expect(i.value).toBe('13:00');
    expect(e.seance().exercices[0].series[0].duree_s).toBe(780);
  });

  // Un appui qui ne change rien ne doit rien écrire : chaque `surChamp` coûte
  // une écriture disque et un envoi réseau.
  test('un appui qui ne change rien ne déclenche aucune écriture', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '50');
    const apresSaisie = e.recus.length;
    effacer(i, 1);                 // « 50 » -> « 5 » : ça change
    effacer(i, 1);                 // « 5 »  -> « »  : ça change
    const apresVidage = e.recus.length;
    expect(apresVidage).toBe(apresSaisie + 2);
    effacer(i, 3);                 // déjà vide : rien ne doit partir
    expect(e.recus.length).toBe(apresVidage);
    taper(i, 'abc');               // aucun chiffre : rien non plus
    expect(e.recus.length).toBe(apresVidage);
  });

  // Les quatre `inputType` d'effacement, pas seulement le retour arrière : sur
  // l'appareil, « supprimer le mot » et « couper » passent par les autres.
  test('les quatre formes d’effacement retirent bien un chiffre', () => {
    ['deleteContentBackward', 'deleteContentForward',
     'deleteWordBackward', 'deleteByCut'].forEach((type) => {
      const e = monter(['pl']);
      const i = e.input(0);
      taper(i, '635');
      i.dispatchEvent(new InputEvent('beforeinput',
        { inputType: type, cancelable: true, bubbles: true }));
      expect(i.dataset.chiffres).toBe('63');
    });
  });

  // Un clavier peut livrer plusieurs caractères dans un seul `insertText`
  // (autocomplétion, saisie rapide). Ils se posent un par un, dans l'ordre.
  test('plusieurs caractères d’un coup se posent dans l’ordre', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper2(i, '21000');
    expect(i.dataset.chiffres).toBe('21000');
    expect(i.value).toBe('02:10:00');
    expect(e.seance().exercices[0].series[0].duree_s).toBe(7800);
  });

  test('et les non-chiffres y sont écartés un par un, sans casser les autres', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper2(i, '5a0');
    expect(i.dataset.chiffres).toBe('50');
    expect(i.value).toBe('00:50');
  });

  test('et effacer une sélection vide tout, pas un chiffre', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    taper(i, '1300');
    i.setSelectionRange(0, i.value.length);
    effacer(i);
    expect(i.dataset.chiffres).toBe('');
    expect(i.value).toBe('');
    expect(e.seance().exercices[0].series[0].duree_s).toBeNull();
  });

  test('et un champ vidé de force redevient vide, pas zéro', () => {
    const e = monter(['pl']);
    const i = e.input(0);
    i.value = '12:34';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    expect(i.value).toBe('');
    expect(e.seance().exercices[0].series[0].duree_s).toBeNull();
  });
});

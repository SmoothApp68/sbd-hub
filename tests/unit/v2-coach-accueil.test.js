// 16/11/2026 — « Le coach te dit » sur l'accueil (I214, I215) : UNE carte sous « Prochaine séance », la première qui parle de
// `analyse.cartes` (le même objet que dans « Ton parcours »), « N autres › » compté avant le plafond du réglage, une par jour
// (les réponses aux gestes sont datées), rien en séance, en carnet, avant les routines, un jour de niveau, ni sur un exercice
// qu'une carte de variation du bloc touche. « Pas maintenant » se dit avec la date absolue de la fin du silence.
global.self = global;
const H = require('./helpers-equilibres.js');
require('../../v2/js/rendu.js');
const Rendu = window.THRendu;
const { Eq, construire, entree, EXOS_A } = H;
const fs = require('fs');
const path = require('path');

const sansCurl = Object.assign({}, EXOS_A);
delete sansCurl.curl;
function quatre(retirees) {
  const sem = {};
  for (let i = 0; i < 4; i++) {
    const r = retirees.indexOf(i) >= 0;
    sem[i] = [{ routine: 'r-a', exos: r ? sansCurl : EXOS_A, gestes: r ? [{ geste: 'retrait', slug: 'curl' }] : [] }];
  }
  return construire(sem);
}
const JOUR = '2026-10-28';
const PRET = { routinesPretes: true };
const texte = (n) => n.textContent.replace(/[ \t\n  ]+/g, ' ').trim();

describe('carteDeLAccueil — une carte, la même que dans « Ton parcours » (I215)', () => {
  test('la première carte qui parle, le même objet ; sans autre carte, aucun « autres »', () => {
    const a = Eq.analyser(entree(quatre([0, 1, 2])));
    const r = Eq.carteDeLAccueil(a, {}, JOUR, PRET);
    expect(r.carte).toBe(a.cartes[0]);
    expect(r.tete).toBe('Le coach te dit');
    expect(r.autres).toBe(0);
    expect(r.fait).toBe(r.carte.fait);
    expect(r.detail.length).toBeGreaterThan(0);              // le report ou la conséquence, repliés derrière « Détail »
    expect(Eq.verifierCarteDeLAccueil(a, {}, JOUR, PRET, r)).toEqual([]);
    // Une copie n'est pas « la même carte » : I215 la voit.
    expect(Eq.verifierCarteDeLAccueil(a, {}, JOUR, PRET, Object.assign({}, r, { carte: Object.assign({}, r.carte) })).some((f) => /^I215/.test(f))).toBe(true);
  });
});

describe('carteDeLAccueil — jamais (I214)', () => {
  const a = () => Eq.analyser(entree(quatre([0, 1, 2])));
  test('en séance, avant les routines, un jour de niveau, en « Juste un carnet »', () => {
    expect(Eq.carteDeLAccueil(a(), {}, JOUR, { routinesPretes: true, enSeance: true })).toBeNull();
    expect(Eq.carteDeLAccueil(a(), {}, JOUR, {})).toBeNull();
    expect(Eq.carteDeLAccueil(a(), {}, JOUR, { routinesPretes: false })).toBeNull();
    expect(Eq.carteDeLAccueil(a(), {}, JOUR, { routinesPretes: true, niveauParle: true })).toBeNull();
    const carnet = Eq.analyser(entree(quatre([0, 1, 2]), { intention: 'entretien' }));
    expect(Eq.carteDeLAccueil(carnet, {}, JOUR, PRET)).toBeNull();
    // La relecture voit une carte posée à tort.
    const r = Eq.carteDeLAccueil(a(), {}, JOUR, PRET);
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, { routinesPretes: true, enSeance: true }, r).some((f) => /en séance/.test(f))).toBe(true);
    expect(Eq.verifierCarteDeLAccueil(a(), {}, JOUR, { routinesPretes: true, niveauParle: true }, r).some((f) => /niveau/.test(f))).toBe(true);
  });
  test('une par jour : une réponse datée d’aujourd’hui (une carte, ou un GESTE, désormais daté) fait taire l’accueil', () => {
    const an = a();
    const cle = an.cartes[0].cle;
    // Une carte de la semaine répondue aujourd'hui (« Pas maintenant » d'une autre carte).
    expect(Eq.carteDeLAccueil(an, { jours: { r: 'non', le: JOUR, refus: 1 } }, JOUR, PRET)).toBeNull();
    // Hier : elle parle.
    expect(Eq.carteDeLAccueil(an, { jours: { r: 'non', le: '2026-10-27', refus: 1 } }, JOUR, PRET)).not.toBeNull();
    // La réponse à un geste écrit sa date avec `geste_routine` (la même valeur, le même `poserProfil`).
    const c = Eq.reponseAuGesteDatee({}, cle, 'r-a', 'curl', 'garder', JOUR);
    expect(c[cle]).toEqual({ r: 'oui', le: JOUR, refus: 0 });
    expect(Object.keys(c.geste_routine)).toEqual(['r-a']);
    expect(Eq.repondueLe(c, JOUR)).toBe(true);
    expect(Eq.repondueLe(Eq.reponseAuGeste({}, 'r-a', 'curl', 'garder'), JOUR)).toBe(false);   // l'ancienne écriture, sans date
    expect(Eq.carteDeLAccueil(an, { [cle + '-autre']: { r: 'oui', le: JOUR } }, JOUR, PRET)).toBeNull();
    // Une réponse sans date (la variation du bloc, le masque de la semaine Forme) ne compte pas.
    expect(Eq.carteDeLAccueil(an, { variation: { b1: { curl: 'garder' } }, forme_semaine: { masquee: true } }, JOUR, PRET)).not.toBeNull();
  });
  test('une carte de variation du bloc ouverte sur le même exercice : la carte de geste se tait (une voix)', () => {
    const an = a();
    expect(Eq.carteDeLAccueil(an, {}, JOUR, { routinesPretes: true, variations: ['curl'] })).toBeNull();
    expect(Eq.carteDeLAccueil(an, {}, JOUR, { routinesPretes: true, variations: ['oiseau'] })).not.toBeNull();
  });
});

describe('« Pas maintenant » : la date absolue de la fin du silence (une source)', () => {
  test('Franc 4 semaines, Normal 8, Prudent 12 ; doublé au 2ᵉ refus de suite ; l’année seulement si elle change', () => {
    const r1 = Eq.reponse({}, 'k', 'non', '2026-11-16');
    expect(Eq.finDuSilence('franc', r1)).toBe('2026-12-14');
    expect(Eq.phraseDuSilence('franc', r1).replace(/ /g, ' ')).toBe('Noté. Je ne t’en reparle pas avant le 14 déc.');
    expect(Eq.finDuSilence('normal', r1)).toBe('2027-01-11');
    expect(Eq.phraseDuSilence('normal', r1).replace(/ /g, ' ')).toBe('Noté. Je ne t’en reparle pas avant le 11 janv. 2027.');
    expect(Eq.finDuSilence('prudent', r1)).toBe('2027-02-08');
    const r2 = Eq.reponse({ k: r1 }, 'k', 'non', '2026-11-16');
    expect(r2.refus).toBe(2);
    expect(Eq.finDuSilence('franc', r2)).toBe('2027-01-11');
  });
  test('la date dite est celle où la carte revient (le silence de `analyser`)', () => {
    const b = quatre([0, 1, 2]);
    const cle = Eq.analyser(entree(b)).cartes[0].cle;
    const rep = Eq.reponse({}, cle, 'non', '2026-10-01');
    const fin = Eq.finDuSilence('normal', rep);
    const veille = new Date(Date.parse(fin + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    expect(Eq.analyser(entree(b, { jour: veille, cartes: { [cle]: rep } })).cartes.filter((c) => c.cle === cle)).toEqual([]);
    expect(Eq.analyser(entree(b, { jour: fin, cartes: { [cle]: rep } })).cartes.filter((c) => c.cle === cle).length).toBe(1);
  });
});

describe('le rendu de l’accueil (rien d’écrit au rendu, le « oui » secondaire)', () => {
  test('la tête, le fait, « Détail » replié, le « oui » à liseré ambre (.oui, jamais .principal)', () => {
    const a = Eq.analyser(entree(quatre([0, 1, 2])));
    const choix = Eq.carteDeLAccueil(a, {}, JOUR, PRET);
    const n = document.createElement('div');
    const gestes = [];
    Rendu.rendreCoachDeLAccueil(n, { accueil: choix, surProposition: (c, p) => gestes.push(p.type), surPlusTard: () => gestes.push('pm'), surAutres: () => gestes.push('autres') });
    expect(gestes).toEqual([]);
    expect(n.hidden).toBe(false);
    expect(n.querySelectorAll('.coach-accueil').length).toBe(1);
    expect(n.querySelector('.coach-tete b').textContent).toBe('Le coach te dit');
    expect(texte(n.querySelector('.coach-fait'))).toBe('Tu as retiré Curl Biceps 3 fois sur tes 4 dernières séances « Haut A ».');
    expect(n.querySelector('.coach-detail').hidden).toBe(true);
    n.querySelector('[data-coach-detail]').click();
    expect(n.querySelector('.coach-detail').hidden).toBe(false);
    const boutons = Array.from(n.querySelectorAll('.eq-actions button'));
    expect(boutons[0].className).toBe('oui');
    expect(n.querySelectorAll('.principal').length).toBe(0);
    expect(boutons.map((b) => b.textContent)).toEqual(['Retirer', 'Garder', 'Pas maintenant']);   // B : le libellé court de l'accueil
    expect(n.querySelector('[data-coach-autres]')).toBeNull();
    boutons[2].click();
    expect(gestes).toEqual(['pm']);
  });
  test('« N autres › » ouvre « Ta semaine et tes équilibres »', () => {
    const n = document.createElement('div');
    const a = Eq.analyser(entree(quatre([0, 1, 2])));
    const choix = Object.assign({}, Eq.carteDeLAccueil(a, {}, JOUR, PRET), { autres: 2 });
    let ouvert = 0;
    Rendu.rendreCoachDeLAccueil(n, { accueil: choix, surAutres: () => { ouvert++; }, surProposition: () => {}, surPlusTard: () => {} });
    expect(n.querySelector('[data-coach-autres]').textContent).toBe('2 autres ›');
    n.querySelector('[data-coach-autres]').click();
    expect(ouvert).toBe(1);
  });
  test('après un geste : le fait et « Annuler » à la place de la carte ; « Pas maintenant » en ligne grise', () => {
    const n = document.createElement('div');
    let annule = 0;
    Rendu.rendreCoachDeLAccueil(n, { fait: { texte: 'C’est fait : « Haut A » sans Curl Biceps.', surAnnuler: () => { annule++; } } });
    expect(n.querySelector('.coach-accueil')).toBeNull();
    expect(n.querySelector('[data-coach-pose]').getAttribute('data-coach-pose')).toBe('fait');
    n.querySelector('[data-annuler-equilibre]').click();
    expect(annule).toBe(1);
    Rendu.rendreCoachDeLAccueil(n, { fait: { texte: 'Noté. Je ne t’en reparle pas avant le 14 déc.', calme: true, surAnnuler: () => {} } });
    expect(n.querySelector('.coach-pose').classList.contains('calme')).toBe(true);
  });
  test('le sommaire : la porte de « Ton parcours » s’ouvre aussi quand une carte parle, sans phrase de bilan', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../v2/js/rendu.js'), 'utf8');
    expect(/vue\.parcours && \(vue\.parcours\.phrase \|\| vue\.parcours\.cartes > 0\)/.test(src)).toBe(true);
  });
});

describe('le câblage (index.html, app.js)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
  test('#coach-accueil sous « Prochaine séance », au-dessus de la semaine ; #ligne-equilibre supprimé', () => {
    expect(html.indexOf('id="ligne-equilibre"')).toBe(-1);
    const p = html.indexOf('id="prochaine-seance"'), c = html.indexOf('id="coach-accueil"'), b = html.indexOf('id="barre-seances"');
    expect(p > 0 && c > p && b > c).toBe(true);
    expect(app.indexOf('rendreLigneDesEquilibres')).toBe(-1);
  });
  test('l’app ne choisit pas la carte : elle passe par `Equilibres.carteDeLAccueil`', () => {
    expect(/Equilibres\.carteDeLAccueil\(a, reponsesDesCartes\(\), jour, ctx\)/.test(app)).toBe(true);
    expect(/routinesPretes: etatRoutines\.code === 'ok'/.test(app)).toBe(true);
    expect(/enSeance: !!seance/.test(app)).toBe(true);
    expect(/niveauParle: !!annonceDeNiveauPosee\(\)/.test(app)).toBe(true);
  });
});

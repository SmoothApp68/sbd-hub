/** @jest-environment node */
//
// 60-2b — LE RAPPEL DE PHASE (MOTEUR §9.16, QUESTIONNAIRE-COACH-V2 §4).
//
// Une phase déclarée (`profiles.phase` non vide) dont la dernière réponse —
// `phase_confirmee_le`, sinon `phase_depuis` — date de 42 jours ou plus : un
// bandeau sur l'accueil de Saisie, « Sèche depuis le 28 sept. », avec « C'est
// toujours ça » et « Changer ». Hors séance ouverte, hors « Juste un carnet ».
//
// ⚠️ `rendreBandeauPhase`, `repondrePhaseDuRappel` et `ouvrirPhaseDuRappel`
// (app.js) se REJOUENT dans un bac `vm`, avec le vrai `profil.js` et le vrai
// `moteur.js` : un test qui chercherait leur texte ne verrait pas une branche
// morte.

process.env.TZ = 'Europe/Paris';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/palier.js');
const Profil = require('../../v2/js/profil.js');
const M = require('../../v2/js/moteur.js');
const { extraire } = require('./aide-profil-ecran.js');

const NB = '\u00a0';
const J = 24 * 3600 * 1000;
// Un instant « il y a n jours », à midi heure de Paris, relatif à AUJ.
const AUJ = new Date(2026, 10, 18, 12, 0);          // 18 nov. 2026, 12:00 Paris
const il_y_a = (n) => new Date(2026, 10, 18 - n, 12, 0).toISOString();

describe('§9.16 — la règle : 42 jours ou plus depuis la dernière réponse', () => {
  const avec = (o) => Object.assign({ phase: 'seche', phase_depuis: null, phase_confirmee_le: null }, o);

  test('⚠️ DISCRIMINANT — 41 jours : non ; 42 : oui ; 43 : oui (depuis `phase_confirmee_le`)', () => {
    expect(Profil.rappelDePhase(avec({ phase_confirmee_le: il_y_a(41) }), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(avec({ phase_confirmee_le: il_y_a(42) }), AUJ)).toBe(true);
    expect(Profil.rappelDePhase(avec({ phase_confirmee_le: il_y_a(43) }), AUJ)).toBe(true);
  });

  test('sans `phase_confirmee_le`, la règle retombe sur `phase_depuis`', () => {
    expect(Profil.rappelDePhase(avec({ phase_depuis: il_y_a(41) }), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(avec({ phase_depuis: il_y_a(42) }), AUJ)).toBe(true);
  });

  test('⚠️ DISCRIMINANT — la confirmation PRIME : récente avec un `phase_depuis` ancien → non ; ancienne avec un `phase_depuis` récent → oui, à la lettre', () => {
    expect(Profil.rappelDePhase(avec({ phase_depuis: il_y_a(90), phase_confirmee_le: il_y_a(3) }), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(avec({ phase_depuis: il_y_a(3), phase_confirmee_le: il_y_a(90) }), AUJ)).toBe(true);
  });

  test('sans phase déclarée : jamais (le maintien par défaut n’a rien à confirmer)', () => {
    [null, undefined, '', 'inconnue', 'recomposition', 0].forEach((v) => {
      expect([v, Profil.rappelDePhase(avec({ phase: v, phase_confirmee_le: il_y_a(200), phase_depuis: il_y_a(200) }), AUJ)])
        .toEqual([v, false]);
    });
    ['prise_de_masse', 'maintien', 'seche'].forEach((v) => {
      expect(Profil.rappelDePhase(avec({ phase: v, phase_confirmee_le: il_y_a(60) }), AUJ)).toBe(true);
    });
  });

  test('⚠️ DISCRIMINANT (60-2c) — qui a répondu « Je ne sais pas » n’a PAS de rappel, ni 42 jours après, ni 200 : la phase écrite est vide', () => {
    [42, 60, 200].forEach((jours) => {
      // La réponse, écrite par la préparation unique (questionnaire ET Profil), il y a `jours` jours.
      const quand = new Date(2026, 10, 18 - jours, 12, 0);
      const champs = Profil.preparerChamps({ phase: 'seche', phase_depuis: il_y_a(300) }, { phase: 'inconnue' }, quand);
      expect(champs.phase).toBeNull();
      const apres = Object.assign({ phase: 'seche', phase_depuis: il_y_a(300) }, champs);
      expect([jours, Profil.rappelDePhase(apres, AUJ)]).toEqual([jours, false]);
      expect(Profil.phraseRappelDePhase(apres)).toBeNull();
      // Le même âge de confirmation sur une phase DÉCLARÉE, lui, rappelle (la fixture déclenche le chemin).
      const declaree = Object.assign({}, apres, { phase: 'maintien' });
      expect([jours, Profil.rappelDePhase(declaree, AUJ)]).toEqual([jours, true]);
    });
  });

  test('sans date, avec une date illisible ou dans le futur : non', () => {
    expect(Profil.rappelDePhase(avec({}), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(avec({ phase_confirmee_le: 'pas une date' }), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(avec({ phase_confirmee_le: new Date(2026, 11, 30, 12).toISOString() }), AUJ)).toBe(false);
    expect(Profil.rappelDePhase(null, AUJ)).toBe(false);
    expect(Profil.rappelDePhase({}, AUJ)).toBe(false);
  });

  test('« aujourd’hui » se donne en Date ou en texte, jamais lu dans l’horloge', () => {
    const p = avec({ phase_confirmee_le: il_y_a(50) });
    expect(Profil.rappelDePhase(p, AUJ)).toBe(true);
    expect(Profil.rappelDePhase(p, AUJ.toISOString())).toBe(true);
    expect(Profil.rappelDePhase(p, '2026-11-18')).toBe(true);
    expect(Profil.rappelDePhase(p, new Date(2026, 9, 1, 12))).toBe(false);   // le 1er oct. : à peine 0 jour
    expect(Profil.rappelDePhase(p, 'n’importe quoi')).toBe(false);
  });

  test('⚠️ DISCRIMINANT — les jours se comptent au CALENDRIER local, pas en heures : 42 jours à cheval sur un changement d’heure', () => {
    // Passage à l'heure d'été (23 h le 29 mars 2026) : 42 jours calendaires = 42 × 24 h − 1 h.
    const ete = avec({ phase_confirmee_le: new Date(2026, 2, 20, 12, 0).toISOString() });
    const auj1 = new Date(2026, 4, 1, 12, 0);
    expect(auj1.getTime() - new Date(ete.phase_confirmee_le).getTime()).toBeLessThan(42 * J);
    expect(Profil.rappelDePhase(ete, auj1)).toBe(true);
    // Retour à l'heure d'hiver (25 h le 25 oct. 2026) : 41 jours calendaires = 41 × 24 h + 1 h.
    const hiver = avec({ phase_confirmee_le: new Date(2026, 9, 24, 12, 0).toISOString() });
    const auj2 = new Date(2026, 11, 4, 12, 0);   // 41 jours plus tard
    expect(auj2.getTime() - new Date(hiver.phase_confirmee_le).getTime()).toBeGreaterThan(41 * J);
    expect(Profil.rappelDePhase(hiver, auj2)).toBe(false);
    expect(Profil.rappelDePhase(hiver, new Date(2026, 11, 5, 12, 0))).toBe(true);
  });

  test('le seuil est celui de la spec : 42 jours', () => {
    expect(Profil.RAPPEL_PHASE_JOURS).toBe(42);
  });
});

describe('§9.16 — la phrase : « Sèche depuis le 28 sept. »', () => {
  test('la phase, puis la date de `phase_depuis` par le formateur de la voix', () => {
    const p = { phase: 'seche', phase_depuis: new Date(2026, 8, 28, 12).toISOString() };
    expect(Profil.phraseRappelDePhase(p)).toBe('Sèche depuis le 28' + NB + 'sept.');
    expect(Profil.phraseRappelDePhase({ phase: 'prise_de_masse', phase_depuis: new Date(2026, 0, 3, 12).toISOString() }))
      .toBe('Prise de masse depuis le 3' + NB + 'janv.');
    expect(Profil.phraseRappelDePhase({ phase: 'maintien', phase_depuis: new Date(2026, 5, 1, 12).toISOString() }))
      .toBe('Maintien ou recomposition depuis le 1' + NB + 'juin');
  });

  test('sans `phase_depuis` (la phase vient du questionnaire) : la phase seule — pas de « depuis » inventé', () => {
    expect(Profil.phraseRappelDePhase({ phase: 'maintien', phase_depuis: null, phase_confirmee_le: il_y_a(60) }))
      .toBe('Maintien ou recomposition.');
  });

  test('sans phase déclarée : pas de phrase', () => {
    expect(Profil.phraseRappelDePhase({ phase: null })).toBeNull();
    expect(Profil.phraseRappelDePhase(null)).toBeNull();
  });
});

describe('§9.16 — TOUTE écriture de la phase pose `phase_confirmee_le`', () => {
  const MAINT = new Date('2026-11-18T10:00:00.000Z');

  test('⚠️ DISCRIMINANT — le segment « TA PHASE » du Profil : la phase, son « depuis » ET la confirmation', () => {
    const ecrits = [];
    const sec = Profil.sectionPhase({ phase: 'seche' }, (c) => ecrits.push(c), () => MAINT);
    sec.segment.surChoix('maintien');
    sec.segment.surChoix('inconnue');
    expect(ecrits).toEqual([
      { phase: 'maintien', phase_depuis: MAINT.toISOString(), phase_confirmee_le: MAINT.toISOString() },
      { phase: null, phase_depuis: MAINT.toISOString(), phase_confirmee_le: MAINT.toISOString() }
    ]);
  });

  test('⚠️ DISCRIMINANT — re-toucher la phase DÉJÀ choisie la confirme SEULEMENT : `phase_depuis` ne repart pas de zéro', () => {
    const depuis = il_y_a(80);
    const ecrits = [];
    const sec = Profil.sectionPhase({ phase: 'seche', phase_depuis: depuis, phase_confirmee_le: il_y_a(50) },
      (c) => ecrits.push(c), () => MAINT);
    sec.segment.surChoix('seche');
    expect(ecrits).toEqual([{ phase_confirmee_le: MAINT.toISOString() }]);
    // Le rappel s'éteint (la confirmation est neuve) sans effacer l'ancienneté de la phase.
    const apres = Object.assign({ phase: 'seche', phase_depuis: depuis }, ecrits[0]);
    expect(Profil.rappelDePhase(apres, AUJ)).toBe(false);
    expect(apres.phase_depuis).toBe(depuis);
    // Une phase non choisie (« Je ne sais pas » vaut `inconnue`) se confirme de même.
    const sans = [];
    Profil.sectionPhase({ phase: null }, (c) => sans.push(c), () => MAINT).segment.surChoix('inconnue');
    expect(sans).toEqual([{ phase_confirmee_le: MAINT.toISOString() }]);
  });

  test('le questionnaire (`preparerChamps`) la pose à chaque réponse, changée ou non', () => {
    expect(Profil.preparerChamps({ phase: 'seche' }, { phase: 'seche' }, MAINT))
      .toEqual({ phase_confirmee_le: MAINT.toISOString() });
    expect(Profil.preparerChamps({ phase: 'seche' }, { phase: 'maintien' }, MAINT))
      .toEqual({ phase: 'maintien', phase_depuis: MAINT.toISOString(), phase_confirmee_le: MAINT.toISOString() });
  });

  test('⚠️ DISCRIMINANT — un changement de phase au Profil n’allume PAS le rappel le jour même (la confirmation est neuve)', () => {
    // Questionnaire répondu il y a 50 jours ; la phase change au Profil aujourd'hui.
    const avant = { phase: 'maintien', phase_depuis: il_y_a(50), phase_confirmee_le: il_y_a(50) };
    expect(Profil.rappelDePhase(avant, AUJ)).toBe(true);
    let apres = null;
    Profil.sectionPhase(avant, (c) => { apres = Object.assign({}, avant, c); }, () => AUJ).segment.surChoix('seche');
    expect(Profil.rappelDePhase(apres, AUJ)).toBe(false);
  });
});

// ── Le bandeau, dans app.js ─────────────────────────────────────────────────
describe('le bandeau de Saisie (app.js, rejoué)', () => {
  // L'horloge du bac : `new Date()` sans argument rend l'instant figé.
  class DateFigee extends Date {
    constructor(...a) { if (a.length) super(...a); else super(AUJ.getTime()); }
  }
  function bac(o) {
    const opt = o || {};
    const journal = { bandeaux: [], feuilles: [], ecrits: [], voiles: 0 };
    const ctx = {
      Date: DateFigee, Profil, Moteur: M,
      profil: Object.prototype.hasOwnProperty.call(opt, 'profil') ? opt.profil
        : { phase: 'seche', phase_depuis: il_y_a(60), phase_confirmee_le: il_y_a(50), intention: 'progresser' },
      seance: opt.seance || null,
      $: () => ({}),
      feuilleProfil: null,
      Rendu: {
        rendreBandeauReprise: (n, v) => { journal.bandeaux.push(v); },
        rendreFeuilleChoix: (n, v) => { journal.feuilles.push(v); }
      },
      poserProfil: (champs) => {
        journal.ecrits.push(champs);
        ctx.profil = Object.assign({}, ctx.profil, Profil.champsEcrits(champs));   // `profil` est à jour AVANT le 1er await
        return Promise.resolve();
      },
      fermerVoile: () => { journal.voiles++; },
      ouvrirFeuilleProfil: () => { ctx.feuilleProfil({}); }
    };
    vm.createContext(ctx);
    ['rendreBandeauPhase', 'repondrePhaseDuRappel', 'ouvrirPhaseDuRappel'].forEach((f) => vm.runInContext(extraire(f), ctx));
    return { ctx, journal, appel: (code) => vm.runInContext(code, ctx),
      dernier: () => journal.bandeaux[journal.bandeaux.length - 1] };
  }

  test('⚠️ DISCRIMINANT — dû : la phrase, la ligne grise, « Changer » à gauche et « C’est toujours ça » à droite', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    const v = b.dernier();
    expect(v.quoi).toBe(Profil.phraseRappelDePhase(b.ctx.profil));
    expect(v.quoi).toMatch(/^Sèche depuis le \d+\u00a0\S+$/);
    expect(v.depuis).toBe('Ta phase règle la série de plus et entre dans chaque pari du coach.');
    expect([v.libelleQuitter, v.libelleReprendre]).toEqual(['Changer', 'C’est toujours ça']);
    expect(typeof v.surQuitter).toBe('function');
    expect(typeof v.surReprendre).toBe('function');
  });

  test('pas dû (41 jours), sans phase déclarée, profil inconnu : pas de bandeau', () => {
    [{ phase: 'seche', phase_confirmee_le: il_y_a(41) }, { phase: null, phase_depuis: il_y_a(90) }, {}, null].forEach((p) => {
      const b = bac({ profil: p });
      b.appel('rendreBandeauPhase()');
      expect([p, b.dernier()]).toEqual([p, null]);
    });
  });

  test('⚠️ DISCRIMINANT — pendant une séance ouverte : pas de bandeau', () => {
    const b = bac({ seance: { id: 'S1' } });
    b.appel('rendreBandeauPhase()');
    expect(b.dernier()).toBeNull();
  });

  test('⚠️ DISCRIMINANT — « Juste un carnet » : pas de bandeau ; en Progresser, il revient (rien n’a été effacé)', () => {
    const carnet = bac({ profil: { phase: 'seche', phase_confirmee_le: il_y_a(60), intention: 'entretien' } });
    carnet.appel('rendreBandeauPhase()');
    expect(carnet.dernier()).toBeNull();
    carnet.ctx.profil = Object.assign({}, carnet.ctx.profil, { intention: 'progresser' });
    carnet.appel('rendreBandeauPhase()');
    expect(carnet.dernier()).not.toBeNull();
  });

  test('le rendu n’écrit RIEN (aucune confirmation d’office)', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    b.appel('rendreBandeauPhase()');
    expect(b.journal.ecrits).toEqual([]);
  });

  test('⚠️ DISCRIMINANT — « C’est toujours ça » n’écrit que `phase_confirmee_le`, par `preparerChamps`, et le bandeau disparaît', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    const avant = Object.assign({}, b.ctx.profil);
    b.dernier().surReprendre();
    expect(b.journal.ecrits).toHaveLength(1);
    expect(Object.keys(b.journal.ecrits[0])).toEqual(['phase_confirmee_le']);
    expect(b.journal.ecrits[0].phase_confirmee_le).toBe(AUJ.toISOString());
    expect(b.ctx.profil.phase).toBe(avant.phase);
    expect(b.ctx.profil.phase_depuis).toBe(avant.phase_depuis);
    expect(b.dernier()).toBeNull();                      // il s'éteint tout de suite
    expect(Profil.rappelDePhase(b.ctx.profil, AUJ)).toBe(false);
  });

  test('« Changer » ouvre la feuille de la phase : les trois phases, la phase en cours cochée, ni « Effacer » ni « Je ne sais pas »', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    b.dernier().surQuitter();
    const f = b.journal.feuilles[0];
    expect(f.titre).toBe('Ta phase');
    expect(f.options.map((o) => o.cle)).toEqual(['prise_de_masse', 'maintien', 'seche']);
    expect(f.valeur).toBe('seche');
    expect(f.surEffacer).toBeNull();
    expect(typeof f.surAnnuler).toBe('function');
  });

  test('⚠️ DISCRIMINANT — la feuille : une AUTRE phase écrit la phase, son « depuis » et la confirmation ; la voile se ferme d’abord', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    b.dernier().surQuitter();
    b.journal.feuilles[0].surChoix('maintien');
    expect(b.journal.voiles).toBe(1);
    expect(b.journal.ecrits).toEqual([{ phase: 'maintien', phase_depuis: AUJ.toISOString(), phase_confirmee_le: AUJ.toISOString() }]);
    expect(b.ctx.profil.phase).toBe('maintien');
    expect(b.dernier()).toBeNull();
  });

  test('la feuille : choisir la phase EN COURS la confirme, sans redater « depuis »', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    b.dernier().surQuitter();
    b.journal.feuilles[0].surChoix('seche');
    expect(b.journal.ecrits).toEqual([{ phase_confirmee_le: AUJ.toISOString() }]);
    expect(b.ctx.profil.phase_depuis).toBe(il_y_a(60));
  });

  test('« Annuler » ferme la feuille sans rien écrire', () => {
    const b = bac();
    b.appel('rendreBandeauPhase()');
    b.dernier().surQuitter();
    b.journal.feuilles[0].surAnnuler();
    expect(b.journal.voiles).toBe(1);
    expect(b.journal.ecrits).toEqual([]);
  });
});

// ── Le câblage ──────────────────────────────────────────────────────────────
describe('le câblage', () => {
  const HTML = fs.readFileSync(path.join(__dirname, '../../v2/index.html'), 'utf8');

  test('⚠️ 171 — le rappel est un avis (dans « Le coach te dit », au-dessus des routines) ; le questionnaire passe en bas (C), après elles', () => {
    const q = HTML.indexOf('id="bandeau-questionnaire"');
    const ph = HTML.indexOf('id="bandeau-phase"');
    const rep = HTML.indexOf('id="bandeau-reprise"');
    const avis = HTML.indexOf('id="avis-corps"');
    const liste = HTML.indexOf('id="liste-routines"');
    expect(rep).toBeGreaterThan(0);
    expect(avis).toBeGreaterThan(rep);
    expect(ph).toBeGreaterThan(avis);
    expect(liste).toBeGreaterThan(ph);
    expect(q).toBeGreaterThan(liste);
  });

  test('`rendreSaisie` dessine le rappel juste après le bandeau du questionnaire — avant tout retour anticipé', () => {
    expect(extraire('rendreSaisie')).toMatch(/rendreBandeauQuestionnaire\(\);\s*rendreBandeauPhase\(\);[\s\S]*Chargement…/);
  });

  test('`chargerProfil` le redessine quand la ligne de profil arrive', () => {
    expect(extraire('chargerProfil')).toMatch(/rendreBandeauQuestionnaire\(\);\s*rendreBandeauPhase\(\);/);
  });

  test('il a son propre nœud : celui du questionnaire n’est pas touché', () => {
    expect(extraire('rendreBandeauQuestionnaire')).not.toMatch(/bandeau-phase|rappelDePhase/);
    expect(extraire('rendreBandeauPhase')).toMatch(/\$\('bandeau-phase'\)/);
  });
});

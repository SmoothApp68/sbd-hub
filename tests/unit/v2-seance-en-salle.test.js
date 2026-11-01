// 204 — LA SÉANCE EN SALLE (maquette « Séance en salle v1 »).
//
// Saisir une série d'un pouce, la tête ailleurs : la barre d'onglets se cache pendant une séance, « Terminer » est le bouton
// principal, « Modifier » et « S'entraîner ensemble » vivent dans le « ⋯ » de la séance, le repos est en tête de la colonne ✓,
// la note dans le « ⋯ » de l'exercice, « Pourquoi ? » est un lien discret au bout de la phrase datée. Du pur affichage : rien
// ici ne touche au plan ; les mesures (44/48 px, onglets réellement cachés) se prouvent au banc d'écran, dans Chromium.

const fs = require('fs');
const path = require('path');

require('../../v2/js/modele.js');
require('../../v2/js/semaine.js');
require('../../v2/js/bilan.js');
require('../../v2/js/rendu.js');
const Modele = require('../../v2/js/modele.js');
const Seance = require('../../v2/js/seance.js');
const { progTravail } = require('./aide-routine-programmee.js');

const Rendu = () => window.THRendu;
const APP = fs.readFileSync(path.join(__dirname, '../../v2/js/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../../v2/styles.css'), 'utf8');

const CATALOGUE = [
  { slug: 'dc', nom: 'Développé Couché (Barre)', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] },
  { slug: 'ec', nom: 'Écarté Poulie', mesure: 'charge_reps', charge: 'externe', muscles_primaires: ['pectoraux'], muscles_secondaires: [] }
];
const INDEX = Modele.indexerExercices(CATALOGUE);
let graine = 0;
const uuid = () => 'set-' + (++graine);

function seanceDe(lignes) {
  return Seance.creer({
    id: 'S', userId: 'u', idSerie: uuid,
    routine: { id: 'r', exercices: lignes.map(([slug, series, groupe], i) => ({
      id: 're' + i, exercise_slug: slug, series: progTravail(series), reps_visees: null, repos_cible_s: null,
      groupe_superset: groupe === undefined ? null : groupe })) }
  });
}

function rendre(seance, extra) {
  const cible = document.createElement('div');
  Rendu().rendreBlocsSeance(cible, seance, Object.assign({
    blocs: Modele.blocsDeSeance(seance, CATALOGUE),
    tourAtteint: (g) => Seance.tourAtteint(seance, g),
    exercice: (slug) => INDEX[slug],
    precedent: () => null,
    fantome: (i, j) => Seance.fantome(seance, i, j, null),
    surChamp: () => {}, surValider: () => {}, surNumero: () => {}, surEffort: () => {},
    surAjoutSerie: () => {}, surSupprimerSerie: () => {},
    surMenuBloc: () => {}, surMenuExercice: () => {}, surNote: () => {}, surRepos: () => {}, surPourquoi: () => {},
    libelles: () => ({ jaune: ['100 kg × 7'], gris: 'Le 29 oct. : 100 kg × 6. Une rep de plus.' }),
    etiquette: () => '6-8 reps'
  }, extra || {}));
  return cible;
}

function barre(sur) {
  const cible = document.createElement('header');
  Rendu().rendreBandeauSeance(cible, Object.assign({
    titre: 'Push', debut: new Date(Date.now() - 12 * 60000).toISOString(),
    compte: { series: 1, validees: 1, travail: 1 }, modifier: false, selection: null, edition: false,
    surModifier: () => {}, surAnnulerSelection: () => {}, surTerminer: () => {}, surReduire: () => {}, surMenu: () => {}
  }, sur || {}));
  return cible;
}

describe('la barre de la séance en salle', () => {
  test('« ⌄ » réduit, le titre, « ⋯ », puis « Terminer » : rien d’autre (plus de « Modifier » à plat)', () => {
    const b = barre();
    const boutons = [...b.querySelectorAll('button')];
    expect(boutons.map((x) => x.textContent)).toEqual(['⌄', '⋯', 'Terminer']);
    expect(boutons[0].getAttribute('aria-label')).toBe('Réduire la séance');
    expect(boutons[1].getAttribute('aria-label')).toBe('Actions de la séance');
    expect(b.querySelector('.bandeau-fin').classList.contains('principal')).toBe(true);
    expect(b.querySelector('.bandeau-modifier')).toBeNull();
  });

  test('« ⌄ » et « ⋯ » appellent leurs gestes', () => {
    const appels = [];
    const b = barre({ surReduire: () => appels.push('reduire'), surMenu: () => appels.push('menu') });
    b.querySelector('.bandeau-reduire').click();
    b.querySelector('.bandeau-menu').click();
    expect(appels).toEqual(['reduire', 'menu']);
  });

  test('en correction d’une séance passée : pas de « ⌄ » (les onglets restent), « Enregistrer » neutre', () => {
    const b = barre({ edition: true });
    expect(b.querySelector('.bandeau-reduire')).toBeNull();
    expect(b.querySelector('.bandeau-fin').textContent).toBe('Enregistrer');
  });

  test('le mode Modifier ouvert : « Terminé » reprend la place du « ⋯ » (la sortie du mode se voit)', () => {
    const b = barre({ modifier: true });
    expect(b.querySelector('.bandeau-menu')).toBeNull();
    expect(b.querySelector('.bandeau-modifier').textContent).toBe('Terminé');
  });

  test('app.js : la barre d’onglets se cache dans la séance en cours, pas en correction', () => {
    expect(APP).toMatch(/barre\.hidden = !onglet \|\| \(nom === 'seance' && !enEdition\(\)\)/);
  });

  test('app.js : la réserve du bas vaut zéro quand les onglets sont cachés par la séance', () => {
    expect(APP).toMatch(/\(hOnglets \|\| sansOnglets\) && hOnglets !== barresMesurees\.onglets/);
  });
});

describe('le « ⋯ » de la séance', () => {
  test('Modifier, et « S’entraîner ensemble » seulement s’il est possible', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleMenuSeance(c, { titre: 'Push', surModifier: () => {}, surEnsemble: () => {} });
    expect([...c.querySelectorAll('.feuille-menu button')].map((b) => b.textContent)).toEqual(['Modifier', 'S’entraîner ensemble']);
    const d = document.createElement('div');
    Rendu().rendreFeuilleMenuSeance(d, { titre: 'Push', surModifier: () => {}, surEnsemble: null });
    expect([...d.querySelectorAll('.feuille-menu button')].map((b) => b.textContent)).toEqual(['Modifier']);
  });

  test('le groupe de séance ne porte plus de bouton « S’entraîner ensemble »', () => {
    const c = document.createElement('div');
    Rendu().rendreGroupeSeance(c, { invitations: [], message: null, surLancer: () => {} });
    expect(c.querySelector('.g-lancer')).toBeNull();
    expect(c.hidden).toBe(true);
  });
});

describe('l’exercice en salle', () => {
  test('un exercice seul : « ⋯ » sur la ligne du nom, pas de rangée de tête, pas de rangée de réglages, pas de « CHARGE × REPS »', () => {
    const c = rendre(seanceDe([['dc', 2, null]]));
    const bloc = c.querySelector('.bloc-seance');
    expect(bloc.querySelector('.legende-haut .menu-pts')).not.toBeNull();
    expect(bloc.querySelector('.tete-haut')).toBeNull();
    expect(bloc.querySelector('.reglages-exo')).toBeNull();
    expect(bloc.querySelector('.type-mesure')).toBeNull();
    expect(bloc.querySelector('.note-exo')).toBeNull();   // pas de « + Note » : la note vit dans le « ⋯ »
  });

  test('le repos : « ⏱ 3:00 » en tête de la colonne ✓, réglable au toucher ; « ⏱ — » tant qu’aucun n’est posé', () => {
    let s = seanceDe([['dc', 2, null]]);
    let appel = null;
    let bouton = rendre(s, { surRepos: (i) => { appel = i; } }).querySelector('.cols-seance button.repos-entete');
    expect(bouton.textContent).toBe('⏱ —');
    s = Seance.definirReposCible(s, 0, 180);
    bouton = rendre(s, { surRepos: (i) => { appel = i; } }).querySelector('.cols-seance button.repos-entete');
    expect(bouton.textContent).toBe('⏱ 3:00');
    expect(bouton.getAttribute('aria-label')).toBe('Repos cible de Développé Couché (Barre)');
    bouton.click();
    expect(appel).toBe(0);
  });

  test('un superset garde un repos PAR BRANCHE (une seule en-tête ne peut pas en porter deux)', () => {
    const c = rendre(seanceDe([['dc', 2, 1], ['ec', 2, 1]]));
    expect(c.querySelectorAll('.cols-seance .repos-entete')).toHaveLength(0);
    expect(c.querySelectorAll('.reglages-exo .repos-cible')).toHaveLength(2);
    expect(c.querySelectorAll('.reglages-exo .note-exo')).toHaveLength(0);
  });

  test('une note posée s’affiche sous le nom et rouvre la feuille de note', () => {
    let s = seanceDe([['dc', 2, null]]);
    s = Seance.definirNoteExercice(s, 0, 'Prise large');
    let appel = null;
    const c = rendre(s, { surNote: (i) => { appel = i; } });
    const note = c.querySelector('.legende-exo > .note-sous-nom');
    expect(note.textContent).toBe('Prise large');
    expect(note.previousElementSibling.className).toBe('legende-haut');
    note.click();
    expect(appel).toBe(0);
  });

  test('« Pourquoi ? » : un attribut au bout de la phrase datée, le texte du coach reste mot pour mot', () => {
    const c = rendre(seanceDe([['dc', 2, null]]));
    const gris = c.querySelector('.consigne-dit');
    expect(gris.textContent).toBe('Le 29 oct. : 100 kg × 6. Une rep de plus.');
    expect(gris.getAttribute('data-pourquoi')).toBe('Pourquoi ?');
    expect(CSS).toMatch(/\.consigne-dit\[data-pourquoi\]::after\{content:" " attr\(data-pourquoi\)/);
  });

  test('sans porte vers « Pourquoi » (éditeur, vue sans surPourquoi), pas de lien', () => {
    const c = rendre(seanceDe([['dc', 2, null]]), { surPourquoi: undefined });
    expect(c.querySelector('.consigne-dit').hasAttribute('data-pourquoi')).toBe(false);
  });

  test('les cibles au pouce : ⋯ et nom 44 px, ±15 s du repos 48 px', () => {
    expect(CSS).toMatch(/#vue-seance \.legende-haut \.menu-pts\{width:44px;height:44px/);
    expect(CSS).toMatch(/#vue-seance \.legende-haut \.nom-exo\.lien\{min-height:44px/);
    expect(CSS).toMatch(/\.repos-b\{min-width:48px;height:48px/);
  });
});

describe('les feuilles de l’exercice portent la note', () => {
  test('exercice seul : « Ajouter une note » / « Modifier la note » dans le menu du bloc', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleBloc(c, { superset: false, noms: 'DC', peutGrouper: true, surRemplacer: () => {}, surGrouper: () => {},
      surAjouterApres: () => {}, surSupprimer: () => {}, surNote: () => {}, note: '' });
    expect(c.querySelector('.menu-note').textContent).toBe('Ajouter une note');
    const d = document.createElement('div');
    Rendu().rendreFeuilleBloc(d, { superset: false, noms: 'DC', peutGrouper: true, surRemplacer: () => {}, surGrouper: () => {},
      surAjouterApres: () => {}, surSupprimer: () => {}, surNote: () => {}, note: 'x' });
    expect(d.querySelector('.menu-note').textContent).toBe('Modifier la note');
  });

  test('exercice d’un superset : la note est dans son menu à lui', () => {
    const c = document.createElement('div');
    Rendu().rendreFeuilleExercice(c, { nom: 'Écarté', surRemplacer: () => {}, surDegrouper: () => {}, surSupprimer: () => {}, surNote: () => {}, note: '' });
    expect(c.querySelector('.menu-note').textContent).toBe('Ajouter une note');
  });
});

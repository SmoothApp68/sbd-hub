// 83 (12/10/2026) — UN APPAREIL NE SUPPRIME QUE LES SÉRIES QU'IL CONNAÎT
// (ECRAN-SAISIE §7 duovicies.1 bis).
//
// Prouvé au banc le 12/10 (82) : B reprend la séance de A ; A valide une 3ᵉ
// série ; le geste suivant de B envoie sa liste, et `remplacerSeries` supprimait
// en base toute série absente de cette liste — la 3ᵉ série de A partait. La
// suppression se limite désormais aux séries que l'appareil CONNAÎT (envoyées par
// lui, ou chargées depuis la base) ; une entrée de file ancienne, sans `connues`,
// garde l'ancienne règle.
require('../../v2/js/modele.js');
require('../../v2/js/seance.js');
const A = require('../../v2/js/attente.js');

// Un faux client : la table `sets`, en mémoire, et le journal de ce qui part.
function clientFactice(base) {
  const journal = { supprimees: [], upsert: [] };
  const fin = (data) => ({ then: (ok) => ok({ data: data, error: null }) });
  const client = {
    from(table) {
      if (table !== 'sets') throw new Error('table inattendue : ' + table);
      return {
        select() { return { eq: (_c, sid) => fin(base.filter((s) => s.session_id === sid).map((s) => ({ id: s.id }))) }; },
        delete() {
          return { in: (_c, ids) => {
            journal.supprimees.push(...ids);
            for (let i = base.length - 1; i >= 0; i--) if (ids.indexOf(base[i].id) >= 0) base.splice(i, 1);
            return fin([]);
          } };
        },
        upsert(lignes) { journal.upsert.push(...lignes.map((l) => l.id)); return fin([]); }
      };
    }
  };
  return { client, journal };
}

describe('83 — `remplacerSeries` ne supprime que ce que l’appareil connaît', () => {
  let D;
  beforeEach(() => {
    delete require.cache[require.resolve('../../v2/js/donnees.js')];
  });
  afterEach(() => { delete globalThis.THClient; });

  const jouer = async (enBase, liste, connues) => {
    const base = enBase.map((id) => ({ id, session_id: 'S' }));
    const f = clientFactice(base);
    globalThis.THClient = { obtenir: () => f.client };
    D = require('../../v2/js/donnees.js');
    await D.remplacerSeries('S', liste.map((id) => ({ id, session_id: 'S' })), connues);
    return { supprimees: f.journal.supprimees.slice().sort(), restent: base.map((s) => s.id).sort() };
  };

  test('⚠️ DISCRIMINANT — base {1,2,3}, connues {1,2}, liste {2} : supprime 1 seulement, 3 reste (la série de l’autre appareil)', async () => {
    const r = await jouer(['1', '2', '3'], ['2'], ['1', '2']);
    expect(r.supprimees).toEqual(['1']);
    expect(r.restent).toEqual(['2', '3']);
  });

  test('un seul appareil, retrait du milieu : base {1,2,3}, connues {1,2,3}, liste {1,3} → supprime 2 (non-régression)', async () => {
    expect((await jouer(['1', '2', '3'], ['1', '3'], ['1', '2', '3'])).supprimees).toEqual(['2']);
  });

  test('« Modifier » une séance terminée : séries chargées {1,2,3}, liste {1,2} → supprime 3 (§7 duovicies.1)', async () => {
    expect((await jouer(['1', '2', '3'], ['1', '2'], ['1', '2', '3'])).supprimees).toEqual(['3']);
  });

  test('séance chargée VIDE (séries pas encore reçues), liste {} : ne supprime RIEN (§7 duovicies.1, par la nouvelle règle aussi)', async () => {
    const r = await jouer(['1', '2', '3'], [], []);
    expect(r.supprimees).toEqual([]);
    expect(r.restent).toEqual(['1', '2', '3']);
  });

  test('une entrée ANCIENNE, sans `connues` : l’ancienne règle — tout ce qui n’est pas dans la liste', async () => {
    expect((await jouer(['1', '2', '3'], ['2'], undefined)).supprimees).toEqual(['1', '3']);
  });

  test('la règle pure, exportée : `aRetirerDe(existantes, liste, connues)`', () => {
    D = require('../../v2/js/donnees.js');
    expect(D.aRetirerDe(['1', '2', '3'], ['2'], ['1', '2'])).toEqual(['1']);
    expect(D.aRetirerDe(['1', '2', '3'], ['2'], null)).toEqual(['1', '3']);
  });
});

describe('83 — la file porte les connues, et une entrée qui en remplace une autre les CUMULE', () => {
  const op = (connues, donnees) => ({ table: A.SETS, op: A.REMPLACER, id: 'S', donnees: donnees || [], connues: connues });

  test('une entrée neuve porte ses connues', () => {
    const f = A.poser([], op(['1', '2']));
    expect(f[0].connues).toEqual(['1', '2']);
  });

  test('⚠️ DISCRIMINANT — remplacer une entrée en file cumule ses connues (une série retirée entre-temps reste connue)', () => {
    let f = A.poser([], op(['1', '2']));
    f = A.poser(f, op(['3']));
    expect(f).toHaveLength(1);
    expect(f[0].connues).toEqual(['1', '2', '3']);
  });

  test('une entrée ANCIENNE en file (sans connues) le reste quand on la remplace : l’ancienne règle, le temps qu’elle parte', () => {
    const ancienne = A.poser([], { table: A.SETS, op: A.REMPLACER, id: 'S', donnees: [] });
    expect(ancienne[0].connues).toBeUndefined();
    const f = A.poser(ancienne, op(['1']));
    expect(f[0].connues).toBeUndefined();
    // Partie, l'entrée suivante est neuve et porte ses connues.
    expect(A.poser([], op(['1']))[0].connues).toEqual(['1']);
  });
});

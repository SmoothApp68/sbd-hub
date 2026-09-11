/** @jest-environment node */
//
// v2/js/donnees.js — la pagination.
//
// CONFIGURATION DISCRIMINANTE (CADRAGE-V2 §2 quater) : un jeu où TOUTES les
// lignes partagent la même valeur de tri. C'est la situation réelle — mesurée
// en base, les 28 103 séries ne portent que 6 valeurs distinctes de
// `created_at`, dont un groupe de 16 704. Sur une clé unique, pagination par
// OFFSET et pagination par curseur donnent le même résultat et le banc ne
// prouverait rien.
//
// La table de papier ci-dessous se comporte comme Postgres sur un tri non
// total : les lignes ex æquo sortent dans un ordre ARBITRAIRE, différent à
// chaque requête. Rien dans la norme SQL ne l'interdit, et c'est exactement ce
// que fait le planificateur quand il change de stratégie entre deux tranches.

const Donnees = require('../../v2/js/donnees.js');

const PAGE = Donnees.PAGE;
const TOTAL = PAGE * 2 + 500;   // 2 500 lignes : trois tranches

// Toutes les lignes portent le MÊME `created_at`. Seul `id` les distingue.
function jeuExAequo(n) {
  const lignes = [];
  for (let i = 0; i < n; i++) {
    lignes.push({ id: String(i).padStart(6, '0'), created_at: '2026-08-01T10:00:00Z' });
  }
  return lignes;
}

// Un tri instable mais REPRODUCTIBLE : à chaque requête, la table rend les
// ex æquo dans une rotation différente. Déterministe pour le test, arbitraire
// du point de vue de l'appelant — comme Postgres.
function tablePapier(lignes, colonneTri) {
  let requetes = 0;
  return {
    get requetes() { return requetes; },
    trier() {
      requetes++;
      const copie = lignes.slice();
      if (colonneTri === 'id') {
        copie.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return copie;
      }
      // Ex æquo sur la colonne de tri : rotation de `requetes` crans.
      const d = (requetes * 337) % copie.length;
      return copie.slice(d).concat(copie.slice(0, d));
    }
  };
}

// La pagination par curseur de clé — celle du code de production. La requête
// porte `.gt(cle, dernier).order(cle).limit(taille)` : la table peut bien
// rendre ses lignes dans le désordre, l'ORDER BY sur une clé unique les remet
// dans un ordre TOTAL. C'est toute la correction, en une ligne de fixture.
function trancheurCle(table, cle) {
  return (dernier, taille) => {
    let lignes = table.trier();
    if (dernier !== null && dernier !== undefined) lignes = lignes.filter((l) => l[cle] > dernier);
    lignes.sort((a, b) => (a[cle] < b[cle] ? -1 : a[cle] > b[cle] ? 1 : 0));
    return Promise.resolve({ data: lignes.slice(0, taille), error: null });
  };
}

// L'ANCIEN algorithme, conservé ici et NULLE PART AILLEURS : il ne sert qu'à
// prouver que le banc reproduit la condition réelle.
async function paginerParOffset(table) {
  let tout = [], debut = 0;
  for (;;) {
    const lot = table.trier().slice(debut, debut + PAGE);
    tout = tout.concat(lot);
    if (lot.length < PAGE) return tout;
    debut += PAGE;
  }
}

const distincts = (lignes) => new Set(lignes.map((l) => l.id)).size;

describe('pagination — clé de tri NON unique', () => {
  test('par curseur de clé : toutes les lignes, aucun doublon, aucun manque', async () => {
    const lignes = jeuExAequo(TOTAL);
    const table = tablePapier(lignes, 'created_at');   // la table reste instable
    const recu = await Donnees.paginerParCle(trancheurCle(table, 'id'), 'id');

    expect(recu).toHaveLength(TOTAL);
    expect(distincts(recu)).toBe(TOTAL);
    expect(new Set(recu.map((l) => l.id))).toEqual(new Set(lignes.map((l) => l.id)));
  });

  test('ASYMÉTRIE — le même jeu par OFFSET perd des lignes', async () => {
    const table = tablePapier(jeuExAequo(TOTAL), 'created_at');
    const recu = await paginerParOffset(table);

    expect(distincts(recu)).toBeLessThan(TOTAL);          // des lignes manquent
    expect(recu.length).toBeGreaterThan(distincts(recu)); // et d'autres reviennent
  });

  test('sur une clé UNIQUE, les deux méthodes se valent — d’où l’aveuglement', async () => {
    // La configuration permissive : c'est elle qui masquait le défaut.
    const stable = tablePapier(jeuExAequo(TOTAL), 'id');
    const parOffset = await paginerParOffset(stable);
    expect(distincts(parOffset)).toBe(TOTAL);
  });
});

describe('pagination — cas de bord', () => {
  test('un jeu plus court qu’une tranche tient en une requête', async () => {
    const table = tablePapier(jeuExAequo(12), 'created_at');
    const recu = await Donnees.paginerParCle(trancheurCle(table, 'id'), 'id');
    expect(recu).toHaveLength(12);
    expect(table.requetes).toBe(1);
  });

  test('un jeu vide ne boucle pas', async () => {
    const table = tablePapier([], 'created_at');
    expect(await Donnees.paginerParCle(trancheurCle(table, 'id'), 'id')).toEqual([]);
  });

  test('une erreur de tranche remonte — on ne rend pas un lot amputé en silence', async () => {
    const tranche = () => Promise.resolve({ data: null, error: new Error('réseau') });
    await expect(Donnees.paginerParCle(tranche, 'id')).rejects.toThrow('réseau');
  });

  test('un curseur qui n’avance pas arrête la boucle au lieu de tourner sans fin', async () => {
    // Clé mal choisie : toutes les lignes portent la même. Sans garde-fou,
    // la boucle ne se termine jamais et l'app se fige.
    const fige = (dernier, taille) => Promise.resolve({
      data: new Array(taille).fill(null).map(() => ({ id: 'identique' })), error: null
    });
    const recu = await Donnees.paginerParCle(fige, 'id');
    expect(recu).toHaveLength(PAGE * 2);   // une tranche, puis l'arrêt au doublon
  });
});

// ── Le trancheur de production, exercé pour de vrai ────────────────────────
//
// Les tests ci-dessus valident `paginerParCle` avec une tranche de test. Ils ne
// disent RIEN du `.order(cle)` que pose `trancheur` — or c'est précisément la
// ligne qui corrige le défaut. On lui donne donc un faux constructeur de
// requête, chaînable comme celui de PostgREST, qui applique réellement les
// filtres qu'on lui passe.
function fausseRequete(lignes) {
  const etat = { gt: null, cle: null, ordonne: false, taille: null };
  const q = {
    gt(colonne, valeur) { etat.gt = { colonne, valeur }; return q; },
    order(colonne) { etat.cle = colonne; etat.ordonne = true; return q; },
    limit(n) {
      etat.taille = n;
      // La table rend ses lignes dans un ordre arbitraire, comme Postgres.
      let out = lignes.slice().reverse();
      if (etat.gt) out = out.filter((l) => l[etat.gt.colonne] > etat.gt.valeur);
      if (etat.ordonne) {
        out.sort((a, b) => (a[etat.cle] < b[etat.cle] ? -1 : a[etat.cle] > b[etat.cle] ? 1 : 0));
      }
      return Promise.resolve({ data: out.slice(0, n), error: null });
    }
  };
  return q;
}

describe('trancheur — le tri sur la clé est bien posé sur la requête', () => {
  test('une pagination complète rend TOUTES les lignes, sans doublon', async () => {
    const lignes = jeuExAequo(TOTAL);
    const tranche = Donnees.trancheur(() => fausseRequete(lignes), 'id');
    const recu = await Donnees.paginerParCle(tranche, 'id');

    expect(recu).toHaveLength(TOTAL);
    expect(distincts(recu)).toBe(TOTAL);
  });

  test('la première tranche ne filtre pas, les suivantes portent le curseur', async () => {
    const vus = [];
    const tranche = Donnees.trancheur(() => {
      const q = fausseRequete(jeuExAequo(TOTAL));
      const gt = q.gt;
      q.gt = (c, v) => { vus.push(v); return gt(c, v); };
      return q;
    }, 'id');
    await Donnees.paginerParCle(tranche, 'id');
    expect(vus).toEqual(['000999', '001999']);   // 3 tranches, 2 curseurs
  });
});

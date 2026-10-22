/** @jest-environment node */
//
// 55-1 — LES RECORDS (MOTEUR §9.23, delta 55-1).
//
// « Un record est un fait : une série que rien de ton passé ne dépasse. La
// médaille le dit à la validation, avec le record d'avant et sa date. »
//
//   1. le rejeu : l'historique réel d'Aurélien (couché barre, tractions,
//      élévation latérale poulie, tapis), chaque série de travail depuis le
//      01/06/2026 — ses records ET sa phrase ;
//   2. les 17 cas synthétiques, une règle chacun ;
//   3. le tableau des records (la table cumulée), à trois dates ;
//   4. la table cumulée, la source : `recordDeLaTable` et la table par reps
//      de la page d'exercice la lisent.
//
// Le fichier de cas est la sortie de la référence (`records55.py`) : une
// série y est un tableau `[slug, equip, type, kg, reps, duree_s, distance_m]`,
// `kg` à `null` = poids du corps sans lest, négatif = aide.

// ⚠️ LE FUSEAU AVANT TOUTE DATE : les débuts du fichier sont des heures
// locales sans décalage, et « le 1er sept. » se lit au calendrier local.
process.env.TZ = 'Europe/Paris';

const Mo = require('../../v2/js/modele.js');
require('../../v2/js/profil.js');
require('../../v2/js/palier.js');
require('../../v2/js/moteur.js');
const F = require('./fixtures/cas-55-1-records.json');

// 120 (D1, décision d'Aurélien du 16/10/2026, audit du 16/10) — « La force estimée reste, comme progression […] ; elle
// sort des records, des médailles, du fil et de l'XP ; les records sont les vraies barres. » Le fichier de cas vient
// de la référence `records55.py`, d'avant D1 : il garde ses lignes `un_rm_estime` et la phrase « 1RM estimé : ≈ … kg. »
// de la médaille. On les retire ICI, à la lecture, explicitement — le fichier n'est pas corrigé en silence ; la
// référence est à régénérer côté Claude.ai. Une médaille qui n'aurait eu que cette ligne n'en est plus une.
const SANS_1RM = / ?1RM estimé : ≈\u00a0[\d\s\u00a0,]+\u00a0kg\./;
function selonD1(records, phrase) {
  const r = (records || []).filter((x) => x.type !== 'un_rm_estime');
  if (!r.length) return { records: r, phrase: null };
  return { records: r, phrase: phrase ? [phrase[0].replace(SANS_1RM, ''), phrase[1]] : phrase };
}
['rejeu', 'synthetiques'].forEach((k) => {
  (k === 'rejeu' ? F.rejeu.attendus : F.synthetiques).forEach((a) => {
    const d = selonD1(a.records, a.phrase);
    a.records = d.records; a.phrase = d.phrase;
  });
});

const COL = F.colonnes_serie;
const serieDe = (t) => {
  const o = {};
  COL.forEach((c, i) => { o[c] = t[i]; });
  return { exercise_slug: o.slug, type_serie: o.type, charge_kg: o.kg, reps: o.reps,
           duree_s: o.duree_s, distance_m: o.distance_m, _equip: o.equip };
};
const seanceDe = (se) => ({ debut: se.debut, fin: se.fin, series: se.series.map(serieDe) });
// Au poids du corps (lesté ou non) : `equip` « aucun » dans le fichier — dans
// l'app, la mesure `reps` ou une charge ajoutée (§9.17).
const optionsDe = (s) => ({ equipement: s._equip, corps: s._equip === 'aucun' });
// Le nom court qui suit « au » dans le cap rond : dans l'app, `Modele.nomCourt`
// sur le catalogue ; ici, le seul exercice du fichier qui en a un.
const NOM_COURT = { squat_barre: 'squat' };

// Les nombres de la référence sont arrondis au dixième (à la façon de Python,
// au pair le plus proche : 166,25 → 166,2) ; la fonction rend la valeur
// exacte. On compare donc au dixième près, et le jour seul des dates.
const PRES = 0.0501;
function memeRecord(obtenu, attendu) {
  const fautes = [];
  Object.keys(attendu).forEach((k) => {
    const a = attendu[k], o = obtenu[k];
    if (k === 'ancien_le') {
      if ((a === null) !== (o === null || o === undefined) || (a !== null && String(o).slice(0, 10) !== a)) {
        fautes.push(k + ' : ' + o + ' ≠ ' + a);
      }
    } else if (typeof a === 'number') {
      if (typeof o !== 'number' || Math.abs(o - a) > PRES) fautes.push(k + ' : ' + o + ' ≠ ' + a);
    } else if (a !== o) fautes.push(k + ' : ' + o + ' ≠ ' + a);
  });
  return fautes;
}
function comparer(obtenus, attendus) {
  if (obtenus.length !== attendus.length) {
    return ['types : ' + obtenus.map((r) => r.type).join(',') + ' ≠ ' + attendus.map((r) => r.type).join(',')];
  }
  return [].concat(...attendus.map((a, i) => memeRecord(obtenus[i], a).map((f) => a.type + '.' + f)));
}

// ══ 1. LE REJEU ═════════════════════════════════════════════════════════════
describe('§9.23 — le rejeu sur l\'historique réel (chaque série de travail depuis le 01/06/2026)', () => {
  const seances = F.rejeu.seances.map(seanceDe);
  const parDebut = {};
  seances.forEach((s) => { parDebut[s.debut] = s; });

  test('le fichier est bien lu : 109 séries attendues, 7 médailles', () => {
    expect(F.rejeu.attendus.length).toBe(109);
    expect(F.rejeu.attendus.filter((a) => a.records.length).length).toBe(7);
  });

  test('chaque série : ses records, l\'ancien record et sa date', () => {
    const fautes = [];
    F.rejeu.attendus.forEach((a) => {
      const se = parDebut[a.seance];
      const s = se.series[a.indice];
      const r = Mo.recordsBattus(seances, se, a.indice, optionsDe(s));
      comparer(r, a.records).forEach((f) => fautes.push(a.seance + ' #' + a.indice + ' ' + f));
    });
    expect(fautes).toEqual([]);
  });

  test('chaque série : la phrase de la médaille, exactement (espaces insécables comprises)', () => {
    const fautes = [];
    F.rejeu.attendus.forEach((a) => {
      const se = parDebut[a.seance];
      const s = se.series[a.indice];
      const r = Mo.recordsBattus(seances, se, a.indice, optionsDe(s));
      const p = Mo.phraseDeRecord(r, NOM_COURT[s.exercise_slug], se.debut);
      if (JSON.stringify(p) !== JSON.stringify(a.phrase)) {
        fautes.push(a.seance + ' #' + a.indice + ' : ' + JSON.stringify(p) + ' ≠ ' + JSON.stringify(a.phrase));
      }
    });
    expect(fautes).toEqual([]);
  });
});

// ══ 2. LES 17 CAS SYNTHÉTIQUES ══════════════════════════════════════════════
describe('§9.23 — les cas d\'une règle chacun', () => {
  test('ils sont 17', () => { expect(F.synthetiques.length).toBe(17); });
  F.synthetiques.forEach((c) => {
    test(c.titre, () => {
      const se = seanceDe(c.seance);
      const s = se.series[c.indice];
      const r = Mo.recordsBattus(c.historique.map(seanceDe), se, c.indice, optionsDe(s));
      expect(comparer(r, c.records)).toEqual([]);
      expect(Mo.phraseDeRecord(r, NOM_COURT[s.exercise_slug], se.debut)).toEqual(c.phrase);
    });
  });
});

// ══ 3. LE TABLEAU DES RECORDS (LA TABLE CUMULÉE, À UNE DATE) ════════════════
describe('§9.23 — le tableau des records : au moins 1, 3, 5, 8, 10 reps, à une date', () => {
  const seances = F.rejeu.seances.map(seanceDe);
  F.autres.tableau_records.forEach((c) => {
    test(c.slug + ' au ' + c.a_date.slice(0, 10), () => {
      const t0 = new Date(c.a_date).getTime();
      const series = [];
      seances.filter((se) => new Date(se.debut).getTime() < t0).forEach((se) => {
        se.series.filter((s) => s.exercise_slug === c.slug).forEach((s) => series.push(Object.assign({ _date: se.debut }, s)));
      });
      const table = Mo.tableCumulee(series, (s) => s._date);
      const obtenu = {};
      Object.keys(c.attendu).forEach((n) => {
        const l = Mo.auMoinsDe(table, Number(n));
        obtenu[n] = l ? l.charge : null;
      });
      expect(obtenu).toEqual(c.attendu);
    });
  });
});

// ══ 4. LA TABLE CUMULÉE, LA SEULE SOURCE ════════════════════════════════════
describe('§9.23 — la table cumulée est la source (ECRAN §7 bis.16 : « cumulée, jamais brute »)', () => {
  const s = (charge_kg, reps, d, type_serie) => ({ charge_kg, reps, type_serie: type_serie || 'travail', _date: d });
  const dateDe = (x) => x._date;

  test('qui a fait 150 × 7 a pu faire 150 × 5 : la charge pour au moins N reps', () => {
    const t = Mo.tableCumulee([s(150, 7, '2026-01-01'), s(120, 6, '2026-02-01'), s(100, 5, '2026-03-01')], dateDe);
    expect(t.map((l) => [l.reps, l.charge, l.date])).toEqual([
      [5, 150, '2026-01-01'], [6, 150, '2026-01-01'], [7, 150, '2026-01-01']]);
    expect(Mo.auMoinsDe(t, 1).charge).toBe(150);
    expect(Mo.auMoinsDe(t, 8)).toBeNull();
  });

  test('à charge égale, la date est la PREMIÈRE fois ; ni chauffe, ni dégressive, ni échec', () => {
    const t = Mo.tableCumulee([s(100, 5, '2026-03-01'), s(100, 6, '2026-02-01'), s(140, 5, '2026-04-01', 'echauffement'),
      s(140, 5, '2026-04-01', 'echec'), s(140, 5, '2026-04-01', 'degressive')], dateDe);
    expect(Mo.auMoinsDe(t, 5)).toEqual({ reps: 5, charge: 100, date: '2026-02-01' });
  });

  test('`recordDeLaTable` lit la cumulée : la charge la plus lourde, avec le plus de reps à cette charge', () => {
    const t = Mo.tableCumulee([s(140, 1, '2026-01-10'), s(130, 3, '2026-02-01'), s(140, 2, '2026-03-01')], dateDe);
    expect(Mo.recordDeLaTable(t)).toEqual({ charge: 140, reps: 2, date: '2026-03-01' });
  });

  test('la table par reps de la page garde le brut, et lit la cumulée pour le chiffre d\'une ligne déduite', () => {
    const t = Mo.tableParReps([s(42.5, 14, '2024-02-27'), s(80, 15, '2025-07-03')], 'charge_reps', dateDe);
    expect(t.map((l) => [l.reps, l.charge, !!l.deduit, l.chargeDeduite])).toEqual([
      [14, 42.5, true, 80], [15, 80, false, undefined]]);
  });

  test('au poids du corps, une charge vide est le corps (0) ; ailleurs, elle ne compte pas', () => {
    const series = [s(null, 8, '2026-01-01'), s(10, 5, '2026-01-02')];
    expect(Mo.auMoinsDe(Mo.tableCumulee(series, dateDe, { corps: true }), 8).charge).toBe(0);
    expect(Mo.auMoinsDe(Mo.tableCumulee(series, dateDe), 8)).toBeNull();
  });
});

// ══ 5. CE QUE L'APP DONNE AUX RECORDS ═══════════════════════════════════════
describe('§9.23 — les options d\'un exercice et son nom court', () => {
  test('`corps` : la mesure en reps, le lest, ou sans matériel ; jamais une barre ni une aide', () => {
    expect(Mo.optionsDeRecord({ equipement: 'barre', mesure: 'charge_reps' })).toEqual({ equipement: 'barre', corps: false });
    expect(Mo.optionsDeRecord({ equipement: 'aucun', mesure: 'reps' }).corps).toBe(true);
    expect(Mo.optionsDeRecord({ equipement: 'disque', mesure: 'charge_reps', charge: 'ajoutee' }).corps).toBe(true);
    expect(Mo.optionsDeRecord({ equipement: 'machine', mesure: 'charge_reps', charge: 'assistance' }).corps).toBe(false);
    expect(Mo.optionsDeRecord(null)).toEqual({ equipement: null, corps: false });
  });
  test('le nom court suit « au » : sans parenthèses, en minuscules', () => {
    expect(Mo.nomCourt('Squat (Barre)')).toBe('squat');
    expect(Mo.nomCourt('Développé Couché (Barre)')).toBe('développé couché');
    expect(Mo.nomCourt('Tractions')).toBe('tractions');
  });
});

// ══ 6. LA VUE D'UN EXERCICE : LE TABLEAU, LE 1RM, LE RAPPORT AU POIDS ═══════
describe('§9.23 — le tableau des records de la page (aujourd\'hui, il y a 6 mois, il y a 1 an)', () => {
  const seances = F.rejeu.seances.map(seanceDe).map((se) => ({ debut: se.debut,
    series: se.series.filter((x) => x.exercise_slug === 'developpe_couche_barre') })).filter((se) => se.series.length);
  test('`tableauDesRecords` rend les trois dates du fichier, aux reps 1, 3, 5, 8, 10', () => {
    const dates = F.autres.tableau_records.map((c) => c.a_date);
    const t = Mo.tableauDesRecords(seances, dates, { equipement: 'barre', corps: false });
    expect(t.map((l) => l.reps)).toEqual([1, 3, 5, 8, 10]);
    F.autres.tableau_records.forEach((c, i) => {
      const obtenu = {};
      t.forEach((l) => { obtenu[l.reps] = l.valeurs[i] ? l.valeurs[i].charge : null; });
      expect([c.a_date, obtenu]).toEqual([c.a_date, c.attendu]);
    });
  });
  test('un record ne baisse jamais à la barre : chaque ligne monte ou reste d\'une date à la suivante', () => {
    const t = Mo.tableauDesRecords(seances, ['2026-09-16T00:00', '2026-03-16T00:00', '2025-09-16T00:00'], { equipement: 'barre' });
    expect(t.every((l) => l.valeurs[0].charge >= l.valeurs[1].charge && l.valeurs[1].charge >= l.valeurs[2].charge)).toBe(true);
  });
  test('la force estimée de la page (D1, hors des records) : le meilleur Epley de 3 à 10 reps (122,5 × 6 → 147), avec sa série', () => {
    const r = Mo.recordsDeLExercice(seances, '2026-09-16T00:00', { equipement: 'barre', corps: false });
    expect([Math.round(r.unRM.valeur), r.unRM.charge, r.unRM.reps, r.unRM.date]).toEqual([147, 122.5, 6, '2026-09-08T17:03']);
    expect([r.lourde.charge, r.lourde.reps, r.lourde.date]).toEqual([140, 1, '2025-11-28T15:45']);
  });
  test('le même périmètre que la médaille : une machine sur ses 12 derniers mois', () => {
    const se = [{ debut: '2024-01-10T18:00', series: [{ charge_kg: 300, reps: 10, type_serie: 'travail' }] },
                { debut: '2026-08-01T18:00', series: [{ charge_kg: 200, reps: 10, type_serie: 'travail' }] }];
    expect(Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: 'machine' }).lourde.charge).toBe(200);
    expect(Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: 'barre' }).lourde.charge).toBe(300);
    // §9.23 (H1, #371) — et l'affichage le dit : « sur 12 mois », jamais à la barre.
    expect(Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: 'machine' }).douzeMois).toBe(true);
    expect(['poulie', 'haltere', 'machine_smith'].every((e) =>
      Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: e }).douzeMois)).toBe(true);
    expect(Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: 'barre' }).douzeMois).toBe(false);
    expect(Mo.recordsDeLExercice(se, '2026-09-08T18:00', { equipement: 'aucun', corps: true }).douzeMois).toBe(false);
  });
});

describe('§9.23 — le rapport au poids : la charge de travail ÷ une pesée de moins de 14 jours', () => {
  const P = require('../../v2/js/poids.js');
  F.autres.rapport_au_poids.forEach((c) => {
    test(c.titre, () => {
      const r = P.rapportAuPoids(c.charge_travail, c.pesees.map((p) => ({ date: p.date, poids_kg: p.poids })), c.jour);
      const jour = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      expect(r === null ? null : { rapport: r.rapport, pesee: { date: jour(r.pesee.date), poids: r.pesee.poids } }).toEqual(c.attendu);
    });
  });
});

describe('§9.23 (H1, #371) — une machine : jamais de recul dans le tableau', () => {
  test('⚠️ DISCRIMINANT — la fenêtre est celle d\'aujourd\'hui pour toutes les colonnes : un vieux 150 ne paraît pas il y a 1 an', () => {
    const se = [{ debut: '2025-02-13T18:00', series: [{ charge_kg: 150, reps: 8, type_serie: 'travail' }] },
                { debut: '2026-08-07T18:00', series: [{ charge_kg: 120, reps: 8, type_serie: 'travail' }] }];
    const t = Mo.tableauDesRecords(se, ['2026-10-06T12:00', '2026-04-06T12:00', '2025-10-06T12:00'], { equipement: 'machine' });
    expect(t.map((l) => l.valeurs.map((v) => (v ? v.charge : null)))).toEqual([
      [120, null, null], [120, null, null], [120, null, null], [120, null, null], [null, null, null]]);
    // À la barre, toute la vie : le 150 reste le record, aucune fenêtre.
    const b = Mo.tableauDesRecords(se, ['2026-10-06T12:00', '2026-04-06T12:00', '2025-10-06T12:00'], { equipement: 'barre' });
    expect(b[0].valeurs.map((v) => (v ? v.charge : null))).toEqual([150, 150, 150]);
  });
});

describe('ECRAN §7 quater.3 (H3, #371) — la table par reps suit le périmètre du record', () => {
  const se = [{ debut: '2025-02-13T18:00', series: [{ id: 'v', charge_kg: 150, reps: 8, type_serie: 'travail' }] },
              { debut: '2026-08-07T18:00', series: [{ id: 'n', charge_kg: 120, reps: 8, type_serie: 'travail' }] }];
  const table = (equipement) => {
    const dans = [];
    Mo.seancesDuPerimetre(se, '2026-10-06T12:00', { equipement }).forEach((h) => h.series.forEach((x) => dans.push(x)));
    return Mo.tableParReps(dans, 'charge_reps', (x) => (x.id === 'v' ? '2025-02-13' : '2026-08-07'));
  };
  test('⚠️ DISCRIMINANT — une machine : le vieux 150 hors fenêtre ne paraît pas, et la page le dit (« sur 12 mois »)', () => {
    expect(table('machine').map((l) => [l.reps, l.charge])).toEqual([[8, 120]]);
    expect(Mo.recordsDeLExercice(se, '2026-10-06T12:00', { equipement: 'machine' }).douzeMois).toBe(true);
  });
  test('à la barre : la table de toujours, sans mention', () => {
    expect(table('barre').map((l) => [l.reps, l.charge])).toEqual([[8, 150]]);
    expect(Mo.recordsDeLExercice(se, '2026-10-06T12:00', { equipement: 'barre' }).douzeMois).toBe(false);
  });
});

// 120 (D1, audit du 16/10/2026 : 04 F6, 05 #2, 06 #10) — LA FORCE ESTIMÉE EST UNE PROGRESSION, PAS UN RECORD.
// « La force estimée reste, comme progression (page de l'exercice : « Force estimée ≈ 157 kg, d'après 140 × 5 », sa
// courbe) ; elle sort des records, des médailles, du fil et de l'XP ; les records sont les vraies barres. »
describe('120 (D1) — la force estimée n’est plus un record', () => {
  const t = (charge_kg, reps) => ({ exercise_slug: 'presse', charge_kg, reps, type_serie: 'travail' });
  test('⚠️ DISCRIMINANT — le faux record de l’audit (05 #2) : 100 × 10 après 100 × 12 ne bat rien', () => {
    const hist = [{ debut: '2026-09-01T18:00', series: [t(90, 10)] }, { debut: '2026-09-08T18:00', series: [t(100, 12)] }];
    const se = { debut: '2026-09-15T18:00', series: [t(100, 10)] };
    // Avant D1 : `[{ type: 'un_rm_estime', valeur: 133.3 }]` — une série moins bonne que 100 × 12, médaillée.
    expect(Mo.recordsBattus(hist, se, 0, { equipement: 'barre' })).toEqual([]);
    expect(Mo.phraseDeRecord([], 'presse', se.debut)).toBeNull();
  });
  test('une vraie barre reste un record, sans « 1RM estimé » dans la médaille', () => {
    const hist = [{ debut: '2026-09-01T18:00', series: [t(140, 5)] }];
    const se = { debut: '2026-09-15T18:00', series: [t(142.5, 5)] };
    const r = Mo.recordsBattus(hist, se, 0, { equipement: 'barre' });
    expect(r.map((x) => x.type)).toEqual(['charge_a_reps', 'charge_max']);
    expect(Mo.phraseDeRecord(r, 'presse', se.debut)[0]).not.toMatch(/1RM|estim/);
  });
  test('la page garde la force estimée, avec la série qui la donne (3 à 10 reps, le périmètre des records)', () => {
    const se = [{ debut: '2026-09-01T18:00', series: [t(140, 5), t(100, 12), t(60, 2)] }];
    const u = Mo.recordsDeLExercice(se, '2026-10-01T12:00', { equipement: 'barre' }).unRM;
    expect([Math.round(u.valeur), u.charge, u.reps]).toEqual([163, 140, 5]);
  });
});

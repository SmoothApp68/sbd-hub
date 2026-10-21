// Nomenclature Lot 2 — mergeExerciseData (fonction PURE, engine.js).
// Règle validée : sessionsCount SOMMÉS, zones[z].e1rm PRÉCIS-prioritaire
// (jamais max), e1rm top recalculé (max zones + tethering), to prioritaire
// sur les champs plats. Aucune mutation de db — vérifié.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ENG = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'engine.js'), 'utf8');

function extractFn(src, name) {
  const sm = src.match(new RegExp('^function ' + name + '\\b', 'm'));
  if (!sm) throw new Error('NOT FOUND fn: ' + name);
  const start = sm.index;
  const lineEnd = src.indexOf('\n', start);
  const rest = src.slice(lineEnd);
  const em = rest.match(/\n\}/);
  return src.slice(start, em ? lineEnd + em.index + 2 : src.length);
}

function makeCtx(exercises) {
  const ctx = vm.createContext({ console, db: { exercises: exercises } });
  vm.runInContext(extractFn(ENG, 'mergeExerciseData'), ctx);
  return ctx;
}
const merge = (ctx, from, to) => vm.runInContext(
  'mergeExerciseData(db, ' + JSON.stringify(from) + ', ' + JSON.stringify(to) + ')', ctx);

const zone = (e1rm, sw, count) => ({ e1rm: e1rm, shadowWeight: sw, sessionsCount: count });

describe('mergeExerciseData — règle validée champ par champ', () => {
  test('sessionsCount SOMMÉS par zone (cas réel : 7 générique + 33 précis = 40)', () => {
    const ctx = makeCtx({
      'Écarté Machine (Pec Deck)': { e1rm: 60, shadowWeight: 50, zones: { hypertrophie: zone(60, 0, 7) } },
      'Écarté (Machine)': { e1rm: 65, shadowWeight: 57.5, zones: { hypertrophie: zone(65, 0, 33) } }
    });
    const r = merge(ctx, 'Écarté Machine (Pec Deck)', 'Écarté (Machine)');
    expect(r.merged.zones.hypertrophie.sessionsCount).toBe(40);
    expect(r.summary.zones.hypertrophie.sessionsCount).toEqual({ from: 7, to: 33, merged: 40 });
  });

  test('zones[z].e1rm PRÉCIS-prioritaire : to>0 gardé ; to=0/from=30 → 30', () => {
    const ctx = makeCtx({
      G: { zones: { hypertrophie: zone(50, 0, 2), vitesse: zone(30, 0, 1) } },
      P: { zones: { hypertrophie: zone(45, 0, 5), vitesse: zone(0, 0, 0) } }
    });
    const r = merge(ctx, 'G', 'P');
    expect(r.merged.zones.hypertrophie.e1rm).toBe(45); // to > 0 → to
    expect(r.merged.zones.vitesse.e1rm).toBe(30);      // to = 0 → from
  });

  test('ANTI-MAX explicite : from=127.5 > to=117.5 → résultat 117.5, PAS 127.5', () => {
    const ctx = makeCtx({
      'Curl Barre EZ': { zones: { hypertrophie: zone(127.5, 0, 7) } },
      'Curl Biceps (Barre EZ)': { zones: { hypertrophie: zone(117.5, 0, 12) } }
    });
    const r = merge(ctx, 'Curl Barre EZ', 'Curl Biceps (Barre EZ)');
    expect(r.merged.zones.hypertrophie.e1rm).toBe(117.5);
    expect(r.merged.zones.hypertrophie.e1rm).not.toBe(127.5);
    expect(r.merged.zones.hypertrophie.sessionsCount).toBe(19);
  });

  test('e1rm top recalculé = max des zones fusionnées + tethering (hyper > force → force ajustée)', () => {
    const ctx = makeCtx({
      G: { e1rm: 200, zones: { force: zone(100, 0, 3) } },   // vieux e1rm top gonflé
      P: { e1rm: 90, zones: { force: zone(90, 0, 4), hypertrophie: zone(100, 0, 6) } }
    });
    const r = merge(ctx, 'G', 'P');
    // hyper (100) > force (90) → tethering : force = round2.5(100×1.02)=102.5, top = 102.5
    expect(r.merged.zones.force.e1rm).toBe(102.5);
    expect(r.merged.e1rm).toBe(102.5); // PAS le 200 périmé du générique
  });

  test('zone présente uniquement dans from → importée telle quelle', () => {
    const ctx = makeCtx({
      G: { zones: { vitesse: zone(40, 0, 2) } },
      P: { zones: { hypertrophie: zone(60, 0, 8) } }
    });
    const r = merge(ctx, 'G', 'P');
    expect(r.merged.zones.vitesse).toEqual(zone(40, 0, 2));
    expect(r.summary.zones.vitesse.imported).toBe('from');
  });

  test('shadowWeight top & champs plats : to prioritaire, from en combleur', () => {
    const ctx = makeCtx({
      G: { shadowWeight: 48, lastRPE: 8, zones: {} },
      P: { shadowWeight: 55, fiveRepCalibrated: true, zones: {} }
    });
    const r = merge(ctx, 'G', 'P');
    expect(r.merged.shadowWeight).toBe(55);       // to présent
    expect(r.merged.fiveRepCalibrated).toBe(true); // to
    expect(r.merged.lastRPE).toBe(8);              // combleur from
  });

  test('toName absent → renommage simple', () => {
    const ctx = makeCtx({ G: { e1rm: 50, zones: { force: zone(50, 0, 3) } } });
    const r = merge(ctx, 'G', 'P');
    expect(r.summary.action).toBe('rename');
    expect(r.merged.zones.force.sessionsCount).toBe(3);
  });

  test('fromName absent → no-op (to inchangé)', () => {
    const ctx = makeCtx({ P: { e1rm: 60, zones: { force: zone(60, 0, 5) } } });
    const r = merge(ctx, 'G', 'P');
    expect(r.summary.action).toBe('noop');
    expect(r.merged).toEqual({ e1rm: 60, zones: { force: zone(60, 0, 5) } });
  });

  test('les deux absents → no-op, merged null', () => {
    const r = merge(makeCtx({}), 'G', 'P');
    expect(r.summary.action).toBe('noop');
    expect(r.merged).toBeNull();
  });

  test('IDEMPOTENCE : appliquer, supprimer from, re-fusionner → résultat identique (pas de double somme)', () => {
    const ctx = makeCtx({
      G: { zones: { hypertrophie: zone(50, 0, 7) } },
      P: { zones: { hypertrophie: zone(60, 0, 10) } }
    });
    const r1 = merge(ctx, 'G', 'P');
    expect(r1.merged.zones.hypertrophie.sessionsCount).toBe(17);
    // L'appelant applique : écrit merged sous P, supprime G
    vm.runInContext('db.exercises.P = ' + JSON.stringify(r1.merged) + '; delete db.exercises.G;', ctx);
    const r2 = merge(ctx, 'G', 'P');
    expect(r2.summary.action).toBe('noop');
    expect(r2.merged.zones.hypertrophie.sessionsCount).toBe(17); // toujours 17, pas 24
  });

  test('PURETÉ : db strictement inchangé après appel', () => {
    const exercises = {
      G: { e1rm: 50, shadowWeight: 45, zones: { force: zone(50, 5, 3) } },
      P: { e1rm: 60, shadowWeight: 55, zones: { force: zone(60, 0, 4) } }
    };
    const ctx = makeCtx(exercises);
    const before = vm.runInContext('JSON.stringify(db)', ctx);
    merge(ctx, 'G', 'P');
    merge(ctx, 'G', 'P');
    expect(vm.runInContext('JSON.stringify(db)', ctx)).toBe(before);
  });

  test('accepte aussi la map exercises directement (sans wrapper db)', () => {
    const ctx = vm.createContext({ console });
    vm.runInContext(extractFn(ENG, 'mergeExerciseData'), ctx);
    const r = vm.runInContext(
      'mergeExerciseData({ G: { zones: { force: { e1rm: 50, shadowWeight: 0, sessionsCount: 2 } } }, ' +
      'P: { zones: { force: { e1rm: 55, shadowWeight: 0, sessionsCount: 3 } } } }, "G", "P")', ctx);
    expect(r.merged.zones.force.sessionsCount).toBe(5);
  });
});

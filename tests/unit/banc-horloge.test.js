// La fenêtre « jour local ≠ jour UTC » : le banc ne s'y joue jamais (01/11/2026, social-2 / social / groupe).
const path = require('path');
const { decalageDuDecor } = require(path.join(__dirname, '../banc/horloge.js'));

describe('horloge du banc : ni les 7 premiers jours du mois, ni la fenêtre jour local ≠ jour UTC', () => {
  const jl = (t) => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
  const ju = (t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate(); };

  test('pour chaque quart d\'heure de la veille au lendemain du 1er novembre, le jour local rejoint le jour UTC', () => {
    const debut = Date.parse('2026-10-31T00:00:00Z');
    for (let t = debut; t < debut + 3 * 86400000; t += 900000) {
      const d = decalageDuDecor(t);
      expect(jl(t + d)).toBe(ju(t + d));
      expect(d).toBeLessThanOrEqual(8 * 86400000);
    }
  });

  test('le 1er novembre 2026, l\'heure du banc passe au 8, à la même heure locale', () => {
    const t = new Date(2026, 10, 1, 12, 0, 0).getTime();
    const l = new Date(t + decalageDuDecor(t));
    expect([l.getMonth(), l.getDate(), l.getHours()]).toEqual([10, 8, 12]);
  });

  test('du 1er au 7 de chaque mois de 2026, le jour retenu est au moins le 8 du même mois', () => {
    for (let m = 0; m < 12; m++) for (let j = 1; j <= 7; j++) for (const h of [0, 3, 12, 23]) {
      const t = new Date(2026, m, j, h, 30).getTime(), l = new Date(t + decalageDuDecor(t));
      expect(l.getMonth()).toBe(m);
      expect(l.getDate()).toBeGreaterThanOrEqual(8);
    }
  });

  test('un jour sans frontière, aucun décalage', () => {
    const t = new Date(2026, 9, 15, 12, 0, 0).getTime();
    expect(decalageDuDecor(t)).toBe(0);
  });
});

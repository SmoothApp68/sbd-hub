/**
 * 210 — L'ambre (--accent) ne signale que l'action principale et l'actif : bouton principal, onglet/période actif,
 * cible du jour, records. Ce test échoue si le nombre de lignes qui lisent `var(--accent)` dépasse le plafond
 * (relevé après 210), et si les usages retirés reviennent. Ajouter un usage = justifier ici et monter le plafond.
 */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'styles.css'), 'utf8');
const PLAFOND = 117; // relevé après 210 ; +1 en 211 : le point du « Pourquoi ? » jamais ouvert (un signal voulu) ; +1 en 260-b : le jeton --anneau-focus (l'anneau de focus lit l'ambre par ce seul jeton) ; +3 en 250 (maquette notes-ia v4) : le liseré des lignes « Dans tes notes » (un même liseré pour toutes, rien de présélectionné), la coche ✓ et « Annuler » (deux actions) ; +1 en 265 (maquette séance v4) : le filet de la ligne du coach qui propose ses chauffes (sa voix, un seul liseré) ; +1 le 16/11/2026 (§9.27 quater) : le filet de la carte « Le coach te dit » de « Ta semaine » (la même voix, le même liseré) ; +3 le 16/11/2026 (« Le coach te dit » sur l'accueil, maquette du 16/11) : le filet de la carte de l'accueil (la même voix), le « oui » SECONDAIRE à liseré ambre `.oui` (l'ambre plein reste à « Démarrer », décision d'Aurélien) et le filet du fait posé `.coach-pose` (comme `.eq-fait-pose`) ; la ligne « Voir mes équilibres » retirée n'en lisait pas ; +3 le 20/11/2026 (le repos conseillé dans la molette, MOTEUR §9.52) : la ligne « Conseillé : 2:30 » (la voix du coach), « Prendre 2:30 » (l'action unique de la feuille, à liseré) et la marque « conseillé » sur le cran de la molette ; +1 le 25/11/2026 (lot 3, changement 3, maquette du 25/11) : « Modifier » de la ligne « Titre, salle, note » de l'écran de fin (une action à texte ambre, comme « Annuler » du toast ; l'ambre plein reste à « Terminer ») ; +1 le 29/11/2026 (« Les paris en coulisse », maquette validée) : « Pas tenu » de la page « À propos de ton coach », en ambre et jamais en rouge (un fait, pas une faute)

const lignes = css.split('\n');
const usages = lignes.filter((l) => /var\(--accent\)/.test(l));

test('usages de --accent sous le plafond', () => { expect(usages.length).toBeLessThanOrEqual(PLAFOND); });

test('ni étiquettes, ni titres de section du récap, ni puces de zone à l\'ambre', () => {
  ['.fig-eti{', '.recap-groupe.coach{', '.puce-zone{', '.puce-zone.choisie{', '.puce-zone.choisie::before{'].forEach((sel) => {
    const i = css.indexOf(sel); expect(i).toBeGreaterThanOrEqual(0);
    const bloc = css.slice(i, css.indexOf('}', i));
    expect(bloc).not.toMatch(/var\(--accent\)/);
  });
});

test('un seul bouton secondaire : .btn-sec', () => {
  // 260-c : rayon 10 (--r-bouton), 44 px, 15 px ; la règle canonique absorbe les six variantes de l'audit du 06/11.
  expect(css).toMatch(/\.btn-sec,[^{]*\{[^}]*border-radius:var\(--r-bouton\)[^}]*min-height:44px[^}]*font-size:15px/);
  const regle = css.match(/\.btn-sec,[^{]*\{/)[0];
  ['.barre-fl', '.repos-b', '.ajout-serie button', '.courbe-per-b', '.discret', '.rate-bouton'].forEach((sel) => expect(regle).toContain(sel));
});

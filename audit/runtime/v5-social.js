/** VAGUE 5 — points connus : code d'invitation, garde renderFriendsTab, quiz archétype. OUTIL D'AUDIT. */
'use strict';
const H = require('./harness');
const profiles = require('../../tests/fixtures/profiles');

(async () => {
  console.log('# VAGUE 5 — vérifications ciblées\n');

  // 1) Onglet Social > Profil (renderFriendsTab) — erreur JS ? (fix #5 du scope de lancement)
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    const err = [];
    page.on('pageerror', (e) => err.push(String(e.message).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') err.push('[console] ' + m.text().slice(0, 120)); });
    await page.evaluate(() => { showTab('tab-social'); });
    await page.waitForTimeout(1500);
    const direct = await page.evaluate(async () => {
      try { if (typeof renderFriendsTab === 'function') { await renderFriendsTab(); return 'ok'; }
        return '(absente)'; } catch (e) { return 'ERREUR: ' + String(e.message).split('\n')[0]; }
    });
    await page.waitForTimeout(1200);
    console.log('## renderFriendsTab (Social > Profil)');
    console.log('   appel direct : ' + direct);
    console.log('   erreurs JS   : ' + err.length);
    err.slice(0, 4).forEach((e) => console.log('      ! ' + e.slice(0, 150)));
    console.log('   socialFriendsBadge existe ? ' + await page.evaluate(() => !!document.getElementById('socialFriendsBadge')));
    console.log('   code affiché : ' + await page.evaluate(() =>
      (document.getElementById('myFriendCode') || {}).textContent || '(absent)'));
    await app.close();
  }

  // 2) Code d'invitation : chemin synchrone vs asynchrone
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await page.evaluate(() => { showTab('tab-social'); });
    await page.waitForTimeout(400);
    const t0 = await page.evaluate(() => (document.getElementById('myFriendCode') || {}).textContent);
    await page.waitForTimeout(2500);
    const t1 = await page.evaluate(() => ({
      affiche: (document.getElementById('myFriendCode') || {}).textContent,
      dbFriendCode: db.friendCode,
    }));
    console.log('\n## Code d\'invitation');
    console.log('   à l\'ouverture (400 ms) : « ' + t0 + ' »');
    console.log('   après 2,9 s            : « ' + t1.affiche +' »   db.friendCode = ' + JSON.stringify(t1.dbFriendCode));
    console.log('   (réseau stubbé : profiles renvoie [] → ensureFriendCode ne peut rien lire)');
    await app.close();
  }

  // 3) Quiz archétype : atteignable ? combien de questions / classes ?
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    const r = await page.evaluate(() => {
      if (typeof showClassQuiz !== 'function') return { ok: false };
      showClassQuiz();
      const ov = document.querySelector('.modal-overlay, [id*="quiz"], [class*="quiz"]');
      return { ok: true, overlayVisible: !!(ov && ov.offsetParent !== null),
        texte: ov ? (ov.innerText || '').slice(0, 160).replace(/\n/g, ' | ') : '(aucun overlay)' };
    });
    await page.waitForTimeout(600);
    console.log('\n## Quiz archétype (showClassQuiz)');
    console.log('   fonction présente : ' + r.ok);
    console.log('   overlay visible   : ' + r.overlayVisible);
    console.log('   contenu : ' + r.texte);
    console.log('   points d\'entrée : Réglages → « 🎲 Changer de classe » (index.html:2955)'
      + ' et file d\'entrée (app.js:2230)');
    await app.close();
  }

  // 4) Les 3 sections social-* héritées
  {
    const app = await H.openApp(profiles.build('aurel_like'));
    const { page } = app;
    await page.evaluate(() => { showTab('tab-social'); });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ['social-feed', 'social-leaderboard', 'social-challenges',
      'feed-amis', 'feed-communaute', 'feed-challenges', 'feed-classement', 'social-friends']
      .map((id) => { const el = document.getElementById(id);
        if (!el) return id + ' : ABSENT';
        const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
        return id + ' : ' + (cs.display === 'none' ? 'display:none' : rect.height + 'px'); }));
    console.log('\n## Sous-sections Social (héritées vs actuelles)');
    r.forEach((l) => console.log('   ' + l));
    await app.close();
  }
})().catch((e) => { console.error('ECHEC:', e.stack); process.exit(1); });

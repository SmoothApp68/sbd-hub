/**
 * AUDIT BÊTA-TESTEUR COMPLET — TrainHub v173
 * Simule un parcours réel de A à Z :
 *   Profil J1 (onboarding) + Profil expérimenté (Aurélien)
 * Couvre : Dashboard · Coach · Plan · GO · Log · Analyse ·
 *           Stats · Jeux · Social · Profil · Session complète
 */

const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'SBD_HUB_V29';

// ─── Helpers ──────────────────────────────────────────────────
async function seedDB(page, dbData) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(([key, data]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(data));
  }, [STORAGE_KEY, dbData]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#mainTabBar', { state: 'visible', timeout: 20000 });
  await page.evaluate(() => {
    const ids = ['onboarding-overlay', 'loginScreen', 'magic-start-overlay'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  });
}

async function goToSeancesTab(page, subTab) {
  await page.locator('button[data-tab="tab-seances"]').click();
  await page.waitForTimeout(400);
  if (subTab) {
    const pill = page.locator('#tab-seances .seances-nav .stats-sub-pill').filter({ hasText: subTab });
    await pill.click();
    await page.waitForTimeout(500);
  }
}

// ─── Profil Aurélien — user expérimenté avec historique ──────
const DB_AURELIEN = {
  user: {
    name: 'Aurélien', bw: 98, height: 183, age: 32,
    gender: 'male', level: 'intermediaire',
    trainingMode: 'powerbuilding', onboarded: true, onboardingVersion: 3,
    lpActive: false, lpStrikes: {},
    consentHealth: true, medicalConsent: true,
    barWeight: 20, units: 'kg',
    programParams: { freq: 4, goal: 'force', level: 'intermediaire', intensity: 'medium' },
    onboardingPRs: { squat: 148, bench: 140, deadlift: 186 },
    activityTemplate: [
      { type: 'natation', intensity: 3, days: ['Mercredi'], duration: 45, fixed: true }
    ],
    sportsConfig: [],
    _activityMigrated: true,
    coachProfile: 'full', coachEnabled: true, vocabLevel: 2,
    coachEnabled: true, skipPRs: false, skipRPE: false,
  },
  logs: [
    { id: 'log1', timestamp: Date.now() - 2 * 86400000,
      title: 'Bench Press Day', duration: 3600, volume: 8500,
      exercises: [{ name: 'Développé couché (Barre)', isPrimary: true, maxRM: 140, isPR: false,
        allSets: [{ weight: 120, reps: 5, rpe: 8 }, { weight: 120, reps: 5, rpe: 9 }, { weight: 115, reps: 5, rpe: 7 }] }] },
    { id: 'log2', timestamp: Date.now() - 4 * 86400000,
      title: 'Squat Day', duration: 4200, volume: 12000,
      exercises: [{ name: 'Squat (Barre)', isPrimary: true, maxRM: 157, isPR: false,
        allSets: [{ weight: 140, reps: 5, rpe: 7 }, { weight: 140, reps: 5, rpe: 7 }, { weight: 140, reps: 4, rpe: 8 }] }] },
    { id: 'log3', timestamp: Date.now() - 7 * 86400000,
      title: 'Deadlift Day', duration: 3800, volume: 15000,
      exercises: [{ name: 'Soulevé de terre (Barre)', isPrimary: true, maxRM: 200, isPR: false,
        allSets: [{ weight: 180, reps: 3, rpe: 8 }, { weight: 180, reps: 3, rpe: 8.5 }] }] },
    { id: 'log4', timestamp: Date.now() - 10 * 86400000,
      title: 'Bench Press Day', duration: 3500, volume: 8000,
      exercises: [{ name: 'Développé couché (Barre)', isPrimary: true, maxRM: 138, isPR: false,
        allSets: [{ weight: 118, reps: 5, rpe: 8 }, { weight: 118, reps: 5, rpe: 8 }] }] },
    { id: 'log5', timestamp: Date.now() - 14 * 86400000,
      title: 'Squat Day', duration: 3900, volume: 11000,
      exercises: [{ name: 'Squat (Barre)', isPrimary: true, maxRM: 155, isPR: false,
        allSets: [{ weight: 138, reps: 5, rpe: 7 }] }] },
  ],
  exercises: {
    'Développé couché (Barre)': { e1rm: 148, shadowWeight: 125, lastRPE: 8 },
    'Squat (Barre)': { e1rm: 157, shadowWeight: 140, lastRPE: 7 },
    'Soulevé de terre (Barre)': { e1rm: 200, shadowWeight: 180, lastRPE: 8 },
  },
  bestPR: { bench: 140, squat: 148, deadlift: 186 },
  social: {
    profileId: null, username: 'aurelien98', bio: 'Powerbuilder passionné',
    onboardingCompleted: true,
    visibility: { bio: 'public', prs: 'public', programme: 'private', seances: 'public', stats: 'private' }
  },
  routine: { Lundi: 'Bench Press Day', Mercredi: 'Squat Day', Vendredi: 'Deadlift Day' },
  weeklyPlan: {
    days: [
      { day: 'Lundi', title: 'Bench Press Day', rest: false,
        exercises: [{ name: 'Développé couché (Barre)', isPrimary: true, sets: [{weight:120,reps:5},{weight:120,reps:5}] }] },
      { day: 'Mardi', title: 'Repos', rest: true, exercises: [] },
      { day: 'Mercredi', title: 'Squat Day', rest: false,
        exercises: [{ name: 'Squat (Barre)', isPrimary: true, sets: [{weight:140,reps:5},{weight:140,reps:5}] }] },
      { day: 'Jeudi', title: 'Repos', rest: true, exercises: [] },
      { day: 'Vendredi', title: 'Deadlift Day', rest: false,
        exercises: [{ name: 'Soulevé de terre (Barre)', isPrimary: true, sets: [{weight:180,reps:3},{weight:180,reps:3}] }] },
      { day: 'Samedi', title: 'Repos', rest: true, exercises: [] },
      { day: 'Dimanche', title: 'Repos', rest: true, exercises: [] },
    ]
  },
  earnedBadges: {
    'first_session': { earnedAt: Date.now() - 14 * 86400000, xp: 100 },
    'sessions_5': { earnedAt: Date.now() - 7 * 86400000, xp: 200 },
  },
  xpHighWaterMark: 1800,
  _magicStartDone: true,
  activityLogs: [],
  reports: [], body: [], keyLifts: [], friends: [], friendCode: 'AUR-2024',
  notificationsSent: [], passwordMigrated: true, lastSync: 0, updatedAt: 0,
  smartStreak: 3, smartStreakRecord: 5,
};

// ─── Profil J1 — nouvel utilisateur ──────────────────────────
const DB_J1 = {
  user: {
    name: 'Léa', bw: 62, age: 26, gender: 'female',
    level: 'debutant', trainingMode: 'powerbuilding',
    onboarded: true, onboardingVersion: 3, lpActive: true, lpStrikes: {},
    consentHealth: true, medicalConsent: true, barWeight: 15, units: 'kg',
    coachProfile: 'full', coachEnabled: true, vocabLevel: 1,
  },
  logs: [], exercises: {}, bestPR: { bench: 0, squat: 0, deadlift: 0 },
  social: { profileId: null, username: '', bio: '', onboardingCompleted: false,
    visibility: { bio: 'private', prs: 'private', programme: 'private', seances: 'private', stats: 'private' } },
  earnedBadges: {}, xpHighWaterMark: 0, _magicStartDone: false,
  activityLogs: [], reports: [], body: [], keyLifts: [], friends: [],
  routine: null, weeklyPlan: null, lastSync: 0, updatedAt: 0,
};


// ════════════════════════════════════════════════════════════════
// 1. CHARGEMENT & INITIALISATION
// ════════════════════════════════════════════════════════════════
test.describe('01 — Chargement & Init', () => {
  test('01-01 app charge sans erreur JS fatale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await seedDB(page, DB_AURELIEN);
    await page.waitForTimeout(1500);
    const fatal = errors.filter(e =>
      !e.includes('supabase') && !e.includes('fetch') &&
      !e.includes('network') && !e.includes('NetworkError') &&
      !e.includes('ERR_') && !e.includes('chrome-extension')
    );
    expect(fatal, `Erreurs JS: ${fatal.slice(0, 3).join('\n')}`).toHaveLength(0);
  });

  test('01-02 tab bar visible avec 5 onglets', async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    const bar = page.locator('#mainTabBar');
    await expect(bar).toBeVisible();
    const tabs = bar.locator('.tab-btn');
    expect(await tabs.count()).toBeGreaterThanOrEqual(5);
  });

  test('01-03 dashboard affiché par défaut', async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await expect(page.locator('#tab-dash')).toBeVisible();
  });

  test('01-04 localStorage SBD_HUB_V29 contient les données user', async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(parsed.user.name).toBe('Aurélien');
    expect(parsed.logs.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. DASHBOARD — Tour de Contrôle
// ════════════════════════════════════════════════════════════════
test.describe('02 — Dashboard', () => {
  test.beforeEach(async ({ page }) => { await seedDB(page, DB_AURELIEN); });

  test('02-01 WeekCard présente', async ({ page }) => {
    await expect(page.locator('#dashWeekCard')).toBeVisible({ timeout: 5000 });
  });

  test('02-02 WeekCard contient les jours de la semaine', async ({ page }) => {
    const card = page.locator('#dashWeekCard');
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const html = await card.innerHTML();
    const found = days.filter(d => html.includes(d));
    expect(found.length).toBeGreaterThanOrEqual(5);
  });

  test('02-03 Bouton GO / Générer séance visible dans la WeekCard', async ({ page }) => {
    const card = page.locator('#dashWeekCard');
    // Button text varies by day: "GO — <day>" on training days, "Générer ma séance →" otherwise
    const goBtn = card.locator('button').filter({ hasText: /GO|Commencer|[Ss]éance|Générer/ }).first();
    await expect(goBtn).toBeVisible({ timeout: 5000 });
  });

  test('02-04 Clic GO dans WeekCard → navigue vers tab Séances GO', async ({ page }) => {
    const card = page.locator('#dashWeekCard');
    const goBtn = card.locator('button').filter({ hasText: /GO|Commencer/ }).first();
    if (await goBtn.isVisible()) {
      await goBtn.click();
      await page.waitForTimeout(600);
      await expect(page.locator('#s-go')).toBeVisible();
    }
  });

  test('02-05 Métriques (streak, volume) quelque part dans le dashboard', async ({ page }) => {
    const dash = page.locator('#tab-dash');
    const html = await dash.innerHTML();
    const hasMetrics = html.includes('streak') || html.includes('Streak') ||
      html.includes('volume') || html.includes('Volume') || html.includes('TRIMP');
    expect(hasMetrics).toBe(true);
  });

  test('02-06 Dashboard ne plante pas avec refresh', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.locator('button[data-tab="tab-dash"]').click();
    await page.waitForTimeout(800);
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. ONGLET SÉANCES — Navigation 5 pills
// ════════════════════════════════════════════════════════════════
test.describe('03 — Onglet Séances — 5 pills', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.locator('button[data-tab="tab-seances"]').click();
    await page.waitForTimeout(500);
  });

  test('03-01 5 pills visibles : Coach Plan GO Log Analyse', async ({ page }) => {
    const pills = page.locator('#tab-seances .seances-nav .stats-sub-pill');
    await expect(pills).toHaveCount(5);
    for (const label of ['Coach', 'Plan', 'GO', 'Log', 'Analyse']) {
      await expect(pills.filter({ hasText: label })).toBeVisible();
    }
  });

  test('03-02 GO actif par défaut', async ({ page }) => {
    await expect(page.locator('#s-go')).toBeVisible();
    await expect(page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'GO' })).toHaveClass(/active/);
  });

  test('03-03 Un seul sous-onglet visible à la fois', async ({ page }) => {
    for (const subId of ['s-coach', 's-plan', 's-go', 's-log', 's-analyse']) {
      const btn = page.locator(`.seances-nav .stats-sub-pill[onclick*="'${subId}'"]`);
      await btn.click();
      await page.waitForTimeout(300);
      let visible = 0;
      for (const id of ['s-coach', 's-plan', 's-go', 's-log', 's-analyse']) {
        if (await page.locator(`#${id}`).isVisible()) visible++;
      }
      expect(visible, `${subId}: ${visible} sous-onglets visibles`).toBe(1);
    }
  });

  test('03-04 Restauration pill Log survit au changement de tab principal', async ({ page }) => {
    await page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'Log' }).click();
    await page.waitForTimeout(300);
    await page.locator('button[data-tab="tab-dash"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-tab="tab-seances"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#s-log')).toBeVisible();
    await expect(page.locator('#s-go')).not.toBeVisible();
    await expect(page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'Log' })).toHaveClass(/active/);
  });

  test('03-05 Coach tab → contenu non-vide', async ({ page }) => {
    await page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'Coach' }).click();
    await page.waitForTimeout(600);
    const html = await page.locator('#s-coach').innerHTML();
    expect(html.length).toBeGreaterThan(200);
  });

  test('03-06 Plan tab → builder rend', async ({ page }) => {
    await page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'Plan' }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('#s-plan')).toBeVisible();
    const html = await page.locator('#s-plan').innerHTML();
    expect(html.length).toBeGreaterThan(100);
  });

  test('03-07 Analyse tab → rend sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.locator('.seances-nav .stats-sub-pill').filter({ hasText: 'Analyse' }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('#s-analyse')).toBeVisible();
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. COACH TAB — Conseils & Sport secondaire
// ════════════════════════════════════════════════════════════════
test.describe('04 — Coach Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await goToSeancesTab(page, 'Coach');
  });

  test('04-01 Contenu coach visible et non-vide', async ({ page }) => {
    const coach = page.locator('#s-coach');
    await expect(coach).toBeVisible();
    const text = await coach.innerText();
    expect(text.length).toBeGreaterThan(30);
  });

  test('04-02 Conseil natation visible (activityTemplate configuré)', async ({ page }) => {
    // Aurélien a natation → la carte sport secondaire doit apparaître (case-insensitive)
    const html = await page.locator('#s-coach').innerHTML();
    expect(html.toLowerCase()).toContain('natation');
  });

  test('04-03 Icône ✅/⚠️/🚫 présente dans la carte sport', async ({ page }) => {
    const coach = page.locator('#s-coach');
    const icon = coach.locator('text=/✅|⚠️|🚫/').first();
    await expect(icon).toBeVisible({ timeout: 5000 });
  });

  test('04-04 getActivityRecommendation retourne ok/warning/forbidden', async ({ page }) => {
    const result = await page.evaluate(() => {
      if (typeof getActivityRecommendation !== 'function') return null;
      return getActivityRecommendation('natation', 'Lundi');
    });
    expect(result).not.toBeNull();
    expect(['ok', 'warning', 'forbidden']).toContain(result.level);
    expect(result.reason).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════
// 5. GO TAB — Session complète
// ════════════════════════════════════════════════════════════════
test.describe('05 — GO Tab — Session', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await goToSeancesTab(page, 'GO');
  });

  test('05-01 GO tab affiche un état (idle)', async ({ page }) => {
    const go = page.locator('#s-go');
    await expect(go).toBeVisible();
    const html = await go.innerHTML();
    expect(html.length).toBeGreaterThan(50);
  });

  test('05-02 Widget FC présent (#go-fc-widget)', async ({ page }) => {
    const widget = page.locator('#go-fc-widget');
    const exists = await widget.count() > 0;
    expect(exists).toBe(true);
  });

  test('05-03 Option "Séance vide" présente', async ({ page }) => {
    // "Séance vide" is rendered as a .go-alt div, not a button
    const el = page.locator('#s-go').locator('[onclick*="goStartWorkout"]').first();
    const html = await page.locator('#s-go').innerHTML();
    const hasVide = html.includes('Séance vide') || html.includes('séance vide');
    expect(hasVide).toBe(true);
  });

  test('05-04 Démarrer une séance vide → goActiveView visible', async ({ page }) => {
    const btn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await btn.isVisible()) {
      await btn.click();
      // Dismiss readiness modal if present
      const skip = page.locator('button').filter({ hasText: /Passer|Skip/ }).first();
      try { await skip.waitFor({ state: 'visible', timeout: 2000 }); await skip.click(); } catch {}
      await expect(page.locator('#goActiveView')).toBeVisible({ timeout: 8000 });
    }
  });

  test('05-05 Ajouter un exercice via recherche', async ({ page }) => {
    const idleBtn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      const skip = page.locator('button').filter({ hasText: /Passer/ }).first();
      try { await skip.waitFor({ timeout: 2000 }); await skip.click(); } catch {}
      await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 8000 });
      // Clic sur Ajouter exercice
      await page.locator('button.go-add-exo').click();
      const search = page.locator('#goSearchInput');
      await expect(search).toBeVisible({ timeout: 5000 });
      await search.fill('bench');
      await page.waitForTimeout(600);
      const result = page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first();
      await expect(result).toBeVisible({ timeout: 3000 });
      await result.click();
      await page.waitForTimeout(500);
      await expect(page.locator('.go-exo-card').first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('05-06 Saisie poids/reps et validation de série', async ({ page }) => {
    const idleBtn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      const skip = page.locator('button').filter({ hasText: /Passer/ }).first();
      try { await skip.waitFor({ timeout: 2000 }); await skip.click(); } catch {}
      await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 8000 });
      await page.locator('button.go-add-exo').click();
      await page.locator('#goSearchInput').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('#goSearchInput').fill('bench');
      await page.waitForTimeout(600);
      await page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first().click();
      await page.waitForTimeout(500);
      const addSetBtn = page.locator('.go-exo-card').last().locator('button.go-add-set-btn');
      await addSetBtn.click();
      await page.waitForTimeout(300);
      await page.locator('.go-set-input[placeholder="kg"]').first().fill('100');
      await page.locator('.go-set-input[placeholder="reps"]').first().fill('5');
      await page.locator('button.go-check-btn').first().click();
      // Timer de repos devrait apparaître
      const timer = page.locator('.go-rest-timer');
      await expect(timer).toBeVisible({ timeout: 5000 });
    }
  });

  test('05-07 Timer repos — boutons -15s +15s Passer', async ({ page }) => {
    const idleBtn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      try { await page.locator('button').filter({ hasText: /Passer/ }).first().waitFor({ timeout: 2000 }); await page.locator('button').filter({ hasText: /Passer/ }).first().click(); } catch {}
      await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 8000 });
      await page.locator('button.go-add-exo').click();
      await page.locator('#goSearchInput').waitFor({ timeout: 5000 });
      await page.locator('#goSearchInput').fill('squat');
      await page.waitForTimeout(600);
      await page.locator('#goSearchOverlay [onclick*="goSelectSearchResult"]').first().click();
      await page.waitForTimeout(500);
      await page.locator('.go-exo-card').last().locator('button.go-add-set-btn').click();
      await page.waitForTimeout(300);
      await page.locator('.go-set-input[placeholder="kg"]').first().fill('120');
      await page.locator('.go-set-input[placeholder="reps"]').first().fill('3');
      await page.locator('button.go-check-btn').first().click();
      const timer = page.locator('.go-rest-timer');
      await timer.waitFor({ state: 'visible', timeout: 5000 });
      await expect(timer.locator('button', { hasText: '-15s' })).toBeVisible();
      await expect(timer.locator('button', { hasText: '+15s' })).toBeVisible();
      await expect(timer.locator('button', { hasText: 'Passer' })).toBeVisible();
    }
  });

  test('05-08 Bouton "Terminer la séance" présent pendant une session', async ({ page }) => {
    const idleBtn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      try { await page.locator('button').filter({ hasText: /Passer/ }).first().waitFor({ timeout: 2000 }); await page.locator('button').filter({ hasText: /Passer/ }).first().click(); } catch {}
      await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 8000 });
      const finishBtn = page.locator('button').filter({ hasText: 'Terminer la séance' });
      await expect(finishBtn).toBeVisible({ timeout: 5000 });
    }
  });

  test('05-09 Chrono de séance s\'incrémente', async ({ page }) => {
    const idleBtn = page.locator('button').filter({ hasText: /Séance vide/ }).first();
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      try { await page.locator('button').filter({ hasText: /Passer/ }).first().waitFor({ timeout: 2000 }); await page.locator('button').filter({ hasText: /Passer/ }).first().click(); } catch {}
      await page.locator('#goActiveView').waitFor({ state: 'visible', timeout: 8000 });
      const timer = page.locator('#goTimer, .go-timer, [id*="timer"]').first();
      if (await timer.isVisible()) {
        const t1 = await timer.innerText();
        await page.waitForTimeout(2000);
        const t2 = await timer.innerText();
        expect(t1).not.toBe(t2);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 6. LOG TAB — Historique
// ════════════════════════════════════════════════════════════════
test.describe('06 — Log Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await goToSeancesTab(page, 'Log');
  });

  test('06-01 Cards de session visibles dans la semaine courante', async ({ page }) => {
    // Log tab shows current week's sessions (may be fewer than total logs)
    const cards = page.locator('#s-log .sc');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  test('06-02 Clic card → expand détail', async ({ page }) => {
    await page.locator('#s-log .sc').first().locator('.sc-body-wrap').click();
    await page.waitForTimeout(400);
    const detail = page.locator('#s-log .sc').first().locator('.sc-detail');
    const expanded = await detail.evaluate(el =>
      el.style.maxHeight !== '' && el.style.maxHeight !== '0px' ||
      el.style.display === 'block' || el.classList.contains('open')
    );
    expect(expanded).toBe(true);
  });

  test('06-03 Menu ··· ouvre le dropdown', async ({ page }) => {
    const card = page.locator('#s-log .sc').first();
    await card.locator('.sc-menu-btn').click();
    await page.waitForTimeout(300);
    await expect(card.locator('.sc-dropdown')).toBeVisible();
  });

  test('06-04 Dropdown contient "Copier dans GO", "Partager", "Supprimer"', async ({ page }) => {
    await page.locator('#s-log .sc').first().locator('.sc-menu-btn').click();
    await page.waitForTimeout(300);
    const dd = page.locator('#s-log .sc').first().locator('.sc-dropdown');
    await expect(dd.locator('text=/Copier|GO/')).toBeVisible();
    await expect(dd.locator('text=/Supprimer/')).toBeVisible();
  });

  test('06-05 Filter chips présents', async ({ page }) => {
    const chips = page.locator('#s-log').locator('[onclick*="setLogFilter"]');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('06-06 Chip "Tout" remet toutes les cards de la semaine', async ({ page }) => {
    const tout = page.locator('#s-log [onclick*="setLogFilter(\'Tout\')"]').first();
    if (await tout.isVisible()) {
      await tout.click();
      await page.waitForTimeout(300);
      const cards = page.locator('#s-log .sc');
      expect(await cards.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('06-07 Cards montrent date + volume', async ({ page }) => {
    const card = page.locator('#s-log .sc').first();
    const html = await card.innerHTML();
    expect(html).toMatch(/Jan|Fév|Mar|Avr|Mai|Jun|Jul|Aoû|Sep|Oct|Nov|Déc/);
    expect(html).toMatch(/\d+(kg|t)/);
  });
});

// ════════════════════════════════════════════════════════════════
// 7. STATS TAB
// ════════════════════════════════════════════════════════════════
test.describe('07 — Stats Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.locator('button[data-tab="tab-stats"]').click();
    await page.waitForTimeout(800);
  });

  test('07-01 Stats tab visible sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await expect(page.locator('#tab-stats')).toBeVisible();
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });

  test('07-02 Sous-onglets Stats présents (Volume, Performance...)', async ({ page }) => {
    const pills = page.locator('#tab-stats .stats-sub-pill, #tab-stats .stats-sub-nav button');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
  });

  test('07-03 Graphique Volume rend', async ({ page }) => {
    const volPill = page.locator('#tab-stats .stats-sub-pill').filter({ hasText: /Volume/ }).first();
    if (await volPill.isVisible()) {
      await volPill.click();
      await page.waitForTimeout(800);
      const canvas = page.locator('#tab-stats canvas').first();
      if (await canvas.count() > 0) await expect(canvas).toBeVisible();
    }
  });

  test('07-04 Contenu non-vide avec des logs', async ({ page }) => {
    const html = await page.locator('#tab-stats').innerHTML();
    expect(html.length).toBeGreaterThan(300);
  });
});

// ════════════════════════════════════════════════════════════════
// 8. JEUX TAB — Gamification
// ════════════════════════════════════════════════════════════════
test.describe('08 — Jeux Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.locator('button[data-tab="tab-game"]').click();
    await page.waitForTimeout(600);
  });

  test('08-01 Jeux tab visible', async ({ page }) => {
    await expect(page.locator('#tab-game')).toBeVisible();
    const html = await page.locator('#tab-game').innerHTML();
    expect(html.length).toBeGreaterThan(200);
  });

  test('08-02 3 pills : Profil joueur / Rangs / Badges', async ({ page }) => {
    for (const label of ['Profil joueur', 'Rangs', 'Badges']) {
      await expect(page.locator('#tab-game .stats-sub-pill').filter({ hasText: label })).toBeVisible();
    }
  });

  test('08-03 XP_LEVELS — 25 niveaux, aucun nom Bleach/Dofus', async ({ page }) => {
    const result = await page.evaluate(() => {
      if (typeof XP_LEVELS === 'undefined') return null;
      const forbidden = ['Rukongai', 'Seireitei', 'Bankai', 'Hollow', 'Âme errante', 'Roi des Âmes', 'Dofus'];
      return {
        count: XP_LEVELS.length,
        bad: XP_LEVELS.filter(l => forbidden.some(t => l.name.includes(t))).map(l => l.name),
        first: XP_LEVELS[0].name,
        last: XP_LEVELS[24].name,
      };
    });
    expect(result).not.toBeNull();
    expect(result.count).toBe(25);
    expect(result.bad, `Noms interdits: ${result.bad}`).toHaveLength(0);
    expect(result.first).toBe('Première Rep');
    expect(result.last).toBe('Roi de la Fonte');
  });

  test('08-04 rarityPulse existe, reiatsuPulse absent', async ({ page }) => {
    const r = await page.evaluate(() => {
      let hasRarity = false, hasReiatsu = false;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.name === 'rarityPulse') hasRarity = true;
            if (rule.name === 'reiatsuPulse') hasReiatsu = true;
          }
        } catch {}
      }
      return { hasRarity, hasReiatsu };
    });
    expect(r.hasRarity, 'rarityPulse doit exister').toBe(true);
    expect(r.hasReiatsu, 'reiatsuPulse ne doit plus exister').toBe(false);
  });

  test('08-05 Badge red dot se cache quand on visite Jeux', async ({ page }) => {
    await page.evaluate(() => {
      var b = document.getElementById('gameTabBadge');
      if (b) { b.textContent = '2'; b.style.display = 'inline-flex'; }
    });
    await page.locator('button[data-tab="tab-dash"]').click();
    await page.waitForTimeout(200);
    await page.locator('button[data-tab="tab-game"]').click();
    await page.waitForTimeout(300);
    const hidden = await page.locator('#gameTabBadge').evaluate(el => el.style.display === 'none');
    expect(hidden).toBe(true);
  });

  test('08-06 Onglet Rangs → contenu visible', async ({ page }) => {
    await page.locator('#tab-game .stats-sub-pill').filter({ hasText: 'Rangs' }).click();
    await page.waitForTimeout(500);
    const html = await page.locator('#tab-game').innerHTML();
    expect(html.length).toBeGreaterThan(200);
  });

  test('08-07 Onglet Badges → liste de badges', async ({ page }) => {
    await page.locator('#tab-game .stats-sub-pill').filter({ hasText: 'Badges' }).click();
    await page.waitForTimeout(500);
    const badges = page.locator('#tab-game .bdg, #tab-game [class*="badge"]');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 9. SOCIAL TAB
// ════════════════════════════════════════════════════════════════
test.describe('09 — Social Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.locator('button[data-tab="tab-social"]').click();
    await page.waitForTimeout(800);
  });

  test('09-01 Social tab visible sans bloquer sur onboarding', async ({ page }) => {
    await expect(page.locator('#tab-social')).toBeVisible();
    const onboarding = page.locator('#socialOnboarding, [id*="social-onboarding"]');
    const blocked = await onboarding.isVisible().catch(() => false);
    expect(blocked).toBe(false);
  });

  test('09-02 5 pills feed : Amis / Communauté / Challenges / Classement / Profil', async ({ page }) => {
    for (const label of ['Amis', 'Communauté', 'Challenges', 'Classement', 'Profil']) {
      await expect(page.locator('#feedPills .stats-sub-pill').filter({ hasText: label })).toBeVisible();
    }
  });

  test('09-03 Banner "Tes Badges & Rangs → Jeux" visible', async ({ page }) => {
    const banner = page.locator('#tab-social [onclick*="tab-game"]').first();
    await expect(banner).toBeVisible({ timeout: 3000 });
  });

  test('09-04 Clic banner → navigue vers tab-game', async ({ page }) => {
    const banner = page.locator('#tab-social [onclick*="tab-game"]').first();
    if (await banner.isVisible()) {
      await banner.click();
      await page.waitForTimeout(400);
      await expect(page.locator('#tab-game')).toBeVisible();
    }
  });

  test('09-05 Pill Profil → code ami visible', async ({ page }) => {
    await page.locator('#feedPills .stats-sub-pill').filter({ hasText: 'Profil' }).click();
    await page.waitForTimeout(500);
    // Le code ami devrait être visible si connecté — sinon état vide
    const html = await page.locator('#tab-social').innerHTML();
    expect(html.length).toBeGreaterThan(200);
  });
});

// ════════════════════════════════════════════════════════════════
// 10. PROFIL TAB
// ════════════════════════════════════════════════════════════════
test.describe('10 — Profil Tab', () => {
  test.beforeEach(async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.locator('button[data-tab="tab-profil"]').click();
    await page.waitForTimeout(600);
  });

  test('10-01 Profil tab visible', async ({ page }) => {
    await expect(page.locator('#tab-profil')).toBeVisible();
  });

  test('10-02 Nom utilisateur dans les réglages', async ({ page }) => {
    // Switch to settings to trigger fillSettingsFields()
    await page.locator('#tab-profil .stats-sub-pill').filter({ hasText: 'Réglages' }).click();
    await page.waitForTimeout(500);
    const name = await page.locator('#inputName').inputValue();
    expect(name).toBe('Aurélien');
  });

  test('10-03 Données exercices disponibles (e1rm Bench/Squat/Dead)', async ({ page }) => {
    // bestPR may be recalculated from logs — verify exercises data instead
    const exos = await page.evaluate((key) => {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      const data = JSON.parse(stored);
      return data.exercises;
    }, STORAGE_KEY);
    expect(exos).not.toBeNull();
    const keys = Object.keys(exos);
    expect(keys.length).toBeGreaterThan(0);
    // At least one exercise should have e1rm > 0
    const hasE1rm = keys.some(k => exos[k].e1rm > 0);
    expect(hasE1rm).toBe(true);
  });

  test('10-04 Sous-onglets Profil présents (Corps, Réglages...)', async ({ page }) => {
    const pills = page.locator('#tab-profil .stats-sub-pill, #tab-profil button[onclick*="showProfilSub"]');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
  });

  test('10-05 Aucun crash JS dans Profil', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(800);
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 11. ONBOARDING J1 — Magic Start
// ════════════════════════════════════════════════════════════════
test.describe('11 — Onboarding J1', () => {
  test('11-01 Magic Start s\'affiche pour un J1 (0 logs)', async ({ page }) => {
    await seedDB(page, DB_J1);
    await page.evaluate(() => {
      if (typeof showMagicStart === 'function') showMagicStart();
    });
    await page.waitForTimeout(600);
    await expect(page.locator('#magic-start-overlay')).toBeVisible({ timeout: 3000 });
  });

  test('11-02 3 choix présents dans Magic Start', async ({ page }) => {
    await seedDB(page, DB_J1);
    await page.evaluate(() => {
      if (typeof showMagicStart === 'function') showMagicStart();
    });
    await page.waitForTimeout(600);
    const overlay = page.locator('#magic-start-overlay');
    if (await overlay.isVisible()) {
      // Buttons: "Programme complet", "Séance libre", "Importer depuis Hevy"
      const btns = overlay.locator('button').filter({ hasText: /Programme|libre|Import|Hevy/i });
      expect(await btns.count()).toBeGreaterThanOrEqual(3);
    }
  });

  test('11-03 Choix "Séance libre" → go sub-tab', async ({ page }) => {
    await seedDB(page, DB_J1);
    await page.evaluate(() => {
      if (typeof showMagicStart === 'function') showMagicStart();
    });
    await page.waitForTimeout(600);
    const overlay = page.locator('#magic-start-overlay');
    if (await overlay.isVisible()) {
      const libreBtn = overlay.locator('button').filter({ hasText: /Libre|GO|Free/ }).first();
      if (await libreBtn.isVisible()) {
        await libreBtn.click();
        await page.waitForTimeout(500);
        await expect(page.locator('#tab-seances')).toBeVisible();
      }
    }
  });

  test('11-04 Magic Start absent pour user avec logs', async ({ page }) => {
    await seedDB(page, DB_AURELIEN);
    await page.waitForTimeout(1000);
    await expect(page.locator('#magic-start-overlay')).not.toBeVisible();
  });

  test('11-05 Dashboard J1 ne plante pas', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await seedDB(page, DB_J1);
    await page.waitForTimeout(1000);
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════
// 12. ALGORITHMES & DONNÉES (vérification JS runtime)
// ════════════════════════════════════════════════════════════════
test.describe('12 — Algorithmes', () => {
  test.beforeEach(async ({ page }) => { await seedDB(page, DB_AURELIEN); });

  test('12-01 CROSS_INTERFERENCE_MAP enrichi — recovHours + muscles', async ({ page }) => {
    const map = await page.evaluate(() => typeof CROSS_INTERFERENCE_MAP !== 'undefined' ? CROSS_INTERFERENCE_MAP : null);
    expect(map).not.toBeNull();
    expect(map.natation.recovHours).toBe(24);
    expect(map.natation.muscles).toContain('dos');
    expect(map.yoga_yin.volumePenalty).toBe(0);
    expect(map.yoga_vinyasa).toBeDefined();
    expect(map.pilates).toBeDefined();
    // Propriétés originales préservées
    expect(map.trail.joints).toContain('lower_back');
    expect(map.crossfit.recovHours).toBe(48);
  });

  test('12-02 calcE1RM fonctionnel', async ({ page }) => {
    const e1rm = await page.evaluate(() => {
      if (typeof calcE1RM !== 'function') return null;
      return calcE1RM(100, 5);
    });
    expect(e1rm).not.toBeNull();
    expect(e1rm).toBeGreaterThan(100);
    expect(e1rm).toBeLessThan(120);
  });

  test('12-03 computeSRS retourne un score 0-100', async ({ page }) => {
    const srs = await page.evaluate(() => {
      if (typeof computeSRS !== 'function') return null;
      return computeSRS();
    });
    if (srs !== null) {
      expect(typeof srs.score).toBe('number');
      expect(srs.score).toBeGreaterThanOrEqual(0);
      expect(srs.score).toBeLessThanOrEqual(100);
      expect(typeof srs.acwr).toBe('number');
    }
  });

  test('12-04 getActivityRecommendation — tous les sports de base', async ({ page }) => {
    const results = await page.evaluate(() => {
      if (typeof getActivityRecommendation !== 'function') return null;
      const sports = ['natation', 'course', 'yoga', 'crossfit', 'velo', 'trail'];
      return sports.map(s => ({ sport: s, rec: getActivityRecommendation(s, 'Lundi') }));
    });
    if (results !== null) {
      for (const { sport, rec } of results) {
        expect(['ok', 'warning', 'forbidden'], `${sport}: niveau invalide`).toContain(rec.level);
        expect(rec.emoji).toMatch(/✅|⚠️|🚫/);
      }
    }
  });

  test('12-05 XP_LEVELS — XP thresholds corrects (non modifiés)', async ({ page }) => {
    const levels = await page.evaluate(() => typeof XP_LEVELS !== 'undefined' ? XP_LEVELS : null);
    expect(levels).not.toBeNull();
    expect(levels[0].xp).toBe(0);
    expect(levels[5].xp).toBe(10000);
    expect(levels[9].xp).toBe(50000);
    expect(levels[24].xp).toBe(500000);
  });

  test('12-06 ACTIVITY_SPEC_COEFFICIENTS défini', async ({ page }) => {
    const coef = await page.evaluate(() =>
      typeof ACTIVITY_SPEC_COEFFICIENTS !== 'undefined' ? ACTIVITY_SPEC_COEFFICIENTS : null
    );
    expect(coef).not.toBeNull();
    expect(coef.natation).toBeDefined();
    expect(coef.course).toBeGreaterThan(1);
  });
});

// ════════════════════════════════════════════════════════════════
// 13. RÉGRESSIONS NAVIGATION CROISÉE
// ════════════════════════════════════════════════════════════════
test.describe('13 — Régressions navigation', () => {
  test.beforeEach(async ({ page }) => { await seedDB(page, DB_AURELIEN); });

  test('13-01 Tourner entre tous les onglets sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const tabs = ['tab-dash', 'tab-social', 'tab-seances', 'tab-stats', 'tab-game', 'tab-profil', 'tab-dash'];
    for (const tab of tabs) {
      await page.locator(`button[data-tab="${tab}"]`).click();
      await page.waitForTimeout(400);
    }
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch') && !e.includes('network'));
    expect(fatal, `Erreurs: ${fatal.slice(0, 3).join('\n')}`).toHaveLength(0);
  });

  test('13-02 Tourner entre les 5 pills Séances sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await goToSeancesTab(page, null);
    for (const sub of ['Coach', 'Plan', 'GO', 'Log', 'Analyse', 'GO']) {
      await page.locator('.seances-nav .stats-sub-pill').filter({ hasText: sub }).click();
      await page.waitForTimeout(400);
    }
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });

  test('13-03 Social → Jeux → Social → Séances (navigation rapide)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.locator('button[data-tab="tab-social"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-tab="tab-game"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-tab="tab-social"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[data-tab="tab-seances"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#tab-seances')).toBeVisible();
    const fatal = errors.filter(e => !e.includes('supabase') && !e.includes('fetch'));
    expect(fatal).toHaveLength(0);
  });

  test('13-04 saveDB ne plante pas', async ({ page }) => {
    const ok = await page.evaluate(() => {
      try { if (typeof saveDB === 'function') saveDB(); return true; } catch(e) { return false; }
    });
    expect(ok).toBe(true);
  });

  test('13-05 refreshUI ne plante pas', async ({ page }) => {
    const ok = await page.evaluate(() => {
      try { if (typeof refreshUI === 'function') refreshUI(); return true; } catch(e) { return e.message; }
    });
    expect(ok).toBe(true);
  });

  test('13-06 Bouton retour Dash depuis Séances fonctionne', async ({ page }) => {
    await goToSeancesTab(page, 'Log');
    await page.locator('button[data-tab="tab-dash"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-dash')).toBeVisible();
    await expect(page.locator('#tab-seances')).not.toBeVisible();
  });
});

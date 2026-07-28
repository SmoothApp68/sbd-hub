/** Config d'inventaire — VAGUE 5 : Social (feed/amis/défis/classement) + Jeux (XP/rangs/badges). OUTIL D'AUDIT. */
'use strict';
const JEUX = ['jeux-profil-joueur', 'jeux-rangs', 'jeux-badges'];
const SOCIAL = ['feed-amis', 'feed-communaute', 'feed-challenges', 'feed-classement', 'social-friends'];

const xpHaut = (db) => { db.gamification = db.gamification || {};
  db.gamification.xpHighWaterMark = 45000; db.earnedBadges = db.earnedBadges || {};
  ['first_session', 'volume_1000', 'streak_7'].forEach((b) => { db.earnedBadges[b] = { earnedAt: Date.now(), xp: 100 }; });
  return db; };
const avecAmis = (db) => { db.friends = [{ id: 'f1', username: 'jordan', friend_code: 'ABC123' }];
  db.friendCode = 'XYZ789';
  db.social = Object.assign({}, db.social, { profileId: 'p1', username: 'aurel_br', onboardingCompleted: true });
  return db; };

const etats = [];
JEUX.forEach((s) => etats.push({ nom: 'jeux · ' + s, conteneur: '#tab-game', settle: 1500,
  action: async (p) => { await p.evaluate((x) => { showTab('tab-game'); showJeuxSub(x); }, s); } }));
JEUX.forEach((s) => etats.push({ nom: 'jeux XP haut · ' + s, mut: xpHaut, conteneur: '#tab-game', settle: 1500,
  action: async (p) => { await p.evaluate((x) => { showTab('tab-game'); showJeuxSub(x); }, s); } }));
etats.push({ nom: 'jeux · vierge', profil: 'vierge', conteneur: '#tab-game', settle: 1500,
  action: async (p) => { await p.evaluate(() => { showTab('tab-game'); showJeuxSub('jeux-profil-joueur'); }); } });
SOCIAL.forEach((s) => etats.push({ nom: 'social · ' + s, conteneur: '#tab-social', settle: 1800,
  action: async (p) => { await p.evaluate((x) => { showTab('tab-social'); showFeedSub(x); }, s); } }));
SOCIAL.forEach((s) => etats.push({ nom: 'social avec amis · ' + s, mut: avecAmis, conteneur: '#tab-social', settle: 1800,
  action: async (p) => { await p.evaluate((x) => { showTab('tab-social'); showFeedSub(x); }, s); } }));
etats.push({ nom: 'social · vierge', profil: 'vierge', conteneur: '#tab-social', settle: 1800,
  action: async (p) => { await p.evaluate(() => { showTab('tab-social'); showFeedSub('feed-amis'); }); } });

module.exports = { nom: 'VAGUE 5 — Social + Jeux', conteneur: '#tab-game', sortie: 'out-v5-elements.json', etats };

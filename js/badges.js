// ============================================================
// MUSCLE BADGES SYSTEM
// ============================================================

const MUSCLE_BADGES = {
  pecs:        { label: 'Pecs',        img: 'assets/badges/pecs.png',        muscles: ['pectoraux', 'chest_upper', 'chest_lower'] },
  dos:         { label: 'Dos',         img: 'assets/badges/dos.png',         muscles: ['grand_dorsal', 'haut_du_dos', 'bas_du_dos'] },
  epaules:     { label: 'Épaules',     img: 'assets/badges/epaules.png',     muscles: ['epaules', 'shoulders_front', 'shoulders_side', 'shoulders_rear'] },
  biceps:      { label: 'Biceps',      img: 'assets/badges/biceps.png',      muscles: ['biceps', 'forearms'] },
  triceps:     { label: 'Triceps',     img: 'assets/badges/triceps.png',     muscles: ['triceps'] },
  abdos:       { label: 'Abdos',       img: 'assets/badges/abdos.png',       muscles: ['abdominaux', 'obliques', 'hip_flexors'] },
  trapezes:    { label: 'Trapèzes',    img: 'assets/badges/trapezes.png',    muscles: ['trapezes', 'neck'] },
  ischio:      { label: 'Ischio',      img: 'assets/badges/ischio.png',      muscles: ['ischio_jambiers'] },
  fessiers:    { label: 'Fessiers',    img: 'assets/badges/fessiers.png',    muscles: ['fessiers', 'abducteurs', 'adducteurs'] },
  quadriceps:  { label: 'Quadriceps',  img: 'assets/badges/quadriceps.png',  muscles: ['quadriceps'] },
  mollets:     { label: 'Mollets',     img: 'assets/badges/mollets.png',     muscles: ['calves_gastro', 'calves_soleus'] },
};

// 6 tiers — seuils en kg de tonnage cumulé (all-time)
const BADGE_TIERS = [
  { tier: 1, name: 'Bronze',     minTonnage: 1000,   saturate: '15%',  border: '#8B5A2B', glow: false  },
  { tier: 2, name: 'Argent',     minTonnage: 5000,   saturate: '40%',  border: '#7A8899', glow: false  },
  { tier: 3, name: 'Or',         minTonnage: 15000,  saturate: '100%', border: '#B8860B', glow: false  },
  { tier: 4, name: 'Platine',    minTonnage: 40000,  saturate: '120%', border: '#4A90C4', glow: true   },
  { tier: 5, name: 'Diamant',    minTonnage: 100000, saturate: '140%', border: '#00C4CC', glow: true   },
  { tier: 6, name: 'Légendaire', minTonnage: 250000, saturate: '160%', border: '#FF4422', glow: true   },
];

function getBadgeTier(tonnage) {
  let current = null;
  for (const t of BADGE_TIERS) {
    if (tonnage >= t.minTonnage) current = t;
  }
  return current;
}

function getNextTier(currentTier) {
  if (!currentTier) return BADGE_TIERS[0];
  const idx = BADGE_TIERS.findIndex(t => t.tier === currentTier.tier);
  return BADGE_TIERS[idx + 1] || null;
}

function getBadgeTonnage(muscleKey) {
  const badge = MUSCLE_BADGES[muscleKey];
  if (!badge) return 0;
  const muscleTonnage = computeMuscleTonnage();
  let total = 0;
  badge.muscles.forEach(m => {
    const entry = muscleTonnage[m];
    total += entry ? (entry.tonnage || 0) : 0;
  });
  return Math.round(total);
}

function renderMuscleBadges() {
  const container = document.getElementById('muscleBadgesGrid');
  if (!container) return;

  let html = '';
  Object.entries(MUSCLE_BADGES).forEach(([key, badge]) => {
    const tonnage = getBadgeTonnage(key);
    const tier = getBadgeTier(tonnage);
    const nextTier = getNextTier(tier);
    const tierMin = tier ? tier.minTonnage : 0;
    const tierMax = nextTier ? nextTier.minTonnage : tierMin;
    const pctFromPrev = tierMax > tierMin
      ? Math.min(100, Math.round(((tonnage - tierMin) / (tierMax - tierMin)) * 100))
      : 100;

    const saturate = tier ? tier.saturate : '10%';
    const border = tier ? tier.border : '#333';
    const glow = tier && tier.glow;
    const locked = !tier;

    html += `
      <div class="muscle-badge-wrap ${locked ? 'badge-locked' : ''}" onclick="showBadgeDetail('${key}')">
        <div class="muscle-badge-hex">
          <svg class="badge-hex-frame" viewBox="0 0 100 115" fill="none">
            <polygon points="50,2 98,28 98,87 50,113 2,87 2,28"
              fill="none" stroke="${border}" stroke-width="3"/>
            ${glow ? `<polygon points="50,2 98,28 98,87 50,113 2,87 2,28"
              fill="none" stroke="${border}" stroke-width="1" opacity="0.4"/>` : ''}
          </svg>
          <img class="badge-img" src="${badge.img}"
            style="filter: saturate(${saturate}) ${locked ? 'grayscale(0.9) brightness(0.4)' : ''};
                   box-shadow: ${glow ? '0 0 16px ' + border + '88' : 'none'};"
            alt="${badge.label}"/>
          ${tier ? `<div class="badge-pct">${nextTier ? pctFromPrev + '%' : '✓'}</div>` : ''}
        </div>
        <div class="badge-name" style="color: ${tier ? border : '#444'}">${badge.label}</div>
        ${tier ? `<div class="badge-tier-name">${tier.name}</div>` : '<div class="badge-tier-name" style="color:#333">Verrouillé</div>'}
      </div>
    `;
  });

  container.innerHTML = html;
}

function showBadgeDetail(key) {
  const badge = MUSCLE_BADGES[key];
  if (!badge) return;
  const tonnage = getBadgeTonnage(key);
  const tier = getBadgeTier(tonnage);
  const nextTier = getNextTier(tier);
  const remaining = nextTier ? Math.max(0, nextTier.minTonnage - tonnage) : 0;

  const tierName = tier ? tier.name : 'Verrouillé';
  const nextName = nextTier ? nextTier.name : 'Niveau max';

  showModal(
    `<div style="text-align:center">
      <img src="${badge.img}" style="width:120px;filter:saturate(${tier ? tier.saturate : '10%'})" alt="${badge.label}"/>
      <div style="font-size:18px;font-weight:700;margin-top:8px">${badge.label}</div>
      <div style="color:var(--sub);font-size:13px;margin-bottom:12px">${tierName}</div>
      <div style="font-size:13px">Tonnage accumulé : <b>${tonnage.toLocaleString('fr-FR')} kg</b></div>
      ${nextTier ? `<div style="font-size:12px;color:var(--sub);margin-top:4px">
        Prochain tier (${nextName}) : encore ${remaining.toLocaleString('fr-FR')} kg
      </div>` : '<div style="font-size:12px;color:#FF4422;margin-top:4px">Niveau maximum atteint !</div>'}
    </div>`,
    'Fermer', 'var(--surface)', () => {}
  );
}

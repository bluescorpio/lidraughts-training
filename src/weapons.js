/** 21 章打击武器库。id 稳定为 w01–w21；只改 title，不改数量。 */

export const WEAPON_CHAPTERS = [
  { id: 'w01', title: '新手打击' },
  { id: 'w02', title: '组合入门' },
  { id: 'w03', title: '诱吃与设饵' },
  { id: 'w04', title: '罗亚尔打击（Coup Royal）' },
  { id: 'w05', title: '弹跳打击（Ricochet）' },
  { id: 'w06', title: '交叉打击' },
  { id: 'w07', title: '双击与抽子' },
  { id: 'w08', title: '底线架桥' },
  { id: 'w09', title: '偷袭升王' },
  { id: 'w10', title: '后根 / 桩子打击（Butoir）' },
  { id: 'w11', title: '拿破仑打击（Napoléon）' },
  { id: 'w12', title: '开口打击' },
  { id: 'w13', title: '中路突破' },
  { id: 'w14', title: '侧翼运子打击' },
  { id: 'w15', title: '多连吃计算' },
  { id: 'w16', title: '防守反击打击' },
  { id: 'w17', title: '王棋战术打击' },
  { id: 'w18', title: '残局战术过渡' },
  { id: 'w19', title: '综合计算（浅）' },
  { id: 'w20', title: '综合计算（深）' },
  { id: 'w21', title: '盲区温习章' },
];

const STATUSES = new Set(['locked', 'in_progress', 'done']);

export function defaultWeaponProgress() {
  const progress = {};
  for (const chapter of WEAPON_CHAPTERS) progress[chapter.id] = 'in_progress';
  return progress;
}

export function normalizeWeaponProgress(input) {
  const next = defaultWeaponProgress();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return next;
  for (const chapter of WEAPON_CHAPTERS) {
    const value = input[chapter.id];
    if (STATUSES.has(value)) next[chapter.id] = value;
  }
  return next;
}

export function startOfWeekMs(now = Date.now()) {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function weaponStats(state) {
  const progress = normalizeWeaponProgress(state?.weaponProgress);
  const stars = Array.isArray(state?.weaponStars) ? state.weaponStars : [];
  const weekStart = startOfWeekMs();
  const chaptersDone = WEAPON_CHAPTERS.filter((c) => progress[c.id] === 'done').length;
  const starsOpen = stars.filter((s) => s && s.cleared !== true).length;
  const starsClearedThisWeek = stars.filter((s) => s?.cleared === true && Number(s.clearedAt || 0) >= weekStart).length;
  return { chaptersDone, starsOpen, starsClearedThisWeek, chapterTotal: WEAPON_CHAPTERS.length };
}

export function chapterById(id) {
  return WEAPON_CHAPTERS.find((c) => c.id === id) || null;
}

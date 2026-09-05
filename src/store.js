/** Local-only persistence with an explicit, idempotent schema migration. */
export const KEY = 'wz-counter-trainer-v1';
export const LEGACY_KEYS = ['wangzhi-train-v1'];
export const SCHEMA_VERSION = 1;

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    role: 'child', // child | parent
    games: [],
    problems: [],
    reviews: [],
    weekPlan: null,
    todayOverrideDate: null,
    publishedTodayId: null,
    customLevels: [],
    imports: [],
    leadLock: { attempts: 0, correct: 0 },
    slowSessions: [],
    kingQuiz: { attempts: 0, correct: 0 },
    misses: [],
    speedRuns: [],
    favorites: [],
    openings: {},
    counters: { gamesImported: 0, problemsDone: 0 },
  };
}

export function loadState(storage = globalThis.localStorage) {
  if (!storage) return null;
  const canonical = readRaw(storage, KEY);
  const legacyKey = LEGACY_KEYS.find((key) => readRaw(storage, key));
  const raw = canonical ?? (legacyKey ? readRaw(storage, legacyKey) : null);
  if (!raw) return null;
  try {
    const state = migrateState(JSON.parse(raw));
    if (!canonical && legacyKey) storage.setItem(KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

export function migrateState(input) {
  const base = defaultState();
  const source = input && typeof input === 'object' ? input : {};
  const state = { ...base, ...source, schemaVersion: SCHEMA_VERSION };
  for (const key of ['games', 'problems', 'reviews', 'customLevels', 'imports', 'slowSessions', 'misses', 'speedRuns', 'favorites']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  state.leadLock = state.leadLock && typeof state.leadLock === 'object' ? { ...base.leadLock, ...state.leadLock } : { ...base.leadLock };
  state.kingQuiz = state.kingQuiz && typeof state.kingQuiz === 'object' ? { ...base.kingQuiz, ...state.kingQuiz } : { ...base.kingQuiz };
  if (!state.openings || typeof state.openings !== 'object' || Array.isArray(state.openings)) state.openings = {};
  state.counters = state.counters && typeof state.counters === 'object' ? { ...base.counters, ...state.counters } : { ...base.counters };
  return state;
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!storage) return;
  const normalized = migrateState(state);
  storage.setItem(KEY, JSON.stringify(normalized));
  // Keep the old key as a recoverable compatibility copy for existing MVP builds.
  if (LEGACY_KEYS.length && !readRaw(storage, LEGACY_KEYS[0])) storage.setItem(LEGACY_KEYS[0], JSON.stringify(normalized));
}

export function exportState(state) {
  return JSON.stringify(migrateState(state), null, 2);
}

export function importState(json, currentState = defaultState(), mode = 'merge') {
  let incoming;
  try {
    incoming = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('备份结构不正确');
  const next = migrateState(incoming);
  if (mode === 'replace') return next;
  const current = migrateState(currentState);
  return migrateState({
    ...current,
    ...next,
    games: mergeById(current.games, next.games),
    problems: mergeById(current.problems, next.problems),
    reviews: mergeById(current.reviews, next.reviews),
    customLevels: mergeById(current.customLevels, next.customLevels),
    imports: mergeById(current.imports, next.imports),
  });
}

function mergeById(a, b) {
  const map = new Map((a || []).filter((x) => x?.id).map((x) => [x.id, x]));
  for (const item of b || []) if (item?.id) map.set(item.id, item);
  return [...map.values()];
}

/** Remove a library game and the drafts / imports that belong to it. */
export function removeGameFromState(state, gameId) {
  const s = migrateState(state);
  const removedIds = new Set((s.problems || []).filter((p) => p.gameId === gameId).map((p) => p.id));
  s.games = (s.games || []).filter((g) => g.id !== gameId);
  s.problems = (s.problems || []).filter((p) => p.gameId !== gameId);
  s.customLevels = (s.customLevels || []).filter((p) => p.gameId !== gameId && !removedIds.has(p.id));
  s.imports = (s.imports || []).filter((item) => item.gameId !== gameId);
  if (removedIds.has(s.publishedTodayId)) s.publishedTodayId = null;
  return s;
}

function readRaw(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayStr(state) {
  if (state?.todayOverrideDate) return state.todayOverrideDate;
  const d = new Date();
  // Asia/Shanghai display; storage uses local calendar day of device
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

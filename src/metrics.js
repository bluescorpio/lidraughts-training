/** 四指标复盘速记（SPEC §5.6.1）。 */

export const COUNTER_OPTIONS = [
  { value: '0', label: '0 完美' },
  { value: '1', label: '1' },
  { value: '2plus', label: '2 次以上' },
];

export const LEAD_OPTIONS = [
  { value: 'held_win', label: '守住转化为胜' },
  { value: 'blown', label: '优势被反噬' },
  { value: 'na', label: '本局不明显领先' },
];

export const KING_OPTIONS = [
  { value: 'yes', label: '是' },
  { value: 'no', label: '否' },
  { value: 'no_king', label: '本局无王' },
];

export const PLAN_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

export const SOURCE_OPTIONS = [
  { value: 'lidraughts', label: 'lidraughts' },
  { value: 'otb', label: '现场' },
  { value: 'other', label: '其他' },
];

const COUNTER_SET = new Set(COUNTER_OPTIONS.map((o) => o.value));
const LEAD_SET = new Set(LEAD_OPTIONS.map((o) => o.value));
const KING_SET = new Set(KING_OPTIONS.map((o) => o.value));
const PLAN_SET = new Set(PLAN_OPTIONS.map((o) => o.value));
const SOURCE_SET = new Set(SOURCE_OPTIONS.map((o) => o.value));

export function counterToNum(value) {
  if (value === '0' || value === 0) return 0;
  if (value === '1' || value === 1) return 1;
  return 2;
}

export function labelOf(options, value) {
  return options.find((o) => o.value === String(value))?.label || String(value ?? '');
}

export function normalizeMetricLog(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const counterAfterCombo = COUNTER_SET.has(String(entry.counterAfterCombo)) ? String(entry.counterAfterCombo) : '0';
  const leadHeld = LEAD_SET.has(entry.leadHeld) ? entry.leadHeld : 'na';
  const kingFirstSafe = KING_SET.has(entry.kingFirstSafe) ? entry.kingFirstSafe : 'no_king';
  const planRaw = String(entry.planScore);
  const planScore = PLAN_SET.has(planRaw) ? planRaw : '2';
  const source = SOURCE_SET.has(entry.source) ? entry.source : 'lidraughts';
  const note = String(entry.note || '').slice(0, 30);
  return {
    id: entry.id || '',
    createdAt: Number(entry.createdAt) || 0,
    date: String(entry.date || '').slice(0, 10),
    counterAfterCombo,
    leadHeld,
    kingFirstSafe,
    planScore,
    source,
    note,
  };
}

export function recentMetricLogs(logs, limit = 20) {
  return (logs || []).filter(Boolean).slice(0, limit);
}

export function trendPoints(logs, key, limit = 12) {
  const slice = (logs || []).slice(0, limit).reverse();
  if (key === 'counterAfterCombo') return slice.map((l) => counterToNum(l.counterAfterCombo));
  if (key === 'planScore') return slice.map((l) => Number(l.planScore) || 0);
  return [];
}

export function leadHeldShare(logs) {
  const usable = (logs || []).filter((l) => l.leadHeld === 'held_win' || l.leadHeld === 'blown');
  if (!usable.length) return null;
  const held = usable.filter((l) => l.leadHeld === 'held_win').length;
  return { held, total: usable.length, ratio: held / usable.length };
}

export function kingSafeShare(logs) {
  const usable = (logs || []).filter((l) => l.kingFirstSafe === 'yes' || l.kingFirstSafe === 'no');
  if (!usable.length) return null;
  const yes = usable.filter((l) => l.kingFirstSafe === 'yes').length;
  return { yes, total: usable.length, ratio: yes / usable.length };
}

export function sparklineSvg(values, { width = 180, height = 48, maxY = 3 } = {}) {
  if (!values.length) return '';
  const top = Math.max(maxY, ...values, 1);
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 8) + 4;
    const y = height - 6 - (v / top) * (height - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2.2" points="${pts.join(' ')}" /></svg>`;
}

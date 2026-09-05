/**
 * Best-effort PDN / move-list parser for international draughts.
 * Accepts: 32-28, 16x27, 31x22x11x2, numbered "1. 32-28 19-23", and [Tag "value"] headers.
 */

const STUDENT_NAME_RE = /王植|zack|wang\s*zhi|wangzhi/i;
const RESULT_SKIP_RE = /^(?:1-1|2-0|0-2|1:1|2:0|0:2)$/;
const DRAW_RE = /^(?:1[-:／/]1|1\/2[-:]1\/2|½-½|draw|和棋?)$/i;
const WHITE_WIN_RE = /^(?:2[-:]0|1[-:]0|2-1|白胜)$/i;
const BLACK_WIN_RE = /^(?:0[-:]2|0[-:]1|1-2|黑胜)$/i;

export function parsePdnOrMoves(text) {
  if (!text || !String(text).trim()) {
    return { moves: [], headers: {}, firstColor: null, warnings: ['空棋谱'] };
  }
  const headers = {};
  const raw = String(text).replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const bodyLines = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const hm = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (hm) {
      headers[hm[1]] = hm[2];
      continue;
    }
    bodyLines.push(rawLine);
  }
  const body = bodyLines.join(' ');
  const stripped = body
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/;.*/g, ' ')
    .replace(/\*/g, ' ');

  const moves = [];
  const warnings = [];
  const re = /\b(\d{1,2}(?:[-xX]\d{1,2})+)\b/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const token = m[1].replace(/X/g, 'x');
    if (RESULT_SKIP_RE.test(token)) continue;
    moves.push(token);
  }
  if (!moves.length) warnings.push('未解析到着法，请检查格式（如 32-28 或 16x27）');
  const first = moves[0];
  const firstSquare = first ? Number(first.split(/[-x]/)[0]) : null;
  const firstColor = firstSquare >= 1 && firstSquare <= 20 ? 'B' : firstSquare >= 31 && firstSquare <= 50 ? 'W' : null;
  return { moves, headers, firstColor, sideToMove: firstColor, warnings };
}

export function gameFieldsFromPdn(text) {
  const parsed = parsePdnOrMoves(text);
  const h = lowerHeaders(parsed.headers);
  const event = (h.event || '').trim();
  const site = (h.site || '').trim();
  const round = (h.round || '').trim();
  const white = (h.white || '').trim();
  const black = (h.black || '').trim();
  const rawResult = (h.result || '').trim();
  const date = normalizePdnDate(h.date || h.eventdate || '');
  const whiteIsStudent = STUDENT_NAME_RE.test(white);
  const blackIsStudent = STUDENT_NAME_RE.test(black);

  let color = '';
  let opponent = '';
  let colorDetected = false;
  if (whiteIsStudent && !blackIsStudent) {
    color = '白';
    opponent = black;
    colorDetected = true;
  } else if (blackIsStudent && !whiteIsStudent) {
    color = '黑';
    opponent = white;
    colorDetected = true;
  } else if (white || black) {
    opponent = [white, black].filter(Boolean).join(' / ');
  }

  const hasResult = Boolean(rawResult);
  let result = '和';
  if (colorDetected) result = mapResult(rawResult, color);
  else if (isDraw(rawResult)) result = '和';

  const title = event || [white, black].filter(Boolean).join(' vs ');
  const noteParts = [];
  const roundLabel = formatRound(round);
  if (roundLabel) noteParts.push(roundLabel);
  if (site) noteParts.push(site);
  if (white || black) noteParts.push(`白 ${white || '？'} vs 黑 ${black || '？'}`);
  if (rawResult) noteParts.push(`原结果 ${rawResult}`);

  const gametype = (h.gametype || '').trim();
  if (gametype && !/^(?:100|21|international)$/i.test(gametype)) {
    parsed.warnings = [...(parsed.warnings || []), `棋谱 Gametype 为 ${gametype}，本站按 100 格国际跳棋读取。`];
  }

  return {
    ...parsed,
    hasHeaders: Object.keys(parsed.headers).length > 0,
    hasResult,
    colorDetected,
    title,
    date,
    opponent,
    color: color || '白',
    result,
    source: site || event,
    notes: noteParts.join(' · '),
    white,
    black,
    round,
    site,
  };
}

export function summarizePdnImport(fields) {
  if (!fields) return '未能读取棋谱。';
  const bits = [];
  if (fields.title) bits.push(`「${fields.title}」`);
  if (fields.date) bits.push(fields.date);
  if (fields.colorDetected) bits.push(`执${fields.color}对${fields.opponent || '对手'}`);
  else if (fields.opponent) bits.push(fields.opponent);
  if (fields.hasResult) bits.push(fields.result);
  bits.push(`${fields.moves?.length || 0} 手`);
  return `已识别${bits.join(' · ')}。请检查后保存。`;
}

export function normalizePdnDate(value) {
  const s = String(value || '').trim();
  if (!s || /^[.?]+$/.test(s)) return '';
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  return '';
}

export function movesToPdnBody(moves) {
  const parts = [];
  for (let i = 0; i < moves.length; i += 2) {
    const n = Math.floor(i / 2) + 1;
    const w = moves[i] || '';
    const b = moves[i + 1] || '';
    parts.push(b ? `${n}. ${w} ${b}` : `${n}. ${w}`);
  }
  return parts.join(' ');
}

function lowerHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[String(key).toLowerCase()] = value;
  }
  return out;
}

function formatRound(round) {
  if (!round) return '';
  if (/轮/.test(round) || /^r\d+/i.test(round)) return round;
  return `第${round}轮`;
}

function isDraw(result) {
  return DRAW_RE.test(String(result || '').replace(/\s/g, ''));
}

function mapResult(result, color) {
  const r = String(result || '').replace(/\s/g, '');
  if (!r || isDraw(r)) return '和';
  const whiteWin = WHITE_WIN_RE.test(r);
  const blackWin = BLACK_WIN_RE.test(r);
  if (color === '白') {
    if (whiteWin) return '胜';
    if (blackWin) return '负';
  }
  if (color === '黑') {
    if (blackWin) return '胜';
    if (whiteWin) return '负';
  }
  return '和';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 100-square international draughts helpers.
 * Dark squares numbered 1–50 (playable). White starts on 31–50, black on 1–20.
 * Board display: row 0 (top) = black side (1–5), row 9 (bottom) = white side (46–50).
 *
 * Checked moves use src/draughts/rules.js (FMJD / 中国国际跳棋):
 * promote only when the move ends on 1–5 (white) or 46–50 (black).
 */
import {
  captureSequencesFrom,
  getLegalForSelection,
  getLegalMoves,
  tryStep,
} from './rules.js';

// This project records imported and built-in games from the black side first.
export const START_FEN = 'B:B1-20:W31-50';

/** Map square number 1–50 → {row, col} on 10×10 (0-indexed), dark squares only. */
export function sqToRC(sq) {
  if (sq < 1 || sq > 50) return null;
  const i = sq - 1;
  const row = Math.floor(i / 5);
  const colInRow = i % 5;
  const col = row % 2 === 0 ? colInRow * 2 + 1 : colInRow * 2;
  return { row, col };
}

export function rcToSq(row, col) {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  const dark = (row + col) % 2 === 1;
  if (!dark) return null;
  const colInRow = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  return row * 5 + colInRow + 1;
}

// SPEC-compatible aliases; the original prototype names are kept above so
// existing callers remain unchanged.
export const rowCol = sqToRC;
export function numOf(rowOrPoint, col) {
  if (rowOrPoint && typeof rowOrPoint === 'object') return rcToSq(rowOrPoint.row, rowOrPoint.col);
  return rcToSq(rowOrPoint, col);
}

export function emptyBoard() {
  return Array(51).fill(null); // index 1–50
}

/** Piece: { color: 'W'|'B', king: boolean } */
export function parseFen(fen = START_FEN) {
  const board = emptyBoard();
  let turn = 'W';
  const parts = fen.trim().split(':');
  if (parts[0] === 'B' || parts[0] === 'W') turn = parts[0];
  for (const part of parts.slice(1)) {
    if (!part) continue;
    const color = part[0];
    if (color !== 'W' && color !== 'B') continue;
    const body = part.slice(1);
    if (!body) continue;
    for (const token of body.split(',')) {
      const t = token.trim();
      if (!t) continue;
      let king = false;
      let rest = t;
      if (rest[0] === 'K' || rest[0] === 'k') {
        king = true;
        rest = rest.slice(1);
      }
      if (rest.includes('-')) {
        const [a, b] = rest.split('-').map(Number);
        for (let s = a; s <= b; s++) board[s] = { color, king };
      } else {
        const s = Number(rest);
        if (s >= 1 && s <= 50) board[s] = { color, king };
      }
    }
  }
  return { board, turn };
}

export function boardToFen(board, turn = 'W') {
  const groups = { W: [], B: [] };
  for (let s = 1; s <= 50; s++) {
    const p = board[s];
    if (!p) continue;
    groups[p.color].push(p.king ? `K${s}` : String(s));
  }
  const w = groups.W.length ? `W${groups.W.join(',')}` : 'W';
  const b = groups.B.length ? `B${groups.B.join(',')}` : 'B';
  return `${turn}:${b}:${w}`;
}

export function cloneBoard(board) {
  return board.map((p) => (p ? { ...p } : null));
}

/**
 * Best-effort apply a move like "32-28", "16x27", "31x22x11x2".
 * Returns { board, ok, warning }.
 */
export function applyMove(board, moveStr, promote = true) {
  const next = cloneBoard(board);
  const clean = moveStr.trim().replace(/\s+/g, '');
  const isCapture = /x/i.test(clean);
  const parts = clean.split(/[-xX]/).map(Number).filter((n) => n >= 1 && n <= 50);
  if (parts.length < 2) {
    return { board: next, ok: false, warning: `无法解析着法: ${moveStr}` };
  }
  const from = parts[0];
  if (!next[from]) {
    return { board: next, ok: false, warning: `${from} 无棋子，跳过 ${moveStr}` };
  }
  const piece = { ...next[from] };
  next[from] = null;

  if (isCapture) {
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i];
      const b = parts[i + 1];
      const mid = captureMid(a, b);
      if (mid && next[mid] && next[mid].color !== piece.color) {
        next[mid] = null;
      }
      // even if mid unclear, still move piece along path at end
    }
  }

  const to = parts[parts.length - 1];
  // promote
  if (promote) {
    if (piece.color === 'W' && to <= 5) piece.king = true;
    if (piece.color === 'B' && to >= 46) piece.king = true;
  }
  next[to] = piece;
  return { board: next, ok: true, warning: null };
}

/** Rough mid-square between two dark squares (for short captures). */
function captureMid(a, b) {
  const ra = sqToRC(a);
  const rb = sqToRC(b);
  if (!ra || !rb) return null;
  const dr = rb.row - ra.row;
  const dc = rb.col - ra.col;
  if (Math.abs(dr) < 2 || Math.abs(dc) < 2) return null;
  // step toward b by 1 dark-step approx
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  // find dark square roughly halfway for short jump
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2) {
    return rcToSq(ra.row + stepR, ra.col + stepC);
  }
  // longer king capture: try adjacent step from a toward b
  const mid = rcToSq(ra.row + stepR, ra.col + stepC);
  if (mid) return mid;
  // fallback: scan squares between
  for (let s = 1; s <= 50; s++) {
    const r = sqToRC(s);
    if (!r) continue;
    if (
      r.row > Math.min(ra.row, rb.row) &&
      r.row < Math.max(ra.row, rb.row) &&
      r.col > Math.min(ra.col, rb.col) &&
      r.col < Math.max(ra.col, rb.col)
    ) {
      return s;
    }
  }
  return null;
}

export function applyMoveList(startBoard, moves, upToIndex = moves.length) {
  let board = cloneBoard(startBoard);
  const warnings = [];
  const snapshots = [cloneBoard(board)];
  for (let i = 0; i < Math.min(upToIndex, moves.length); i++) {
    const r = applyMove(board, moves[i]);
    board = r.board;
    if (!r.ok && r.warning) warnings.push(r.warning);
    snapshots.push(cloneBoard(board));
  }
  return { board, snapshots, warnings };
}

export const TAG_OPTIONS = [
  { id: '被反打', label: '被反打' },
  { id: '该锁住', label: '该锁住' },
  { id: '深推无援', label: '深推无援' },
  { id: '升王样板', label: '升王样板' },
  { id: '好组合', label: '好组合' },
];

/* -------------------------------------------------------------------------
 * Checked position API (SPEC §8).  The original UI uses the array board API
 * above; these pure helpers provide a strict, testable position model for
 * imports and future training modules without changing existing rendering.
 * ---------------------------------------------------------------------- */

export function positionFromFen(fen = START_FEN) {
  const parsed = parseFen(fen);
  const pos = { W: [], B: [], WK: [], BK: [], sideToMove: parsed.turn };
  for (let sq = 1; sq <= 50; sq += 1) {
    const piece = parsed.board[sq];
    if (!piece) continue;
    const key = piece.king ? `${piece.color}K` : piece.color;
    pos[key].push(sq);
  }
  return pos;
}

export function positionToBoard(pos) {
  const board = emptyBoard();
  for (const color of ['W', 'B']) {
    for (const sq of pos?.[color] || []) board[sq] = { color, king: false };
    for (const sq of pos?.[`${color}K`] || []) board[sq] = { color, king: true };
  }
  return board;
}

export function clonePosition(pos) {
  return {
    W: [...(pos?.W || [])], B: [...(pos?.B || [])],
    WK: [...(pos?.WK || [])], BK: [...(pos?.BK || [])],
    sideToMove: pos?.sideToMove || 'W',
  };
}

function toSide(color) {
  return color === 'B' || color === 'b' ? 'b' : 'w';
}

/** Pieces map used by the FMJD generator. Numeric keys, color 'w' | 'b'. */
export function positionToPieces(pos) {
  const pieces = {};
  for (const sq of pos?.W || []) pieces[sq] = { color: 'w', king: false };
  for (const sq of pos?.B || []) pieces[sq] = { color: 'b', king: false };
  for (const sq of pos?.WK || []) pieces[sq] = { color: 'w', king: true };
  for (const sq of pos?.BK || []) pieces[sq] = { color: 'b', king: true };
  return pieces;
}

export function piecesToPosition(pieces, sideToMove = 'W') {
  const pos = { W: [], B: [], WK: [], BK: [], sideToMove };
  for (const [key, piece] of Object.entries(pieces || {})) {
    if (!piece) continue;
    const sq = Number(key);
    if (!Number.isInteger(sq)) continue;
    const bucket = piece.king
      ? (piece.color === 'w' ? 'WK' : 'BK')
      : (piece.color === 'w' ? 'W' : 'B');
    pos[bucket].push(sq);
  }
  return pos;
}

function chainToActive(chain) {
  if (!chain) return null;
  const path = [...(chain.squares || chain.path || [])];
  if (path.length < 1) return null;
  return {
    path,
    captures: [...(chain.captures || [])],
    maxCaptures: chain.maxCaptures,
  };
}

export function genCaptures(pos, color = pos?.sideToMove || 'W') {
  const pieces = positionToPieces(pos);
  const out = [];
  for (const from of [...(pos?.[color] || []), ...(pos?.[`${color}K`] || [])]) {
    const piece = pieces[from];
    if (!piece) continue;
    const seqs = captureSequencesFrom(pieces, from, piece.color, !!piece.king, new Set());
    for (const seq of seqs) out.push(seq.path.slice());
  }
  return out;
}

export function longestCaptures(pos, color = pos?.sideToMove || 'W') {
  const all = genCaptures(pos, color);
  const max = all.reduce((n, path) => Math.max(n, path.length - 1), 0);
  return all.filter((path) => path.length - 1 === max);
}

export function hasCapture(pos, color = pos?.sideToMove || 'W') {
  return genCaptures(pos, color).length > 0;
}

export function genMoves(pos, color = pos?.sideToMove || 'W') {
  const pieces = positionToPieces(pos);
  return getLegalMoves(pieces, toSide(color)).map((move) => move.path.slice());
}

export function applyMoveChecked(pos, move, color = pos?.sideToMove || 'W') {
  const clean = String(move || '').replace(/\s+/g, '').replace(/[×X]/g, 'x');
  const separator = clean.includes('x') ? 'x' : clean.includes('-') ? '-' : null;
  const path = separator ? clean.split(separator).map(Number) : [];
  if (!separator || path.length < 2 || path.some((sq) => !Number.isInteger(sq) || sq < 1 || sq > 50)) {
    return { ok: false, error: `无法解析着法：${move}`, position: clonePosition(pos) };
  }
  const side = toSide(color);
  const pieces0 = positionToPieces(pos);
  const mover = pieces0[path[0]];
  if (!mover || mover.color !== side) {
    return { ok: false, error: `${path[0]} 不是${color === 'W' ? '白' : '黑'}方棋子`, position: clonePosition(pos) };
  }
  let pieces = pieces0;
  let active = null;
  for (let i = 0; i < path.length - 1; i += 1) {
    const res = tryStep(pieces, side, path[i], path[i + 1], active);
    if (!res.ok) return { ok: false, error: res.error || `不合法着法：${move}`, position: clonePosition(pos) };
    if (separator === '-' && res.completedMove?.isCapture) {
      return { ok: false, error: '有吃子时必须先吃', position: clonePosition(pos) };
    }
    if (res.completedMove && i !== path.length - 2) {
      return { ok: false, error: `不合法着法：${move}`, position: clonePosition(pos) };
    }
    pieces = res.pieces;
    active = res.active;
  }
  if (active) return { ok: false, error: '连吃还没走完', position: clonePosition(pos) };
  return {
    ok: true,
    position: piecesToPosition(pieces, color === 'W' ? 'B' : 'W'),
    path,
  };
}

/** Squares the learner may click next: one diagonal hop, never the far end of a chain. */
export function nextLandingSquares(pos, from, chain = null) {
  const color = chain?.color || pos?.sideToMove || 'W';
  const info = getLegalForSelection(
    positionToPieces(pos),
    toSide(color),
    chain ? chain.from : from,
    chainToActive(chain),
  );
  return [...(info.destinations || [])];
}

/**
 * Apply one interactive hop with FMJD rules.
 * Captured men stay on the board until the sequence ends (they only block).
 * A man that touches the promotion line mid-capture stays a man.
 * Illegal clicks return the same position.
 */
export function playInteractiveStep(pos, from, to, chain = null) {
  const color = chain?.color || pos?.sideToMove || 'W';
  const side = toSide(color);
  if (chain && from !== chain.from) {
    return { ok: false, error: '这颗子还要继续吃。', position: pos, chain };
  }
  if (to === from) {
    return { ok: false, error: '先点落点。', position: pos, chain };
  }
  const pieces = positionToPieces(pos);
  const piece = pieces[from];
  if (!piece || piece.color !== side) {
    return { ok: false, error: '先走该走的一方。', position: pos, chain };
  }
  const res = tryStep(pieces, side, from, to, chainToActive(chain));
  if (!res.ok) {
    const all = getLegalMoves(pieces, side);
    const skips = !chain && all.some((move) => move.from === from && move.path.includes(to) && move.path[1] !== to);
    let error = '这一步不合规则，棋子留在原地。';
    if (skips) error = '请先走到下一格，不能一次跳到终点。';
    else if (!chain && (res.errorCode === 'must_capture' || res.errorCode === 'must_majority')) error = '有吃子时必须先吃。';
    else if (res.errorCode === 'must_continue') error = '这颗子还要继续吃。';
    else if (res.error) error = res.error;
    return { ok: false, error, position: pos, chain };
  }
  const finished = Boolean(res.completedMove);
  const position = piecesToPosition(res.pieces, finished ? (color === 'W' ? 'B' : 'W') : color);
  if (!finished) {
    const landing = res.active.path[res.active.path.length - 1];
    return {
      ok: true,
      position,
      chain: {
        from: landing,
        color,
        king: Boolean(res.pieces[landing]?.king),
        squares: res.active.path.slice(),
        captures: res.active.captures.slice(),
        maxCaptures: res.active.maxCaptures,
      },
      move: null,
      finished: false,
    };
  }
  return { ok: true, position, chain: null, move: res.completedMove.notation, finished: true };
}

/**
 * 100-square international draughts helpers.
 * Dark squares numbered 1–50 (playable). White starts on 31–50, black on 1–20.
 * Board display: row 0 (top) = black side (1–5), row 9 (bottom) = white side (46–50).
 */

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

function occupied(pos, sq) {
  for (const color of ['W', 'B']) {
    if ((pos[color] || []).includes(sq)) return { color, king: false };
    if ((pos[`${color}K`] || []).includes(sq)) return { color, king: true };
  }
  return null;
}

function dirsFrom(sq) {
  const rc = sqToRC(sq);
  if (!rc) return [];
  return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    .map(([dr, dc]) => ({ dr, dc, mid: rcToSq(rc.row + dr, rc.col + dc) }))
    .filter((d) => d.mid);
}

function movePiece(pos, from, to, color, king) {
  const next = clonePosition(pos);
  const list = king ? next[`${color}K`] : next[color];
  const index = list.indexOf(from);
  if (index < 0) return null;
  list.splice(index, 1);
  next[king ? `${color}K` : color].push(to);
  return next;
}

function removePiece(pos, sq, color) {
  for (const key of [color, `${color}K`]) {
    const list = pos[key];
    const i = list.indexOf(sq);
    if (i >= 0) { list.splice(i, 1); return; }
  }
}

function promotePosition(pos, color, sq) {
  const list = pos[color];
  const i = list.indexOf(sq);
  if (i >= 0 && ((color === 'W' && sq <= 5) || (color === 'B' && sq >= 46))) {
    list.splice(i, 1);
    pos[`${color}K`].push(sq);
  }
}

function manCaptures(pos, from, color, occupiedRemoved = new Set()) {
  const out = [];
  const rc = sqToRC(from);
  for (const { dr, dc } of dirsFrom(from)) {
    const mid = rcToSq(rc.row + dr, rc.col + dc);
    const land = rcToSq(rc.row + dr * 2, rc.col + dc * 2);
    const enemy = mid && occupied(pos, mid);
    if (!land || occupied(pos, land) || occupiedRemoved.has(mid)) continue;
    if (enemy && enemy.color !== color) out.push({ to: land, captured: mid });
  }
  return out;
}

function kingCaptures(pos, from, color, occupiedRemoved = new Set()) {
  const out = [];
  const rc = sqToRC(from);
  for (const { dr, dc } of dirsFrom(from)) {
    let r = rc.row + dr;
    let c = rc.col + dc;
    let first = null;
    while (true) {
      const sq = rcToSq(r, c);
      if (!sq) break;
      const piece = occupied(pos, sq);
      if (piece) {
        if (first || piece.color === color || occupiedRemoved.has(sq)) break;
        first = sq;
      } else if (first) {
        out.push({ to: sq, captured: first });
      }
      r += dr; c += dc;
    }
  }
  return out;
}

function capturesFrom(pos, from, color, king, removed = new Set()) {
  return king ? kingCaptures(pos, from, color, removed) : manCaptures(pos, from, color, removed);
}

function capturePaths(pos, from, color, king, prefix = [from], removed = new Set()) {
  const options = capturesFrom(pos, from, color, king, removed);
  if (!options.length) return prefix.length > 1 ? [prefix] : [];
  const paths = [];
  for (const option of options) {
    const nextRemoved = new Set(removed).add(option.captured);
    const next = clonePosition(pos);
    // During a sequence captured pieces are unavailable, while the moving
    // piece is represented at the new landing square.
    removePiece(next, from, color);
    removePiece(next, option.captured, color === 'W' ? 'B' : 'W');
    if (king) next[`${color}K`].push(option.to);
    else next[color].push(option.to);
    paths.push(...capturePaths(next, option.to, color, king, [...prefix, option.to], nextRemoved));
  }
  return paths;
}

export function genCaptures(pos, color = pos?.sideToMove || 'W') {
  const out = [];
  for (const from of [...(pos?.[color] || []), ...(pos?.[`${color}K`] || [])]) {
    const king = (pos?.[`${color}K`] || []).includes(from);
    for (const path of capturePaths(pos, from, color, king)) out.push(path);
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
  if (hasCapture(pos, color)) return longestCaptures(pos, color);
  const out = [];
  const occupiedSquares = new Set([...pos.W, ...pos.B, ...pos.WK, ...pos.BK]);
  for (const from of pos[color] || []) {
    const rc = sqToRC(from);
    const forward = color === 'W' ? -1 : 1;
    for (const dc of [-1, 1]) {
      const to = rcToSq(rc.row + forward, rc.col + dc);
      if (to && !occupiedSquares.has(to)) out.push([from, to]);
    }
  }
  for (const from of pos[`${color}K`] || []) {
    const rc = sqToRC(from);
    for (const { dr, dc } of dirsFrom(from)) {
      let r = rc.row + dr; let c = rc.col + dc;
      while (true) {
        const to = rcToSq(r, c);
        if (!to || occupiedSquares.has(to)) break;
        out.push([from, to]); r += dr; c += dc;
      }
    }
  }
  return out;
}

export function applyMoveChecked(pos, move, color = pos?.sideToMove || 'W') {
  const clean = String(move || '').replace(/\s+/g, '').replace(/X/g, 'x');
  const separator = clean.includes('x') ? 'x' : clean.includes('-') ? '-' : null;
  const path = separator ? clean.split(separator).map(Number) : [];
  if (path.length < 2 || path.some((sq) => !Number.isInteger(sq) || sq < 1 || sq > 50)) {
    return { ok: false, error: `无法解析着法：${move}`, position: clonePosition(pos) };
  }
  const from = path[0];
  const piece = occupied(pos, from);
  if (!piece || piece.color !== color) return { ok: false, error: `${from} 不是${color === 'W' ? '白' : '黑'}方棋子`, position: clonePosition(pos) };
  const legal = separator === 'x' ? longestCaptures(pos, color) : genMoves(pos, color);
  if (separator === '-' && hasCapture(pos, color)) return { ok: false, error: '有吃子时必须先吃', position: clonePosition(pos) };
  if (!legal.some((candidate) => candidate.length === path.length && candidate.every((sq, i) => sq === path[i]))) {
    return { ok: false, error: `不合法着法：${move}`, position: clonePosition(pos) };
  }
  let next = clonePosition(pos);
  if (separator === '-') next = movePiece(next, from, path[1], color, piece.king);
  else {
    removePiece(next, from, color);
    let current = from;
    for (let i = 1; i < path.length; i += 1) {
      const to = path[i];
      const capture = capturesFrom(next, current, color, piece.king).find((x) => x.to === to);
      if (!capture) return { ok: false, error: `无法验证吃子路径：${move}`, position: clonePosition(pos) };
      removePiece(next, capture.captured, color === 'W' ? 'B' : 'W');
      current = to;
    }
    if (piece.king) next[`${color}K`].push(current);
    else next[color].push(current);
    promotePosition(next, color, current);
  }
  next.sideToMove = color === 'W' ? 'B' : 'W';
  return { ok: true, position: next, path };
}

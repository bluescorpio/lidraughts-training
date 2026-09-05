/**
 * Best-effort PDN / move-list parser for international draughts.
 * Accepts: 32-28, 16x27, 31x22x11x2, numbered "1. 32-28 19-23", tags ignored.
 */

export function parsePdnOrMoves(text) {
  if (!text || !String(text).trim()) {
    return { moves: [], headers: {}, firstColor: null, warnings: ['空棋谱'] };
  }
  const headers = {};
  const lines = String(text).split(/\r?\n/);
  const bodyLines = [];
  for (const line of lines) {
    const hm = line.match(/^\[(\w+)\s+"(.*)"\]\s*$/);
    if (hm) {
      headers[hm[1]] = hm[2];
      continue;
    }
    bodyLines.push(line);
  }
  const body = bodyLines.join(' ');
  // strip comments {..} and ;...
  const stripped = body
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/;.*/g, ' ');

  const moves = [];
  const warnings = [];
  // match move tokens
  const re = /\b(\d{1,2}(?:[-xX]\d{1,2})+)\b/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const token = m[1].replace(/X/g, 'x');
    // Results such as 1-1 / 2-0 look like moves to a loose regex; they are
    // result tokens, never board moves.
    if (/^(?:1-1|2-0|0-2)$/.test(token)) continue;
    moves.push(token);
  }
  if (!moves.length) warnings.push('未解析到着法，请检查格式（如 32-28 或 16x27）');
  const first = moves[0];
  const firstSquare = first ? Number(first.split(/[-x]/)[0]) : null;
  const firstColor = firstSquare >= 1 && firstSquare <= 20 ? 'B' : firstSquare >= 31 && firstSquare <= 50 ? 'W' : null;
  return { moves, headers, firstColor, sideToMove: firstColor, warnings };
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

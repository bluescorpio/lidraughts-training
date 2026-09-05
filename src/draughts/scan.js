import { START_FEN, applyMoveChecked, longestCaptures, positionFromFen, clonePosition } from './board.js';
import { parsePdnOrMoves } from './pdn.js';

/**
 * Scan a parsed move list for the two training moments described in SPEC §9.
 * `moves` may be an array or the result of parsePdnOrMoves.  The first side
 * is inferred from PDN's first departure square unless explicitly supplied.
 */
export function scanCounterNodes(input, startFen = START_FEN, firstColor = null) {
  const parsed = Array.isArray(input) ? { moves: input, firstColor } : input || { moves: [] };
  const moves = parsed.moves || [];
  const initial = positionFromFen(startFen);
  initial.sideToMove = parsed.firstColor || firstColor || initial.sideToMove;
  let position = initial;
  let previousWasCapture = false;
  const nodes = [];
  const warnings = [];

  for (let i = 0; i < moves.length; i += 1) {
    const color = position.sideToMove;
    const answers = longestCaptures(position, color);
    if (answers.some((path) => path.length - 1 >= 2)) {
      nodes.push({
        id: `node-${i}`,
        ply: i,
        moveNumber: i + 1,
        type: 'B',
        kind: '连吃节点',
        sideToMove: color,
        position: clonePosition(position),
        answers,
      });
    }
    if (previousWasCapture && answers.length) {
      nodes.push({
        id: `node-${i}-A`,
        ply: i,
        moveNumber: i + 1,
        type: 'A',
        kind: '反打节点',
        sideToMove: color,
        position: clonePosition(position),
        answers,
      });
    }

    const result = applyMoveChecked(position, moves[i], color);
    if (!result.ok) {
      warnings.push(`第${i + 1}手 ${moves[i]}：${result.error}`);
      break;
    }
    position = result.position;
    previousWasCapture = String(moves[i]).includes('x') || String(moves[i]).includes('X');
  }

  return { nodes, finalPosition: position, warnings };
}

export function scanPdn(text, startFen = START_FEN) {
  const parsed = parsePdnOrMoves(text);
  const result = scanCounterNodes(parsed, startFen);
  return { ...parsed, ...result, warnings: [...(parsed.warnings || []).filter((w) => w !== '未解析到着法，请检查格式（如 32-28 或 16x27）'), ...(result.warnings || [])] };
}

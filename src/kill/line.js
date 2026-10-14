import { applyMoveChecked, genMoves, hasCapture, positionFromFen } from '../draughts/board.js';

const MOVE_RE = /\d{1,2}(?:[-xX]\d{1,2})+/g;

export function normalizeMove(move) {
  return String(move || '').replace(/\s+/g, '').replace(/X/g, 'x');
}

/** Split a recorded answer line into solver moves and opponent replies. */
export function parseAnswerLine(line, answer) {
  const text = String(line || '').trim();
  const steps = [];
  const parts = text.split(/[;；]/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.search(/[（(]/);
    if (idx >= 0) {
      const before = part.slice(0, idx);
      const inside = part.slice(idx);
      for (const move of before.match(MOVE_RE) || []) steps.push({ by: 'solver', move: normalizeMove(move) });
      // 「防 …」is a warning about a move to avoid, not a reply to play.
      if (!/防/.test(inside)) {
        for (const move of inside.match(MOVE_RE) || []) steps.push({ by: 'reply', move: normalizeMove(move) });
      }
    } else {
      for (const move of part.match(MOVE_RE) || []) steps.push({ by: 'solver', move: normalizeMove(move) });
    }
  }
  if (!steps.length && answer) steps.push({ by: 'solver', move: normalizeMove(answer) });
  return steps;
}

export function killFen(item) {
  const kings = new Set((item.kings || []).map(Number));
  const fmt = (squares) => (squares || []).map((sq) => (kings.has(Number(sq)) ? `K${sq}` : String(sq))).join(',');
  const turn = item.side === 'w' || item.side === 'W' ? 'W' : 'B';
  return `${turn}:B${fmt(item.black)}:W${fmt(item.white)}`;
}

export function pathNotation(pos, path) {
  const sep = hasCapture(pos, pos?.sideToMove) ? 'x' : '-';
  return path.join(sep);
}

/** Pick the legal path the learner clicked. Full captures count as one move. */
export function chooseMovePath(paths, from, sq) {
  const mine = (paths || []).filter((path) => path[0] === from && path.includes(sq));
  if (!mine.length) return null;
  const finals = mine.filter((path) => path[path.length - 1] === sq);
  if (finals.length === 1) return finals[0];
  if (mine.length === 1) return mine[0];
  const quiet = mine.filter((path) => path.length === 2 && path[1] === sq);
  if (quiet.length === 1) return quiet[0];
  return null;
}

export function targetSquares(pos, from) {
  const squares = new Set();
  for (const path of genMoves(pos).filter((path) => path[0] === from)) {
    for (let i = 1; i < path.length; i += 1) squares.add(path[i]);
  }
  return [...squares];
}

/** Play the recorded line until a move is not legal, and keep that prefix. */
export function walkAnswerLine(puzzle) {
  let pos = positionFromFen(puzzle.fen);
  const steps = parseAnswerLine(puzzle.answerLine || puzzle.answer_line, puzzle.answer);
  const played = [];
  for (const step of steps) {
    const result = applyMoveChecked(pos, step.move, pos.sideToMove);
    if (!result.ok) break;
    played.push({ by: step.by, move: normalizeMove(step.move) });
    pos = result.position;
  }
  return { steps, played, end: pos };
}

export function playableSolverMoves(puzzle) {
  return walkAnswerLine(puzzle).played.filter((step) => step.by === 'solver').map((step) => step.move);
}

/** Opponent replies that follow the solver moves already played. */
export function repliesAfter(puzzle, solverMoves) {
  const done = (solverMoves || []).map(normalizeMove);
  const { played } = walkAnswerLine(puzzle);
  let index = 0;
  let collect = false;
  const replies = [];
  for (const step of played) {
    if (step.by === 'solver') {
      if (collect) break;
      if (done[index] !== step.move) return [];
      index += 1;
      if (index === done.length) collect = true;
    } else if (collect) replies.push(step.move);
  }
  return replies;
}

/**
 * Compare the learner's own moves with the playable answer line.
 * status: empty | miss | partial | full
 */
export function gradeAttempt(puzzle, userMoves) {
  const expected = playableSolverMoves(puzzle);
  const got = (userMoves || []).map(normalizeMove).filter(Boolean);
  if (!got.length) return { status: 'empty', expected };
  for (let i = 0; i < got.length; i += 1) {
    if (got[i] !== expected[i]) return { status: 'miss', expected };
  }
  if (expected.length && got.length >= expected.length) return { status: 'full', expected };
  return { status: 'partial', expected };
}

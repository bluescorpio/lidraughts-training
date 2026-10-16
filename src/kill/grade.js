/** 杀棋批改 / 二刷. Matches puzzle-boards TRAINING-杀棋-可拖动.html. */

export const KILL_FILTERS = [
  { id: '一步杀', label: '一步杀 K' },
  { id: '二步杀', label: '二步杀 E' },
  { id: '三步杀', label: '三步杀 S' },
  { id: '二刷', label: '二刷' },
  { id: '全部', label: '全部' },
];

const FILTER_ALIASES = {
  all: '全部',
  全部: '全部',
  K: '一步杀',
  '一步杀': '一步杀',
  E: '二步杀',
  '二步杀': '二步杀',
  S: '三步杀',
  '三步杀': '三步杀',
  retry: '二刷',
  '二刷': '二刷',
};

export function normalizeFilter(filter) {
  return FILTER_ALIASES[filter] || '一步杀';
}

export function normalizeTrainerMove(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, '').replace(/[×X]/g, 'x').toLowerCase();
}

export function isOralPuzzle(puzzle) {
  return puzzle?.oral === true || puzzle?.answer == null || puzzle?.answer === '';
}

export function answerLineOf(puzzle) {
  return puzzle?.answerLine || puzzle?.answer_line || puzzle?.answer || '';
}

export function moveMatchesAnswer(puzzle, notation) {
  const got = normalizeTrainerMove(notation);
  const answer = normalizeTrainerMove(puzzle?.answer);
  const line = normalizeTrainerMove(answerLineOf(puzzle));
  return Boolean((answer && got === answer) || (line && got === line));
}

export function piecesFromPuzzle(puzzle) {
  const pieces = {};
  const kings = new Set(puzzle?.kings || []);
  for (const sq of puzzle?.white || []) pieces[sq] = { color: 'w', king: kings.has(sq) };
  for (const sq of puzzle?.black || []) pieces[sq] = { color: 'b', king: kings.has(sq) };
  return pieces;
}

function levelKey(level) {
  if (level === '一步杀') return 'K';
  if (level === '二步杀') return 'E';
  if (level === '三步杀') return 'S';
  return level || '';
}

export function filterPuzzles(puzzles, filter, retryIds = []) {
  const selected = normalizeFilter(filter);
  const retry = new Set(retryIds || []);
  let list = [...(puzzles || [])];
  if (selected === '二刷') list = list.filter((puzzle) => retry.has(puzzle.id));
  else if (selected !== '全部') list = list.filter((puzzle) => puzzle.level === selected);
  list.sort((a, b) => {
    const ka = levelKey(a.level);
    const kb = levelKey(b.level);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
  return list;
}

/**
 * Record one finished move.
 * A wrong answer enters 二刷. A correct answer leaves 二刷.
 */
export function recordAttempt(puzzle, notation, answers = {}, retryIds = []) {
  const nextAnswers = { ...answers, [puzzle.id]: notation };
  const retry = [...retryIds];
  let extra = '';
  if (!isOralPuzzle(puzzle)) {
    if (moveMatchesAnswer(puzzle, notation)) {
      const index = retry.indexOf(puzzle.id);
      if (index >= 0) {
        retry.splice(index, 1);
        extra = ' · 已订正';
      }
    } else {
      if (!retry.includes(puzzle.id)) retry.push(puzzle.id);
      extra = ' · 已入二刷';
    }
  }
  return { answers: nextAnswers, retryIds: retry, extra };
}

/**
 * 批改 the whole bank.
 * Unanswered puzzles stay out of 二刷.
 * Wrong answers are added; a wrong answer already in 二刷 stays.
 * A correct answer is removed.
 */
export function gradeBank(puzzles, answers = {}, retryIds = []) {
  const retry = [...retryIds];
  const results = {};
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  let oral = 0;
  const lines = [];
  for (const puzzle of puzzles || []) {
    if (isOralPuzzle(puzzle)) {
      oral += 1;
      results[puzzle.id] = 'oral';
      lines.push(`◇ ${puzzle.id}  口述题，跳过`);
      continue;
    }
    const user = answers[puzzle.id];
    const showStd = answerLineOf(puzzle);
    if (!user) {
      unanswered += 1;
      results[puzzle.id] = 'unanswered';
      lines.push(`○ ${puzzle.id}  未答（标答 ${showStd}）`);
      continue;
    }
    if (moveMatchesAnswer(puzzle, user)) {
      correct += 1;
      results[puzzle.id] = 'correct';
      const index = retry.indexOf(puzzle.id);
      if (index >= 0) retry.splice(index, 1);
      lines.push(`✓ ${puzzle.id}  你的 ${user} ＝ 标答 ${showStd}`);
    } else {
      wrong += 1;
      results[puzzle.id] = 'wrong';
      if (!retry.includes(puzzle.id)) retry.push(puzzle.id);
      lines.push(`✗ ${puzzle.id}  你的 ${user} ≠ 标答 ${showStd} · 二刷`);
    }
  }
  const total = (puzzles || []).length;
  const header = `批改结果 · 对 ${correct} · 错 ${wrong} · 未答 ${unanswered}`
    + (oral ? ` · 口述 ${oral}` : '')
    + ` · 二刷 ${retry.length} · 共 ${total}`;
  return {
    results,
    retryIds: retry,
    correct,
    wrong,
    unanswered,
    oral,
    total,
    retry: retry.length,
    lines,
    text: `${header}\n${lines.join('\n')}`,
  };
}

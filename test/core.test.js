import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, exportState, importState, loadState, migrateState, saveState, removeGameFromState, KEY, LEGACY_KEYS, KILL_ANSWERS_KEY, KILL_RETRY_KEY } from '../src/store.js';
import { applyMoveChecked, boardToFen, genCaptures, longestCaptures, numOf, parseFen, playInteractiveStep, positionFromFen, positionToBoard, rowCol, START_FEN } from '../src/draughts/board.js';
import { parsePdnOrMoves, gameFieldsFromPdn, normalizePdnDate } from '../src/draughts/pdn.js';
import { scanCounterNodes } from '../src/draughts/scan.js';
import { WEAPON_CHAPTERS, weaponStats } from '../src/weapons.js';
import { LOCK_FLOAT_LINES } from '../src/lockFloat.js';
import { KILL_DRAFTS, OTB_GAMES, REVIEW_ROWS } from '../src/content/pack.js';
import { targetSquares } from '../src/kill/line.js';
import { gradeAttempt, parseAnswerLine, playableSolverMoves, repliesAfter } from '../src/kill/line.js';
import { gradeBank, recordAttempt } from '../src/kill/grade.js';
import { visibleProblems } from '../src/pages/problems.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

test('棋盘编号往返映射与初始局面', () => {
  for (let n = 1; n <= 50; n += 1) assert.equal(numOf(rowCol(n)), n);
  const { board, turn } = parseFen(START_FEN);
  assert.equal(turn, 'B');
  assert.deepEqual(board.slice(1, 21).filter(Boolean).map((p) => p.color), Array(20).fill('B'));
  assert.deepEqual(board.slice(31, 51).filter(Boolean).map((p) => p.color), Array(20).fill('W'));
});

test('PDN 解析标签、黑先/白先推导并跳过结果与注释', () => {
  const black = parsePdnOrMoves('[Event "R1"]\n[Result "1-1"]\n1. 8-13 32-28 {note} 24x33x22 1-1');
  assert.deepEqual(black.moves, ['8-13', '32-28', '24x33x22']);
  assert.equal(black.headers.Event, 'R1');
  assert.equal(black.firstColor, 'B');

  const white = parsePdnOrMoves('1... 32-28 $1 (8-13) 16x27 2-0');
  assert.deepEqual(white.moves, ['32-28', '16x27']);
  assert.equal(white.firstColor, 'W');
});

const YOUTH_R9_PDN = `[Event "青少赛R9王秉正"]
[Site "天津"]
[Round "9"]
[Date "2026-08-29"]
[Gametype "100"]
[White "王秉正"]
[Black "王植"]
[Result "1:1"]

1. 32-28 18-23 2. 33-29 23x32 3. 37x28 19-23 4. 28x19 13x24x33 5. 39x28 14-19 6. 41-37 10-14 7. 34-30 5-10 8. 30-25 9-13 9. 37-32 4-9 10. 44-39 17-22 11. 28x17 12x21 12. 31-26 7-12 13. 26x17 12x21 14. 50-44 8-12 15. 40-34 2-8 16. 34-30 1-7 17. 44-40 11-17 18. 46-41 7-11 19. 41-37 12-18 20. 39-34 8-12 21. 34-29 20-24 22. 29x20 15x24 23. 49-44 10-15 24. 44-39 18-23 25. 25-20 14x25x34 26. 40x29x18x7 11x2 27. 39-33 24-30 28. 35x24 19x30 29. 32-28 15-20 30. 37-31 20-25 31. 31-26 17-22 32. 26x17 22x11 33. 38-32 11-17 34. 42-38 2-8 35. 47-42 9-14 36. 43-39 14-19 37. 39-34 30x39 38. 33x44 19-23 39. 28x19 13x24 40. 32-28 8-13 41. 28-23 16-21 42. 23-19 25-30 43. 19x8 3x12 44. 38-32 12-18 45. 32-28 6-11 46. 42-38 11-16 47. 44-39 21-26 48. 38-32 17-21 49. 39-33 21-27 50. 32x21 26x17 51. 48-43 18-23 52. 28x19 24x13 53. 45-40
`;

test('青少赛 PDN 自动提取标题、执黑、和棋与连吃着法', () => {
  const fields = gameFieldsFromPdn(YOUTH_R9_PDN);
  assert.equal(fields.headers.Event, '青少赛R9王秉正');
  assert.equal(fields.title, '青少赛R9王秉正');
  assert.equal(fields.date, '2026-08-29');
  assert.equal(fields.site, '天津');
  assert.equal(fields.opponent, '王秉正');
  assert.equal(fields.color, '黑');
  assert.equal(fields.colorDetected, true);
  assert.equal(fields.result, '和');
  assert.equal(fields.source, '天津');
  assert.match(fields.notes, /第9轮/);
  assert.match(fields.notes, /白 王秉正 vs 黑 王植/);
  assert.equal(fields.moves[0], '32-28');
  assert.equal(fields.moves[1], '18-23');
  assert.ok(fields.moves.includes('13x24x33'));
  assert.ok(fields.moves.includes('40x29x18x7'));
  assert.equal(fields.moves.at(-1), '45-40');
  assert.equal(fields.moves.length, 105);
  assert.equal(fields.firstColor, 'W');
  assert.equal(fields.warnings.length, 0);
});

test('PDN 结果与日期按王植视角映射', () => {
  const loss = gameFieldsFromPdn('[White "王植"]\n[Black "对手"]\n[Result "0-2"]\n[Date "29.08.2026"]\n1. 32-28 18-23');
  assert.equal(loss.color, '白');
  assert.equal(loss.result, '负');
  assert.equal(loss.date, '2026-08-29');
  assert.equal(normalizePdnDate('2026.08.29'), '2026-08-29');

  const win = gameFieldsFromPdn('[White "甲"]\n[Black "王植"]\n[Result "0:2"]\n1. 32-28 18-23');
  assert.equal(win.color, '黑');
  assert.equal(win.result, '胜');
});

test('旧 storage 键无损迁移到规范结构且幂等', () => {
  const old = { role: 'parent', games: [{ id: 'g1' }], reviews: [{ id: 'r1' }], leadLock: { attempts: 2 } };
  const storage = memoryStorage({ [LEGACY_KEYS[0]]: JSON.stringify(old) });
  const state = loadState(storage);
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.role, 'parent');
  assert.equal(state.games[0].id, 'g1');
  assert.equal(state.games.filter((game) => game.origin === 'otb-review').length, 15);
  assert.ok(state.problems.some((problem) => problem.id === 'K1' && problem.bank === 'kill' && problem.status === '草稿'));
  assert.equal(state.leadLock.attempts, 2);
  assert.equal(state.metricLogs.length, 0);
  assert.equal(Object.keys(state.weaponProgress).length, 21);
  assert.ok(storage.dump()[KEY], '读取旧键时应写入规范键');
  assert.deepEqual(migrateState(state), state);
  saveState(state, storage);
  assert.ok(storage.dump()[KEY]);
  assert.ok(storage.dump()[LEGACY_KEYS[0]]);
});

test('JSON 导出与合并/替换导入保留自定义数据', () => {
  const current = { ...defaultState(), games: [{ id: 'old' }], customLevels: [{ id: 'level-1', title: '旧题' }] };
  const backup = exportState({ ...current, games: [{ id: 'new' }], customLevels: [{ id: 'level-2' }] });
  const merged = importState(backup, current, 'merge');
  assert.ok(merged.games.some((game) => game.id === 'old'));
  assert.ok(merged.games.some((game) => game.id === 'new'));
  assert.equal(merged.games.filter((game) => game.origin === 'otb-review').length, 15);
  assert.deepEqual(merged.customLevels.map((x) => x.id), ['level-1', 'level-2']);
  const replaced = importState(backup, current, 'replace');
  assert.equal(replaced.games.some((game) => game.id === 'new'), true);
  assert.equal(replaced.games.some((game) => game.id === 'old'), false);
  assert.equal(replaced.schemaVersion, 4);
});

test('导出包含 metricLogs 与武器库字段且合并导入不丢', () => {
  const current = { ...defaultState(), metricLogs: [{ id: 'm1', counterAfterCombo: '0', leadHeld: 'na', kingFirstSafe: 'yes', planScore: '2', date: '2026-09-05', source: 'lidraughts' }] };
  const backup = exportState({
    ...current,
    metricLogs: [{ id: 'm2', counterAfterCombo: '2plus', leadHeld: 'held_win', kingFirstSafe: 'no', planScore: '3', date: '2026-09-04', source: 'otb' }],
    weaponStars: [{ id: 's1', chapterId: 'w01', markedAt: 1, source: 'external', cleared: false }],
    weaponProgress: { w01: 'done' },
  });
  assert.match(backup, /"metricLogs"/);
  assert.match(backup, /"weaponProgress"/);
  assert.match(backup, /"weaponStars"/);
  const merged = importState(backup, current, 'merge');
  assert.deepEqual(merged.metricLogs.map((x) => x.id).sort(), ['m1', 'm2']);
  assert.equal(merged.weaponProgress.w01, 'done');
  assert.equal(merged.weaponStars[0].id, 's1');
});

test('武器库固定 21 章且红星统计不含已清除项', () => {
  assert.equal(WEAPON_CHAPTERS.length, 21);
  assert.equal(WEAPON_CHAPTERS[0].id, 'w01');
  assert.equal(WEAPON_CHAPTERS[20].id, 'w21');
  const stats = weaponStats({
    weaponProgress: { w01: 'done', w02: 'done' },
    weaponStars: [
      { id: 'a', cleared: false, markedAt: 1 },
      { id: 'b', cleared: true, clearedAt: Date.now(), markedAt: 1 },
    ],
  });
  assert.equal(stats.chaptersDone, 2);
  assert.equal(stats.starsOpen, 1);
  assert.equal(stats.chapterTotal, 21);
});

test('锁住浮动卡三行文案与 SPEC 一致且不改 leadLock', () => {
  assert.deepEqual(
    LOCK_FLOAT_LINES.map((l) => `${l.title}：${l.body}`),
    [
      '查反击：对手现在唯一能反击的线/子在哪里？先把它封死或兑掉！',
      '做简化：能不能用最安全的 1 换 1 把局面缩小？能就换！',
      '停设饵：现在优势在手，坚决不送饵、不打风险组合！',
    ]
  );
  const before = defaultState().leadLock;
  assert.equal(before.attempts, 0);
});

test('删除棋谱时一并去掉相关草稿题与今日指定', () => {
  const state = {
    ...defaultState(),
    games: [{ id: 'g1' }, { id: 'g2' }],
    problems: [{ id: 'p1', gameId: 'g1' }, { id: 'p2', gameId: 'g2' }],
    customLevels: [{ id: 'p1', gameId: 'g1' }],
    imports: [{ id: 'i1', gameId: 'g1' }],
    publishedTodayId: 'p1',
  };
  const next = removeGameFromState(state, 'g1');
  assert.equal(next.games.some((game) => game.id === 'g1'), false);
  assert.equal(next.games.some((game) => game.id === 'g2'), true);
  assert.equal(next.problems.some((problem) => problem.id === 'p1'), false);
  assert.equal(next.problems.some((problem) => problem.id === 'p2'), true);
  assert.equal(next.customLevels.length, 0);
  assert.equal(next.imports.length, 0);
  assert.equal(next.publishedTodayId, null);
});

test('严格局面演算覆盖实战向量与升王', () => {
  const start = positionFromFen();
  assert.equal(applyMoveChecked({ W: [], B: [8], WK: [], BK: [], sideToMove: 'B' }, '8-13', 'B').ok, true);
  assert.equal(applyMoveChecked({ W: [32], B: [], WK: [], BK: [], sideToMove: 'W' }, '32-28', 'W').ok, true);
  assert.equal(applyMoveChecked({ W: [32], B: [], WK: [], BK: [], sideToMove: 'W' }, '32-23', 'W').ok, false);

  const turn = { W: [24], B: [28, 29], WK: [], BK: [], sideToMove: 'W' };
  const turnResult = applyMoveChecked(turn, '24x33x22', 'W');
  assert.equal(turnResult.ok, true);
  assert.deepEqual(turnResult.position.W, [22]);
  assert.equal(turnResult.position.B.length, 0);

  const straight = { W: [32], B: [10, 19, 28], WK: [], BK: [], sideToMove: 'W' };
  assert.deepEqual(longestCaptures(straight, 'W'), [[32, 23, 14, 5]]);
  const promoted = applyMoveChecked(straight, '32x23x14x5', 'W');
  assert.equal(promoted.ok, true);
  assert.deepEqual(promoted.position.WK, [5]);

  const two = { W: [14], B: [20, 30], WK: [], BK: [], sideToMove: 'W' };
  assert.deepEqual(genCaptures(two, 'W'), [[14, 25, 34]]);

  const forced = { W: [32], B: [28], WK: [], BK: [], sideToMove: 'W' };
  assert.equal(applyMoveChecked(forced, '32-27', 'W').ok, false);

  const kingMove = { W: [], B: [], WK: [27], BK: [], sideToMove: 'W' };
  assert.equal(applyMoveChecked(kingMove, '27-49', 'W').ok, true);
  const kingCapture = { W: [], B: [38], WK: [27], BK: [], sideToMove: 'W' };
  assert.equal(applyMoveChecked(kingCapture, '27x49', 'W').ok, true);

  const promotion = { W: [14], B: [10], WK: [], BK: [], sideToMove: 'W' };
  const promotedOne = applyMoveChecked(promotion, '14x5', 'W');
  assert.equal(promotedOne.ok, true);
  assert.deepEqual(promotedOne.position.WK, [5]);

  const quietPromotion = applyMoveChecked({ W: [9], B: [], WK: [], BK: [], sideToMove: 'W' }, '9-4', 'W');
  assert.equal(quietPromotion.ok, true);
  assert.deepEqual(quietPromotion.position.WK, [4]);
  assert.equal(applyMoveChecked(quietPromotion.position, '4-10', 'W').ok, true);
});

test('反打扫描识别 A/B 节点并给出最长答案线', () => {
  const bNodePos = { W: [32], B: [10, 19, 28], WK: [], BK: [], sideToMove: 'W' };
  const b = scanCounterNodes({ moves: ['32x23x14x5'], firstColor: 'W' }, boardToFen(positionToBoard(bNodePos), 'W'));
  assert.equal(b.nodes[0].type, 'B');
  assert.deepEqual(b.nodes[0].answers[0], [32, 23, 14, 5]);

  const aNodePos = { W: [29, 32], B: [24, 28], WK: [], BK: [], sideToMove: 'B' };
  const a = scanCounterNodes({ moves: ['24x33', '32x23'], firstColor: 'B' }, boardToFen(positionToBoard(aNodePos), 'B'));
  assert.ok(a.nodes.some((node) => node.type === 'A'));
  assert.equal(a.warnings.length, 0);
});

test('OTB 复盘棋谱进入同一资料库且跳过没有 PDN 的对局', () => {
  assert.equal(OTB_GAMES.length, 15);
  assert.equal(REVIEW_ROWS.length, 21);
  assert.equal(REVIEW_ROWS.filter((row) => row.gameId).length, 15);
  assert.equal(OTB_GAMES.some((game) => game.folder === '2026-08-25-丁牧一'), false);
  assert.ok(OTB_GAMES.every((game) => game.origin === 'otb-review' && game.moves.length > 0 && game.pdn.includes('[White')));
  const zhang = OTB_GAMES.find((game) => game.id === 'otb_2026-07-09-张立');
  assert.equal(zhang.opponent, '张立');
  assert.equal(zhang.color, '黑');
  assert.equal(zhang.moves[0], '32-28');
  const state = migrateState({ games: [{ id: 'keep' }], problems: [{ id: 'local-draft', status: '草稿' }] });
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.games[0].id, 'keep');
  assert.equal(state.games.filter((game) => game.origin === 'otb-review').length, 15);
  assert.equal(state.problems.filter((problem) => problem.bank === 'kill').length, 234);
  assert.equal(state.problems[0].id, 'local-draft');
  const again = migrateState(state);
  assert.equal(again.games.length, state.games.length);
  assert.equal(again.problems.length, state.problems.length);
  const removed = migrateState({
    ...again,
    games: again.games.filter((game) => game.id !== 'otb_2026-07-09-张立'),
  });
  assert.equal(removed.games.some((game) => game.id === 'otb_2026-07-09-张立'), false);
});

test('234 道杀棋以草稿进入题库，答案可走通', () => {
  assert.equal(KILL_DRAFTS.length, 234);
  assert.deepEqual(
    [...new Set(KILL_DRAFTS.map((puzzle) => puzzle.level))].sort(),
    ['一步杀', '三步杀', '二步杀']
  );
  assert.ok(KILL_DRAFTS.every((puzzle) => puzzle.status === '草稿' && puzzle.bank === 'kill' && !puzzle.publishDate));
  const counts = { K: 0, E: 0, S: 0 };
  for (const puzzle of KILL_DRAFTS) counts[puzzle.prefix] += 1;
  assert.deepEqual(counts, { K: 125, E: 68, S: 41 });
  for (const puzzle of KILL_DRAFTS) {
    const moves = playableSolverMoves(puzzle);
    assert.equal(moves[0], puzzle.answer, puzzle.id);
    assert.ok(puzzle.fen.startsWith(puzzle.side === 'w' ? 'W:' : 'B:'), puzzle.id);
  }
  const line = parseAnswerLine('18-22; (白强制 27x18x9x20); 15x24x35x44', '18-22');
  assert.deepEqual(line.map((step) => step.by), ['solver', 'reply', 'solver']);
  const k115 = KILL_DRAFTS.find((puzzle) => puzzle.id === 'K115');
  assert.match(`${k115.hint} ${k115.point} ${k115.note}`, /过底线但未落底不成王/);
  assert.equal(k115.answer, '20x29x38x49');
  const e1 = KILL_DRAFTS.find((puzzle) => puzzle.id === 'E1');
  assert.deepEqual(repliesAfter(e1, ['18-22']), ['27x18x9x20']);
  assert.equal(gradeAttempt(e1, []).status, 'empty');
  assert.equal(gradeAttempt(e1, ['18-22']).status, 'partial');
  assert.equal(gradeAttempt(e1, ['18-22', '15x24x35x44']).status, 'full');
  assert.equal(gradeAttempt(e1, ['18-23']).status, 'miss');
  const guard = parseAnswerLine('33-28（防 13-19）', '33-28');
  assert.deepEqual(guard, [{ by: 'solver', move: '33-28' }]);

  const state = {
    role: 'child',
    problems: [
      { id: 'published', status: '已发布', bank: 'kill' },
      { id: 'K1', status: '草稿', bank: 'kill' },
      { id: 'counter', status: '草稿' },
    ],
  };
  assert.deepEqual(visibleProblems(state, '全部').map((problem) => problem.id), ['published', 'counter']);
  assert.deepEqual(visibleProblems({ ...state, role: 'parent' }, '杀棋').map((problem) => problem.id), ['published', 'K1']);
});

test('K1 走子拒绝非吃、反向和走错棋子，并接受合法答案', () => {
  const puzzle = KILL_DRAFTS.find((item) => item.id === 'K1');
  const start = positionFromFen(puzzle.fen);
  assert.equal(start.sideToMove, 'B');
  assert.deepEqual(targetSquares(start, 35), [44]);

  const quiet = playInteractiveStep(start, 18, 23);
  assert.equal(quiet.ok, false);
  assert.equal(quiet.position, start);
  assert.match(quiet.error, /必须先吃/);

  const backward = playInteractiveStep(start, 35, 30);
  assert.equal(backward.ok, false);
  assert.equal(backward.position, start);

  const wrongPiece = playInteractiveStep(start, 40, 34);
  assert.equal(wrongPiece.ok, false);
  assert.equal(wrongPiece.position, start);
  assert.match(wrongPiece.error, /该走的一方/);

  const sameSquare = playInteractiveStep(start, 35, 35);
  assert.equal(sameSquare.ok, false);
  assert.equal(sameSquare.position, start);

  const legal = playInteractiveStep(start, 35, 44);
  assert.equal(legal.ok, true);
  assert.equal(legal.finished, true);
  assert.equal(legal.move, '35x44');
  assert.equal(legal.chain, null);
  assert.ok(legal.position.B.includes(44));
  assert.equal(legal.position.B.includes(35), false);
  assert.equal(legal.position.WK.includes(40), false);
  assert.equal(legal.position.sideToMove, 'W');
  const checked = applyMoveChecked(start, puzzle.answer, 'B');
  assert.equal(checked.ok, true);
  assert.deepEqual(legal.position, checked.position);

  const chainPuzzle = KILL_DRAFTS.find((item) => item.id === 'K6');
  let pos = positionFromFen(chainPuzzle.fen);
  const skip = playInteractiveStep(pos, 11, 24);
  assert.equal(skip.ok, false);
  assert.equal(skip.position, pos);
  assert.match(skip.error, /不能一次跳到终点/);
  assert.deepEqual(targetSquares(pos, 11), [22]);

  const first = playInteractiveStep(pos, 11, 22);
  assert.equal(first.ok, true);
  assert.equal(first.finished, false);
  assert.equal(first.chain.from, 22);
  assert.ok(first.position.B.includes(22));
  assert.equal(first.position.B.includes(24), false);
  assert.equal(first.position.sideToMove, 'B');
  const otherPiece = playInteractiveStep(first.position, 18, 23, first.chain);
  assert.equal(otherPiece.ok, false);
  assert.equal(otherPiece.position, first.position);

  const second = playInteractiveStep(first.position, 22, 33, first.chain);
  assert.equal(second.ok, true);
  assert.equal(second.finished, false);
  const end = playInteractiveStep(second.position, 33, 24, second.chain);
  assert.equal(end.ok, true);
  assert.equal(end.finished, true);
  assert.equal(end.move, '11x22x33x24');
  const whole = applyMoveChecked(pos, '11x22x33x24', 'B');
  assert.deepEqual(end.position, whole.position);
});

test('FMJD：连吃过底线仍是兵，只有落在升王线才成王', () => {
  const via = { W: [11], B: [7, 8], WK: [], BK: [], sideToMove: 'W' };
  assert.ok(genCaptures(via, 'W').some((path) => path.join('x') === '11x2x13'));
  const russian = { W: [11], B: [7, 13], WK: [], BK: [], sideToMove: 'W' };
  assert.equal(genCaptures(russian, 'W').some((path) => path.length >= 3), false);

  const first = playInteractiveStep(via, 11, 2);
  assert.equal(first.ok, true);
  assert.equal(first.finished, false);
  assert.ok(first.position.W.includes(2));
  assert.equal(first.position.WK.includes(2), false);
  assert.equal(first.chain.king, false);

  const off = playInteractiveStep(first.position, 2, 13, first.chain);
  assert.equal(off.ok, true);
  assert.equal(off.finished, true);
  assert.equal(off.move, '11x2x13');
  assert.ok(off.position.W.includes(13));
  assert.equal(off.position.WK.length, 0);
  assert.equal(off.position.B.includes(7), false);
  assert.equal(off.position.B.includes(8), false);

  const on = applyMoveChecked({ W: [11], B: [7], WK: [], BK: [], sideToMove: 'W' }, '11x2', 'W');
  assert.equal(on.ok, true);
  assert.deepEqual(on.position.WK, [2]);
  assert.equal(on.position.W.length, 0);
});

test('批改把错题放进二刷，做对才移出', () => {
  const puzzles = [
    { id: 'K1', answer: '35x44', answerLine: '35x44' },
    { id: 'K2', answer: '33-28', answerLine: '33-28' },
    { id: 'E1', answer: '18-22', answerLine: '18-22; 27x18' },
  ];
  const unanswered = gradeBank(puzzles, {}, []);
  assert.deepEqual(unanswered.retryIds, []);
  assert.equal(unanswered.unanswered, 3);

  const wrong = gradeBank(puzzles, { K1: '35x44', K2: '33-29' }, []);
  assert.deepEqual(wrong.retryIds, ['K2']);
  assert.equal(wrong.correct, 1);
  assert.equal(wrong.wrong, 1);
  assert.equal(wrong.results.K1, 'correct');
  assert.equal(wrong.results.K2, 'wrong');

  const still = gradeBank(puzzles, { K1: '35x44', K2: '32-28' }, ['K2']);
  assert.deepEqual(still.retryIds, ['K2']);

  const fixed = gradeBank(puzzles, { K1: '35x44', K2: '33-28' }, ['K2', 'E1']);
  assert.deepEqual(fixed.retryIds, ['E1']);

  const submitted = recordAttempt(puzzles[1], '33-29', {}, []);
  assert.deepEqual(submitted.retryIds, ['K2']);
  assert.match(submitted.extra, /二刷/);
  const corrected = recordAttempt(puzzles[1], '33-28', submitted.answers, submitted.retryIds);
  assert.deepEqual(corrected.retryIds, []);
  assert.match(corrected.extra, /订正/);
  const again = recordAttempt(puzzles[1], '32-28', corrected.answers, ['K2']);
  assert.deepEqual(again.retryIds, ['K2']);
  assert.match(again.extra, /二刷/);
});

test('杀棋答案与二刷从旧键迁入且不覆盖已有答案', () => {
  const storage = memoryStorage({
    [KEY]: JSON.stringify({ schemaVersion: 3, games: [{ id: 'keep' }], problems: [], killAnswers: { K1: '35x44' }, killRetry: ['E1'] }),
    [KILL_ANSWERS_KEY]: JSON.stringify({ K1: '99-99', K2: '33-28' }),
    [KILL_RETRY_KEY]: JSON.stringify(['E1', 'K9']),
  });
  const state = loadState(storage);
  assert.equal(state.killAnswers.K1, '35x44');
  assert.equal(state.killAnswers.K2, '33-28');
  assert.deepEqual(state.killRetry, ['E1', 'K9']);
  assert.equal(state.schemaVersion, 4);
  state.killAnswers = { K3: '18-22' };
  state.killRetry = [];
  saveState(state, storage);
  assert.equal(JSON.parse(storage.dump()[KILL_ANSWERS_KEY]).K3, '18-22');
  assert.deepEqual(JSON.parse(storage.dump()[KILL_RETRY_KEY]), []);
  const again = loadState(storage);
  assert.equal(again.killAnswers.K3, '18-22');
  assert.equal(again.killAnswers.K1, undefined);
});

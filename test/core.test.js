import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, exportState, importState, loadState, migrateState, saveState, removeGameFromState, KEY, LEGACY_KEYS } from '../src/store.js';
import { applyMoveChecked, boardToFen, genCaptures, longestCaptures, numOf, parseFen, positionFromFen, positionToBoard, rowCol, START_FEN } from '../src/draughts/board.js';
import { parsePdnOrMoves, gameFieldsFromPdn, normalizePdnDate } from '../src/draughts/pdn.js';
import { scanCounterNodes } from '../src/draughts/scan.js';

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
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.role, 'parent');
  assert.equal(state.games[0].id, 'g1');
  assert.equal(state.leadLock.attempts, 2);
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
  assert.deepEqual(merged.games.map((x) => x.id), ['old', 'new']);
  assert.deepEqual(merged.customLevels.map((x) => x.id), ['level-1', 'level-2']);
  const replaced = importState(backup, current, 'replace');
  assert.deepEqual(replaced.games.map((x) => x.id), ['new']);
  assert.equal(replaced.schemaVersion, 1);
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
  assert.deepEqual(next.games.map((g) => g.id), ['g2']);
  assert.deepEqual(next.problems.map((p) => p.id), ['p2']);
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

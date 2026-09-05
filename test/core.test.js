import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, exportState, importState, loadState, migrateState, saveState, KEY, LEGACY_KEYS } from '../src/store.js';
import { applyMoveChecked, boardToFen, genCaptures, longestCaptures, numOf, parseFen, positionFromFen, positionToBoard, rowCol, START_FEN } from '../src/draughts/board.js';
import { parsePdnOrMoves } from '../src/draughts/pdn.js';
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

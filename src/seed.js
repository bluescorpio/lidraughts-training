import { uid } from './store.js';
import { START_FEN } from './draughts/board.js';

const GAME_ID = 'game_tianjin_youth';
const PLACEHOLDER_NOTE = '待补棋谱';

/** Six critical tags from「天津青少赛汇总」shell — move numbers are 手数 (ply-ish labels for parent). */
const CRITICAL = [
  { round: 'R1', moveLabel: '第24手前', moveIndex: 23, tag: '被反打', title: 'R1 · 第24手前 · 反打预警' },
  { round: 'R3', moveLabel: '第25手前', moveIndex: 24, tag: '被反打', title: 'R3 · 第25手前 · 反打预警' },
  { round: 'R6', moveLabel: '第22手后', moveIndex: 22, tag: '被反打', title: 'R6 · 第22手后 · 反打预警' },
  { round: 'R7', moveLabel: '第24手后', moveIndex: 24, tag: '被反打', title: 'R7 · 第24手后 · 反打预警' },
  { round: 'R8', moveLabel: '第32手前', moveIndex: 31, tag: '被反打', title: 'R8 · 第32手前 · 反打预警' },
  { round: 'R9', moveLabel: '第25手前', moveIndex: 24, tag: '被反打', title: 'R9 · 第25手前 · 反打预警' },
];

export function buildSeed() {
  const tags = CRITICAL.map((c, i) => ({
    id: uid('tag'),
    moveIndex: c.moveIndex,
    moveLabel: c.moveLabel,
    tag: c.tag,
    round: c.round,
    note: `${c.round} ${c.moveLabel}`,
  }));

  const game = {
    id: GAME_ID,
    title: '天津青少赛汇总',
    date: '2025-07-01',
    opponent: '青少赛对手（汇总壳）',
    color: '白',
    result: '和',
    source: '天津青少赛',
    notes: PLACEHOLDER_NOTE + '：本壳用于出题引用，完整 PDN 待补。',
    pdn: '',
    moves: [],
    startFen: START_FEN,
    tags,
    createdAt: Date.now(),
  };

  const problems = CRITICAL.map((c, i) => {
    const tag = tags[i];
    return {
      id: uid('prob'),
      title: c.title,
      type: '反打预警·正向',
      gameId: GAME_ID,
      gameTitle: game.title,
      moveNumber: c.moveIndex,
      moveLabel: c.moveLabel,
      tagId: tag.id,
      tag: c.tag,
      prompt: buildForwardCounterPrompt(c),
      answerNotes: '家长备注：补全局面后，标出对方可能的反打线路。',
      status: '草稿',
      fen: START_FEN,
      placeholder: true,
      createdAt: Date.now() + i,
      publishedAt: null,
      publishDate: null,
      completions: {}, // date -> { done: true, selfCheck: '对了'|'漏了', marks: [] }
    };
  });

  const weekPlan = defaultWeekPlan();

  return { games: [game], problems, reviews: [], weekPlan };
}

function buildForwardCounterPrompt(c) {
  return (
    `【反打预警·正向】来自「天津青少赛汇总」${c.round} ${c.moveLabel}（标记：被反打）。\n` +
    `请先想象：如果你刚走出一个漂亮的吃子/组合，对方会不会立刻反打？\n` +
    `任务：在棋盘上点出你担心的反打路线（可多点几格），想一想有没有更稳的走法。\n` +
    `（棋谱待补：当前为起始局面占位，家长可稍后粘贴 PDN 并更新题目。）`
  );
}

export function defaultWeekPlan() {
  return {
    items: [
      { id: 'mon', day: '周一', text: '反打预警练习 ×1', done: false },
      { id: 'tue', day: '周二', text: '锁住清单走一遍', done: false },
      { id: 'wed', day: '周三', text: '资料库复盘一局关键着法', done: false },
      { id: 'thu', day: '周四', text: '深推检查 / 出题草稿', done: false },
      { id: 'fri', day: '周五', text: '轻量对局 + 复盘本四项', done: false },
      { id: 'sat', day: '周六', text: '升王样板或好组合回顾', done: false },
      { id: 'sun', day: '周日', text: '休息或自由下棋（无指标）', done: false },
    ],
    note: '每周只做清单上的事，不必加量。',
  };
}

export function problemTemplatesForTag(tag) {
  if (tag === '被反打') {
    return [
      { type: '反打预警·正向', promptHint: '走出组合前，先找对方可能的反打。' },
      { type: '反打预警·逆向', promptHint: '假设对方刚吃完，你如何反打？' },
    ];
  }
  if (tag === '该锁住') {
    return [{ type: '锁住检查', promptHint: '查反击 / 做简化 / 停设饵，三步过一遍。' }];
  }
  if (tag === '深推无援') {
    return [{ type: '深推检查', promptHint: '这步再往前推，后面有没有援军？' }];
  }
  return [{ type: '自定义', promptHint: '根据标记写一句温和的提示。' }];
}

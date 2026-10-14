import { START_FEN } from '../draughts/board.js';
import { gameFieldsFromPdn } from '../draughts/pdn.js';
import { killFen, normalizeMove } from '../kill/line.js';
import { PACK } from './packData.js';

export const CONTENT_PACK_ID = 'otb-kill-2026-10';

const summaryByFolder = new Map((PACK.overview || []).map((row) => [row.folder, row.summary]));

export function otbGameFromPdn({ folder, pdn, summary = '' }) {
  const fields = gameFieldsFromPdn(pdn);
  const event = fields.title || '';
  const generic = !event || event === '智赛网' || /国跳对战/.test(event);
  const title = generic ? `${fields.date || String(folder).slice(0, 10)} · ${fields.opponent || folder}` : event;
  return {
    id: `otb_${folder}`,
    folder,
    origin: 'otb-review',
    title,
    date: fields.date || String(folder).slice(0, 10),
    opponent: fields.opponent || '',
    color: fields.color || '白',
    result: fields.result || '和',
    source: fields.source || 'OTB',
    notes: [fields.notes, summary, `文件夹 ${folder}`, 'OTB 复盘棋谱'].filter(Boolean).join(' · '),
    pdn,
    startFen: START_FEN,
    moves: fields.moves,
    parseWarnings: fields.warnings,
    white: fields.white || '',
    black: fields.black || '',
    tags: [],
    createdAt: 0,
  };
}

export function killPuzzleToDraft(item) {
  const level = item.level || '';
  const answerLine = item.answer_line || item.answerLine || item.answer || '';
  return {
    id: item.id,
    bank: 'kill',
    killId: item.id,
    prefix: String(item.id || '')[0] || '',
    level,
    side: item.side === 'w' ? 'w' : 'b',
    title: item.title || item.id,
    type: `杀棋·${level}`,
    tag: '杀棋',
    gameId: null,
    gameTitle: item.source || '',
    source: item.source || '',
    prompt: item.hint || '',
    hint: item.hint || '',
    point: item.point || '',
    note: item.note || '',
    answer: normalizeMove(item.answer),
    answerLine,
    answerNotes: [`参考着法：${answerLine}`, item.point, item.note].filter(Boolean).join('\n'),
    status: '草稿',
    fen: item.fen || killFen(item),
    white: [...(item.white || [])],
    black: [...(item.black || [])],
    kings: [...(item.kings || [])],
    placeholder: false,
    createdAt: 0,
    publishedAt: null,
    publishDate: null,
    completions: {},
    scanBest: item.scan_best || item.scanBest || null,
    pv: item.pv || null,
    gameRef: item.game || item.gameRef || null,
    ply: item.ply ?? null,
  };
}

export const OTB_GAMES = (PACK.index || [])
  .filter((row) => row.pdn && PACK.pdns?.[row.folder])
  .map((row) => otbGameFromPdn({
    folder: row.folder,
    pdn: PACK.pdns[row.folder],
    summary: summaryByFolder.get(row.folder) || '',
  }));

export const KILL_DRAFTS = (PACK.puzzles || []).map(killPuzzleToDraft);

export const REVIEW_ROWS = (PACK.overview || []).map((row) => ({
  date: row.date,
  opponent: row.opponent,
  result: row.result,
  summary: row.summary,
  folder: row.folder,
  gameId: row.pdn ? `otb_${row.folder}` : null,
}));

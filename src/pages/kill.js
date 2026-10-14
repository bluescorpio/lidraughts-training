import { mountBoard } from '../draughts/BoardView.js';
import { applyMoveChecked, playInteractiveStep, positionFromFen, positionToBoard } from '../draughts/board.js';
import { KILL_DRAFTS } from '../content/pack.js';
import {
  gradeAttempt,
  normalizeMove,
  repliesAfter,
  targetSquares,
} from '../kill/line.js';

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'K', label: '一步 K' },
  { id: 'E', label: '二步 E' },
  { id: 'S', label: '三步 S' },
];

export function killPuzzlesOf(state) {
  const fromState = (state?.problems || []).filter((problem) => problem.bank === 'kill');
  return fromState.length ? fromState : KILL_DRAFTS;
}

export function renderKill(root, ctx) {
  const { state, save, navigate } = ctx;
  const puzzles = killPuzzlesOf(state);
  const filter = FILTERS.some((item) => item.id === ctx.params?.filter) ? ctx.params.filter : 'all';
  const filtered = puzzles.filter((puzzle) => filter === 'all' || puzzle.prefix === filter || String(puzzle.id || '')[0] === filter);
  let index = filtered.findIndex((puzzle) => puzzle.id === ctx.params?.killId);
  if (index < 0) index = 0;
  const puzzle = filtered[index];

  if (!puzzle) {
    root.innerHTML = `
      <section class="card">
        <h2>杀棋专练</h2>
        <p class="empty-title">这一组还没有题目</p>
        <p class="muted">可以换一个筛选，或者让家长在题库里看杀棋草稿。</p>
      </section>`;
    return;
  }

  const solved = new Set(state.killSolved || []);
  let navOpen = Boolean(ctx.params?.navOpen);
  let pos = positionFromFen(puzzle.fen);
  let past = [];
  let attempt = [];
  let revealed = false;
  let selected = null;
  let chain = null;

  root.innerHTML = `
    <section class="card kill-page">
      <h2>杀棋专练</h2>
      <p class="muted">一次看一题。只走斜线；有吃子时必须吃，连吃要接着走同一颗子。</p>
      <div class="filter-row" id="kill-filters">
        ${FILTERS.map((item) => {
          const count = item.id === 'all' ? puzzles.length : puzzles.filter((puzzle) => (puzzle.prefix || puzzle.id[0]) === item.id).length;
          return `<button type="button" class="btn ${filter === item.id ? 'primary' : ''}" data-filter="${item.id}">${item.label} ${count}</button>`;
        }).join('')}
      </div>
      <div class="row-between wrap">
        <button type="button" class="btn" id="kill-toggle" aria-expanded="${navOpen ? 'true' : 'false'}">题号</button>
        <span class="muted">${esc(puzzle.id)} · ${index + 1} / ${filtered.length}</span>
      </div>
      <div class="kill-nav ${navOpen ? 'open' : ''}" id="kill-nav">
        ${filtered.map((item) => `
          <button type="button" class="kill-id ${item.id === puzzle.id ? 'active' : ''} ${solved.has(item.id) ? 'done' : ''}" data-kid="${escAttr(item.id)}">${esc(item.id)}</button>
        `).join('')}
      </div>
      <div class="badge">${esc(puzzle.level || puzzle.type)} · ${puzzle.side === 'w' ? '白先' : '黑先'}</div>
      <h3>${esc(puzzle.title)}</h3>
      <p class="hint">${esc(puzzle.hint || puzzle.prompt || '')}</p>
      ${puzzle.source ? `<p class="muted small">来源：${esc(puzzle.source)}</p>` : ''}
      <p class="muted small" id="kill-turn"></p>
      <div id="kill-board"></div>
      <p>你的着法：<strong id="kill-moves">还没走</strong></p>
      <p id="kill-msg" class="muted" aria-live="polite"></p>
      <div class="actions-row">
        <button type="button" class="btn" id="kill-undo">撤销</button>
        <button type="button" class="btn" id="kill-reset">重置</button>
        <button type="button" class="btn primary" id="kill-check">核对</button>
        <button type="button" class="btn" id="kill-reveal">看答案</button>
      </div>
      <div class="actions-row">
        <button type="button" class="btn" id="kill-prev" ${index <= 0 ? 'disabled' : ''}>上一题</button>
        <button type="button" class="btn" id="kill-next" ${index >= filtered.length - 1 ? 'disabled' : ''}>下一题</button>
      </div>
      <div id="kill-answer" class="answer-notes hidden"></div>
      ${
        state.role === 'parent'
          ? `<p class="muted small">这些题在题库里是草稿。发布到「今天」仍然每天最多 1 道。</p>
             <button type="button" class="btn" id="kill-to-bank">在题库里打开这题</button>`
          : ''
      }
    </section>
  `;

  const boardApi = mountBoard(root.querySelector('#kill-board'), {
    board: positionToBoard(pos),
    interactive: true,
    onSquare: onSquare,
  });

  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.onclick = () => navigate('kill', { filter: btn.dataset.filter, navOpen });
  });
  root.querySelector('#kill-toggle').onclick = () => {
    navOpen = !navOpen;
    root.querySelector('#kill-nav').classList.toggle('open', navOpen);
    root.querySelector('#kill-toggle').setAttribute('aria-expanded', navOpen ? 'true' : 'false');
  };
  root.querySelectorAll('[data-kid]').forEach((btn) => {
    btn.onclick = () => navigate('kill', { filter, killId: btn.dataset.kid, navOpen: true });
  });
  root.querySelector('#kill-prev').onclick = () => go(index - 1);
  root.querySelector('#kill-next').onclick = () => go(index + 1);
  root.querySelector('#kill-undo').onclick = () => {
    const prev = past.pop();
    if (!prev) return;
    pos = prev.pos;
    attempt = prev.attempt;
    chain = prev.chain;
    selected = prev.selected;
    paint('已回到上一步。');
  };
  root.querySelector('#kill-reset').onclick = () => {
    pos = positionFromFen(puzzle.fen);
    past = [];
    attempt = [];
    chain = null;
    selected = null;
    revealed = false;
    root.querySelector('#kill-answer').classList.add('hidden');
    paint('局面已重置。');
  };
  root.querySelector('#kill-check').onclick = () => {
    const grade = gradeAttempt(puzzle, solverMoves());
    paint(messageFor(grade));
    if (grade.status === 'full') markSolved();
  };
  root.querySelector('#kill-reveal').onclick = () => {
    revealed = !revealed;
    const box = root.querySelector('#kill-answer');
    if (!revealed) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `
      <p><strong>参考着法</strong> ${esc(puzzle.answer || '')}</p>
      <p>${esc(puzzle.answerLine || '')}</p>
      ${puzzle.point ? `<p>${esc(puzzle.point)}</p>` : ''}
      ${puzzle.note ? `<p class="muted">${esc(puzzle.note)}</p>` : ''}
    `;
  };
  root.querySelector('#kill-to-bank')?.addEventListener('click', () => {
    navigate('problems', { problemId: puzzle.id, status: '杀棋' });
  });

  paint('');

  function go(nextIndex) {
    const next = filtered[nextIndex];
    if (!next) return;
    navigate('kill', { filter, killId: next.id, navOpen });
  }

  function solverMoves() {
    const side = puzzle.side === 'w' ? 'W' : 'B';
    return attempt.filter((step) => step.side === side && !step.auto).map((step) => step.move);
  }

  function onSquare(sq, piece) {
    const mover = chain?.color || pos.sideToMove;
    if (chain && sq === chain.from) {
      selected = chain.from;
      paint('这颗子还要继续吃。');
      return;
    }
    if (chain && piece && piece.color === mover) {
      paint('这颗子还要继续吃。');
      return;
    }
    if (!chain && piece && piece.color === mover) {
      selected = sq;
      paint('');
      return;
    }
    if (!chain && !selected) {
      paint('先点该走一方的棋子。');
      return;
    }
    const from = chain ? chain.from : selected;
    const step = playInteractiveStep(pos, from, sq, chain);
    if (!step.ok) {
      paint(step.error);
      return;
    }
    past.push({ pos, attempt, chain, selected });
    pos = step.position;
    chain = step.chain;
    selected = chain ? chain.from : null;
    if (!step.finished) {
      paint('还要继续吃，请接着走这颗子。');
      return;
    }
    let nextAttempt = [...attempt, { move: normalizeMove(step.move), side: mover, auto: false }];
    let note = '';
    const replies = repliesAfter(
      puzzle,
      nextAttempt.filter((item) => item.side === (puzzle.side === 'w' ? 'W' : 'B') && !item.auto).map((item) => item.move),
    );
    for (const reply of replies) {
      const replySide = pos.sideToMove;
      const replyResult = applyMoveChecked(pos, reply, replySide);
      if (!replyResult.ok) break;
      nextAttempt.push({ move: normalizeMove(reply), side: replySide, auto: true });
      pos = replyResult.position;
      note = '对方的应着已经摆上。';
    }
    attempt = nextAttempt;
    const grade = gradeAttempt(puzzle, solverMoves());
    if (grade.status === 'full') markSolved();
    paint(grade.status === 'full' ? messageFor(grade) : note);
  }

  function markSolved() {
    if (!state.killSolved) state.killSolved = [];
    if (!state.killSolved.includes(puzzle.id)) {
      state.killSolved.push(puzzle.id);
      save();
    }
    root.querySelector(`[data-kid="${CSS.escape(puzzle.id)}"]`)?.classList.add('done');
  }

  function paint(text) {
    const focus = chain ? chain.from : selected;
    boardApi.setBoard(positionToBoard(pos));
    boardApi.setSelected(focus);
    boardApi.setHighlights(focus ? targetSquares(pos, focus, chain) : []);
    const turn = root.querySelector('#kill-turn');
    if (chain) turn.textContent = '还要继续吃，请接着走这颗子。';
    else turn.textContent = pos.sideToMove === 'W' ? '现在轮到白棋。' : '现在轮到黑棋。';
    const moves = root.querySelector('#kill-moves');
    const partial = chain ? `${chain.squares.join('x')}…` : '';
    const played = attempt.length
      ? attempt.map((step) => (step.auto ? `（${step.side === 'W' ? '白' : '黑'} ${step.move}）` : step.move)).join(' ')
      : '';
    moves.textContent = [played, partial].filter(Boolean).join(' ') || '还没走';
    const msg = root.querySelector('#kill-msg');
    if (text) msg.textContent = text;
    else if (!chain) msg.textContent = '';
  }
}

function messageFor(grade) {
  if (grade.status === 'empty') return '先走一步，再核对。';
  if (grade.status === 'full') return '这条线走通了。';
  if (grade.status === 'partial') return '这步对上了，还可以继续。';
  return '和参考着法还不一样。可以撤销，再看一眼提示。';
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(value) {
  return esc(value).replace(/'/g, '&#39;');
}

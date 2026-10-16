import { clonePieces, getLegalForSelection, tryStep } from '../draughts/rules.js';
import { KILL_DRAFTS } from '../content/pack.js';
import {
  KILL_FILTERS,
  answerLineOf,
  filterPuzzles,
  gradeBank,
  moveMatchesAnswer,
  normalizeFilter,
  piecesFromPuzzle,
  recordAttempt,
} from '../kill/grade.js';

export function killPuzzlesOf(state) {
  const fromState = (state?.problems || []).filter((problem) => problem.bank === 'kill');
  return fromState.length ? fromState : KILL_DRAFTS;
}

export function renderKill(root, ctx) {
  const { state, save, navigate } = ctx;
  if (!state.killAnswers || typeof state.killAnswers !== 'object') state.killAnswers = {};
  if (!Array.isArray(state.killRetry)) state.killRetry = [];
  const puzzles = killPuzzlesOf(state);
  const requested = puzzles.find((item) => item.id === ctx.params?.killId);
  const filter = ctx.params?.filter
    ? normalizeFilter(ctx.params.filter)
    : (KILL_FILTERS.some((item) => item.id === requested?.level) ? requested.level : '一步杀');
  const filtered = filterPuzzles(puzzles, filter, state.killRetry);
  let index = filtered.findIndex((puzzle) => puzzle.id === ctx.params?.killId);
  if (index < 0) index = 0;
  const puzzle = filtered[index];
  let navOpen = Boolean(ctx.params?.navOpen);
  let gradeResults = ctx.params?.gradeResults || null;

  if (!puzzle) {
    root.innerHTML = `
      <section class="card kill-page">
        <h2>杀棋专练</h2>
        ${filterBar(puzzles, filter, state.killRetry)}
        <p class="empty-title">${filter === '二刷' ? '二刷里还没有题' : '这一组还没有题目'}</p>
        <p class="muted">${filter === '二刷' ? '做错的会留在这里，做对就移出。' : '可以换一个筛选。'}</p>
        <p class="muted small" id="kill-foot"></p>
      </section>
      <div class="toast" id="kill-toast"></div>`;
    bindFilters(root, { navigate, filter, puzzleId: null, navOpen, puzzles, retryIds: state.killRetry });
    paintProgress(root, puzzles, state);
    return;
  }

  let pieces = piecesFromPuzzle(puzzle);
  let selected = null;
  let active = null;
  let history = [];
  let moveNotation = null;
  let turnDone = false;
  let revealed = false;
  let drag = null;
  let suppressClick = false;

  root.innerHTML = `
    <section class="card kill-page">
      <h2>杀棋专练</h2>
      <p class="muted">点选或拖动；有吃必吃。走完一着会自动提交；连吃要走完。错题进二刷；二刷再错仍保留，做对才移出。</p>
      ${filterBar(puzzles, filter, state.killRetry)}
      <div class="row-between wrap">
        <button type="button" class="btn" id="kill-toggle" aria-expanded="${navOpen ? 'true' : 'false'}">${navOpen ? '收起题号' : '展开题号'}</button>
        <span class="muted" id="kill-meta"></span>
      </div>
      <div class="kill-nav ${navOpen ? 'open' : ''}" id="kill-nav"></div>
      <h3 id="kill-title"></h3>
      <p class="hint" id="kill-hint"></p>
      <div id="kill-board" class="kill-board"></div>
      <p class="move-box">本题着法：<strong id="kill-moves">（尚未走子）</strong></p>
      <div class="actions-row">
        <button type="button" class="btn" id="kill-prev">上一题</button>
        <button type="button" class="btn" id="kill-next">下一题</button>
        <button type="button" class="btn" id="kill-undo">撤销</button>
      </div>
      <div class="card-inset">
        <h3>做题说明</h3>
        <ol class="kill-help">
          <li>先想 1～2 分钟，再动手。</li>
          <li>只移动该走一方的棋子；非法着法会提示原因。</li>
          <li>走完一着会自动提交；连吃要走完。</li>
          <li>点「批改」看对错汇总。错题进二刷；二刷再错仍保留，做对才移出。</li>
        </ol>
        <h3>看答案</h3>
        <button type="button" class="btn" id="kill-reveal">显示 / 隐藏本题答案</button>
        <div id="kill-answer" class="answer-notes hidden"></div>
        <h3>批改</h3>
        <textarea id="kill-export" readonly placeholder="点「批改」后，这里显示对错汇总"></textarea>
        <div class="actions-row">
          <button type="button" class="btn primary" id="kill-grade">批改</button>
          <button type="button" class="btn" id="kill-clear">清空已存答案</button>
        </div>
        <p class="muted small" id="kill-foot"></p>
      </div>
      ${
        state.role === 'parent'
          ? `<p class="muted small">这些题在题库里仍是草稿。发布到「今天」仍然每天最多 1 道。</p>
             <button type="button" class="btn" id="kill-to-bank">在题库里打开这题</button>`
          : ''
      }
    </section>
    <div class="toast" id="kill-toast"></div>
  `;

  const boardEl = root.querySelector('#kill-board');
  bindFilters(root, { navigate, filter, puzzleId: puzzle.id, navOpen, puzzles, retryIds: state.killRetry });
  root.querySelector('#kill-toggle').onclick = () => {
    navOpen = !navOpen;
    root.querySelector('#kill-nav').classList.toggle('open', navOpen);
    const toggle = root.querySelector('#kill-toggle');
    toggle.setAttribute('aria-expanded', navOpen ? 'true' : 'false');
    toggle.textContent = navOpen ? '收起题号' : '展开题号';
  };
  root.querySelector('#kill-prev').onclick = () => step(-1);
  root.querySelector('#kill-next').onclick = () => step(1);
  root.querySelector('#kill-undo').onclick = undo;
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
      <p><strong>答案：</strong>${esc(puzzle.answer || '')}</p>
      <p><strong>着法线：</strong>${esc(answerLineOf(puzzle))}</p>
      <p><strong>来源：</strong>${esc(puzzle.source || '')}</p>
      <p><strong>考点：</strong>${esc(puzzle.point || '')}</p>
      ${puzzle.note ? `<p><strong>说明：</strong>${esc(puzzle.note)}</p>` : ''}
    `;
  };
  root.querySelector('#kill-grade').onclick = async () => {
    const report = gradeBank(puzzles, state.killAnswers, state.killRetry);
    state.killRetry = report.retryIds;
    gradeResults = report.results;
    save();
    root.querySelector('#kill-export').value = report.text;
    renderNav();
    paintProgress(root, puzzles, state, report);
    let message = `批改完成：对 ${report.correct}，错 ${report.wrong}，未答 ${report.unanswered}，二刷 ${report.retry}`;
    if (report.oral) message += `，口述 ${report.oral}`;
    try {
      await navigator.clipboard.writeText(report.text);
      toast(`${message}（已复制）`);
    } catch {
      toast(message);
    }
  };
  root.querySelector('#kill-clear').onclick = () => {
    if (!window.confirm('清空本机已保存的全部答案？')) return;
    state.killAnswers = {};
    gradeResults = null;
    save();
    root.querySelector('#kill-export').value = '';
    updateMoveText();
    renderNav();
    paintProgress(root, puzzles, state);
    toast('已清空');
  };
  root.querySelector('#kill-to-bank')?.addEventListener('click', () => {
    navigate('problems', { problemId: puzzle.id, status: '杀棋' });
  });

  showPuzzleText();
  updateMoveText();
  renderNav();
  renderBoard();
  paintProgress(root, puzzles, state);

  function step(dir) {
    if (!filtered.length) {
      toast(filter === '二刷' ? '二刷列表是空的' : '没有题目');
      return;
    }
    const next = (index + dir + filtered.length) % filtered.length;
    navigate('kill', { filter, killId: filtered[next].id, navOpen, gradeResults });
  }

  function side() {
    return puzzle.side === 'w' ? 'w' : 'b';
  }

  function showPuzzleText() {
    root.querySelector('#kill-title').textContent = puzzle.title || puzzle.id;
    const level = puzzle.level || '';
    const who = puzzle.side === 'w' ? '白' : '黑';
    root.querySelector('#kill-hint').textContent = `【${level}】轮到${who}走。${puzzle.hint || puzzle.prompt || ''}`;
  }

  function updateMoveText() {
    const el = root.querySelector('#kill-moves');
    const saved = state.killAnswers[puzzle.id];
    if (moveNotation) {
      const tag = saved === moveNotation ? '（已提交）' : (saved ? '（已改，将覆盖）' : '');
      el.textContent = `${moveNotation}${tag ? ` ${tag}` : ''}`;
      return;
    }
    if (active?.path?.length >= 2) {
      el.textContent = `${active.path.join('x')}x…`;
      return;
    }
    el.textContent = saved ? `${saved}（已提交，再走一着可覆盖）` : '（尚未走子）';
  }

  function renderNav() {
    const list = filterPuzzles(puzzles, filter, state.killRetry);
    const doneInFilter = list.filter((item) => state.killAnswers[item.id]).length;
    root.querySelector('#kill-meta').textContent = `${puzzle.id} · ${doneInFilter}/${list.length}`;
    const nav = root.querySelector('#kill-nav');
    nav.innerHTML = list.map((item) => {
      const classes = ['kill-id'];
      if (item.id === puzzle.id) classes.push('active');
      if (state.killAnswers[item.id]) classes.push('done');
      if (state.killRetry.includes(item.id)) classes.push('retry');
      if (gradeResults?.[item.id] === 'correct') classes.push('correct');
      else if (gradeResults?.[item.id] === 'wrong') classes.push('wrong');
      return `<button type="button" class="${classes.join(' ')}" data-kid="${escAttr(item.id)}" title="${escAttr(item.level || '')}">${esc(item.id)}</button>`;
    }).join('');
    nav.querySelectorAll('[data-kid]').forEach((btn) => {
      btn.onclick = () => navigate('kill', { filter, killId: btn.dataset.kid, navOpen: true, gradeResults });
    });
    paintProgress(root, puzzles, state, gradeResults ? { correct: countGrade('correct'), wrong: countGrade('wrong'), retry: state.killRetry.length } : null);
  }

  function countGrade(kind) {
    return Object.values(gradeResults || {}).filter((value) => value === kind).length;
  }

  function renderBoard() {
    const info = legalInfo();
    const destSet = new Set(info.destinations || []);
    const pending = new Set(active ? active.captures : []);
    const selSq = active ? active.path[active.path.length - 1] : selected;
    boardEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'board';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', '国际跳棋棋盘');
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        const dark = (row + col) % 2 === 1;
        const cell = document.createElement('div');
        cell.className = `sq ${dark ? 'dark' : 'light'}`;
        const num = dark ? rcToSquare(row, col) : null;
        if (num) {
          cell.dataset.sq = String(num);
          const label = document.createElement('span');
          label.className = 'sq-num';
          label.textContent = String(num);
          cell.appendChild(label);
          if (selSq === num) cell.classList.add('selected');
          if (destSet.has(num)) cell.classList.add('target');
          const piece = pieces[num];
          if (piece) {
            const el = document.createElement('div');
            el.className = `piece ${piece.color === 'w' ? 'white' : 'black'}${piece.king ? ' king' : ''}`;
            if (pending.has(num)) el.classList.add('pending-capture');
            el.dataset.sq = String(num);
            el.title = `${piece.color === 'w' ? '白' : '黑'}${piece.king ? '王' : ''} @${num}`;
            el.addEventListener('click', (event) => {
              event.stopPropagation();
              if (el.dataset.suppressClick === '1') {
                el.dataset.suppressClick = '';
                return;
              }
              onSquareClick(num);
            });
            el.addEventListener('pointerdown', (event) => onPointerDown(event, num, el));
            el.addEventListener('pointermove', onPointerMove);
            el.addEventListener('pointerup', onPointerUp);
            el.addEventListener('pointercancel', onPointerUp);
            cell.appendChild(el);
          }
          cell.addEventListener('click', () => onSquareClick(num));
        }
        grid.appendChild(cell);
      }
    }
    boardEl.appendChild(grid);
  }

  function legalInfo() {
    const sel = active ? active.path[active.path.length - 1] : selected;
    return getLegalForSelection(pieces, side(), sel, active);
  }

  function onSquareClick(num) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (turnDone) {
      softReset();
      updateMoveText();
      renderBoard();
      toast('已重新开始，再走一着可覆盖');
      return;
    }
    if (active) {
      const cur = active.path[active.path.length - 1];
      if (num === cur) return;
      tryMove(cur, num);
      return;
    }
    const piece = pieces[num];
    const info = legalInfo();
    if (selected == null) {
      if (!piece) return;
      if (piece.color !== side()) {
        toast(`现在轮到${side() === 'w' ? '白' : '黑'}走`);
        return;
      }
      if (info.mustCapture && !(info.selectable || []).includes(num)) {
        toast('必须吃子');
        return;
      }
      selected = num;
      renderBoard();
      return;
    }
    if (selected === num) {
      selected = null;
      renderBoard();
      return;
    }
    if (piece && piece.color === side()) {
      selected = num;
      renderBoard();
      return;
    }
    tryMove(selected, num);
  }

  function onPointerDown(event, num, el) {
    if (event.button != null && event.button !== 0) return;
    if (turnDone) return;
    const piece = pieces[num];
    if (!piece) return;
    const pending = new Set(active ? active.captures : []);
    if (pending.has(num)) return;
    if (active) {
      if (num !== active.path[active.path.length - 1]) {
        toast('必须继续吃子');
        return;
      }
    } else if (piece.color !== side()) {
      toast(`现在轮到${side() === 'w' ? '白' : '黑'}走`);
      return;
    }
    drag = { num, x: event.clientX, y: event.clientY, moved: false, el };
    el.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.currentTarget !== drag.el) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) {
      drag.moved = true;
      drag.el.classList.add('dragging');
    }
  }

  function onPointerUp(event) {
    if (!drag || event.currentTarget !== drag.el) return;
    const info = drag;
    drag = null;
    info.el.classList.remove('dragging');
    if (!info.moved) return;
    suppressClick = true;
    info.el.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    info.el.style.pointerEvents = '';
    const cell = hit?.closest?.('[data-sq]');
    const to = cell ? Number(cell.dataset.sq) : 0;
    if (to && to !== info.num) tryMove(info.num, to);
    else renderBoard();
  }

  function tryMove(from, to) {
    if (turnDone) {
      softReset();
      updateMoveText();
      renderBoard();
      toast('已重新开始，再走一着可覆盖');
      return;
    }
    pushHistory();
    const res = tryStep(pieces, side(), from, to, active);
    if (!res.ok) {
      history.pop();
      toast(res.error || '不合法的着法');
      if (!active) selected = null;
      renderBoard();
      return;
    }
    pieces = res.pieces;
    active = res.active;
    selected = active ? active.path[active.path.length - 1] : null;
    if (res.completedMove) {
      moveNotation = res.completedMove.notation;
      turnDone = true;
      selected = null;
      active = null;
      autoSubmit(moveNotation);
    }
    updateMoveText();
    renderBoard();
  }

  function autoSubmit(notation) {
    const recorded = recordAttempt(puzzle, notation, state.killAnswers, state.killRetry);
    state.killAnswers = recorded.answers;
    state.killRetry = recorded.retryIds;
    if (gradeResults && puzzle.id) {
      gradeResults = { ...gradeResults, [puzzle.id]: moveMatchesAnswer(puzzle, notation) ? 'correct' : 'wrong' };
    }
    save();
    renderNav();
    toast(`已提交 ${puzzle.id}: ${notation}${recorded.extra}`);
  }

  function pushHistory() {
    history.push({
      pieces: clonePieces(pieces),
      active: active ? {
        path: active.path.slice(),
        captures: active.captures.slice(),
        maxCaptures: active.maxCaptures,
      } : null,
      selected,
      moveNotation,
      turnDone,
    });
  }

  function undo() {
    const last = history.pop();
    if (!last) {
      toast('没有可撤销的步');
      return;
    }
    pieces = last.pieces;
    active = last.active;
    selected = last.selected;
    moveNotation = last.moveNotation;
    turnDone = last.turnDone;
    updateMoveText();
    renderBoard();
  }

  function softReset() {
    pieces = piecesFromPuzzle(puzzle);
    selected = null;
    active = null;
    history = [];
    moveNotation = null;
    turnDone = false;
  }
}

function filterBar(puzzles, filter, retryIds) {
  return `<div class="filter-row" id="kill-filters">
    ${KILL_FILTERS.map((item) => {
      const count = item.id === '二刷'
        ? (retryIds?.length || 0)
        : item.id === '全部'
          ? puzzles.length
          : puzzles.filter((puzzle) => puzzle.level === item.id).length;
      const label = item.id === '二刷' && count ? `${item.label} (${count})` : `${item.label}${item.id === '二刷' ? '' : ` ${count}`}`;
      return `<button type="button" class="btn ${filter === item.id ? 'primary' : ''}" data-filter="${item.id}">${label}</button>`;
    }).join('')}
  </div>`;
}

function bindFilters(root, { navigate, filter, puzzleId, navOpen, puzzles, retryIds }) {
  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.onclick = () => {
      const nextFilter = btn.dataset.filter;
      const list = filterPuzzles(puzzles, nextFilter, retryIds);
      const keep = list.some((puzzle) => puzzle.id === puzzleId);
      navigate('kill', { filter: nextFilter, killId: keep ? puzzleId : list[0]?.id, navOpen });
    };
  });
}

function paintProgress(root, puzzles, state, report) {
  const foot = root.querySelector('#kill-foot');
  if (!foot) return;
  const submitted = Object.keys(state.killAnswers || {}).length;
  let text = `已提交 ${submitted} / ${puzzles.length} 题 · 二刷 ${state.killRetry?.length || 0}`;
  if (report && Number.isFinite(report.correct)) text += ` · 对 ${report.correct} / 错 ${report.wrong}`;
  foot.textContent = text;
}

function rcToSquare(row, col) {
  if ((row + col) % 2 === 0) return null;
  const k = row % 2 === 0 ? (col - 1) / 2 : col / 2;
  return row * 5 + k + 1;
}

function toast(msg) {
  const toastEl = document.getElementById('kill-toast');
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
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

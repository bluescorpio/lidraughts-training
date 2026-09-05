import { todayStr } from '../store.js';
import { mountBoard } from '../draughts/BoardView.js';
import { parseFen } from '../draughts/board.js';

export function renderToday(root, ctx) {
  const { state, save, navigate } = ctx;
  const date = todayStr(state);

  // Child sees at most 1 published problem for today
  const published = (state.problems || []).filter((pr) => pr.status === '已发布');
  let todayProblem = null;

  // Prefer problem whose publishDate === today, else first published assigned via publishedTodayId
  todayProblem =
    published.find((pr) => pr.publishDate === date) ||
    published.find((pr) => pr.id === state.publishedTodayId && (!pr.publishDate || pr.publishDate === date)) ||
    null;

  // If parent published one without date, treat the single "active today" as publishedTodayId
  if (!todayProblem && state.publishedTodayId) {
    todayProblem = published.find((pr) => pr.id === state.publishedTodayId) || null;
  }

  const completion = todayProblem?.completions?.[date];

  root.innerHTML = `
    <section class="card today-card">
      <h2>今天</h2>
      <p class="muted date-line">${date}</p>
      ${
        !todayProblem
          ? `<div class="empty-soft">
              <p class="empty-title">今天没有任务</p>
              <p class="muted">好好休息，或者和家长一起看看锁住清单。</p>
            </div>`
          : `<div class="task-block">
              <div class="badge">${escapeHtml(todayProblem.type)}</div>
              <h3>${escapeHtml(todayProblem.title)}</h3>
              <p class="prompt">${escapeHtml(todayProblem.prompt)}</p>
              <div id="today-board"></div>
              <div class="mark-hint muted">点格子标出你想到的路线（可多选）</div>
              <div class="actions-row">
                <button type="button" class="btn" id="btn-clear-marks">清空标记</button>
                <button type="button" class="btn primary" id="btn-submit" ${completion ? 'disabled' : ''}>
                  ${completion ? '已完成' : '提交并自检'}
                </button>
              </div>
              <div id="after-submit" class="${completion ? '' : 'hidden'}">
                ${
                  completion
                    ? renderAfter(todayProblem, completion)
                    : ''
                }
              </div>
            </div>`
      }
      ${
        state.role === 'parent'
          ? `<div class="parent-hint card-inset">
              <p>家长：请在「题库」里把一道题设为「已发布」，并指定为今日任务（每天最多 1 道）。</p>
              <button type="button" class="btn" data-go="problems">去题库</button>
            </div>`
          : ''
      }
    </section>
  `;

  root.querySelector('[data-go="problems"]')?.addEventListener('click', () => navigate('problems'));

  if (!todayProblem) return;

  const { board } = parseFen(todayProblem.fen || undefined);
  const boardApi = mountBoard(root.querySelector('#today-board'), {
    board,
    interactive: true,
    highlights: completion?.marks || [],
    onSquare: (sq) => {
      if (completion) return;
      boardApi.toggleHighlight(sq);
    },
  });

  root.querySelector('#btn-clear-marks')?.addEventListener('click', () => {
    if (completion) return;
    boardApi.clearHighlights();
  });

  root.querySelector('#btn-submit')?.addEventListener('click', () => {
    if (completion) return;
    const hl = boardApi.getHighlights ? boardApi.getHighlights() : [...root.querySelectorAll('.sq.hl')].map((el) => Number(el.dataset.sq));
    openSelfCheck(root, ctx, todayProblem, date, hl);
  });
}

function openSelfCheck(root, ctx, problem, date, marks) {
  const box = root.querySelector('#after-submit');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="self-check">
      <p>对照一下提示，你觉得呢？</p>
      ${problem.answerNotes ? `<div class="answer-notes"><strong>参考（提交后可见）</strong><p>${escapeHtml(problem.answerNotes)}</p></div>` : ''}
      <div class="actions-row">
        <button type="button" class="btn soft" data-check="对了">我对了</button>
        <button type="button" class="btn soft" data-check="漏了">有点漏了</button>
      </div>
    </div>
  `;
  box.querySelectorAll('[data-check]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selfCheck = btn.getAttribute('data-check');
      const { state, save, render } = ctx;
      const pr = state.problems.find((p) => p.id === problem.id);
      if (!pr) return;
      pr.completions = pr.completions || {};
      pr.completions[date] = { done: true, selfCheck, marks, at: Date.now() };
      save();
      render();
    });
  });
}

function renderAfter(problem, completion) {
  return `
    <div class="self-check done">
      <p>今日任务已完成 · 自检：<strong>${escapeHtml(completion.selfCheck)}</strong></p>
      ${problem.answerNotes ? `<div class="answer-notes"><strong>参考</strong><p>${escapeHtml(problem.answerNotes)}</p></div>` : ''}
      <p class="muted">明天再见，不必加练。</p>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

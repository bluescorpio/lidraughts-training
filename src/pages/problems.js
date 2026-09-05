import { todayStr } from '../store.js';
import { mountBoard } from '../draughts/BoardView.js';
import { parseFen } from '../draughts/board.js';

export function renderProblems(root, ctx) {
  const { state, save, navigate } = ctx;
  const filter = ctx.params?.status || '全部';
  const openId = ctx.params?.problemId;

  if (openId) return renderPractice(root, ctx, openId);

  const all = state.problems || [];
  const list =
    filter === '全部' ? all : all.filter((p) => p.status === filter);

  const isParent = state.role === 'parent';

  root.innerHTML = `
    <section class="card">
      <h2>题库</h2>
      <div class="filter-row">
        ${['全部', '草稿', '已发布', '归档']
          .map(
            (s) =>
              `<button type="button" class="btn ${filter === s ? 'primary' : ''}" data-filter="${s}">${s}</button>`
          )
          .join('')}
      </div>
      ${
        isParent
          ? `<p class="muted">每天最多发布 1 道到「今天」。发布会自动设为今日任务。</p>`
          : `<p class="muted">练习已发布的题目；今天页只会安排其中一道。</p>`
      }
      <ul class="list">
        ${
          list.length
            ? list
                .map((pr) => {
                  const today = todayStr(state);
                  const isToday = state.publishedTodayId === pr.id || pr.publishDate === today;
                  return `
              <li class="list-item">
                <div class="row-between wrap">
                  <button type="button" class="list-btn" data-open="${pr.id}">
                    <strong>${esc(pr.title)}</strong>
                    <span class="muted">${esc(pr.type)} · ${esc(pr.status)}${isToday ? ' · 今日' : ''}${pr.placeholder ? ' · 待补棋谱' : ''}</span>
                  </button>
                  ${
                    isParent
                      ? `<span class="actions-row">
                          ${
                            pr.status === '草稿'
                              ? `<button type="button" class="btn primary" data-pub="${pr.id}">发布</button>`
                              : ''
                          }
                          ${
                            pr.status === '已发布'
                              ? `<button type="button" class="btn" data-today="${pr.id}">设为今日</button>
                                 <button type="button" class="btn" data-arch="${pr.id}">归档</button>`
                              : ''
                          }
                          ${
                            pr.status === '归档'
                              ? `<button type="button" class="btn" data-draft="${pr.id}">回草稿</button>`
                              : ''
                          }
                        </span>`
                      : ''
                  }
                </div>
              </li>`;
                })
                .join('')
            : '<li class="muted">暂无题目</li>'
        }
      </ul>
    </section>
  `;

  root.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => navigate('problems', { status: b.dataset.filter });
  });
  root.querySelectorAll('[data-open]').forEach((b) => {
    b.onclick = () => navigate('problems', { problemId: b.dataset.open, status: filter });
  });

  root.querySelectorAll('[data-pub]').forEach((b) => {
    b.onclick = () => {
      const date = todayStr(state);
      // enforce 1 published-for-today: unassign others' today flag for this date
      for (const pr of state.problems) {
        if (pr.publishDate === date) pr.publishDate = null;
      }
      const pr = state.problems.find((p) => p.id === b.dataset.pub);
      if (!pr) return;
      // demote other 已发布 stay published but only one is today's task
      pr.status = '已发布';
      pr.publishedAt = Date.now();
      pr.publishDate = date;
      state.publishedTodayId = pr.id;
      save();
      navigate('problems', { status: '已发布' });
    };
  });

  root.querySelectorAll('[data-today]').forEach((b) => {
    b.onclick = () => {
      const date = todayStr(state);
      for (const pr of state.problems) {
        if (pr.publishDate === date) pr.publishDate = null;
      }
      const pr = state.problems.find((p) => p.id === b.dataset.today);
      if (!pr) return;
      pr.publishDate = date;
      state.publishedTodayId = pr.id;
      save();
      navigate('today');
    };
  });

  root.querySelectorAll('[data-arch]').forEach((b) => {
    b.onclick = () => {
      const pr = state.problems.find((p) => p.id === b.dataset.arch);
      if (!pr) return;
      pr.status = '归档';
      if (state.publishedTodayId === pr.id) state.publishedTodayId = null;
      pr.publishDate = null;
      save();
      navigate('problems', { status: '归档' });
    };
  });

  root.querySelectorAll('[data-draft]').forEach((b) => {
    b.onclick = () => {
      const pr = state.problems.find((p) => p.id === b.dataset.draft);
      if (!pr) return;
      pr.status = '草稿';
      save();
      navigate('problems', { status: '草稿' });
    };
  });
}

function renderPractice(root, ctx, problemId) {
  const { state, save, navigate } = ctx;
  const pr = state.problems.find((p) => p.id === problemId);
  if (!pr) {
    root.innerHTML = `<section class="card"><p>题目不存在</p><button class="btn" data-back>返回</button></section>`;
    root.querySelector('[data-back]').onclick = () => navigate('problems');
    return;
  }

  const isParent = state.role === 'parent';
  const canPractice = pr.status === '已发布' || isParent;
  const date = todayStr(state);
  let submitted = false;

  root.innerHTML = `
    <section class="card">
      <button type="button" class="btn" data-back>← 题库</button>
      <div class="badge">${esc(pr.status)} · ${esc(pr.type)}</div>
      <h2>${esc(pr.title)}</h2>
      <p class="muted">${esc(pr.gameTitle || '')} ${esc(pr.moveLabel || '')}</p>
      <p class="prompt">${esc(pr.prompt)}</p>
      ${pr.placeholder ? `<p class="warn">待补棋谱：当前为起始局面占位。</p>` : ''}
      <div id="prob-board"></div>
      ${
        canPractice
          ? `<p class="muted">点格子标记候选吃子/线路，然后提交。</p>
             <div class="actions-row">
               <button type="button" class="btn" id="clear">清空</button>
               <button type="button" class="btn primary" id="submit">提交</button>
             </div>
             <div id="result" class="hidden"></div>`
          : `<p class="muted">草稿未发布，孩子端暂不练习。</p>`
      }
      ${
        isParent
          ? `<div class="card-inset form-grid">
              <label>标题<input id="e-title" value="${escAttr(pr.title)}" /></label>
              <label>提示<textarea id="e-prompt" rows="3">${esc(pr.prompt)}</textarea></label>
              <label>家长备注<textarea id="e-ans" rows="2">${esc(pr.answerNotes || '')}</textarea></label>
              <label>状态
                <select id="e-status">
                  ${['草稿', '已发布', '归档'].map((s) => `<option ${pr.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </label>
              <button type="button" class="btn primary" id="e-save">保存修改</button>
            </div>`
          : ''
      }
    </section>
  `;

  root.querySelector('[data-back]').onclick = () => navigate('problems', { status: ctx.params?.status || '全部' });

  const { board } = parseFen(pr.fen || undefined);
  const boardApi = mountBoard(root.querySelector('#prob-board'), {
    board,
    interactive: canPractice,
    onSquare: (sq) => {
      if (!canPractice || submitted) return;
      boardApi.toggleHighlight(sq);
    },
  });

  root.querySelector('#clear')?.addEventListener('click', () => boardApi.clearHighlights());
  root.querySelector('#submit')?.addEventListener('click', () => {
    submitted = true;
    const marks = [...root.querySelectorAll('.sq.hl')].map((el) => Number(el.dataset.sq));
    const box = root.querySelector('#result');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="self-check">
        ${pr.answerNotes ? `<div class="answer-notes"><strong>参考</strong><p>${esc(pr.answerNotes)}</p></div>` : '<p class="muted">本题暂无家长备注。</p>'}
        <p>自检：</p>
        <div class="actions-row">
          <button type="button" class="btn soft" data-c="对了">我对了</button>
          <button type="button" class="btn soft" data-c="漏了">有点漏了</button>
        </div>
      </div>
    `;
    box.querySelectorAll('[data-c]').forEach((btn) => {
      btn.onclick = () => {
        pr.completions = pr.completions || {};
        pr.completions[date] = {
          done: true,
          selfCheck: btn.dataset.c,
          marks,
          at: Date.now(),
        };
        save();
        box.innerHTML = `<p class="ok">已记录：${esc(btn.dataset.c)}</p>`;
      };
    });
  });

  root.querySelector('#e-save')?.addEventListener('click', () => {
    pr.title = root.querySelector('#e-title').value.trim();
    pr.prompt = root.querySelector('#e-prompt').value.trim();
    pr.answerNotes = root.querySelector('#e-ans').value.trim();
    const st = root.querySelector('#e-status').value;
    pr.status = st;
    if (st === '已发布' && !pr.publishDate) {
      // do not auto-steal today unless user uses 发布 from list
    }
    save();
    navigate('problems', { problemId: pr.id });
  });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}

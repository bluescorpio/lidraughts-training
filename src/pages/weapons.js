import { uid } from '../store.js';
import { WEAPON_CHAPTERS, chapterById, weaponStats } from '../weapons.js';

export function renderWeapons(root, ctx) {
  const view = ctx.params?.view === 'stars' ? 'stars' : 'list';
  if (view === 'stars') return renderStars(root, ctx);
  renderChapters(root, ctx);
}

function renderChapters(root, ctx) {
  const { state, save, navigate } = ctx;
  const stats = weaponStats(state);
  const progress = state.weaponProgress;
  const isParent = state.role === 'parent';

  root.innerHTML = `
    <section class="card">
      <div class="row-between wrap">
        <h2>打击武器库</h2>
        <button type="button" class="btn" id="go-stars">红星复习</button>
      </div>
      <p class="muted">21 章轻量打卡，不必一天刷完。卡住的题标红星，周末再看。</p>
      ${
        isParent
          ? `<p class="badge">完成 ${stats.chaptersDone}/${stats.chapterTotal} · 待复习红星 ${stats.starsOpen} · 本周已清 ${stats.starsClearedThisWeek}</p>`
          : `<p class="badge">已打卡 ${stats.chaptersDone}/${stats.chapterTotal} 章</p>`
      }
      <ul class="list weapon-list">
        ${WEAPON_CHAPTERS.map((ch) => {
          const status = progress[ch.id] || 'in_progress';
          const done = status === 'done';
          return `
            <li class="list-item weapon-item">
              <div>
                <strong>${esc(ch.title)}</strong>
                <div class="muted small">${ch.id} · ${done ? '已打卡' : '进行中'}</div>
              </div>
              <div class="actions-row">
                <button type="button" class="btn ${done ? 'primary' : ''}" data-toggle="${ch.id}">${done ? '取消打卡' : '本节打卡完成'}</button>
                <button type="button" class="btn" data-star="${ch.id}">⭐ 标为红星</button>
              </div>
            </li>`;
        }).join('')}
      </ul>
    </section>
  `;

  root.querySelector('#go-stars').onclick = () => navigate('weapons', { view: 'stars' });
  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.toggle;
      const current = state.weaponProgress[id] || 'in_progress';
      state.weaponProgress[id] = current === 'done' ? 'in_progress' : 'done';
      save();
      ctx.render();
    };
  });
  root.querySelectorAll('[data-star]').forEach((btn) => {
    btn.onclick = () => {
      const chapter = chapterById(btn.dataset.star);
      const title = window.prompt('这道卡住的题叫什么？（可空）', chapter?.title || '') ?? null;
      if (title === null) return;
      state.weaponStars.unshift({
        id: uid('star'),
        chapterId: chapter.id,
        title: String(title).trim().slice(0, 40) || chapter.title,
        markedAt: Date.now(),
        source: 'external',
        cleared: false,
      });
      save();
      ctx.render();
    };
  });
}

function renderStars(root, ctx) {
  const { state, save, navigate } = ctx;
  const open = (state.weaponStars || []).filter((s) => s.cleared !== true);
  const cleared = (state.weaponStars || []).filter((s) => s.cleared === true);

  root.innerHTML = `
    <section class="card">
      <div class="row-between wrap">
        <button type="button" class="btn" id="back-chapters">← 武器库</button>
        <h2>红星复习</h2>
      </div>
      <p class="muted">只看还没清掉的红星。本周看过就打勾，不必加量。</p>
      <ul class="list">
        ${
          open.length
            ? open
                .map((star) => {
                  const ch = chapterById(star.chapterId);
                  return `
              <li class="list-item row-between wrap">
                <div>
                  <strong>${esc(star.title || ch?.title || '红星题')}</strong>
                  <div class="muted small">${esc(ch?.title || star.chapterId)} · ${star.source === 'in_app' ? '站内' : '外部'}</div>
                </div>
                <button type="button" class="btn primary" data-clear="${escAttr(star.id)}">本周复习打勾</button>
              </li>`;
                })
                .join('')
            : '<li class="muted">现在没有待复习的红星。</li>'
        }
      </ul>
      ${
        cleared.length
          ? `<h3>已打勾</h3>
            <ul class="list tight">
              ${cleared
                .map(
                  (star) => `
                <li class="list-item row-between wrap">
                  <span class="muted">${esc(star.title || '')}</span>
                  <button type="button" class="btn" data-restore="${escAttr(star.id)}">恢复红星</button>
                </li>`
                )
                .join('')}
            </ul>`
          : ''
      }
    </section>
  `;

  root.querySelector('#back-chapters').onclick = () => navigate('weapons');
  root.querySelectorAll('[data-clear]').forEach((btn) => {
    btn.onclick = () => {
      const star = state.weaponStars.find((s) => s.id === btn.dataset.clear);
      if (!star) return;
      star.cleared = true;
      star.clearedAt = Date.now();
      save();
      ctx.render();
    };
  });
  root.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.onclick = () => {
      const star = state.weaponStars.find((s) => s.id === btn.dataset.restore);
      if (!star) return;
      star.cleared = false;
      delete star.clearedAt;
      save();
      ctx.render();
    };
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

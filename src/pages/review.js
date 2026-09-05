import { uid, todayStr } from '../store.js';
import {
  COUNTER_OPTIONS,
  LEAD_OPTIONS,
  KING_OPTIONS,
  PLAN_OPTIONS,
  SOURCE_OPTIONS,
  labelOf,
  recentMetricLogs,
  trendPoints,
  leadHeldShare,
  kingSafeShare,
  sparklineSvg,
} from '../metrics.js';
import { weaponStats } from '../weapons.js';

export function renderReview(root, ctx) {
  const { state } = ctx;
  if (state.role === 'child') return renderChildHelp(root, ctx);
  renderParentLog(root, ctx);
}

function renderParentLog(root, ctx) {
  const { state, save } = ctx;
  const logs = recentMetricLogs(state.metricLogs, 20);
  const counterTrend = trendPoints(state.metricLogs, 'counterAfterCombo', 12);
  const planTrend = trendPoints(state.metricLogs, 'planScore', 12);
  const lead = leadHeldShare(state.metricLogs);
  const king = kingSafeShare(state.metricLogs);
  const weapons = weaponStats(state);
  const legacy = state.reviews || [];

  root.innerHTML = `
    <section class="card">
      <h2>对局速记</h2>
      <p class="muted">四题勾完就好，大约半分钟。不排名、不加练。</p>
      <p class="badge">武器库 ${weapons.chaptersDone}/${weapons.chapterTotal} · 红星待复习 ${weapons.starsOpen} · 本周已清 ${weapons.starsClearedThisWeek}</p>
      ${metricFormHtml(todayStr(state))}
      <div class="stat-grid">
        <div class="stat-card">
          <h3>被反打（近 ${counterTrend.length || 0} 盘）</h3>
          ${counterTrend.length ? sparklineSvg(counterTrend, { maxY: 2 }) : '<p class="muted small">记几盘后这里会出现趋势。</p>'}
        </div>
        <div class="stat-card">
          <h3>计划分（近 ${planTrend.length || 0} 盘）</h3>
          ${planTrend.length ? sparklineSvg(planTrend, { maxY: 3 }) : '<p class="muted small">记几盘后这里会出现趋势。</p>'}
        </div>
        <div class="stat-card">
          <h3>领先守住</h3>
          <p class="stat-num">${lead ? Math.round(lead.ratio * 100) + '%' : '—'}</p>
          <p class="muted small">${lead ? `${lead.held}/${lead.total} 局有明显领先时守住` : '尚无明显领先样本'}</p>
        </div>
        <div class="stat-card">
          <h3>升王首步安全</h3>
          <p class="stat-num">${king ? Math.round(king.ratio * 100) + '%' : '—'}</p>
          <p class="muted small">${king ? `${king.yes}/${king.total} 局有王时安全` : '尚无升王样本'}</p>
        </div>
      </div>
      <h3>最近 20 条</h3>
      <ul class="list">
        ${
          logs.length
            ? logs.map((log) => `
            <li class="list-item">
              <strong>${esc(log.date)}</strong> · ${esc(labelOf(SOURCE_OPTIONS, log.source))}
              <div class="muted small">
                反打 ${esc(labelOf(COUNTER_OPTIONS, log.counterAfterCombo))}
                · 领先 ${esc(labelOf(LEAD_OPTIONS, log.leadHeld))}
                · 升王 ${esc(labelOf(KING_OPTIONS, log.kingFirstSafe))}
                · 计划 ${esc(log.planScore)}
                ${log.note ? ' · ' + esc(log.note) : ''}
              </div>
              <button type="button" class="btn danger" data-del-log="${escAttr(log.id)}">删除</button>
            </li>`).join('')
            : '<li class="muted">还没有速记。下一盘下完勾四题即可。</li>'
        }
      </ul>
      ${
        legacy.length
          ? `<h3>旧复盘本</h3>
            <ul class="list tight">
              ${legacy
                .slice(0, 10)
                .map(
                  (r) => `
                <li class="list-item muted small">${esc(r.date)} · 反打 ${esc(r.counterHits)} · 计划分 ${esc(r.planScore)}${r.note ? ' · ' + esc(r.note) : ''}</li>`
                )
                .join('')}
            </ul>`
          : ''
      }
    </section>
  `;

  bindMetricForm(root, ctx, () => {
    save();
    ctx.render();
  });
  root.querySelectorAll('[data-del-log]').forEach((btn) => {
    btn.onclick = () => {
      state.metricLogs = state.metricLogs.filter((x) => x.id !== btn.dataset.delLog);
      save();
      ctx.render();
    };
  });
}

function renderChildHelp(root, ctx) {
  const { state, save } = ctx;
  const justSaved = state.metricLogs?.[0] && Date.now() - state.metricLogs[0].createdAt < 5000;
  root.innerHTML = `
    <section class="card">
      <h2>帮爸爸勾一下</h2>
      <p class="muted">下完一盘，用大按钮勾四题。不用看图表。</p>
      ${justSaved ? '<p class="ok">记下了，谢谢。</p>' : ''}
      ${metricFormHtml(todayStr(ctx.state), { compact: true })}
    </section>
  `;
  bindMetricForm(root, ctx, () => {
    save();
    ctx.render();
  });
}

function metricFormHtml(date, { compact = false } = {}) {
  return `
    <form id="metric-form" class="form-grid card-inset">
      <fieldset class="full choice-set">
        <legend>组合结束后是否被反打？</legend>
        ${choiceRow('counterAfterCombo', COUNTER_OPTIONS, '0')}
      </fieldset>
      <fieldset class="full choice-set">
        <legend>领先优势是否守住？</legend>
        ${choiceRow('leadHeld', LEAD_OPTIONS, 'na')}
      </fieldset>
      <fieldset class="full choice-set">
        <legend>升王第一步是否安全？</legend>
        ${choiceRow('kingFirstSafe', KING_OPTIONS, 'no_king')}
      </fieldset>
      <fieldset class="full choice-set">
        <legend>均势无战术时是否有计划？</legend>
        ${choiceRow('planScore', PLAN_OPTIONS, '2')}
      </fieldset>
      ${
        compact
          ? `<input type="hidden" id="m-date" value="${escAttr(date)}" />
             <input type="hidden" name="source" value="lidraughts" />`
          : `<label>日期<input type="date" id="m-date" required value="${escAttr(date)}" /></label>
             <label>来源
               <select id="m-source">
                 ${SOURCE_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === 'lidraughts' ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
               </select>
             </label>
             <label class="full">一句话（可选，≤30字）<input id="m-note" maxlength="30" placeholder="最多30字" /></label>`
      }
      <div class="full"><button type="submit" class="btn primary">${compact ? '帮爸爸记下' : '保存速记'}</button></div>
    </form>
  `;
}

function choiceRow(name, options, selected) {
  return `<div class="choice-row">${options
    .map(
      (o) => `
    <label class="choice-chip">
      <input type="radio" name="${name}" value="${escAttr(o.value)}" ${o.value === selected ? 'checked' : ''} />
      <span>${esc(o.label)}</span>
    </label>`
    )
    .join('')}</div>`;
}

function bindMetricForm(root, ctx, onSaved) {
  root.querySelector('#metric-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const entry = {
      id: uid('metric'),
      createdAt: Date.now(),
      date: root.querySelector('#m-date')?.value || todayStr(ctx.state),
      counterAfterCombo: form.counterAfterCombo?.value || '0',
      leadHeld: form.leadHeld?.value || 'na',
      kingFirstSafe: form.kingFirstSafe?.value || 'no_king',
      planScore: form.planScore?.value || '2',
      source: root.querySelector('#m-source')?.value || form.source?.value || 'lidraughts',
      note: (root.querySelector('#m-note')?.value || '').trim().slice(0, 30),
    };
    ctx.state.metricLogs = ctx.state.metricLogs || [];
    ctx.state.metricLogs.unshift(entry);
    onSaved();
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

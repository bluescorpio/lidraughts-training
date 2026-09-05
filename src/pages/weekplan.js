import { defaultWeekPlan } from '../seed.js';

export function renderWeekplan(root, ctx) {
  const { state, save } = ctx;
  if (!state.weekPlan) state.weekPlan = defaultWeekPlan();

  const plan = state.weekPlan;

  root.innerHTML = `
    <section class="card">
      <h2>周计划</h2>
      <p class="muted">${esc(plan.note || '按清单轻轻推进即可。')}</p>
      <ul class="list week-list">
        ${plan.items
          .map(
            (it) => `
          <li class="list-item week-item">
            <label class="week-label">
              <input type="checkbox" data-id="${it.id}" ${it.done ? 'checked' : ''} />
              <span class="day">${esc(it.day)}</span>
              <input class="week-text" data-text="${it.id}" value="${escAttr(it.text)}" />
            </label>
          </li>`
          )
          .join('')}
      </ul>
      <label class="full">备注
        <input id="week-note" value="${escAttr(plan.note || '')}" />
      </label>
      <div class="actions-row">
        <button type="button" class="btn primary" id="save-week">保存修改</button>
        <button type="button" class="btn" id="reset-week">恢复默认</button>
      </div>
    </section>
  `;

  root.querySelectorAll('[data-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const it = plan.items.find((x) => x.id === input.dataset.id);
      if (it) it.done = input.checked;
      save();
    });
  });

  root.querySelector('#save-week').onclick = () => {
    plan.items.forEach((it) => {
      const inp = root.querySelector(`[data-text="${it.id}"]`);
      if (inp) it.text = inp.value.trim();
    });
    plan.note = root.querySelector('#week-note').value.trim();
    save();
    ctx.render();
  };

  root.querySelector('#reset-week').onclick = () => {
    state.weekPlan = defaultWeekPlan();
    save();
    ctx.render();
  };
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

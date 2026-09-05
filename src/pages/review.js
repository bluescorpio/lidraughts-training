import { uid } from '../store.js';

export function renderReview(root, ctx) {
  const { state, save } = ctx;
  const reviews = state.reviews || [];

  root.innerHTML = `
    <section class="card">
      <h2>复盘本</h2>
      <p class="muted">对局后轻轻记四项，不排名、不加练。</p>
      <form id="rev-form" class="form-grid card-inset">
        <label>日期<input type="date" id="r-date" required value="${todayInput()}" /></label>
        <label>颜色
          <select id="r-color"><option>白</option><option>黑</option></select>
        </label>
        <label>结果
          <select id="r-result"><option>胜</option><option>和</option><option>负</option></select>
        </label>
        <label>组合后被反打次数
          <input type="number" id="r-counter" min="0" step="1" value="0" />
        </label>
        <label>子力最高差
          <input type="number" id="r-maxdiff" step="1" value="0" />
        </label>
        <label>终局差
          <input type="number" id="r-enddiff" step="1" value="0" />
        </label>
        <label>升王首步安全
          <select id="r-king">
            <option value="是">是</option>
            <option value="否">否</option>
            <option value="本局无王">本局无王</option>
          </select>
        </label>
        <label>无战术计划分 (1–3)
          <input type="number" id="r-plan" min="1" max="3" value="2" />
        </label>
        <label class="full">一句话备注（≤30字）
          <input id="r-note" maxlength="30" placeholder="最多30字" />
        </label>
        <div class="full"><button type="submit" class="btn primary">保存复盘</button></div>
      </form>
      <h3>历史</h3>
      <ul class="list">
        ${
          reviews.length
            ? reviews
                .map(
                  (r) => `
            <li class="list-item">
              <strong>${esc(r.date)}</strong> · ${esc(r.color)} · ${esc(r.result)}
              <div class="muted small">
                反打 ${r.counterHits} · 最高差 ${r.maxDiff} / 终局 ${r.endDiff} · 升王安全 ${esc(r.kingSafe)} · 计划分 ${r.planScore}
                ${r.note ? ' · ' + esc(r.note) : ''}
              </div>
              <button type="button" class="btn danger" data-del="${r.id}">删除</button>
            </li>`
                )
                .join('')
            : '<li class="muted">还没有复盘记录</li>'
        }
      </ul>
    </section>
  `;

  root.querySelector('#rev-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const note = root.querySelector('#r-note').value.trim().slice(0, 30);
    const entry = {
      id: uid('rev'),
      date: root.querySelector('#r-date').value,
      color: root.querySelector('#r-color').value,
      result: root.querySelector('#r-result').value,
      counterHits: Number(root.querySelector('#r-counter').value) || 0,
      maxDiff: Number(root.querySelector('#r-maxdiff').value) || 0,
      endDiff: Number(root.querySelector('#r-enddiff').value) || 0,
      kingSafe: root.querySelector('#r-king').value,
      planScore: Math.min(3, Math.max(1, Number(root.querySelector('#r-plan').value) || 1)),
      note,
      createdAt: Date.now(),
    };
    state.reviews.unshift(entry);
    save();
    ctx.render();
  });

  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => {
      state.reviews = state.reviews.filter((r) => r.id !== b.dataset.del);
      save();
      ctx.render();
    };
  });
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

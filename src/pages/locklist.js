const STEPS = [
  {
    id: 1,
    title: '查反击',
    kid: '先停一停：对方能不能马上吃回来？',
    hint: '用手指在棋盘上找一找对方的反击格。',
  },
  {
    id: 2,
    title: '做简化',
    kid: '局面乱的时候，能不能换子、收干净？',
    hint: '简单、清楚，比花哨更重要。',
  },
  {
    id: 3,
    title: '停设饵',
    kid: '好看的诱饵，常常藏着反打。先别急着咬。',
    hint: '问问自己：这是真机会，还是对方设的饵？',
  },
];

export function renderLocklist(root, ctx) {
  const key = 'wangzhi-locklist-checks';
  let checked = {};
  try {
    checked = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    checked = {};
  }

  root.innerHTML = `
    <section class="card lock-card">
      <h2>锁住清单</h2>
      <p class="muted">想吃子或冲组合之前，走这三步就好。不必一次做完所有棋。</p>
      <ol class="lock-steps">
        ${STEPS.map(
          (s) => `
          <li class="lock-step ${checked[s.id] ? 'done' : ''}">
            <label class="lock-label">
              <input type="checkbox" data-step="${s.id}" ${checked[s.id] ? 'checked' : ''} />
              <span class="lock-num">${s.id}</span>
              <span class="lock-body">
                <strong>${s.title}</strong>
                <span class="kid-line">${s.kid}</span>
                <span class="muted">${s.hint}</span>
              </span>
            </label>
          </li>`
        ).join('')}
      </ol>
      <button type="button" class="btn" id="reset-lock">重新开始三步</button>
    </section>
  `;

  root.querySelectorAll('[data-step]').forEach((input) => {
    input.addEventListener('change', () => {
      checked[input.dataset.step] = input.checked;
      localStorage.setItem(key, JSON.stringify(checked));
      input.closest('.lock-step').classList.toggle('done', input.checked);
    });
  });

  root.querySelector('#reset-lock').onclick = () => {
    checked = {};
    localStorage.setItem(key, JSON.stringify(checked));
    ctx.render();
  };
}

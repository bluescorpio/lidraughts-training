/**
 * Session-only floating lock-list card. Does not touch leadLock.attempts.
 * Copy matches SPEC §5.2.1 exactly.
 */

const SESSION_KEY = 'wz-lock-float-checks';

export const LOCK_FLOAT_LINES = [
  { id: 'checkCounter', title: '查反击', body: '对手现在唯一能反击的线/子在哪里？先把它封死或兑掉！' },
  { id: 'checkSimplify', title: '做简化', body: '能不能用最安全的 1 换 1 把局面缩小？能就换！' },
  { id: 'checkNoBait', title: '停设饵', body: '现在优势在手，坚决不送饵、不打风险组合！' },
];

export function readLockFloatChecks() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      checkCounter: Boolean(parsed.checkCounter),
      checkSimplify: Boolean(parsed.checkSimplify),
      checkNoBait: Boolean(parsed.checkNoBait),
    };
  } catch {
    return { checkCounter: false, checkSimplify: false, checkNoBait: false };
  }
}

export function writeLockFloatChecks(checks) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(checks));
}

export function mountLockFloat(getNavigate) {
  if (document.getElementById('lock-float-root')) return;

  const root = document.createElement('div');
  root.id = 'lock-float-root';
  root.innerHTML = `
    <div class="float-cluster" role="group" aria-label="全局提醒">
      <button type="button" class="float-btn" id="lock-float-open">🛡️ 锁住清单</button>
      <button type="button" class="float-btn float-btn-note hidden" id="metric-float-open">📝 复盘速记</button>
    </div>
    <div class="lock-sheet hidden" id="lock-sheet" hidden role="dialog" aria-modal="true" aria-labelledby="lock-sheet-title">
      <div class="lock-sheet-backdrop" data-close-sheet></div>
      <div class="lock-sheet-card">
        <div class="row-between">
          <h2 id="lock-sheet-title">锁住清单</h2>
          <button type="button" class="btn" data-close-sheet>关闭</button>
        </div>
        <ol class="lock-float-lines">
          ${LOCK_FLOAT_LINES.map(
            (line) => `
            <li>
              <label class="lock-float-line">
                <input type="checkbox" data-lock-check="${line.id}" />
                <span>
                  <strong>${line.title}</strong>：${line.body}
                </span>
              </label>
            </li>`
          ).join('')}
        </ol>
        <div class="actions-row">
          <button type="button" class="btn primary" id="lock-float-train">进入锁住训练题</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const sheet = root.querySelector('#lock-sheet');
  const openBtn = root.querySelector('#lock-float-open');
  const noteBtn = root.querySelector('#metric-float-open');

  function applyChecks() {
    const checks = readLockFloatChecks();
    root.querySelectorAll('[data-lock-check]').forEach((input) => {
      input.checked = Boolean(checks[input.dataset.lockCheck]);
    });
  }

  function openSheet() {
    applyChecks();
    sheet.classList.remove('hidden');
    sheet.removeAttribute('hidden');
    openBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSheet() {
    sheet.classList.add('hidden');
    sheet.setAttribute('hidden', '');
    openBtn.setAttribute('aria-expanded', 'false');
  }

  openBtn.addEventListener('click', openSheet);
  root.querySelectorAll('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSheet));
  root.querySelectorAll('[data-lock-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const checks = readLockFloatChecks();
      checks[input.dataset.lockCheck] = input.checked;
      writeLockFloatChecks(checks);
    });
  });
  root.querySelector('#lock-float-train').addEventListener('click', () => {
    closeSheet();
    getNavigate()?.('locklist');
  });
  noteBtn.addEventListener('click', () => getNavigate()?.('review'));

  return {
    setShowMetricEntry(show) {
      noteBtn.classList.toggle('hidden', !show);
    },
  };
}

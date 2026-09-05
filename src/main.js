import { loadState, saveState, defaultState } from './store.js';
import { buildSeed } from './seed.js';
import { renderToday } from './pages/today.js';
import { renderLibrary } from './pages/library.js';
import { renderProblems } from './pages/problems.js';
import { renderReview } from './pages/review.js';
import { renderLocklist } from './pages/locklist.js';
import { renderWeekplan } from './pages/weekplan.js';

const NAV = [
  { id: 'today', label: '今天', roles: ['child', 'parent'] },
  { id: 'problems', label: '题库', roles: ['child', 'parent'] },
  { id: 'locklist', label: '锁住清单', roles: ['child', 'parent'] },
  { id: 'review', label: '复盘本', roles: ['parent', 'child'] },
  { id: 'library', label: '资料库', roles: ['parent'] },
  { id: 'weekplan', label: '周计划', roles: ['parent', 'child'] },
];

function initState() {
  let state = loadState();
  if (!state || !state.games?.length) {
    const seed = buildSeed();
    state = {
      ...defaultState(),
      ...seed,
      role: state?.role || 'child',
      publishedTodayId: null,
    };
    saveState(state);
  }
  return state;
}

const appState = {
  state: initState(),
  page: 'today',
  params: {},
};

function save() {
  saveState(appState.state);
}

function navigate(page, params = {}) {
  appState.page = page;
  appState.params = params;
  // child soft-hide library: if somehow navigated, bounce
  if (appState.state.role === 'child' && page === 'library') {
    appState.page = 'today';
    appState.params = {};
  }
  render();
}

function renderNav() {
  const nav = document.getElementById('main-nav');
  const role = appState.state.role;
  const items = NAV.filter((n) => n.roles.includes(role));
  nav.innerHTML = items
    .map(
      (n) =>
        `<button type="button" class="nav-btn ${appState.page === n.id ? 'active' : ''}" data-page="${n.id}">${n.label}</button>`
    )
    .join('');
  nav.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

function render() {
  renderNav();
  document.querySelectorAll('.role-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.role === appState.state.role);
  });

  const root = document.getElementById('page');
  const ctx = {
    state: appState.state,
    save,
    navigate,
    render,
    params: appState.params,
  };

  const map = {
    today: renderToday,
    library: renderLibrary,
    problems: renderProblems,
    review: renderReview,
    locklist: renderLocklist,
    weekplan: renderWeekplan,
  };
  const fn = map[appState.page] || renderToday;
  fn(root, ctx);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.role-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    appState.state.role = btn.dataset.role;
    save();
    if (appState.state.role === 'child' && appState.page === 'library') {
      navigate('today');
    } else {
      render();
    }
  });
});

render();

import { uid, exportState, importState } from '../store.js';
import { parsePdnOrMoves, movesToPdnBody } from '../draughts/pdn.js';
import { START_FEN, TAG_OPTIONS, parseFen, applyMoveList } from '../draughts/board.js';
import { mountBoard, boardAtMove } from '../draughts/BoardView.js';
import { problemTemplatesForTag } from '../seed.js';
import { extractPdfText } from '../pdf/text.js';
import { scanPdn } from '../draughts/scan.js';

export function renderLibrary(root, ctx) {
  const { state, save, navigate } = ctx;
  const view = ctx.params?.gameId ? 'detail' : 'list';
  if (view === 'detail') return renderGameDetail(root, ctx, ctx.params.gameId);
  renderGameList(root, ctx);
}

function renderGameList(root, ctx) {
  const { state, save, navigate } = ctx;
  const games = state.games || [];
  root.innerHTML = `
    <section class="card">
      <div class="row-between">
        <h2>资料库 / 棋谱</h2>
        <button type="button" class="btn primary" id="btn-new-game">新建对局</button>
      </div>
      <div id="new-game-form" class="hidden card-inset form-grid"></div>
      <div class="card-inset" id="backup-tools">
        <h3>本机备份</h3>
        <p class="muted small">数据只保存在本机。建议在换设备或大批量导入前先导出一份 JSON。</p>
        <div class="actions-row">
          <button type="button" class="btn" id="backup-export">导出 JSON</button>
          <input type="file" id="backup-file" accept="application/json,.json" />
          <button type="button" class="btn" id="backup-merge">合并导入</button>
          <button type="button" class="btn" id="backup-replace">覆盖导入</button>
        </div>
        <p id="backup-status" class="muted small" aria-live="polite"></p>
      </div>
      <div class="card-inset" id="pdf-import">
        <h3>从 PDF 导入文本层</h3>
        <p class="muted small">仅读取 PDF 中可选中的文字，不做扫描识别。读取后请检查着法，再保存为棋谱。</p>
        <div class="actions-row">
          <input type="file" id="pdf-file" accept="application/pdf,.pdf" />
          <button type="button" class="btn" id="pdf-read">读取 PDF</button>
        </div>
        <p id="pdf-status" class="muted small" aria-live="polite"></p>
        <div id="pdf-preview" class="hidden form-grid"></div>
      </div>
      <ul class="list">
        ${
          games.length
            ? games
                .map(
                  (g) => `
            <li class="list-item">
              <button type="button" class="list-btn" data-open="${g.id}">
                <strong>${esc(g.title || '未命名')}</strong>
                <span class="muted">${esc(g.date)} · ${esc(g.color)} · ${esc(g.result)} · 标记 ${g.tags?.length || 0}</span>
              </button>
            </li>`
                )
                .join('')
            : '<li class="muted">还没有棋谱，先建一局吧。</li>'
        }
      </ul>
    </section>
  `;

  root.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => navigate('library', { gameId: btn.dataset.open }));
  });

  root.querySelector('#btn-new-game').addEventListener('click', () => {
    const box = root.querySelector('#new-game-form');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      box.innerHTML = gameFormHtml();
      box.querySelector('#save-game').addEventListener('click', () => {
        const g = readGameForm(box);
        g.id = uid('game');
        g.tags = [];
        g.createdAt = Date.now();
        const parsed = parsePdnOrMoves(g.pdn);
        g.moves = parsed.moves;
        if (parsed.warnings?.length) g.parseWarnings = parsed.warnings;
        state.games.unshift(g);
        save();
        navigate('library', { gameId: g.id });
      });
    }
  });

  setupPdfImport(root, ctx);
  setupBackup(root, ctx);
}

function setupBackup(root, ctx) {
  const status = root.querySelector('#backup-status');
  root.querySelector('#backup-export').onclick = () => {
    const blob = new Blob([exportState(ctx.state)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wangzhi-train-backup-${todayInput()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.className = 'ok small';
    status.textContent = '已生成备份文件，请妥善保存。';
  };
  const runImport = async (mode) => {
    const file = root.querySelector('#backup-file').files?.[0];
    if (!file) {
      status.className = 'warn small';
      status.textContent = '请先选择 JSON 备份文件。';
      return;
    }
    try {
      const next = importState(await file.text(), ctx.state, mode);
      if (mode === 'replace' && !window.confirm('覆盖导入会替换当前本机数据，确定继续吗？')) return;
      Object.keys(ctx.state).forEach((key) => delete ctx.state[key]);
      Object.assign(ctx.state, next);
      ctx.save();
      status.className = 'ok small';
      status.textContent = mode === 'replace' ? '已覆盖导入备份。' : '已合并导入备份。';
      ctx.render();
    } catch (error) {
      status.className = 'warn small';
      status.textContent = error?.message || '导入失败，请选择有效的 JSON 备份。';
    }
  };
  root.querySelector('#backup-merge').onclick = () => runImport('merge');
  root.querySelector('#backup-replace').onclick = () => runImport('replace');
}

function setupPdfImport(root, ctx) {
  const fileInput = root.querySelector('#pdf-file');
  const readBtn = root.querySelector('#pdf-read');
  const status = root.querySelector('#pdf-status');
  const preview = root.querySelector('#pdf-preview');
  readBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      status.textContent = '请先选择一个 PDF 文件。';
      status.className = 'warn small';
      return;
    }
    readBtn.disabled = true;
    status.className = 'muted small';
    status.textContent = '正在读取文字层…';
    preview.classList.add('hidden');
    try {
      const { text } = await extractPdfText(file);
      const limitedText = text.length > 30000 ? `${text.slice(0, 30000)}\n\n（文字较长，已截取前 30000 字）` : text;
      const parsed = parsePdnOrMoves(text);
      preview.innerHTML = pdfPreviewHtml(file, limitedText, parsed.moves);
      preview.classList.remove('hidden');
      status.className = parsed.moves.length ? 'ok small' : 'warn small';
      status.textContent = parsed.moves.length
        ? `已读取文字层，并识别到 ${parsed.moves.length} 手着法；保存前可在下方修正。`
        : '已读取文字层，但没有自动识别到着法；仍可把文字整理成 PDN 后保存。';
      preview.querySelector('#pdf-save').addEventListener('click', () => {
        const pdn = preview.querySelector('#pdf-pdn').value;
        const reparsed = parsePdnOrMoves(pdn);
        const scanned = reparsed.moves.length ? scanPdn(pdn) : { nodes: [], warnings: [] };
        const notes = preview.querySelector('#pdf-notes').value.trim();
        const game = {
          id: uid('game'),
          title: preview.querySelector('#pdf-title').value.trim() || 'PDF 棋谱',
          date: preview.querySelector('#pdf-date').value || todayInput(),
          opponent: '',
          color: '白',
          result: '和',
          source: file.name,
          notes,
          pdn,
          startFen: START_FEN,
          moves: reparsed.moves,
          scanNodes: scanned.nodes,
          tags: [],
          createdAt: Date.now(),
        };
        ctx.state.games.unshift(game);
        if (reparsed.warnings?.length) game.parseWarnings = reparsed.warnings;
        ctx.state.imports = ctx.state.imports || [];
        ctx.state.imports.unshift({
          gameId: game.id,
          source: 'pdf',
          fileName: file.name,
          date: game.date,
          nodes: scanned.nodes,
          importedAt: Date.now(),
        });
        ctx.state.counters = ctx.state.counters || { gamesImported: 0, problemsDone: 0 };
        ctx.state.counters.gamesImported = Number(ctx.state.counters.gamesImported || 0) + 1;
        ctx.save();
        ctx.navigate('library', { gameId: game.id });
      });
    } catch (error) {
      status.className = 'warn small';
      status.textContent = error?.message || '读取失败，请确认 PDF 含可选中文字层。';
    } finally {
      readBtn.disabled = false;
    }
  });
}

function pdfPreviewHtml(file, text, moves) {
  return `
    <label>标题<input id="pdf-title" value="${escAttr(file.name.replace(/\.pdf$/i, ''))}" /></label>
    <label>日期<input type="date" id="pdf-date" value="${escAttr(todayInput())}" /></label>
    <label class="full">提取文字（可修正）<textarea id="pdf-notes" rows="6">${esc(text)}</textarea></label>
    <label class="full">PDN / 着法草稿（可修正）<textarea id="pdf-pdn" rows="4" placeholder="例如：1. 32-28 19-23">${esc(movesToPdnBody(moves))}</textarea></label>
    <div class="full actions-row">
      <button type="button" class="btn primary" id="pdf-save">保存到资料库</button>
    </div>
  `;
}

function gameFormHtml(g = {}) {
  return `
    <label>标题<input id="f-title" value="${escAttr(g.title || '')}" placeholder="例如：周末练习局" /></label>
    <label>日期<input type="date" id="f-date" value="${escAttr(g.date || todayInput())}" /></label>
    <label>对手<input id="f-opp" value="${escAttr(g.opponent || '')}" /></label>
    <label>颜色
      <select id="f-color">
        <option value="白" ${g.color === '白' ? 'selected' : ''}>白</option>
        <option value="黑" ${g.color === '黑' ? 'selected' : ''}>黑</option>
      </select>
    </label>
    <label>结果
      <select id="f-result">
        ${['胜', '和', '负'].map((r) => `<option ${g.result === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
    </label>
    <label>来源<input id="f-source" value="${escAttr(g.source || '')}" /></label>
    <label class="full">备注<textarea id="f-notes" rows="2">${esc(g.notes || '')}</textarea></label>
    <label class="full">PDN / 着法（如 32-28 19-23 或 16x27）
      <textarea id="f-pdn" rows="4" placeholder="粘贴 PDN 或逐手着法">${esc(g.pdn || '')}</textarea>
    </label>
    <div class="full actions-row">
      <button type="button" class="btn primary" id="save-game">保存</button>
    </div>
  `;
}

function readGameForm(box) {
  return {
    title: box.querySelector('#f-title').value.trim() || '未命名对局',
    date: box.querySelector('#f-date').value,
    opponent: box.querySelector('#f-opp').value.trim(),
    color: box.querySelector('#f-color').value,
    result: box.querySelector('#f-result').value,
    source: box.querySelector('#f-source').value.trim(),
    notes: box.querySelector('#f-notes').value.trim(),
    pdn: box.querySelector('#f-pdn').value,
    startFen: START_FEN,
    moves: [],
  };
}

function renderGameDetail(root, ctx, gameId) {
  const { state, save, navigate } = ctx;
  const game = state.games.find((g) => g.id === gameId);
  if (!game) {
    root.innerHTML = `<section class="card"><p>找不到对局</p><button class="btn" data-back>返回</button></section>`;
    root.querySelector('[data-back]').onclick = () => navigate('library');
    return;
  }

  let moveIndex = Math.min(ctx.params?.moveIndex ?? 0, (game.moves || []).length);
  const { board, warnings } = boardAtMove(game.moves || [], moveIndex, game.startFen || START_FEN);

  root.innerHTML = `
    <section class="card">
      <div class="row-between">
        <button type="button" class="btn" data-back>← 资料库</button>
        <button type="button" class="btn" id="btn-edit">编辑</button>
      </div>
      <h2>${esc(game.title)}</h2>
      <p class="muted">${esc(game.date)} · ${esc(game.opponent)} · ${esc(game.color)} · ${esc(game.result)}</p>
      <p class="muted">${esc(game.notes || '')}</p>
      ${warnings?.length ? `<p class="warn">${warnings.map(esc).join('；')}</p>` : ''}
      ${!(game.moves || []).length ? `<p class="warn">待补棋谱 — 可粘贴 PDN 后保存。</p>` : ''}
      <div id="lib-board"></div>
      <div class="move-nav actions-row">
        <button type="button" class="btn" id="mv-start">⏮</button>
        <button type="button" class="btn" id="mv-prev">◀</button>
        <span class="move-pos">第 <strong id="mv-idx">${moveIndex}</strong> / ${(game.moves || []).length} 手</span>
        <button type="button" class="btn" id="mv-next">▶</button>
        <button type="button" class="btn" id="mv-end">⏭</button>
      </div>
      <div class="moves-scroll" id="moves-list"></div>
      <div class="card-inset" id="scan-box">
        <h3>反打扫描候选</h3>
        <p class="muted small">上一手吃子后的反打时刻（A）和两跳以上连吃机会（B）会列在这里，可按节点生成自定义训练题。</p>
        <div id="scan-list"><span class="muted">正在扫描…</span></div>
      </div>
      <div class="card-inset">
        <h3>逐手录谱</h3>
        <p class="muted">输入着法（如 32-28 或 16x27），追加到棋谱末尾。</p>
        <div class="actions-row">
          <input id="mv-input" placeholder="32-28" style="flex:1;min-width:120px" />
          <button type="button" class="btn primary" id="mv-add">追加一手</button>
          <button type="button" class="btn" id="mv-pop">撤销末手</button>
        </div>
      </div>
      <div class="card-inset">
        <h3>给当前着法打标签</h3>
        <div class="tag-row" id="tag-btns">
          ${TAG_OPTIONS.map((t) => `<button type="button" class="btn soft tag-btn" data-tag="${t.id}">${t.label}</button>`).join('')}
        </div>
        <ul class="list tight" id="tag-list"></ul>
      </div>
      <div class="card-inset">
        <h3>从标记出题</h3>
        <p class="muted">选择下方某个标记 → 生成草稿题目（需家长在题库发布后孩子才能在「今天」看到）。</p>
        <div id="gen-box"></div>
      </div>
    </section>
  `;

  root.querySelector('[data-back]').onclick = () => navigate('library');

  const boardApi = mountBoard(root.querySelector('#lib-board'), { board });

  function refreshMoves() {
    const list = root.querySelector('#moves-list');
    const moves = game.moves || [];
    list.innerHTML = moves.length
      ? moves
          .map(
            (m, i) =>
              `<button type="button" class="move-chip ${i + 1 === moveIndex ? 'active' : ''}" data-i="${i + 1}">${i + 1}. ${esc(m)}</button>`
          )
          .join('')
      : '<span class="muted">无着法</span>';
    list.querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        moveIndex = Number(btn.dataset.i);
        syncBoard();
      });
    });
    root.querySelector('#mv-idx').textContent = String(moveIndex);
    refreshTags();
    refreshScan();
  }

  function refreshScan() {
    const box = root.querySelector('#scan-list');
    const scanned = scanPdn(movesToPdnBody(game.moves || []), game.startFen || START_FEN);
    game.scanNodes = scanned.nodes;
    box.innerHTML = scanned.nodes.length
      ? scanned.nodes.map((node) => `
          <div class="list-item row-between wrap">
            <span><strong>${esc(node.kind)}</strong> · 第${node.moveNumber}手 · ${node.sideToMove === 'W' ? '白' : '黑'}方 · ${node.answers[0]?.join('x') || ''}</span>
            <button type="button" class="btn primary" data-scan-gen="${escAttr(node.id)}">生成草稿</button>
          </div>`).join('')
      : '<span class="muted">暂未发现候选节点；补充有效 PDN 后会自动扫描。</span>';
    box.querySelectorAll('[data-scan-gen]').forEach((btn) => {
      btn.onclick = () => {
        const node = scanned.nodes.find((n) => n.id === btn.dataset.scanGen);
        if (!node) return;
        const problem = {
          id: `IMP-${game.id}-${node.moveNumber}`,
          title: `${game.title} · ${node.kind} · 第${node.moveNumber}手`,
          type: '反打预警·逆向',
          gameId: game.id,
          gameTitle: game.title,
          moveNumber: node.moveNumber,
          moveLabel: `第${node.moveNumber}手`,
          tag: node.type === 'A' ? '被反打' : '好组合',
          prompt: node.type === 'A' ? '先站到对手角度，找出唯一的反击线。' : '先找出对手可能的连吃线，再决定自己的走法。',
          answerNotes: `扫描答案线：${node.answers.map((path) => path.join('x')).join('；')}`,
          status: '草稿',
          fen: game.startFen || START_FEN,
          nodePosition: node.position,
          answers: node.answers,
          placeholder: false,
          createdAt: Date.now(),
          publishedAt: null,
          publishDate: null,
          completions: {},
        };
        const exists = state.problems.some((p) => p.id === problem.id);
        if (!exists) state.problems.unshift(problem);
        game.customLevelIds = [...new Set([...(game.customLevelIds || []), problem.id])];
        state.customLevels = state.customLevels || [];
        if (!state.customLevels.some((level) => level.id === problem.id)) state.customLevels.unshift({ ...problem, source: 'scan' });
        save();
        box.innerHTML = `<p class="ok">已生成草稿「${esc(problem.title)}」。可到题库继续编辑和发布。</p>`;
      };
    });
  }

  function syncBoard() {
    const r = boardAtMove(game.moves || [], moveIndex, game.startFen || START_FEN);
    boardApi.setBoard(r.board);
    refreshMoves();
  }

  root.querySelector('#mv-start').onclick = () => {
    moveIndex = 0;
    syncBoard();
  };
  root.querySelector('#mv-prev').onclick = () => {
    moveIndex = Math.max(0, moveIndex - 1);
    syncBoard();
  };
  root.querySelector('#mv-next').onclick = () => {
    moveIndex = Math.min((game.moves || []).length, moveIndex + 1);
    syncBoard();
  };
  root.querySelector('#mv-end').onclick = () => {
    moveIndex = (game.moves || []).length;
    syncBoard();
  };

  root.querySelectorAll('[data-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      game.tags = game.tags || [];
      game.tags.push({
        id: uid('tag'),
        moveIndex,
        moveLabel: `第${moveIndex}手`,
        tag,
        note: '',
      });
      save();
      refreshTags();
    });
  });

  function refreshTags() {
    const ul = root.querySelector('#tag-list');
    const tags = game.tags || [];
    ul.innerHTML = tags.length
      ? tags
          .map(
            (t) => `
        <li class="list-item row-between">
          <span><strong>${esc(t.tag)}</strong> · ${esc(t.moveLabel || '第' + t.moveIndex + '手')}</span>
          <span class="actions-row">
            <button type="button" class="btn" data-goto="${t.moveIndex}">跳转</button>
            <button type="button" class="btn primary" data-gen="${t.id}">出题</button>
            <button type="button" class="btn danger" data-del-tag="${t.id}">删</button>
          </span>
        </li>`
          )
          .join('')
      : '<li class="muted">尚未标记</li>';

    ul.querySelectorAll('[data-goto]').forEach((b) => {
      b.onclick = () => {
        moveIndex = Number(b.dataset.goto);
        syncBoard();
      };
    });
    ul.querySelectorAll('[data-del-tag]').forEach((b) => {
      b.onclick = () => {
        game.tags = game.tags.filter((t) => t.id !== b.dataset.delTag);
        save();
        refreshTags();
      };
    });
    ul.querySelectorAll('[data-gen]').forEach((b) => {
      b.onclick = () => showGen(b.dataset.gen);
    });
  }

  function showGen(tagId) {
    const tag = (game.tags || []).find((t) => t.id === tagId);
    if (!tag) return;
    const templates = problemTemplatesForTag(tag.tag);
    const box = root.querySelector('#gen-box');
    box.innerHTML = `
      <label>模板
        <select id="gen-type">
          ${templates.map((t) => `<option value="${escAttr(t.type)}">${esc(t.type)}</option>`).join('')}
        </select>
      </label>
      <label>标题<input id="gen-title" value="${escAttr(game.title + ' · ' + tag.tag + ' · ' + (tag.moveLabel || ''))}" /></label>
      <label>提示语<textarea id="gen-prompt" rows="3">${esc(templates[0]?.promptHint || '')}</textarea></label>
      <label>家长答案备注<textarea id="gen-ans" rows="2" placeholder="仅家长/提交后可见"></textarea></label>
      <button type="button" class="btn primary" id="gen-save">生成草稿题目</button>
    `;
    const typeSel = box.querySelector('#gen-type');
    typeSel.onchange = () => {
      const t = templates.find((x) => x.type === typeSel.value);
      if (t) box.querySelector('#gen-prompt').value = t.promptHint;
    };
    box.querySelector('#gen-save').onclick = () => {
      const fenBoard = boardAtMove(game.moves || [], tag.moveIndex, game.startFen || START_FEN).board;
      // store fen string simply as start for MVP if no moves
      const problem = {
        id: uid('prob'),
        title: box.querySelector('#gen-title').value.trim(),
        type: typeSel.value,
        gameId: game.id,
        gameTitle: game.title,
        moveNumber: tag.moveIndex,
        moveLabel: tag.moveLabel,
        tagId: tag.id,
        tag: tag.tag,
        prompt: box.querySelector('#gen-prompt').value.trim(),
        answerNotes: box.querySelector('#gen-ans').value.trim(),
        status: '草稿',
        fen: START_FEN,
        placeholder: !(game.moves || []).length,
        createdAt: Date.now(),
        publishedAt: null,
        publishDate: null,
        completions: {},
      };
      state.problems.unshift(problem);
      save();
      box.innerHTML = `<p class="ok">已生成草稿「${esc(problem.title)}」。请到题库发布。</p>
        <button type="button" class="btn" id="go-prob">去题库</button>`;
      box.querySelector('#go-prob').onclick = () => navigate('problems');
    };
  }

  root.querySelector('#mv-add').onclick = () => {
    const inp = root.querySelector('#mv-input');
    const v = (inp.value || '').trim();
    if (!v) return;
    game.moves = game.moves || [];
    game.moves.push(v.replace(/X/g, 'x'));
    save();
    moveIndex = game.moves.length;
    syncBoard();
    inp.value = '';
  };
  root.querySelector('#mv-pop').onclick = () => {
    if (!(game.moves || []).length) return;
    game.moves.pop();
    save();
    moveIndex = Math.min(moveIndex, game.moves.length);
    syncBoard();
  };
  root.querySelector('#mv-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') root.querySelector('#mv-add').click();
  });

  root.querySelector('#btn-edit').onclick = () => {
    const box = document.createElement('div');
    box.className = 'card-inset form-grid';
    box.innerHTML = gameFormHtml(game) + `<button type="button" class="btn" id="cancel-edit">取消</button>`;
    root.querySelector('section.card').appendChild(box);
    box.querySelector('#save-game').onclick = () => {
      const data = readGameForm(box);
      Object.assign(game, data);
      const parsed = parsePdnOrMoves(game.pdn);
      game.moves = parsed.moves;
      game.parseWarnings = parsed.warnings;
      save();
      navigate('library', { gameId: game.id });
    };
    box.querySelector('#cancel-edit').onclick = () => box.remove();
  };

  refreshMoves();
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
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}

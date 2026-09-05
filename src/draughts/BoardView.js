import { sqToRC, START_FEN, parseFen, applyMoveList } from './board.js';

/**
 * Render / update a 10×10 international draughts board.
 * @param {HTMLElement} el
 * @param {object} opts
 */
export function mountBoard(el, opts = {}) {
  const state = {
    board: opts.board || parseFen(START_FEN).board,
    selected: null,
    highlights: new Set(opts.highlights || []),
    interactive: !!opts.interactive,
    onSquare: opts.onSquare || null,
    showNumbers: opts.showNumbers !== false,
    orientation: opts.orientation || 'white', // white at bottom
  };

  el.classList.add('board-wrap');
  el.innerHTML = `
    <div class="board" role="grid" aria-label="国际跳棋棋盘"></div>
    <div class="board-legend"><span>1–50 为可走黑格</span></div>
  `;
  const boardEl = el.querySelector('.board');

  function render() {
    boardEl.innerHTML = '';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const r = state.orientation === 'white' ? row : 9 - row;
        const c = state.orientation === 'white' ? col : 9 - col;
        const dark = (r + c) % 2 === 1;
        const sq = dark ? (() => {
          // compute sq from r,c
          const colInRow = r % 2 === 0 ? (c - 1) / 2 : c / 2;
          return r * 5 + colInRow + 1;
        })() : null;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `sq ${dark ? 'dark' : 'light'}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        if (sq) {
          cell.dataset.sq = String(sq);
          cell.setAttribute('aria-label', `格 ${sq}`);
          if (state.showNumbers) {
            const num = document.createElement('span');
            num.className = 'sq-num';
            num.textContent = String(sq);
            cell.appendChild(num);
          }
          if (state.highlights.has(sq)) cell.classList.add('hl');
          if (state.selected === sq) cell.classList.add('selected');
          const piece = state.board[sq];
          if (piece) {
            const p = document.createElement('span');
            p.className = `piece ${piece.color === 'W' ? 'white' : 'black'}${piece.king ? ' king' : ''}`;
            p.setAttribute('aria-hidden', 'true');
            cell.appendChild(p);
          }
        } else {
          cell.disabled = true;
          cell.tabIndex = -1;
        }
        if (dark && (state.interactive || state.onSquare)) {
          cell.addEventListener('click', () => {
            if (state.onSquare) state.onSquare(sq, state.board[sq]);
          });
        }
        boardEl.appendChild(cell);
      }
    }
  }

  const api = {
    setBoard(board) {
      state.board = board;
      render();
    },
    getBoard() {
      return state.board;
    },
    setHighlights(sqs) {
      state.highlights = new Set(sqs || []);
      render();
    },
    toggleHighlight(sq) {
      if (state.highlights.has(sq)) state.highlights.delete(sq);
      else state.highlights.add(sq);
      render();
      return [...state.highlights];
    },
    clearHighlights() {
      state.highlights.clear();
      render();
    },
    getHighlights() {
      return [...state.highlights];
    },
    setInteractive(v) {
      state.interactive = !!v;
    },
    render,
  };

  render();
  return api;
}

/** Build board at move index from game moves. */
export function boardAtMove(moves, moveIndex, startFen = START_FEN) {
  const { board: start } = parseFen(startFen);
  const { board, snapshots, warnings } = applyMoveList(start, moves || [], moveIndex);
  return { board, snapshots, warnings };
}

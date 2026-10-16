/**
 * International draughts (FMJD / 中国100格) move generator.
 * Ported from puzzle-boards draughts-rules.js.
 * A man promotes only when the move ends on 1–5 (white) or 46–50 (black).
 * Passing the promotion line during a multi-capture does not turn the man into a king.
 */
const DIRS = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  function squareToRC(n) {
    const i = n - 1;
    const row = Math.floor(i / 5);
    const k = i % 5;
    const col = row % 2 === 0 ? k * 2 + 1 : k * 2;
    return { row, col };
  }

  function rcToSquare(row, col) {
    if (row < 0 || row > 9 || col < 0 || col > 9) return null;
    if ((row + col) % 2 === 0) return null;
    const k = row % 2 === 0 ? (col - 1) / 2 : col / 2;
    return row * 5 + k + 1;
  }

  function clonePieces(src) {
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      out[k] = { color: v.color, king: !!v.king };
    }
    return out;
  }

  function shouldPromote(color, sq) {
    return (color === "w" && sq <= 5) || (color === "b" && sq >= 46);
  }

  function pieceAt(pieces, sq) {
    return pieces[sq] || pieces[String(sq)] || null;
  }

  function singleJumps(pieces, fromSq, color, isKing, capturedSet) {
    const jumps = [];
    const { row, col } = squareToRC(fromSq);

    if (!isKing) {
      for (const [dr, dc] of DIRS) {
        const mid = rcToSquare(row + dr, col + dc);
        const land = rcToSquare(row + 2 * dr, col + 2 * dc);
        if (mid == null || land == null) continue;
        const victim = pieceAt(pieces, mid);
        if (!victim || victim.color === color) continue;
        if (capturedSet.has(mid)) continue;
        if (pieceAt(pieces, land)) continue;
        jumps.push({ land, victim: mid, becomesKing: shouldPromote(color, land) });
      }
      return jumps;
    }

    for (const [dr, dc] of DIRS) {
      let r = row + dr;
      let c = col + dc;
      while (true) {
        const sq = rcToSquare(r, c);
        if (sq == null) break;
        const p = pieceAt(pieces, sq);
        if (!p) {
          r += dr;
          c += dc;
          continue;
        }
        if (p.color === color || capturedSet.has(sq)) break;
        const victim = sq;
        let lr = r + dr;
        let lc = c + dc;
        while (true) {
          const land = rcToSquare(lr, lc);
          if (land == null) break;
          if (pieceAt(pieces, land)) break;
          jumps.push({ land, victim, becomesKing: true });
          lr += dr;
          lc += dc;
        }
        break;
      }
    }
    return jumps;
  }

  function captureSequencesFrom(pieces, fromSq, color, isKing, capturedSet) {
    const results = [];
    const jumps = singleJumps(pieces, fromSq, color, isKing, capturedSet);

    for (const j of jumps) {
      const nextKing = isKing; // FMJD/中国国际跳棋: no mid-capture promotion
      const nextCaptured = new Set(capturedSet);
      nextCaptured.add(j.victim);

      const nextPieces = clonePieces(pieces);
      delete nextPieces[fromSq];
      delete nextPieces[String(fromSq)];
      nextPieces[j.land] = { color, king: nextKing };

      const further = captureSequencesFrom(
        nextPieces,
        j.land,
        color,
        nextKing,
        nextCaptured
      );

      if (further.length === 0) {
        results.push({ path: [fromSq, j.land], captures: [j.victim] });
      } else {
        for (const f of further) {
          results.push({
            path: [fromSq].concat(f.path),
            captures: [j.victim].concat(f.captures),
          });
        }
      }
    }
    return results;
  }

  function quietMovesFrom(pieces, fromSq, color, isKing) {
    const moves = [];
    const { row, col } = squareToRC(fromSq);

    if (!isKing) {
      const forward = color === "w" ? -1 : 1;
      for (const dc of [-1, 1]) {
        const to = rcToSquare(row + forward, col + dc);
        if (to != null && !pieceAt(pieces, to)) {
          moves.push({
            path: [fromSq, to],
            captures: [],
            promote: shouldPromote(color, to),
          });
        }
      }
      return moves;
    }

    for (const [dr, dc] of DIRS) {
      let r = row + dr;
      let c = col + dc;
      while (true) {
        const to = rcToSquare(r, c);
        if (to == null) break;
        if (pieceAt(pieces, to)) break;
        moves.push({ path: [fromSq, to], captures: [], promote: false });
        r += dr;
        c += dc;
      }
    }
    return moves;
  }

  function notationFor(path, captures) {
    if (!path || path.length < 2) return "";
    const sep = captures && captures.length ? "x" : "-";
    return path.join(sep);
  }

  function getLegalMoves(pieces, side) {
    const allCaptures = [];
    for (const key of Object.keys(pieces)) {
      const sq = Number(key);
      const p = pieces[key];
      if (!p || p.color !== side) continue;
      const seqs = captureSequencesFrom(pieces, sq, p.color, !!p.king, new Set());
      for (const s of seqs) {
        allCaptures.push({
          from: s.path[0],
          to: s.path[s.path.length - 1],
          path: s.path.slice(),
          captures: s.captures.slice(),
          notation: notationFor(s.path, s.captures),
          isCapture: true,
        });
      }
    }

    if (allCaptures.length > 0) {
      let maxN = 0;
      for (const m of allCaptures) maxN = Math.max(maxN, m.captures.length);
      return allCaptures.filter((m) => m.captures.length === maxN);
    }

    const quiets = [];
    for (const key of Object.keys(pieces)) {
      const sq = Number(key);
      const p = pieces[key];
      if (!p || p.color !== side) continue;
      for (const q of quietMovesFrom(pieces, sq, p.color, !!p.king)) {
        quiets.push({
          from: q.path[0],
          to: q.path[q.path.length - 1],
          path: q.path.slice(),
          captures: [],
          notation: notationFor(q.path, []),
          isCapture: false,
        });
      }
    }
    return quiets;
  }

  /** Next landing squares while a multi-capture is in progress. */
  function continuationDestinations(pieces, side, active) {
    const current = active.path[active.path.length - 1];
    const piece = pieceAt(pieces, current);
    if (!piece) return [];
    const capturedSet = new Set(active.captures);
    const seqs = captureSequencesFrom(
      pieces,
      current,
      side,
      !!piece.king,
      capturedSet
    );
    const need = active.maxCaptures - active.captures.length;
    const valid = seqs.filter((s) => s.captures.length === need);
    const dests = [];
    const seen = new Set();
    for (const s of valid) {
      const land = s.path[1];
      if (seen.has(land)) continue;
      seen.add(land);
      dests.push({ to: land, seq: s });
    }
    return dests;
  }

  function getLegalForSelection(pieces, side, selected, active) {
    if (active) {
      const cont = continuationDestinations(pieces, side, active);
      return {
        moves: [],
        continuations: cont,
        destinations: cont.map((c) => c.to),
        mustCapture: true,
        maxCaptures: active.maxCaptures,
        active: true,
        selectable: [active.path[active.path.length - 1]],
      };
    }

    const all = getLegalMoves(pieces, side);
    const mustCapture = all.length > 0 && all[0].isCapture;
    const maxCaptures = mustCapture ? all[0].captures.length : 0;
    const selectable = [...new Set(all.map((m) => m.from))];

    if (selected == null) {
      return {
        moves: all,
        continuations: [],
        destinations: [],
        mustCapture,
        maxCaptures,
        active: false,
        selectable,
      };
    }

    const fromMoves = all.filter((m) => m.from === selected);
    const dests = [...new Set(fromMoves.map((m) => m.path[1]))];
    return {
      moves: all,
      fromMoves,
      continuations: [],
      destinations: dests,
      mustCapture,
      maxCaptures,
      active: false,
      selectable,
    };
  }

  function diagnoseIllegal(pieces, side, from, to, all, mustCapture, maxCaptures) {
    const piece = pieceAt(pieces, from);
    if (!piece) return { error: "没有棋子", errorCode: "illegal" };
    if (piece.color !== side) {
      return {
        error: "现在轮到" + (side === "w" ? "白" : "黑") + "走",
        errorCode: "wrong_side",
      };
    }
    if (pieceAt(pieces, to)) {
      return { error: "目标格有子", errorCode: "occupied" };
    }

    if (mustCapture) {
      const rawCaps = captureSequencesFrom(
        pieces,
        from,
        piece.color,
        !!piece.king,
        new Set()
      );
      const hit = rawCaps.find((s) => s.path[1] === to);
      if (hit && hit.captures.length < maxCaptures) {
        return { error: "必须吃最多", errorCode: "must_majority" };
      }
      const { row: r0, col: c0 } = squareToRC(from);
      const { row: r1, col: c1 } = squareToRC(to);
      if (Math.abs(r1 - r0) === 1 && Math.abs(c1 - c0) === 1) {
        return { error: "必须吃子", errorCode: "must_capture" };
      }
      return { error: "必须吃子", errorCode: "must_capture" };
    }

    if (!piece.king) {
      const { row: r0 } = squareToRC(from);
      const { row: r1 } = squareToRC(to);
      const forward = side === "w" ? -1 : 1;
      if (Math.sign(r1 - r0) === -forward) {
        return { error: "只能往前走", errorCode: "forward_only" };
      }
    }
    return { error: "不合法的着法", errorCode: "illegal" };
  }

  function finishCapture(pieces, side, atSq, allCaptures) {
    const next = clonePieces(pieces);
    for (const v of allCaptures) {
      delete next[v];
      delete next[String(v)];
    }
    if (next[atSq] && shouldPromote(side, atSq)) next[atSq].king = true;
    return next;
  }

  /**
   * Apply one step from -> to.
   * active: null | { path, captures, maxCaptures }
   */
  function tryStep(pieces, side, from, to, active) {
    if (active) {
      const current = active.path[active.path.length - 1];
      if (from !== current) {
        return { ok: false, error: "必须继续吃子", errorCode: "must_continue" };
      }
      const cont = continuationDestinations(pieces, side, active);
      const hit = cont.find((c) => c.to === to);
      if (!hit) {
        return {
          ok: false,
          error: cont.length ? "必须继续吃子" : "不合法的着法",
          errorCode: cont.length ? "must_continue" : "illegal",
        };
      }
      const seq = hit.seq; // path starts at current: [current, land, ...]
      const victim = seq.captures[0];
      const nextPieces = clonePieces(pieces);
      const moving = pieceAt(nextPieces, from);
      delete nextPieces[from];
      delete nextPieces[String(from)];
      // Promote only when capture sequence finishes (finishCapture), not mid-capture
      const nowKing = !!(moving && moving.king);
      nextPieces[to] = { color: side, king: nowKing };

      const nextPath = active.path.concat([to]);
      const nextCaptures = active.captures.concat([victim]);

      if (seq.path.length === 2) {
        // Completes the required captures
        const finalPieces = finishCapture(nextPieces, side, to, nextCaptures);
        return {
          ok: true,
          pieces: finalPieces,
          active: null,
          completedMove: {
            path: nextPath.slice(),
            captures: nextCaptures.slice(),
            notation: notationFor(nextPath, nextCaptures),
            isCapture: true,
          },
        };
      }

      return {
        ok: true,
        pieces: nextPieces,
        active: {
          path: nextPath,
          captures: nextCaptures,
          maxCaptures: active.maxCaptures,
        },
        completedMove: null,
      };
    }

    const piece = pieceAt(pieces, from);
    if (!piece) {
      return { ok: false, error: "没有棋子", errorCode: "illegal" };
    }
    if (piece.color !== side) {
      return {
        ok: false,
        error: "现在轮到" + (side === "w" ? "白" : "黑") + "走",
        errorCode: "wrong_side",
      };
    }

    const all = getLegalMoves(pieces, side);
    const mustCapture = all.length > 0 && all[0].isCapture;
    const maxCaptures = mustCapture ? all[0].captures.length : 0;
    const matching = all.filter((m) => m.from === from && m.path[1] === to);

    if (matching.length === 0) {
      const d = diagnoseIllegal(
        pieces,
        side,
        from,
        to,
        all,
        mustCapture,
        maxCaptures
      );
      return { ok: false, error: d.error, errorCode: d.errorCode };
    }

    const full = matching[0];
    const nextPieces = clonePieces(pieces);
    delete nextPieces[from];
    delete nextPieces[String(from)];
    // Captures: keep existing king status until finishCapture; quiet: promote on landing
    const nowKing = full.isCapture
      ? !!piece.king
      : !!piece.king || shouldPromote(side, to);
    nextPieces[to] = { color: side, king: nowKing };

    if (!full.isCapture) {
      if (shouldPromote(side, to)) nextPieces[to].king = true;
      return {
        ok: true,
        pieces: nextPieces,
        active: null,
        completedMove: {
          path: full.path.slice(),
          captures: [],
          notation: full.notation,
          isCapture: false,
        },
      };
    }

    if (full.path.length === 2) {
      const finalPieces = finishCapture(nextPieces, side, to, full.captures);
      return {
        ok: true,
        pieces: finalPieces,
        active: null,
        completedMove: {
          path: full.path.slice(),
          captures: full.captures.slice(),
          notation: full.notation,
          isCapture: true,
        },
      };
    }

    return {
      ok: true,
      pieces: nextPieces,
      active: {
        path: [from, to],
        captures: [full.captures[0]],
        maxCaptures,
      },
      completedMove: null,
    };
  }

  
export {
  squareToRC,
  rcToSquare,
  clonePieces,
  shouldPromote,
  getLegalMoves,
  getLegalForSelection,
  tryStep,
  captureSequencesFrom,
  quietMovesFrom,
  notationFor,
  continuationDestinations,
  DIRS,
};

const API = {
  squareToRC,
  rcToSquare,
  clonePieces,
  shouldPromote,
  getLegalMoves,
  getLegalForSelection,
  tryStep,
  captureSequencesFrom,
  quietMovesFrom,
  notationFor,
  continuationDestinations,
  DIRS,
};

export default API;

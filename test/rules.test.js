import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/draughts/rules.js';

test('FMJD / 中国100格 着法生成（含过底线不成王）', () => {
  const failures = [];
  function check(name, cond, detail) {
    if (!cond) failures.push(name + (detail ? ` — ${detail}` : ''));
  }

function board(spec) {
  // spec: { w: [sq...], b: [sq...], wk: [], bk: [] }
  const pieces = {};
  for (const n of spec.w || []) pieces[n] = { color: "w", king: false };
  for (const n of spec.b || []) pieces[n] = { color: "b", king: false };
  for (const n of spec.wk || []) pieces[n] = { color: "w", king: true };
  for (const n of spec.bk || []) pieces[n] = { color: "b", king: true };
  return pieces;
}

function hasMove(moves, from, to) {
  return moves.some((m) => m.from === from && m.path[1] === to);
}

function hasNotation(moves, notation) {
  return moves.some((m) => m.notation === notation);
}

// --- Mapping sanity ---
check("square 1 -> row0 col1", (() => {
  const p = R.squareToRC(1);
  return p.row === 0 && p.col === 1;
})());
check("square 6 -> row1 col0", (() => {
  const p = R.squareToRC(6);
  return p.row === 1 && p.col === 0;
})());
check("rcToSquare roundtrip 1..50", (() => {
  for (let n = 1; n <= 50; n++) {
    const { row, col } = R.squareToRC(n);
    if (R.rcToSquare(row, col) !== n) return false;
  }
  return true;
})());

// --- Quiet forward man move legal; backward quiet illegal ---
{
  // White man on 33 (row 6); forward toward lower numbers: 28 or 29
  const pieces = board({ w: [33], b: [] });
  const moves = R.getLegalMoves(pieces, "w");
  check("white man quiet forward from 33 exists", moves.some((m) => m.from === 33 && !m.isCapture));
  const dests = moves.filter((m) => m.from === 33).map((m) => m.to);
  check("white 33 can go 28 or 29", dests.includes(28) && dests.includes(29), `got ${dests}`);
  // Backward would be 38/39
  check("white 33 cannot quiet to 38", !hasMove(moves, 33, 38));
  check("white 33 cannot quiet to 39", !hasMove(moves, 33, 39));

  const back = R.tryStep(pieces, "w", 33, 38, null);
  check("tryStep backward quiet rejected", !back.ok && back.errorCode === "forward_only", JSON.stringify(back));
}

{
  // Black man on 18; forward toward higher numbers: 22 or 23
  const pieces = board({ w: [], b: [18] });
  const moves = R.getLegalMoves(pieces, "b");
  const dests = moves.filter((m) => m.from === 18).map((m) => m.to);
  check("black 18 forward 22/23", dests.includes(22) && dests.includes(23), `got ${dests}`);
  check("black 18 cannot quiet back to 12", !hasMove(moves, 18, 12));
  check("black 18 cannot quiet back to 13", !hasMove(moves, 18, 13));
}

// --- When capture exists, quiet move rejected ---
{
  // White 33, black 28 adjacent diagonally — white can capture 28 landing 22
  // 33 rc: row6 col4? Let me check: n=33 -> i=32, row=6, k=2, col= even row? row6 even: col=2*2+1=5
  // 28: i=27, row=5, k=2, col= odd row: col=4
  // 22: i=21, row=4, k=1, col= even: col=3
  // dirs from 33 (6,5): to 28 would be row-1,col-1 = (5,4)=28 yes; land (4,3)=22 yes
  const pieces = board({ w: [33], b: [28] });
  const moves = R.getLegalMoves(pieces, "w");
  check("capture exists when adjacent enemy", moves.length > 0 && moves.every((m) => m.isCapture), `moves=${JSON.stringify(moves)}`);
  check("quiet not in legal list when capture exists", !moves.some((m) => !m.isCapture));
  const quietTry = R.tryStep(pieces, "w", 33, 29, null);
  check("quiet tryStep rejected with must_capture", !quietTry.ok && quietTry.errorCode === "must_capture", JSON.stringify(quietTry));
  check("capture 33x22 legal", hasNotation(moves, "33x22") || moves.some((m) => m.from === 33 && m.to === 22), JSON.stringify(moves));
}

// --- Man can capture backward ---
{
  // White on 28, black on 33 (behind white) — white captures backward to 39
  // 28 (5,4), 33 (6,5), land 39: i=38,row=7,k=3,col=odd:6 -> (7,6)
  // from (5,4)+(+1,+1)=(6,5)=33, +(+1,+1)=(7,6)=39
  const pieces = board({ w: [28], b: [33] });
  const moves = R.getLegalMoves(pieces, "w");
  check("man can capture backward", moves.some((m) => m.from === 28 && m.captures.includes(33)), JSON.stringify(moves));
}

// --- Majority rule: 2-capture beats 1-capture ---
{
  // Construct: white at 27 can capture one way (1 piece) or another (2 pieces)
  // Classic setup:
  // White 32; black 27 and 18 for a double; also black 28 for a single the other way
  // 32: i=31,row=6,k=1,col=3
  // Capture left-up: mid 27 (5,2), land 21 (4,1) — then from 21 maybe more?
  // Capture right-up: mid 28 (5,4), land 23 (4,5)
  // For double: white 35, black 30 and 24? 
  // Simpler known: W on 27, B on 22 and 13 for long capture; and B on 21 for short.
  // 27 (5,2): capture NW to mid 21 (4,1) land 16 (3,0)
  // Also capture NE mid 22 (4,3) land 18 (3,4), then from 18 capture mid 13? 
  // Let's place: w:[27], b:[22,13] for double 27x18x9? 
  // 18 (3,4): +(-1,-1)=(2,3)=13, land (1,2)=8? 
  // 13 is (2,3), land from 18: (3,4)+(-1,-1)=(2,3)=13, (1,2)=9? n=9: i=8,row=1,k=3,col=6. 
  // (1,2): row1 odd, col2 -> k=1 -> sq=1*5+1+1=7. So 27x18x7 capturing 22,13.
  // Single alternative: also put black on 21: 27x16 capturing 21 only.
  const pieces = board({ w: [27], b: [22, 13, 21] });
  const moves = R.getLegalMoves(pieces, "w");
  const lens = moves.map((m) => m.captures.length);
  check("majority: only max-length captures legal", lens.every((n) => n === Math.max(...lens)), `lens=${lens}`);
  check("majority: max is 2", Math.max(...lens) === 2, `lens=${lens} moves=${JSON.stringify(moves)}`);
  check("majority: single capture not legal", !moves.some((m) => m.captures.length === 1), JSON.stringify(moves));
  // Starting the single should be rejected
  const singleStart = R.tryStep(pieces, "w", 27, 16, null);
  check("majority: starting 1-capture rejected", !singleStart.ok && singleStart.errorCode === "must_majority", JSON.stringify(singleStart));
}

// --- Flying king quiet slide ---
{
  const pieces = board({ wk: [28], b: [] });
  const moves = R.getLegalMoves(pieces, "w");
  check("king has long quiet slides", moves.filter((m) => m.from === 28).length > 2, `count=${moves.length}`);
  // 28 can go far on diagonals
  check("king can reach distant square", moves.some((m) => m.from === 28 && m.to === 6) || moves.some((m) => m.path.includes(6) || m.to === 37), JSON.stringify(moves.map(m=>m.notation)));
}

// --- Flying king capture with choice of landing ---
{
  // King white on 46, black man on 28 — clear path, land beyond on empty
  // Check path 46 to 28
  const pieces = board({ wk: [46], b: [28] });
  const moves = R.getLegalMoves(pieces, "w");
  const caps = moves.filter((m) => m.isCapture && m.captures.includes(28));
  check("flying king can capture", caps.length >= 1, JSON.stringify(moves));
  check("flying king multiple landing options beyond", caps.length >= 2, `landings=${caps.map(m=>m.to)}`);
}

// --- Captured piece cannot be jumped twice; stay as blockers ---
{
  // If only one enemy, max capture is 1 even if landing would align for re-jump of same
  const pieces = board({ w: [33], b: [28] });
  const seqs = R.captureSequencesFrom(pieces, 33, "w", false, new Set());
  check("cannot capture same piece twice", seqs.every((s) => new Set(s.captures).size === s.captures.length));
}

// --- Promotion on quiet ---
{
  // White man on 6 can go to 1 or 2
  const pieces = board({ w: [6], b: [] });
  const res = R.tryStep(pieces, "w", 6, 1, null);
  check("promote white on reaching 1", res.ok && res.pieces[1] && res.pieces[1].king, JSON.stringify(res));
}

// --- Multi-jump continuation forced ---
{
  const pieces = board({ w: [27], b: [22, 13] });
  const moves = R.getLegalMoves(pieces, "w");
  check("double capture available", moves.some((m) => m.captures.length === 2), JSON.stringify(moves));
  const first = R.tryStep(pieces, "w", 27, 18, null);
  check("after first jump still active", first.ok && first.active, JSON.stringify(first));
  check("turn not complete after first of double", !first.completedMove);
  const info = R.getLegalForSelection(first.pieces, "w", first.active.path[first.active.path.length - 1], first.active);
  check("must continue to next land", info.destinations.length >= 1, JSON.stringify(info.destinations));
  // Trying to stop / move elsewhere
  const bad = R.tryStep(first.pieces, "w", 18, 23, first.active);
  check("illegal stop mid-capture", !bad.ok, JSON.stringify(bad));
  const fin = R.tryStep(first.pieces, "w", 18, info.destinations[0], first.active);
  check("second jump completes", fin.ok && fin.completedMove && fin.completedMove.captures.length === 2, JSON.stringify(fin.completedMove));
  check("victims removed at end", fin.ok && !fin.pieces[22] && !fin.pieces[13]);
}


// --- FMJD / 中国国际跳棋 Art.14: promote only when move ends on promotion line ---
// Mid-capture landing on promotion square then continuing: stays man; further jumps are man jumps.
{
  // 11x2x13: land on 2 (white promo) mid-sequence, continue as man over 8 to 13 (not promo)
  const pieces = board({ w: [11], b: [7, 8] });
  const moves = R.getLegalMoves(pieces, "w");
  check(
    "man multi-capture via promo square still legal as man jumps",
    moves.some((m) => m.notation === "11x2x13"),
    JSON.stringify(moves.map((m) => m.notation))
  );
  // Old Russian-style: flying-king continuation over distant 13 must NOT appear
  const russian = board({ w: [11], b: [7, 13] });
  const rusMoves = R.getLegalMoves(russian, "w");
  check(
    "no mid-capture promote-as-flying-king over distant piece",
    !rusMoves.some((m) => m.captures.length === 2),
    JSON.stringify(rusMoves.map((m) => m.notation))
  );
  const first = R.tryStep(pieces, "w", 11, 2, null);
  check(
    "mid-capture on promo square: still man (not king)",
    first.ok && first.active && first.pieces[2] && !first.pieces[2].king,
    JSON.stringify(first.pieces[2])
  );
  const cont = R.continuationDestinations(first.pieces, "w", first.active);
  check(
    "continuation from promo square is man jump (to 13)",
    cont.some((c) => c.to === 13),
    JSON.stringify(cont.map((c) => c.to))
  );
  const fin = R.tryStep(first.pieces, "w", 2, 13, first.active);
  check(
    "final square not on promo line → not king after finish",
    fin.ok && fin.completedMove && fin.completedMove.captures.length === 2 && fin.pieces[13] && !fin.pieces[13].king,
    JSON.stringify({ completed: fin.completedMove, piece: fin.pieces[13] })
  );
}

// Single capture ending on promotion row → is king after finish
{
  const pieces = board({ w: [11], b: [7] });
  const fin = R.tryStep(pieces, "w", 11, 2, null);
  check(
    "final square IS on promo line → is king after finish",
    fin.ok && fin.completedMove && fin.pieces[2] && fin.pieces[2].king,
    JSON.stringify(fin.pieces[2])
  );
}

// Multi-capture ending on black promo (46–50) → king; intermediate not king
{
  // Black man 20x29x38x49 style short: 39x48 over 43? Use simple 35x44x53 impossible.
  // 30x39x48: check geometry — or use 20x29 ending? Single step to promo:
  const pieces = board({ b: [39], w: [43] });
  // 39 over 43 → 48 (black promo 46-50)
  const fin = R.tryStep(pieces, "b", 39, 48, null);
  check(
    "black capture ending on 48 promotes",
    fin.ok && fin.completedMove && fin.pieces[48] && fin.pieces[48].king,
    JSON.stringify({ ok: fin.ok, piece: fin.pieces && fin.pieces[48], err: fin.error })
  );
}

// --- Notation ---
{
  check("quiet notation uses dash", R.notationFor([34, 30], []) === "34-30");
  check("capture notation uses x", R.notationFor([20, 29, 18], [24, 23]) === "20x29x18");
}

// --- Empty-ish: no false captures ---
{
  const pieces = board({ w: [48, 49, 50], b: [1, 2, 3] });
  const wMoves = R.getLegalMoves(pieces, "w");
  check("far pieces: only quiets", wMoves.every((m) => !m.isCapture), JSON.stringify(wMoves));
}


  assert.deepEqual(failures, [], failures.join('\n'));
});

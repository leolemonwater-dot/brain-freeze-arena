/**
 * board.js
 * 盤面生成・壁配置ロジック
 */

const SIZE = 12;

// walls[y][x] = { top, right, bottom, left, blocked }
let walls = [];

// L字の角セル（テスト検証用）
let lCorners = [];

/** 中央2×2かどうか判定 */
const isCenter = (x, y) => (x >= 5 && x <= 6 && y >= 5 && y <= 6);

/**
 * 壁フラグを双方向に立てるユーティリティ
 * @param {number} x
 * @param {number} y
 * @param {'top'|'right'|'bottom'|'left'} dir
 * @param {boolean} val
 */
function setWallBi(x, y, dir, val = true) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const opp = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[dir];
  walls[y][x][dir] = val;
  let nx = x, ny = y;
  if (dir === 'right')       nx = x + 1;
  else if (dir === 'left')   nx = x - 1;
  else if (dir === 'bottom') ny = y + 1;
  else if (dir === 'top')    ny = y - 1;
  if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
    walls[ny][nx][opp] = val;
  }
}

/**
 * 空の盤面データを初期化する（DOM操作なし）
 * 外周の壁フラグも設定する
 */
function initWalls() {
  walls = [];
  for (let y = 0; y < SIZE; y++) {
    walls[y] = [];
    for (let x = 0; x < SIZE; x++) {
      walls[y][x] = { top: false, right: false, bottom: false, left: false, blocked: false };
    }
  }
  // 外周の枠
  for (let i = 0; i < SIZE; i++) {
    walls[0][i].top        = true;
    walls[SIZE - 1][i].bottom = true;
    walls[i][0].left       = true;
    walls[i][SIZE - 1].right  = true;
  }
}

/**
 * 盤面に四角形（完全に囲まれたエリア）があるかチェックする
 * 1×1の囲い込みと2×2の囲い込みの両方を検出する
 * @returns {boolean} 四角形が存在する場合true
 */
function hasSquareEnclosure() {
  // 1×1の完全に囲まれたセルをチェック（中央2×2とブロックされたセルは除外）
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = walls[y][x];
      
      // 中央2×2は元々ブロックされているのでスキップ
      if (cell.blocked) continue;
      
      // 4方向すべてに壁がある場合は完全に囲まれている
      if (cell.top && cell.right && cell.bottom && cell.left) {
        console.warn(`1×1の囲い込みを検出: (${x}, ${y})`);
        return true;
      }
    }
  }
  
  // 2×2の完全に囲まれたエリアをチェック
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      // 2×2エリアの4つのセルをチェック
      const topLeft     = walls[y][x];
      const topRight    = walls[y][x + 1];
      const bottomLeft  = walls[y + 1][x];
      const bottomRight = walls[y + 1][x + 1];
      
      // ブロックされたセルは除外
      if (topLeft.blocked || topRight.blocked || bottomLeft.blocked || bottomRight.blocked) continue;
      
      // 4つのセルすべてが外側に壁を持つか（完全に囲まれている）
      const fullyEnclosed = 
        topLeft.top && topLeft.left &&
        topRight.top && topRight.right &&
        bottomLeft.bottom && bottomLeft.left &&
        bottomRight.bottom && bottomRight.right;
      
      if (fullyEnclosed) {
        console.warn(`2×2の囲い込みを検出: (${x}, ${y})`);
        return true;
      }
    }
  }
  return false;
}

/**
 * L字壁10個 + 外周I字壁 + 中央2×2封鎖を配置する
 */
function placeLAndIWalls() {
  // -------- 中央2×2ブロック（進入禁止） --------
  for (let y = 5; y <= 6; y++) {
    for (let x = 5; x <= 6; x++) {
      walls[y][x].blocked = true;
      setWallBi(x, y, 'top',    true);
      setWallBi(x, y, 'right',  true);
      setWallBi(x, y, 'bottom', true);
      setWallBi(x, y, 'left',   true);
    }
  }

  // -------- 外周I字壁（各辺2本、2マス以上離す）を先に配置 --------
  const iWallAdjacentCells = new Set(); // I字壁に隣接するセル（L字壁配置禁止）
  
  function placeIOnEdge(edge) {
    let positions = [];
    while (positions.length < 2) {
      let pos = Math.floor(Math.random() * (SIZE - 2)) + 1; // 1..SIZE-2（角は避ける）
      if (positions.every(p => Math.abs(p - pos) >= 3)) positions.push(pos);
    }
    positions.forEach(pos => {
      if (edge === 'top') {
        setWallBi(pos, 0, 'right', true);
        // I字壁に隣接するセル（内側）を記録
        iWallAdjacentCells.add(`${pos},${1}`);
        iWallAdjacentCells.add(`${pos + 1},${1}`);
      }
      if (edge === 'bottom') {
        setWallBi(pos, SIZE - 1, 'right', true);
        iWallAdjacentCells.add(`${pos},${SIZE - 2}`);
        iWallAdjacentCells.add(`${pos + 1},${SIZE - 2}`);
      }
      if (edge === 'left') {
        setWallBi(0, pos, 'bottom', true);
        iWallAdjacentCells.add(`${1},${pos}`);
        iWallAdjacentCells.add(`${1},${pos + 1}`);
      }
      if (edge === 'right') {
        setWallBi(SIZE - 1, pos, 'bottom', true);
        iWallAdjacentCells.add(`${SIZE - 2},${pos}`);
        iWallAdjacentCells.add(`${SIZE - 2},${pos + 1}`);
      }
    });
  }
  ['top', 'bottom', 'left', 'right'].forEach(placeIOnEdge);

  // -------- L字壁 10個をシンプルに配置 --------
  lCorners = [];
  const used = new Set();
  const nearCenter = (x, y) => (x >= 4 && x <= 7 && y >= 4 && y <= 7);
  const key = (x, y) => `${x},${y}`;
  
  // I字壁に隣接するセルかどうか判定
  const isNearIWall = (x, y) => iWallAdjacentCells.has(key(x, y));
  
  // 隣接マス（8方向）に既にL字壁があるかチェック
  const nearUsed = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (used.has(key(x + dx, y + dy))) return true;
      }
    }
    return false;
  };

  // L字壁を配置する（壁を実際に設定）
  function addL(x, y, dirA, dirB) {
    setWallBi(x, y, dirA, true);
    setWallBi(x, y, dirB, true);
    used.add(key(x, y));
    lCorners.push({ x, y, dirs: [dirA, dirB] });
  }

  // L字壁を削除する（壁を元に戻す）
  function removeL(x, y, dirA, dirB) {
    setWallBi(x, y, dirA, false);
    setWallBi(x, y, dirB, false);
    used.delete(key(x, y));
    lCorners.pop();
  }

  // シャッフル関数
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // 全候補マスを生成（中央とI字壁隣接を除外）
  const allCandidates = [];
  for (let y = 1; y <= 10; y++) {
    for (let x = 1; x <= 10; x++) {
      if (nearCenter(x, y) || isNearIWall(x, y)) continue;
      allCandidates.push([x, y]);
    }
  }
  shuffle(allCandidates);

  // L字の4種類の向き
  const lShapes = [
    ['top', 'left'],    // ┘
    ['top', 'right'],   // └
    ['bottom', 'left'], // ┐
    ['bottom', 'right'] // ┌
  ];

  const targetTotal = 10;
  let attempts = 0;
  const maxAttempts = allCandidates.length * 4; // 全候補×4方向

  for (const [x, y] of allCandidates) {
    if (lCorners.length >= targetTotal) break;
    if (attempts >= maxAttempts) break;

    // 既に使用済みまたは隣接マスに既にL字壁がある場合はスキップ
    if (used.has(key(x, y)) || nearUsed(x, y)) continue;

    // L字の向きをランダムに試す
    const shapes = [...lShapes];
    shuffle(shapes);

    let placed = false;
    for (const [dirA, dirB] of shapes) {
      attempts++;

      // L字壁を仮配置
      addL(x, y, dirA, dirB);

      // 囲い込みチェック
      if (hasSquareEnclosure()) {
        // 囲い込みが発生したら取り消す
        removeL(x, y, dirA, dirB);
        continue;
      }

      // 問題なければ確定して次のL字壁へ
      placed = true;
      break;
    }
    
    // このマスで配置できた場合のみ次のマスへ
    if (placed) continue;
  }

  if (lCorners.length < targetTotal) {
    console.warn(`L字壁を${lCorners.length}個しか配置できませんでした（目標: ${targetTotal}個）`);
  }
}

// ESモジュール用エクスポート
export { SIZE, walls, lCorners, isCenter, setWallBi, initWalls, hasSquareEnclosure, placeLAndIWalls };

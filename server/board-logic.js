/**
 * board-logic.js
 * 盤面生成ロジック（サーバー側・Node.js用）
 * board.js からDOM依存を除いて移植
 */

const SIZE = 12;
const COLORS = ['red', 'blue', 'green', 'yellow'];

/** 中央2×2かどうか判定 */
const isCenter = (x, y) => (x >= 5 && x <= 6 && y >= 5 && y <= 6);

/**
 * 壁フラグを双方向に立てるユーティリティ
 */
function setWallBi(walls, x, y, dir, val = true) {
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
 * 空の盤面データを初期化する
 */
function initWalls() {
  const walls = [];
  for (let y = 0; y < SIZE; y++) {
    walls[y] = [];
    for (let x = 0; x < SIZE; x++) {
      walls[y][x] = { top: false, right: false, bottom: false, left: false, blocked: false };
    }
  }
  // 外周の枠
  for (let i = 0; i < SIZE; i++) {
    walls[0][i].top           = true;
    walls[SIZE - 1][i].bottom = true;
    walls[i][0].left          = true;
    walls[i][SIZE - 1].right  = true;
  }
  return walls;
}

/**
 * 盤面に囲い込みがあるかチェック
 */
function hasSquareEnclosure(walls) {
  // 1×1チェック
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = walls[y][x];
      if (cell.blocked) continue;
      if (cell.top && cell.right && cell.bottom && cell.left) return true;
    }
  }
  // 2×2チェック
  for (let y = 0; y < SIZE - 1; y++) {
    for (let x = 0; x < SIZE - 1; x++) {
      const tl = walls[y][x];
      const tr = walls[y][x + 1];
      const bl = walls[y + 1][x];
      const br = walls[y + 1][x + 1];
      if (tl.blocked || tr.blocked || bl.blocked || br.blocked) continue;
      if (tl.top && tl.left && tr.top && tr.right && bl.bottom && bl.left && br.bottom && br.right) return true;
    }
  }
  return false;
}

/**
 * L字壁・I字壁・中央ブロックを配置する
 */
function placeLAndIWalls(walls) {
  const lCorners = [];

  // 中央2×2ブロック
  for (let y = 5; y <= 6; y++) {
    for (let x = 5; x <= 6; x++) {
      walls[y][x].blocked = true;
      setWallBi(walls, x, y, 'top',    true);
      setWallBi(walls, x, y, 'right',  true);
      setWallBi(walls, x, y, 'bottom', true);
      setWallBi(walls, x, y, 'left',   true);
    }
  }

  // 外周I字壁
  const iWallAdjacentCells = new Set();
  function placeIOnEdge(edge) {
    let positions = [];
    while (positions.length < 2) {
      let pos = Math.floor(Math.random() * (SIZE - 2)) + 1;
      if (positions.every(p => Math.abs(p - pos) >= 3)) positions.push(pos);
    }
    positions.forEach(pos => {
      if (edge === 'top') {
        setWallBi(walls, pos, 0, 'right', true);
        iWallAdjacentCells.add(`${pos},1`);
        iWallAdjacentCells.add(`${pos + 1},1`);
      }
      if (edge === 'bottom') {
        setWallBi(walls, pos, SIZE - 1, 'right', true);
        iWallAdjacentCells.add(`${pos},${SIZE - 2}`);
        iWallAdjacentCells.add(`${pos + 1},${SIZE - 2}`);
      }
      if (edge === 'left') {
        setWallBi(walls, 0, pos, 'bottom', true);
        iWallAdjacentCells.add(`1,${pos}`);
        iWallAdjacentCells.add(`1,${pos + 1}`);
      }
      if (edge === 'right') {
        setWallBi(walls, SIZE - 1, pos, 'bottom', true);
        iWallAdjacentCells.add(`${SIZE - 2},${pos}`);
        iWallAdjacentCells.add(`${SIZE - 2},${pos + 1}`);
      }
    });
  }
  ['top', 'bottom', 'left', 'right'].forEach(placeIOnEdge);

  // L字壁10個
  const used = new Set();
  const nearCenter = (x, y) => (x >= 4 && x <= 7 && y >= 4 && y <= 7);
  const key = (x, y) => `${x},${y}`;
  const isNearIWall = (x, y) => iWallAdjacentCells.has(key(x, y));
  const nearUsed = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (used.has(key(x + dx, y + dy))) return true;
      }
    }
    return false;
  };

  const addL = (x, y, dirA, dirB) => {
    setWallBi(walls, x, y, dirA, true);
    setWallBi(walls, x, y, dirB, true);
    used.add(key(x, y));
    lCorners.push({ x, y, dirs: [dirA, dirB] });
  };
  const removeL = (x, y, dirA, dirB) => {
    setWallBi(walls, x, y, dirA, false);
    setWallBi(walls, x, y, dirB, false);
    used.delete(key(x, y));
    lCorners.pop();
  };

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  const allCandidates = [];
  for (let y = 1; y <= 10; y++) {
    for (let x = 1; x <= 10; x++) {
      if (nearCenter(x, y) || isNearIWall(x, y)) continue;
      allCandidates.push([x, y]);
    }
  }
  shuffle(allCandidates);

  const lShapes = [
    ['top', 'left'], ['top', 'right'],
    ['bottom', 'left'], ['bottom', 'right']
  ];
  const targetTotal = 10;

  for (const [x, y] of allCandidates) {
    if (lCorners.length >= targetTotal) break;
    if (used.has(key(x, y)) || nearUsed(x, y)) continue;

    const shapes = [...lShapes];
    shuffle(shapes);
    let placed = false;

    for (const [dirA, dirB] of shapes) {
      addL(x, y, dirA, dirB);
      if (hasSquareEnclosure(walls)) {
        removeL(x, y, dirA, dirB);
        continue;
      }
      placed = true;
      break;
    }
    if (placed) continue;
  }

  return lCorners;
}

/**
 * ゴールを配置する
 */
function placeGoal(walls) {
  const candidates = [];
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (x >= 5 && x <= 6 && y >= 5 && y <= 6) continue;
      const w = walls[y][x];
      const isCorner = (w.top && w.left) || (w.top && w.right) || (w.bottom && w.left) || (w.bottom && w.right);
      if (!isCorner) continue;
      if (w.top && w.right && w.bottom && w.left) continue;
      const openDirs = [!w.top, !w.right, !w.bottom, !w.left].filter(Boolean).length;
      if (openDirs >= 2) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) {
    return { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) - 2 };
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * ロボットを配置する
 */
function placeRobots(goal) {
  const robots = [];
  COLORS.forEach(color => {
    let x, y;
    do {
      x = Math.floor(Math.random() * SIZE);
      y = Math.floor(Math.random() * SIZE);
    } while (
      (x === goal.x && y === goal.y) ||
      isCenter(x, y) ||
      robots.some(r => r.x === x && r.y === y)
    );
    robots.push({ color, x, y, initX: x, initY: y });
  });
  return robots;
}

/**
 * 盤面を生成してBoardDataを返す（最大50回試行）
 * @returns {{ walls, robots, goal, goalColor }}
 */
function generateBoardData() {
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    const walls = initWalls();
    placeLAndIWalls(walls);
    if (hasSquareEnclosure(walls)) continue;

    const goal      = placeGoal(walls);
    const goalColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const robots    = placeRobots(goal);

    return { walls, robots, goal, goalColor };
  }
  // フォールバック（ほぼ発生しない）
  const walls = initWalls();
  placeLAndIWalls(walls);
  const goal      = placeGoal(walls);
  const goalColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const robots    = placeRobots(goal);
  return { walls, robots, goal, goalColor };
}

module.exports = { generateBoardData, SIZE, COLORS };

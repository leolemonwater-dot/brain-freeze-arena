/**
 * renderer.js
 * DOM描画（盤面セル・壁・ゴール・ロボットの表示）
 */

import { SIZE, walls } from './board.js';

/**
 * 空の盤面セルをDOMに生成する
 * ロボットとゴールは保持する
 * @param {HTMLElement} boardEl
 */
function renderEmptyBoard(boardEl) {
  // 既存のロボットとゴールを一時保存
  const robots = Array.from(boardEl.querySelectorAll('.robot'));
  const goals = Array.from(boardEl.querySelectorAll('.goalStar'));
  
  // 盤面をクリア
  boardEl.innerHTML = '';
  
  // セルを再生成
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      boardEl.appendChild(cell);
    }
  }
  
  // ロボットを元の位置に戻す（#boardの直接子として再配置）
  const board = document.getElementById('board');
  robots.forEach(robot => {
    const x = parseInt(robot.dataset.x);
    const y = parseInt(robot.dataset.y);
    const pos = _gridToPos(x, y);
    robot.style.left = pos.left;
    robot.style.top  = pos.top;
    board.appendChild(robot);
  });
  
  // ゴールを元の位置に戻す
  goals.forEach(goal => {
    // ゴールの位置はparentのdata属性から取得
    const parent = goal.parentElement;
    if (parent) {
      const x = parent.dataset.x;
      const y = parent.dataset.y;
      const cell = boardEl.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
      if (cell) cell.appendChild(goal);
    }
  });
}

/**
 * 壁データをDOMに反映する
 */
function drawWalls() {
  document.querySelectorAll('.wall').forEach(w => w.remove());

  // 中央2×2の背景色
  for (let y = 5; y <= 6; y++) {
    for (let x = 5; x <= 6; x++) {
      const cell = document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
      if (cell) cell.classList.add('center');
    }
  }

  document.querySelectorAll('.cell').forEach(cell => {
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    const w = walls[y][x];

    if (w.top)    cell.appendChild(makeWallEl('top'));
    if (w.right)  cell.appendChild(makeWallEl('right'));
    if (w.bottom) cell.appendChild(makeWallEl('bottom'));
    if (w.left)   cell.appendChild(makeWallEl('left'));
  });
}

/**
 * 壁要素を生成する
 * @param {'top'|'right'|'bottom'|'left'} dir
 * @returns {HTMLElement}
 */
function makeWallEl(dir) {
  const wall = document.createElement('div');
  wall.className = 'wall';
  if (dir === 'top') {
    wall.style.top    = '0';
    wall.style.left   = '0';
    wall.style.width  = '100%';
    wall.style.height = '3px';
  } else if (dir === 'right') {
    wall.style.top    = '0';
    wall.style.right  = '0';
    wall.style.width  = '3px';
    wall.style.height = '100%';
  } else if (dir === 'bottom') {
    wall.style.bottom = '0';
    wall.style.left   = '0';
    wall.style.width  = '100%';
    wall.style.height = '3px';
  } else if (dir === 'left') {
    wall.style.top    = '0';
    wall.style.left   = '0';
    wall.style.width  = '3px';
    wall.style.height = '100%';
  }
  return wall;
}

/**
 * ゴールをDOMに描画する（色に対応した魚画像）
 * @param {{x:number, y:number}} goal
 * @param {string} goalColor - 'red'|'blue'|'green'|'yellow'
 */
function renderGoal(goal, goalColor) {
  document.querySelectorAll('.goalStar').forEach(e => e.remove());
  const goalCell = document.querySelector(`.cell[data-x='${goal.x}'][data-y='${goal.y}']`);
  if (!goalCell) return;

  // 色 → 魚画像ファイル名のマッピング
  const fishMap = {
    red:    '赤魚.png',
    blue:   '青魚.png',
    green:  '緑魚.png',
    yellow: '黄魚.png'
  };

  const g = document.createElement('div');
  g.className = 'goalStar';

  // 色別オーラクラスを付与
  const auraMap = { red: 'aura-red', blue: 'aura-blue', green: 'aura-green', yellow: 'aura-yellow' };
  if (auraMap[goalColor]) g.classList.add(auraMap[goalColor]);

  const fileName = fishMap[goalColor];
  if (fileName) {
    const img = document.createElement('img');
    img.src = `image/ゴール魚/${fileName}`;
    img.alt = goalColor;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    g.appendChild(img);
  } else {
    // フォールバック：★テキスト
    g.style.color = goalColor;
    g.textContent = '★';
  }

  goalCell.appendChild(g);
}

/**
 * ロボットの色に対応する画像パスを返す
 * @param {string} color - 'red'|'blue'|'green'|'yellow'
 * @param {string} direction - 'front'|'up'|'down'|'left'|'right'
 * @returns {string|null}
 */
function getRobotImagePath(color, direction = 'front') {
  // 方向 → 日本語ファイル名のマッピング
  const dirMap = {
    front: '正面',
    up:    '上',
    down:  '下',
    left:  '左',
    right: '右'
  };

  // 色 → フォルダ名・ファイル名プレフィックスのマッピング
  const colorConfig = {
    red:    { folder: '赤ペンギン', prefix: '赤' },
    blue:   { folder: '青ペンギン', prefix: '青' },
    green:  { folder: '緑ペンギン', prefix: '緑' },
    yellow: { folder: '黄ペンギン', prefix: '黄' }
  };

  const config = colorConfig[color];
  if (!config) return null;

  const dirJa = dirMap[direction];
  return `image/${config.folder}/${config.prefix}${dirJa}-removebg-preview.png`;
}

/**
 * グリッド座標からleft/top（%）を計算する
 * @param {number} x
 * @param {number} y
 * @returns {{left: string, top: string}}
 */
function _gridToPos(x, y) {
  const pct = 100 / SIZE;
  return {
    left: `${x * pct}%`,
    top:  `${y * pct}%`
  };
}

/**
 * ロボット要素を生成してDOMに配置する（#boardの直接子要素としてabsolute配置）
 * @param {string} color
 * @param {number} x
 * @param {number} y
 * @param {function} onSelect - クリック時のコールバック
 * @returns {HTMLElement}
 */
function createRobotEl(color, x, y, onSelect) {
  const board = document.getElementById('board');
  const r = document.createElement('div');
  r.className = 'robot';
  r.dataset.x      = x;
  r.dataset.y      = y;
  r.dataset.initX  = x;
  r.dataset.initY  = y;
  r.dataset.color  = color;
  r.dataset.facing = 'front';

  // position: absolute で座標を設定
  const pos = _gridToPos(x, y);
  r.style.left = pos.left;
  r.style.top  = pos.top;

  const imgPath = getRobotImagePath(color, 'front');
  if (imgPath) {
    const img = document.createElement('img');
    img.src = imgPath;
    img.alt = color;
    r.appendChild(img);
  } else {
    // フォールバック：丸スタイル
    r.style.background    = color;
    r.style.borderRadius  = '50%';
    r.style.boxShadow     = '0 4px 12px rgba(0,0,0,0.3)';
    r.style.border        = '2px solid rgba(255,255,255,0.6)';
  }

  r.onclick = () => onSelect(r);
  board.appendChild(r);
  return r;
}

/**
 * ロボットの向きを変更する
 * @param {HTMLElement} robotEl
 * @param {string} direction - 'front'|'up'|'down'|'left'|'right'
 */
function setRobotFacing(robotEl, direction) {
  const color = robotEl.dataset.color;
  const imgPath = getRobotImagePath(color, direction);
  if (!imgPath) return; // 画像なしの色はスキップ

  const img = robotEl.querySelector('img');
  if (img) {
    img.src = imgPath;
    robotEl.dataset.facing = direction;
  }
}

/**
 * ロボットに選択オーラを付与する（色に対応）
 * @param {HTMLElement} robotEl
 */
function addRobotAura(robotEl) {
  const colorMap = { red: 'aura-red', blue: 'aura-blue', green: 'aura-green', yellow: 'aura-yellow' };
  const auraClass = colorMap[robotEl.dataset.color] ?? '';
  robotEl.classList.add('selected');
  if (auraClass) robotEl.classList.add(auraClass);
}

/**
 * ロボットの選択オーラを除去する
 * @param {HTMLElement} robotEl
 */
function removeRobotAura(robotEl) {
  robotEl.classList.remove('selected', 'aura-red', 'aura-blue', 'aura-green', 'aura-yellow');
}

/**
 * ロボットをグリッド座標に移動する（left/top を更新してCSSトランジションで滑らせる）
 * @param {HTMLElement} robotEl
 * @param {number} x
 * @param {number} y
 */
function moveRobotEl(robotEl, x, y) {
  robotEl.dataset.x = x;
  robotEl.dataset.y = y;
  const pos = _gridToPos(x, y);
  robotEl.style.left = pos.left;
  robotEl.style.top  = pos.top;
}

// ESモジュール用エクスポート
export {
  renderEmptyBoard, drawWalls, makeWallEl, renderGoal,
  getRobotImagePath, createRobotEl, setRobotFacing,
  addRobotAura, removeRobotAura, moveRobotEl, _gridToPos
};

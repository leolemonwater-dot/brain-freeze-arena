/**
 * robot.js
 * ロボット移動ロジック
 */

import { SIZE, walls } from './board.js';

/**
 * 指定方向にロボットを滑らせ、止まる座標を返す
 * @param {number} startX
 * @param {number} startY
 * @param {number} dx  - 移動方向X（-1, 0, 1）
 * @param {number} dy  - 移動方向Y（-1, 0, 1）
 * @param {Array<HTMLElement>} robots - 全ロボット要素（自分自身を除いて障害物判定）
 * @param {HTMLElement} self - 移動するロボット自身（障害物判定から除外）
 * @returns {{x:number, y:number}}
 */
function calcRobotDestination(startX, startY, dx, dy, robots, self) {
  let x = startX, y = startY;
  while (true) {
    const nx = x + dx, ny = y + dy;
    // 盤外
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
    // 進入禁止セル（中央2×2）
    if (walls[ny][nx].blocked) break;
    // 壁チェック（双方向）
    const cur = walls[y][x];
    const nxt = walls[ny][nx];
    if (dx ===  1 && (cur.right  || nxt.left))   break;
    if (dx === -1 && (cur.left   || nxt.right))  break;
    if (dy ===  1 && (cur.bottom || nxt.top))    break;
    if (dy === -1 && (cur.top    || nxt.bottom)) break;
    // 他ロボットとの衝突
    if (robots.some(r => r !== self && parseInt(r.dataset.x) === nx && parseInt(r.dataset.y) === ny)) break;
    x = nx;
    y = ny;
  }
  return { x, y };
}

// ESモジュール用エクスポート
export { calcRobotDestination };

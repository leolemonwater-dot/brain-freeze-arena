/**
 * core/boardState.js
 * ボード上の可変状態（ロボット・ゴール・手数・選択中プレイヤー）
 *
 * game-controller.js から状態管理のみを分離したモジュール。
 * DOM操作は一切行わない。
 */

export const COLORS = ['red', 'blue', 'green', 'yellow'];

// ロボット要素の配列（DOM要素だが状態として管理）
export let robots        = [];
// 現在選択中のロボット要素
export let selectedRobot = null;
// 現在の手数
export let moves         = 0;
// ゴール座標 { x, y }
export let goal          = null;
// ゴールの色
export let goalColor     = null;
// 選択中のプレイヤーID（オフライン用）
export let selectedPlayerId = null;

// -------------------------------------------------------
// setter（ESモジュールでは export let の再代入を外部から直接できないため）
// -------------------------------------------------------

export function setRobots(r)           { robots          = r; }
export function setSelectedRobot(r)    { selectedRobot   = r; }
export function setMoves(m)            { moves           = m; }
export function setGoal(g)             { goal            = g; }
export function setGoalColor(c)        { goalColor       = c; }
export function setSelectedPlayerId(id){ selectedPlayerId = id; }

/**
 * 全状態をリセットする（モード開始時に呼ぶ）
 */
export function resetBoardState() {
  robots          = [];
  selectedRobot   = null;
  moves           = 0;
  goal            = null;
  goalColor       = null;
  selectedPlayerId = null;
}

/**
 * mode-solo.js
 * ソロ練習専用ロジック
 *
 * 依存: game-controller.js
 * 循環依存なし
 */

import {
  moves, selectedRobot, goal, goalColor,
  setStatus, showResultPopup, generateBoardData, placeGoal, placeRobots,
  resetRobotsToInitial, _spawnGoalParticles
} from './game-controller.js';
import { sfxDeclare, sfxGoal } from './sound.js';

// -------------------------------------------------------
// ソロ専用状態
// -------------------------------------------------------

export let soloPhase        = 'thinking'; // 'thinking' | 'answering'
export let soloDeclaredMoves = 0;

export function setSoloPhase(phase) { soloPhase = phase; }

// -------------------------------------------------------
// 宣言
// -------------------------------------------------------

/**
 * ソロモードで宣言する
 * @param {number} movesVal
 */
export function onDeclareSolo(movesVal) {
  soloDeclaredMoves = movesVal;
  soloPhase = 'answering';

  // moves は game-controller の変数を直接操作
  resetRobotsToInitial();
  setStatus(`宣言: ${movesVal}手以内でゴールを目指せ！`);
  sfxDeclare();

  // 宣言パネルを非表示・方向ボタンを表示
  const declareBtn = document.getElementById('declare-btn');
  if (declareBtn) { declareBtn.disabled = true; declareBtn.style.opacity = '0.5'; }
  const dp = document.getElementById('declare-panel');
  if (dp) dp.style.display = 'none';
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.add('visible');
}

// -------------------------------------------------------
// ゴール到達時の処理
// -------------------------------------------------------

/**
 * ソロモードでゴールした時の処理
 */
export function onGoalSolo() {
  setStatus('クリア！');
  showResultPopup(true);
  sfxGoal();
  _spawnGoalParticles(goal, goalColor);

  // フェーズをリセット
  soloPhase = 'thinking';
  const declareBtn = document.getElementById('declare-btn');
  if (declareBtn) { declareBtn.disabled = false; declareBtn.style.opacity = '1'; }
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.remove('visible');
  const dp = document.getElementById('declare-panel');
  if (dp) dp.style.display = 'block';

  // 2秒後に次のステージへ
  setTimeout(() => generateBoardSolo(), 2000);
}

// -------------------------------------------------------
// 盤面生成（ソロ用）
// -------------------------------------------------------

export function generateBoardSolo() {
  soloPhase = 'thinking';
  const declareBtn = document.getElementById('declare-btn');
  if (declareBtn) { declareBtn.disabled = false; declareBtn.style.opacity = '1'; }
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.remove('visible');
  const dp = document.getElementById('declare-panel');
  if (dp) dp.style.display = 'block';

  generateBoardData(() => {
    placeGoal();
    placeRobots(null);
  });
}

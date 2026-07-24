/**
 * game-controller.js
 * ボード操作の統合レイヤー（ロボット移動・盤面生成・モード初期化）
 *
 * 依存関係（循環なし・一方向）:
 *   core/board ← core/robot ← core/boardState
 *   core/round ← core/mode ← core/timer
 *   ui/renderer ← ui/hud
 *
 * NOTE: 状態は core/boardState.js、HUD表示は ui/hud.js に委譲している。
 *       このファイルは「ゲームの動き」だけを担う。
 */

import { SIZE, walls, isCenter, initWalls, placeLAndIWalls, hasSquareEnclosure } from './core/board.js';
import {
  renderEmptyBoard, drawWalls, renderGoal, createRobotEl,
  moveRobotEl, setRobotFacing, addRobotAura, removeRobotAura
} from './ui/renderer.js';
import { calcRobotDestination } from './core/robot.js';
import { getPlayers, resetAllPlayers } from './core/players.js';
import { getRoundPhase, getCurrentAnswerer, setRoundPhaseOnline } from './core/round.js';
import { stopTimer } from './core/timer.js';
import { sfxSelect, sfxSlide, sfxGoal, sfxWrong } from './core/sound.js';
import {
  COLORS, robots, selectedRobot, moves, goal, goalColor, selectedPlayerId,
  setRobots, setSelectedRobot, setMoves, setGoal, setGoalColor, setSelectedPlayerId,
  resetBoardState
} from './core/boardState.js';
import {
  boardEl, currentMovesEl, timerEl,
  setStatus, showResultPopup, updateMovesDisplay,
  updateScoreboard, updateRoundInfo, selectPlayer, updateSelectedPlayerHint,
  updateDpadPenguin, spawnGoalParticles, updateDeclarePanel
} from './ui/hud.js';

// -------------------------------------------------------
// re-export（modes/ や app.js からまとめて import できるように）
// -------------------------------------------------------

// core/boardState
export { COLORS, robots, selectedRobot, moves, goal, goalColor, selectedPlayerId };
export { setSelectedRobot, setMoves, setGoal, setGoalColor, setSelectedPlayerId, resetBoardState };

// ui/hud
export { boardEl, currentMovesEl, timerEl };
export { setStatus, showResultPopup, updateMovesDisplay };
export { updateScoreboard, updateRoundInfo, selectPlayer, updateSelectedPlayerHint };
export { updateDeclarePanel as _updateDeclarePanel };
export { updateDpadPenguin as _updateDpadPenguin };
export { spawnGoalParticles as _spawnGoalParticles };

// -------------------------------------------------------
// モード初期化（全状態リセット）
// -------------------------------------------------------

/**
 * モード開始時に全状態をリセットする
 * @param {'solo'|'offline'|'online'} mode
 * @param {function} setOnlineModeActive - (boolean) => void
 */
export function initMode(mode, setOnlineModeActive) {
  resetBoardState();
  resetAllPlayers();
  stopTimer();
  setRoundPhaseOnline('ended');
  setOnlineModeActive(mode === 'online');

  setStatus('');
  if (currentMovesEl) currentMovesEl.style.display = 'none';

  const scoreboardEl = document.getElementById('scoreboard');
  const roundInfoEl  = document.getElementById('round-info');
  if (scoreboardEl) scoreboardEl.innerHTML = '';
  if (roundInfoEl)  roundInfoEl.textContent = '';
  if (timerEl)      timerEl.textContent = '';

  const declareBtn = document.getElementById('declare-btn');
  if (declareBtn) { declareBtn.disabled = false; declareBtn.style.opacity = '1'; }
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.remove('visible');
  const soloButtons = document.getElementById('solo-buttons');
  if (soloButtons) soloButtons.style.display = 'none';

  document.querySelectorAll('.robot').forEach(r => r.remove());
  document.querySelectorAll('.goalStar').forEach(g => g.remove());
}

// -------------------------------------------------------
// 盤面生成
// -------------------------------------------------------

/**
 * 盤面を完全に再生成する（四角形検知付き）
 * @param {function} onSuccess - 生成完了後のコールバック（ロボット配置に使う）
 */
export function generateBoardData(onSuccess) {
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    initWalls();
    renderEmptyBoard(boardEl);
    placeLAndIWalls();
    if (hasSquareEnclosure()) continue;
    drawWalls();
    if (onSuccess) onSuccess();
    return;
  }
  // フォールバック
  drawWalls();
  if (onSuccess) onSuccess();
}

// -------------------------------------------------------
// ゴール配置
// -------------------------------------------------------

export function placeGoal() {
  const candidates = [];
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      if (x >= 5 && x <= 6 && y >= 5 && y <= 6) continue;
      const w = walls[y][x];
      const isCorner = (w.top && w.left) || (w.top && w.right)
                    || (w.bottom && w.left) || (w.bottom && w.right);
      if (!isCorner) continue;
      if (w.top && w.right && w.bottom && w.left) continue;
      const openDirs = [!w.top, !w.right, !w.bottom, !w.left].filter(Boolean).length;
      if (openDirs >= 2) candidates.push({ x, y });
    }
  }
  const g = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) - 2 };

  setGoal(g);
  setGoalColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
  renderGoal(goal, goalColor);
  setStatus('');
}

// -------------------------------------------------------
// ロボット配置・リセット
// -------------------------------------------------------

/**
 * ロボットを配置する
 * @param {function|null} onSelectRobot - ロボット選択時の追加コールバック (robotEl) => void
 */
export function placeRobots(onSelectRobot) {
  setRobots([]);
  setSelectedRobot(null);
  document.querySelectorAll('.robot').forEach(e => e.remove());

  const newRobots = [];
  COLORS.forEach(color => {
    let x, y;
    do {
      x = Math.floor(Math.random() * SIZE);
      y = Math.floor(Math.random() * SIZE);
    } while ((x === goal.x && y === goal.y) || isCenter(x, y));

    const r = createRobotEl(color, x, y, (robotEl) => {
      document.querySelectorAll('.robot').forEach(ro => removeRobotAura(ro));
      addRobotAura(robotEl);
      setSelectedRobot(robotEl);
      robotEl.classList.add('select-flash');
      setTimeout(() => robotEl.classList.remove('select-flash'), 250);
      sfxSelect();
      updateDpadPenguin(robotEl.dataset.color);
      if (onSelectRobot) onSelectRobot(robotEl);
    });
    newRobots.push(r);
  });
  setRobots(newRobots);
}

export function resetRobotsToInitial() {
  robots.forEach(r => {
    removeRobotAura(r);
    moveRobotEl(r, parseInt(r.dataset.initX), parseInt(r.dataset.initY));
  });
  setSelectedRobot(null);
  setMoves(0);
  setStatus('');
}

// -------------------------------------------------------
// ロボット移動（共通）
// -------------------------------------------------------

/**
 * 選択中のロボットを移動する
 * @param {number} dx
 * @param {number} dy
 * @param {object} options
 * @param {boolean}  options.isOnline       - オンラインモードかどうか
 * @param {boolean}  options.isSolo         - ソロモードかどうか
 * @param {string}   options.soloPhase      - ソロのフェーズ ('thinking'|'answering')
 * @param {string}   options.myPlayerId     - 自分のプレイヤーID
 * @param {function} options.onGoalOffline  - オフラインゴール時 (success, usedMoves) => void
 * @param {function} options.onGoalOnline   - オンラインゴール時 (color, moves) => void
 * @param {function} options.onWrongOnline  - オンライン不正解時 (color, moves) => void
 * @param {function} options.onMoveOnline   - オンライン移動送信 (color, dx, dy) => void
 */
export function moveSelectedRobot(dx, dy, options = {}) {
  if (!selectedRobot) return;

  const { isOnline, isSolo, soloPhase, myPlayerId,
          onGoalOffline, onGoalOnline, onWrongOnline, onMoveOnline } = options;

  // フェーズチェック
  if (isSolo) {
    if (soloPhase !== 'answering') return;
  } else {
    const phase = getRoundPhase();
    if (phase === 'thinking' || phase === 'additional') return;
    if (phase === 'answering') {
      const answerer = getCurrentAnswerer();
      if (!answerer) return;
      if (selectedPlayerId !== answerer.playerId) {
        setStatus('現在の解答者ではありません。待機してください。');
        return;
      }
    }
  }

  const startX = parseInt(selectedRobot.dataset.x);
  const startY = parseInt(selectedRobot.dataset.y);
  const { x, y } = calcRobotDestination(startX, startY, dx, dy, robots, selectedRobot);
  if (x === startX && y === startY) return;

  // 向き変更
  const direction = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down';
  setRobotFacing(selectedRobot, direction);

  // オンライン送信
  if (isOnline && onMoveOnline) onMoveOnline(selectedRobot.dataset.color, dx, dy);

  // 移動アニメーション
  selectedRobot.classList.add('moving');
  moveRobotEl(selectedRobot, x, y);
  sfxSlide();

  setTimeout(() => {
    selectedRobot.classList.remove('moving');
    selectedRobot.classList.add('bounce-stop');
    setTimeout(() => selectedRobot.classList.remove('bounce-stop'), 300);
  }, 350);

  setMoves(moves + 1);
  if (direction === 'down') setRobotFacing(selectedRobot, 'front');

  updateMovesDisplay();

  // 宣言手数オーバー
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer && moves > answerer.moves) {
      selectedRobot.classList.add('incorrect');
      if (currentMovesEl) currentMovesEl.classList.add('over-limit');
      showResultPopup(false);
      sfxWrong();
      setTimeout(() => {
        selectedRobot.classList.remove('incorrect');
        if (currentMovesEl) currentMovesEl.classList.remove('over-limit');
        if (isOnline && onWrongOnline) onWrongOnline(selectedRobot.dataset.color, moves);
        else if (!isOnline && onGoalOffline) onGoalOffline(false, moves);
      }, 500);
      return;
    }
  }

  // ゴール判定
  if (goal && x === goal.x && y === goal.y && selectedRobot.dataset.color === goalColor) {
    if (phase === 'answering') {
      selectedRobot.classList.add('correct');
      const goalStar = document.querySelector('.goalStar');
      if (goalStar) goalStar.classList.add('goal-reached');
      showResultPopup(true);
      sfxGoal();
      spawnGoalParticles(goal, goalColor);
      setTimeout(() => {
        selectedRobot.classList.remove('correct');
        if (isOnline && onGoalOnline) onGoalOnline(selectedRobot.dataset.color, moves);
        else if (!isOnline && onGoalOffline) onGoalOffline(true, moves);
      }, 600);
    } else {
      // ソロ
      setStatus('クリア！');
      showResultPopup(true);
      sfxGoal();
      spawnGoalParticles(goal, goalColor);
      if (onGoalOffline) onGoalOffline(true, moves);
    }
  } else {
    setStatus('');
  }
}

// -------------------------------------------------------
// window ブリッジ（modes/online.js から呼ぶ）
// -------------------------------------------------------

if (typeof window !== 'undefined') {
  window._gcSetSelectedRobot    = (r)    => setSelectedRobot(r);
  window._gcSetGoal             = (g, c) => { setGoal(g); setGoalColor(c); };
  window._gcSetSelectedPlayerId = (id)   => setSelectedPlayerId(id);
}

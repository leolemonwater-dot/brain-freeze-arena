/**
 * game-controller.js
 * 3モード共通のゲーム状態・操作・UI更新
 *
 * 依存関係（循環なし・一方向）:
 *   board.js ← renderer.js ← robot.js ← players.js
 *   round.js ← mode.js ← timer.js ← ui.js ← sound.js
 */

import { SIZE, walls, isCenter, initWalls, placeLAndIWalls, hasSquareEnclosure } from './board.js';
import {
  renderEmptyBoard, drawWalls, renderGoal, createRobotEl,
  moveRobotEl, setRobotFacing, addRobotAura, removeRobotAura, getRobotImagePath
} from './renderer.js';
import { calcRobotDestination } from './robot.js';
import { getPlayers, getPlayerById, resetAllPlayers, resetDeclarations } from './players.js';
import { getRoundPhase, getCurrentAnswerer, setRoundPhaseOnline } from './round.js';
import { getGameMode, getCurrentRound, SCORE_ROUNDS } from './mode.js';
import { stopTimer } from './timer.js';
import { sfxSelect, sfxSlide, sfxGoal, sfxWrong, sfxDeclare, sfxTick } from './sound.js';

// -------------------------------------------------------
// 共有状態（全モードで使う）
// -------------------------------------------------------

export const COLORS = ['red', 'blue', 'green', 'yellow'];

export let robots        = [];
export let selectedRobot = null;
export let moves         = 0;
export let goal          = null;
export let goalColor     = null;
export let selectedPlayerId = null;

// DOM参照（共通）
export const boardEl        = document.getElementById('board');
export const statusEl       = document.getElementById('status');
export const timerEl        = document.getElementById('timer');
export const roundInfoEl    = document.getElementById('round-info');
export const scoreboardEl   = document.getElementById('scoreboard');
export const currentMovesEl = document.getElementById('current-moves');
export const resultPopupEl  = document.getElementById('result-popup');

// -------------------------------------------------------
// モード初期化（全状態リセット）
// -------------------------------------------------------

/**
 * モード開始時に全状態をリセットする
 * @param {'solo'|'offline'|'online'} mode
 * @param {boolean} onlineModeActive
 */
export function initMode(mode, setOnlineModeActive) {
  robots           = [];
  selectedRobot    = null;
  moves            = 0;
  goal             = null;
  goalColor        = null;
  selectedPlayerId = null;

  resetAllPlayers();
  stopTimer();
  setRoundPhaseOnline('ended');
  setOnlineModeActive(mode === 'online');

  setStatus('');
  if (currentMovesEl) currentMovesEl.style.display = 'none';
  if (scoreboardEl)   scoreboardEl.innerHTML = '';
  if (roundInfoEl)    roundInfoEl.textContent = '';
  if (timerEl)        timerEl.textContent = '';

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
// ステータス表示
// -------------------------------------------------------

export function setStatus(txt = '') {
  if (statusEl) statusEl.textContent = txt;
}

// -------------------------------------------------------
// 正解/不正解ポップアップ
// -------------------------------------------------------

export function showResultPopup(isCorrect) {
  if (!resultPopupEl) return;
  resultPopupEl.textContent = isCorrect ? '正解！🎉' : '不正解...';
  resultPopupEl.className = isCorrect ? 'correct show' : 'incorrect show';
  setTimeout(() => resultPopupEl.classList.remove('show'), 1000);
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
      const isCorner = (w.top && w.left) || (w.top && w.right) || (w.bottom && w.left) || (w.bottom && w.right);
      if (!isCorner) continue;
      if (w.top && w.right && w.bottom && w.left) continue;
      const openDirs = [!w.top, !w.right, !w.bottom, !w.left].filter(Boolean).length;
      if (openDirs >= 2) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) {
    goal = { x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) - 2 };
  } else {
    goal = candidates[Math.floor(Math.random() * candidates.length)];
  }
  goalColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  renderGoal(goal, goalColor);
  setStatus('');
}

// -------------------------------------------------------
// ロボット配置・リセット
// -------------------------------------------------------

/**
 * ロボットを配置する
 * @param {function} onSelectRobot - ロボット選択時のコールバック (robotEl) => void
 */
export function placeRobots(onSelectRobot) {
  robots = [];
  selectedRobot = null;
  document.querySelectorAll('.robot').forEach(e => e.remove());

  COLORS.forEach(color => {
    let x, y;
    do {
      x = Math.floor(Math.random() * SIZE);
      y = Math.floor(Math.random() * SIZE);
    } while ((x === goal.x && y === goal.y) || isCenter(x, y));

    const r = createRobotEl(color, x, y, (robotEl) => {
      document.querySelectorAll('.robot').forEach(ro => removeRobotAura(ro));
      addRobotAura(robotEl);
      selectedRobot = robotEl;
      robotEl.classList.add('select-flash');
      setTimeout(() => robotEl.classList.remove('select-flash'), 250);
      sfxSelect();
      _updateDpadPenguin(robotEl.dataset.color);
      if (onSelectRobot) onSelectRobot(robotEl);
    });
    robots.push(r);
  });
}

export function resetRobotsToInitial() {
  robots.forEach(r => {
    const x = parseInt(r.dataset.initX);
    const y = parseInt(r.dataset.initY);
    removeRobotAura(r);
    moveRobotEl(r, x, y);
  });
  selectedRobot = null;
  moves = 0;
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
 * @param {boolean} options.isOnline - オンラインモードかどうか
 * @param {boolean} options.isSolo - ソロモードかどうか
 * @param {string} options.soloPhase - ソロのフェーズ
 * @param {string} options.myPlayerId - 自分のプレイヤーID
 * @param {function} options.onGoalOffline - オフラインゴール時のコールバック
 * @param {function} options.onGoalOnline - オンラインゴール時のコールバック (color, moves)
 * @param {function} options.onWrongOnline - オンライン不正解時のコールバック (color, moves)
 * @param {function} options.onMoveOnline - オンライン移動送信コールバック (color, dx, dy)
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

  moves++;

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
        if (isOnline && onWrongOnline) {
          onWrongOnline(selectedRobot.dataset.color, moves);
        } else if (!isOnline) {
          onGoalOffline && onGoalOffline(false, moves);
        }
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
      _spawnGoalParticles(goal, goalColor);
      setTimeout(() => {
        selectedRobot.classList.remove('correct');
        if (isOnline && onGoalOnline) {
          onGoalOnline(selectedRobot.dataset.color, moves);
        } else if (!isOnline && onGoalOffline) {
          onGoalOffline(true, moves);
        }
      }, 600);
    } else {
      // ソロ
      setStatus('クリア！');
      showResultPopup(true);
      sfxGoal();
      _spawnGoalParticles(goal, goalColor);
      if (onGoalOffline) onGoalOffline(true, moves);
    }
  } else {
    setStatus('');
  }
}

// -------------------------------------------------------
// UI更新
// -------------------------------------------------------

export function updateMovesDisplay() {
  if (!currentMovesEl) return;
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer) {
      currentMovesEl.style.display = 'block';
      currentMovesEl.textContent = `手数: ${moves} / ${answerer.moves}`;
      if (moves > answerer.moves) currentMovesEl.classList.add('over-limit');
      else currentMovesEl.classList.remove('over-limit');
    }
  } else {
    currentMovesEl.style.display = 'none';
  }
}

export function updateScoreboard(isOnlineMode, myPlayerId) {
  if (!scoreboardEl) return;
  const ps = getPlayers();
  if (ps.length === 0) { scoreboardEl.innerHTML = ''; return; }

  const mode = getGameMode();

  scoreboardEl.innerHTML = ps.map(p => {
    const val = mode === 'quick' ? `${p.wins}本` : `${p.score}点`;
    const penalty = p.penalized ? ' ⚠️' : '';

    let statusLine = '';
    if (p.declaration !== null) {
      statusLine = isOnlineMode
        ? `<div class="card-status declared">${p.declaration.moves}手で宣言中</div>`
        : `<div class="card-status declared">宣言済み ✓</div>`;
    } else if (p.passed) {
      statusLine = `<div class="card-status passed">パス ⊘</div>`;
    } else {
      statusLine = `<div class="card-status thinking">思考中...</div>`;
    }

    const selectedClass = (!isOnlineMode && selectedPlayerId === p.id) ? 'selected-player' : '';
    const declaredClass = p.declaration !== null ? 'declared' : '';
    const clickHandler  = isOnlineMode ? '' : `onclick="selectPlayer('${p.id}')"`;

    return `<span class="player-score ${selectedClass} ${declaredClass}" ${clickHandler}>
      <div class="card-main">${p.name}: ${val}${penalty}</div>
      ${statusLine}
    </span>`;
  }).join('');
}

export function updateRoundInfo() {
  if (!roundInfoEl) return;
  const round = getCurrentRound();
  const mode  = getGameMode();
  const modeStr = mode === 'quick'
    ? `Quick Mode (${round}ラウンド目)`
    : `Score Mode (${round}/${SCORE_ROUNDS}ラウンド)`;
  roundInfoEl.textContent = round > 0 ? modeStr : '';
}

// -------------------------------------------------------
// 内部ユーティリティ
// -------------------------------------------------------

export function _updateDpadPenguin(color) {
  const img = document.getElementById('dpad-penguin');
  if (!img) return;
  const path = getRobotImagePath(color, 'front');
  if (path) { img.src = path; img.style.display = 'block'; }
  else img.style.display = 'none';
}

export function _spawnGoalParticles(goalPos, color) {
  const goalCell = document.querySelector(`.cell[data-x='${goalPos.x}'][data-y='${goalPos.y}']`);
  if (!goalCell) return;
  const colors = ['#fbbf24', '#f59e0b', '#fff', color, '#fde68a'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'goal-particle';
    const angle = (i / 10) * 360;
    const dist = 30 + Math.random() * 30;
    p.style.setProperty('--tx', `${Math.cos(angle * Math.PI / 180) * dist}px`);
    p.style.setProperty('--ty', `${Math.sin(angle * Math.PI / 180) * dist}px`);
    p.style.background = colors[i % colors.length];
    p.style.top = '50%'; p.style.left = '50%';
    p.style.marginTop = '-4px'; p.style.marginLeft = '-4px';
    goalCell.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

export function selectPlayer(playerId) {
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer && playerId !== answerer.playerId) {
      setStatus('解答フェーズ中はプレイヤーを変更できません');
      return;
    }
  }
  selectedPlayerId = playerId;
}

export function updateSelectedPlayerHint() {
  const hintEl = document.getElementById('selected-player-hint');
  if (!hintEl) return;
  if (selectedPlayerId) {
    const player = getPlayerById(selectedPlayerId);
    if (player) {
      hintEl.textContent = `選択中: ${player.name}`;
      hintEl.style.color = '#667eea';
      hintEl.style.fontWeight = '600';
    }
  } else {
    hintEl.textContent = '👆 上のプレイヤーカードをクリックして選択してください';
    hintEl.style.color = '#6b7280';
    hintEl.style.fontWeight = '400';
  }
}

// -------------------------------------------------------
// 可変状態の setter（ESモジュールで export let の再代入対応）
// -------------------------------------------------------

export function setSelectedRobot(r)  { selectedRobot    = r; }
export function setMoves(m)          { moves            = m; }
export function setGoal(g, c)        { goal = g; goalColor = c; }
export function setGoalColor(c)      { goalColor        = c; }
export function setSelectedPlayerId(id) { selectedPlayerId = id; }

// window ブリッジ（mode-online.js から呼ぶ）
if (typeof window !== 'undefined') {
  window._gcSetSelectedRobot  = (r)    => { selectedRobot    = r; };
  window._gcSetGoal           = (g, c) => { goal = g; goalColor = c; };
  window._gcSetSelectedPlayerId = (id) => { selectedPlayerId = id; };
}

// _updateDeclarePanel は app.js に移すため、互換用に残す
export function _updateDeclarePanel(isOnline, myPlayerId, phase) {
  const declareBtn = document.getElementById('declare-btn');
  if (isOnline) {
    if (declareBtn) {
      const myPlayer = getPlayers().find(p => p.id === myPlayerId);
      const declared = myPlayer?.declaration !== null;
      const ph = phase ?? getRoundPhase();
      declareBtn.disabled    = declared || ph === 'answering';
      declareBtn.style.opacity = (declared || ph === 'answering') ? '0.5' : '1';
    }
  } else {
    if (declareBtn) { declareBtn.disabled = false; declareBtn.style.opacity = '1'; }
  }
}

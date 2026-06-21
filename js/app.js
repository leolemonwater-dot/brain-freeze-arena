/**
 * app.js
 * エントリーポイント
 * 画面遷移・モード切り替え・キー操作
 *
 * <script type="module" src="js/app.js"> で読み込む
 */

import { showScreen, showConfirmDialog, showResultScreen } from './ui.js';
import {
  initMode, setStatus, showResultPopup,
  generateBoardData, placeGoal, placeRobots,
  resetRobotsToInitial, moveSelectedRobot, updateScoreboard,
  updateRoundInfo, selectPlayer, updateSelectedPlayerHint,
  robots, selectedRobot, moves, goal, goalColor, selectedPlayerId,
  COLORS, boardEl, currentMovesEl, timerEl,
  _updateDpadPenguin, _spawnGoalParticles,
  setSelectedRobot, setMoves, setGoal, setGoalColor, setSelectedPlayerId
} from './game-controller.js';
import { startOfflineGame, onDeclareOffline, onPassOffline, generateBoardOffline } from './mode-offline.js';
import { onDeclareSolo, onGoalSolo, generateBoardSolo, soloPhase, setSoloPhase } from './mode-solo.js';
import {
  initSocket, isOnlineMode, isMyTurn,
  enterLobby, refreshRooms, createRoom, joinRoom,
  toggleReady, startOnlineGame, leaveRoom, returnToRoom,
  sendDeclare, sendPass, sendMove, sendGoalReached, sendRetire,
  toggleCreateRoomForm, getMyPlayerId
} from './mode-online.js';
import { getRoundPhase, getCurrentAnswerer, resolveAnswer } from './round.js';
import { getPlayers, getPlayerById } from './players.js';
import { stopTimer } from './timer.js';
import { sfxDeclare } from './sound.js';

// -------------------------------------------------------
// 初期化
// -------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Socket.IO を初期化（ページ読み込み時に接続）
  initSocket();

  // 初期画面
  showScreen('title-screen');

  // キー操作
  document.addEventListener('keydown', e => {
    const opts = _getMoveOptions();
    if (e.key === 'ArrowUp')    moveSelectedRobot(0, -1, opts);
    if (e.key === 'ArrowDown')  moveSelectedRobot(0,  1, opts);
    if (e.key === 'ArrowLeft')  moveSelectedRobot(-1, 0, opts);
    if (e.key === 'ArrowRight') moveSelectedRobot(1,  0, opts);
  });

  // プレイヤー名入力 Enter キー
  document.getElementById('player-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') onStartGame();
  });
  document.getElementById('online-player-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') onEnterLobby();
  });
});

// -------------------------------------------------------
// タイトル画面
// -------------------------------------------------------

window.goToOnlineMode = function() {
  showScreen('name-screen');
};

window.goToOfflineMode = function() {
  currentGameType = 'offline';
  initMode('offline', () => {});
  showScreen('setup-screen');
  renderSetupPlayers();
};

window.goToSoloMode = function() {
  currentGameType = 'solo';
  initMode('solo', () => {});
  showScreen('game-screen');
  document.getElementById('declare-panel').style.display = 'block';
  document.getElementById('solo-buttons').style.display = 'flex';
  document.getElementById('selected-player-hint').style.display = 'none';
  generateBoardSolo();
};

// -------------------------------------------------------
// 名前入力 → ロビー
// -------------------------------------------------------

window.onEnterLobby = function() {
  const input = document.getElementById('online-player-name-input');
  const name  = input?.value.trim();
  if (!name) { alert('プレイヤー名を入力してください'); return; }
  enterLobby(name);
};

// index.htmlのonclick="enterLobby()" から呼ばれる
window.enterLobby = window.onEnterLobby;

// index.htmlのonclick="showScreen(...)" から呼ばれる
window.showScreen = showScreen;

// -------------------------------------------------------
// 待合室
// -------------------------------------------------------

window.refreshRooms = refreshRooms;
window.toggleCreateRoomForm = toggleCreateRoomForm;

window.onCreateRoom = function() {
  const mode = document.getElementById('mode-select')?.value ?? 'quick';
  createRoom(mode);
};

window.onlineJoinRoom = function(roomId) { joinRoom(roomId); };

// -------------------------------------------------------
// 部屋内待機
// -------------------------------------------------------

window.onlineToggleReady = toggleReady;
window.onlineStartGame   = startOnlineGame;
window.onlineLeaveRoom   = leaveRoom;

// -------------------------------------------------------
// オフライン設定画面
// -------------------------------------------------------

let setupPlayers = [];
let selectedMode = 'quick';

window.selectMode = function(mode) {
  selectedMode = mode;
  document.getElementById('btn-quick')?.classList.toggle('selected', mode === 'quick');
  document.getElementById('btn-score')?.classList.toggle('selected', mode === 'score');
};

window.addPlayerToSetup = function() {
  const input = document.getElementById('player-name-input');
  const name  = input.value.trim();
  if (!name) return;
  if (setupPlayers.length >= 4) { alert('最大4人まで'); return; }
  if (setupPlayers.some(p => p.name === name)) { alert('同じ名前は登録できません'); return; }
  setupPlayers.push({ name });
  input.value = '';
  renderSetupPlayers();
};

window.removeSetupPlayer = function(index) {
  setupPlayers.splice(index, 1);
  renderSetupPlayers();
};

function renderSetupPlayers() {
  const list = document.getElementById('player-list');
  if (!list) return;
  list.innerHTML = setupPlayers.map((p, i) =>
    `<li><span>${p.name}</span><button onclick="removeSetupPlayer(${i})">削除</button></li>`
  ).join('');
}

window.onStartGame = function() {
  if (setupPlayers.length < 2) { alert('プレイヤーを2人以上追加してください'); return; }
  currentGameType = 'offline';
  initMode('offline', () => {});
  document.getElementById('solo-buttons').style.display = 'none';
  document.getElementById('selected-player-hint').style.display = 'block';
  showScreen('game-screen');
  document.getElementById('declare-panel').style.display = 'block';
  startOfflineGame(selectedMode, setupPlayers.map(p => p.name));
  const ps = getPlayers();
  if (ps.length > 0) selectPlayer(ps[0].id);
  updateScoreboard(false, null);
};

// -------------------------------------------------------
// ゲーム画面
// -------------------------------------------------------

window.onBackFromGame = function() {
  if (currentGameType === 'offline') {
    showConfirmDialog('ゲームを終了しますか？', () => {
      stopTimer();
      showScreen('setup-screen');
    });
  } else if (currentGameType === 'online') {
    showConfirmDialog('リタイアしますか？', () => {
      sendRetire();
      showScreen('room-screen');
    });
  } else {
    showConfirmDialog('ゲームを終了しますか？', () => {
      stopTimer();
      showScreen('title-screen');
    });
  }
};

window.selectPlayer = function(playerId) {
  selectPlayer(playerId);
  updateScoreboard(isOnlineMode(), getMyPlayerId());
};

window.changeDeclareMove = function(delta) {
  const display = document.getElementById('declare-moves-display');
  if (!display) return;
  let val = parseInt(display.textContent) + delta;
  if (val < 1) val = 1;
  if (val > 99) val = 99;
  display.textContent = val;
};

window.onDeclare = function() {
  const display  = document.getElementById('declare-moves-display');
  const movesVal = display ? parseInt(display.textContent) : NaN;
  if (isNaN(movesVal) || movesVal < 1) { alert('手数を入力してください'); return; }

  if (isOnlineMode()) {
    sendDeclare(movesVal);
    const btn = document.getElementById('declare-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  } else if (currentGameType === 'solo') {
    onDeclareSolo(movesVal);
  } else {
    onDeclareOffline(movesVal);
  }
};

window.handlePass = function() {
  const phase = getRoundPhase();
  if (phase === 'thinking' || phase === 'additional') {
    if (isOnlineMode()) {
      sendPass();
    } else if (currentGameType === 'solo') {
      // ソロにパスなし
    } else {
      onPassOffline();
    }
    return;
  }
  if (phase === 'answering') {
    const robot = selectedRobot;
    if (robot) {
      robot.classList.add('incorrect');
      showResultPopup(false);
      setTimeout(() => {
        robot.classList.remove('incorrect');
        if (isOnlineMode()) {
          sendGoalReached(robot.dataset.color, Infinity);
        } else {
          resolveAnswer(false, Infinity);
        }
      }, 500);
    } else {
      showResultPopup(false);
      setTimeout(() => {
        if (!isOnlineMode()) resolveAnswer(false, Infinity);
      }, 500);
    }
  }
};

// ソロ用ボタン
window.generateBoard     = generateBoardSolo;        // 盤面再生成
window.regenerateGoalAndReset = function() {          // ゴール再生成
  resetRobotsToInitial();
  placeGoal();
};

// 方向ボタン
window.flashDirBtn = function(btn) {
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 200);
};

window.moveSelectedRobot = function(dx, dy) {
  moveSelectedRobot(dx, dy, _getMoveOptions());
};

// -------------------------------------------------------
// 結果画面
// -------------------------------------------------------

window.onResultOffline = function() {
  showScreen('setup-screen');
  renderSetupPlayers();
};

window.onResultOnline = returnToRoom;
window.goToTitle      = function() { showScreen('title-screen'); };
window.backToTitle    = function() { showScreen('title-screen'); };

// -------------------------------------------------------
// 内部ユーティリティ
// -------------------------------------------------------

function _getMoveOptions() {
  return {
    isOnline:       isOnlineMode(),
    isSolo:         currentGameType === 'solo',
    soloPhase:      soloPhase,
    myPlayerId:     getMyPlayerId(),
    onGoalOffline:  (success, usedMoves) => {
      if (currentGameType === 'solo') {
        if (success) onGoalSolo();
      } else {
        resolveAnswer(success, usedMoves);
      }
    },
    onGoalOnline:   (color, usedMoves) => sendGoalReached(color, usedMoves),
    onWrongOnline:  (color, usedMoves) => sendGoalReached(color, usedMoves),
    onMoveOnline:   (color, dx, dy)    => sendMove(color, dx, dy),
  };
}

/**
 * mode-online.js
 * オンライン対戦専用ロジック（lobby-client + online を統合）
 *
 * 依存: game-controller.js, players.js, round.js, mode.js, ui.js, sound.js
 * 循環依存なし（game-controller からのみ受け取り、game-controller を呼ばない）
 */

import {
  robots, selectedRobot, boardEl, currentMovesEl, timerEl,
  setStatus, showResultPopup, updateScoreboard, updateRoundInfo,
  resetRobotsToInitial, updateMovesDisplay, _spawnGoalParticles,
  placeGoal, placeRobots, selectPlayer, _updateDpadPenguin,
  COLORS
} from './game-controller.js';
import {
  renderEmptyBoard, drawWalls, renderGoal, createRobotEl,
  addRobotAura, removeRobotAura, setRobotFacing, moveRobotEl
} from './renderer.js';
import { getPlayers, getPlayerById, resetAllPlayers, addPlayer, resetDeclarations } from './players.js';
import {
  getRoundPhase, getCurrentAnswerer, setRoundPhaseOnline, _setOnlineAnswerer
} from './round.js';
import { getGameMode, _setOnlineGameMode } from './mode.js';
import { showScreen, showResultScreen } from './ui.js';
import { calcRobotDestination } from './robot.js';
import { walls } from './board.js';
import { sfxGoal, sfxTick, sfxDeclare } from './sound.js';
import { initMode } from './game-controller.js';

// -------------------------------------------------------
// オンライン状態
// -------------------------------------------------------

let _socket         = null;
let _roomId         = null;
let _playerName     = null;
let _isHost         = false;
let _isReady        = false;
let _active         = false;
let _myPlayerId     = null;

export function isOnlineMode()  { return _active; }
export function isMyTurn() {
  if (!_active) return false;
  if (getRoundPhase() !== 'answering') return false;
  const answerer = getCurrentAnswerer();
  return answerer?.playerId === _myPlayerId;
}

// -------------------------------------------------------
// Socket初期化（ページ読み込み時に一度だけ）
// -------------------------------------------------------

export function initSocket() {
  if (_socket) return _socket;
  _socket = io();
  _socket.on('connect', () => {
    _myPlayerId = _socket.id;
    _setupLobbyListeners();
    _setupGameListeners();
  });
  return _socket;
}

export function getSocket()    { return _socket; }
export function getMyPlayerId(){ return _myPlayerId; }

// -------------------------------------------------------
// ロビー操作
// -------------------------------------------------------

export function enterLobby(playerName) {
  _playerName = playerName;
  document.getElementById('player-name-display').textContent = playerName;
  showScreen('lobby-screen');
  refreshRooms();
}

export function refreshRooms() {
  _socket?.emit('getRooms');
}

export function createRoom(mode) {
  _socket?.emit('createRoom', { playerName: _playerName, mode });
  _hideCreateRoomForm();
}

export function joinRoom(roomId) {
  _socket?.emit('joinRoom', { roomId, playerName: _playerName });
}

export function toggleReady() {
  _isReady = !_isReady;
  _socket?.emit('setReady', { roomId: _roomId, isReady: _isReady });
}

export function startOnlineGame() {
  _socket?.emit('startGame', { roomId: _roomId });
}

export function leaveRoom() {
  if (_roomId) _socket?.emit('retire', { roomId: _roomId });
  _roomId   = null;
  _isHost   = false;
  _isReady  = false;
  showScreen('lobby-screen');
  refreshRooms();
}

export function returnToRoom() {
  _socket?.emit('returnToRoom', { roomId: _roomId });
  _active = false;
  showScreen('room-screen');
}

export function _hideCreateRoomForm() {
  const form = document.getElementById('create-room-form');
  if (form) form.style.display = 'none';
}

export function toggleCreateRoomForm() {
  const form = document.getElementById('create-room-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// -------------------------------------------------------
// ゲーム送信
// -------------------------------------------------------

export function sendDeclare(moves) {
  _socket?.emit('declare', { roomId: _roomId, moves });
}

export function sendPass() {
  _socket?.emit('pass', { roomId: _roomId });
}

export function sendMove(robotColor, dx, dy) {
  const dir = _vecToDir(dx, dy);
  if (!dir) return;
  _socket?.emit('moveRobot', { roomId: _roomId, robotColor, direction: dir });
}

export function sendGoalReached(robotColor, usedMoves) {
  _socket?.emit('reportGoal', { roomId: _roomId, robotColor, usedMoves });
}

export function sendRetire() {
  _socket?.emit('retire', { roomId: _roomId });
  _active = false;
}

// -------------------------------------------------------
// ロビーイベントリスナー
// -------------------------------------------------------

function _setupLobbyListeners() {
  _socket.on('roomsList', (rooms) => {
    const container = document.getElementById('rooms-list');
    if (!container) return;
    if (rooms.length === 0) {
      container.innerHTML = '<div class="empty-message">現在、部屋はありません</div>';
      return;
    }
    container.innerHTML = rooms.map(room => {
      const modeLabel   = room.mode === 'quick' ? 'Quick Mode' : 'Score Mode';
      const statusLabel = room.status === 'waiting' ? '待機中' : room.status === 'playing' ? 'ゲーム中' : '終了';
      const canJoin     = room.status === 'waiting' && room.playerCount < room.maxPlayers;
      return `
        <div class="room-item">
          <div class="room-info">
            <h4>${_esc(room.hostName)}の部屋</h4>
            <p>${modeLabel} | ${room.playerCount}/${room.maxPlayers}人
              <span class="room-status-badge ${room.status}">${statusLabel}</span>
            </p>
          </div>
          <button class="join-btn" onclick="onlineJoinRoom('${room.id}')" ${canJoin ? '' : 'disabled'}>参加</button>
        </div>`;
    }).join('');
  });

  _socket.on('roomCreated', ({ roomId, room }) => {
    _roomId  = roomId;
    _isHost  = true;
    _isReady = true;
    showScreen('room-screen');
    _updateRoomDisplay(room);
  });

  _socket.on('roomJoined', ({ roomId, room }) => {
    _roomId  = roomId;
    _isHost  = false;
    _isReady = false;
    showScreen('room-screen');
    _updateRoomDisplay(room);
  });

  _socket.on('joinError', ({ message }) => alert(message));

  _socket.on('roomUpdated', (room) => {
    if (room.id === _roomId) _updateRoomDisplay(room);
  });

  _socket.on('hostChanged', ({ newHostId }) => {
    if (newHostId === _socket.id) _isHost = true;
  });

  _socket.on('playerDisconnected', ({ playerName: name }) => _showRoomMsg(`${name} が切断しました`));
  _socket.on('playerReconnected', ({ playerName: name }) => _showRoomMsg(`${name} が再接続しました`));

  // ゲーム開始 → ゲーム画面へ
  _socket.on('gameStarted', ({ room }) => {
    _active      = true;
    _myPlayerId  = _socket.id;

    // 状態リセット（setOnlineModeActiveはinitMode内で処理）
    initMode('online', (val) => { _active = val; });

    // プレイヤー登録
    resetAllPlayers();
    room.players.forEach(p => {
      const player = addPlayer(p.name);
      player.id    = p.id;
      player.isHost = p.isHost;
    });
    _setOnlineGameMode(room.mode ?? 'quick', 0);

    // ゲーム画面へ
    window.currentGameType = 'online';
    showScreen('game-screen');
    const dp = document.getElementById('declare-panel');
    if (dp) dp.style.display = 'block';
    const sb = document.getElementById('solo-buttons');
    if (sb) sb.style.display = 'none';

    // ゲームイベントリスナー（2重登録防止）
    _setupGameListeners();
  });
}

// -------------------------------------------------------
// ゲームイベントリスナー
// -------------------------------------------------------

let _gameListenersReady = false;

function _setupGameListeners() {
  if (_gameListenersReady) return;
  _gameListenersReady = true;

  // 盤面データ受信
  _socket.on('boardSynced', (boardData) => {
    setRoundPhaseOnline('thinking');
    resetDeclarations();
    // moves リセットは game-controller 側の変数
    const display = document.getElementById('declare-moves-display');
    if (display) display.textContent = '3';
    _applyBoardData(boardData);
  });

  // ラウンド開始
  _socket.on('roundStarted', ({ round, mode }) => {
    _setOnlineGameMode(mode, round);
    updateRoundInfo();
  });

  // フェーズ変更
  _socket.on('phaseChanged', ({ phase, answererId, answererName, declaredMoves }) => {
    if (phase === 'thinking') {
      setRoundPhaseOnline('thinking');
      resetDeclarations();
      _onPhaseThinking();
    } else if (phase === 'additional') {
      setRoundPhaseOnline('additional');
      _onPhaseAdditional();
    } else if (phase === 'answering') {
      setRoundPhaseOnline('answering');
      _setOnlineAnswerer(answererId, declaredMoves);
      // selectedPlayerId を更新（game-controller の変数）
      window._gcSetSelectedPlayerId && window._gcSetSelectedPlayerId(answererId);
      _onPhaseAnswering(answererId, answererName, declaredMoves);
    }
  });

  // タイマー
  _socket.on('timerTick', ({ phase, remaining }) => {
    if (!timerEl) return;
    if (phase === 'thinking') {
      timerEl.textContent = `思考中... 残り ${remaining}秒`;
      timerEl.style.color = remaining <= 10 ? '#dc2626' : '#374151';
      if (remaining <= 10 && remaining > 0) sfxTick();
    } else if (phase === 'additional') {
      timerEl.textContent = `アディショナル: 残り ${remaining}秒`;
      timerEl.style.color = remaining <= 10 ? '#dc2626' : '#1d4ed8';
      if (remaining <= 10 && remaining > 0) sfxTick();
    } else if (phase === 'answering') {
      timerEl.textContent = `解答中: 残り ${remaining}秒`;
      timerEl.style.color = remaining <= 10 ? '#dc2626' : '#1d4ed8';
      if (remaining <= 10 && remaining > 0) sfxTick();
    }
  });

  // 宣言受信
  _socket.on('playerDeclared', ({ playerId, moves: m }) => {
    const p = getPlayerById(playerId);
    if (p) p.declaration = { playerId, moves: m, timestamp: Date.now() };
    updateScoreboard(true, _myPlayerId);
  });

  // パス受信
  _socket.on('playerPassed', ({ playerId }) => {
    const p = getPlayerById(playerId);
    if (p) p.passed = true;
    updateScoreboard(true, _myPlayerId);
  });

  // ロボット移動受信（閲覧者用）
  _socket.on('robotMoved', ({ robotColor, direction }) => {
    const robot = robots.find(r => r.dataset.color === robotColor);
    if (!robot || isMyTurn()) return;
    const [dx, dy] = _dirToVec(direction);
    const dir = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down';
    setRobotFacing(robot, dir);
    // selectedRobot を一時的に置き換えて移動
    const prevSelected = selectedRobot;
    // 移動計算
    const startX = parseInt(robot.dataset.x);
    const startY = parseInt(robot.dataset.y);
    const { x, y } = calcRobotDestination(startX, startY, dx, dy, robots, robot);
    if (x !== startX || y !== startY) {
      robot.classList.add('moving');
      setTimeout(() => robot.classList.remove('moving'), 400);
      moveRobotEl(robot, x, y);
      if (dir === 'down') setRobotFacing(robot, 'front');
    }
  });

  // ゴール到達アニメーション（閲覧者用）
  _socket.on('goalReached', ({ robotColor }) => {
    if (isMyTurn()) return; // 解答者は game-controller で処理済み
    const robot = robots.find(r => r.dataset.color === robotColor);
    if (robot) {
      robot.classList.add('correct');
      const gs = document.querySelector('.goalStar');
      if (gs) gs.classList.add('goal-reached');
      showResultPopup(true);
      setTimeout(() => robot.classList.remove('correct'), 600);
    }
  });

  // ロボットリセット
  _socket.on('resetRobots', () => {
    resetRobotsToInitial();
    updateMovesDisplay();
  });

  // 解答結果（不正解アニメーション）
  _socket.on('answerResult', ({ playerId, success }) => {
    if (!success && playerId !== _myPlayerId) {
      // 他プレイヤーの不正解
      const answerer = getCurrentAnswerer();
      const robot = robots.find(r => r.dataset.color);
      // 特定のロボットを強調する処理は省略（ステータスで表示）
    }
  });

  // ラウンド終了
  _socket.on('roundEnded', ({ winnerId, points, additionalStartSec, players: sp }) => {
    sp.forEach(s => {
      const p = getPlayerById(s.id);
      if (p) { p.wins = s.wins; p.score = s.score; }
    });
    setRoundPhaseOnline('ended');

    if (winnerId) {
      const winner = getPlayerById(winnerId);
      const name   = winner?.name ?? '?';
      if (winnerId === _myPlayerId) {
        setStatus(`正解！ ${name} が獲得`);
        if (getGameMode() === 'score' && points > 0) {
          const decl = winner?.declaration;
          _showPopup(`🎉 ${additionalStartSec}秒 × ${decl?.moves ?? '?'}手 = ${points}点`, true);
        }
      } else {
        if (getGameMode() === 'score' && points > 0) {
          const decl = getPlayerById(winnerId)?.declaration;
          _showPopup(`${name} の正解！\n${additionalStartSec}秒 × ${decl?.moves ?? '?'}手 = ${points}点`, true);
        } else {
          _showPopup(`${name} の正解！🎉`, true);
        }
        setStatus(`${name} の正解！`);
      }
    } else {
      setStatus('全員不正解。次のラウンドへ');
    }
    updateScoreboard(true, _myPlayerId);
    if (currentMovesEl) currentMovesEl.style.display = 'none';
    _hideDpadShowDeclare();
  });

  // ラウンドスキップ
  _socket.on('roundSkipped', ({ reason }) => setStatus(`ラウンドスキップ: ${reason}`));

  // ゲーム終了
  _socket.on('gameEnded', ({ winner, players: sp }) => {
    sp.forEach(s => {
      const p = getPlayerById(s.id);
      if (p) { p.wins = s.wins; p.score = s.score; }
    });
    const winnerPlayer = winner ? getPlayerById(winner.id) : null;
    showResultScreen({
      winner:   winnerPlayer,
      players:  getPlayers(),
      mode:     getGameMode(),
      gameType: 'online'
    });
  });

  // 切断・再接続
  _socket.on('playerDisconnected', ({ playerId, playerName: name, isRetire }) => {
    setStatus(isRetire ? `${name} がリタイアしました` : `${name} が切断しました`);
    const p = getPlayerById(playerId);
    if (p) p.disconnected = true;
    updateScoreboard(true, _myPlayerId);
  });
  _socket.on('playerReconnected', ({ playerId, playerName: name }) => {
    setStatus(`${name} が再接続しました`);
    const p = getPlayerById(playerId);
    if (p) p.disconnected = false;
    updateScoreboard(true, _myPlayerId);
  });
  _socket.on('hostChanged', ({ newHostId }) => {
    if (newHostId === _socket.id) {
      _isHost = true;
      setStatus('あなたがホストになりました');
    }
  });
  _socket.on('error', ({ message }) => alert(message));
}

// -------------------------------------------------------
// フェーズ処理（オンライン）
// -------------------------------------------------------

function _onPhaseThinking() {
  setStatus('思考中... 手数を宣言してください');
  _hideDpadShowDeclare();
  _updateDeclarePanelOnline();
  updateScoreboard(true, _myPlayerId);
  updateRoundInfo();
}

function _onPhaseAdditional() {
  setStatus('アディショナルタイム！追加宣言を受け付けています');
  _updateDeclarePanelOnline();
  updateScoreboard(true, _myPlayerId);
}

function _onPhaseAnswering(answererId, answererName, declaredMoves) {
  resetRobotsToInitial();
  updateMovesDisplay();
  updateScoreboard(true, _myPlayerId);
  updateRoundInfo();
  _showDpadHideDeclare();

  if (answererId === _myPlayerId) {
    setStatus('🎯 あなたの番です！');
  } else {
    setStatus(`${answererName} が解答中`);
  }
}

// -------------------------------------------------------
// 盤面データ適用
// -------------------------------------------------------

function _applyBoardData(boardData) {
  // walls を上書き（board.js のグローバル変数に直接代入）
  // ESモジュール化後は import した walls を置き換えられないため
  // 暫定的に window.walls を使う（フェーズ4で解決）
  if (window.walls !== undefined) {
    // 旧game.jsが読まれている間は window.walls が使える
  }
  // board-logic 経由で walls を更新
  const w = boardData.walls;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      walls[y][x] = w[y][x];
    }
  }

  renderEmptyBoard(boardEl);
  drawWalls();

  document.querySelectorAll('.robot').forEach(e => e.remove());
  // robots 配列をクリア（game-controller の変数）
  robots.length = 0;

  boardData.robots.forEach(rd => {
    const r = createRobotEl(rd.color, rd.x, rd.y, (robotEl) => {
      if (!isMyTurn()) return;
      document.querySelectorAll('.robot').forEach(ro => removeRobotAura(ro));
      addRobotAura(robotEl);
      // selectedRobot 更新
      window._gcSetSelectedRobot && window._gcSetSelectedRobot(robotEl);
      _updateDpadPenguin(robotEl.dataset.color);
    });
    r.dataset.initX = rd.initX;
    r.dataset.initY = rd.initY;
    robots.push(r);
  });

  // goal/goalColor 更新（game-controller の変数）
  window._gcSetGoal && window._gcSetGoal(boardData.goal, boardData.goalColor);
  renderGoal(boardData.goal, boardData.goalColor);
}

// -------------------------------------------------------
// UI ユーティリティ
// -------------------------------------------------------

function _updateDeclarePanelOnline() {
  const hintEl    = document.getElementById('selected-player-hint');
  const declareBtn = document.getElementById('declare-btn');
  if (hintEl) hintEl.style.display = 'none';
  if (declareBtn) {
    const myPlayer = getPlayers().find(p => p.id === _myPlayerId);
    const declared = myPlayer?.declaration !== null;
    const phase    = getRoundPhase();
    declareBtn.disabled    = declared || phase === 'answering';
    declareBtn.style.opacity = (declared || phase === 'answering') ? '0.5' : '1';
  }
}

function _showDpadHideDeclare() {
  document.getElementById('direction-buttons')?.classList.add('visible');
  const dp = document.getElementById('declare-panel');
  if (dp) dp.style.display = 'none';
}

function _hideDpadShowDeclare() {
  document.getElementById('direction-buttons')?.classList.remove('visible');
  const dp = document.getElementById('declare-panel');
  if (dp && getPlayers().length > 0) dp.style.display = 'block';
}

function _updateRoomDisplay(room) {
  const roomIdEl   = document.getElementById('room-id-display');
  const roomModeEl = document.getElementById('room-mode-display');
  if (roomIdEl)   roomIdEl.textContent   = room.id;
  if (roomModeEl) roomModeEl.textContent = room.mode === 'quick' ? 'Quick Mode (5本先取)' : 'Score Mode (10ラウンド)';
  const countEl = document.getElementById('player-count');
  if (countEl) countEl.textContent = room.players.length;

  const pc = document.getElementById('players-container');
  if (pc) {
    pc.innerHTML = room.players.map(p => {
      const badge = p.isHost
        ? '<span class="player-badge badge-host">ホスト</span>'
        : p.isReady
          ? '<span class="player-badge badge-ready">準備完了</span>'
          : '<span class="player-badge badge-waiting">待機中</span>';
      return `<div class="player-item"><span class="player-name">${_esc(p.name)}</span>${badge}</div>`;
    }).join('');
  }

  const ac = document.getElementById('room-actions');
  if (ac) {
    if (_isHost) {
      const allReady = room.players.every(p => p.isReady);
      const canStart = room.players.length >= 2 && allReady;
      ac.innerHTML = `<button class="start-btn" onclick="onlineStartGame()" ${canStart ? '' : 'disabled'}>ゲーム開始</button>`;
    } else {
      ac.innerHTML = `<button class="ready-btn ${_isReady ? 'cancel' : ''}" onclick="onlineToggleReady()">${_isReady ? '準備キャンセル' : '準備完了'}</button>`;
    }
  }
}

function _showRoomMsg(msg) {
  const el = document.getElementById('room-status-message');
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 3000); }
}

function _showPopup(message, isCorrect = true) {
  const el = document.getElementById('result-popup');
  if (!el) return;
  el.textContent = message;
  el.className = isCorrect ? 'correct show' : 'incorrect show';
  setTimeout(() => el.classList.remove('show'), 2000);
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _vecToDir(dx, dy) {
  if (dx === 0 && dy === -1) return 'up';
  if (dx === 0 && dy === 1)  return 'down';
  if (dx === -1 && dy === 0) return 'left';
  if (dx === 1 && dy === 0)  return 'right';
  return null;
}

function _dirToVec(dir) {
  return { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[dir] ?? [0,0];
}

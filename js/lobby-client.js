/**
 * lobby-client.js
 * 待合室のクライアント側ロジック
 * online.jsのonlineSocketを共有して使う（ページ遷移なし）
 */

let lobbyPlayerName = '';
let currentRoomId   = null;
let lobbyIsHost     = false;
let lobbyIsReady    = false;

// -------------------------------------------------------
// 名前入力
// -------------------------------------------------------

function enterLobby() {
  const input = document.getElementById('online-player-name-input');
  lobbyPlayerName = input.value.trim();

  if (!lobbyPlayerName) {
    alert('プレイヤー名を入力してください');
    return;
  }

  document.getElementById('player-name-display').textContent = lobbyPlayerName;
  showScreen('lobby-screen');
  refreshRooms();
}

// -------------------------------------------------------
// 待合室
// -------------------------------------------------------

function refreshRooms() {
  _lobbySocket().emit('getRooms');
}

function createRoom() {
  const modeSelect = document.getElementById('mode-select');
  const mode = modeSelect ? modeSelect.value : 'quick';
  _lobbySocket().emit('createRoom', { playerName: lobbyPlayerName, mode });
  toggleCreateRoomForm();
}

function joinRoom(roomId) {
  _lobbySocket().emit('joinRoom', { roomId, playerName: lobbyPlayerName });
}

function toggleCreateRoomForm() {
  const form = document.getElementById('create-room-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// -------------------------------------------------------
// 部屋内待機
// -------------------------------------------------------

function toggleReady() {
  lobbyIsReady = !lobbyIsReady;
  _lobbySocket().emit('setReady', { roomId: currentRoomId, isReady: lobbyIsReady });
}

function startOnlineGame() {
  _lobbySocket().emit('startGame', { roomId: currentRoomId });
}

function leaveRoom() {
  if (currentRoomId) {
    _lobbySocket().emit('retire', { roomId: currentRoomId });
  }
  currentRoomId = null;
  lobbyIsHost   = false;
  lobbyIsReady  = false;
  showScreen('lobby-screen');
  refreshRooms();
}

// -------------------------------------------------------
// Socket.IOイベントの登録（online.jsのSocketが準備できてから呼ぶ）
// -------------------------------------------------------

function setupLobbyListeners(sock) {
  // 部屋一覧
  sock.on('roomsList', (rooms) => {
    const container = document.getElementById('rooms-list');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = '<div class="empty-message">現在、部屋はありません</div>';
      return;
    }

    container.innerHTML = rooms.map(room => {
      const modeLabel   = room.mode === 'quick' ? 'Quick Mode' : 'Score Mode';
      const statusLabel = room.status === 'waiting' ? '待機中'
                        : room.status === 'playing' ? 'ゲーム中' : '終了';
      const isFull  = room.playerCount >= room.maxPlayers;
      const canJoin = room.status === 'waiting' && !isFull;

      return `
        <div class="room-item">
          <div class="room-info">
            <h4>${_escapeHtml(room.hostName)}の部屋</h4>
            <p>${modeLabel} | ${room.playerCount}/${room.maxPlayers}人
              <span class="room-status-badge ${room.status}">${statusLabel}</span>
            </p>
          </div>
          <button class="join-btn" onclick="joinRoom('${room.id}')" ${canJoin ? '' : 'disabled'}>
            参加
          </button>
        </div>
      `;
    }).join('');
  });

  // 部屋作成成功
  sock.on('roomCreated', ({ roomId, room }) => {
    currentRoomId = roomId;
    lobbyIsHost   = true;
    lobbyIsReady  = true;
    showScreen('room-screen');
    _updateRoomDisplay(room);
  });

  // 部屋参加成功
  sock.on('roomJoined', ({ roomId, room }) => {
    currentRoomId = roomId;
    lobbyIsHost   = false;
    lobbyIsReady  = false;
    showScreen('room-screen');
    _updateRoomDisplay(room);
  });

  // 部屋参加エラー
  sock.on('joinError', ({ message }) => {
    alert(message);
  });

  // 部屋情報更新
  sock.on('roomUpdated', (room) => {
    if (room.id === currentRoomId) {
      _updateRoomDisplay(room);
    }
  });

  // ゲーム開始 → ページ遷移なしでゲーム画面に切り替え
  sock.on('gameStarted', ({ room }) => {
    // オンラインモードの変数を設定
    onlineModeActive = true;
    onlineRoomId     = currentRoomId;
    onlinePlayerName = lobbyPlayerName;
    onlineIsHost     = lobbyIsHost;
    myPlayerId       = sock.id;

    // プレイヤーリストを初期化
    resetAllPlayers();
    room.players.forEach(p => {
      const player = addPlayer(p.name);
      player.id     = p.id;
      player.isHost = p.isHost;
    });
    _setOnlineGameMode(room.mode ?? 'quick', 0);

    // ゲーム画面に切り替え
    currentGameType = 'online';
    showScreen('game-screen');
    document.getElementById('declare-panel').style.display = 'block';

    // ゲームイベントリスナーを設定（online.jsの関数）
    _setupListeners();
  });

  // ホスト交代
  sock.on('hostChanged', ({ newHostId }) => {
    if (newHostId === sock.id) {
      lobbyIsHost = true;
    }
  });

  // プレイヤー切断通知
  sock.on('playerDisconnected', ({ playerName: name }) => {
    _showRoomMessage(`${name} が切断しました`);
  });

  // プレイヤー再接続通知
  sock.on('playerReconnected', ({ playerName: name }) => {
    _showRoomMessage(`${name} が再接続しました`);
  });
}

// -------------------------------------------------------
// UI更新
// -------------------------------------------------------

function _updateRoomDisplay(room) {
  const roomIdEl   = document.getElementById('room-id-display');
  const roomModeEl = document.getElementById('room-mode-display');
  if (roomIdEl)   roomIdEl.textContent   = room.id;
  if (roomModeEl) roomModeEl.textContent = room.mode === 'quick' ? 'Quick Mode (5本先取)' : 'Score Mode (10ラウンド)';

  const countEl = document.getElementById('player-count');
  if (countEl) countEl.textContent = room.players.length;

  const playersContainer = document.getElementById('players-container');
  if (playersContainer) {
    playersContainer.innerHTML = room.players.map(p => {
      let badge = p.isHost
        ? '<span class="player-badge badge-host">ホスト</span>'
        : p.isReady
          ? '<span class="player-badge badge-ready">準備完了</span>'
          : '<span class="player-badge badge-waiting">待機中</span>';
      return `<div class="player-item">
        <span class="player-name">${_escapeHtml(p.name)}</span>
        ${badge}
      </div>`;
    }).join('');
  }

  const actionsContainer = document.getElementById('room-actions');
  if (actionsContainer) {
    if (lobbyIsHost) {
      const allReady = room.players.every(p => p.isReady);
      const canStart = room.players.length >= 2 && allReady;
      actionsContainer.innerHTML = `
        <button class="start-btn" onclick="startOnlineGame()" ${canStart ? '' : 'disabled'}>
          ゲーム開始
        </button>
      `;
    } else {
      actionsContainer.innerHTML = `
        <button class="ready-btn ${lobbyIsReady ? 'cancel' : ''}" onclick="toggleReady()">
          ${lobbyIsReady ? '準備キャンセル' : '準備完了'}
        </button>
      `;
    }
  }
}

function _showRoomMessage(message) {
  const statusEl = document.getElementById('room-status-message');
  if (statusEl) {
    statusEl.textContent = message;
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -------------------------------------------------------
// Socketへのアクセサ（online.jsのSocketを使う）
// -------------------------------------------------------
function _lobbySocket() {
  // online.jsで初期化されたSocketを使う
  // まだ初期化されていない場合は新規作成
  if (!onlineSocket) {
    onlineSocket = io();
    onlineSocket.on('connect', () => {
      myPlayerId = onlineSocket.id;
      setupLobbyListeners(onlineSocket);
    });
  }
  return onlineSocket;
}

// ページ読み込み時にSocketを初期化してロビーリスナーを設定
document.addEventListener('DOMContentLoaded', () => {
  // Socketを初期化（接続確立後にリスナーを設定）
  if (!onlineSocket) {
    onlineSocket = io();
    onlineSocket.on('connect', () => {
      myPlayerId = onlineSocket.id;
      setupLobbyListeners(onlineSocket);
    });
  } else {
    setupLobbyListeners(onlineSocket);
  }
});

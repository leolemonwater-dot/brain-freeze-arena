/**
 * server.js
 * Brain Freeze Arena オンライン対戦サーバー
 * Socket.IO接続・切断の受付とイベントルーティング
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

const RoomManager  = require('./rooms');
const GameManager  = require('./game-manager');
const TimerManager = require('./timer-manager');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 静的ファイルの配信
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

// マネージャーの初期化
const roomManager  = new RoomManager();
const timerManager = new TimerManager(io);
const gameManager  = new GameManager(io, timerManager);

// -------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------

/** ランダムな6文字の部屋IDを生成 */
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** 部屋の公開情報を返す（クライアントに送信する形式） */
function roomPublicInfo(room) {
  return {
    id:      room.id,
    hostId:  room.hostId,
    mode:    room.mode,
    status:  room.status,
    players: room.players
      .filter(p => !p.disconnected)
      .map(p => ({
        id:      p.id,
        name:    p.name,
        isHost:  p.isHost,
        isReady: p.isReady
      }))
  };
}

// -------------------------------------------------------
// Socket.IO 接続処理
// -------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`接続: ${socket.id}`);

  // ---- 部屋一覧を取得 ----
  socket.on('getRooms', () => {
    socket.emit('roomsList', roomManager.getAllRooms());
  });

  // ---- 部屋を作成 ----
  socket.on('createRoom', ({ playerName, mode }) => {
    const roomId = generateRoomId();
    const room   = roomManager.createRoom(roomId, socket.id, playerName, mode);

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, room: roomPublicInfo(room) });

    console.log(`部屋作成: ${roomId} by ${playerName}`);
  });

  // ---- 部屋に参加 / 再接続 ----
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const result = roomManager.joinRoom(roomId, socket.id, playerName);

    if (!result) {
      socket.emit('joinError', { message: '部屋に参加できませんでした' });
      return;
    }

    const { room, isReconnect, player } = result;
    socket.join(roomId);

    if (isReconnect) {
      // 再接続：切断タイマーをキャンセル
      timerManager.stopDisconnect(`${roomId}_${player.id}`);

      console.log(`再接続: ${playerName} → 部屋 ${roomId}`);

      // startingUpフラグを解除（全員再接続したら）
      if (room.gameState?.startingUp) {
        const allConnected = room.players.every(p => !p.disconnected);
        if (allConnected) {
          room.gameState.startingUp = false;
          console.log(`全員再接続完了: ${roomId}`);
        }
      }

      // 再接続したプレイヤーに現在のゲーム状態を送信
      socket.emit('reconnected', {
        room:      roomPublicInfo(room),
        gameState: room.gameState ? {
          phase:        room.gameState.phase,
          currentRound: room.gameState.currentRound,
          boardData:    room.gameState.boardData,
          answerQueue:  room.gameState.answerQueue,
          answerIndex:  room.gameState.answerIndex
        } : null,
        // プレイヤー情報（スコア等）も送信
        players: room.players.map(p => ({
          id:          p.id,
          name:        p.name,
          wins:        p.wins,
          score:       p.score,
          penalized:   p.penalized,
          declaration: p.declaration,
          passed:      p.passed
        }))
      });

      // 他のプレイヤーに再接続を通知
      socket.to(roomId).emit('playerReconnected', {
        playerId:   socket.id,
        playerName: playerName
      });

      // ホスト交代が発生していた場合は通知
      if (room.hostId === socket.id) {
        io.to(roomId).emit('hostChanged', { newHostId: socket.id });
      }
    } else {
      // 新規参加
      console.log(`参加: ${playerName} → 部屋 ${roomId}`);
      socket.emit('roomJoined', { roomId, room: roomPublicInfo(room) });
    }

    // 部屋全員に更新を通知
    io.to(roomId).emit('roomUpdated', roomPublicInfo(room));
  });

  // ---- 準備完了 / キャンセル ----
  socket.on('setReady', ({ roomId, isReady }) => {
    const room = roomManager.setReady(roomId, socket.id, isReady);
    if (room) {
      io.to(roomId).emit('roomUpdated', roomPublicInfo(room));
    }
  });

  // ---- ゲーム開始 ----
  socket.on('startGame', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);

    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'ゲームを開始できません' });
      return;
    }
    // すでにゲーム中なら無視
    if (room.status !== 'waiting') {
      return;
    }
    if (!roomManager.isAllReady(roomId)) {
      socket.emit('error', { message: '全員が準備完了していません' });
      return;
    }

    console.log(`ゲーム開始: ${roomId}`);

    // クライアントにゲーム開始を通知（startGameより先に送信してlocalStorageを設定させる）
    io.to(roomId).emit('gameStarted', { room: roomPublicInfo(room) });

    gameManager.startGame(
      room,
      // onRoundEnd
      (room) => {
        // ラウンド終了後の処理はgame-manager内で実施済み
      },
      // onGameEnd
      (room, winner) => {
        console.log(`ゲーム終了: ${roomId} 勝者: ${winner?.name ?? 'なし'}`);
      }
    );
  });

  // ---- 宣言 ----
  socket.on('declare', ({ roomId, moves }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    gameManager.submitDeclaration(room, socket.id, moves);
  });

  // ---- パス ----
  socket.on('pass', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    gameManager.submitPass(room, socket.id);
  });

  // ---- ロボット移動 ----
  socket.on('moveRobot', ({ roomId, robotColor, direction }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState?.phase !== 'answering') return;

    // 現在の解答者のみ移動可能
    const current = room.gameState.answerQueue[room.gameState.answerIndex];
    if (!current || current.playerId !== socket.id) return;

    // 他のプレイヤーに移動を転送
    socket.to(roomId).emit('robotMoved', { robotColor, direction });
  });

  // ---- ゴール到達を報告 ----
  socket.on('reportGoal', ({ roomId, robotColor, usedMoves }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.gameState?.phase !== 'answering') return;

    // 現在の解答者のみ報告可能
    const current = room.gameState.answerQueue[room.gameState.answerIndex];
    if (!current || current.playerId !== socket.id) return;

    // 全員にゴール到達アニメーションを通知
    io.to(roomId).emit('goalReached', { robotColor });

    // 正解判定
    const success = usedMoves <= current.moves;
    setTimeout(() => {
      gameManager.resolveAnswer(room, socket.id, success, usedMoves);
    }, 600); // アニメーション後に判定
  });

  // ---- リタイア ----
  socket.on('retire', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    console.log(`リタイア: ${player?.name} from ${roomId}`);

    // 切断扱いで処理
    _handlePlayerLeave(socket, roomId, true);
  });

  // ---- 結果画面から部屋に戻る ----
  socket.on('returnToRoom', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // 全員が戻ったかは個別に管理しない（各自のタイミングで戻る）
    socket.join(roomId);

    // 部屋がfinishedならwaitingにリセット
    if (room.status === 'finished') {
      roomManager.resetRoom(roomId);
    }

    io.to(roomId).emit('roomUpdated', roomPublicInfo(room));
  });

  // ---- 切断処理 ----
  socket.on('disconnect', () => {
    console.log(`切断: ${socket.id}`);
    _handlePlayerLeave(socket, null, false);
  });

  // -------------------------------------------------------
  // 内部処理：プレイヤーの離脱
  // -------------------------------------------------------
  function _handlePlayerLeave(socket, targetRoomId, isRetire) {
    const result = roomManager.markDisconnected(socket.id);
    if (!result) return;

    const { room, player } = result;
    const roomId = room.id;

    // 他のプレイヤーに切断を通知
    socket.to(roomId).emit('playerDisconnected', {
      playerId:   socket.id,
      playerName: player.name,
      isRetire
    });

    // ゲーム中の切断処理
    if (room.status === 'playing') {
      gameManager.handleDisconnect(room, socket.id);
    }

    // 待機中の場合は即座に除外
    if (room.status === 'waiting' || isRetire) {
      const deleted = roomManager.leaveRoom(roomId, socket.id);
      if (deleted) {
        console.log(`部屋削除: ${roomId}`);
      } else {
        // ホスト交代が発生した場合は通知
        const updatedRoom = roomManager.getRoom(roomId);
        if (updatedRoom) {
          io.to(roomId).emit('roomUpdated', roomPublicInfo(updatedRoom));
          io.to(roomId).emit('hostChanged', { newHostId: updatedRoom.hostId });
        }
      }
      return;
    }

    // ゲーム中の切断：20秒タイマーを開始
    timerManager.startDisconnect(
      `${roomId}_${socket.id}`,
      20,
      () => {
        // 20秒経過 → 完全切断
        console.log(`完全切断: ${player.name} from ${roomId}`);
        const deleted = roomManager.removeDisconnectedPlayer(roomId, socket.id);

        if (deleted) {
          console.log(`部屋削除: ${roomId}`);
        } else {
          const updatedRoom = roomManager.getRoom(roomId);
          if (updatedRoom) {
            io.to(roomId).emit('roomUpdated', roomPublicInfo(updatedRoom));
            // ホスト交代が発生した場合は通知
            if (updatedRoom.hostId !== room.hostId) {
              io.to(roomId).emit('hostChanged', { newHostId: updatedRoom.hostId });
            }
          }
        }
      }
    );
  }
});

// -------------------------------------------------------
// サーバー起動
// -------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Brain Freeze Arena サーバー起動: http://localhost:${PORT}`);
});

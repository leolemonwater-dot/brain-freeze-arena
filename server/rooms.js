/**
 * rooms.js
 * 部屋・プレイヤー管理
 * 切断・再接続・ホスト交代ロジックを含む
 */

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
  }

  // -------------------------------------------------------
  // 部屋の作成・取得
  // -------------------------------------------------------

  /**
   * 部屋を作成する
   * @param {string} roomId
   * @param {string} hostSocketId
   * @param {string} hostName
   * @param {'quick'|'score'} mode
   * @returns {object} Room
   */
  createRoom(roomId, hostSocketId, hostName, mode) {
    const room = {
      id: roomId,
      hostId: hostSocketId,
      mode,
      status: 'waiting', // 'waiting' | 'playing' | 'finished'
      players: [
        this._createPlayer(hostSocketId, hostName, true)
      ],
      gameState: null,
      _onRoundEnd: null,
      _onGameEnd: null
    };
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * 部屋を取得する
   * @param {string} roomId
   * @returns {object|null}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * 全部屋を取得する（待機中・満員・ゲーム中すべて）
   * @returns {Array}
   */
  getAllRooms() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      hostName: room.players.find(p => p.id === room.hostId)?.name ?? '不明',
      mode: room.mode,
      playerCount: room.players.filter(p => !p.disconnected).length,
      maxPlayers: 4,
      status: room.status
    }));
  }

  // -------------------------------------------------------
  // プレイヤーの参加・退出
  // -------------------------------------------------------

  /**
   * 部屋に参加する（新規 or 再接続）
   * @param {string} roomId
   * @param {string} socketId
   * @param {string} playerName
   * @returns {{ room: object, isReconnect: boolean } | null}
   */
  joinRoom(roomId, socketId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // 再接続チェック：同じ名前のプレイヤーが切断中か
    const disconnected = room.players.find(
      p => p.name === playerName && p.disconnected
    );

    if (disconnected) {
      // 再接続：Socket IDを更新して復帰
      disconnected.id           = socketId;
      disconnected.disconnected = false;
      disconnected.disconnectedAt = null;

      // ホストだった場合はhostIdも更新
      if (room.hostId === disconnected.id || disconnected.isHost) {
        room.hostId = socketId;
      }

      return { room, isReconnect: true, player: disconnected };
    }

    // 新規参加チェック
    if (room.status !== 'waiting') return null;
    if (room.players.filter(p => !p.disconnected).length >= 4) return null;
    const player = this._createPlayer(socketId, playerName, false);
    room.players.push(player);

    return { room, isReconnect: false, player };
  }

  /**
   * 部屋から退出する
   * @param {string} roomId
   * @param {string} socketId
   * @returns {boolean} 部屋が削除されたか
   */
  leaveRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.players = room.players.filter(p => p.id !== socketId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return true;
    }

    // ホストが退出した場合は交代
    if (socketId === room.hostId) {
      this._transferHost(room);
    }

    return false;
  }

  // -------------------------------------------------------
  // 準備状態
  // -------------------------------------------------------

  /**
   * 準備状態を更新する
   * @param {string} roomId
   * @param {string} socketId
   * @param {boolean} isReady
   * @returns {object|null}
   */
  setReady(roomId, socketId, isReady) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === socketId);
    if (!player || player.isHost) return null;

    player.isReady = isReady;
    return room;
  }

  /**
   * 全員準備完了かチェック（2人以上 + 全員isReady）
   * @param {string} roomId
   * @returns {boolean}
   */
  isAllReady(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const active = room.players.filter(p => !p.disconnected);
    if (active.length < 2) return false;
    return active.every(p => p.isReady);
  }

  // -------------------------------------------------------
  // 切断・再接続
  // -------------------------------------------------------

  /**
   * プレイヤーを切断状態にする
   * @param {string} socketId
   * @returns {{ room: object, player: object } | null}
   */
  markDisconnected(socketId) {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.id === socketId);
      if (player) {
        player.disconnected    = true;
        player.disconnectedAt  = Date.now();
        return { room, player };
      }
    }
    return null;
  }

  /**
   * 切断プレイヤーを完全に除外する（20秒タイムアウト後）
   * @param {string} roomId
   * @param {string} playerId
   * @returns {boolean} 部屋が削除されたか
   */
  removeDisconnectedPlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.filter(p => !p.disconnected).length === 0) {
      this.rooms.delete(roomId);
      return true;
    }

    // ホストが完全切断した場合は交代
    if (playerId === room.hostId) {
      this._transferHost(room);
    }

    return false;
  }

  // -------------------------------------------------------
  // ゲーム終了後のリセット
  // -------------------------------------------------------

  /**
   * ゲーム終了後に部屋を待機状態に戻す
   * @param {string} roomId
   */
  resetRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status    = 'waiting';
    room.gameState = null;

    // スコアリセット・準備状態リセット
    room.players.forEach(p => {
      p.score       = 0;
      p.wins        = 0;
      p.penalized   = false;
      p.declaration = null;
      p.passed      = false;
      p.isReady     = p.isHost; // ホストは自動で準備完了
    });
  }

  // -------------------------------------------------------
  // 内部ユーティリティ
  // -------------------------------------------------------

  /**
   * プレイヤーオブジェクトを生成する
   */
  _createPlayer(socketId, name, isHost) {
    return {
      id:             socketId,
      name:           name.trim(),
      isHost,
      isReady:        isHost, // ホストは最初から準備完了
      score:          0,
      wins:           0,
      penalized:      false,
      passed:         false,
      declaration:    null,
      disconnected:   false,
      disconnectedAt: null,
      joinedAt:       Date.now()
    };
  }

  /**
   * ホストを次のプレイヤーに交代する（入室が最も早い順）
   */
  _transferHost(room) {
    const candidates = room.players
      .filter(p => !p.disconnected)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (candidates.length === 0) return;

    // 全員のisHostをリセット
    room.players.forEach(p => { p.isHost = false; p.isReady = false; });

    // 新ホストを設定
    const newHost    = candidates[0];
    newHost.isHost   = true;
    newHost.isReady  = true;
    room.hostId      = newHost.id;
  }
}

module.exports = RoomManager;

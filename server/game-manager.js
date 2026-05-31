/**
 * game-manager.js
 * サーバー側ゲーム進行管理
 * フェーズ管理・宣言・解答・得点計算・終了判定
 */

const { generateBoardData } = require('./board-logic');

const THINKING_TIME  = 60; // 思考フェーズ秒数
const ADDITIONAL_TIME = 30; // アディショナルタイム秒数
const ANSWER_TIME    = 30; // 解答フェーズ秒数（オンライン）
const QUICK_WIN      = 5;  // Quick Mode 先取本数
const SCORE_ROUNDS   = 10; // Score Mode ラウンド数

class GameManager {
  /**
   * @param {object} io - Socket.IOサーバーインスタンス
   * @param {object} timerManager - TimerManagerインスタンス
   */
  constructor(io, timerManager) {
    this.io           = io;
    this.timerManager = timerManager;
  }

  /**
   * ゲームを開始する
   * @param {object} room - Roomオブジェクト
   * @param {function} onRoundEnd - ラウンド終了コールバック (room) => void
   * @param {function} onGameEnd  - ゲーム終了コールバック (room, winner) => void
   */
  startGame(room, onRoundEnd, onGameEnd) {
    room.status = 'playing';
    room.gameState = {
      currentRound: 0,
      phase: 'waiting',
      boardData: null,
      answerQueue: [],
      answerIndex: 0,
      additionalStartSec: 0,
      startingUp: true // ページ遷移中フラグ（切断を無視する）
    };
    room._onRoundEnd = onRoundEnd;
    room._onGameEnd  = onGameEnd;

    // 30秒後にstartingUpフラグを解除
    setTimeout(() => {
      if (room.gameState) room.gameState.startingUp = false;
    }, 30000);

    this.nextRound(room);
  }

  /**
   * 次のラウンドを開始する
   * @param {object} room
   */
  nextRound(room) {
    const gs = room.gameState;

    // ペナルティをリセット（前ラウンドのペナルティは次ラウンド開始時に解除）
    room.players.forEach(p => {
      p.penalized = false;
      p.declaration = null;
      p.passed = false;
    });

    gs.currentRound++;
    gs.answerQueue  = [];
    gs.answerIndex  = 0;

    // Score Mode ラウンド上限チェック
    if (room.mode === 'score' && gs.currentRound > SCORE_ROUNDS) {
      this._endGame(room);
      return;
    }

    // 盤面生成（サーバー側）
    const boardData = generateBoardData();
    gs.boardData = boardData;

    // 全員に盤面を配信
    this.io.to(room.id).emit('boardSynced', boardData);

    // ラウンド情報を通知
    this.io.to(room.id).emit('roundStarted', {
      round: gs.currentRound,
      mode: room.mode,
      totalRounds: SCORE_ROUNDS
    });

    // 思考フェーズ開始
    this._startThinking(room);
  }

  /**
   * 思考フェーズを開始する
   * @param {object} room
   */
  _startThinking(room) {
    const gs = room.gameState;
    gs.phase = 'thinking';

    this.io.to(room.id).emit('phaseChanged', { phase: 'thinking' });

    this.timerManager.start(
      room.id, 'thinking', THINKING_TIME,
      null,
      () => {
        // 60秒誰も宣言しなかった → ラウンドスキップ
        const hasDeclared = room.players.some(p => p.declaration !== null);
        if (!hasDeclared) {
          this.io.to(room.id).emit('roundSkipped', { reason: '宣言なし' });
          setTimeout(() => this.nextRound(room), 3000);
        }
      }
    );
  }

  /**
   * 宣言を受け付ける
   * @param {object} room
   * @param {string} playerId
   * @param {number} moves
   * @returns {boolean} 成功したか
   */
  submitDeclaration(room, playerId, moves) {
    const gs = room.gameState;
    if (gs.phase !== 'thinking' && gs.phase !== 'additional') return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.penalized || player.declaration !== null) return false;

    player.declaration = { playerId, moves, timestamp: Date.now() };

    // 全員に宣言を通知
    this.io.to(room.id).emit('playerDeclared', {
      playerId,
      playerName: player.name,
      moves
    });

    // 最初の宣言 → アディショナルタイム開始
    if (gs.phase === 'thinking') {
      gs.additionalStartSec = this.timerManager.getRemaining(room.id);
      this.timerManager.stop(room.id);
      this._startAdditional(room);
    } else {
      // アディショナル中：全員宣言/パス済みなら即解答フェーズへ
      this._checkAllResponded(room);
    }

    return true;
  }

  /**
   * パスを受け付ける
   * @param {object} room
   * @param {string} playerId
   * @returns {boolean} 成功したか
   */
  submitPass(room, playerId) {
    const gs = room.gameState;
    if (gs.phase !== 'thinking' && gs.phase !== 'additional') return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.penalized || player.declaration !== null || player.passed) return false;

    player.passed = true;

    this.io.to(room.id).emit('playerPassed', {
      playerId,
      playerName: player.name
    });

    if (gs.phase === 'additional') {
      this._checkAllResponded(room);
    }

    return true;
  }

  /**
   * アディショナルタイムを開始する
   * @param {object} room
   */
  _startAdditional(room) {
    const gs = room.gameState;
    gs.phase = 'additional';

    this.io.to(room.id).emit('phaseChanged', { phase: 'additional' });

    this.timerManager.start(
      room.id, 'additional', ADDITIONAL_TIME,
      null,
      () => {
        // アディショナルタイム終了 → 解答フェーズへ
        this._startAnswering(room);
      }
    );
  }

  /**
   * 全員が宣言/パス済みかチェックして解答フェーズへ移行
   * @param {object} room
   */
  _checkAllResponded(room) {
    const activePlayers = room.players.filter(p => !p.penalized && !p.disconnected);
    const allResponded  = activePlayers.every(p => p.declaration !== null || p.passed);
    if (allResponded) {
      this.timerManager.stop(room.id);
      this._startAnswering(room);
    }
  }

  /**
   * 解答フェーズを開始する
   * @param {object} room
   */
  _startAnswering(room) {
    const gs = room.gameState;
    this.timerManager.stop(room.id);

    // 解答キューを作成（手数昇順 → 宣言時刻昇順）
    gs.answerQueue = room.players
      .filter(p => p.declaration !== null)
      .map(p => p.declaration)
      .sort((a, b) => a.moves !== b.moves ? a.moves - b.moves : a.timestamp - b.timestamp);

    gs.answerIndex = 0;
    gs.phase = 'answering';

    if (gs.answerQueue.length === 0) {
      // 宣言者なし → ラウンド終了
      this._finishRound(room, null, 0);
      return;
    }

    this._nextAnswerer(room);
  }

  /**
   * 次の解答者に移行する
   * @param {object} room
   */
  _nextAnswerer(room) {
    const gs = room.gameState;
    const current = gs.answerQueue[gs.answerIndex];

    if (!current) {
      // 全員不正解
      this._finishRound(room, null, 0);
      return;
    }

    const player = room.players.find(p => p.id === current.playerId);

    // 解答者を全員に通知
    this.io.to(room.id).emit('phaseChanged', {
      phase: 'answering',
      answererId: current.playerId,
      answererName: player?.name ?? '?',
      declaredMoves: current.moves
    });

    // ロボットをリセット
    this.io.to(room.id).emit('resetRobots');

    // 解答タイムリミット（30秒）
    this.timerManager.start(
      room.id, 'answering', ANSWER_TIME,
      null,
      () => {
        // タイムアウト → 不正解扱い
        this.resolveAnswer(room, current.playerId, false, ANSWER_TIME + 1);
      }
    );
  }

  /**
   * 解答結果を処理する
   * @param {object} room
   * @param {string} playerId
   * @param {boolean} success
   * @param {number} usedMoves
   */
  resolveAnswer(room, playerId, success, usedMoves) {
    const gs = room.gameState;
    if (gs.phase !== 'answering') return;

    const current = gs.answerQueue[gs.answerIndex];
    if (!current || current.playerId !== playerId) return;

    this.timerManager.stop(room.id);

    if (success && usedMoves <= current.moves) {
      // 正解
      const points = gs.additionalStartSec * current.moves;
      this.io.to(room.id).emit('answerResult', {
        playerId,
        success: true,
        usedMoves,
        points
      });
      this._finishRound(room, playerId, points);
    } else {
      // 不正解
      const player = room.players.find(p => p.id === playerId);
      if (player) player.penalized = true;

      this.io.to(room.id).emit('answerResult', {
        playerId,
        success: false,
        usedMoves
      });

      gs.answerIndex++;

      // 残り1人チェック
      const activePlayers = room.players.filter(p => !p.disconnected);
      if (activePlayers.length <= 1) {
        const winner = activePlayers[0] ?? null;
        this._endGame(room, winner);
        return;
      }

      // 次の解答者へ
      setTimeout(() => this._nextAnswerer(room), 1500);
    }
  }

  /**
   * ラウンドを終了する
   * @param {object} room
   * @param {string|null} winnerId
   * @param {number} points
   */
  _finishRound(room, winnerId, points) {
    const gs = room.gameState;
    gs.phase = 'round_ended';
    this.timerManager.stop(room.id);

    // スコア更新
    if (winnerId) {
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) {
        if (room.mode === 'quick') {
          winner.wins++;
        } else {
          winner.score += points;
        }
      }
    }

    // ラウンド終了を通知
    this.io.to(room.id).emit('roundEnded', {
      winnerId,
      points,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        wins: p.wins,
        score: p.score
      }))
    });

    // Quick Mode 勝利チェック
    if (room.mode === 'quick') {
      const champion = room.players.find(p => p.wins >= QUICK_WIN);
      if (champion) {
        setTimeout(() => this._endGame(room, champion), 3000);
        return;
      }
    }

    // 残り1人チェック
    const activePlayers = room.players.filter(p => !p.disconnected);
    if (activePlayers.length <= 1) {
      setTimeout(() => this._endGame(room, activePlayers[0] ?? null), 3000);
      return;
    }

    // 次のラウンドへ
    setTimeout(() => this.nextRound(room), 3000);
  }

  /**
   * ゲームを終了する
   * @param {object} room
   * @param {object|null} winner - 勝者プレイヤーオブジェクト（省略時は自動判定）
   */
  _endGame(room, winner = null) {
    this.timerManager.stop(room.id);
    room.status = 'finished';

    // 勝者が指定されていない場合は自動判定
    if (!winner) {
      const activePlayers = room.players.filter(p => !p.disconnected);
      if (room.mode === 'quick') {
        winner = activePlayers.reduce((best, p) => p.wins > (best?.wins ?? -1) ? p : best, null);
      } else {
        winner = activePlayers.reduce((best, p) => p.score > (best?.score ?? -1) ? p : best, null);
      }
    }

    this.io.to(room.id).emit('gameEnded', {
      winner: winner ? { id: winner.id, name: winner.name } : null,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        wins: p.wins,
        score: p.score
      }))
    });

    if (room._onGameEnd) room._onGameEnd(room, winner);
  }

  /**
   * プレイヤーが切断した時の処理
   * @param {object} room
   * @param {string} playerId
   */
  handleDisconnect(room, playerId) {
    const gs = room.gameState;
    if (!gs) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    // ゲーム開始直後のページ遷移中は残り1人チェックをスキップ
    if (gs.startingUp) {
      console.log(`startingUp中の切断を無視: ${player.name}`);
      return;
    }

    // アディショナルタイム中：パス扱い
    if (gs.phase === 'thinking' || gs.phase === 'additional') {
      if (!player.declaration && !player.passed) {
        player.passed = true;
        this.io.to(room.id).emit('playerPassed', {
          playerId,
          playerName: player.name,
          reason: 'disconnect'
        });
        if (gs.phase === 'additional') {
          this._checkAllResponded(room);
        }
      }
    }

    // 解答フェーズ中：解答者が切断したら不正解扱い
    if (gs.phase === 'answering') {
      const current = gs.answerQueue[gs.answerIndex];
      if (current && current.playerId === playerId) {
        this.resolveAnswer(room, playerId, false, Infinity);
      }
    }

    // 残り1人チェック
    const activePlayers = room.players.filter(p => !p.disconnected);
    if (activePlayers.length <= 1 && gs.phase !== 'ended') {
      setTimeout(() => this._endGame(room, activePlayers[0] ?? null), 1000);
    }
  }
}

module.exports = GameManager;

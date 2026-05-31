/**
 * timer-manager.js
 * サーバー側タイマー管理
 * すべてのタイマーをサーバーで一元管理する
 */

class TimerManager {
  constructor(io) {
    this.io = io;
    this.timers = new Map(); // roomId -> { interval, remaining, phase }
  }

  /**
   * タイマーを開始する
   * @param {string} roomId
   * @param {string} phase - 'thinking' | 'additional' | 'answering' | 'disconnect'
   * @param {number} seconds - タイマーの秒数
   * @param {function} onTick - 毎秒呼ばれるコールバック (remaining) => void
   * @param {function} onEnd - タイマー終了時のコールバック
   */
  start(roomId, phase, seconds, onTick, onEnd) {
    // 既存のタイマーを停止
    this.stop(roomId);

    let remaining = seconds;

    // 開始時に即座に通知
    this.io.to(roomId).emit('timerTick', { phase, remaining });
    if (onTick) onTick(remaining);

    const interval = setInterval(() => {
      remaining--;

      // Mapのオブジェクトも更新する
      const timerObj = this.timers.get(roomId);
      if (timerObj) timerObj.remaining = remaining;

      // クライアントに通知
      this.io.to(roomId).emit('timerTick', { phase, remaining });
      if (onTick) onTick(remaining);

      if (remaining <= 0) {
        this.stop(roomId);
        if (onEnd) onEnd();
      }
    }, 1000);

    this.timers.set(roomId, { interval, remaining, phase });
  }

  /**
   * タイマーを停止する
   * @param {string} roomId
   */
  stop(roomId) {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(roomId);
    }
  }

  /**
   * 残り秒数を取得する
   * @param {string} roomId
   * @returns {number}
   */
  getRemaining(roomId) {
    const timer = this.timers.get(roomId);
    return timer ? timer.remaining : 0;
  }

  /**
   * 部屋のタイマーが動いているか確認する
   * @param {string} roomId
   * @returns {boolean}
   */
  isRunning(roomId) {
    return this.timers.has(roomId);
  }

  /**
   * 切断タイマーを開始する（プレイヤーごとに管理）
   * @param {string} key - `${roomId}_${playerId}` 形式
   * @param {number} seconds
   * @param {function} onEnd
   */
  startDisconnect(key, seconds, onEnd) {
    // 既存の切断タイマーを停止
    this.stopDisconnect(key);

    const interval = setInterval(() => {
      this.timers.delete(key);
      if (onEnd) onEnd();
    }, seconds * 1000);

    this.timers.set(key, { interval, remaining: seconds, phase: 'disconnect' });
  }

  /**
   * 切断タイマーを停止する（再接続時）
   * @param {string} key
   */
  stopDisconnect(key) {
    const timer = this.timers.get(key);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(key);
    }
  }

  /**
   * すべてのタイマーを停止する（サーバー終了時）
   */
  stopAll() {
    this.timers.forEach(timer => clearInterval(timer.interval));
    this.timers.clear();
  }
}

module.exports = TimerManager;

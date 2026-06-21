/**
 * timer.js
 * タイマー管理（思考時間・30秒アディショナルタイム）
 *
 * ラウンドのタイマーフロー:
 *   1. startThinkingTimer() — 思考時間開始（無制限 or 設定秒数）
 *   2. 最初の宣言が来たら startAdditionalTimer() — 30秒アディショナル開始
 *   3. アディショナル終了 → onAdditionalEnd コールバックで解答フェーズへ
 */

const ADDITIONAL_TIME_SEC = 30; // アディショナルタイムの秒数
const THINKING_TIME_SEC   = 60; // 思考時間の秒数

/** @type {number|null} タイマーのintervalID */
let _timerId = null;

/** @type {'idle'|'thinking'|'additional'} */
let timerState = 'idle';

/** アディショナルタイム開始時の残り秒数（得点計算に使用） */
let additionalStartRemaining = ADDITIONAL_TIME_SEC;

/** 現在の残り秒数 */
let remainingSeconds = 0;

/** コールバック群 */
let _onTick        = null; // (remaining: number, state: string) => void
let _onAdditionalEnd = null; // () => void

/**
 * タイマーを停止する
 */
function stopTimer() {
  if (_timerId !== null) {
    clearInterval(_timerId);
    _timerId = null;
  }
  timerState = 'idle';
}

/**
 * 思考時間タイマーを開始する
 * @param {function} onTick          - 毎秒呼ばれるコールバック (remaining, state) => void
 * @param {number}   thinkingSec     - 思考時間（秒）。0以下なら無制限（宣言待ち）
 */
function startThinkingTimer(onTick, thinkingSec = 0) {
  stopTimer();
  _onTick    = onTick;
  timerState = 'thinking';
  remainingSeconds = thinkingSec > 0 ? thinkingSec : Infinity;

  if (thinkingSec <= 0) {
    // 無制限：tickだけ打ち続ける（経過時間表示用）
    let elapsed = 0;
    _timerId = setInterval(() => {
      elapsed++;
      if (_onTick) _onTick(elapsed, timerState);
    }, 1000);
  } else {
    _timerId = setInterval(() => {
      remainingSeconds--;
      if (_onTick) _onTick(remainingSeconds, timerState);
      if (remainingSeconds <= 0) stopTimer();
    }, 1000);
  }
}

/**
 * アディショナルタイマーを開始する（最初の宣言時に呼ぶ）
 * @param {function} onTick         - 毎秒コールバック (remaining, state) => void
 * @param {function} onAdditionalEnd - タイムアップ時コールバック
 */
function startAdditionalTimer(onTick, onAdditionalEnd) {
  stopTimer();
  _onTick          = onTick;
  _onAdditionalEnd = onAdditionalEnd;
  timerState       = 'additional';
  remainingSeconds = ADDITIONAL_TIME_SEC;
  additionalStartRemaining = ADDITIONAL_TIME_SEC;

  _timerId = setInterval(() => {
    remainingSeconds--;
    if (_onTick) _onTick(remainingSeconds, timerState);
    if (remainingSeconds <= 0) {
      stopTimer();
      if (_onAdditionalEnd) _onAdditionalEnd();
    }
  }, 1000);
}

/**
 * アディショナルタイム開始時の残り秒数を返す（得点計算用）
 * @returns {number}
 */
function getAdditionalStartRemaining() {
  return additionalStartRemaining;
}

/**
 * 現在の残り秒数を返す
 * @returns {number}
 */
function getRemainingSeconds() {
  return remainingSeconds;
}

/**
 * 現在のタイマー状態を返す
 * @returns {'idle'|'thinking'|'additional'}
 */
function getTimerState() {
  return timerState;
}

// ESモジュール用エクスポート
export {
  ADDITIONAL_TIME_SEC, THINKING_TIME_SEC,
  stopTimer, startThinkingTimer, startAdditionalTimer,
  getAdditionalStartRemaining, getRemainingSeconds, getTimerState
};

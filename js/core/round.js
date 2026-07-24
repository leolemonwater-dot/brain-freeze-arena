/**
 * round.js
 * ラウンド管理（宣言受付・解答フェーズ・正誤判定・得点計算）
 */

import { declareMove, passPlayer, getSortedDeclarations, getPlayers, penalizePlayer, resetDeclarations } from './players.js';
import { startThinkingTimer, startAdditionalTimer, stopTimer, getRemainingSeconds, THINKING_TIME_SEC } from './timer.js';

/**
 * @typedef {'thinking'|'additional'|'answering'|'ended'} RoundPhase
 */

/** @type {RoundPhase} */
let roundPhase = 'ended';

/** 現在の解答キュー（宣言順にソート済み） @type {import('./players.js').Declaration[]} */
let answerQueue = [];

/** 現在解答中のインデックス */
let answerIndex = 0;

/** アディショナルタイム開始時の残り秒数（Score Mode 得点計算用） */
let additionalStartSec = 0;

/** コールバック */
let _onPhaseChange = null; // (phase: RoundPhase) => void
let _onRoundEnd    = null; // (result: RoundResult) => void

/**
 * @typedef {Object} RoundResult
 * @property {string|null} winnerId  - 正解したプレイヤーID（全員不正解ならnull）
 * @property {number}      points    - 獲得得点（Score Mode）
 */

/**
 * ラウンドを開始する
 * @param {function} onPhaseChange - フェーズ変化コールバック
 * @param {function} onRoundEnd    - ラウンド終了コールバック
 */
function startRound(onPhaseChange, onRoundEnd) {
  _onPhaseChange = onPhaseChange;
  _onRoundEnd    = onRoundEnd;
  answerQueue    = [];
  answerIndex    = 0;

  resetDeclarations(); // players.js

  // 思考タイマー開始（60秒制限）
  startThinkingTimer((remaining, state) => {
    if (_onPhaseChange) _onPhaseChange('thinking_tick', remaining);
    // 思考時間切れ → 宣言なしでラウンド終了
    if (remaining <= 0) {
      _finishRound(null, 0);
    }
  }, THINKING_TIME_SEC);

  _setPhase('thinking');
}

/**
 * プレイヤーが手数を宣言する
 * @param {string} playerId
 * @param {number} moves
 * @returns {boolean} 宣言成功かどうか
 */
function submitDeclaration(playerId, moves) {
  if (roundPhase !== 'thinking' && roundPhase !== 'additional') return false;

  const decl = declareMove(playerId, moves); // players.js
  if (!decl) return false; // ペナルティ中など

  // 最初の宣言 → アディショナルタイム開始
  if (roundPhase === 'thinking') {
    // 最初の宣言時点の残り時間を記録（Score Mode 得点計算用）
    additionalStartSec = getRemainingSeconds(); // timer.js
    _setPhase('additional');
    startAdditionalTimer(
      (remaining) => {
        if (_onPhaseChange) _onPhaseChange('additional_tick', remaining);
      },
      () => {
        // アディショナルタイム終了 → 解答フェーズへ
        startAnswerPhase();
      }
    );
  }

  // アディショナルタイム中に全員宣言済みまたはパス済みになったら即解答フェーズへ
  const allResponded = getPlayers()
    .filter(p => !p.penalized)
    .every(p => p.declaration !== null || p.passed);
  if (roundPhase === 'additional' && allResponded) {
    startAnswerPhase();
  }

  return true;
}

/**
 * プレイヤーがパスする（思考/アディショナルタイム中のみ）
 * @param {string} playerId
 * @returns {boolean} パス成功かどうか
 */
function submitPass(playerId) {
  if (roundPhase !== 'thinking' && roundPhase !== 'additional') return false;
  
  const success = passPlayer(playerId); // players.js
  if (!success) return false;
  
  // 思考フェーズ中にパスした場合、アディショナルタイムは開始しない
  // アディショナルタイム中にパスした場合、全員対応済みかチェック
  if (roundPhase === 'additional') {
    const allResponded = getPlayers()
      .filter(p => !p.penalized)
      .every(p => p.declaration !== null || p.passed);
    if (allResponded) {
      startAnswerPhase();
    }
  }
  
  return true;
}

/**
 * 解答フェーズを開始する
 */
function startAnswerPhase() {
  stopTimer(); // timer.js
  answerQueue = getSortedDeclarations(); // players.js
  answerIndex = 0;
  _setPhase('answering');

  if (answerQueue.length === 0) {
    // 宣言者なし → ラウンド終了
    _finishRound(null, 0);
  }
}

/**
 * 現在の解答者情報を返す
 * @returns {import('./players.js').Declaration|null}
 */
function getCurrentAnswerer() {
  if (roundPhase !== 'answering') return null;
  return answerQueue[answerIndex] ?? null;
}

/**
 * 解答結果を処理する
 * @param {boolean} success   - 宣言手数以内でゴールできたか
 * @param {number}  usedMoves - 実際に使った手数
 */
function resolveAnswer(success, usedMoves) {
  if (roundPhase !== 'answering') return;

  const current = answerQueue[answerIndex];
  if (!current) return;

  if (success && usedMoves <= current.moves) {
    // 正解
    const points = additionalStartSec * current.moves; // Score Mode 得点
    _finishRound(current.playerId, points);
  } else {
    // 不正解
    penalizePlayer(current.playerId); // players.js
    answerIndex++;

    if (answerIndex >= answerQueue.length) {
      // 全員不正解
      _finishRound(null, 0);
    } else {
      // 次の解答者へ移行
      if (_onPhaseChange) _onPhaseChange('answering');
    }
  }
}

/**
 * ラウンドを終了する（内部）
 * @param {string|null} winnerId
 * @param {number}      points
 */
function _finishRound(winnerId, points) {
  stopTimer();
  _setPhase('ended');
  if (_onRoundEnd) _onRoundEnd({ winnerId, points });
}

/**
 * フェーズを変更してコールバックを呼ぶ
 * @param {string} phase
 */
function _setPhase(phase) {
  roundPhase = phase;
  if (_onPhaseChange) _onPhaseChange(phase);
}

/**
 * 現在のラウンドフェーズを返す
 * @returns {RoundPhase}
 */
function getRoundPhase() {
  return roundPhase;
}

/**
 * オンラインモード用：サーバーからのフェーズを直接設定する
 * @param {string} phase
 */
function setRoundPhaseOnline(phase) {
  roundPhase = phase;
}

/**
 * オンラインモード用：解答者情報を直接設定する
 * @param {string} playerId
 * @param {number} moves
 */
function _setOnlineAnswerer(playerId, moves) {
  answerQueue = [{ playerId, moves, timestamp: Date.now() }];
  answerIndex = 0;
}

// ESモジュール用エクスポート
export {
  startRound, submitDeclaration, submitPass, startAnswerPhase,
  getCurrentAnswerer, resolveAnswer, getRoundPhase,
  setRoundPhaseOnline, _setOnlineAnswerer
};

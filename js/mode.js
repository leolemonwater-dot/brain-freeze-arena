/**
 * mode.js
 * ゲームモード管理（Quick Mode / Score Mode）
 * ラウンドの進行・勝敗判定を担う
 */

/**
 * @typedef {'quick'|'score'} GameMode
 * @typedef {'setup'|'playing'|'finished'} GameState
 */

const QUICK_WIN_COUNT  = 5;  // Quick Mode: 先取本数
const SCORE_ROUNDS     = 10; // Score Mode: 総ラウンド数

/** @type {GameMode} */
let gameMode = 'quick';

/** @type {GameState} */
let gameState = 'setup';

/** 現在のラウンド番号（1始まり） */
let currentRound = 0;

/** コールバック */
let _onGameEnd = null; // (winner: Player) => void

/**
 * ゲームをセットアップする
 * @param {GameMode}  mode
 * @param {string[]}  playerNames - プレイヤー名の配列
 * @param {function}  onGameEnd   - ゲーム終了コールバック (winner: Player) => void
 */
function setupGame(mode, playerNames, onGameEnd) {
  gameMode     = mode;
  gameState    = 'setup';
  currentRound = 0;
  _onGameEnd   = onGameEnd;

  resetAllPlayers(); // players.js
  playerNames.forEach(name => addPlayer(name));
}

/**
 * 次のラウンドを開始する
 * @param {function} onPhaseChange - round.js に渡すフェーズ変化コールバック
 */
function nextRound(onPhaseChange) {
  if (gameState === 'finished') return;

  currentRound++;
  gameState = 'playing';

  // 前ラウンドのペナルティをリセット（次ラウンド開始時に解除）
  resetPenalties(); // players.js

  // Score Mode: ラウンド上限チェック
  if (gameMode === 'score' && currentRound > SCORE_ROUNDS) {
    _endGame();
    return;
  }

  // 新しい盤面を生成
  generateBoard(); // game.js

  // ラウンド開始
  startRound(
    onPhaseChange,
    (result) => _handleRoundEnd(result, onPhaseChange)
  );
}

/**
 * ラウンド終了時の処理
 * @param {{winnerId:string|null, points:number}} result
 * @param {function} onPhaseChange
 */
function _handleRoundEnd(result, onPhaseChange) {
  const { winnerId, points } = result;

  if (winnerId) {
    if (gameMode === 'quick') {
      addWin(winnerId); // players.js
      // 5本先取チェック
      const winner = getQuickModeWinner();
      if (winner) { _endGame(); return; }
    } else {
      // Score Mode: round.js で計算済みの points をそのまま加算する
      const player = getPlayerById(winnerId);
      if (player) player.score += points;
    }
  }

  // ペナルティは次ラウンド開始時まで維持（resetPenalties は nextRound 冒頭で呼ばない）
  // → 次ラウンド開始前に resetDeclarations() のみ呼ぶ（round.js の startRound 内で実施済み）

  // Score Mode: 10ラウンド終了チェック
  if (gameMode === 'score' && currentRound >= SCORE_ROUNDS) {
    _endGame();
    return;
  }

  // 次のラウンドへ（UIが確認後に nextRound() を呼ぶ）
  if (onPhaseChange) onPhaseChange('round_ended', result);
}

/**
 * ゲームを終了する
 */
function _endGame() {
  gameState = 'finished';
  stopTimer(); // timer.js

  const winner = gameMode === 'quick'
    ? getQuickModeWinner()
    : getScoreModeWinner();

  if (_onGameEnd) _onGameEnd(winner);
}

/**
 * 現在のゲームモードを返す
 * @returns {GameMode}
 */
function getGameMode() {
  return gameMode;
}

/**
 * 現在のゲーム状態を返す
 * @returns {GameState}
 */
function getGameState() {
  return gameState;
}

/**
 * 現在のラウンド番号を返す
 * @returns {number}
 */
function getCurrentRound() {
  return currentRound;
}

/**
 * オンライン再接続時にゲームモードとラウンドを設定する
 * （プレイヤーはすでに追加済みの前提）
 * @param {'quick'|'score'} mode
 * @param {number} round
 */
function _setOnlineGameMode(mode, round) {
  gameMode     = mode;
  gameState    = 'playing';
  currentRound = round;
  _onGameEnd   = null; // オンラインはサーバーが管理
}

// ESモジュール用エクスポート
export {
  QUICK_WIN_COUNT, SCORE_ROUNDS,
  setupGame, nextRound,
  getGameMode, getGameState, getCurrentRound,
  _setOnlineGameMode
};

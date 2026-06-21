/**
 * players.js
 * プレイヤー管理（登録・スコア・宣言・ペナルティ）
 */

/**
 * @typedef {Object} Player
 * @property {string} id          - ユニークID
 * @property {string} name        - プレイヤー名
 * @property {number} score       - Score Mode の累計得点
 * @property {number} wins        - Quick Mode の獲得本数
 * @property {boolean} penalized  - 次ラウンド宣言不可フラグ
 * @property {boolean} passed     - 現在ラウンドでパスしたかどうか
 * @property {Declaration|null} declaration - 現在ラウンドの宣言
 */

/**
 * @typedef {Object} Declaration
 * @property {string} playerId  - 宣言したプレイヤーID
 * @property {number} moves     - 宣言手数
 * @property {number} timestamp - 宣言時刻（Date.now()）
 */

/** @type {Player[]} */
let players = [];

/**
 * プレイヤーを登録する
 * @param {string} name
 * @returns {Player}
 */
function addPlayer(name) {
  const player = {
    id:          crypto.randomUUID(),
    name:        name.trim(),
    score:       0,
    wins:        0,
    penalized:   false,
    passed:      false,
    declaration: null,
  };
  players.push(player);
  return player;
}

/**
 * 全プレイヤーを取得する
 * @returns {Player[]}
 */
function getPlayers() {
  return players;
}

/**
 * IDでプレイヤーを取得する
 * @param {string} id
 * @returns {Player|undefined}
 */
function getPlayerById(id) {
  return players.find(p => p.id === id);
}

/**
 * ラウンド開始時に宣言とパスフラグをリセットする（ペナルティは維持）
 */
function resetDeclarations() {
  players.forEach(p => { 
    p.declaration = null;
    p.passed = false;
  });
}

/**
 * ラウンド終了後にペナルティをリセットする
 * （次ラウンド開始前に呼ぶ）
 */
function resetPenalties() {
  players.forEach(p => { p.penalized = false; });
}

/**
 * プレイヤーの宣言を登録する
 * @param {string} playerId
 * @param {number} moves - 宣言手数
 * @returns {Declaration|null} 宣言不可の場合はnull
 */
function declareMove(playerId, moves) {
  const player = getPlayerById(playerId);
  if (!player) return null;
  if (player.penalized) return null;    // ペナルティ中は宣言不可
  if (player.declaration !== null) return null; // 既に宣言済みは上書き不可

  const declaration = {
    playerId,
    moves,
    timestamp: Date.now(),
  };
  player.declaration = declaration;
  return declaration;
}

/**
 * 現在ラウンドの宣言一覧を解答順（手数昇順 → 宣言時刻昇順）で返す
 * @returns {Declaration[]}
 */
function getSortedDeclarations() {
  return players
    .filter(p => p.declaration !== null)
    .map(p => p.declaration)
    .sort((a, b) => {
      if (a.moves !== b.moves) return a.moves - b.moves;
      return a.timestamp - b.timestamp;
    });
}

/**
 * プレイヤーをパス状態にする
 * @param {string} playerId
 * @returns {boolean} 成功したかどうか
 */
function passPlayer(playerId) {
  const player = getPlayerById(playerId);
  if (!player) return false;
  if (player.penalized) return false;    // ペナルティ中はパス不可
  if (player.declaration !== null) return false; // 既に宣言済みはパス不可
  if (player.passed) return false; // 既にパス済み
  
  player.passed = true;
  return true;
}

/**
 * Quick Mode: 正解プレイヤーに1本加算する
 * @param {string} playerId
 */
function addWin(playerId) {
  const player = getPlayerById(playerId);
  if (player) player.wins++;
}

/**
 * Score Mode: 正解プレイヤーに得点を加算する
 * 得点 = 残り時間(秒) × 宣言手数
 * @param {string} playerId
 * @param {number} remainingSeconds - 最初の宣言時点の残り時間
 * @param {number} declaredMoves    - 正解者の宣言手数
 */
function addScore(playerId, remainingSeconds, declaredMoves) {
  const player = getPlayerById(playerId);
  if (player) player.score += remainingSeconds * declaredMoves;
}

/**
 * 不正解プレイヤーにペナルティを付与する（次ラウンド宣言不可）
 * @param {string} playerId
 */
function penalizePlayer(playerId) {
  const player = getPlayerById(playerId);
  if (player) player.penalized = true;
}

/**
 * Quick Mode の勝者を返す（5本先取）
 * @returns {Player|null}
 */
function getQuickModeWinner() {
  return players.find(p => p.wins >= 5) ?? null;
}

/**
 * Score Mode の最終勝者を返す（最高得点）
 * @returns {Player|null}
 */
function getScoreModeWinner() {
  if (players.length === 0) return null;
  return players.reduce((best, p) => p.score > best.score ? p : best);
}

/**
 * 全プレイヤーをリセットする（新しいゲーム開始時）
 */
function resetAllPlayers() {
  players = [];
}

// ESモジュール用エクスポート
export {
  addPlayer, getPlayers, getPlayerById,
  resetDeclarations, resetPenalties, resetAllPlayers,
  declareMove, getSortedDeclarations, passPlayer,
  addWin, addScore, penalizePlayer,
  getQuickModeWinner, getScoreModeWinner
};

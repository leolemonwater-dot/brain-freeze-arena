/**
 * online.js
 * オンライン対戦のクライアント側同期ロジック
 * Socket.IOの接続を管理し、ゲーム画面に反映する
 */

let onlineSocket     = null; // 全体で共有するSocket（lobby-client.jsとも共有）
let onlineRoomId     = null;
let onlinePlayerName = null;
let onlineIsHost     = false;
let onlineModeActive = false;
let myPlayerId       = null;

/**
 * オンラインモードを初期化する（game.jsから呼ばれる）
 * lobby-client.jsのgameStartedイベントで既に初期化済みのため、
 * ここでは何もしない（互換性のために残す）
 * @returns {boolean}
 */
function initOnlineMode() {
  // lobby-client.jsのgameStartedハンドラで初期化済み
  return onlineModeActive;
}

/**
 * オンラインモードかどうかを返す
 */
function isOnlineMode() {
  return onlineModeActive;
}

/**
 * 自分が解答者かどうかを返す
 */
function isMyTurn() {
  if (!onlineModeActive) return false;
  const phase = getRoundPhase();
  if (phase !== 'answering') return false;
  const answerer = getCurrentAnswerer();
  return answerer?.playerId === myPlayerId;
}

// -------------------------------------------------------
// サーバーへの送信
// -------------------------------------------------------

/** 宣言を送信する */
function sendDeclareOnline(moves) {
  if (!onlineSocket || !onlineModeActive) return;
  onlineSocket.emit('declare', { roomId: onlineRoomId, moves });
}

/** パスを送信する */
function sendPassOnline() {
  if (!onlineSocket || !onlineModeActive) return;
  onlineSocket.emit('pass', { roomId: onlineRoomId });
}

/** ロボット移動を送信する */
function sendMoveOnline(robotColor, dx, dy) {
  if (!onlineSocket || !onlineModeActive) return;
  const direction = _vectorToDirection(dx, dy);
  if (!direction) return;
  onlineSocket.emit('moveRobot', { roomId: onlineRoomId, robotColor, direction });
}

/** ゴール到達を報告する */
function sendGoalReachedOnline(robotColor, usedMoves) {
  if (!onlineSocket || !onlineModeActive) return;
  onlineSocket.emit('reportGoal', { roomId: onlineRoomId, robotColor, usedMoves });
}

/** リタイアを送信する */
function sendRetireOnline() {
  if (!onlineSocket || !onlineModeActive) return;
  onlineSocket.emit('retire', { roomId: onlineRoomId });
  onlineModeActive = false;
}

/** 部屋に戻る */
function returnToRoomOnline() {
  if (!onlineSocket) return;
  onlineSocket.emit('returnToRoom', { roomId: onlineRoomId });
  onlineModeActive = false;
  showScreen('room-screen');
}

// -------------------------------------------------------
// サーバーからのイベント受信
// -------------------------------------------------------

function _setupListeners() {
  // 盤面データを受信（毎ラウンド）
  onlineSocket.on('boardSynced', (boardData) => {
    // 新ラウンド開始：宣言状態・フェーズをリセット
    setRoundPhaseOnline('thinking');
    resetDeclarations();
    moves = 0;
    // 宣言手数表示を3にリセット
    const display = document.getElementById('declare-moves-display');
    if (display) display.textContent = '3';
    _applyBoardData(boardData);
  });

  // ラウンド開始
  onlineSocket.on('roundStarted', ({ round, mode, totalRounds }) => {
    // ラウンド情報をローカルに反映
    if (typeof _setOnlineGameMode === 'function') {
      _setOnlineGameMode(mode, round);
    }
    updateRoundInfo();
  });

  // フェーズ変更
  onlineSocket.on('phaseChanged', ({ phase, answererId, answererName, declaredMoves }) => {
    if (phase === 'thinking') {
      // ラウンド開始時に宣言状態をリセット
      setRoundPhaseOnline('thinking');
      resetDeclarations(); // players.js
      onPhaseChange('thinking', null);
    } else if (phase === 'additional') {
      setRoundPhaseOnline('additional');
      onPhaseChange('additional', null);
    } else if (phase === 'answering') {
      // 解答者情報をround.jsに設定
      setRoundPhaseOnline('answering');
      _setOnlineAnswerer(answererId, declaredMoves);
      selectedPlayerId = answererId;
      onPhaseChange('answering', null);

      // 自分が解答者なら「あなたの番です」を表示
      if (answererId === myPlayerId) {
        setStatus('🎯 あなたの番です！');
      } else {
        setStatus(`${answererName} が解答中`);
      }
    }
  });

  // タイマー更新
  onlineSocket.on('timerTick', ({ phase, remaining }) => {
    if (phase === 'thinking') {
      onPhaseChange('thinking_tick', remaining);
    } else if (phase === 'additional') {
      onPhaseChange('additional_tick', remaining);
    } else if (phase === 'answering') {
      onPhaseChange('answering_tick', remaining);
    }
  });

  // 宣言を受信
  onlineSocket.on('playerDeclared', ({ playerId, playerName, moves }) => {
    // ローカルのプレイヤーデータに宣言を反映
    const player = getPlayerById(playerId);
    if (player) {
      player.declaration = { playerId, moves, timestamp: Date.now() };
    }
    updateScoreboard();
  });

  // パスを受信
  onlineSocket.on('playerPassed', ({ playerId }) => {
    const player = getPlayerById(playerId);
    if (player) player.passed = true;
    updateScoreboard();
  });

  // ロボット移動を受信（解答者以外）
  onlineSocket.on('robotMoved', ({ robotColor, direction }) => {
    const robot = robots.find(r => r.dataset.color === robotColor);
    if (!robot) return;
    const [dx, dy] = _directionToVector(direction);
    // 自分が解答者でない場合のみ反映（解答者は自分で動かしている）
    if (!isMyTurn()) {
      selectedRobot = robot;
      _applyRobotMove(dx, dy);
    }
  });

  // ゴール到達アニメーション（全員）
  onlineSocket.on('goalReached', ({ robotColor }) => {
    // 解答者（自分）は game.js で既にアニメーション済みなのでスキップ
    if (isMyTurn()) return;

    const robot = robots.find(r => r.dataset.color === robotColor);
    if (robot) {
      robot.classList.add('correct');
      const goalStar = document.querySelector('.goalStar');
      if (goalStar) goalStar.classList.add('goal-reached');
      showResultPopup(true);
      setTimeout(() => robot.classList.remove('correct'), 600);
    }
  });

  // ロボットリセット
  onlineSocket.on('resetRobots', () => {
    resetRobotsToInitial();
    moves = 0;
    updateMovesDisplay();
  });

  // 解答結果
  onlineSocket.on('answerResult', ({ playerId, success, usedMoves, points }) => {
    if (!success) {
      const robot = robots.find(r => r.dataset.color === selectedRobot?.dataset.color);
      if (robot) {
        robot.classList.add('incorrect');
        showResultPopup(false);
        setTimeout(() => robot.classList.remove('incorrect'), 500);
      }
    }
    // スコアはroundEndedで更新
  });

  // ラウンド終了
  // ラウンド終了
  onlineSocket.on('roundEnded', ({ winnerId, points, additionalStartSec, players: serverPlayers }) => {
    // サーバーのスコアをローカルに反映
    serverPlayers.forEach(sp => {
      const p = getPlayerById(sp.id);
      if (p) {
        p.wins  = sp.wins;
        p.score = sp.score;
      }
    });

    // フェーズをリセット（answering → ended）
    setRoundPhaseOnline('ended');

    if (winnerId) {
      const winner = getPlayerById(winnerId);
      const winnerName = winner?.name ?? '?';

      if (winnerId === myPlayerId) {
        // 自分が正解者
        setStatus(`正解！ ${winnerName} が獲得`);
        // Score Modeの場合は得点ポップアップ
        if (getGameMode() === 'score' && points > 0) {
          const decl = winner?.declaration;
          const msg = `🎉 ${additionalStartSec}秒 × ${decl?.moves ?? '?'}手 = ${points}点`;
          _showOnlineResultPopup(msg, true);
        }
      } else {
        // 相手が正解者
        if (getGameMode() === 'score' && points > 0) {
          const decl = getPlayerById(winnerId)?.declaration;
          const msg = `${winnerName} の正解！\n${additionalStartSec}秒 × ${decl?.moves ?? '?'}手 = ${points}点`;
          _showOnlineResultPopup(msg, true);
        } else {
          _showOnlineResultPopup(`${winnerName} の正解！🎉`);
        }
        setStatus(`${winnerName} の正解！`);
      }
    } else {
      setStatus('全員不正解。次のラウンドへ');
    }

    updateScoreboard();
    if (currentMovesEl) currentMovesEl.style.display = 'none';
    // 次のラウンドはサーバーが3秒後にboardSyncedを送信するので待つだけ
  });

  // ラウンドスキップ
  onlineSocket.on('roundSkipped', ({ reason }) => {
    setStatus(`ラウンドスキップ: ${reason}`);
  });

  // ゲーム終了
  onlineSocket.on('gameEnded', ({ winner, players: serverPlayers }) => {
    // サーバーのスコアをローカルに反映
    serverPlayers.forEach(sp => {
      const p = getPlayerById(sp.id);
      if (p) {
        p.wins  = sp.wins;
        p.score = sp.score;
      }
    });

    stopTimer();
    const winnerPlayer = winner ? getPlayerById(winner.id) : null;
    showResultScreen({
      winner:   winnerPlayer,
      players:  getPlayers(),
      mode:     getGameMode(),
      gameType: 'online'
    });
  });

  // プレイヤー切断通知
  onlineSocket.on('playerDisconnected', ({ playerId, playerName, isRetire }) => {
    const msg = isRetire ? `${playerName} がリタイアしました` : `${playerName} が切断しました`;
    setStatus(msg);
    // プレイヤーをdisconnected状態に
    const player = getPlayerById(playerId);
    if (player) player.disconnected = true;
    updateScoreboard();
  });

  // プレイヤー再接続通知
  onlineSocket.on('playerReconnected', ({ playerId, playerName }) => {
    setStatus(`${playerName} が再接続しました`);
    const player = getPlayerById(playerId);
    if (player) player.disconnected = false;
    updateScoreboard();
  });

  // ホスト交代通知
  onlineSocket.on('hostChanged', ({ newHostId }) => {
    if (newHostId === myPlayerId) {
      onlineIsHost = true;
      setStatus('あなたがホストになりました');
    }
  });

  // エラー
  onlineSocket.on('error', ({ message }) => {
    alert(message);
  });
}

// -------------------------------------------------------
// 内部ユーティリティ
// -------------------------------------------------------

/**
 * 受信した盤面データをクライアントに適用する
 */
function _applyBoardData(boardData) {
  // 壁データを適用
  walls = boardData.walls;
  renderEmptyBoard(boardEl);
  drawWalls();

  // ロボットを削除して再配置
  document.querySelectorAll('.robot').forEach(e => e.remove());
  robots = [];

  boardData.robots.forEach(robotData => {
    const r = createRobotEl(robotData.color, robotData.x, robotData.y, (robotEl) => {
      // オンラインモードでは自分が解答者の時のみ選択可能
      if (isMyTurn()) {
        document.querySelectorAll('.robot').forEach(ro => removeRobotAura(ro));
        addRobotAura(robotEl);
        selectedRobot = robotEl;
      }
    });
    r.dataset.initX = robotData.initX;
    r.dataset.initY = robotData.initY;
    robots.push(r);
  });

  // ゴールを配置
  goal      = boardData.goal;
  goalColor = boardData.goalColor;
  renderGoal(goal, goalColor);
}

/**
 * サーバーから受信した解答者情報をローカルに設定する
 */
function _setCurrentAnswerer(answererId, declaredMoves) {
  selectedPlayerId = answererId;
  _setOnlineAnswerer(answererId, declaredMoves);
}

/**
 * ロボット移動を適用する（他プレイヤーの操作を反映）
 */
function _applyRobotMove(dx, dy) {
  if (!selectedRobot) return;
  const startX = parseInt(selectedRobot.dataset.x);
  const startY = parseInt(selectedRobot.dataset.y);
  const { x, y } = calcRobotDestination(startX, startY, dx, dy, robots, selectedRobot);
  if (x === startX && y === startY) return;

  // 向きを変更
  const direction = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down';
  setRobotFacing(selectedRobot, direction);

  selectedRobot.classList.add('moving');
  setTimeout(() => selectedRobot.classList.remove('moving'), 400);
  moveRobotEl(selectedRobot, x, y);

  // 下方向に止まった場合は正面に戻す
  if (direction === 'down') {
    setRobotFacing(selectedRobot, 'front');
  }
}

/** 方向ベクトルを文字列に変換 */
function _vectorToDirection(dx, dy) {
  if (dx === 0 && dy === -1) return 'up';
  if (dx === 0 && dy === 1)  return 'down';
  if (dx === -1 && dy === 0) return 'left';
  if (dx === 1 && dy === 0)  return 'right';
  return null;
}

/** 方向文字列をベクトルに変換 */
function _directionToVector(direction) {
  const map = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
  return map[direction] ?? [0, 0];
}

/**
 * オンライン用：相手の正解/不正解をポップアップで表示する
 * @param {string} message
 * @param {boolean} isCorrect
 */
function _showOnlineResultPopup(message, isCorrect = true) {
  const el = document.getElementById('result-popup');
  if (!el) return;
  el.textContent = message;
  el.className = isCorrect ? 'correct show' : 'incorrect show';
  setTimeout(() => el.classList.remove('show'), 2000);
}

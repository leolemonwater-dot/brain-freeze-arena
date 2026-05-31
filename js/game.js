/**
 * game.js
 * ゲーム状態管理・初期化・キー操作
 */

const COLORS = ['red', 'blue', 'green', 'yellow'];

// 盤面状態
let robots        = [];
let selectedRobot = null;
let moves         = 0;
let goal          = null;
let goalColor     = null;

// DOM参照
const boardEl         = document.getElementById('board');
const statusEl        = document.getElementById('status');
const timerEl         = document.getElementById('timer');
const roundInfoEl     = document.getElementById('round-info');
const scoreboardEl    = document.getElementById('scoreboard');
const currentMovesEl  = document.getElementById('current-moves');
const resultPopupEl   = document.getElementById('result-popup');

/** ステータステキストを更新する */
function setStatus(txt = '') {
  statusEl.textContent = txt;
}

/**
 * 正解/不正解ポップアップを表示する
 * @param {boolean} isCorrect - 正解かどうか
 */
function showResultPopup(isCorrect) {
  if (!resultPopupEl) return;
  
  resultPopupEl.textContent = isCorrect ? '正解！🎉' : '不正解...';
  resultPopupEl.className = isCorrect ? 'correct show' : 'incorrect show';
  
  // 1秒後に自動で消す
  setTimeout(() => {
    resultPopupEl.classList.remove('show');
  }, 1000);
}

/**
 * ゴールのみ再配置する（壁はそのまま）
 * L字の内側コーナーをゴール候補とする
 */
function placeGoalOnly() {
  const candidates = [];
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      // 中央2×2（5,6）を除外
      if (x >= 5 && x <= 6 && y >= 5 && y <= 6) continue;
      const w = walls[y][x];
      
      // L字の内側コーナーかチェック
      const isCorner = (w.top && w.left) || (w.top && w.right) || (w.bottom && w.left) || (w.bottom && w.right);
      if (!isCorner) continue;
      
      // 4方向すべてに壁がある場合は除外（囲まれている）
      if (w.top && w.right && w.bottom && w.left) continue;
      
      // 少なくとも2方向が開いているかチェック（アクセス可能）
      const openDirs = [!w.top, !w.right, !w.bottom, !w.left].filter(Boolean).length;
      if (openDirs >= 2) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) {
    console.warn('ゴール候補なし。フォールバック位置を使用します。');
    candidates.push({ x: Math.floor(SIZE / 2), y: Math.floor(SIZE / 2) - 2 });
  }
  goal      = candidates[Math.floor(Math.random() * candidates.length)];
  goalColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  renderGoal(goal, goalColor);
  setStatus('');
}

/**
 * ロボットと初期ゴールを配置する
 */
function placeRobotsAndGoal() {
  robots        = [];
  selectedRobot = null;
  document.querySelectorAll('.robot').forEach(e => e.remove());
  placeGoalOnly();

  COLORS.forEach(color => {
    let x, y;
    do {
      x = Math.floor(Math.random() * SIZE);
      y = Math.floor(Math.random() * SIZE);
    } while ((x === goal.x && y === goal.y) || isCenter(x, y));

    const r = createRobotEl(color, x, y, (robotEl) => {
      document.querySelectorAll('.robot').forEach(ro => removeRobotAura(ro));
      addRobotAura(robotEl);
      selectedRobot = robotEl;
      // 十字キー中央のペンギン画像を更新
      _updateDpadPenguin(robotEl.dataset.color);
    });
    robots.push(r);
  });
}

/**
 * ロボットを初期位置に戻す
 */
function resetRobotsToInitial() {
  robots.forEach(r => {
    const x = parseInt(r.dataset.initX);
    const y = parseInt(r.dataset.initY);
    removeRobotAura(r);
    moveRobotEl(r, x, y);
  });
  selectedRobot = null;
  moves         = 0;
  setStatus('');
}

/**
 * ゴールのみ再生成してロボットをリセットする
 */
function regenerateGoalAndReset() {
  resetRobotsToInitial();
  placeGoalOnly();
}

/**
 * 選択中のロボットを指定方向に移動する
 * @param {number} dx
 * @param {number} dy
 */
function moveSelectedRobot(dx, dy) {
  if (!selectedRobot) return;

  // 対戦モード中は解答フェーズのみ移動を許可
  const phase = getRoundPhase();
  if (phase === 'thinking' || phase === 'additional') return;

  // 解答フェーズ：現在の解答者のみ操作可能
  if (phase === 'answering') {    const answerer = getCurrentAnswerer();
    if (!answerer) return;
    
    // 選択中のプレイヤーが現在の解答者でない場合は操作不可
    if (selectedPlayerId !== answerer.playerId) {
      setStatus('現在の解答者ではありません。待機してください。');
      return;
    }
  }

  const startX = parseInt(selectedRobot.dataset.x);
  const startY = parseInt(selectedRobot.dataset.y);
  const { x, y } = calcRobotDestination(startX, startY, dx, dy, robots, selectedRobot);

  // 動いていなければカウントしない
  if (x === startX && y === startY) return;

  // ロボットの向きを変更（移動方向に応じて）
  const direction = dx === -1 ? 'left' : dx === 1 ? 'right' : dy === -1 ? 'up' : 'down';
  setRobotFacing(selectedRobot, direction);

  // オンラインモード: ロボット移動を送信
  if (isOnlineMode()) {
    sendMoveOnline(selectedRobot.dataset.color, dx, dy);
  }

  // 移動アニメーション
  selectedRobot.classList.add('moving');
  setTimeout(() => selectedRobot.classList.remove('moving'), 400);

  moveRobotEl(selectedRobot, x, y);
  moves++;

  // 下方向に止まった場合は正面に戻す
  if (direction === 'down') {
    setRobotFacing(selectedRobot, 'front');
  }

  // 手数表示を更新
  updateMovesDisplay();

  // 宣言手数を超えたら即不正解
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer && moves > answerer.moves) {
      selectedRobot.classList.add('incorrect');
      if (currentMovesEl) currentMovesEl.classList.add('over-limit');
      showResultPopup(false);
      setTimeout(() => {
        selectedRobot.classList.remove('incorrect');
        if (currentMovesEl) currentMovesEl.classList.remove('over-limit');
        if (isOnlineMode()) {
          sendGoalReachedOnline(selectedRobot.dataset.color, moves); // 不正解として報告
        } else {
          resolveAnswer(false, moves);
        }
      }, 500);
      return;
    }
  }

  // クリア判定：同色ロボットがゴールに到達
  if (goal && x === goal.x && y === goal.y && selectedRobot.dataset.color === goalColor) {
    const phase = getRoundPhase();
    if (phase === 'answering') {
      // 正解アニメーション
      selectedRobot.classList.add('correct');
      const goalStar = document.querySelector('.goalStar');
      if (goalStar) goalStar.classList.add('goal-reached');

      showResultPopup(true);

      setTimeout(() => {
        selectedRobot.classList.remove('correct');
        if (isOnlineMode()) {
          // オンライン：サーバーに報告（サーバーが正解判定してroundEndedを送信）
          sendGoalReachedOnline(selectedRobot.dataset.color, moves);
        } else {
          // オフライン：ローカルで解答処理
          resolveAnswer(true, moves);
        }
      }, 600);
    } else {
      // ソロ練習モード
      setStatus('クリア！');
      showResultPopup(true);
    }
  } else {
    setStatus('');
  }
}

/**
 * 手数表示を更新する
 */
function updateMovesDisplay() {
  if (!currentMovesEl) return;
  const phase = getRoundPhase();
  
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer) {
      currentMovesEl.style.display = 'block';
      currentMovesEl.textContent = `手数: ${moves} / ${answerer.moves}`;
      
      // 宣言手数を超えたら赤色
      if (moves > answerer.moves) {
        currentMovesEl.classList.add('over-limit');
      } else {
        currentMovesEl.classList.remove('over-limit');
      }
    }
  } else {
    currentMovesEl.style.display = 'none';
  }
}

/**
 * 盤面を完全に再生成する（四角形検知付き）
 */
function generateBoard() {
  const maxAttempts = 50; // 最大試行回数
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    setStatus('');
    moves = 0;

    initWalls();
    renderEmptyBoard(boardEl);
    placeLAndIWalls();
    
    // 四角形をチェック
    if (hasSquareEnclosure()) {
      console.warn(`試行 ${attempts}: 四角形を検出したため再生成します`);
      continue; // 再生成
    }
    
    // 四角形がなければ壁を描画してロボット配置
    drawWalls();
    placeRobotsAndGoal();
    console.log(`試行 ${attempts}: 盤面生成成功`);
    return; // 成功
  }
  
  // 最大試行回数に達した場合でも最後の盤面を表示
  console.error(`${maxAttempts}回試行しても四角形のない盤面を生成できませんでした。最後の盤面を表示します。`);
  drawWalls();
  placeRobotsAndGoal();
}

/**
 * 十字キー中央のペンギン画像を更新する
 * @param {string} color
 */
function _updateDpadPenguin(color) {
  const img = document.getElementById('dpad-penguin');
  if (!img) return;
  const path = getRobotImagePath(color, 'front');
  if (path) {
    img.src = path;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
}

// ---- キー操作 ----
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp')    moveSelectedRobot( 0, -1);
  if (e.key === 'ArrowDown')  moveSelectedRobot( 0,  1);
  if (e.key === 'ArrowLeft')  moveSelectedRobot(-1,  0);
  if (e.key === 'ArrowRight') moveSelectedRobot( 1,  0);
});

// ---- タイマー表示の更新 ----
function onTimerTick(remaining, state) {
  if (!timerEl) return;
  if (state === 'thinking') {
    timerEl.textContent = `思考中... ${remaining}秒経過`;
  } else if (state === 'additional') {
    timerEl.textContent = `アディショナル: 残り ${remaining}秒`;
    timerEl.style.color = remaining <= 10 ? '#dc2626' : '#1d4ed8';
  }
}

// ---- スコアボード更新 ----
let selectedPlayerId = null; // 宣言時に選択されているプレイヤーID

function updateScoreboard() {
  if (!scoreboardEl) return;
  const ps = getPlayers();
  if (ps.length === 0) { scoreboardEl.innerHTML = ''; return; }

  const mode     = getGameMode();
  const isOnline = isOnlineMode();

  scoreboardEl.innerHTML = ps.map(p => {
    // 1行目：名前 + スコア
    const val = mode === 'quick' ? `${p.wins}本` : `${p.score}点`;
    const penalty    = p.penalized ? ' ⚠️' : '';
    const passedMark = p.passed    ? ' ⊘'  : '';

    // 2行目：宣言状態（オンライン時のみ宣言手数を表示）
    let statusLine = '';
    if (p.declaration !== null) {
      statusLine = isOnline
        ? `<div class="card-status declared">${p.declaration.moves}手で宣言中</div>`
        : `<div class="card-status declared">宣言済み ✓</div>`;
    } else if (p.passed) {
      statusLine = `<div class="card-status passed">パス ⊘</div>`;
    } else {
      statusLine = `<div class="card-status thinking">思考中...</div>`;
    }

    // オフラインのみカードクリックで選択可能
    const selectedClass  = (!isOnline && selectedPlayerId === p.id) ? 'selected-player' : '';
    const declaredClass  = p.declaration !== null ? 'declared' : '';
    const clickHandler   = isOnline ? '' : `onclick="selectPlayer('${p.id}')"`;

    return `<span class="player-score ${selectedClass} ${declaredClass}" ${clickHandler}>
      <div class="card-main">${p.name}: ${val}${penalty}</div>
      ${statusLine}
    </span>`;
  }).join('');

  // 選択中のプレイヤー名をヒントに表示（オフラインのみ）
  if (!isOnline) updateSelectedPlayerHint();
}

function selectPlayer(playerId) {
  // 解答フェーズ中はプレイヤー選択を無効化（現在の解答者が固定）
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer && playerId !== answerer.playerId) {
      setStatus('解答フェーズ中はプレイヤーを変更できません');
      return;
    }
  }
  
  selectedPlayerId = playerId;
  updateScoreboard();
}

function updateSelectedPlayerHint() {
  const hintEl = document.getElementById('selected-player-hint');
  if (!hintEl) return;
  
  if (selectedPlayerId) {
    const player = getPlayerById(selectedPlayerId);
    if (player) {
      hintEl.textContent = `選択中: ${player.name}`;
      hintEl.style.color = '#667eea';
      hintEl.style.fontWeight = '600';
    }
  } else {
    hintEl.textContent = '👆 上のプレイヤーカードをクリックして選択してください';
    hintEl.style.color = '#6b7280';
    hintEl.style.fontWeight = '400';
  }
}

// ---- ラウンド情報更新 ----
function updateRoundInfo() {
  if (!roundInfoEl) return;
  const round   = getCurrentRound();
  const mode    = getGameMode();
  const modeStr = mode === 'quick'
    ? `Quick Mode (${round}ラウンド目)`
    : `Score Mode (${round}/${SCORE_ROUNDS}ラウンド)`;
  roundInfoEl.textContent = round > 0 ? modeStr : '';
}

// ---- フェーズ変化ハンドラ ----
function onPhaseChange(phase, data) {
  updateScoreboard();
  updateRoundInfo();

  if (phase === 'thinking') {
    setStatus('思考中... 手数を宣言してください');
    if (!isOnlineMode()) updateSelectedPlayerHint();
    _updateDeclarePanel();
    // 方向ボタンを非表示、宣言パネルを再表示
    const dirBtnsThink = document.getElementById('direction-buttons');
    if (dirBtnsThink) dirBtnsThink.classList.remove('visible');
    const declarePanelThink = document.getElementById('declare-panel');
    if (declarePanelThink && getPlayers().length > 0) declarePanelThink.style.display = 'block';
  } else if (phase === 'thinking_tick') {
    if (timerEl) {
      timerEl.textContent = `思考中... 残り ${data}秒`;
      timerEl.style.color = data <= 10 ? '#dc2626' : '#374151';
    }
  } else if (phase === 'additional') {
    setStatus('アディショナルタイム！追加宣言を受け付けています');
    if (!isOnlineMode()) updateSelectedPlayerHint();
    _updateDeclarePanel();
  } else if (phase === 'additional_tick') {
    if (timerEl) {
      timerEl.textContent = `アディショナル: 残り ${data}秒`;
      timerEl.style.color = data <= 10 ? '#dc2626' : '#1d4ed8';
    }
  } else if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer) {
      const player = getPlayerById(answerer.playerId);
      if (!isOnlineMode()) {
        // オフライン：解答者名を表示
        setStatus(`${player?.name ?? '?'} が解答中（宣言: ${answerer.moves}手以内）`);
      }
      resetRobotsToInitial();
      moves = 0;
      updateMovesDisplay();
      selectedPlayerId = answerer.playerId;
      updateScoreboard();
    }
    _updateDeclarePanel();
    // 解答フェーズ中は方向ボタンを表示、宣言パネルを非表示
    const dirBtns = document.getElementById('direction-buttons');
    if (dirBtns) dirBtns.classList.add('visible');
    const declarePanel = document.getElementById('declare-panel');
    if (declarePanel) declarePanel.style.display = 'none';
  } else if (phase === 'answering_tick') {
    // オンライン解答フェーズのタイマー
    if (timerEl) {
      timerEl.textContent = `解答中: 残り ${data}秒`;
      timerEl.style.color = data <= 10 ? '#dc2626' : '#1d4ed8';
    }
  } else if (phase === 'round_ended') {
    const result = data;
    if (result?.winnerId) {
      const winner = getPlayerById(result.winnerId);
      setStatus(`${winner?.name ?? '?'} の正解！`);
    } else {
      setStatus('全員不正解。次のラウンドへ');
    }
    updateScoreboard();
    if (currentMovesEl) currentMovesEl.style.display = 'none';
    // 方向ボタンを非表示、宣言パネルを再表示
    const dirBtnsRound = document.getElementById('direction-buttons');
    if (dirBtnsRound) dirBtnsRound.classList.remove('visible');
    const declarePanelRound = document.getElementById('declare-panel');
    if (declarePanelRound && getPlayers().length > 0) declarePanelRound.style.display = 'block';
    // オフラインのみ自動で次のラウンドへ（オンラインはサーバーが制御）
    if (!isOnlineMode()) {
      setTimeout(() => nextRound(onPhaseChange), 3000);
    }
  } else if (phase === 'ended') {
    if (currentMovesEl) currentMovesEl.style.display = 'none';
  }
}

// ---- ゲーム終了ハンドラ（オフライン） ----
function onGameEnd(winner) {
  stopTimer();
  // 結果画面を表示
  showResultScreen({
    winner,
    players:  getPlayers(),
    mode:     getGameMode(),
    gameType: 'offline'
  });
}

// ---- 対戦ゲーム開始（UIから呼ぶ） ----
function startGame(mode, playerNames) {
  if (playerNames.length < 2) {
    alert('プレイヤーを2人以上登録してください');
    return;
  }
  setupGame(mode, playerNames, onGameEnd); // mode.js
  nextRound(onPhaseChange);               // mode.js
}

// ---- 宣言ボタンから呼ぶ ----
function handleDeclare(playerId, movesCount) {
  const player = getPlayerById(playerId);
  if (player?.penalized) {
    alert(`${player.name} は今ラウンド宣言できません（ペナルティ中）`);
    return;
  }
  if (player?.declaration !== null) {
    alert(`${player.name} は既に宣言済みです`);
    return;
  }
  const success = submitDeclaration(playerId, movesCount); // round.js
  if (!success) {
    alert('宣言できません（思考フェーズまたはアディショナルタイム以外）');
    return;
  }
  updateScoreboard();
}

// ---- 宣言手数の増減 ----
function changeDeclareMove(delta) {
  const display = document.getElementById('declare-moves-display');
  if (!display) return;
  let val = parseInt(display.textContent) + delta;
  if (val < 1) val = 1;
  if (val > 99) val = 99;
  display.textContent = val;
}

// ---- 宣言UIから呼ぶ ----
function onDeclare() {
  const display = document.getElementById('declare-moves-display');
  const movesVal = display ? parseInt(display.textContent) : NaN;
  if (isNaN(movesVal) || movesVal < 1) {
    alert('手数を入力してください');
    return;
  }

  if (isOnlineMode()) {
    // オンライン：サーバーに送信
    sendDeclareOnline(movesVal);
    // 宣言ボタンをグレーアウト（即時）
    const declareBtn = document.getElementById('declare-btn');
    if (declareBtn) {
      declareBtn.disabled = true;
      declareBtn.style.opacity = '0.5';
    }
  } else {
    // オフライン：ローカルで処理
    if (!selectedPlayerId) {
      alert('プレイヤーを選択してください（スコアボードのカードをクリック）');
      return;
    }
    handleDeclare(selectedPlayerId, movesVal);
    // 宣言時のバウンスアニメーション
    const playerCard = document.querySelector('.player-score.selected-player');
    if (playerCard) {
      playerCard.classList.add('bounce');
      setTimeout(() => playerCard.classList.remove('bounce'), 400);
    }
  }
}

// ---- 解答パス ----
function handlePass() {
  const phase = getRoundPhase();

  if (phase === 'thinking' || phase === 'additional') {
    if (isOnlineMode()) {
      // オンライン：サーバーに送信
      sendPassOnline();
    } else {
      // オフライン：ローカルで処理
      if (!selectedPlayerId) {
        alert('プレイヤーを選択してください（スコアボードのカードをクリック）');
        return;
      }
      const success = submitPass(selectedPlayerId);
      if (success) {
        updateScoreboard();
        setStatus(`${getPlayerById(selectedPlayerId)?.name ?? '?'} がパスしました`);
      } else {
        alert('パスできません');
      }
    }
    return;
  }

  // 解答フェーズ中：不正解扱い
  if (phase === 'answering') {
    if (selectedRobot) {
      selectedRobot.classList.add('incorrect');
      showResultPopup(false);
      setTimeout(() => {
        selectedRobot.classList.remove('incorrect');
        if (isOnlineMode()) {
          // オンライン：ゴール未到達で手数オーバー扱い
          sendGoalReachedOnline(selectedRobot.dataset.color, Infinity);
        } else {
          resolveAnswer(false, Infinity);
        }
      }, 500);
    } else {
      showResultPopup(false);
      setTimeout(() => {
        if (!isOnlineMode()) resolveAnswer(false, Infinity);
      }, 500);
    }
  }
}

/**
 * 宣言パネルの状態を更新する
 * オンライン/オフライン・フェーズに応じて表示を切り替える
 */
function _updateDeclarePanel() {
  const hintEl     = document.getElementById('selected-player-hint');
  const declareBtn = document.getElementById('declare-btn');
  const phase      = getRoundPhase();

  if (isOnlineMode()) {
    // オンライン：「選択中」表示なし
    if (hintEl) hintEl.style.display = 'none';

    // 宣言済みならボタンをグレーアウト
    if (declareBtn) {
      const myPlayer = getPlayers().find(p => p.id === myPlayerId);
      const declared = myPlayer?.declaration !== null;
      declareBtn.disabled    = declared || phase === 'answering';
      declareBtn.style.opacity = (declared || phase === 'answering') ? '0.5' : '1';
    }
  } else {
    // オフライン：「選択中」表示あり
    if (hintEl) hintEl.style.display = 'block';
    if (declareBtn) {
      declareBtn.disabled    = false;
      declareBtn.style.opacity = '1';
    }
  }
}

// ---- 初期化 ----
// game.jsがロードされた時点ではタイトル画面が表示されている
// オンライン・オフライン・ソロはユーザー操作で開始する
(function() {
  // initOnlineModeはlobby-client.jsのgameStartedで処理済みのため不要
})();

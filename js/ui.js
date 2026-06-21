/**
 * ui.js
 * 画面切り替え・確認ダイアログ共通処理
 */

/**
 * 指定した画面のみ表示し、他を非表示にする
 * @param {string} screenId - 表示する画面のID
 */
function showScreen(screenId) {
  const screens = [
    'title-screen',
    'name-screen',
    'lobby-screen',
    'room-screen',
    'setup-screen',
    'game-screen',
    'result-screen'
  ];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) {
      // title-screenはflexで表示
      el.style.display = (id === 'title-screen') ? 'flex' : 'block';
    } else {
      el.style.display = 'none';
    }
  });
}

/**
 * 確認ダイアログを表示する
 * @param {string} message - 表示するメッセージ
 * @param {function} onYes - YESを押した時のコールバック
 * @param {function} [onNo] - NOを押した時のコールバック（省略可）
 */
function showConfirmDialog(message, onYes, onNo) {
  const overlay = document.getElementById('confirm-dialog-overlay');
  const messageEl = document.getElementById('confirm-dialog-message');
  const yesBtn = document.getElementById('confirm-dialog-yes');
  const noBtn = document.getElementById('confirm-dialog-no');

  if (!overlay) return;

  messageEl.textContent = message;
  overlay.style.display = 'flex';

  // 既存のイベントリスナーを削除してから再設定
  const newYesBtn = yesBtn.cloneNode(true);
  const newNoBtn = noBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
  noBtn.parentNode.replaceChild(newNoBtn, noBtn);

  newYesBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
    if (onYes) onYes();
  });

  newNoBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
    if (onNo) onNo();
  });
}

/**
 * 結果画面を表示する
 * @param {Object} params
 * @param {Object|null} params.winner - 優勝プレイヤー（nullの場合は引き分け）
 * @param {Array} params.players - 全プレイヤーの配列
 * @param {string} params.mode - 'quick' | 'score'
 * @param {string} params.gameType - 'offline' | 'online'
 */
function showResultScreen({ winner, players, mode, gameType }) {
  showScreen('result-screen');

  // 優勝者表示
  const winnerEl = document.getElementById('result-winner');
  if (winnerEl) {
    if (!winner) {
      winnerEl.textContent = '引き分け！';
    } else {
      // 同率1位チェック
      const topScore = mode === 'quick' ? winner.wins : winner.score;
      const topPlayers = players.filter(p =>
        (mode === 'quick' ? p.wins : p.score) === topScore
      );
      if (topPlayers.length > 1) {
        winnerEl.textContent = `同率1位: ${topPlayers.map(p => p.name).join(' & ')}`;
      } else {
        winnerEl.textContent = `🏆 ${winner.name} の勝利！`;
      }
    }
  }

  // スコア一覧
  const listEl = document.getElementById('result-score-list');
  if (listEl) {
    const sorted = [...players].sort((a, b) => {
      const aScore = mode === 'quick' ? a.wins : a.score;
      const bScore = mode === 'quick' ? b.wins : b.score;
      return bScore - aScore;
    });

    let prevScore = null;
    let prevRank = 0;
    let count = 0;

    listEl.innerHTML = sorted.map(p => {
      const score = mode === 'quick' ? p.wins : p.score;
      const unit  = mode === 'quick' ? '本' : '点';
      count++;
      let rank;
      if (score === prevScore) {
        rank = `同率${prevRank}位`;
      } else {
        rank = `${count}位`;
        prevRank = count;
        prevScore = score;
      }
      return `<div class="result-row">
        <span class="result-rank">${rank}</span>
        <span class="result-name">${p.name}</span>
        <span class="result-score">${score}${unit}</span>
      </div>`;
    }).join('');
  }

  // ボタン切り替え
  const offlineBtn = document.getElementById('result-btn-offline');
  const onlineBtn  = document.getElementById('result-btn-online');
  if (offlineBtn) offlineBtn.style.display = gameType === 'offline' ? 'block' : 'none';
  if (onlineBtn)  onlineBtn.style.display  = gameType === 'online'  ? 'block' : 'none';
}

// ESモジュール用エクスポート
export { showScreen, showConfirmDialog, showResultScreen };

/**
 * mode-offline.js
 * オフライン対戦専用ロジック
 *
 * 依存: game-controller.js, mode.js, round.js, ui.js
 * 循環依存なし
 */

import {
  robots, selectedRobot, moves, goal, goalColor, selectedPlayerId,
  COLORS, boardEl,
  initMode, setStatus, showResultPopup, generateBoardData, placeGoal, placeRobots,
  resetRobotsToInitial, moveSelectedRobot, updateMovesDisplay,
  updateScoreboard, updateRoundInfo, selectPlayer, updateSelectedPlayerHint,
  _updateDeclarePanel, currentMovesEl, timerEl
} from './game-controller.js';
import { setupGame, nextRound, getGameMode, getCurrentRound, SCORE_ROUNDS } from './mode.js';
import { getRoundPhase, getCurrentAnswerer, resolveAnswer, submitDeclaration, submitPass } from './round.js';
import { getPlayers, getPlayerById } from './players.js';
import { showResultScreen, showScreen, showConfirmDialog } from './ui.js';
import { stopTimer } from './timer.js';
import { sfxDeclare } from './sound.js';

// -------------------------------------------------------
// ゲーム開始
// -------------------------------------------------------

/**
 * オフライン対戦を開始する
 * @param {string} mode - 'quick' | 'score'
 * @param {string[]} playerNames
 */
export function startOfflineGame(mode, playerNames) {
  if (playerNames.length < 2) {
    alert('プレイヤーを2人以上登録してください');
    return;
  }
  setupGame(mode, playerNames, _onGameEnd);
  nextRound(_onPhaseChange);
}

// -------------------------------------------------------
// 宣言・パス
// -------------------------------------------------------

export function onDeclareOffline(movesVal) {
  if (!selectedPlayerId) {
    alert('プレイヤーを選択してください（スコアボードのカードをクリック）');
    return;
  }
  const player = getPlayerById(selectedPlayerId);
  if (player?.penalized) {
    alert(`${player.name} は今ラウンド宣言できません（ペナルティ中）`);
    return;
  }
  if (player?.declaration !== null) {
    alert(`${player.name} は既に宣言済みです`);
    return;
  }
  const success = submitDeclaration(selectedPlayerId, movesVal);
  if (!success) {
    alert('宣言できません（思考フェーズまたはアディショナルタイム以外）');
    return;
  }
  sfxDeclare();
  updateScoreboard(false, null);
  const playerCard = document.querySelector('.player-score.selected-player');
  if (playerCard) {
    playerCard.classList.add('bounce');
    setTimeout(() => playerCard.classList.remove('bounce'), 400);
  }
}

export function onPassOffline() {
  const phase = getRoundPhase();
  if (phase === 'thinking' || phase === 'additional') {
    if (!selectedPlayerId) {
      alert('プレイヤーを選択してください');
      return;
    }
    const success = submitPass(selectedPlayerId);
    if (success) {
      updateScoreboard(false, null);
      setStatus(`${getPlayerById(selectedPlayerId)?.name ?? '?'} がパスしました`);
    } else {
      alert('パスできません');
    }
  }
}

// -------------------------------------------------------
// フェーズ変化ハンドラ（オフライン専用）
// -------------------------------------------------------

function _onPhaseChange(phase, data) {
  updateScoreboard(false, null);
  updateRoundInfo();

  if (phase === 'thinking') {
    setStatus('思考中... 手数を宣言してください');
    updateSelectedPlayerHint();
    _updateDeclarePanel(false, null, null);
    _hideDpadShowDeclare();
  } else if (phase === 'thinking_tick') {
    if (timerEl) {
      timerEl.textContent = `思考中... 残り ${data}秒`;
      timerEl.style.color = data <= 10 ? '#dc2626' : '#374151';
    }
  } else if (phase === 'additional') {
    setStatus('アディショナルタイム！追加宣言を受け付けています');
    updateSelectedPlayerHint();
    _updateDeclarePanel(false, null, null);
  } else if (phase === 'additional_tick') {
    if (timerEl) {
      timerEl.textContent = `アディショナル: 残り ${data}秒`;
      timerEl.style.color = data <= 10 ? '#dc2626' : '#1d4ed8';
    }
  } else if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer) {
      const player = getPlayerById(answerer.playerId);
      setStatus(`${player?.name ?? '?'} が解答中（宣言: ${answerer.moves}手以内）`);
      resetRobotsToInitial();
      updateMovesDisplay();
      selectPlayer(answerer.playerId);
      updateScoreboard(false, null);
    }
    _updateDeclarePanel(false, null, null);
    _showDpadHideDeclare();
  } else if (phase === 'round_ended') {
    const result = data;
    if (result?.winnerId) {
      const winner = getPlayerById(result.winnerId);
      setStatus(`${winner?.name ?? '?'} の正解！`);
    } else {
      setStatus('全員不正解。次のラウンドへ');
    }
    updateScoreboard(false, null);
    if (currentMovesEl) currentMovesEl.style.display = 'none';
    _hideDpadShowDeclare();
    setTimeout(() => nextRound(_onPhaseChange), 3000);
  } else if (phase === 'ended') {
    if (currentMovesEl) currentMovesEl.style.display = 'none';
  }
}

function _onGameEnd(winner) {
  stopTimer();
  showResultScreen({
    winner,
    players:  getPlayers(),
    mode:     getGameMode(),
    gameType: 'offline'
  });
}

// -------------------------------------------------------
// 盤面生成（オフライン用ラッパー）
// -------------------------------------------------------

export function generateBoardOffline() {
  generateBoardData(() => {
    placeGoal();
    placeRobots(null);
  });
}

// -------------------------------------------------------
// UIユーティリティ
// -------------------------------------------------------

function _showDpadHideDeclare() {
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.add('visible');
  const dp = document.getElementById('declare-panel');
  if (dp) dp.style.display = 'none';
}

function _hideDpadShowDeclare() {
  const dirBtns = document.getElementById('direction-buttons');
  if (dirBtns) dirBtns.classList.remove('visible');
  const dp = document.getElementById('declare-panel');
  if (dp && getPlayers().length > 0) dp.style.display = 'block';
}

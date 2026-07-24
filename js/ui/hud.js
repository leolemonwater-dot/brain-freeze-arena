/**
 * ui/hud.js
 * ゲーム画面のHUD更新（スコアボード・タイマー・ステータス・手数表示など）
 *
 * game-controller.js のUI部分を分離したモジュール。
 * core/ には依存するが、modes/ には依存しない。
 */

import { getPlayers, getPlayerById } from '../core/players.js';
import { getRoundPhase, getCurrentAnswerer } from '../core/round.js';
import { getGameMode, getCurrentRound, SCORE_ROUNDS } from '../core/mode.js';
import { getRobotImagePath } from './renderer.js';

// boardState から状態を取得する関数を使う（直接 import した値はスナップショットになるため）
// moves / selectedPlayerId は呼び出し時に動的に参照する
import * as boardState from '../core/boardState.js';

// -------------------------------------------------------
// DOM参照
// -------------------------------------------------------

export const boardEl        = document.getElementById('board');
export const statusEl       = document.getElementById('status');
export const timerEl        = document.getElementById('timer');
export const roundInfoEl    = document.getElementById('round-info');
export const scoreboardEl   = document.getElementById('scoreboard');
export const currentMovesEl = document.getElementById('current-moves');
export const resultPopupEl  = document.getElementById('result-popup');

// -------------------------------------------------------
// ステータステキスト
// -------------------------------------------------------

export function setStatus(txt = '') {
  if (statusEl) statusEl.textContent = txt;
}

// -------------------------------------------------------
// 正解/不正解ポップアップ
// -------------------------------------------------------

export function showResultPopup(isCorrect) {
  if (!resultPopupEl) return;
  resultPopupEl.textContent = isCorrect ? '正解！' : '不正解';
  resultPopupEl.className = isCorrect ? 'correct show' : 'incorrect show';
  setTimeout(() => resultPopupEl.classList.remove('show'), 1000);
}

// -------------------------------------------------------
// 手数表示
// -------------------------------------------------------

export function updateMovesDisplay() {
  if (!currentMovesEl) return;
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer) {
      const moves = boardState.moves;
      currentMovesEl.style.display = 'block';
      currentMovesEl.textContent = `手数: ${moves} / ${answerer.moves}`;
      if (moves > answerer.moves) currentMovesEl.classList.add('over-limit');
      else currentMovesEl.classList.remove('over-limit');
    }
  } else {
    currentMovesEl.style.display = 'none';
  }
}

// -------------------------------------------------------
// スコアボード
// -------------------------------------------------------

/**
 * スコアボードを更新する
 * @param {boolean} isOnlineMode
 * @param {string|null} myPlayerId
 */
export function updateScoreboard(isOnlineMode, myPlayerId) {
  if (!scoreboardEl) return;
  const ps = getPlayers();
  if (ps.length === 0) { scoreboardEl.innerHTML = ''; return; }

  const mode = getGameMode();

  scoreboardEl.innerHTML = ps.map(p => {
    const val     = mode === 'quick' ? `${p.wins}本` : `${p.score}点`;
    const penalty = p.penalized ? ' [ペナルティ]' : '';

    let statusLine = '';
    if (p.declaration !== null) {
      statusLine = isOnlineMode
        ? `<div class="card-status declared">${p.declaration.moves}手で宣言中</div>`
        : `<div class="card-status declared">宣言済み</div>`;
    } else if (p.passed) {
      statusLine = `<div class="card-status passed">パス</div>`;
    } else {
      statusLine = `<div class="card-status thinking">思考中...</div>`;
    }

    const selectedPlayerId = boardState.selectedPlayerId;
    const selectedClass = (!isOnlineMode && selectedPlayerId === p.id) ? 'selected-player' : '';
    const declaredClass = p.declaration !== null ? 'declared' : '';
    const clickHandler  = isOnlineMode ? '' : `onclick="selectPlayer('${p.id}')"`;

    return `<span class="player-score ${selectedClass} ${declaredClass}" ${clickHandler}>
      <div class="card-main">${p.name}: ${val}${penalty}</div>
      ${statusLine}
    </span>`;
  }).join('');
}

// -------------------------------------------------------
// ラウンド情報
// -------------------------------------------------------

export function updateRoundInfo() {
  if (!roundInfoEl) return;
  const round = getCurrentRound();
  const mode  = getGameMode();
  const modeStr = mode === 'quick'
    ? `Quick Mode (${round}ラウンド目)`
    : `Score Mode (${round}/${SCORE_ROUNDS}ラウンド)`;
  roundInfoEl.textContent = round > 0 ? modeStr : '';
}

// -------------------------------------------------------
// プレイヤー選択（オフライン用）
// -------------------------------------------------------

export function selectPlayer(playerId) {
  const phase = getRoundPhase();
  if (phase === 'answering') {
    const answerer = getCurrentAnswerer();
    if (answerer && playerId !== answerer.playerId) {
      setStatus('解答フェーズ中はプレイヤーを変更できません');
      return;
    }
  }
  boardState.setSelectedPlayerId(playerId);
}

export function updateSelectedPlayerHint() {
  const hintEl = document.getElementById('selected-player-hint');
  if (!hintEl) return;
  const selectedPlayerId = boardState.selectedPlayerId;
  if (selectedPlayerId) {
    const player = getPlayerById(selectedPlayerId);
    if (player) {
      hintEl.textContent = `選択中: ${player.name}`;
      hintEl.style.color = '#667eea';
      hintEl.style.fontWeight = '600';
    }
  } else {
    hintEl.textContent = '';
  }
}

// -------------------------------------------------------
// 方向パッド中央のペンギン画像更新
// -------------------------------------------------------

export function updateDpadPenguin(color) {
  const img = document.getElementById('dpad-penguin');
  if (!img) return;
  const path = getRobotImagePath(color, 'front');
  if (path) { img.src = path; img.style.display = 'block'; }
  else img.style.display = 'none';
}

// -------------------------------------------------------
// ゴールパーティクル演出
// -------------------------------------------------------

export function spawnGoalParticles(goalPos, color) {
  const goalCell = document.querySelector(`.cell[data-x='${goalPos.x}'][data-y='${goalPos.y}']`);
  if (!goalCell) return;
  const colors = ['#fbbf24', '#f59e0b', '#fff', color, '#fde68a'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    p.className = 'goal-particle';
    const angle = (i / 10) * 360;
    const dist  = 30 + Math.random() * 30;
    p.style.setProperty('--tx', `${Math.cos(angle * Math.PI / 180) * dist}px`);
    p.style.setProperty('--ty', `${Math.sin(angle * Math.PI / 180) * dist}px`);
    p.style.background  = colors[i % colors.length];
    p.style.top         = '50%';
    p.style.left        = '50%';
    p.style.marginTop   = '-4px';
    p.style.marginLeft  = '-4px';
    goalCell.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

// -------------------------------------------------------
// 宣言パネルの有効/無効切り替え
// -------------------------------------------------------

/**
 * @param {boolean} isOnline
 * @param {string|null} myPlayerId
 * @param {string|null} phase - 省略時は getRoundPhase() を使用
 */
export function updateDeclarePanel(isOnline, myPlayerId, phase) {
  const declareBtn = document.getElementById('declare-btn');
  if (isOnline) {
    if (declareBtn) {
      const myPlayer = getPlayers().find(p => p.id === myPlayerId);
      const declared = myPlayer?.declaration !== null;
      const ph = phase ?? getRoundPhase();
      declareBtn.disabled      = declared || ph === 'answering';
      declareBtn.style.opacity = (declared || ph === 'answering') ? '0.5' : '1';
    }
  } else {
    if (declareBtn) { declareBtn.disabled = false; declareBtn.style.opacity = '1'; }
  }
}

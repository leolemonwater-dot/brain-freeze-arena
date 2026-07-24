# Brain Freeze Arena - ESモジュール設計書

最終更新: 2026-06-21

---

## 現状の循環依存（問題）

```
game.js ←→ online.js  （最も深刻）
game.js ←→ mode.js    （mode.jsがgenerateBoard()を呼ぶ）
```

これが「オンラインの状態がソロに引き継がれる」「ポップアップが二重に出る」などのバグの根本原因。

---

## 目指す依存関係（一方向）

```
【上位層：アプリケーション】
  app.js              ← エントリーポイント・画面遷移・モード切り替え

【中位層：ゲームロジック】
  game-controller.js  ← ゲーム進行（3モード共通の操作）
  mode-offline.js     ← オフライン専用ロジック
  mode-solo.js        ← ソロ専用ロジック
  mode-online.js      ← オンライン専用ロジック（現online.js + lobby-client.js統合）

【下位層：純粋な計算・管理】
  board.js            ← 盤面データ生成（変更なし）
  renderer.js         ← DOM描画（変更なし）
  robot.js            ← 移動計算（変更なし）
  players.js          ← プレイヤー管理（変更なし）
  round.js            ← ラウンド管理（変更なし）
  mode.js             ← ゲームモード管理（変更なし）
  timer.js            ← タイマー（変更なし）
  ui.js               ← 画面切り替え（変更なし）
  sound.js            ← 効果音（変更なし）
```

下位層は上位層に**依存しない**。上位層だけが下位層を import する。

---

## 各ファイルの export/import 設計

### 下位層（変更なし・export を追加するだけ）

#### `board.js`
```js
export { SIZE, walls, lCorners, isCenter, initWalls, setWallBi, hasSquareEnclosure, placeLAndIWalls }
```

#### `renderer.js`
```js
import { SIZE } from './board.js'
export { renderEmptyBoard, drawWalls, renderGoal, createRobotEl, moveRobotEl,
         setRobotFacing, addRobotAura, removeRobotAura, getRobotImagePath }
```

#### `robot.js`
```js
import { walls, SIZE } from './board.js'
export { calcRobotDestination }
```

#### `players.js`
```js
export { addPlayer, getPlayers, getPlayerById, resetDeclarations, resetPenalties,
         resetAllPlayers, declareMove, getSortedDeclarations, passPlayer,
         addWin, addScore, penalizePlayer, getQuickModeWinner, getScoreModeWinner }
```

#### `round.js`
```js
import { declareMove, passPlayer, getSortedDeclarations, getPlayers, penalizePlayer } from './players.js'
import { startThinkingTimer, startAdditionalTimer, stopTimer, getRemainingSeconds } from './timer.js'
export { startRound, submitDeclaration, submitPass, startAnswerPhase,
         getCurrentAnswerer, resolveAnswer, getRoundPhase, setRoundPhaseOnline, _setOnlineAnswerer }
```

#### `mode.js`
**注意:** 現在 `generateBoard()` を呼んでいるが、これを削除してコールバック方式に変更する。
```js
import { resetAllPlayers, addPlayer, resetPenalties, getQuickModeWinner, getScoreModeWinner,
         getPlayerById, addWin } from './players.js'
import { startRound } from './round.js'
import { stopTimer } from './timer.js'
// ※ generateBoard は呼ばない → onNextRound コールバックで受け取る
export { setupGame, nextRound, getGameMode, getGameState, getCurrentRound,
         QUICK_WIN_COUNT, SCORE_ROUNDS, _setOnlineGameMode }
```

#### `timer.js`
```js
export { startThinkingTimer, startAdditionalTimer, stopTimer, getRemainingSeconds, THINKING_TIME_SEC }
```

#### `ui.js`
```js
export { showScreen, showConfirmDialog, showResultScreen }
```

#### `sound.js`
```js
export { sfxSelect, sfxSlide, sfxDeclare, sfxGoal, sfxWrong, sfxPass, sfxRoundStart, sfxTick }
```

---

### 中位層（新規作成・全面書き直し）

#### `game-controller.js`（現 game.js から共通部分を抽出）
**責務:** 3モード共通のロボット操作・盤面描画・UI更新

```js
import { SIZE, walls, initWalls, placeLAndIWalls, hasSquareEnclosure } from './board.js'
import { renderEmptyBoard, drawWalls, renderGoal, createRobotEl, moveRobotEl,
         setRobotFacing, addRobotAura, removeRobotAura, getRobotImagePath } from './renderer.js'
import { calcRobotDestination } from './robot.js'
import { getPlayers, getPlayerById, resetAllPlayers } from './players.js'
import { getRoundPhase, getCurrentAnswerer, resolveAnswer } from './round.js'
import { getGameMode, getCurrentRound, SCORE_ROUNDS } from './mode.js'
import { stopTimer } from './timer.js'
import { sfxSelect, sfxSlide, sfxGoal, sfxWrong, sfxDeclare, sfxTick } from './sound.js'

export {
  // 状態
  robots, selectedRobot, moves, goal, goalColor, selectedPlayerId,

  // 関数
  initMode,
  generateBoard,
  placeRobotsAndGoal,
  resetRobotsToInitial,
  moveSelectedRobot,
  updateMovesDisplay,
  updateScoreboard,
  updateRoundInfo,
  onPhaseChange,        // オフライン用フェーズハンドラ
  setStatus,
  showResultPopup,
  changeDeclareMove,
  _updateDeclarePanel,
  _updateDpadPenguin,
  _spawnGoalParticles,
}
```

#### `mode-offline.js`（現 game.js のオフライン部分）
**責務:** オフラインゲームの開始・宣言・パス・ゲーム終了

```js
import { ... } from './game-controller.js'
import { setupGame, nextRound } from './mode.js'
import { submitDeclaration, submitPass } from './round.js'
import { showResultScreen } from './ui.js'

export { startOfflineGame, onDeclareOffline, onPassOffline, onGameEndOffline }
```

#### `mode-solo.js`（現 game.js のソロ部分）
**責務:** ソロ練習の宣言・フェーズ管理

```js
import { ... } from './game-controller.js'

export { soloPhase, soloDeclaredMoves, onDeclareSolo, getSoloPhase }
```

#### `mode-online.js`（現 online.js + lobby-client.js を統合）
**責務:** Socket.IO接続・ロビー・オンラインゲーム同期

```js
import { ... } from './game-controller.js'
import { ... } from './players.js'
import { ... } from './round.js'
import { ... } from './mode.js'
import { showScreen, showResultScreen } from './ui.js'

export {
  // オンライン状態
  onlineSocket, onlineRoomId, myPlayerId, isOnlineMode, isMyTurn,

  // ロビー
  enterLobby, refreshRooms, createRoom, joinRoom, toggleReady, startOnlineGame, leaveRoom,

  // ゲーム送信
  sendDeclareOnline, sendPassOnline, sendMoveOnline, sendGoalReachedOnline, sendRetireOnline,
}
```

---

### 上位層（新規作成）

#### `app.js`（現 index.html のインラインスクリプト）
**責務:** エントリーポイント・画面遷移・モード切り替え・キー操作

```js
import { showScreen, showConfirmDialog } from './ui.js'
import { generateBoard, initMode, moveSelectedRobot } from './game-controller.js'
import { startOfflineGame, onDeclareOffline } from './mode-offline.js'
import { onDeclareSolo } from './mode-solo.js'
import { enterLobby, refreshRooms, ... } from './mode-online.js'

// DOMContentLoaded
// キー操作
// goToSoloMode(), goToOfflineMode() etc.
```

---

## index.html の変更

現在の複数 `<script>` を1つの `<script type="module">` に変更:

```html
<!-- 変更前 -->
<script src="js/board.js"></script>
<script src="js/renderer.js"></script>
...（12個）

<!-- 変更後 -->
<script type="module" src="js/app.js"></script>
```

ただし `onclick="xxx()"` は `type="module"` でグローバルスコープに公開されないため、
イベントリスナーをすべて `addEventListener` に変更する必要がある。

---

## 実装順序

| フェーズ | 作業 | リスク |
|---------|------|-------|
| 1 | 下位層に export を追加（board, renderer, robot, players, round, mode, timer, ui, sound） | 低 |
| 2 | game-controller.js を作成 | 中 |
| 3 | mode-offline.js を作成 | 中 |
| 4 | mode-solo.js を作成 | 低 |
| 5 | mode-online.js を作成（online.js + lobby-client.js 統合） | 高 |
| 6 | app.js を作成 | 中 |
| 7 | index.html を `<script type="module">` に変更・onclick を addEventListener に変更 | 高 |
| 8 | 動作確認・デバッグ | - |

---

## 変更後の依存グラフ（循環なし）

```
app.js
  ├── game-controller.js
  │     ├── board.js
  │     ├── renderer.js → board.js
  │     ├── robot.js → board.js
  │     ├── players.js
  │     ├── round.js → players.js, timer.js
  │     ├── mode.js → players.js, round.js, timer.js
  │     ├── timer.js
  │     ├── ui.js
  │     └── sound.js
  ├── mode-offline.js → game-controller.js, mode.js, round.js, ui.js
  ├── mode-solo.js → game-controller.js
  └── mode-online.js → game-controller.js, players.js, round.js, mode.js, ui.js
```

**循環依存: ゼロ**

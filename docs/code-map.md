# Brain Freeze Arena - コードマップ

最終更新: 2026-06-21

---

## ファイル一覧と責務

### クライアント側 JS

---

### `js/board.js`
**責務:** 盤面データ生成（DOM操作なし）

| 変数/関数 | 内容 |
|----------|------|
| `SIZE = 12` | 盤面サイズ定数 |
| `walls[][]` | 壁データ（top/right/bottom/left/blocked） |
| `lCorners[]` | L字壁の角セル一覧 |
| `initWalls()` | 壁データを初期化（外周設定） |
| `setWallBi()` | 壁フラグを双方向に設定するユーティリティ |
| `hasSquareEnclosure()` | 囲い込み（1×1・2×2）チェック |
| `placeLAndIWalls()` | L字10個・I字8本・中央ブロックを配置 |
| `isCenter(x,y)` | 中央2×2かどうか判定 |

**依存:** なし

---

### `js/renderer.js`
**責務:** DOM描画（盤面・壁・ロボット・ゴール）

| 関数 | 内容 |
|------|------|
| `renderEmptyBoard(boardEl)` | 空の盤面セルを生成 |
| `drawWalls()` | 壁データをDOMに反映 |
| `makeWallEl(dir)` | 壁要素を生成 |
| `renderGoal(goal, goalColor)` | ゴール魚画像を描画 |
| `getRobotImagePath(color, direction)` | ペンギン画像パスを返す |
| `createRobotEl(color, x, y, onSelect)` | ロボット要素を生成・配置 |
| `setRobotFacing(robotEl, direction)` | ロボットの向き画像を変更 |
| `moveRobotEl(robotEl, x, y)` | ロボットをposition:absoluteで移動 |
| `addRobotAura(robotEl)` | 選択オーラを付与 |
| `removeRobotAura(robotEl)` | 選択オーラを除去 |
| `_gridToPos(x, y)` | グリッド座標→left/top(%)に変換 |

**依存:** `board.js`（SIZE）

---

### `js/robot.js`
**責務:** ロボット移動計算（壁判定・衝突判定）

| 関数 | 内容 |
|------|------|
| `calcRobotDestination(startX, startY, dx, dy, robots, self)` | 滑った先の座標を返す |

**依存:** `board.js`（walls, SIZE）

---

### `js/players.js`
**責務:** プレイヤー管理（登録・スコア・宣言・ペナルティ）

| 変数/関数 | 内容 |
|----------|------|
| `players[]` | プレイヤー配列 |
| `addPlayer(name)` | プレイヤーを追加 |
| `getPlayers()` | 全プレイヤーを返す |
| `getPlayerById(id)` | IDでプレイヤーを返す |
| `resetDeclarations()` | 宣言・パスをリセット |
| `resetPenalties()` | ペナルティをリセット |
| `resetAllPlayers()` | 全プレイヤーを削除 |
| `declareMove(playerId, moves)` | 宣言を登録 |
| `getSortedDeclarations()` | 宣言を解答順でソート |
| `passPlayer(playerId)` | パス状態にする |
| `addWin(playerId)` | Quick Mode 1本加算 |
| `addScore(playerId, sec, moves)` | Score Mode 得点加算 |
| `penalizePlayer(playerId)` | ペナルティ付与 |
| `getQuickModeWinner()` | Quick Mode 勝者を返す |
| `getScoreModeWinner()` | Score Mode 勝者を返す |

**依存:** なし

---

### `js/timer.js`
**責務:** オフライン用タイマー管理

| 定数/関数 | 内容 |
|----------|------|
| `THINKING_TIME_SEC = 60` | 思考フェーズ秒数 |
| `startThinkingTimer(onTick, seconds)` | 思考タイマー開始 |
| `startAdditionalTimer(onTick, onEnd)` | アディショナルタイマー開始 |
| `stopTimer()` | タイマー停止 |
| `getRemainingSeconds()` | 残り秒数を返す |

**依存:** なし  
**注意:** オフラインのみ使用。オンラインはサーバー側タイマーを使用。

---

### `js/round.js`
**責務:** ラウンド管理（宣言・解答・正誤判定）— オフライン用

| 変数/関数 | 内容 |
|----------|------|
| `roundPhase` | 現在フェーズ（'thinking'\|'additional'\|'answering'\|'ended'） |
| `answerQueue[]` | 解答キュー |
| `answerIndex` | 現在の解答者インデックス |
| `startRound(onPhaseChange, onRoundEnd)` | ラウンド開始 |
| `submitDeclaration(playerId, moves)` | 宣言を受け付ける |
| `submitPass(playerId)` | パスを受け付ける |
| `startAnswerPhase()` | 解答フェーズ開始 |
| `getCurrentAnswerer()` | 現在の解答者を返す |
| `resolveAnswer(success, usedMoves)` | 解答結果を処理 |
| `getRoundPhase()` | 現在フェーズを返す |
| `setRoundPhaseOnline(phase)` | オンライン用フェーズ直接設定 |
| `_setOnlineAnswerer(playerId, moves)` | オンライン用解答者直接設定 |

**依存:** `players.js`, `timer.js`  
**注意:** オフライン用。オンラインはサーバーが管理し、`setRoundPhaseOnline`・`_setOnlineAnswerer` でローカル状態を同期。

---

### `js/mode.js`
**責務:** ゲームモード管理（Quick/Score）— オフライン用

| 変数/関数 | 内容 |
|----------|------|
| `QUICK_WIN_COUNT = 5` | Quick Mode 先取本数 |
| `SCORE_ROUNDS = 10` | Score Mode ラウンド数 |
| `gameMode` | 現在のモード |
| `currentRound` | 現在のラウンド番号 |
| `setupGame(mode, playerNames, onGameEnd)` | ゲームセットアップ |
| `nextRound(onPhaseChange)` | 次のラウンドへ |
| `getGameMode()` | 現在モードを返す |
| `getCurrentRound()` | 現在ラウンド番号を返す |
| `_setOnlineGameMode(mode, round)` | オンライン用モード直接設定 |

**依存:** `players.js`, `round.js`, `game.js`（generateBoard）

---

### `js/game.js`
**責務:** ゲーム状態管理・入力処理・UI更新（全モード共通）

⚠️ **最も責務が多く、モード固有処理が混在している**

| 変数 | 内容 |
|------|------|
| `robots[]` | ロボット要素配列 |
| `selectedRobot` | 選択中ロボット |
| `moves` | 現在の手数 |
| `goal, goalColor` | ゴール座標・色 |
| `selectedPlayerId` | 選択中プレイヤーID |
| `soloPhase` | ソロモード専用フェーズ |
| `soloDeclaredMoves` | ソロ宣言手数 |

| 関数 | 内容 | 対応モード |
|------|------|-----------|
| `initMode(mode)` | 全状態リセット | 共通 |
| `showResultPopup(isCorrect)` | 正解/不正解ポップアップ | 共通 |
| `generateBoard()` | 盤面生成 | オフライン・ソロ |
| `placeRobotsAndGoal()` | ロボット・ゴール配置 | オフライン・ソロ |
| `resetRobotsToInitial()` | ロボットを初期位置に戻す | 共通 |
| `moveSelectedRobot(dx, dy)` | ロボット移動・ゴール判定 | 共通 |
| `updateMovesDisplay()` | 手数表示更新 | 共通 |
| `updateScoreboard()` | スコアボード更新 | オフライン・オンライン |
| `selectPlayer(playerId)` | プレイヤー選択 | オフライン |
| `updateRoundInfo()` | ラウンド情報更新 | 共通 |
| `onPhaseChange(phase, data)` | フェーズ変化ハンドラ | オフライン |
| `onGameEnd(winner)` | ゲーム終了ハンドラ | オフライン |
| `startGame(mode, playerNames)` | 対戦ゲーム開始 | オフライン |
| `handleDeclare(playerId, moves)` | 宣言処理 | オフライン |
| `onDeclare()` | 宣言UIハンドラ | 共通 |
| `handlePass()` | パス処理 | 共通 |
| `changeDeclareMove(delta)` | 宣言手数増減 | 共通 |
| `_updateDeclarePanel()` | 宣言パネル状態更新 | 共通 |
| `_updateDpadPenguin(color)` | 十字キー中央画像更新 | 共通 |
| `_spawnGoalParticles(goal, color)` | ゴールパーティクル | 共通 |

**依存:** `board.js`, `renderer.js`, `robot.js`, `players.js`, `round.js`, `mode.js`, `timer.js`, `online.js`, `sound.js`

---

### `js/online.js`
**責務:** オンライン同期ロジック（Socket.IOイベント受信・送信）

| 変数 | 内容 |
|------|------|
| `onlineSocket` | Socket.IOインスタンス（lobby-client.jsと共有） |
| `onlineRoomId` | 現在の部屋ID |
| `onlinePlayerName` | 自分のプレイヤー名 |
| `onlineIsHost` | ホストかどうか |
| `onlineModeActive` | オンラインモードフラグ |
| `myPlayerId` | 自分のSocket ID |

| 関数 | 内容 |
|------|------|
| `initOnlineMode()` | オンラインモード初期化（現在は互換のみ） |
| `isOnlineMode()` | オンラインモード判定 |
| `isMyTurn()` | 自分が解答者かどうか |
| `sendDeclareOnline(moves)` | 宣言送信 |
| `sendPassOnline()` | パス送信 |
| `sendMoveOnline(color, dx, dy)` | 移動送信 |
| `sendGoalReachedOnline(color, moves)` | ゴール報告 |
| `sendRetireOnline()` | リタイア送信 |
| `returnToRoomOnline()` | 部屋に戻る |
| `_setupListeners()` | Socket.IOイベントリスナー設定 |
| `_applyBoardData(boardData)` | 盤面データ適用 |
| `_setCurrentAnswerer(id, moves)` | 解答者設定 |
| `_applyRobotMove(dx, dy)` | 他プレイヤーのロボット移動を反映 |
| `_showOnlineResultPopup(message, isCorrect)` | オンライン用ポップアップ |

**受信イベント:** `reconnected`, `boardSynced`, `roundStarted`, `phaseChanged`, `timerTick`, `playerDeclared`, `playerPassed`, `robotMoved`, `goalReached`, `resetRobots`, `answerResult`, `roundEnded`, `roundSkipped`, `gameEnded`, `playerDisconnected`, `playerReconnected`, `hostChanged`

**依存:** `game.js`（showResultPopup等）, `players.js`, `round.js`, `mode.js`, `renderer.js`

---

### `js/lobby-client.js`
**責務:** 待合室のUI制御・Socket.IOイベント処理

| 変数 | 内容 |
|------|------|
| `lobbyPlayerName` | 自分のプレイヤー名 |
| `currentRoomId` | 現在の部屋ID |
| `lobbyIsHost` | ホストかどうか |
| `lobbyIsReady` | 準備完了状態 |

| 関数 | 内容 |
|------|------|
| `enterLobby()` | 名前入力してロビーへ |
| `refreshRooms()` | 部屋一覧更新 |
| `createRoom()` | 部屋作成 |
| `joinRoom(roomId)` | 部屋参加 |
| `toggleReady()` | 準備完了/キャンセル |
| `startOnlineGame()` | ゲーム開始（ホストのみ） |
| `leaveRoom()` | 退出 |
| `setupLobbyListeners(sock)` | Socket.IOリスナー設定 |
| `_updateRoomDisplay(room)` | 部屋UI更新 |
| `_lobbySocket()` | onlineSocketへのアクセサ |

**受信イベント:** `roomsList`, `roomCreated`, `roomJoined`, `joinError`, `roomUpdated`, `gameStarted`, `hostChanged`, `playerDisconnected`, `playerReconnected`

**依存:** `online.js`（onlineSocket共有）, `game.js`（initMode等）

---

### `js/ui.js`
**責務:** 画面切り替え・確認ダイアログ・結果画面表示

| 関数 | 内容 |
|------|------|
| `showScreen(screenId)` | 指定画面のみ表示 |
| `showConfirmDialog(msg, onYes, onNo)` | 確認ダイアログ表示 |
| `showResultScreen({winner, players, mode, gameType})` | 結果画面表示 |

**依存:** なし

---

### `js/sound.js`
**責務:** Web Audio APIによる効果音生成

| 関数 | 内容 |
|------|------|
| `sfxSelect()` | ロボット選択音 |
| `sfxSlide()` | 移動・停止音（シュー→トン） |
| `sfxDeclare()` | 宣言音 |
| `sfxGoal()` | ゴール音（ファンファーレ） |
| `sfxWrong()` | 不正解音 |
| `sfxPass()` | パス音 |
| `sfxRoundStart()` | ラウンド開始音 |
| `sfxTick()` | タイマー警告音 |

**依存:** なし（Web Audio API）

---

## ポップアップ発火マップ（問題1の原因）

```
【オンライン・回答者】
game.js moveSelectedRobot()
  → ゴール到達 → showResultPopup(true)  ← 1回目
  → sendGoalReachedOnline() → サーバー
    → goalReached受信 → online.js
      → showResultPopup(true)             ← 2回目（重複！）
    → roundEnded受信 → online.js
      → _showOnlineResultPopup()          ← 3回目（重複！）

【オンライン・閲覧者】
online.js goalReached受信
  → showResultPopup(true)                 ← 1回目
online.js roundEnded受信
  → _showOnlineResultPopup()              ← 2回目（重複！）
```

### あるべき姿

| 対象 | 正解時 | 不正解時 |
|------|-------|---------|
| 回答者 | `game.js` で1回のみ | `game.js` で1回のみ |
| 閲覧者 | `online.js` の `goalReached` で1回のみ | `online.js` の `answerResult` で1回のみ |
| `roundEnded` | ポップアップなし（スコア更新のみ） | ポップアップなし |

---

## モード別処理フロー

```
ソロモード
  initMode('solo')
  → generateBoard() → placeRobotsAndGoal()
  → onDeclare() → soloPhase='answering'
  → moveSelectedRobot() → ゴール判定
  → showResultPopup() → 2秒後 generateBoard()

オフラインモード
  initMode('offline')
  → startGame() → setupGame() → nextRound() → startRound()
  → onPhaseChange('thinking')
  → onDeclare() → submitDeclaration() → アディショナル → 解答フェーズ
  → moveSelectedRobot() → resolveAnswer() → roundEnded → nextRound()

オンラインモード
  initMode('online') ← lobby-client.jsのgameStartedで呼ばれる
  → boardSynced受信 → _applyBoardData()
  → phaseChanged受信 → onPhaseChange()
  → moveSelectedRobot() → sendGoalReachedOnline()
  → goalReached受信 → showResultPopup（閲覧者のみ）
  → roundEnded受信 → スコア更新のみ
```

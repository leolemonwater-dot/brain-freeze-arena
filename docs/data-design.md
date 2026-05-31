# Brain Freeze Arena - データ設計書

最終更新: 2026-05-31

---

## 1. サーバー側データ構造

### Room（部屋）

```js
{
  id: string,              // ランダム6文字 例: "ABC123"
  hostId: string,          // ホストのSocket ID
  mode: 'quick' | 'score', // ゲームモード
  status: 'waiting'        // 待機中
        | 'playing'        // ゲーム中
        | 'finished',      // 終了
  players: Player[],       // 参加プレイヤー一覧（入室順）
  gameState: GameState | null, // ゲーム中のみ存在
  createdAt: number        // Date.now()
}
```

### Player（プレイヤー）

```js
{
  id: string,              // Socket ID
  name: string,            // プレイヤー名（最大12文字）
  isHost: boolean,         // ホストかどうか
  isReady: boolean,        // 準備完了かどうか（待機画面用）
  score: number,           // Score Mode 累計得点
  wins: number,            // Quick Mode 獲得本数
  penalized: boolean,      // 次ラウンド宣言不可フラグ
  passed: boolean,         // 現ラウンドでパスしたか
  declaration: Declaration | null, // 現ラウンドの宣言
  disconnectedAt: number | null,   // 切断時刻（再接続判定用）
  joinedAt: number         // 入室時刻（ホスト交代の優先順位用）
}
```

### Declaration（宣言）

```js
{
  playerId: string,        // 宣言したプレイヤーID
  moves: number,           // 宣言手数
  timestamp: number        // 宣言時刻 Date.now()
}
```

### GameState（ゲーム状態）

```js
{
  currentRound: number,    // 現在のラウンド番号（1始まり）
  phase: 'thinking'        // 思考フェーズ
       | 'additional'      // アディショナルタイム
       | 'answering'       // 解答フェーズ
       | 'round_ended'     // ラウンド終了
       | 'ended',          // ゲーム終了
  boardData: BoardData,    // 盤面データ
  answerQueue: Declaration[], // 解答順（宣言手数昇順→宣言時刻昇順）
  answerIndex: number,     // 現在の解答者インデックス
  additionalStartSec: number // アディショナル開始時の残り秒数（得点計算用）
}
```

### BoardData（盤面データ）

```js
{
  walls: WallCell[][],     // 12×12の壁データ
  robots: RobotData[],     // ロボット4体の初期位置
  goal: { x: number, y: number }, // ゴール位置
  goalColor: string        // ゴールの色
}
```

### RobotData（ロボット）

```js
{
  color: 'red' | 'blue' | 'green' | 'yellow',
  x: number,               // 現在位置
  y: number,
  initX: number,           // 初期位置（リセット用）
  initY: number
}
```

---

## 2. クライアント側データ構造

### オンラインモード時に localStorage で受け渡すデータ

```js
// lobby.html → index.html への遷移時に保存
{
  onlineMode: 'true',
  roomId: string,
  playerName: string,
  gameMode: 'quick' | 'score',
  players: string[],       // プレイヤー名の配列（順番通り）
  isHost: 'true' | 'false',
  myPlayerId: string       // 自分のSocket ID
}
```

### クライアント側のゲーム状態（game.js / online.js）

```js
// オンラインモード判定
onlineMode: boolean
onlineIsHost: boolean
onlineRoomId: string
onlinePlayerName: string
onlineSocket: Socket

// 自分のプレイヤーID（宣言・操作の権限判定に使用）
myOnlinePlayerId: string
```

---

## 3. Socket.IO イベント設計

### クライアント → サーバー

| イベント名 | タイミング | データ |
|-----------|-----------|--------|
| `getRooms` | 待合室を開いたとき / 更新ボタン押下 | なし |
| `createRoom` | 部屋作成ボタン押下 | `{ playerName, mode }` |
| `joinRoom` | 参加ボタン押下 / ゲーム画面から再接続 | `{ roomId, playerName }` |
| `setReady` | 準備完了/キャンセルボタン押下 | `{ roomId, isReady }` |
| `startGame` | ゲーム開始ボタン押下（ホストのみ） | `{ roomId }` |
| `syncBoard` | 盤面生成後（ホストのみ） | `{ roomId, boardData }` |
| `declare` | 宣言ボタン押下 | `{ roomId, playerId, moves }` |
| `pass` | パスボタン押下 | `{ roomId, playerId }` |
| `moveRobot` | ロボット移動（解答者のみ） | `{ roomId, robotColor, direction }` |
| `reportGoal` | ゴール到達を報告（解答者のみ） | `{ roomId, robotColor, usedMoves }` |
| `phaseChange` | フェーズ変更（ホストのみ） | `{ roomId, phase, data }` |
| `roundEnd` | ラウンド終了（ホストのみ） | `{ roomId, result }` |
| `gameEnd` | ゲーム終了（ホストのみ） | `{ roomId, winner }` |
| `retire` | リタイアボタン押下 | `{ roomId, playerId }` |
| `returnToRoom` | 結果画面から部屋に戻る | `{ roomId }` |

### サーバー → クライアント

| イベント名 | タイミング | データ |
|-----------|-----------|--------|
| `roomsList` | getRooms受信時 / 部屋状態変化時 | `Room[]`（待機中・満員・ゲーム中すべて） |
| `roomCreated` | 部屋作成成功 | `{ roomId, room }` |
| `roomJoined` | 部屋参加成功 | `{ roomId, room }` |
| `joinError` | 部屋参加失敗 | `{ message }` |
| `roomUpdated` | 部屋内の状態変化（プレイヤー増減・準備状態変化） | `Room` |
| `gameStarted` | ゲーム開始 | `{ room, players }` |
| `boardSynced` | 盤面データ配信（ゲスト向け） | `BoardData` |
| `playerDeclared` | 誰かが宣言した | `{ playerId, moves }` |
| `playerPassed` | 誰かがパスした | `{ playerId }` |
| `robotMoved` | ロボットが移動した（解答者以外向け） | `{ robotColor, direction }` |
| `phaseChanged` | フェーズが変わった | `{ phase, data }` |
| `roundEnded` | ラウンドが終了した | `{ winnerId, points }` |
| `gameEnded` | ゲームが終了した | `{ winner }` |
| `playerDisconnected` | プレイヤーが切断した | `{ playerId, playerName }` |
| `playerReconnected` | プレイヤーが再接続した | `{ playerId, playerName }` |
| `hostChanged` | ホストが交代した | `{ newHostId }` |
| `playerRetired` | プレイヤーがリタイアした | `{ playerId }` |
| `roomReturned` | 全員が部屋に戻った（または個別に戻った） | `Room` |

---

## 4. 切断・再接続の仕組み

### 切断検知フロー

```
1. Socket切断を検知（socket.on('disconnect')）
2. disconnectedAt = Date.now() を記録
3. 20秒タイマーを開始
4. 他のプレイヤーに playerDisconnected を通知
5. ゲーム中の場合：
   - 思考/アディショナルフェーズ → 「0秒でパス宣言」と同等に処理
   - 解答フェーズで解答者が切断 → 不正解扱いで次の解答者へ
6. 20秒以内に再接続 → 復帰処理
7. 20秒経過 → 完全切断扱い（残りプレイヤーで続行）
```

### 再接続フロー

```
1. クライアントが joinRoom を送信（roomId + playerName）
2. サーバーが disconnectedAt を確認
3. 20秒以内 → 同一プレイヤーとして復帰
   - ペナルティ状態を引き継ぐ
   - 現在のゲーム状態を送信
4. 20秒超過 → 新規参加として扱う（ゲーム中は参加不可）
```

### ホスト交代フロー

```
1. ホストが切断・退出
2. players配列をjoinedAt昇順でソート
3. 先頭のプレイヤーを新ホストに設定
4. hostChanged イベントを全員に送信
5. 新ホストの画面にゲーム開始ボタンを表示
```

---

## 5. ゲームフロー（オンライン）

```
[待機画面]
  全員準備完了 → ホストがstartGame送信
  ↓
[ゲーム開始・毎ラウンド開始時]
  サーバーが盤面を生成（board.jsのロジックをサーバーに移植）
  syncBoard で全員に盤面データを配信
  全員にboardSynced → 盤面を表示
  ↓
[思考フェーズ 60秒]
  タイマーはサーバーが管理・timerTickで全員に通知（1秒ごと）
  誰かがdeclare → アディショナルタイム開始
  60秒誰も宣言しない → ラウンドスキップ
  ↓
[アディショナルタイム 30秒]
  タイマーはサーバーが管理・timerTickで全員に通知
  追加宣言を受け付ける
  全員宣言/パス済み → 即解答フェーズへ
  ↓
[解答フェーズ]
  解答順（手数昇順→宣言時刻昇順）で順番に解答
  解答者に「あなたの番です」表示
  解答者のみロボット操作可能（クライアント側で判定）
  30秒タイマーはサーバーが管理・timerTickで全員に通知
  ロボット移動 → moveRobot → 全員の画面に反映
  ゴール到達 → 解答者が reportGoal 送信 → サーバーが goalReached を全員に送信 → 全員の画面でアニメーション
  正解 or 不正解/タイムアウト → 次の解答者へ
  ↓
[ラウンド終了]
  roundEnd送信 → スコア更新
  3秒後に次のラウンドへ（サーバーが次の盤面を生成してsyncBoard）
  ↓
[ゲーム終了条件を満たした場合]
  gameEnd送信 → 全員に結果画面を表示
```

### タイマー管理方針
- **すべてのタイマーはサーバー側で管理する**
- 1秒ごとに `timerTick` イベントで全クライアントに残り秒数を通知
- ホストが切断してもタイマーは継続（サーバー側で動いているため影響なし）
- クライアントはタイマーの表示のみ担当（計算はしない）

### 盤面生成方針
- **盤面生成はサーバー側で行う**（ホスト有利を防ぐため）
- `board.js` のロジックをサーバー側（Node.js）に移植
- 毎ラウンド開始時にサーバーが生成して `syncBoard` で全員に配信

### 再接続時の解答フェーズ
- 解答フェーズ中に切断 → 不正解扱いで次の解答者へ
- 20秒以内に再接続してきた場合 → そのラウンドは参加不可、次のラウンドから参加

### 追加イベント（タイマー関連）

| イベント名 | 方向 | データ |
|-----------|------|--------|
| `goalReached` | サーバー→クライアント | `{ robotColor, goalX, goalY }` |
| `timerTick` | サーバー→クライアント | `{ roomId, phase, remaining }` |

---

## 6. 残り1人勝利の判定

```
切断/リタイア処理後に残プレイヤー数をチェック
残り1人 → gameEnd送信（その1人が勝者）
※ Quick Mode / Score Mode 問わず即勝利
```

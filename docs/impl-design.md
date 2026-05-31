# Brain Freeze Arena - 実装設計書

最終更新: 2026-05-31

---

## 1. ファイル構成

```
個人開発/
├── index.html                  # タイトル・オフライン設定・ゲーム・結果画面
├── lobby.html                  # 名前入力・待合室・部屋内待機画面
├── image/
│   └── title.png               # ロゴ画像
├── js/
│   ├── board.js                # 盤面生成・壁配置ロジック（既存・変更なし）
│   ├── renderer.js             # DOM描画（既存・小修正）
│   ├── robot.js                # ロボット移動計算（既存・変更なし）
│   ├── players.js              # プレイヤー管理（既存・変更なし）
│   ├── timer.js                # タイマー管理（既存・オフライン用）
│   ├── round.js                # ラウンド管理（既存・変更なし）
│   ├── mode.js                 # ゲームモード管理（既存・変更なし）
│   ├── game.js                 # ゲーム状態管理（既存・修正あり）
│   ├── ui.js                   # 【新規】画面切り替え・UI共通処理
│   ├── online.js               # 【全面書き直し】オンライン同期ロジック
│   └── lobby-client.js         # 【全面書き直し】待合室クライアント
├── server/
│   ├── server.js               # 【全面書き直し】Socket.IOサーバー
│   ├── rooms.js                # 【全面書き直し】部屋管理
│   ├── game-manager.js         # 【新規】サーバー側ゲーム進行管理
│   ├── timer-manager.js        # 【新規】サーバー側タイマー管理
│   └── package.json            # 既存
└── docs/
    ├── requirements.md
    ├── screen-design.md
    ├── data-design.md
    └── impl-design.md          # このファイル
```

---

## 2. 既存コードとの差分

### 変更なし（そのまま使う）
- `js/board.js` — 盤面生成ロジック（サーバー側にも移植する）
- `js/robot.js` — ロボット移動計算
- `js/players.js` — プレイヤー管理
- `js/round.js` — ラウンド管理
- `js/mode.js` — ゲームモード管理
- `js/timer.js` — タイマー（オフライン用）

### 削除
- `js/tests.js` — 本番コードに不要なため削除

### 小修正
- `js/renderer.js` — ロボット消失バグ修正済み。追加修正なし
- `js/game.js` — 以下を修正
  - 戻るボタンの確認ダイアログ追加
  - オンライン/オフラインの宣言パネル切り替え
  - 結果画面への遷移処理追加
  - `initOnlineMode()` の修正

### 全面書き直し
- `js/online.js` — タイマーをサーバー管理に変更、イベント整理
- `js/lobby-client.js` — 画面遷移・イベント整理
- `server/server.js` — タイマー管理をサーバーに移動
- `server/rooms.js` — 切断・再接続・ホスト交代ロジック追加

### 新規作成
- `js/ui.js` — 画面切り替え共通処理（show/hide）
- `server/game-manager.js` — サーバー側ゲーム進行（フェーズ管理）
- `server/timer-manager.js` — サーバー側タイマー（setInterval管理）

---

## 3. 画面切り替え設計（ui.js）

```js
// 画面ID一覧
const SCREENS = {
  TITLE:    'title-screen',
  NAME:     'name-screen',      // lobby.html内
  LOBBY:    'lobby-screen',     // lobby.html内
  ROOM:     'room-screen',      // lobby.html内
  SETUP:    'setup-screen',     // index.html内
  GAME:     'game-screen',      // index.html内
  RESULT:   'result-screen'     // index.html / lobby.html内
};

// 画面を切り替える
function showScreen(screenId) { ... }

// 確認ダイアログ
function showConfirmDialog(message, onYes, onNo) { ... }
```

---

## 4. サーバー側の責務分担

### server.js
- Socket.IO接続・切断の受付
- イベントのルーティング（受け取って適切なManagerに渡す）
- 部屋一覧の配信

### rooms.js
- 部屋・プレイヤーのCRUD
- 切断検知・再接続処理
- ホスト交代処理

### game-manager.js
- ゲーム開始・終了
- **盤面生成（board.jsのロジックを移植）・毎ラウンド syncBoard 送信**
- ラウンド進行（フェーズ管理）
- 宣言・パス・解答の処理
- 残り1人勝利判定
- 再接続時のゲーム状態復元・そのラウンド参加不可処理

### timer-manager.js
- 思考フェーズ60秒タイマー
- アディショナルタイム30秒タイマー
- 解答フェーズ30秒タイマー（オンライン）
- 切断20秒タイマー
- 1秒ごとに `timerTick` を全員に送信

---

## 5. 実装タスクリスト

### フェーズA：基盤整備（既存コードの整理）

- [ ] A-1: `js/tests.js` を削除
- [ ] A-2: `js/board.js` のデータ生成部分とDOM描画部分を分離
  - データ生成（サーバー移植対象）: `initWalls()` `placeLAndIWalls()` `hasSquareEnclosure()`
  - DOM描画（クライアントのみ）: `drawWalls()` `renderEmptyBoard()`
- [ ] A-3: `js/ui.js` を新規作成（画面切り替え共通処理）
- [ ] A-4: `index.html` の画面切り替えロジックを `ui.js` に移行
- [ ] A-5: `index.html` に結果画面（`result-screen`）を追加
- [ ] A-6: `index.html` の戻るボタンに確認ダイアログを実装
- [ ] A-7: `js/game.js` にゲーム終了後の結果画面遷移を実装
- [ ] A-8: `lobby.html` の部屋作成モーダルを削除（直接③bに遷移する形に変更）

### フェーズB：サーバー側の再構築

- [ ] B-1: `server/board-logic.js` を新規作成（`board.js` のデータ生成部分を移植）
  - `initWalls()` `placeLAndIWalls()` `hasSquareEnclosure()` `placeRobotsAndGoal()` を移植
  - DOM依存のコードを除去してNode.jsで動くように調整
- [ ] B-2: `server/timer-manager.js` を新規作成
- [ ] B-3: `server/game-manager.js` を新規作成
- [ ] B-4: `server/rooms.js` を全面書き直し（切断・再接続・ホスト交代）
- [ ] B-5: `server/server.js` を全面書き直し（タイマーをサーバー管理に）

### フェーズC：クライアント側のオンライン対応

- [ ] C-1: `js/online.js` を全面書き直し（サーバー管理タイマーに対応）
  - Socket.IO接続を `io()` に変更（URLハードコードを廃止）
- [ ] C-2: `js/lobby-client.js` を全面書き直し（画面遷移・イベント整理）
  - Socket.IO接続を `io()` に変更（URLハードコードを廃止）
- [ ] C-3: `lobby.html` に結果画面を追加
- [ ] C-4: `lobby.html` の戻るボタン実装

### フェーズD：ゲーム画面のオンライン対応

- [ ] D-1: プレイヤーカードの2行表示（本数/得点 + 宣言状態）
- [ ] D-2: オンライン時の宣言パネル（「選択中」表示なし）
- [ ] D-3: 「あなたの番です」表示
- [ ] D-4: 解答フェーズ30秒タイマー表示
- [ ] D-5: 宣言済みボタンのグレーアウト

### フェーズE：切断・再接続・ホスト交代

- [ ] E-1: 切断20秒タイマーの実装
- [ ] E-2: 再接続時のゲーム状態復元
- [ ] E-3: ホスト交代時のUI更新
- [ ] E-4: 残り1人勝利判定

### フェーズF：UI仕上げ

- [ ] F-1: タイトル画面のデザイン修正（ロゴ20%、水色背景、氷ボタン）
- [ ] F-2: 待合室のスクロール対応
- [ ] F-3: 結果画面のデザイン
- [ ] F-4: 全画面の戻るボタン（◀）配置

---

## 6. 実装の優先順位

```
A（基盤整備）→ B（サーバー再構築）→ C（ロビー）→ D（ゲーム画面）→ E（切断処理）→ F（UI仕上げ）
```

各フェーズ完了後に動作確認を行ってから次のフェーズへ進む。

---

## 7. 注意事項・リスク

| リスク | 対策 |
|--------|------|
| ホスト切断時のタイマー継続 | タイマーをサーバー管理にすることで解決済み |
| 再接続時のゲーム状態不整合 | 再接続時にサーバーから全状態を再送信 |
| 複数タブで同じ名前が使われる | Socket IDで識別するため問題なし |
| 盤面生成の重さ（四角形チェック） | サーバー側で生成するため全端末に均等な体験 |
| board.jsのDOM依存 | データ生成とDOM描画を分離してサーバーに移植（A-2で対応） |
| Socket.IO接続先のハードコード | `io()` と引数なしにして自動解決（C-1・C-2で対応） |
| スマホのスリープによる切断 | 20秒の猶予があるため短時間なら復帰可能 |

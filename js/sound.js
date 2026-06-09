/**
 * sound.js
 * Web Audio API を使った効果音生成
 * 音声ファイル不要・ブラウザだけで動作
 */

let _audioCtx = null;

/** AudioContextを取得（初回ユーザー操作後に初期化） */
function _getCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // スリープから復帰
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

/**
 * 単音を鳴らす（内部ユーティリティ）
 * @param {number} freq      - 周波数 (Hz)
 * @param {number} duration  - 長さ (秒)
 * @param {string} type      - 波形 'sine'|'square'|'sawtooth'|'triangle'
 * @param {number} gain      - 音量 0〜1
 * @param {number} delay     - 開始遅延 (秒)
 * @param {string} envelope  - 'hit'|'fade'|'beep'
 */
function _tone(freq, duration, type = 'sine', gain = 0.3, delay = 0, envelope = 'hit') {
  try {
    const ctx = _getCtx();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    const start = ctx.currentTime + delay;
    const end   = start + duration;

    if (envelope === 'hit') {
      // アタック即・フェードアウト
      gainNode.gain.setValueAtTime(gain, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, end);
    } else if (envelope === 'fade') {
      // フェードイン・アウト
      gainNode.gain.setValueAtTime(0.001, start);
      gainNode.gain.linearRampToValueAtTime(gain, start + duration * 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.001, end);
    } else {
      // フラット
      gainNode.gain.setValueAtTime(gain, start);
      gainNode.gain.setValueAtTime(0.001, end - 0.01);
    }

    osc.start(start);
    osc.stop(end);
  } catch (e) {
    // 音声が使えない環境では無視
  }
}

// -------------------------------------------------------
// 公開効果音関数
// -------------------------------------------------------

/** ロボット選択音（短いポップ） */
function sfxSelect() {
  _tone(600, 0.08, 'sine', 0.25, 0, 'hit');
  _tone(900, 0.06, 'sine', 0.15, 0.05, 'hit');
}

/** 移動・停止音（シュー → トン） */
function sfxSlide() {
  try {
    const ctx = _getCtx();

    // 「シュー」：ホワイトノイズでブラシ音
    const bufferSize = ctx.sampleRate * 0.18;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // ハイパスフィルタで「シュー」らしく
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 3000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, ctx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.18);

    // 「トン」：低い打撃音（短いサイン波）
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, ctx.currentTime + 0.16);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.32);
    oscGain.gain.setValueAtTime(0.5, ctx.currentTime + 0.16);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(ctx.currentTime + 0.16);
    osc.stop(ctx.currentTime + 0.33);
  } catch (e) {}
}

/** 宣言音（短いビープ） */
function sfxDeclare() {
  _tone(440, 0.08, 'square', 0.15, 0, 'hit');
  _tone(550, 0.08, 'square', 0.12, 0.09, 'hit');
}

/** 正解・ゴール音（明るいファンファーレ） */
function sfxGoal() {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    _tone(freq, 0.15, 'sine', 0.3, i * 0.1, 'hit');
  });
  // 最後に和音
  _tone(523, 0.4, 'sine', 0.2, 0.45, 'fade');
  _tone(659, 0.4, 'sine', 0.2, 0.45, 'fade');
  _tone(784, 0.4, 'sine', 0.2, 0.45, 'fade');
}

/** 不正解音（低いブザー） */
function sfxWrong() {
  _tone(220, 0.1, 'sawtooth', 0.3, 0, 'hit');
  _tone(180, 0.2, 'sawtooth', 0.25, 0.1, 'hit');
}

/** パスボタン音 */
function sfxPass() {
  _tone(330, 0.06, 'triangle', 0.2, 0, 'hit');
  _tone(250, 0.08, 'triangle', 0.15, 0.07, 'hit');
}

/** ラウンド開始音 */
function sfxRoundStart() {
  _tone(392, 0.1, 'sine', 0.2, 0, 'hit');
  _tone(523, 0.1, 'sine', 0.2, 0.12, 'hit');
}

/** タイムリミット警告音（残り10秒以下） */
function sfxTick() {
  _tone(880, 0.05, 'square', 0.15, 0, 'hit');
}

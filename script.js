
"use strict";

// ========================================
// 設定
// ========================================

const CONFIG = {
  // 方式A：固定歩幅
  fixedStepLength: 0.70,

  // 歩数検出：フィルタなし
  stepThreshold: 10.8,
  resetThreshold: 10.4,
  minStepIntervalMs: 350,

  // 方式C：Weinberg型の動的歩幅
  K: 0.574,
  minStepLength: 0.25,
  maxStepLength: 1.20,

  // 方式Cの加速度データ保存上限
  maxStepSamples: 300
};

document.getElementById("kValue").textContent = CONFIG.K;
// ========================================
// 状態管理
// ========================================

const state = {
  running: false,
  startTime: 0,

  stepCount: 0,
  heading: 0,
  hasHeading: false,

  lastStepTime: 0,
  stepReady: true,

  stepSamples: [],
  rows: [],

  posA: { x: 0, y: 0 },
  posC: { x: 0, y: 0 },

  distanceA: 0,
  distanceC: 0
};

const $ = id => document.getElementById(id);


// ========================================
// 共通関数
// ========================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addLimited(array, value, limit) {
  array.push(value);

  while (array.length > limit) {
    array.shift();
  }
}


// ========================================
// リセット
// ========================================

function resetTrial() {
  state.stepCount = 0;
  state.heading = 0;
  state.hasHeading = false;

  state.lastStepTime = 0;
  state.stepReady = true;

  state.stepSamples = [];
  state.rows = [];

  state.posA = { x: 0, y: 0 };
  state.posC = { x: 0, y: 0 };

  state.distanceA = 0;
  state.distanceC = 0;

  $("heading").textContent = "未取得";
  $("rawMagnitude").textContent = "--";
  $("filteredMagnitude").textContent = "--";
  $("threshold").textContent =
    CONFIG.stepThreshold.toFixed(1);
  $("stepCount").textContent = "0";

  $("position").textContent =
    "計測開始後に表示されます。";

  $("lastStep").textContent =
    "直近の方式C歩幅：-- m";

  $("stepTable").replaceChildren();

  drawMap();
}


// ========================================
// センサー許可
// ========================================

async function requestSensorPermission() {
  try {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const result =
        await DeviceMotionEvent.requestPermission();

      if (result !== "granted") {
        return false;
      }
    }

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const result =
        await DeviceOrientationEvent.requestPermission();

      if (result !== "granted") {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("センサー許可エラー:", error);
    return false;
  }
}


// ========================================
// 計測開始
// ========================================

async function startSensor() {
  if (state.running) return;

  const granted = await requestSensorPermission();

  if (!granted) {
    alert(
      "センサーが許可されませんでした。ブラウザの設定を確認してください。"
    );
    return;
  }

  resetTrial();

  state.startTime = performance.now();
  state.running = true;

  $("startButton").disabled = true;
  $("stopButton").disabled = false;

  window.addEventListener(
    "devicemotion",
    handleMotion,
    { passive: true }
  );

  window.addEventListener(
    "deviceorientation",
    handleOrientation,
    { passive: true }
  );
}


// ========================================
// 計測終了
// ========================================

function stopSensor() {
  if (!state.running) return;

  state.running = false;

  window.removeEventListener(
    "devicemotion",
    handleMotion
  );

  window.removeEventListener(
    "deviceorientation",
    handleOrientation
  );

  $("startButton").disabled = false;
  $("stopButton").disabled = true;
}


// ========================================
// 方位取得
// ========================================

function handleOrientation(event) {
  if (
    typeof event.alpha !== "number" ||
    !Number.isFinite(event.alpha)
  ) {
    return;
  }

  // 簡易的な方位値。
  // alphaが正確な北基準の方位とは限らない。
  state.heading = (360 - event.alpha + 360) % 360;
  state.hasHeading = true;

  $("heading").textContent =
    state.heading.toFixed(1) + "°";
}


// ========================================
// 重力込み加速度の大きさ
// ========================================

function getAccelerationMagnitude(event) {
  const acceleration = event.accelerationIncludingGravity;

  if (
    !acceleration ||
    typeof acceleration.x !== "number" ||
    typeof acceleration.y !== "number" ||
    typeof acceleration.z !== "number" ||
    !Number.isFinite(acceleration.x) ||
    !Number.isFinite(acceleration.y) ||
    !Number.isFinite(acceleration.z)
  ) {
    return null;
  }

  return Math.sqrt(
    acceleration.x * acceleration.x +
    acceleration.y * acceleration.y +
    acceleration.z * acceleration.z
  );
}


// ========================================
// 歩数検出：フィルタなし
// ========================================

function handleMotion(event) {
  if (!state.running) return;

  const now = performance.now();

  const magnitude = getAccelerationMagnitude(event);

  if (magnitude === null) return;

  // 生データをそのまま表示
  $("rawMagnitude").textContent =
    magnitude.toFixed(3);

  $("filteredMagnitude").textContent =
    magnitude.toFixed(3);

  $("threshold").textContent =
    CONFIG.stepThreshold.toFixed(1);

  // 方式Cの歩幅推定用にデータを保存
  addLimited(
    state.stepSamples,
    {
      time: now,
      magnitude: magnitude
    },
    CONFIG.maxStepSamples
  );

  // しきい値を下回ったら次の歩数を検出可能にする
  if (magnitude < CONFIG.resetThreshold) {
    state.stepReady = true;
  }

  // しきい値を超え、再検出可能なら歩数を数える
  if (
    magnitude > CONFIG.stepThreshold &&
    state.stepReady &&
    (
      state.lastStepTime === 0 ||
      now - state.lastStepTime >=
        CONFIG.minStepIntervalMs
    )
  ) {
    state.stepReady = false;

    const previousStepTime = state.lastStepTime;
    state.lastStepTime = now;

    registerStep(now, previousStepTime);
  }
}


// ========================================
// 方式C：動的歩幅の推定
// ========================================

function estimateDynamicStepLength(
  stepTime,
  previousStepTime
) {
  const startTime = previousStepTime > 0
    ? previousStepTime
    : stepTime - 500;

  const segment = state.stepSamples
    .filter(sample =>
      sample.time >= startTime &&
      sample.time <= stepTime
    )
    .map(sample => sample.magnitude);

  if (segment.length < 3) {
    return {
      amplitude: 0,
      stepLength: CONFIG.fixedStepLength
    };
  }

  const maxValue = Math.max(...segment);
  const minValue = Math.min(...segment);

  const amplitude = maxValue - minValue;

  // Weinberg型モデル：
  // 歩幅 = K × 加速度振幅^(1/4)
  const estimatedLength =
    CONFIG.K * Math.pow(
      Math.max(amplitude, 0.01),
      0.25
    );

  const stepLength = clamp(
    estimatedLength,
    CONFIG.minStepLength,
    CONFIG.maxStepLength
  );

  return {
    amplitude,
    stepLength
  };
}


// ========================================
// 歩数確定・位置更新
// ========================================

function registerStep(time, previousStepTime) {
  state.stepCount++;

  const result = estimateDynamicStepLength(
    time,
    previousStepTime
  );

  const stepLengthC = result.stepLength;
  const amplitude = result.amplitude;

  const radians =
    state.heading * Math.PI / 180;

  // 方式A：固定歩幅
  const dxA =
    CONFIG.fixedStepLength * Math.sin(radians);

  const dyA =
    CONFIG.fixedStepLength * Math.cos(radians);

  state.posA.x += dxA;
  state.posA.y += dyA;

  state.distanceA += CONFIG.fixedStepLength;

  // 方式C：動的歩幅
  const dxC =
    stepLengthC * Math.sin(radians);

  const dyC =
    stepLengthC * Math.cos(radians);

  state.posC.x += dxC;
  state.posC.y += dyC;

  state.distanceC += stepLengthC;

  const row = {
    elapsed: (time - state.startTime) / 1000,
    step: state.stepCount,
    amplitude,
    stepA: CONFIG.fixedStepLength,
    stepC: stepLengthC,
    distanceA: state.distanceA,
    distanceC: state.distanceC,
    xA: state.posA.x,
    yA: state.posA.y,
    xC: state.posC.x,
    yC: state.posC.y,
    heading: state.heading
  };

  state.rows.push(row);

  $("stepCount").textContent =
    String(state.stepCount);

  $("lastStep").textContent =
    `直近の方式C歩幅：${stepLengthC.toFixed(3)} m` +
    `（加速度振幅 ${amplitude.toFixed(3)} m/s²）`;

  const displacementA = Math.hypot(
    state.posA.x,
    state.posA.y
  );

  const displacementC = Math.hypot(
    state.posC.x,
    state.posC.y
  );

  $("position").textContent =
    `方式A：累積距離 ${state.distanceA.toFixed(2)} m` +
    `／終点変位 ${displacementA.toFixed(2)} m　｜　` +
    `方式C：累積距離 ${state.distanceC.toFixed(2)} m` +
    `／終点変位 ${displacementC.toFixed(2)} m`;

  addTableRow(row);
  drawMap();
}


// ========================================
// 表へ記録
// ========================================

function addTableRow(row) {
  const tr = document.createElement("tr");

  const values = [
    row.elapsed.toFixed(2),
    row.step,
    row.amplitude.toFixed(3),
    row.stepA.toFixed(3),
    row.stepC.toFixed(3),
    row.distanceA.toFixed(2),
    row.distanceC.toFixed(2),
    row.heading.toFixed(1)
  ];

  values.forEach(value => {
    const td = document.createElement("td");
    td.textContent = String(value);
    tr.appendChild(td);
  });

  $("stepTable").appendChild(tr);
}


// ========================================
// 歩行軌跡の描画
// ========================================

function drawMap() {
  const canvas = $("map");
  const ctx = canvas.getContext("2d");

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const points = [{ x: 0, y: 0 }];

  state.rows.forEach(row => {
    points.push(
      { x: row.xA, y: row.yA },
      { x: row.xC, y: row.yC }
    );
  });

  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);

  const minX = Math.min(-1, ...xs) - 1;
  const maxX = Math.max(1, ...xs) + 1;
  const minY = Math.min(-1, ...ys) - 1;
  const maxY = Math.max(1, ...ys) + 1;

  const scale = Math.min(
    (width - 80) / (maxX - minX),
    (height - 80) / (maxY - minY)
  );

  function toCanvas(point) {
    return {
      x: 40 + (point.x - minX) * scale,
      y: height - 40 - (point.y - minY) * scale
    };
  }

  // 背景グリッド
  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  function drawPath(xKey, yKey, color) {
    if (state.rows.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    state.rows.forEach((row, index) => {
      const point = toCanvas({
        x: row[xKey],
        y: row[yKey]
      });

      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.stroke();
  }

  drawPath("xA", "yA", "#1677d2");
  drawPath("xC", "yC", "#d62728");

  const origin = toCanvas({ x: 0, y: 0 });

  ctx.fillStyle = "#111111";
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1677d2";
  ctx.fillText("A: 固定歩幅", 12, 20);

  ctx.fillStyle = "#d62728";
  ctx.fillText("C: 動的歩幅", 12, 40);
}


// ========================================
// CSV保存
// ========================================

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function saveTrial() {
  const actualDistance =
    Number($("actualDistance").value);

  if (
    !Number.isFinite(actualDistance) ||
    actualDistance <= 0
  ) {
    alert(
      "実測距離を0より大きい数値で入力してください。"
    );
    return;
  }

  if (state.rows.length === 0) {
    alert(
      "保存できるデータがありません。先に計測してください。"
    );
    return;
  }

  const displacementA = Math.hypot(
    state.posA.x,
    state.posA.y
  );

  const displacementC = Math.hypot(
    state.posC.x,
    state.posC.y
  );

  const lines = [
    [
      "経過時間_s",
      "歩数",
      "加速度振幅_mps2",
      "方式A歩幅_m",
      "方式C歩幅_m",
      "方式A累積距離_m",
      "方式C累積距離_m",
      "方式A_X_m",
      "方式A_Y_m",
      "方式C_X_m",
      "方式C_Y_m",
      "方位_deg"
    ]
  ];

  state.rows.forEach(row => {
    lines.push([
      row.elapsed.toFixed(3),
      row.step,
      row.amplitude.toFixed(5),
      row.stepA.toFixed(4),
      row.stepC.toFixed(4),
      row.distanceA.toFixed(4),
      row.distanceC.toFixed(4),
      row.xA.toFixed(4),
      row.yA.toFixed(4),
      row.xC.toFixed(4),
      row.yC.toFixed(4),
      row.heading.toFixed(2)
    ]);
  });

  lines.push([]);

  lines.push([
    "集計項目",
    "方式A",
    "方式C",
    "実測距離"
  ]);

  lines.push([
    "累積歩行距離_m",
    state.distanceA.toFixed(4),
    state.distanceC.toFixed(4),
    actualDistance.toFixed(4)
  ]);

  lines.push([
    "終点変位_m",
    displacementA.toFixed(4),
    displacementC.toFixed(4),
    ""
  ]);

  lines.push([
    "累積距離の絶対誤差_m",
    Math.abs(state.distanceA - actualDistance).toFixed(4),
    Math.abs(state.distanceC - actualDistance).toFixed(4),
    ""
  ]);

  lines.push([
    "方式C係数_K",
    "",
    CONFIG.K,
    ""
  ]);

  lines.push([
    "歩数検出方式",
    "重力込み加速度・フィルタなし",
    "",
    ""
  ]);

  const csv =
    "\uFEFF" +
    lines.map(row =>
      row.map(csvEscape).join(",")
    ).join("\r\n");

  const blob = new Blob(
    [csv],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "pdr_trial.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ========================================
// ボタン設定
// ========================================

$("startButton").addEventListener(
  "click",
  startSensor
);

$("stopButton").addEventListener(
  "click",
  stopSensor
);

$("resetButton").addEventListener(
  "click",
  () => {
    stopSensor();
    resetTrial();
  }
);

$("saveButton").addEventListener(
  "click",
  saveTrial
);


// 初期表示
drawMap();

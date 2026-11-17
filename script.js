
"use strict";

// ========================================
// 1. 設定
// ========================================

const CONFIG = {
    // Weinberg法
    K: 0.49,
    minStepLength: 0.25,
    maxStepLength: 1.20,
    fallbackStepLength: 0.70,

    // 歩数検出（フィルタなし）
    stepThreshold: 10.8,
    resetThreshold: 10.4,
    minStepIntervalMs: 350,

    // 音声案内
    wallWarningDistance: 1.0,
    wallResetDistance: 1.4,
    arrivalDistance: 1.0,
    distanceAnnouncementInterval: 1.0,

    // 加速度データ保存
    maxStepSamples: 300
};

// ========================================
// 2. 地図設定（単位：m）
// ========================================

// スタート地点を (0,0) とする
// X：東方向がプラス
// Y：北方向がプラス

const WALLS = [
    { x1: -1.5, y1: 0, x2: -1.5, y2: 8 },
    { x1: -1.5, y1: 8, x2: 4, y2: 8 },

    { x1: 1.5, y1: 0, x2: 1.5, y2: 5 },
    { x1: 1.5, y1: 5, x2: 4, y2: 5 }
];

// 目的地
const TARGET = {
    x: 2,
    y: 2
};

// ========================================
// 3. 状態管理
// ========================================

const state = {
    running: false,
    startTime: 0,

    stepCount: 0,
    heading: 0,

    lastStepTime: 0,
    stepReady: true,

    samples: [],
    rows: [],

    x: 0,
    y: 0,

    totalDistance: 0,

    wallAlert: false,
    arrived: false,

    lastDistanceAnnouncement: null,

    speechQueue: [],
    speaking: false
};

const $ = id => document.getElementById(id);


// ========================================
// 4. 音声案内
// ========================================

function speakGuide(message) {

    if (!("speechSynthesis" in window)) {
        console.log("音声合成に対応していません");
        return;
    }

    state.speechQueue.push(message);

    playNextSpeech();
}

function playNextSpeech() {

    if (state.speaking) return;

    if (state.speechQueue.length === 0) return;

    const message = state.speechQueue.shift();

    const utterance =
        new SpeechSynthesisUtterance(message);

    utterance.lang = "ja-JP";
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    state.speaking = true;

    utterance.onend = function () {
        state.speaking = false;
        playNextSpeech();
    };

    utterance.onerror = function () {
        state.speaking = false;
        playNextSpeech();
    };

    window.speechSynthesis.speak(utterance);
}

function clearSpeech() {

    state.speechQueue = [];

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    state.speaking = false;
}


// ========================================
// 5. センサー許可
// ========================================

async function requestSensorPermission() {

    try {

        if (
            typeof DeviceMotionEvent !== "undefined" &&
            typeof DeviceMotionEvent.requestPermission === "function"
        ) {

            const result =
                await DeviceMotionEvent.requestPermission();

            if (result !== "granted") return false;
        }

        if (
            typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function"
        ) {

            const result =
                await DeviceOrientationEvent.requestPermission();

            if (result !== "granted") return false;
        }

        return true;

    } catch (error) {

        console.error(error);

        return false;
    }
}


// ========================================
// 6. 計測開始
// ========================================

async function startSensor() {

    if (state.running) return;

    const granted = await requestSensorPermission();

    if (!granted) {

        alert("センサーが許可されませんでした");

        return;
    }

    resetTrial(false);

    state.startTime = performance.now();

    state.running = true;

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

    $("startButton").disabled = true;
    $("stopButton").disabled = false;

    $("status").textContent = "計測中";

    speakGuide(
        "計測を開始します。周囲に注意して歩いてください。"
    );
}


// ========================================
// 7. 計測停止
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

    $("status").textContent = "計測停止";
}


// ========================================
// 8. リセット
// ========================================

function resetTrial(clearQueue = true) {

    if (clearQueue) {
        clearSpeech();
    }

    state.stepCount = 0;
    state.heading = 0;

    state.lastStepTime = 0;
    state.stepReady = true;

    state.samples = [];
    state.rows = [];

    state.x = 0;
    state.y = 0;

    state.totalDistance = 0;

    state.wallAlert = false;
    state.arrived = false;

    state.lastDistanceAnnouncement = null;

    $("heading").textContent = "未取得";
    $("magnitude").textContent = "--";
    $("stepCount").textContent = "0";
    $("lastStep").textContent = "--";

    $("posX").textContent = "0.00";
    $("posY").textContent = "0.00";

    $("targetDistance").textContent =
        Math.hypot(TARGET.x, TARGET.y).toFixed(2);

    $("wallDistance").textContent =
        nearestWallDistance(0, 0).toFixed(2);

    $("summary").textContent =
        "計測開始後に表示されます。";

    $("stepTable").replaceChildren();

    drawMap();
}


// ========================================
// 9. 方位取得
// ========================================

function handleOrientation(event) {

    let heading = null;

    // iPhone
    if (
        typeof event.webkitCompassHeading === "number" &&
        Number.isFinite(event.webkitCompassHeading)
    ) {

        heading = event.webkitCompassHeading;

    }

    // その他の端末
    else if (
        typeof event.alpha === "number" &&
        Number.isFinite(event.alpha)
    ) {

        heading =
            (360 - event.alpha + 360) % 360;
    }

    if (heading === null) return;

    state.heading = (heading + 360) % 360;

    $("heading").textContent =
        state.heading.toFixed(1) + "°";
}


// ========================================
// 10. 合成加速度
// ========================================

function getAccelerationMagnitude(event) {

    const acc = event.accelerationIncludingGravity;

    if (
        !acc ||
        !Number.isFinite(acc.x) ||
        !Number.isFinite(acc.y) ||
        !Number.isFinite(acc.z)
    ) {
        return null;
    }

    return Math.sqrt(
        acc.x * acc.x +
        acc.y * acc.y +
        acc.z * acc.z
    );
}


// ========================================
// 11. 歩数検出（フィルタなし）
// ========================================

function handleMotion(event) {

    if (!state.running) return;

    const now = performance.now();

    const magnitude =
        getAccelerationMagnitude(event);

    if (magnitude === null) return;

    $("magnitude").textContent =
        magnitude.toFixed(3);

    // 加速度データ保存
    state.samples.push({
        time: now,
        magnitude: magnitude
    });

    while (
        state.samples.length >
        CONFIG.maxStepSamples
    ) {
        state.samples.shift();
    }

    // 次の歩数を検出可能にする
    if (magnitude < CONFIG.resetThreshold) {
        state.stepReady = true;
    }

    // 歩数検出
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

        const previousStepTime =
            state.lastStepTime;

        state.lastStepTime = now;

        registerStep(now, previousStepTime);
    }
}


// ========================================
// 12. Weinberg法による歩幅推定
// ========================================

// L = K × A^(1/4)
// A = 最大加速度 - 最小加速度

function estimateStepLength(
    stepTime,
    previousStepTime
) {

    const startTime =
        previousStepTime > 0
            ? previousStepTime
            : stepTime - 500;

    const values = state.samples
        .filter(sample =>
            sample.time >= startTime &&
            sample.time <= stepTime
        )
        .map(sample => sample.magnitude);

    if (values.length < 3) {

        return {
            amplitude: 0,
            length: CONFIG.fallbackStepLength
        };
    }

    const maxValue = Math.max(...values);

    const minValue = Math.min(...values);

    const amplitude = maxValue - minValue;

    const rawLength =
        CONFIG.K *
        Math.pow(Math.max(amplitude, 0.01), 0.25);

    const length = Math.max(
        CONFIG.minStepLength,
        Math.min(CONFIG.maxStepLength, rawLength)
    );

    return {
        amplitude: amplitude,
        length: length
    };
}


// ========================================
// 13. 歩数確定・位置更新
// ========================================

function registerStep(time, previousTime) {

    state.stepCount++;

    const result =
        estimateStepLength(time, previousTime);

    const stepLength = result.length;

    const rad =
        state.heading * Math.PI / 180;

    // 北方向をYプラス、東方向をXプラス
    state.x += stepLength * Math.sin(rad);

    state.y += stepLength * Math.cos(rad);

    state.totalDistance += stepLength;

    // 距離計算
    const targetDistance = Math.hypot(
        TARGET.x - state.x,
        TARGET.y - state.y
    );

    const wallDistance =
        nearestWallDistance(state.x, state.y);

    // 画面更新
    $("stepCount").textContent =
        String(state.stepCount);

    $("lastStep").textContent =
        stepLength.toFixed(3) + " m";

    $("posX").textContent =
        state.x.toFixed(2);

    $("posY").textContent =
        state.y.toFixed(2);

    $("targetDistance").textContent =
        targetDistance.toFixed(2);

    $("wallDistance").textContent =
        wallDistance.toFixed(2);

    // CSV用データ
    const row = {

        step: state.stepCount,

        time: (time - state.startTime) / 1000,

        amplitude: result.amplitude,

        length: stepLength,

        total: state.totalDistance,

        x: state.x,

        y: state.y,

        heading: state.heading
    };

    state.rows.push(row);

    addTableRow(row);

    // 音声案内
    checkWall(wallDistance);

    checkDestination(targetDistance);

    // 地図更新
    drawMap();
}


// ========================================
// 14. 壁までの距離
// ========================================

function distanceToSegment(
    px, py,
    x1, y1,
    x2, y2
) {

    const dx = x2 - x1;
    const dy = y2 - y1;

    const denominator =
        dx * dx + dy * dy;

    if (denominator === 0) {

        return Math.hypot(
            px - x1,
            py - y1
        );
    }

    let t =
        (
            (px - x1) * dx +
            (py - y1) * dy
        ) / denominator;

    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;

    const nearestY = y1 + t * dy;

    return Math.hypot(
        px - nearestX,
        py - nearestY
    );
}


function nearestWallDistance(x, y) {

    let minimum = Infinity;

    for (const wall of WALLS) {

        const distance = distanceToSegment(
            x, y,
            wall.x1, wall.y1,
            wall.x2, wall.y2
        );

        minimum = Math.min(minimum, distance);
    }

    return minimum;
}


// ========================================
// 15. 壁への接近音声
// ========================================

function checkWall(distance) {

    if (
        distance <= CONFIG.wallWarningDistance &&
        !state.wallAlert
    ) {

        speakGuide(
            "壁に近づいています。注意してください。"
        );

        state.wallAlert = true;
    }

    // 壁から離れたら再通知可能
    else if (
        distance >= CONFIG.wallResetDistance
    ) {

        state.wallAlert = false;
    }
}


// ========================================
// 16. 目的地までの距離・到着
// ========================================

function checkDestination(distance) {

    // 到着判定
    if (distance <= CONFIG.arrivalDistance) {

        if (!state.arrived) {

            speakGuide(
                "目的地に到着しました。"
            );

            state.arrived = true;

            $("status").textContent =
                "目的地に到着しました";
        }

        return;
    }

    if (state.arrived) return;

    // 距離案内
    const interval =
        CONFIG.distanceAnnouncementInterval;

    const nextDistance =
        Math.ceil(distance / interval) * interval;

    if (
        state.lastDistanceAnnouncement === null ||
        nextDistance < state.lastDistanceAnnouncement
    ) {

        state.lastDistanceAnnouncement =
            nextDistance;

        speakGuide(
            "目的地まで、あと約" +
            nextDistance +
            "メートルです。"
        );
    }
}


// ========================================
// 17. 歩行データの表
// ========================================

function addTableRow(row) {

    const tr = document.createElement("tr");

    const values = [

        row.step,

        row.time.toFixed(2),

        row.amplitude.toFixed(3),

        row.length.toFixed(3),

        row.total.toFixed(2),

        row.x.toFixed(2),

        row.y.toFixed(2),

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
// 18. 地図描画
// ========================================

function drawMap() {

    const canvas = $("map");

    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    const padding = 55;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "white";

    ctx.fillRect(0, 0, width, height);

    // 表示範囲
    const xs = [
        0, TARGET.x, state.x,
        ...WALLS.flatMap(w => [w.x1, w.x2]),
        ...state.rows.map(r => r.x)
    ];

    const ys = [
        0, TARGET.y, state.y,
        ...WALLS.flatMap(w => [w.y1, w.y2]),
        ...state.rows.map(r => r.y)
    ];

    const minX = Math.min(...xs) - 1;
    const maxX = Math.max(...xs) + 1;

    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 1;

    const scale = Math.min(
        (width - padding * 2) / (maxX - minX),
        (height - padding * 2) / (maxY - minY)
    );

    function toCanvas(x, y) {

        return {

            x: padding + (x - minX) * scale,

            y: height - padding - (y - minY) * scale
        };
    }

    // グリッド
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

    // 壁
    ctx.strokeStyle = "black";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";

    WALLS.forEach(wall => {

        const a = toCanvas(wall.x1, wall.y1);
        const b = toCanvas(wall.x2, wall.y2);

        ctx.beginPath();

        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        ctx.stroke();
    });

    // 歩行軌跡
    if (state.rows.length > 0) {

        ctx.strokeStyle = "#d62728";
        ctx.lineWidth = 3;

        ctx.beginPath();

        const start = toCanvas(0, 0);

        ctx.moveTo(start.x, start.y);

        state.rows.forEach(row => {

            const point =
                toCanvas(row.x, row.y);

            ctx.lineTo(point.x, point.y);
        });

        ctx.stroke();
    }

    // マーカー
    function drawPoint(x, y, color, label) {

        const p = toCanvas(x, y);

        ctx.fillStyle = color;

        ctx.beginPath();

        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);

        ctx.fill();

        ctx.fillStyle = "black";

        ctx.fillText(
            label,
            p.x + 10,
            p.y - 8
        );
    }

    drawPoint(0, 0, "green", "START");

    drawPoint(
        TARGET.x,
        TARGET.y,
        "blue",
        "GOAL"
    );

    drawPoint(
        state.x,
        state.y,
        "red",
        "NOW"
    );
}


// ========================================
// 19. CSV保存
// ========================================

function csvEscape(value) {

    const text = String(value ?? "");

    if (/[",\r\n]/.test(text)) {

        return '"' +
            text.replace(/"/g, '""') +
            '"';
    }

    return text;
}


function saveTrial() {

    if (state.rows.length === 0) {

        alert("保存できるデータがありません。");

        return;
    }

    const actual =
        Number($("actualDistance").value);

    const lines = [

        [
            "歩数",
            "経過時間_s",
            "加速度振幅_mps2",
            "推定歩幅_m",
            "累積距離_m",
            "X_m",
            "Y_m",
            "方位_deg"
        ]
    ];

    state.rows.forEach(row => {

        lines.push([

            row.step,

            row.time.toFixed(3),

            row.amplitude.toFixed(5),

            row.length.toFixed(4),

            row.total.toFixed(4),

            row.x.toFixed(4),

            row.y.toFixed(4),

            row.heading.toFixed(2)
        ]);
    });

    lines.push([]);

    lines.push([
        "歩幅推定方式",
        "Weinberg型"
    ]);

    lines.push([
        "係数K",
        CONFIG.K
    ]);

    lines.push([
        "推定累積距離_m",
        state.totalDistance.toFixed(4)
    ]);

    if (Number.isFinite(actual) && actual > 0) {

        lines.push([
            "実測距離_m",
            actual.toFixed(4)
        ]);

        lines.push([
            "絶対誤差_m",
            Math.abs(
                state.totalDistance - actual
            ).toFixed(4)
        ]);
    }

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

    link.download = "pdr_navigation_trial.csv";

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}


// ========================================
// 20. ボタン設定
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

        resetTrial(true);

        $("status").textContent =
            "リセットしました";
    }
);

$("saveButton").addEventListener(
    "click",
    saveTrial
);


// ========================================
// 21. 初期表示
// ========================================

$("targetDistance").textContent =
    Math.hypot(TARGET.x, TARGET.y).toFixed(2);

$("wallDistance").textContent =
    nearestWallDistance(0, 0).toFixed(2);

drawMap();


// ============================================
// PDRセンサーテスト
// 方式A：歩数 × 歩幅
// 方式B：加速度の二重積分
// 距離：sqrt(X^2 + Y^2)
// ============================================

// ---------- 設定 ----------
let stepLength = 0.7; // 方式Aの歩幅（m）
let threshold = 10.8; // 歩数検出用の加速度閾値
let resetThreshold = 10.4;
let stepInterval = 350; // 歩数検出の最小間隔（ms）

// ---------- 方位 ----------
let currentHeading = 0;

// ---------- 方式Aの位置 ----------
let posX = 0;
let posY = 0;

// ---------- 方式Bの位置・速度 ----------
let velocityX = 0;
let velocityY = 0;
let integralX = 0;
let integralY = 0;
let lastMotionTime = null;

// ---------- 歩数検出 ----------
let stepCount = 0;
let lastStepTime = 0;
let canDetectStep = true;
let magnitudeHistory = [];
let maxAcceleration = 0;
let minAcceleration = Infinity;

// ---------- 実験データ ----------
let trialData = [];
let stepData = [];
let testStarted = false;
let startTime = null;

// ---------- HTML要素 ----------
const startButton = document.getElementById("startButton");
const stepDisplay = document.getElementById("stepCount");
const headingDisplay = document.getElementById("heading");
const accelerationDisplay = document.getElementById("acceleration");
const positionDisplay = document.getElementById("position");
const mapCanvas = document.getElementById("map");
const ctx = mapCanvas ? mapCanvas.getContext("2d") : null;

// ---------- センサー開始 ----------
if (startButton) {
    startButton.addEventListener("click", startSensor);
}

async function startSensor() {
    // iPhoneのSafariではセンサー利用の許可が必要な場合がある
    if (
        typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function"
    ) {
        try {
            const permission = await DeviceMotionEvent.requestPermission();

            if (permission !== "granted") {
                alert("モーションセンサーの利用が許可されませんでした。");
                return;
            }
        } catch (error) {
            alert("センサーの許可を取得できませんでした。");
            console.error(error);
            return;
        }
    }

    resetTrial();

    window.addEventListener("devicemotion", handleMotion);
    window.addEventListener("deviceorientation", handleOrientation);

    testStarted = true;
    startTime = performance.now();

    if (startButton) {
        startButton.textContent = "センサーテスト中";
        startButton.disabled = true;
    }

    updateDisplay();
    drawMap();

    alert(
        "計測を開始しました。\n" +
        "スマートフォンの持ち方をなるべく一定にして歩いてください。"
    );
}

// ---------- 計測リセット ----------
function resetTrial() {
    posX = 0;
    posY = 0;

    velocityX = 0;
    velocityY = 0;
    integralX = 0;
    integralY = 0;
    lastMotionTime = null;

    stepCount = 0;
    lastStepTime = 0;
    canDetectStep = true;
    magnitudeHistory = [];

    maxAcceleration = 0;
    minAcceleration = Infinity;

    trialData = [];
    stepData = [];

    startTime = performance.now();
}

// ---------- 方位取得 ----------
function handleOrientation(event) {
    if (typeof event.webkitCompassHeading === "number") {
        // iPhone Safariのコンパス方位
        currentHeading = event.webkitCompassHeading;
    } else if (typeof event.alpha === "number") {
        // alphaはコンパス方位と同じ定義とは限らない
        currentHeading = (360 - event.alpha) % 360;
    }

    if (headingDisplay) {
        headingDisplay.textContent =
            currentHeading.toFixed(1) + "°";
    }
}

// ---------- 加速度・歩数処理 ----------
function handleMotion(event) {
    if (!testStarted) return;

    const now = performance.now();

    // 方式Aの歩数検出には重力込み加速度を使用
    const acc = event.accelerationIncludingGravity;

    if (acc && acc.x !== null && acc.y !== null && acc.z !== null) {
        const magnitude = Math.sqrt(
            acc.x * acc.x +
            acc.y * acc.y +
            acc.z * acc.z
        );

        magnitudeHistory.push(magnitude);

        if (magnitudeHistory.length > 5) {
            magnitudeHistory.shift();
        }

        const averageMagnitude =
            magnitudeHistory.reduce((sum, value) => sum + value, 0) /
            magnitudeHistory.length;

        maxAcceleration = Math.max(maxAcceleration, magnitude);
        minAcceleration = Math.min(minAcceleration, magnitude);

        if (accelerationDisplay) {
            accelerationDisplay.textContent =
                magnitude.toFixed(2) + " m/s²";
        }

        // 歩数検出
        if (
            averageMagnitude > threshold &&
            canDetectStep &&
            now - lastStepTime > stepInterval
        ) {
            stepCount++;
            lastStepTime = now;
            canDetectStep = false;

            // 方式A：歩数と方位から位置を更新
            // 0°を北、90°を東としている
            const rad = currentHeading * Math.PI / 180;

            posX += stepLength * Math.sin(rad);
            posY += stepLength * Math.cos(rad);

            recordStep(now);
        }

        if (averageMagnitude < resetThreshold) {
            canDetectStep = true;
        }
    }

    // 方式B：重力除去済み加速度を二重積分
    // 注意：端末のx/y軸をそのまま地面の水平軸とみなす簡易方式
    const linearAcc = event.acceleration;

    if (
        linearAcc &&
        linearAcc.x !== null &&
        linearAcc.y !== null &&
        linearAcc.z !== null
    ) {
        if (lastMotionTime !== null) {
            const dt = (now - lastMotionTime) / 1000;

            // センサー間隔が異常に空いた場合は積分しない
            if (dt > 0 && dt < 0.1) {
                // 小さなノイズをゼロにする簡易処理
                let ax = linearAcc.x;
                let ay = linearAcc.y;

                if (Math.abs(ax) < 0.15) ax = 0;
                if (Math.abs(ay) < 0.15) ay = 0;

                // 端末の水平軸を世界座標に変換する簡易計算
                const rad = currentHeading * Math.PI / 180;

                const worldAccX =
                    ax * Math.cos(rad) + ay * Math.sin(rad);

                const worldAccY =
                    -ax * Math.sin(rad) + ay * Math.cos(rad);

                // 加速度 → 速度 → 位置
                velocityX += worldAccX * dt;
                velocityY += worldAccY * dt;

                integralX += velocityX * dt;
                integralY += velocityY * dt;
            }
        }

        lastMotionTime = now;
    } else {
        // 重力除去済み加速度が取得できない場合は積分を進めない
        lastMotionTime = null;
    }

    // データ保存
    const elapsed = startTime
        ? (now - startTime) / 1000
        : 0;

    const distanceA = Math.sqrt(posX * posX + posY * posY);
    const distanceB = Math.sqrt(
        integralX * integralX + integralY * integralY
    );

    const row = {
        elapsed: elapsed,
        stepCount: stepCount,
        heading: currentHeading,

        posX: posX,
        posY: posY,
        distanceA: distanceA,

        integralX: integralX,
        integralY: integralY,
        distanceB: distanceB,

        acceleration: acc
            ? Math.sqrt(
                acc.x * acc.x +
                acc.y * acc.y +
                acc.z * acc.z
            )
            : 0
    };

    trialData.push(row);

    updateDisplay();
    drawMap();
}

// ---------- 歩数ごとのデータ ----------
function recordStep(now) {
    const previous = stepData.length
        ? stepData[stepData.length - 1].time
        : startTime;

    const interval = (now - previous) / 1000;

    stepData.push({
        time: now,
        step: stepCount,
        interval: interval,
        heading: currentHeading,
        posX: posX,
        posY: posY,
        distanceA: Math.sqrt(posX * posX + posY * posY),
        integralX: integralX,
        integralY: integralY,
        distanceB: Math.sqrt(
            integralX * integralX + integralY * integralY
        )
    });
}

// ---------- 画面更新 ----------
function updateDisplay() {
    if (stepDisplay) {
        stepDisplay.textContent = stepCount;
    }

    if (positionDisplay) {
        const distanceA = Math.sqrt(posX * posX + posY * posY);
        const distanceB = Math.sqrt(
            integralX * integralX + integralY * integralY
        );

        positionDisplay.textContent =
            "方式A: X=" + posX.toFixed(2) +
            " m, Y=" + posY.toFixed(2) +
            " m, 距離=" + distanceA.toFixed(2) + " m\n" +
            "方式B: X=" + integralX.toFixed(2) +
            " m, Y=" + integralY.toFixed(2) +
            " m, 距離=" + distanceB.toFixed(2) + " m";
    }
}

// ---------- ルート描画 ----------
function drawMap() {
    if (!ctx || !mapCanvas) return;

    const width = mapCanvas.width;
    const height = mapCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // 原点をキャンバス中央に配置
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 30; // 1 mを30ピクセルで表示

    // 原点
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();

    // 方式Aの現在位置
    ctx.fillStyle = "#1677ff";
    ctx.beginPath();
    ctx.arc(
        centerX + posX * scale,
        centerY - posY * scale,
        5,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // 方式Bの現在位置
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.arc(
        centerX + integralX * scale,
        centerY - integralY * scale,
        5,
        0,
        Math.PI * 2
    );
    ctx.fill();

    // 凡例
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#1677ff";
    ctx.fillText("方式A", 10, 20);

    ctx.fillStyle = "#e53935";
    ctx.fillText("方式B", 10, 38);
}

// ---------- CSV保存 ----------
function saveTrial() {
    if (trialData.length === 0) {
        alert("保存できるデータがありません。先に計測してください。");
        return;
    }

    const actualDistanceInput = document.getElementById("actualDistance");
    const actualDistance = actualDistanceInput
        ? Number(actualDistanceInput.value)
        : NaN;

    if (!Number.isFinite(actualDistance) || actualDistance <= 0) {
        alert("実測距離をm単位で入力してください。例：10");
        return;
    }

    const finalData = trialData[trialData.length - 1];

    // 最終位置の距離：sqrt(X² + Y²)
    const finalDistanceA = Math.sqrt(
        finalData.posX * finalData.posX +
        finalData.posY * finalData.posY
    );

    const finalDistanceB = Math.sqrt(
        finalData.integralX * finalData.integralX +
        finalData.integralY * finalData.integralY
    );

    // 推定した最終位置の距離と実測距離の差
    const errorA = finalDistanceA - actualDistance;
    const errorB = finalDistanceB - actualDistance;

    // 距離誤差の二乗
    const squaredErrorA = errorA * errorA;
    const squaredErrorB = errorB * errorB;

    const header = [
        "経過時間(s)",
        "歩数",
        "方位(deg)",
        "方式A_X(m)",
        "方式A_Y(m)",
        "方式A_距離sqrt(X^2+Y^2)(m)",
        "方式B_X(m)",
        "方式B_Y(m)",
        "方式B_距離sqrt(X^2+Y^2)(m)",
        "加速度の大きさ(m/s^2)",
        "実測距離(m)"
    ];

    const rows = trialData.map(item => [
        item.elapsed.toFixed(3),
        item.stepCount,
        item.heading.toFixed(2),
        item.posX.toFixed(4),
        item.posY.toFixed(4),
        item.distanceA.toFixed(4),
        item.integralX.toFixed(4),
        item.integralY.toFixed(4),
        item.distanceB.toFixed(4),
        item.acceleration.toFixed(4),
        actualDistance.toFixed(2)
    ]);

    // 最後に比較結果の行を追加
    rows.push([]);
    rows.push(["最終比較"]);
    rows.push(["実測距離(m)", actualDistance.toFixed(4)]);
    rows.push(["方式A_最終X(m)", finalData.posX.toFixed(4)]);
    rows.push(["方式A_最終Y(m)", finalData.posY.toFixed(4)]);
    rows.push(["方式A_最終距離(m)", finalDistanceA.toFixed(4)]);
    rows.push(["方式A_距離誤差(m)", errorA.toFixed(4)]);
    rows.push(["方式A_距離誤差の二乗(m^2)", squaredErrorA.toFixed(4)]);
    rows.push(["方式B_最終X(m)", finalData.integralX.toFixed(4)]);
    rows.push(["方式B_最終Y(m)", finalData.integralY.toFixed(4)]);
    rows.push(["方式B_最終距離(m)", finalDistanceB.toFixed(4)]);
    rows.push(["方式B_距離誤差(m)", errorB.toFixed(4)]);
    rows.push(["方式B_距離誤差の二乗(m^2)", squaredErrorB.toFixed(4)]);

    const csv = [header, ...rows]
        .map(row => row.map(value => {
            const text = value === undefined ? "" : String(value);
            return '"' + text.replace(/"/g, '""') + '"';
        }).join(","))
        .join("\r\n");

    // Excelで日本語が文字化けしにくいようBOMを付ける
    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "pdr_comparison.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    alert(
        "CSVを保存しました。\n\n" +
        "方式Aの最終位置距離: " + finalDistanceA.toFixed(2) + " m\n" +
        "方式Bの最終位置距離: " + finalDistanceB.toFixed(2) + " m\n" +
        "実測距離: " + actualDistance.toFixed(2) + " m"
    );
}

// ---------- 計測終了 ----------
function stopSensor() {
    testStarted = false;

    window.removeEventListener("devicemotion", handleMotion);
    window.removeEventListener("deviceorientation", handleOrientation);

    if (startButton) {
        startButton.disabled = false;
        startButton.textContent = "センサーテスト開始";
    }
}

// HTMLのボタンから呼び出せるようにする
window.saveTrial = saveTrial;
window.stopSensor = stopSensor;


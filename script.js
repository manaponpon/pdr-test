let canvas;
let ctx;

let drawX = 400;
let drawY = 600;

const SCALE = 50;
let stepLength = 0.7;     // 歩幅(m)
let currentHeading = 0;   // 現在の向き
let posX = 0;
let posY = 0;
let targetX = 2;
let targetY = 2;
let stepCount = 0;
let lastStepTime = 0;
let isPeak = false;

let magnitudeHistory = [];

// 歩幅推定用データ
let stepStartTime = 0;
let stepMaxMagnitude = 0;
let stepMinMagnitude = 999;

function requestPermission() {

    if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
    ) {

        DeviceOrientationEvent.requestPermission()
        .then(response => {

            if (response === "granted") {
                startSensor();
            } else {
                alert("センサが許可されませんでした");
            }

        })
        .catch(error => {
            console.error(error);
            alert("センサの許可でエラーが発生しました");
        });

    } else {
        startSensor();
    }
}

function startSensor() {

    // Canvasを取得
    canvas = document.getElementById("map");
    ctx = canvas.getContext("2d");

    // Canvasを白で初期化
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 壁を描く
    // 壁を描く
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;

    ctx.beginPath();

    // 左側の壁
    ctx.moveTo(325, 600);
    ctx.lineTo(325, 200);
    ctx.lineTo(600, 200);

    // 右側の壁
    ctx.moveTo(475, 600);
    ctx.lineTo(475, 350);
    ctx.lineTo(600, 350);

    ctx.stroke();

    // 目的地を描く
    const targetDrawX = 400 + targetX * SCALE;
    const targetDrawY = 400 - targetY * SCALE;

    ctx.fillStyle = "blue";

    ctx.beginPath();
    ctx.arc(targetDrawX, targetDrawY, 7, 0, Math.PI * 2);
    ctx.fill();

    // 現在位置（スタート地点）
    ctx.fillStyle = "red";

    ctx.beginPath();
    ctx.arc(400, 600, 5, 0, Math.PI * 2);
    ctx.fill();

    // センサ開始
    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    alert("センサ開始しました");
}

// 向き
function handleOrientation(event) {

    // iPhone用
    let heading = event.webkitCompassHeading;

    // Androidなど
    if (heading === undefined || heading === null) {
        heading = event.alpha;
    }

    if (heading === null || heading === undefined) return;

    currentHeading = heading;

    document.getElementById("heading").innerText =
        "現在の向き : " + Math.round(currentHeading) + "°";
}

// 加速度・歩数判定
function handleMotion(event) {
    
    const acc = event.accelerationIncludingGravity;

    const x = acc.x;
    const y = acc.y;
    const z = acc.z;

    document.getElementById("accX").innerText = x.toFixed(2);
    document.getElementById("accY").innerText = y.toFixed(2);

    document.getElementById("accZ").innerText = z.toFixed(2);

    // 合成加速度
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    magnitudeHistory.push(magnitude);

    if (magnitudeHistory.length > 5) {
        magnitudeHistory.shift();
    }
    const averageMagnitude =
    magnitudeHistory.reduce((a, b) => a + b, 0)
    / magnitudeHistory.length;

// 1歩ごとの加速度の最大・最小を記録
if (averageMagnitude > stepMaxMagnitude) {
    stepMaxMagnitude = averageMagnitude;
}

if (averageMagnitude < stepMinMagnitude) {
    stepMinMagnitude = averageMagnitude;
}

    document.getElementById("magnitude").innerText =
        averageMagnitude.toFixed(2);

    const now = Date.now();

    // ピーク検出
    if (averageMagnitude > 10.8 && !isPeak && (now - lastStepTime) > 350) {

        stepCount++;
            // 1歩にかかった時間
    let stepTime = 0;

    if (stepStartTime !== 0) {
        stepTime = (now - stepStartTime) / 1000;
    }

    stepStartTime = now;

    // 加速度の変化量
    const accelerationRange =
        stepMaxMagnitude - stepMinMagnitude;

    console.log(
        "歩数:", stepCount,
        "歩行時間:", stepTime.toFixed(3), "秒",
        "最大加速度:", stepMaxMagnitude.toFixed(2),
        "最小加速度:", stepMinMagnitude.toFixed(2),
        "加速度変化量:", accelerationRange.toFixed(2)
    );

    // 次の1歩の記録を開始
    stepMaxMagnitude = averageMagnitude;
    stepMinMagnitude = averageMagnitude;
        const rad = currentHeading * Math.PI / 180;

        posX += stepLength * Math.sin(rad);
        posY += stepLength * Math.cos(rad);
        const oldX = drawX;
        const oldY = drawY;

        drawX = 400 + posX * SCALE;
        drawY = 600 - posY * SCALE;

        ctx.beginPath();
        ctx.moveTo(oldX, oldY);
        ctx.lineTo(drawX, drawY);
        ctx.stroke();

        ctx.fillStyle = "red";

        ctx.beginPath();
        ctx.arc(drawX, drawY, 4, 0, Math.PI * 2);
        ctx.fill();

        document.getElementById("posX").innerText =
        posX.toFixed(2);

        document.getElementById("posY").innerText =
        posY.toFixed(2);

        lastStepTime = now;
        isPeak = true;

        document.getElementById("step").innerText = stepCount;
    }

    // ピーク解除
    if (averageMagnitude < 10.4) {
    isPeak = false;
    }

}

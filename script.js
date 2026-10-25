
let canvas;
let ctx;

let drawX = 400;
let drawY = 600;

const SCALE = 50;
let stepLength = 0.7;
let currentHeading = 0;
let posX = 0;
let posY = 0;
let targetX = 2;
let targetY = 2;
let stepCount = 0;
let lastStepTime = 0;
let isPeak = false;

let magnitudeHistory = [];

// 歩行データ
let stepStartTime = 0;
let stepMaxMagnitude = 0;
let stepMinMagnitude = 999;

// 保存用データ配列
let trialData = [];

// センサーの二重登録を防ぐ
let sensorStarted = false;


// センサーの許可
function requestPermission() {
    if (sensorStarted) {
        alert("センサはすでに開始されています");
        return;
    }

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


// センサー開始
function startSensor() {
    if (sensorStarted) return;

    canvas = document.getElementById("map");
    ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 壁を描く
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.beginPath();

    ctx.moveTo(325, 600);
    ctx.lineTo(325, 200);
    ctx.lineTo(600, 200);

    ctx.moveTo(475, 600);
    ctx.lineTo(475, 350);
    ctx.lineTo(600, 350);

    ctx.stroke();

    // 目的地
    const targetDrawX = 400 + targetX * SCALE;
    const targetDrawY = 400 - targetY * SCALE;

    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.arc(targetDrawX, targetDrawY, 7, 0, Math.PI * 2);
    ctx.fill();

    // スタート地点
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(400, 600, 5, 0, Math.PI * 2);
    ctx.fill();

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    sensorStarted = true;
    alert("センサ開始しました");
}


// 向きの取得
function handleOrientation(event) {
    let heading = event.webkitCompassHeading;

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

    if (!acc || acc.x == null || acc.y == null || acc.z == null) {
        return;
    }

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
        magnitudeHistory.reduce((a, b) => a + b, 0) /
        magnitudeHistory.length;

    document.getElementById("magnitude").innerText =
        averageMagnitude.toFixed(2);

    // 1歩ごとの最大・最小加速度
    if (averageMagnitude > stepMaxMagnitude) {
        stepMaxMagnitude = averageMagnitude;
    }

    if (averageMagnitude < stepMinMagnitude) {
        stepMinMagnitude = averageMagnitude;
    }

    const now = Date.now();

    // ピーク検出
    if (
        averageMagnitude > 10.8 &&
        !isPeak &&
        (now - lastStepTime) > 350
    ) {
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

        // 歩行周波数
        const gaitFrequency =
            stepTime > 0 ? 1 / stepTime : 0;

        // 向きに基づいて位置を更新
        const rad = currentHeading * Math.PI / 180;

        posX += stepLength * Math.sin(rad);
        posY += stepLength * Math.cos(rad);

        const oldX = drawX;
        const oldY = drawY;

        drawX = 400 + posX * SCALE;
        drawY = 600 - posY * SCALE;

        // 軌跡を描く
        ctx.beginPath();
        ctx.moveTo(oldX, oldY);
        ctx.lineTo(drawX, drawY);
        ctx.stroke();

        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(drawX, drawY, 4, 0, Math.PI * 2);
        ctx.fill();

        // 画面の現在位置を更新
        document.getElementById("posX").innerText =
            posX.toFixed(2);

        document.getElementById("posY").innerText =
            posY.toFixed(2);

        document.getElementById("step").innerText = stepCount;

        // 1歩分のデータを保存用配列に追加
        const stepData = {
            step: stepCount,
            stepTime: stepTime,
            gaitFrequency: gaitFrequency,
            maxAcceleration: stepMaxMagnitude,
            minAcceleration: stepMinMagnitude,
            accelerationRange: accelerationRange,
            heading: currentHeading,
            posX: posX,
            posY: posY
        };

        trialData.push(stepData);

        // 画面の表に追加
        const table = document.getElementById("stepTable");
        const row = table.insertRow();

        row.insertCell(0).innerText = stepCount;
        row.insertCell(1).innerText =
            stepTime > 0 ? stepTime.toFixed(2) : "-";
        row.insertCell(2).innerText =
            stepTime > 0 ? gaitFrequency.toFixed(2) : "-";
        row.insertCell(3).innerText =
            stepMaxMagnitude.toFixed(2);
        row.insertCell(4).innerText =
            stepMinMagnitude.toFixed(2);
        row.insertCell(5).innerText =
            accelerationRange.toFixed(2);

        console.log("歩行データ:", stepData);

        // 次の1歩の記録を開始
        stepMaxMagnitude = averageMagnitude;
        stepMinMagnitude = averageMagnitude;

        lastStepTime = now;
        isPeak = true;
    }

    // ピーク解除
    if (averageMagnitude < 10.4) {
        isPeak = false;
    }
}


// CSVファイルとして保存
function saveTrial() {
    const actualDistance = parseFloat(
        document.getElementById("actualDistance").value
    );

    if (trialData.length < 10) {
        alert("10歩以上のデータを取得してから保存してください");
        return;
    }

    if (!Number.isFinite(actualDistance) || actualDistance <= 0) {
        alert("実際に歩いた距離を正しく入力してください");
        return;
    }

    // CSVの項目名
    const headers = [
        "歩数",
        "歩行周期(s)",
        "周波数(Hz)",
        "最大加速度",
        "最小加速度",
        "加速度変化量",
        "向き(deg)",
        "推定位置X(m)",
        "推定位置Y(m)",
        "実距離(m)"
    ];

    // 各歩のデータをCSVの行に変換
    const rows = trialData.map(data => [
        data.step,
        data.stepTime.toFixed(3),
        data.stepTime > 0
            ? data.gaitFrequency.toFixed(3)
            : "",
        data.maxAcceleration.toFixed(3),
        data.minAcceleration.toFixed(3),
        data.accelerationRange.toFixed(3),
        data.heading.toFixed(2),
        data.posX.toFixed(3),
        data.posY.toFixed(3),
        actualDistance
    ]);

    // CSV形式に変換
    const csv = [headers, ...rows]
        .map(row => row.join(","))
        .join("\r\n");

    // Excelで開きやすいUTF-8形式
    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    // 保存するファイル名
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

    link.href = url;
    link.download = "pdr_trial_" + timestamp + ".csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    alert(
        "CSV保存処理を実行しました。\n" +
        "記録歩数：" + trialData.length + "歩\n" +
        "実距離：" + actualDistance.toFixed(2) + " m"
    );
}

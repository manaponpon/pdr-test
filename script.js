let stepLength = 0.7;     // 歩幅(m)
let currentHeading = 0;   // 現在の向き
let posX = 0;
let posY = 0;
let stepCount = 0;
let lastStepTime = 0;
let isPeak = false;

let magnitudeHistory = [];

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
        .catch(console.error);

    } else {
        startSensor();
    }
}

function startSensor() {

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    alert("センサ開始しました");
}

// 向き
function handleOrientation(event) {

    currentHeading = event.alpha;

    document.getElementById("heading").innerText =
    Math.round(currentHeading) + "°";

    document.getElementById("heading").innerText =
        Math.round(heading) + "°";
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

    document.getElementById("magnitude").innerText =
        averageMagnitude.toFixed(2);

    const now = Date.now();

    // ピーク検出
    if (averageMagnitude > 10.8 && !isPeak && (now - lastStepTime) > 350) {

        stepCount++;
        const rad = currentHeading * Math.PI / 180;

        posX += stepLength * Math.cos(rad);

        posY += stepLength * Math.sin(rad);

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
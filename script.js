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

    let heading = event.alpha;

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
    if (averageMagnitude > 11.5 && !isPeak && (now - lastStepTime) > 350) {

        stepCount++;
        lastStepTime = now;
        isPeak = true;

        document.getElementById("step").innerText = stepCount;
    }

    // ピーク解除
    if (averageMagnitude < 10.5) {
    isPeak = false;
    }

}
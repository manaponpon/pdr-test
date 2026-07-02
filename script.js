function requestPermission() {

    // iPhone用
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
        // AndroidやPC
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

// 加速度
function handleMotion(event) {

    const acc = event.accelerationIncludingGravity;

    document.getElementById("accX").innerText =
        acc.x.toFixed(2);

    document.getElementById("accY").innerText =
        acc.y.toFixed(2);

    document.getElementById("accZ").innerText =
        acc.z.toFixed(2);
}
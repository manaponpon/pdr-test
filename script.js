let startHeading = null;

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
                alert("センサの使用が許可されませんでした");
            }

        })
        .catch(console.error);

    } else {
        startSensor();
    }
}

function startSensor() {

    window.addEventListener("deviceorientation", handleOrientation, true);

    alert("センサ開始しました");
}

function handleOrientation(event) {

    // iPhone用
    let heading = event.webkitCompassHeading;

    // 他ブラウザ用
    if (heading === undefined || heading === null) {
        heading = event.alpha;
    }

    if (heading === null || heading === undefined) return;

    // 最初の向きを保存
    if (startHeading === null) {
        startHeading = heading;
    }

    // 開始時を0°とする
    let relativeHeading = (heading - startHeading + 360) % 360;

    document.getElementById("heading").innerText =
        "現在の向き : " + Math.round(relativeHeading) + "°";
}
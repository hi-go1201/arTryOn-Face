// whether streaming video from the camera.
let streaming = false;
let video = document.getElementById("video");

// Facemesh
let facemesh_init = false;
let facemodel, headOrientation = null;

let detectEyeArea_flag = false;
let detectEyeArea = null;

// Facemesh annotations Info (Not Used) MESH_ANNOTATIONS: {[key: string]: number[]}
let facemesh_annotations = {
    silhouette: [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
        397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ],

    lipsUpperOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
    lipsLowerOuter: [146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
    lipsUpperInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
    lipsLowerInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],

    rightEyeUpper0: [246, 161, 160, 159, 158, 157, 173],
    rightEyeLower0: [33, 7, 163, 144, 145, 153, 154, 155, 133],
    rightEyeUpper1: [247, 30, 29, 27, 28, 56, 190],
    rightEyeLower1: [130, 25, 110, 24, 23, 22, 26, 112, 243],
    rightEyeUpper2: [113, 225, 224, 223, 222, 221, 189],
    rightEyeLower2: [226, 31, 228, 229, 230, 231, 232, 233, 244],
    rightEyeLower3: [143, 111, 117, 118, 119, 120, 121, 128, 245],

    rightEyebrowUpper: [156, 70, 63, 105, 66, 107, 55, 193],
    rightEyebrowLower: [35, 124, 46, 53, 52, 65],

    leftEyeUpper0: [466, 388, 387, 386, 385, 384, 398],
    leftEyeLower0: [263, 249, 390, 373, 374, 380, 381, 382, 362],
    leftEyeUpper1: [467, 260, 259, 257, 258, 286, 414],
    leftEyeLower1: [359, 255, 339, 254, 253, 252, 256, 341, 463],
    leftEyeUpper2: [342, 445, 444, 443, 442, 441, 413],
    leftEyeLower2: [446, 261, 448, 449, 450, 451, 452, 453, 464],
    leftEyeLower3: [372, 340, 346, 347, 348, 349, 350, 357, 465],

    leftEyebrowUpper: [383, 300, 293, 334, 296, 336, 285, 417],
    leftEyebrowLower: [265, 353, 276, 283, 282, 295],

    midwayBetweenEyes: [168],

    noseTip: [1],
    noseBottom: [2],
    noseRightCorner: [98],
    noseLeftCorner: [327],

    rightCheek: [205],
    leftCheek: [425]
};

// AR Try On Select
let arTryOnSelect = "Glasses";

function opencvIsReady() {
    console.log('OpenCV.js is ready');
    startCamera();
}

function startCamera() {
    if (streaming) return;
    console.log("display_size:" + window.innerWidth + "," + window.innerHeight);
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: "user",
            zoom: true,
            width: { min: 800, ideal: 1280, max: 1920 },
            height: { min: 600, ideal: 720, max: 1080 }
        }
    })
        .then(function (stream) {
            video.srcObject = stream;
            video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            video.setAttribute("autoplay", true);
            video.setAttribute("muted", true);
            // camera ズーム付けたいがsafari非対応のため未対応
            const [track] = stream.getVideoTracks();
            const capabilities = track.getCapabilities();
            const settings = track.getSettings();
            console.log(capabilities);
            console.log(settings);
            video.play();
        })
        .catch(function (err) {
            console.log("An error occured! " + err);
        });

    video.addEventListener("canplay", function (ev) {
        if (!streaming) {
            console.log("video_size:" + video.videoWidth + "," + video.videoHeight);
            video.setAttribute("width", video.videoWidth);
            video.setAttribute("height", video.videoHeight);
            streaming = true;
        }
        startVideoProcessing();
    }, false);
}

function startVideoProcessing() {
    if (!streaming) { console.warn("Please startup your webcam"); return; }
    requestAnimationFrame(processVideo);
    setTimeout(() => {
        processARTryOn(); //three jsの処理を少しずらさないとios safariでtexture.needsUpdateが反映されない
    }, 2000);
}

async function processVideo() {
    //videoソース読み込み
    let vc = new cv.VideoCapture(video);
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    vc.read(src);

    //スマホ用にvideoソースの解像度修正
    let dst = new cv.Mat();
    let adjustVideoSrc = new cv.Mat();
    let adjustVideoSrc2 = new cv.Mat();

    //videoソースが画面解像度より小さい時の事前修正が必要(PC,ipadでありがち)
    // ToDo:AR.jsなど使うとより良く汎用化できそう？
    if (window.innerWidth > video.videoWidth) {
        //1-1 横揃える
        var adjustVideoHeight = parseInt(video.videoHeight * (window.innerWidth / video.videoWidth));
        //console.log("adjust_video_size 1-1:" + window.innerWidth + "," + adjustVideoHeight);
        var adjustVideoSize = new cv.Size(window.innerWidth, adjustVideoHeight);
        cv.resize(src, adjustVideoSrc, adjustVideoSize, 0, 0, cv.INTER_AREA);

        //1-2 縦揃える
        if (window.innerHeight > adjustVideoSrc.rows) {
            var adjustVideoWidth = parseInt(adjustVideoSrc.cols * (window.innerHeight / adjustVideoSrc.rows));
            //console.log("adjust_video_size 1-2:" + adjustVideoWidth + "," + adjustVideoSrc.rows);
            adjustVideoSize = new cv.Size(adjustVideoWidth, window.innerHeight);
            cv.resize(adjustVideoSrc, adjustVideoSrc2, adjustVideoSize, 0, 0, cv.INTER_AREA);
            //クロップ
            var x1 = parseInt((adjustVideoSrc2.cols / 2) - (window.innerWidth / 2));
            var y1 = parseInt((adjustVideoSrc2.rows / 2) - (window.innerHeight / 2));
            let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
            dst = adjustVideoSrc2.roi(rect);

        } else {

            //1-2 縦クロップして揃える
            //console.log("adjust_video_size 1-2:" + window.innerWidth + "," + window.innerHeight);
            var x1 = parseInt((adjustVideoSrc.cols / 2) - (window.innerWidth / 2));
            var y1 = parseInt((adjustVideoSrc.rows / 2) - (window.innerHeight / 2));
            let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
            dst = adjustVideoSrc.roi(rect);

        }
    } else if (window.innerHeight > video.videoHeight) {
        //2-1 縦揃える
        var adjustVideoWidth = parseInt(video.videoWidth * (window.innerHeight / video.videoHeight));
        //console.log("adjust_video_size 2-1:" + adjustVideoWidth + "," + window.innerHeight);
        var adjustVideoSize = new cv.Size(adjustVideoWidth, window.innerHeight);
        cv.resize(src, adjustVideoSrc, adjustVideoSize, 0, 0, cv.INTER_AREA);

        //2-2 横揃える
        if (window.innerWidth > adjustVideoSrc.cols) {
            var adjustVideoHeight = parseInt(adjustVideoSrc.rows * (window.innerWidth / adjustVideoSrc.cols));
            //console.log("adjust_video_size 2-2:" + window.innerWidth + "," + adjustVideoHeight);
            adjustVideoSize = new cv.Size(window.innerWidth, adjustVideoHeight);
            cv.resize(adjustVideoSrc, adjustVideoSrc2, adjustVideoSize, 0, 0, cv.INTER_AREA);
            //クロップ
            var x1 = parseInt((adjustVideoSrc2.cols / 2) - (window.innerWidth / 2));
            var y1 = parseInt((adjustVideoSrc2.rows / 2) - (window.innerHeight / 2));
            let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
            dst = adjustVideoSrc2.roi(rect);

        } else {

            //2−2 横クロップして揃える
            //console.log("adjust_video_size 2-2:" + window.innerWidth + "," + window.innerHeight);
            var x1 = parseInt((adjustVideoSrc.cols / 2) - (window.innerWidth / 2));
            var y1 = parseInt((adjustVideoSrc.rows / 2) - (window.innerHeight / 2));
            let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
            dst = adjustVideoSrc.roi(rect);

        }
    } else {
        //3 中心をクロップして揃える
        //console.log("adjust_video_size 3:" + window.innerWidth + "," + window.innerHeight);
        var x1 = parseInt((video.videoWidth / 2) - (window.innerWidth / 2));
        var y1 = parseInt((video.videoHeight / 2) - (window.innerHeight / 2));
        let rect = new cv.Rect(x1, y1, window.innerWidth, window.innerHeight);
        dst = src.roi(rect);
    }

    //frontカメラのため、鏡表示になるよう左右反転
    cv.flip(dst, dst, 1);

    cv.imshow('canvas', dst);
    src.delete();
    adjustVideoSrc.delete();
    adjustVideoSrc2.delete();
    dst.delete();
    await detectFacemesh();
    requestAnimationFrame(processVideo);
}

async function detectFacemesh() {
    var src = document.getElementById("canvas");

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#32EEDB';
    ctx.strokeStyle = '#32EEDB';
    ctx.lineWidth = 0.5;

    detectEyeArea = { x: 0.0, y: 0.0, z: 0.0, w: 0.0, angle: 0.0, distance: 0.0 };

    if (facemesh_init == false) {
        //await tf.setBackend('cpu'); //wasm|cpu

        // Load the MediaPipe facemesh model.
        facemodel = await facemesh.load();

        facemesh_init = true;

        //console.log("canvasInfo:" + document.getElementById("canvas").width + "," + document.getElementById("canvas").height);

    }
    // Pass in a video stream (or an image, canvas, or 3D tensor) to obtain an
    // array of detected faces from the MediaPipe graph.
    const predictions = await facemodel.estimateFaces(src);

    //各指の座標から時計用の手首、指輪用の薬指のエリア推測する
    if (predictions.length > 0) {
        /*
        `predictions` is an array of objects describing each detected face, for example:

        [
            {
                faceInViewConfidence: 1, // The probability of a face being present.
                boundingBox: { // The bounding box surrounding the face.
                    topLeft: [232.28, 145.26],
                    bottomRight: [449.75, 308.36],
                },
                mesh: [ // The 3D coordinates of each facial landmark.
                    [92.07, 119.49, -17.54],
                    [91.97, 102.52, -30.54],
                    ...
                ],
                scaledMesh: [ // The 3D coordinates of each facial landmark, normalized.
                    [322.32, 297.58, -17.54],
                    [322.18, 263.95, -30.54]
                ],
                annotations: { // Semantic groupings of the `scaledMesh` coordinates.
                    silhouette: [
                        [326.19, 124.72, -3.82],
                        [351.06, 126.30, -3.00],
                        ...
                    ],
                    ...
                }
            }
        ]
        */
        //処理に必要な各指の座標を取得
        //face mesh map.jpgを参考に取得する。
        //サングラスは両目の中間のキーポイント？イヤリングは四隅の右端、左端から一定の位置を指定する？
        for (let i = 0; i < predictions.length; i++) {
            const keypoints = predictions[i].scaledMesh;
            const annotations = predictions[i].annotations;
            const rightEyeLower1 = annotations.rightEyeLower1[8];
            const leftEyeLower1 = annotations.leftEyeLower1[8];
            //console.log(annotations);

            //顔の向きや傾き推定する処理追加
            headPoseEstimation(annotations.silhouette, rightEyeLower1, leftEyeLower1);

            // Log facial keypoints.
            for (let i = 0; i < keypoints.length; i++) {
                const [x, y, z] = keypoints[i];

                //サングラスは両目の中間のキーポイント168,6の中間座標
                if (i == 168 || i == 6) {
                    //ctx.beginPath();
                    //ctx.fillStyle = "#FF0000";
                    //ctx.arc(x, y, 3 /* radius */, 0, 2 * Math.PI);
                    //ctx.fill();

                    //console.log(`Keypoint ${i}: [${x}, ${y}, ${z}]`);

                    //サングラスの中心座標算出
                    detectEyeArea.x += x;
                    detectEyeArea.y += y;
                    detectEyeArea.z += z;

                }
            }
        }

        detectEyeArea.x *= 0.5;
        detectEyeArea.y *= 0.5;
        detectEyeArea.z *= 0.5;
        detectEyeArea.distance = Math.sqrt(Math.pow(detectEyeArea.x * 2 - detectEyeArea.x, 2) + Math.pow(detectEyeArea.y * 2 - detectEyeArea.y, 2));
        //console.log("Glasses Area:" + detectEyeArea.x + "," + detectEyeArea.y + "," + detectEyeArea.z);
        //console.log("Glasses Distance:" + detectEyeArea.distance);
        detectEyeArea_flag = true;

    } else {
        detectEyeArea_flag = false;
    }


}

function headPoseEstimation(faces, rightEye, leftEye) {

    const rotate = tf.tidy(() => {
        const fecePoints = tf.tensor(faces);
        const eye1 = tf.tensor1d(rightEye);
        const eye2 = tf.tensor1d(leftEye);
        const scales = fecePoints.div(tf.norm(eye1.sub(eye2))).mul(0.06);
        const centered = scales.sub(scales.mean(axis = 0));

        const c00 = centered.slice(0, 1).as1D();
        const c09 = centered.slice(9, 1).as1D();
        const c18 = centered.slice(18, 1).as1D();
        const c27 = centered.slice(27, 1).as1D();

        const rotate0 = c18.sub(c00).div(tf.norm(c18.sub(c00)));
        const rotate1 = c09.sub(c27).div(tf.norm(c09.sub(c27)));

        return tf.concat([rotate0, rotate1]).arraySync();
    });

    const m00 = rotate[0];
    const m01 = rotate[1];
    const m02 = rotate[2];

    const m10 = rotate[3];
    const m11 = rotate[4];
    const m12 = rotate[5];

    // cross product
    const m20 = m01 * m12 - m02 * m11;
    const m21 = m02 * m10 - m00 * m12;
    const m22 = m00 * m11 - m01 * m10;

    let yaw, pitch, roll;
    let sy = Math.sqrt(m00 * m00 + m10 * m10);
    let singular = sy < 10 ** -6;

    if (!singular) {
        yaw = Math.atan2(m21, m22);
        pitch = Math.atan2(-m20, sy);
        roll = Math.atan2(m10, m00);
    } else {
        yaw = Math.atan2(-m12, m11);
        pitch = Math.atan2(-m20, sy);
        roll = 0;
    }

    headOrientation = { yaw: yaw + Math.PI, pitch: pitch, roll: -(roll - Math.PI / 2) };
    console.log("yaw:" + yaw + ", pitch:" + pitch + ", roll:" + roll);

}

function processARTryOn() {
    // Stats
    const stats = new Stats();
    stats.setMode(0);
    stats.domElement.style.position = "absolute";
    stats.domElement.style.left = "0px";
    stats.domElement.style.top = "0px";
    document.body.appendChild(stats.dom);

    // Set up the main camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2;

    const scene = new THREE.Scene();

    // Create lights
    var light = new THREE.PointLight(0xEEEEEE);
    light.position.set(20, 0, 20);
    scene.add(light);
    var lightAmb = new THREE.AmbientLight(0x777777);
    scene.add(lightAmb);
    // 平行光源
    var lightDir = new THREE.DirectionalLight(0xFFFFFF);
    lightDir.intensity = 5; // 光の強さを倍に
    lightDir.position.set(1, 1, 1);
    scene.add(lightDir);

    //3Dモデルをロード。今回はglb形式を使用  
    const loader = new THREE.GLTFLoader();

    //腕時計(loadに時間かかるので初期値null)
    var model_Glasses = null;
    loader.load('./obj/glasses_light.glb',
        function (gltf) {
            model_Glasses = gltf.scene; // THREE.Group
            model_Glasses.name = "Glasses"
            model_Glasses.visible = false;
            model_Glasses.scale.set(0.056, 0.056, 0.056);
            model_Glasses.position.set(0.0, 0.0, 0.0);
            model_Glasses.rotation.x = 0.0;
            model_Glasses.rotation.y = 0.0;
            model_Glasses.rotation.z = 0.0;
            model_Glasses.view = null;
            scene.add(model_Glasses);
        },
        // called while loading is progressing
        function (xhr) {
            console.log('Glasses: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // called when loading has errors
        function (error) {
            console.log('An error happened');
        }
    );
    
    //腕時計(loadに時間かかるので初期値null)
    var model_RoundGlasses = null;
    /*
    loader.load('./obj/roundglasses_light.glb',
        function (gltf) {
            model_RoundGlasses = gltf.scene; // THREE.Group
            model_RoundGlasses.name = "RoundGlasses"
            model_RoundGlasses.visible = false;
            model_RoundGlasses.scale.set(0.05, 0.05, 0.05);
            model_RoundGlasses.position.set(0.0, 0.0, 0.0);
            model_RoundGlasses.rotation.x = 0.0;
            model_RoundGlasses.rotation.y = 0.0;
            model_RoundGlasses.rotation.z = 0.0;
            model_RoundGlasses.view = null;
            scene.add(model_RoundGlasses);
        },
        // called while loading is progressing
        function (xhr) {
            console.log('RoundGlasses: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // called when loading has errors
        function (error) {
            console.log('An error happened');
        }
    );
    */
    //腕時計(loadに時間かかるので初期値null)
    var model_SunGlasses = null;
    loader.load('./obj/sunglasses.glb',
        function (gltf) {
            model_SunGlasses = gltf.scene; // THREE.Group
            model_SunGlasses.name = "SunGlasses"
            model_SunGlasses.visible = false;
            model_SunGlasses.scale.set(0.08, 0.08, 0.08);
            model_SunGlasses.position.set(0.0, 0.0, 0.0);
            model_SunGlasses.rotation.x = 0.0;
            model_SunGlasses.rotation.y = 0.0;
            model_SunGlasses.rotation.z = 0.0;
            model_SunGlasses.view = null;
            scene.add(model_SunGlasses);
        },
        // called while loading is progressing
        function (xhr) {
            console.log('SunGlasses: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // called when loading has errors
        function (error) {
            console.log('An error happened');
        }
    );

    //腕時計オクルージョン用の円柱追加 colorWrite=falseで色情報無くして深度情報のみ描画できる
    var watch_cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.4, 50),
        new THREE.MeshPhongMaterial({ color: 0x00FF00, opacity: 1.0, transparent: false, colorWrite: false })
    );
    watch_cylinder.position.set(0, 0.5, -0.15); //(x,y,z)
    watch_cylinder.rotation.z = 1.57
    //sceneオブジェクトに追加
    //scene.add(watch_cylinder);

    // renderer
    var renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setClearColor(new THREE.Color(), 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.left = '0px';
    renderer.autoClear = false; // To allow render overlay on top of sprited sphere
    //document.body.appendChild( renderer.domElement );
    document.getElementById("main").appendChild(renderer.domElement);
    renderer.domElement.id = "webgl";

    // カメラ制御
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();

    window.addEventListener('resize', onWindowResize, false);

    requestAnimationFrame(render);

    function onWindowResize() {

        var resize_width = window.innerWidth;
        var resize_height = window.innerHeight;

        camera.aspect = resize_width / resize_height;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);

    }

    function render(time) {

        time *= 0.001;

        // create camera image
        const texture = new THREE.Texture(
            document.getElementById('canvas'), THREE.UVMapping, THREE.ClampToEdgeWrapping,
            THREE.ClampToEdgeWrapping);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        scene.background = texture;

        //calcTextureOffset(texture);

        //試着対象判定
        arTryOnSelect = document.getElementById("arTryOnSelect").value;
        switch (arTryOnSelect) {

            case "Glasses":
                //AR腕時計試着
                if (model_RoundGlasses != null && model_RoundGlasses.visible == true) model_RoundGlasses.visible = false;
                if (model_SunGlasses != null && model_SunGlasses.visible == true) model_SunGlasses.visible = false;
                renderGlasses(model_Glasses, watch_cylinder, detectEyeArea, detectEyeArea_flag);
                break;

            case "RoundGlasses":
                //AR腕時計試着
                if (model_Glasses != null && model_Glasses.visible == true) model_Glasses.visible = false;
                if (model_SunGlasses != null && model_SunGlasses.visible == true) model_SunGlasses.visible = false;
                renderRoundGlasses(model_RoundGlasses, watch_cylinder, detectEyeArea, detectEyeArea_flag);
                break;

            case "SunGlasses":
                //AR腕時計試着
                if (model_Glasses != null && model_Glasses.visible == true) model_Glasses.visible = false;
                if (model_RoundGlasses != null && model_RoundGlasses.visible == true) model_RoundGlasses.visible = false;
                renderSunGlasses(model_SunGlasses, watch_cylinder, detectEyeArea, detectEyeArea_flag);
                break;

            default:
                break;

        }

        stats.update(); // 毎フレームごとにstats.update()を呼ぶ必要がある。

        renderer.clear();
        renderer.clearDepth();
        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function renderGlasses(model, cylinder, model_info, flag) {

        // パラメータチューニング用変数
        var defaultModelScale = 16.2;
        var scaling_rate = 408;
        var fixModelPositionRate_x = 0.28;
        var fixModelPositionRate_y = -0.1;
        var fixAngle = 40;
        var fixRotation = 0.0172;

        //モデル保有情報
        //model.name
        //model.visible
        //model.view

        if (model != null) {
            //console.log(model);
            //console.log(model_info);
            if (flag == true && model_info.x != 0) {
                // 1.サングラス検出領域(両目の中間2点の直線の長さ)に合わせて3Dモデルの拡大縮小
                // →顔の前後移動でそこまで直線変化しない、かつ顔の向きや角度で直線の変化影響大のため、今回はスケーリング考慮しない
                // 両目の中間2点の直線の長さ = 408でGlassesのscale:16.2。顔近いほど直線短くなる
                //var scaling = scaling_rate / model_info.distance;
                //console.log("model scaling:" + scaling);
                //model.scale.set(defaultModelScale * scaling, defaultModelScale * scaling, defaultModelScale * scaling);

                // 2.指の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
                // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
                //console.log("Glasses pos:[", + model_info.x + "," + model_info.y + "]");
                var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
                var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
                //console.log("Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
                //移動座標をパラメータ調整
                finger3Dx = finger3Dx * fixModelPositionRate_x;
                finger3Dy = finger3Dy * 0.5 + fixModelPositionRate_y;
                //console.log("fix_Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

                // 3.指輪を指の検出座標に移動
                model.position.set(finger3Dx, finger3Dy, 0.0);
                //console.log("angle:" + model_info.angle);
                //console.log("distance:" + model_info.distance);

                // 4.顔の向きに応じてサングラスを回転
                model.rotation.set(-headOrientation.yaw, -headOrientation.pitch, headOrientation.roll);

                model.visible = true;
            } else if (flag == false) {
                model.visible = false;
            }
        }
    }

    function renderRoundGlasses(model, cylinder, model_info, flag) {

        // パラメータチューニング用変数
        var defaultModelScale = 16.2;
        var scaling_rate = 408;
        var fixModelPositionRate_x = 0.2;
        var fixModelPositionRate_y = -0.12;
        var fixAngle = 40;
        var fixRotation = 0.0172;

        //モデル保有情報
        //model.name
        //model.visible
        //model.view

        if (model != null) {
            //console.log(model);
            //console.log(model_info);
            if (flag == true && model_info.x != 0) {
                // 1.サングラス検出領域(両目の中間2点の直線の長さ)に合わせて3Dモデルの拡大縮小
                // →顔の前後移動でそこまで直線変化しない、かつ顔の向きや角度で直線の変化影響大のため、今回はスケーリング考慮しない
                // 両目の中間2点の直線の長さ = 408でGlassesのscale:16.2。顔近いほど直線短くなる
                //var scaling = scaling_rate / model_info.distance;
                //console.log("model scaling:" + scaling);
                //model.scale.set(defaultModelScale * scaling, defaultModelScale * scaling, defaultModelScale * scaling);

                // 2.指の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
                // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
                //console.log("Glasses pos:[", + model_info.x + "," + model_info.y + "]");
                var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
                var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
                //console.log("Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
                //移動座標をパラメータ調整
                finger3Dx = finger3Dx * fixModelPositionRate_x;
                finger3Dy = finger3Dy * 0.5 + fixModelPositionRate_y;
                //console.log("fix_Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

                // 3.指輪を指の検出座標に移動
                model.position.set(finger3Dx, finger3Dy, 0.0);
                //console.log("angle:" + model_info.angle);
                //console.log("distance:" + model_info.distance);

                // 4.顔の向きに応じてサングラスを回転
                model.rotation.set(-headOrientation.yaw, -headOrientation.pitch, headOrientation.roll);

                model.visible = true;
            } else if (flag == false) {
                model.visible = false;
            }
        }
    }

    function renderSunGlasses(model, cylinder, model_info, flag) {

        // パラメータチューニング用変数
        var defaultModelScale = 16.2;
        var scaling_rate = 408;
        var fixModelPositionRate_x = 0.4;
        var fixModelPositionRate_y = -0.12;
        var fixAngle = 40;
        var fixRotation = 0.0172;

        //モデル保有情報
        //model.name
        //model.visible
        //model.view

        if (model != null) {
            //console.log(model);
            //console.log(model_info);
            if (flag == true && model_info.x != 0) {
                // 1.サングラス検出領域(両目の中間2点の直線の長さ)に合わせて3Dモデルの拡大縮小
                // →顔の前後移動でそこまで直線変化しない、かつ顔の向きや角度で直線の変化影響大のため、今回はスケーリング考慮しない
                // 両目の中間2点の直線の長さ = 408でGlassesのscale:16.2。顔近いほど直線短くなる
                //var scaling = scaling_rate / model_info.distance;
                //console.log("model scaling:" + scaling);
                //model.scale.set(defaultModelScale * scaling, defaultModelScale * scaling, defaultModelScale * scaling);

                // 2.指の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
                // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
                //console.log("Glasses pos:[", + model_info.x + "," + model_info.y + "]");
                var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
                var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
                //console.log("Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
                //移動座標をパラメータ調整
                finger3Dx = finger3Dx * fixModelPositionRate_x;
                finger3Dy = finger3Dy + fixModelPositionRate_y;
                //console.log("fix_Glasses 3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

                // 3.指輪を指の検出座標に移動
                model.position.set(finger3Dx, finger3Dy, 0.0);
                //console.log("angle:" + model_info.angle);
                //console.log("distance:" + model_info.distance);

                // 4.顔の向きに応じてサングラスを回転
                model.rotation.set(-headOrientation.yaw, -headOrientation.pitch, headOrientation.roll);

                model.visible = true;
            } else if (flag == false) {
                model.visible = false;
            }
        }
    }

    function renderHeadOcclusion(cylinder, model_info) {
        // パラメータチューニング用変数
        var scaling_rate = 110;
        var fixModelPositionRate_x = 0.5;
        var fixModelPositionRate_y = 1.0;
        var fixRotation = 0.0172;

        // 1.指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
        // 各関節点の直線の長さ = 93.396でringのscale:0.01
        var scaling = model_info.distance / scaling_rate;
        //console.log("model scaling:" + scaling);
        cylinder.scale.set(scaling, scaling, scaling);

        // 2.指の座標を3D空間座標に変換
        // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3a(-0.4~0.4)に最適化
        //console.log("finger_pos:[", + model_info.x + "," + model_info.y + "]");
        var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
        var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
        //console.log("finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
        //移動座標をパラメータ調整
        finger3Dx = finger3Dx * fixModelPositionRate_x;
        finger3Dy = finger3Dy * fixModelPositionRate_y;
        //console.log("fix_finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

        // 3.円柱を指の検出座標に移動
        cylinder.position.set(finger3Dx, finger3Dy, 0.0);
        //console.log("angle:" + model_info.angle);
        //console.log("distance:" + model_info.distance);

        // 4.指の回転角度に応じて円柱回転
        //パラメータ：90:0, 180:1.55→155/90 = 1.72
        cylinder.rotation.set(0, 0, (90 - model_info.angle) * fixRotation);
        //console.log(cylinder.rotation.z);
    }

    // 精度改善フェーズで使う機能かも
    function calcTextureOffset(texture) {
        // Set the repeat and offset properties of the background texture
        // to keep the image's aspect correct.
        // Note the image may not have loaded yet.
        const canvasAspect = window.innerWidth / window.innerHeight;
        const imageAspect = texture.image ? texture.image.width / texture.image.height : 1;
        const aspect = imageAspect / canvasAspect;

        texture.offset.x = aspect > 1 ? (1 - 1 / aspect) / 2 : 0;
        texture.repeat.x = aspect > 1 ? 1 / aspect : 1;

        texture.offset.y = aspect > 1 ? 0 : (1 - aspect) / 2;
        texture.repeat.y = aspect > 1 ? 1 : aspect;
    }

}
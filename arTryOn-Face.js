// whether streaming video from the camera.
let streaming = false;
let video = document.getElementById("video");

// Facemesh
let facemesh_init = false;
let facemodel, face_keypoints = null;

let detectEyeArea_flag = false;
let detectEyeArea = null;

let detectRingArea_flag = false;
let detectRingArea = null;

let detectMiddleFingerArea, detectPinkyFingerArea = null;

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
let arTryOnSelect = "glass";

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

    if (facemesh_init == false) {
        //await tf.setBackend('cpu'); //wasm|cpu

        // Load the MediaPipe facemesh model.
        facemodel = await facemesh.load();

        // Pass in a video stream (or an image, canvas, or 3D tensor) to obtain an
        // array of detected faces from the MediaPipe graph.
        face_keypoints = await facemodel.estimateFaces(src);

        facemesh_init = true;

        //console.log("canvasInfo:" + document.getElementById("canvas").width + "," + document.getElementById("canvas").height);

    } else {
        // Pass in a video stream (or an image, canvas, or 3D tensor) to obtain an
        // array of detected faces from the MediaPipe graph.
        face_keypoints = await facemodel.estimateFaces(src);

        //各指の座標から時計用の手首、指輪用の薬指のエリア推測する
        if (face_keypoints.length > 0) {
            /*
            `face_keypoints` is an array of objects describing each detected face, for example:

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
            for (let i = 0; i < face_keypoints.length; i++) {
                const keypoints = face_keypoints[i].scaledMesh;

                // Log facial keypoints.
                for (let i = 0; i < keypoints.length; i++) {
                    const [x, y, z] = keypoints[i];

                    console.log(`Keypoint ${i}: [${x}, ${y}, ${z}]`);
                }
            }
            detectEyeArea_flag = true;

        } else {
            detectEyeArea_flag = false;
        }

    }
}

//2本の指の各関節位置を基準に指の平均回転角度w算出
function calcHandRotate(finger1, finger2) {
    //パラメータチューニング用変数
    var alpha = 1.0;

    //人差し指
    var finger1_x0 = finger1[0][0];
    var finger1_x1 = finger1[1][0];
    var finger1_x2 = finger1[2][0];
    var finger1_x3 = finger1[3][0];
    var finger1_z0 = finger1[0][2];
    var finger1_z1 = finger1[1][2];
    var finger1_z2 = finger1[2][2];
    var finger1_z3 = finger1[3][2];
    //薬指
    var finger2_x0 = finger2[0][0];
    var finger2_x1 = finger2[1][0];
    var finger2_x2 = finger2[2][0];
    var finger2_x3 = finger2[3][0];
    var finger2_z0 = finger2[0][2];
    var finger2_z1 = finger2[1][2];
    var finger2_z2 = finger2[2][2];
    var finger2_z3 = finger2[3][2];

    //人差し指と薬指の各関節位置を基準に指の平均回転角度w算出
    var w_0 = Math.atan2(finger1_z0 - finger2_z0, finger1_x0 - finger2_x0) * (180 / Math.PI);
    var w_1 = Math.atan2(finger1_z1 - finger2_z1, finger1_x1 - finger2_x1) * (180 / Math.PI);
    var w_2 = Math.atan2(finger1_z2 - finger2_z2, finger1_x2 - finger2_x2) * (180 / Math.PI);
    var w_3 = Math.atan2(finger1_z3 - finger2_z3, finger1_x3 - finger2_x3) * (180 / Math.PI);

    var avg_w = (w_0 + w_1 + w_2 + w_3) / 4;
    //wの増減量が少なければalpha倍にする
    var fix_w = avg_w * alpha;
    //console.log("avg_w:" + avg_w + ", fix_w:" + fix_w);
    return fix_w;
}

//手首の座標/傾き/スケール(距離)推測：中指とpalmの2点を直線で結び、その延長線上に手首
function detectHandWatchPos(annotations) {
    //1.中指とpalmの距離distanceと角度rotate
    var x1 = annotations.middleFinger[3][0];
    var y1 = annotations.middleFinger[3][1];
    var x2 = annotations.palmBase[0][0];
    var y2 = annotations.palmBase[0][1];
    var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    var radian = Math.atan2(y2 - y1, x2 - x1);
    var angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

    //2.distanceを一定間隔伸ばし、その先の手首座標
    var target_x = x2 + (distance * 0.2) * Math.cos(radian);
    var target_y = y2 + (distance * 0.2) * Math.sin(radian);
    //console.log("HandWatch_x:" + target_x + ", HandWatch_y:" + target_y + ", HandWatch_distance:" + distance + ", HandWatch_angle:" + angle);
    return { x: target_x, y: target_y, angle: angle, distance: distance };
}

//指輪の座標/傾き/深度/スケール(距離)推測：該当する指の根元に近い関節2点を直線で結び、中点に指輪
function detectRingPos(finger) {
    //1.該当する指の根元に近い関節2点の距離distanceと角度rotate
    var x1 = finger[1][0];
    var y1 = finger[1][1];
    var z1 = finger[1][2];
    var x2 = finger[0][0];
    var y2 = finger[0][1];
    var z2 = finger[0][2];

    var distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    var angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

    //2.該当する指の根元に近い関節2点を結んだ直線の中点が指輪座標
    var target_x = (x1 + x2) * 0.5;
    var target_y = (y1 + y2) * 0.5;
    var target_z = (z1 + z2) * 0.5;
    //console.log("target_x:" + target_x + ", target_y:" + target_y + ", target_z:" + target_z + ", target_distance:" + distance + ", target_angle:" + angle);
    return { x: target_x, y: target_y, z: target_z, angle: angle, distance: distance };
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
    var model_glass = null;
    loader.load('./obj/glass.glb',
        function (gltf) {
            model_glass = gltf.scene; // THREE.Group
            model_glass.name = "Glass"
            model_glass.visible = false;
            model_glass.scale.set(16.2, 16.2, 16.2);
            model_glass.position.set(0.0, 0.0, 0.0);
            model_glass.rotation.x = 0.0;
            model_glass.rotation.y = 0.0;
            model_glass.rotation.z = 0.0;
            model_glass.view = null;
            scene.add(model_glass);
        },
        // called while loading is progressing
        function (xhr) {
            console.log('Glass: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
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
            case "glass":
                //AR腕時計試着
                //if (model_Ring != null && model_Ring.visible == true) model_Ring.visible = false;
                renderGlass(model_glass, watch_cylinder, detectEyeArea, detectEyeArea_flag);
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

    function renderGlass(model, cylinder, model_info, flag) {
        //手をグーにしてもらった状態で表示サイズや回転できるよう考慮する(手を開くとサイズ大きくなる)

        // パラメータチューニング用変数
        var defaultModelScale = 0.8;
        var scaling_rate = 145;
        var fixModelPositionRate_x = 0.0;
        var fixModelPositionRate_y = -0.2;
        var fixRotation = 0.0172;

        //モデル保有情報
        //model.name
        //model.visible
        //model.view

        if (model != null) {
            //console.log(model);
            //console.log(model_info);
            if (flag == true) {
                /*

                // 1.手首の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
                // 各関節点の直線の長さ = 93.396で腕時計のscale:0.8
                var scaling = model_info.distance / scaling_rate;
                //console.log("model scaling:" + scaling);
                model.scale.set(defaultModelScale * scaling, defaultModelScale * scaling, defaultModelScale * scaling);

                // 2.手首の傾きに応じて腕時計の軸回転
                var alpha = 1;
                var beta = 1;
                if (model_info.angle > 90) {
                    alpha = -1;
                    beta = -1;
                } else if (model_info.angle < 0) {
                    alpha = -1;
                }

                //手首回転調整 理想はw=0度で正面、w=-1~-90で上向き回転、1~90で下向き回転、w=±180で裏
                //fix_w:1~90で上向き回転、-1~-90で下向き回転
                var fix_w = model_info.w * -1.1;
                //正面と裏のチラつき防止
                if (fix_w > 100 || fix_w < -100) fix_w = 0;

                //console.log("hand_w:" + model_info.w);
                //console.log("fix_w:" + fix_w);

                //上向きベクトルを生成
                var axis = new THREE.Vector3(); //←---------------------------------（１）
                var theta = THREE.Math.degToRad(-90 * alpha);　//正面向くように−90固定
                var phi = THREE.Math.degToRad(model_info.angle * beta); //手首の角度
                var angle = THREE.Math.degToRad(fix_w); //手首の回転
                axis.z = Math.cos(theta);
                axis.x = Math.sin(theta) * Math.cos(phi);
                axis.y = Math.sin(theta) * Math.sin(phi);

                //console.log("theta:" + theta +", phi:" + model_info.angle + ", angle:" + fixAngle);
                //オブジェクトの上向きを指定
                model.lookAt(axis);//←----------回転行列とクォータニオンが更新される（２）
                //上向きベクトルを回転軸としてangle[rad]回転するクォータニオンを生成
                q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle); //←（３）
                //オブジェクトを回転軸周りで回転
                model.quaternion.multiply(q); //←-----------------------------------（４）

                // 3.手首の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
                // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
                //console.log("finger_pos:[", + model_info.x + "," + model_info.y + "]");
                var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
                var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
                //console.log("finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
                //移動座標をパラメータ調整
                finger3Dx = finger3Dx + fixModelPositionRate_x;
                finger3Dy = finger3Dy + fixModelPositionRate_y;
                //console.log("fix_finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

                // 4.腕時計を手首の検出座標に移動
                model.position.set(finger3Dx, finger3Dy, 0.0);
                //console.log("angle:" + model_info.angle);
                //console.log("distance:" + model_info.distance);

                // 5.腕時計の位置変更に合わせてオクルージョン用の円柱もサイズ、位置変更
                //パラメータ：90:0, 180:1.55→155/90 = 1.72
                cylinder.scale.set(scaling, scaling, scaling);
                cylinder.position.set(finger3Dx, finger3Dy - fixModelPositionRate_y, 0.0);
                cylinder.rotation.set(0, 0, (90 - model_info.angle) * fixRotation);
                //console.log(cylinder.rotation.z);

                */

                model.visible = true;
            } else if (flag == false) {
                model.visible = false;
                //腕時計のロスト時、表裏状態を初期化
                model.view = null;
            }
        }
    }

    function renderRing(model, cylinder, model_info, flag) {
        // パラメータチューニング用変数
        var defaultModelScale = 0.01;
        var scaling_rate = 110;
        var fixModelPositionRate_x = 0.5;
        var fixModelPositionRate_y = 1.0;
        var fixAngle = 40;
        var fixRotation = 0.0172;

        //モデル保有情報
        //model.name
        //model.visible
        //model.view

        if (model != null) {
            //console.log(model);
            //console.log(model_info);
            if (flag == true) {
                // 1.指の検出領域(各関節点の直線の長さ)に合わせて３Dモデルの拡大縮小
                // 各関節点の直線の長さ = 93.396でringのscale:0.01
                var scaling = model_info.distance / scaling_rate;
                //console.log("model scaling:" + scaling);
                model.scale.set(defaultModelScale * scaling, defaultModelScale * scaling, defaultModelScale * scaling);

                // 2.指の座標を3D空間座標に変換 0:-0.4,196.5:0.0,392:0.4
                // 左右のpositionが−1~1じゃない場合にパラメータ調整必要。現状はpixel3aに最適化
                //console.log("finger_pos:[", + model_info.x + "," + model_info.y + "]");
                var finger3Dx = (model_info.x * 2 / window.innerWidth) - 1.0;
                var finger3Dy = -(model_info.y * 2 / window.innerHeight) + 1.0;
                //console.log("finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");
                //移動座標をパラメータ調整
                finger3Dx = finger3Dx * fixModelPositionRate_x;
                finger3Dy = finger3Dy * fixModelPositionRate_y;
                //console.log("fix_finger3Dpos:[", + finger3Dx + "," + finger3Dy + "]");

                // 3.指輪を指の検出座標に移動
                model.position.set(finger3Dx, finger3Dy, 0.0);
                //console.log("angle:" + model_info.angle);
                //console.log("distance:" + model_info.distance);

                // 4.手首の回転軸に応じて指輪の軸を回転
                var radians = THREE.Math.degToRad(model_info.angle + fixAngle);
                //console.log("angle:" + radians);

                var axis = new THREE.Vector3(-1, -1, -1);
                var rotWorldMatrix = new THREE.Matrix4();
                rotWorldMatrix.makeRotationAxis(axis.normalize(), radians);
                rotWorldMatrix.multiply(model.matrix);
                model.matrix = rotWorldMatrix;
                model.quaternion.setFromAxisAngle(axis, radians);

                // 5.指の回転角度に応じて指輪回転
                //指輪の認識復帰時に表裏状態設定(指輪正面-180度、後ろ0度、可動範囲-180~180度)
                if (model.view == null && Math.abs(model_info.w) >= 0.5 && Math.abs(model_info.w) <= 60) {
                    model.view = 'rear';
                } else if (model.view == null && Math.abs(model_info.w) >= 120 && Math.abs(model_info.w) <= 180) {
                    model.view = 'front';
                }
                //console.log("Ring_status:" + model.view);
                //console.log("hand_w:" + model_info.w);

                //rear時はfrontにさせない
                if (model.view == 'rear') {
                    if (Math.abs(model_info.w) >= 0 && Math.abs(model_info.w) <= 60) {
                        model.rotation.z = THREE.Math.degToRad(model_info.w);
                    } else {
                        model.rotation.z = 0.00;
                    }
                }
                //front時はrearにさせない
                if (model.view == 'front') {
                    if (Math.abs(model_info.w) >= 70 && Math.abs(model_info.w) <= 180) {
                        model.rotation.z = THREE.Math.degToRad(model_info.w);
                    } else {
                        model.rotation.z = 3.15;
                    }
                }
                //console.log("rotated_ring_z:" + model.rotation.z);


                //console.log("model_Ring scale:" + model.scale.x);

                // 6.指輪の位置変更に合わせてオクルージョン用の円柱もサイズ、位置変更
                //パラメータ：90:0, 180:1.55→155/90 = 1.72
                cylinder.scale.set(scaling, scaling, scaling);
                cylinder.position.set(finger3Dx, finger3Dy, 0.0);
                cylinder.rotation.set(0, 0, (90 - model_info.angle) * fixRotation);
                //console.log(cylinder.rotation.z);

                model.visible = true;
            } else if (flag == false) {
                model.visible = false;
                //指輪のロスト時、表裏状態を初期化
                model.view = null;
            }
        }
    }

    function renderFingerOcclusion(cylinder, model_info) {
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
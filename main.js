// 3D Car Simulator - Main Logic

// --- Physics Variables (Cannon.js) ---
let world, physicsMaterial, vehicle;
const chassisDimensions = new CANNON.Vec3(2, 0.5, 4);

// --- Graphics Variables (Three.js) ---
let scene, camera, renderer;
let chassisMesh;
const wheelMeshes = [];

// --- Input Variables ---
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false
};

// --- Initialization ---
initGraphics();
initPhysics();
initInput();
animate();

function initGraphics() {
    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 20, -20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    scene.add(dirLight);

    // 5. Ground (Three.js)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    // Create a checkered texture pattern for better sense of speed
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#34495e';
    for (let i = 0; i < 512; i += 64) {
        for (let j = 0; j < 512; j += 64) {
            if ((i + j) % 128 === 0) ctx.fillRect(i, j, 64, 64);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);

    const groundMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 6. Car Chassis (Three.js)
    const chassisGeo = new THREE.BoxGeometry(chassisDimensions.x, chassisDimensions.y, chassisDimensions.z);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4, metalness: 0.6 });
    chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.castShadow = true;
    scene.add(chassisMesh);

    // Add some details to the car (windshield)
    const glassGeo = new THREE.BoxGeometry(1.9, 0.4, 1.5);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.9 });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, 0.45, -0.5);
    chassisMesh.add(glassMesh);

    // 7. Wheels (Three.js)
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
    wheelGeo.rotateZ(Math.PI / 2); // Rotate to lay flat
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

    for (let i = 0; i < 4; i++) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.castShadow = true;
        // Add a hubcap
        const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.42, 16);
        hubGeo.rotateZ(Math.PI / 2);
        const hubMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const hub = new THREE.Mesh(hubGeo, hubMat);
        wheel.add(hub);
        
        scene.add(wheel);
        wheelMeshes.push(wheel);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initPhysics() {
    // 1. World setup
    world = new CANNON.World();
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.gravity.set(0, -9.81, 0); // Earth gravity
    world.defaultContactMaterial.friction = 0.0; // Handled by wheel materials

    // 2. Physics materials
    const groundMaterial = new CANNON.Material('groundMaterial');
    const wheelMaterial = new CANNON.Material('wheelMaterial');
    const wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
        friction: 0.3,
        restitution: 0,
        contactEquationStiffness: 1000
    });
    world.addContactMaterial(wheelGroundContactMaterial);

    // 3. Ground (Cannon.js)
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    // 4. Car Chassis (Cannon.js)
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisDimensions.x * 0.5, chassisDimensions.y * 0.5, chassisDimensions.z * 0.5));
    const chassisBody = new CANNON.Body({ mass: 1500 }); // Car mass
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 4, 0); // Drop from the sky
    chassisBody.angularVelocity.set(0, 0, 0);

    // 5. Vehicle setup
    vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0, // x
        indexUpAxis: 1,    // y
        indexForwardAxis: 2 // z
    });

    const options = {
        radius: 0.5,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
        maxSuspensionTravel: 0.3,
        customSlidingFrictionalForce: 10.5,
        useCustomSlidingFrictionalForce: true
    };

    // Wheel positions relative to chassis
    const ax = 1.0;
    const ay = -0.2;
    const fz = 1.2; // front
    const bz = -1.2; // back

    // Front left
    options.chassisConnectionPointLocal.set(ax, ay, fz);
    vehicle.addWheel(options);

    // Front right
    options.chassisConnectionPointLocal.set(-ax, ay, fz);
    vehicle.addWheel(options);

    // Back left
    options.chassisConnectionPointLocal.set(ax, ay, bz);
    vehicle.addWheel(options);

    // Back right
    options.chassisConnectionPointLocal.set(-ax, ay, bz);
    vehicle.addWheel(options);

    vehicle.addToWorld(world);

    // Create wheel bodies (just for visuals in RaycastVehicle)
    const wheelBodies = [];
    vehicle.wheelInfos.forEach((wheel) => {
        const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, wheel.radius / 2, 20);
        const wheelBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0 });
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
        wheelBody.addShape(cylinderShape, new CANNON.Vec3(), q);
        wheelBodies.push(wheelBody);
        world.addBody(wheelBody);
    });

    // Update wheels post-step
    world.addEventListener('postStep', () => {
        for (let i = 0; i < vehicle.wheelInfos.length; i++) {
            vehicle.updateWheelTransform(i);
            const t = vehicle.wheelInfos[i].worldTransform;
            wheelBodies[i].position.copy(t.position);
            wheelBodies[i].quaternion.copy(t.quaternion);
            
            // Sync Three.js wheels
            wheelMeshes[i].position.copy(t.position);
            wheelMeshes[i].quaternion.copy(t.quaternion);
        }
    });
}

function initInput() {
    document.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': keys.forward = true; break;
            case 's': case 'arrowdown': keys.backward = true; break;
            case 'a': case 'arrowleft': keys.left = true; break;
            case 'd': case 'arrowright': keys.right = true; break;
            case ' ': keys.brake = true; break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': keys.forward = false; break;
            case 's': case 'arrowdown': keys.backward = false; break;
            case 'a': case 'arrowleft': keys.left = false; break;
            case 'd': case 'arrowright': keys.right = false; break;
            case ' ': keys.brake = false; break;
        }
    });
}

function updatePhysics() {
    world.step(1 / 60);

    // Sync chassis
    chassisMesh.position.copy(vehicle.chassisBody.position);
    chassisMesh.quaternion.copy(vehicle.chassisBody.quaternion);

    // Car controls logic
    const engineForce = 1500;
    const maxSteerVal = 0.5;
    const brakeForce = 50;

    // Acceleration
    if (keys.forward) {
        vehicle.applyEngineForce(-engineForce, 2);
        vehicle.applyEngineForce(-engineForce, 3);
    } else if (keys.backward) {
        vehicle.applyEngineForce(engineForce, 2);
        vehicle.applyEngineForce(engineForce, 3);
    } else {
        vehicle.applyEngineForce(0, 2);
        vehicle.applyEngineForce(0, 3);
    }

    // Steering
    if (keys.left) {
        vehicle.setSteeringValue(maxSteerVal, 0);
        vehicle.setSteeringValue(maxSteerVal, 1);
    } else if (keys.right) {
        vehicle.setSteeringValue(-maxSteerVal, 0);
        vehicle.setSteeringValue(-maxSteerVal, 1);
    } else {
        vehicle.setSteeringValue(0, 0);
        vehicle.setSteeringValue(0, 1);
    }

    // Braking
    if (keys.brake) {
        vehicle.setBrake(brakeForce, 0);
        vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 2);
        vehicle.setBrake(brakeForce, 3);
    } else {
        vehicle.setBrake(0, 0);
        vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 2);
        vehicle.setBrake(0, 3);
    }
    
    // Auto-brake when no keys pressed
    if (!keys.forward && !keys.backward && !keys.brake) {
        vehicle.setBrake(10, 2);
        vehicle.setBrake(10, 3);
    }
}

function updateCamera() {
    // Make camera follow the car
    const relativeCameraOffset = new THREE.Vector3(0, 4, 10);
    const cameraOffset = relativeCameraOffset.applyMatrix4(chassisMesh.matrixWorld);
    
    // Smooth camera movement
    camera.position.lerp(cameraOffset, 0.1);
    
    const lookAtPos = chassisMesh.position.clone();
    lookAtPos.y += 1.5; // Look slightly above the car center
    camera.lookAt(lookAtPos);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    updateCamera();
    renderer.render(scene, camera);
}

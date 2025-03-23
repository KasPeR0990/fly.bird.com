import * as THREE from './three.min.js';

export function setupBird(scene) {
    // Create a more complex bird model group
    const birdGroup = new THREE.Group();
    
    // Create materials with better coloring
    const bodyColor = 0x4287f5; // Bright blue
    const wingColor = 0x2a5db0; // Darker blue
    const beakColor = 0xffd700; // Gold
    
    // Bird body - more streamlined shape
    const bodyGeometry = new THREE.ConeGeometry(0.4, 2.2, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
        color: bodyColor,
        shininess: 80,
        specular: 0x444444
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    birdGroup.add(body);
    
    // Wings - wider for more realistic flight appearance
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(1, 0.2, 2, 0);
    wingShape.lineTo(2, 0.8);
    wingShape.quadraticCurveTo(1, 1.2, 0, 0.5);
    wingShape.lineTo(0, 0);
    
    const wingGeometry = new THREE.ShapeGeometry(wingShape);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: wingColor,
        shininess: 60,
        side: THREE.DoubleSide,
        flatShading: true
    });
    
    // Left wing
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.3, 0, 0.2);
    leftWing.rotation.set(0, Math.PI / 6, 0);
    birdGroup.add(leftWing);
    
    // Right wing
    const rightWing = new THREE.Mesh(wingGeometry.clone(), wingMaterial);
    rightWing.position.set(0.3, 0, 0.2);
    rightWing.rotation.set(0, -Math.PI / 6, 0);
    rightWing.scale.x = -1; // Mirror the wing
    birdGroup.add(rightWing);
    
    // Tail - wider and more bird-like
    const tailGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.8);
    tailGeometry.translate(0, 0, -0.4); // Position at the back
    const tailMaterial = new THREE.MeshPhongMaterial({ color: wingColor });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(0, 0, -1.1);
    tail.rotation.y = Math.PI / 4; // Angle the tail slightly
    birdGroup.add(tail);
    
    // Head - slightly larger
    const headGeometry = new THREE.SphereGeometry(0.35, 12, 12);
    const headMaterial = new THREE.MeshPhongMaterial({ 
        color: bodyColor,
        shininess: 90
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0.1, 1.2);
    birdGroup.add(head);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.15, 0.15, 1.45);
    birdGroup.add(leftEye);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.15, 0.15, 1.45);
    birdGroup.add(rightEye);
    
    // Beak - more pointed
    const beakGeometry = new THREE.ConeGeometry(0.1, 0.6, 8);
    const beakMaterial = new THREE.MeshPhongMaterial({ 
        color: beakColor,
        shininess: 100
    });
    const beak = new THREE.Mesh(beakGeometry, beakMaterial);
    beak.position.set(0, 0, 1.7);
    beak.rotation.x = Math.PI / 2;
    birdGroup.add(beak);
    
    // Add to scene
    scene.add(birdGroup);
    
    // Cast shadows
    birdGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
        }
    });
    
    // Create animation properties
    birdGroup.userData = {
        wingFlapDirection: 1,
        wingFlapSpeed: 0.1,
        lastFlapTime: 0,
        flapAngle: 0,
        tailWagAngle: 0,
        verticalSpeed: 0,
        lastHeight: 0,
        fallingTime: 0
    };
    
    return birdGroup;
}

export function updateBird(bird, state) {
    // Calculate vertical speed for animation
    if (bird.userData.lastHeight !== undefined) {
        bird.userData.verticalSpeed = state.height - bird.userData.lastHeight;
        bird.userData.lastHeight = state.height;
    } else {
        bird.userData.lastHeight = state.height;
        bird.userData.verticalSpeed = 0;
    }
    
    // Update position based on speed and direction
    bird.position.z += state.speed;
    bird.position.y = state.height;
    
    // Smooth rotation based on turning value
    bird.rotation.y += state.turn;
    
    // Determine animation state based on current movement
    const isFlapping = state.wingFlap;
    const isTurning = Math.abs(state.turn) > 0.001;
    const isDiving = state.speed > 0.3 && bird.userData.verticalSpeed < -0.01;
    const isGliding = !isFlapping && state.speed > 0.05 && Math.abs(bird.userData.verticalSpeed) < 0.01;
    const isRising = bird.userData.verticalSpeed > 0.01;
    const isFalling = !isFlapping && !isGliding && bird.userData.verticalSpeed < -0.005;
    
    // Track falling time for animation
    if (isFalling) {
        bird.userData.fallingTime += 0.016; // Assuming 60fps
    } else {
        bird.userData.fallingTime = 0;
    }
    
    // Banking effect when turning - more pronounced based on reference images
    const targetBankAngle = -state.turn * 35; // Increased banking angle for sharper turns
    bird.rotation.z = THREE.MathUtils.lerp(bird.rotation.z, targetBankAngle * Math.PI / 180, 0.1);
    
    // Tilt based on vertical movement and speed - more dramatic
    let targetPitchAngle = 0;
    
    if (isDiving) {
        // Diving - nose down proportional to speed and vertical movement
        targetPitchAngle = 20 + Math.min(70, state.speed * 100);
    } else if (isRising && isFlapping) {
        // Rising with flaps - nose up
        targetPitchAngle = -20 - Math.min(30, Math.abs(bird.userData.verticalSpeed) * 300);
    } else if (isGliding) {
        // Gliding - slight downward tilt
        targetPitchAngle = 5;
    } else if (isFalling) {
        // Falling due to gravity - gradually pitch down more as fall continues
        // This is the case specifically requested - bird angles down when not flapping
        const fallAngle = Math.min(60, bird.userData.fallingTime * 40);
        targetPitchAngle = fallAngle;
    }
    
    // Convert to radians and apply smoothly
    bird.rotation.x = THREE.MathUtils.lerp(
        bird.rotation.x, 
        targetPitchAngle * Math.PI / 180, 
        isDiving ? 0.15 : 0.08  // Faster response when diving
    );
    
    // Wing flapping animation - more realistic based on reference images
    const leftWing = bird.children[1];
    const rightWing = bird.children[2];
    const now = performance.now();
    
    if (isFlapping) {
        // Flapping wings animation - faster with higher intensity
        const flapSpeed = state.wingFlapSpeed || 0.15;
        const flapPeriod = 200 - flapSpeed * 120; // Faster flapping with higher speed
        
        // Oscillate wings using sine wave
        const flapPhase = (now % flapPeriod) / flapPeriod;
        const flapAngle = Math.sin(flapPhase * Math.PI * 2) * 0.8; // More pronounced flapping
        
        // Wing rotations around multiple axes for more realistic flapping
        leftWing.rotation.z = flapAngle;
        leftWing.rotation.x = -Math.abs(flapAngle) * 0.4;
        
        rightWing.rotation.z = -flapAngle;
        rightWing.rotation.x = -Math.abs(flapAngle) * 0.4;
        
        // Apply more dramatic wing movement based on flap speed
        const extensionFactor = 0.2 + flapSpeed * 0.3;
        leftWing.position.y = Math.sin(flapPhase * Math.PI * 2) * extensionFactor;
        rightWing.position.y = Math.sin(flapPhase * Math.PI * 2) * extensionFactor;
        
        // Store current flap angle for reference
        bird.userData.flapAngle = flapAngle;
    } else if (isGliding) {
        // Gliding position - wings straight out, slightly up
        leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, 0.1, 0.1);
        leftWing.rotation.x = THREE.MathUtils.lerp(leftWing.rotation.x, 0, 0.1);
        rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, -0.1, 0.1);
        rightWing.rotation.x = THREE.MathUtils.lerp(rightWing.rotation.x, 0, 0.1);
        
        // Reset wing position
        leftWing.position.y = THREE.MathUtils.lerp(leftWing.position.y, 0, 0.1);
        rightWing.position.y = THREE.MathUtils.lerp(rightWing.position.y, 0, 0.1);
        
        // Apply subtle wing adjustments based on speed
        const speedFactor = Math.min(state.speed / 0.3, 1);
        leftWing.rotation.y = Math.PI / 6 - speedFactor * 0.2;
        rightWing.rotation.y = -Math.PI / 6 + speedFactor * 0.2;
    } else if (isDiving) {
        // Diving - wings pulled in slightly
        leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, 0.3, 0.1);
        leftWing.rotation.x = THREE.MathUtils.lerp(leftWing.rotation.x, 0.3, 0.1);
        rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, -0.3, 0.1);
        rightWing.rotation.x = THREE.MathUtils.lerp(rightWing.rotation.x, 0.3, 0.1);
        
        // Wings pulled in closer to body during dive
        leftWing.position.y = THREE.MathUtils.lerp(leftWing.position.y, -0.1, 0.1);
        rightWing.position.y = THREE.MathUtils.lerp(rightWing.position.y, -0.1, 0.1);
    } else if (isFalling) {
        // Falling - wings partially extended but not actively flapping
        const fallProgress = Math.min(1, bird.userData.fallingTime / 2);
        leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, 0.2 + fallProgress * 0.3, 0.1);
        rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, -0.2 - fallProgress * 0.3, 0.1);
        
        // Wings gradually raise as bird falls
        leftWing.rotation.x = THREE.MathUtils.lerp(leftWing.rotation.x, fallProgress * 0.3, 0.1);
        rightWing.rotation.x = THREE.MathUtils.lerp(rightWing.rotation.x, fallProgress * 0.3, 0.1);
    } else {
        // Default/idle position
        leftWing.rotation.z = THREE.MathUtils.lerp(leftWing.rotation.z, 0.2, 0.1);
        rightWing.rotation.z = THREE.MathUtils.lerp(rightWing.rotation.z, -0.2, 0.1);
        
        // Reset wing position
        leftWing.position.y = THREE.MathUtils.lerp(leftWing.position.y, 0, 0.1);
        rightWing.position.y = THREE.MathUtils.lerp(rightWing.position.y, 0, 0.1);
    }
    
    // Tail animation for steering and stability
    const tail = bird.children[3];
    
    if (isTurning) {
        // Turning - angle tail in direction of turn
        const turnDirection = state.turn > 0 ? 1 : -1;
        const turnIntensity = Math.min(Math.abs(state.turn * 40), 1.2);
        const tailTurnAngle = turnIntensity * turnDirection;
        
        // Rotate tail for turning (yaw control)
        tail.rotation.y = THREE.MathUtils.lerp(
            tail.rotation.y, 
            Math.PI / 4 + tailTurnAngle, 
            0.2
        );
    } else {
        // Gradually return tail to center
        tail.rotation.y = THREE.MathUtils.lerp(tail.rotation.y, Math.PI / 4, 0.1);
    }
    
    // Tail vertical adjustment for pitch control
    if (isDiving) {
        // Tail up when diving - more pronounced
        tail.rotation.x = THREE.MathUtils.lerp(tail.rotation.x, 0.6, 0.15);
    } else if (isRising) {
        // Tail down when rising
        tail.rotation.x = THREE.MathUtils.lerp(tail.rotation.x, -0.4, 0.1);
    } else if (isFalling) {
        // Tail tries to stabilize during uncontrolled fall
        const wobbleAmount = Math.sin(now / 200) * 0.2;
        tail.rotation.x = THREE.MathUtils.lerp(tail.rotation.x, 0.3 + wobbleAmount, 0.1);
    } else {
        // Normal position
        tail.rotation.x = THREE.MathUtils.lerp(tail.rotation.x, 0, 0.1);
    }
    
    // Body animations
    const body = bird.children[0];
    
    // Subtle body "breathing" animation
    const breathFactor = Math.sin(now / 1000) * 0.03 + 1;
    body.scale.set(1, breathFactor, 1);
    
    // Body leans into turns
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, -bird.rotation.z * 0.3, 0.1);
    
    // Head looks where it's going
    const head = bird.children[4];
    if (head) {
        // Look up when climbing, down when diving
        const lookDirection = isRising ? 0.4 : (isDiving ? -0.3 : 0);
        head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, lookDirection, 0.1);
        
        // Look into turns slightly
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, state.turn * 2, 0.1);
    }
}
import * as THREE from './three.min.js';
import { setupWorld, updateWorld } from './world.js';
import { setupBird, updateBird } from './bird.js';
import { setupVideo, drawSkeleton } from './video.js';

// Create socket with error handling
const socket = io();
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    displayError('Connection to server failed. Please refresh the page.');
});

// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('scene-container').appendChild(renderer.domElement);

// Sound effects
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

// Initialize game state
const gameState = {
    started: false,
    paused: false,
    bird: null,
    lastTime: 0,
    birdState: {
        speed: 0,
        height: 5,
        turn: 0,
        wingFlap: false,
        wingFlapSpeed: 0,
        verticalMomentum: 0
    },
    camera: camera,
    lastCommand: 'none',
    sounds: {},
    showInstructions: true,
    physics: {
        gravity: 0.02,
        drag: 0.98,
        liftFactor: 0.01,
        flapStrength: 0.03,
        maxSpeed: 0.8
    },
    debug: {
        showPhysics: false,
        freeCam: false
    }
};

// Setup world and bird
gameState.bird = setupWorld(scene);
camera.position.z = 10;
camera.position.y = 8;
camera.lookAt(gameState.bird.position);

// Load sound effects
function loadSounds() {
    const soundFiles = {
        flap: './assets/sounds/flap.mp3',
        wind: './assets/sounds/wind.mp3',
        dive: './assets/sounds/dive.mp3'
    };
    
    // Create sound objects (don't worry if sound files don't exist, game will still work)
    try {
        // Wind sound (continuous)
        const windSound = new THREE.Audio(audioListener);
        const windLoader = new THREE.AudioLoader();
        windLoader.load(soundFiles.wind, (buffer) => {
            windSound.setBuffer(buffer);
            windSound.setLoop(true);
            windSound.setVolume(0.3);
            gameState.sounds.wind = windSound;
        }, 
        undefined, // onProgress
        (err) => { console.log('Wind sound not loaded, continuing without sound.'); });
        
        // Flap sound (one-shot)
        const flapSound = new THREE.Audio(audioListener);
        const flapLoader = new THREE.AudioLoader();
        flapLoader.load(soundFiles.flap, (buffer) => {
            flapSound.setBuffer(buffer);
            flapSound.setVolume(0.5);
            gameState.sounds.flap = flapSound;
        },
        undefined, // onProgress
        (err) => { console.log('Flap sound not loaded, continuing without sound.'); });
        
        // Dive sound (one-shot)
        const diveSound = new THREE.Audio(audioListener);
        const diveLoader = new THREE.AudioLoader();
        diveLoader.load(soundFiles.dive, (buffer) => {
            diveSound.setBuffer(buffer);
            diveSound.setVolume(0.5);
            gameState.sounds.dive = diveSound;
        },
        undefined, // onProgress
        (err) => { console.log('Dive sound not loaded, continuing without sound.'); });
    } catch (e) {
        console.log('Sound system not available, continuing without sound.');
    }
}

// Optional sound loading - don't error if sounds aren't available
try {
    loadSounds();
} catch (e) {
    console.log('Sound system initialization failed, continuing without sound.');
}

// Setup webcam and socket communication
setupVideo(socket);

// Create game instructions element
function createInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'instructions';
    instructions.innerHTML = `
        <h3>Bird Movement Controls</h3>
        <ul>
            <li><strong>Glide:</strong> Arms stretched out straight</li>
            <li><strong>Turn:</strong> Angle your upper body left/right</li>
            <li><strong>Flap/Fly:</strong> Move arms up and down</li>
            <li><strong>Dive:</strong> Lean forward with arms down</li>
            <li><strong>Gain Height:</strong> Flap while leaning back</li>
        </ul>
        <p>Press H to hide/show these instructions</p>
        <p>Press D to show/hide physics debug info</p>
    `;
    document.body.appendChild(instructions);
    gameState.instructionsEl = instructions;
}
createInstructions();

// Create physics debug display
function createPhysicsDisplay() {
    const debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.innerHTML = `
        <h4>Physics Debug</h4>
        <div id="debug-content">
            <div>Speed: <span id="debug-speed">0</span></div>
            <div>Height: <span id="debug-height">0</span></div>
            <div>Turn: <span id="debug-turn">0</span></div>
            <div>State: <span id="debug-state">none</span></div>
            <div>Vertical Momentum: <span id="debug-momentum">0</span></div>
        </div>
    `;
    document.body.appendChild(debugPanel);
    gameState.debugPanel = debugPanel;
    debugPanel.style.display = 'none';
}
createPhysicsDisplay();

// Message handling
function displayMessage(message, isError = false) {
    const messageContainer = document.createElement('div');
    messageContainer.className = isError ? 'message error' : 'message';
    messageContainer.textContent = message;
    document.body.appendChild(messageContainer);
    
    setTimeout(() => {
        messageContainer.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(messageContainer);
        }, 500);
    }, 3000);
}

function displayError(message) {
    displayMessage(message, true);
}

// Play sound based on current state
function playStateSound(state) {
    if (!gameState.sounds) return;
    
    // Only play sound when state changes
    if (state === gameState.lastCommand) return;
    gameState.lastCommand = state;
    
    // Play appropriate sound for state
    if (state === 'flap' && gameState.sounds.flap && !gameState.sounds.flap.isPlaying) {
        gameState.sounds.flap.play();
    } else if (state === 'dive' && gameState.sounds.dive && !gameState.sounds.dive.isPlaying) {
        gameState.sounds.dive.play();
    }
    
    // Manage continuous wind sound
    if (gameState.sounds.wind) {
        if ((state === 'glide' || state === 'dive') && !gameState.sounds.wind.isPlaying) {
            gameState.sounds.wind.play();
        } else if (state === 'none' && gameState.sounds.wind.isPlaying) {
            gameState.sounds.wind.pause();
        }
    }
}

// Update physics debug display
function updateDebugDisplay() {
    if (!gameState.debug.showPhysics) return;
    
    document.getElementById('debug-speed').textContent = gameState.birdState.speed.toFixed(3);
    document.getElementById('debug-height').textContent = gameState.birdState.height.toFixed(2);
    document.getElementById('debug-turn').textContent = gameState.birdState.turn.toFixed(3);
    document.getElementById('debug-state').textContent = gameState.lastCommand;
    document.getElementById('debug-momentum').textContent = gameState.birdState.verticalMomentum.toFixed(3);
}

// Game state update from server
socket.on('movement_data', (data) => {
    const { commands, keypoints, bird_state } = data;
    
    // Draw skeleton on video
    if (keypoints && keypoints.length > 0) {
        drawSkeleton(keypoints);
    }
    
    // Start game when first valid command is received
    if (!gameState.started && commands && Object.keys(commands).length > 0) {
        gameState.started = true;
        displayMessage("Game started! Move your body to control the bird.");
        
        // Start background sound if available
        if (gameState.sounds.wind) {
            gameState.sounds.wind.play();
        }
    }
    
    // Apply client-side physics if no server physics
    if (!bird_state && gameState.started) {
        // Apply gravity - bird falls if not flapping or gliding
        if (!commands.flap && commands.state !== 'glide') {
            gameState.birdState.verticalMomentum -= gameState.physics.gravity;
        }
        
        // Apply vertical momentum
        gameState.birdState.height += gameState.birdState.verticalMomentum;
        
        // Ground collision
        if (gameState.birdState.height <= 0) {
            gameState.birdState.height = 0;
            gameState.birdState.verticalMomentum = 0;
            gameState.birdState.speed *= 0.95; // Friction with ground
        }
        
        // Air resistance - gradually slows the bird
        gameState.birdState.speed *= gameState.physics.drag;
        gameState.birdState.verticalMomentum *= 0.95;
    }
    
    // Update bird state based on commands
    if (commands.state === 'glide') {
        gameState.birdState.wingFlap = false;
        
        // Simple gliding physics if no server physics
        if (!bird_state) {
            // Gliding provides lift proportional to speed
            const lift = gameState.physics.liftFactor * gameState.birdState.speed;
            gameState.birdState.verticalMomentum = Math.max(-0.01, gameState.birdState.verticalMomentum);
            gameState.birdState.height += lift;
        }
        
        playStateSound('glide');
    } else if (commands.state === 'dive') {
        gameState.birdState.wingFlap = false;
        
        // Simple diving physics if no server physics
        if (!bird_state) {
            // Diving increases speed and adds downward momentum
            const intensity = commands.dive_intensity || 0.5;
            gameState.birdState.speed += 0.03 * intensity;
            gameState.birdState.verticalMomentum -= 0.01 * intensity;
        }
        
        playStateSound('dive');
    } else if (commands.state === 'gain_height') {
        gameState.birdState.wingFlap = true;
        gameState.birdState.wingFlapSpeed = 0.2 + (commands.height_gain || 0) * 0.3;
        
        // Simple height gain physics if no server physics
        if (!bird_state) {
            const gain = commands.height_gain || 0.5;
            gameState.birdState.verticalMomentum += 0.03 * gain;
            gameState.birdState.speed = Math.max(gameState.birdState.speed - 0.01 * gain, 0.05);
        }
        
        playStateSound('flap');
    } else {
        playStateSound('none');
    }
    
    // Update flapping
    if ('flap' in commands) {
        gameState.birdState.wingFlap = commands.flap;
        gameState.birdState.wingFlapSpeed = commands.flap_intensity || 0.1;
        
        // Simple flapping physics if no server physics
        if (!bird_state && commands.flap) {
            const intensity = commands.flap_intensity || 0.5;
            gameState.birdState.verticalMomentum += gameState.physics.flapStrength * intensity;
            gameState.birdState.speed += 0.01 * intensity; // Forward momentum from flapping
        }
        
        if (commands.flap) {
            playStateSound('flap');
        }
    }
    
    // Use server-computed physics if available
    if (bird_state) {
        gameState.birdState.speed = bird_state.speed;
        gameState.birdState.height = bird_state.height;
        gameState.birdState.turn = bird_state.turn;
    } else if (commands.turn) {
        // Fallback to client-side turn calculation - more extreme turning as requested
        const turnAngle = commands.turn_angle || 0;
        const turnPower = Math.pow(turnAngle / 60, 1.5) * 0.05; // Non-linear response for sharper turns
        gameState.birdState.turn = commands.turn === 'left' ? -turnPower : turnPower;
    } else {
        // Reset turn if no command
        gameState.birdState.turn *= 0.9;
    }
    
    // Apply speed limits
    gameState.birdState.speed = Math.min(Math.max(gameState.birdState.speed, 0), gameState.physics.maxSpeed);
    
    // Update debug display
    updateDebugDisplay();
});

// Handle connection status
socket.on('connected', (data) => {
    displayMessage('Connected to server. Move your arms to control the bird!');
});

socket.on('error', (data) => {
    displayError(data.message || 'An error occurred');
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handle key events for debugging and controls
window.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
        gameState.paused = !gameState.paused;
        displayMessage(gameState.paused ? 'Game Paused' : 'Game Resumed');
    } else if (event.key === 'h' || event.key === 'H') {
        gameState.showInstructions = !gameState.showInstructions;
        if (gameState.instructionsEl) {
            gameState.instructionsEl.style.display = 
                gameState.showInstructions ? 'block' : 'none';
        }
    } else if (event.key === 'd' || event.key === 'D') {
        gameState.debug.showPhysics = !gameState.debug.showPhysics;
        if (gameState.debugPanel) {
            gameState.debugPanel.style.display = 
                gameState.debug.showPhysics ? 'block' : 'none';
        }
    } else if (event.key === 'c' || event.key === 'C') {
        gameState.debug.freeCam = !gameState.debug.freeCam;
        if (!gameState.debug.freeCam) {
            // Reset camera to follow bird
            camera.position.set(
                gameState.bird.position.x,
                gameState.bird.position.y + 3,
                gameState.bird.position.z - 10
            );
            camera.lookAt(gameState.bird.position);
        }
    }
});

// Animation loop
function animate(timestamp) {
    requestAnimationFrame(animate);
    
    // Calculate delta time
    if (!gameState.lastTime) {
        gameState.lastTime = timestamp;
    }
    const deltaTime = (timestamp - gameState.lastTime) / 1000;
    gameState.lastTime = timestamp;
    
    if (gameState.started && !gameState.paused) {
        // Update bird
        updateBird(gameState.bird, gameState.birdState);
        
        // Update world (clouds, camera, etc.)
        updateWorld(scene, camera, gameState.bird, gameState.debug.freeCam);
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Start animation loop
animate();
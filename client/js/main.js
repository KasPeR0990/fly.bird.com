import * as THREE from './three.min.js';
import { setupWorld, updateWorld } from './world.js';
import { setupBird, updateBird } from './bird.js';
import { setupVideo, drawSkeleton, displayVideoStatus, clearVideoStatus } from './video.js';

// Create socket with error handling
const socket = io();
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    displayError('Connection to server failed. Please refresh the page.');
});

socket.on('connect', () => {
    console.log('Connected to server');
    displayMessage('Connected to server');
});

// Add more socket event listeners for debugging
socket.on('status', (data) => {
    console.log('Status:', data.message);
    displayMessage(data.message);
});

socket.on('error', (data) => {
    console.error('Server error:', data.message);
    displayError(data.message);
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
    },
    showSkeleton: true
};

// Setup world and bird
gameState.bird = setupWorld(scene);
camera.position.z = 10;
camera.position.y = 8;
camera.lookAt(gameState.bird.position);

// Load sound effects
function loadSounds() {
    // Check if assets/sounds directory likely exists, otherwise don't try to load sounds
    try {
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
    } catch (e) {
        console.log('Sound directory not available, continuing without sound.');
        // Make sure gameState.sounds is still an object to prevent errors
        gameState.sounds = {};
    }
}

// Optional sound loading - don't error if sounds aren't available
try {
    loadSounds();
} catch (e) {
    console.log('Sound system initialization failed, continuing without sound.');
    // Initialize empty sounds object to prevent errors
    gameState.sounds = {};
}

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
socket.on('motion_data', (data) => {
    console.log('Received motion data:', data);
    
    // If we have keypoints, draw the skeleton
    if (data.keypoints && data.keypoints.length > 0 && gameState.showSkeleton) {
        drawSkeleton(data.keypoints);
    }
    
    // Start game when first valid data is received
    if (!gameState.started) {
        gameState.started = true;
        displayMessage("Game started! Move your body to control the bird.");
        
        // Start background sound if available
        if (gameState.sounds.wind) {
            gameState.sounds.wind.play();
        }
        
        // Hide loading screen if it's still visible
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.classList.add('fade-out');
            setTimeout(() => {
                loadingElement.style.display = 'none';
            }, 500);
        }
    }
    
    // Update bird state
    gameState.birdState.height = data.position[1];
    gameState.birdState.speed = data.bird_data.speed;
    gameState.birdState.turn = data.rotation[1]; // Y-axis rotation
    
    // Update last command for sound effects
    if (data.state && data.state !== gameState.lastCommand) {
        playStateSound(data.state);
        gameState.lastCommand = data.state;
    }
    
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
    } else if (event.key === 's' || event.key === 'S') {
        gameState.showSkeleton = !gameState.showSkeleton;
    }
});

// Export the initGame function for use in index.html
export async function initGame() {
    console.log('Initializing game...');
    
    try {
        // Setup webcam and socket communication
        await setupVideo(socket);
        
        // Start the animation loop
        animate(0);
        
        // Let's also force hide the loading screen after 5 seconds as a fallback
        setTimeout(() => {
            const loadingElement = document.getElementById('loading');
            if (loadingElement && loadingElement.style.display !== 'none') {
                console.log('Forcing loading screen to hide after timeout');
                loadingElement.classList.add('fade-out');
                setTimeout(() => {
                    loadingElement.style.display = 'none';
                }, 500);
            }
        }, 5000);
        
        console.log('Game initialized successfully!');
        return true;
    } catch (error) {
        console.error('Error initializing game:', error);
        throw error;
    }
}

// Animation loop
function animate(timestamp) {
    // Request next frame first to ensure animation continues even if there's an error
    requestAnimationFrame(animate);
    
    if (gameState.paused) {
        return;
    }
    
    // Calculate delta time for smooth animation
    const delta = timestamp - gameState.lastTime || 0;
    gameState.lastTime = timestamp;
    
    try {
        // Update bird animation
        updateBird(gameState.bird, gameState.birdState, delta);
        
        // Update world elements
        updateWorld(scene, gameState);
        
        // Update camera if following bird
        if (!gameState.debug.freeCam) {
            // Position camera slightly behind and above bird
            const cameraTarget = new THREE.Vector3();
            cameraTarget.copy(gameState.bird.position);
            
            // Create an offset based on bird's rotation
            const cameraOffset = new THREE.Vector3(0, 2, 8);
            cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -gameState.bird.rotation.y);
            
            // Apply the offset
            camera.position.x = cameraTarget.x - cameraOffset.x;
            camera.position.y = cameraTarget.y + cameraOffset.y;
            camera.position.z = cameraTarget.z - cameraOffset.z;
            
            // Look at the bird
            camera.lookAt(cameraTarget);
        }
        
        // Render scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
        // Continue animation even if there's an error
    }
}
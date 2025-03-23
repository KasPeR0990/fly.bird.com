// Video.js - Handles video capture and skeleton visualization
let videoElement;
let canvas;
let videoWidth = 640;
let videoHeight = 480;
let ctx;
let processingBuffer = [];
let frameCount = 0;
let lastFrameTime = 0;
let frameInterval = 1000 / 10;  // Limit to 10 FPS initially (can be adaptive)
let connectionStatus = 'connecting';
let instructionsLayer;

// Keypoint connections for drawing skeleton
const POSE_CONNECTIONS = [
    [0, 1], // nose to neck
    [1, 2], // neck to right shoulder
    [1, 5], // neck to left shoulder
    [2, 3], // right shoulder to right elbow
    [3, 4], // right elbow to right wrist
    [5, 6], // left shoulder to left elbow
    [6, 7], // left elbow to left wrist
    [1, 8], // neck to right hip
    [1, 11], // neck to left hip
    [8, 9], // right hip to right knee
    [9, 10], // right knee to right ankle
    [11, 12], // left hip to left knee
    [12, 13]  // left knee to left ankle
];

// Setup video and canvas for pose detection
async function setupVideo(socket) {
    // Create video element if it doesn't exist
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.setAttribute('playsinline', '');
        videoElement.style.transform = 'scaleX(-1)';  // Mirror video
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        
        // Create canvas for drawing
        canvas = document.createElement('canvas');
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.transform = 'scaleX(-1)';  // Mirror canvas too
        
        // Add video and canvas to the container
        const videoContainer = document.getElementById('video-container');
        videoContainer.appendChild(videoElement);
        videoContainer.appendChild(canvas);
        
        // Get canvas context
        ctx = canvas.getContext('2d');
        
        // Create instructions layer
        instructionsLayer = document.createElement('div');
        instructionsLayer.id = 'instructions-layer';
        instructionsLayer.style.position = 'absolute';
        instructionsLayer.style.top = '0';
        instructionsLayer.style.left = '0';
        instructionsLayer.style.width = '100%';
        instructionsLayer.style.height = '100%';
        instructionsLayer.style.pointerEvents = 'none';
        instructionsLayer.style.color = '#4CFF4C';  // Neon green
        instructionsLayer.style.fontFamily = 'Arial, sans-serif';
        instructionsLayer.style.padding = '20px';
        instructionsLayer.style.boxSizing = 'border-box';
        instructionsLayer.style.display = 'flex';
        instructionsLayer.style.flexDirection = 'column';
        instructionsLayer.style.justifyContent = 'space-between';
        videoContainer.appendChild(instructionsLayer);
        
        // Upper instructions (glide/turn)
        const upperInstructions = document.createElement('div');
        upperInstructions.innerHTML = `
            <div style="text-align: center; font-size: 16px; margin-bottom: 5px;">
                <b>GLIDE:</b> Arms straight out horizontally
            </div>
            <div style="text-align: center; font-size: 16px;">
                <b>TURN:</b> Angle your torso left/right
            </div>
        `;
        instructionsLayer.appendChild(upperInstructions);
        
        // Lower instructions (dive/flap/gain height)
        const lowerInstructions = document.createElement('div');
        lowerInstructions.innerHTML = `
            <div style="text-align: center; font-size: 16px; margin-bottom: 5px;">
                <b>DIVE:</b> Bend forward with arms angled down
            </div>
            <div style="text-align: center; font-size: 16px; margin-bottom: 5px;">
                <b>FLAP:</b> Move arms up and down quickly
            </div>
            <div style="text-align: center; font-size: 16px;">
                <b>GAIN HEIGHT:</b> Flap while leaning back
            </div>
        `;
        instructionsLayer.appendChild(lowerInstructions);
    }
    
    // Request camera access
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            'video': {
                facingMode: 'user',
                width: { ideal: videoWidth },
                height: { ideal: videoHeight },
                frameRate: { ideal: 30 }
            }
        });
        
        videoElement.srcObject = stream;
        
        // Wait for video to be loaded
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                displayVideoStatus('Camera connected');
                sendFrames(socket);
                resolve(videoElement);
            };
        });
    } catch (error) {
        displayVideoStatus(`Error accessing camera: ${error.message}`, 'error');
        console.error('Error accessing camera:', error);
        throw error;
    }
}

// Send frames to the server for processing
function sendFrames(socket) {
    // Check if video is paused or connection is lost
    if (!videoElement || videoElement.paused || videoElement.ended || connectionStatus === 'disconnected') {
        setTimeout(() => sendFrames(socket), 500);
        return;
    }
    
    const now = Date.now();
    const elapsed = now - lastFrameTime;
    
    // Adjust frame rate based on connection status
    if (connectionStatus === 'good') {
        frameInterval = 1000 / 15;  // 15 FPS for good connection
    } else if (connectionStatus === 'slow') {
        frameInterval = 1000 / 8;   // 8 FPS for slow connection
    } else {
        frameInterval = 1000 / 10;  // 10 FPS default
    }
    
    // Process frame at desired interval
    if (elapsed > frameInterval) {
        lastFrameTime = now;
        
        // Create a temp canvas for processing at reduced resolution
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Use smaller resolution for better performance
        tempCanvas.width = 320;
        tempCanvas.height = 240;
        
        // Draw the current video frame to the temp canvas
        tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Convert to data URL and send to server
        const imageData = tempCanvas.toDataURL('image/jpeg', 0.7);
        
        // Add to processing buffer (to track pending frames)
        processingBuffer.push(now);
        
        // Send frame to server
        socket.emit('video_frame', { frame: imageData });
        
        // Update frame count (for metrics)
        frameCount++;
        if (frameCount % 30 === 0) {
            // Calculate and display FPS
            const fps = Math.round(30 * 1000 / (now - processingBuffer[processingBuffer.length - 30]));
            displayVideoStatus(`Camera active: ${fps} FPS`);
            
            // Update connection status based on buffer size
            if (processingBuffer.length > 60) {
                connectionStatus = 'slow';
                displayVideoStatus('Connection slow, reducing frame rate', 'warning');
            } else {
                connectionStatus = 'good';
            }
        }
    }
    
    // Clean up old frames from processing buffer
    const thresholdTime = now - 5000;  // Remove frames older than 5 seconds
    while (processingBuffer.length > 0 && processingBuffer[0] < thresholdTime) {
        processingBuffer.shift();
    }
    
    // Request next frame
    requestAnimationFrame(() => sendFrames(socket));
}

// Draw skeleton based on keypoints
function drawSkeleton(keypoints) {
    if (!ctx || !keypoints || keypoints.length === 0) {
        return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save the current transformation matrix
    ctx.save();
    
    // Draw skeleton lines
    ctx.strokeStyle = '#4CFF4C';  // Neon green
    ctx.lineWidth = 4;
    
    // Draw the connections
    for (const [i, j] of POSE_CONNECTIONS) {
        // Check if both keypoints exist
        if (i < keypoints.length && j < keypoints.length && 
            keypoints[i] && keypoints[j]) {
            
            // Get coordinates scaled to canvas size
            const kp1 = keypoints[i];
            const kp2 = keypoints[j];
            
            if (kp1 && kp2) {
                ctx.beginPath();
                ctx.moveTo(kp1.x * canvas.width, kp1.y * canvas.height);
                ctx.lineTo(kp2.x * canvas.width, kp2.y * canvas.height);
                ctx.stroke();
            }
        }
    }
    
    // Draw keypoints
    ctx.fillStyle = '#FFFFFF';  // White center for keypoints
    for (let i = 0; i < keypoints.length; i++) {
        const keypoint = keypoints[i];
        if (keypoint) {
            ctx.beginPath();
            ctx.arc(
                keypoint.x * canvas.width,
                keypoint.y * canvas.height,
                6, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add outer circle in neon green
            ctx.strokeStyle = '#4CFF4C';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(
                keypoint.x * canvas.width,
                keypoint.y * canvas.height,
                8, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    
    // Restore the transformation matrix
    ctx.restore();
}

// Display status message
function displayVideoStatus(message, type = 'info') {
    const statusDiv = document.getElementById('video-status');
    if (!statusDiv) {
        const videoStatusDiv = document.createElement('div');
        videoStatusDiv.id = 'video-status';
        videoStatusDiv.className = `status-message ${type}`;
        videoStatusDiv.textContent = message;
        document.getElementById('video-container').appendChild(videoStatusDiv);
    } else {
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
    }
}

// Clear video status message
function clearVideoStatus() {
    const statusDiv = document.getElementById('video-status');
    if (statusDiv) {
        statusDiv.remove();
    }
}

// Export functions
export { setupVideo, drawSkeleton, displayVideoStatus, clearVideoStatus };
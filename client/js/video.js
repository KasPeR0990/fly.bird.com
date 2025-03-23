export function setupVideo(socket) {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // Request camera with specific constraints for better performance
    const constraints = {
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
        }
    };
    
    // Display connection status
    displayVideoStatus("Requesting camera access...");
    
    navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                // Set canvas dimensions to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Clear status message
                clearVideoStatus();
                
                // Start sending frames
                sendFrames(socket, video);
            };
        })
        .catch((error) => {
            console.error("Error accessing camera:", error);
            displayVideoStatus("Camera access denied. Please allow camera access and refresh the page.", true);
        });
}

function sendFrames(socket, video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Create a processing buffer to reduce data size
    const processingWidth = 320;  // Lower resolution for processing
    const processingHeight = 240;
    
    // Resize the canvas for more efficient data transmission
    const processingCanvas = document.createElement('canvas');
    processingCanvas.width = processingWidth;
    processingCanvas.height = processingHeight;
    const processingCtx = processingCanvas.getContext('2d');
    
    // Track connection status
    let isConnected = socket.connected;
    socket.on('connect', () => { isConnected = true; });
    socket.on('disconnect', () => { isConnected = false; });
    
    // Send frames with adaptive rate
    let lastFrameTime = 0;
    let frameInterval = 100; // Start with 10fps
    
    function processFrame(timestamp) {
        // Adaptive frame rate
        if (timestamp - lastFrameTime < frameInterval) {
            requestAnimationFrame(processFrame);
            return;
        }
        
        lastFrameTime = timestamp;
        
        // Only send if connected
        if (isConnected && video.readyState === video.HAVE_ENOUGH_DATA) {
            // Draw video frame to processing canvas at reduced resolution
            processingCtx.drawImage(video, 0, 0, processingWidth, processingHeight);
            
            try {
                // Compress image and convert to base64
                const imageData = processingCanvas.toDataURL('image/jpeg', 0.7);
                const base64Data = imageData.split(',')[1];
                
                // Emit frame data
                socket.emit('video_frame', Buffer.from(base64Data, 'base64'));
            } catch (error) {
                console.error("Error processing video frame:", error);
            }
        }
        
        // Adapt frame rate based on connection status
        frameInterval = isConnected ? 100 : 500; // 10fps if connected, 2fps if disconnected
        
        requestAnimationFrame(processFrame);
    }
    
    requestAnimationFrame(processFrame);
}

// Reference poses for visualization help
const referencePoses = {
    glide: "Arms stretched straight out horizontally",
    turn: "Angle upper body in desired direction",
    flap: "Move arms up and down",
    dive: "Lean forward with arms slightly down",
    gainHeight: "Flap while leaning back"
};

export function drawSkeleton(keypoints) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // Clear the canvas with slight opacity to show video underneath
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!keypoints || keypoints.length === 0) {
        return;
    }
    
    // Define the lines connecting keypoints for the skeleton
    const lines = [
        [0, 1], // Left shoulder to right shoulder
        [0, 2], // Left shoulder to left elbow
        [1, 3], // Right shoulder to right elbow
        [2, 4], // Left elbow to left wrist
        [3, 5], // Right elbow to right wrist
        [6, 7], // Left hip to right hip
        [0, 6], // Left shoulder to left hip
        [1, 7], // Right shoulder to right hip
        [8, 0], // Nose to left shoulder
        [8, 1], // Nose to right shoulder
        [6, 8], // Left hip to nose (spine)
        [7, 8]  // Right hip to nose (spine)
    ];
    
    // Draw a bright neon green skeleton with outer glow
    ctx.lineWidth = 4;
    
    // Outer glow
    ctx.shadowColor = 'rgba(0, 255, 0, 1)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Neon green stroke
    ctx.strokeStyle = 'rgb(0, 255, 0)';
    
    // Draw skeleton lines with animated glow
    const pulseIntensity = 0.7 + 0.3 * Math.sin(Date.now() / 200);
    
    lines.forEach(([i, j]) => {
        if (keypoints[i] && keypoints[j]) {
            ctx.beginPath();
            
            // Calculate line coordinates
            const x1 = keypoints[i][0] * canvas.width;
            const y1 = keypoints[i][1] * canvas.height;
            const x2 = keypoints[j][0] * canvas.width;
            const y2 = keypoints[j][1] * canvas.height;
            
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Draw joint connection with a brighter glow
            ctx.strokeStyle = `rgba(0, 255, 100, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            
            // Reset for next line
            ctx.strokeStyle = 'rgb(0, 255, 0)';
            ctx.lineWidth = 4;
        }
    });
    
    // Draw keypoints as glowing circles
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(0, 255, 150, 0.9)';
    
    keypoints.forEach((point, i) => {
        if (!point) return;
        
        const x = point[0] * canvas.width;
        const y = point[1] * canvas.height;
        
        // Larger circles for main joints
        const radius = (i === 8 || i === 0 || i === 1) ? 7 : 5;
        
        // Draw point
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add a brighter center for more glow effect
        ctx.fillStyle = 'rgba(150, 255, 200, 1)';
        ctx.beginPath();
        ctx.arc(x, y, radius/2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Reset for next point
        ctx.fillStyle = 'rgba(0, 255, 150, 0.9)';
    });
    
    // Reset shadow for other drawing
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // Add instructions and visual feedback overlay
    drawInstructionsOverlay(ctx, canvas.width, canvas.height, keypoints);
    
    // Display physics indicators
    drawPhysicsIndicators(ctx, canvas.width, canvas.height, keypoints);
}

function drawPhysicsIndicators(ctx, width, height, keypoints) {
    if (!keypoints || keypoints.length < 9) return;
    
    // Extract key points
    const leftShoulder = keypoints[0];
    const rightShoulder = keypoints[1];
    const leftElbow = keypoints[2];
    const rightElbow = keypoints[3];
    const leftWrist = keypoints[4];
    const rightWrist = keypoints[5];
    const nose = keypoints[8];
    
    if (!leftShoulder || !rightShoulder || !nose) return;
    
    // Calculate metrics
    const shoulderMidX = (leftShoulder[0] + rightShoulder[0]) / 2;
    const shoulderMidY = (leftShoulder[1] + rightShoulder[1]) / 2;
    
    // Turn angle (body rotation)
    const torsoAngle = (shoulderMidX - nose[0]) * 20; // Amplify for visibility
    
    // Forward/backward lean
    const forwardLean = (nose[1] - shoulderMidY) * 10;
    
    // Draw physics indicator panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(width - 130, 10, 120, 150);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(width - 130, 10, 120, 150);
    
    // Title
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = 'rgb(0, 255, 0)';
    ctx.fillText('Physics Data', width - 120, 30);
    
    // Display metrics
    ctx.font = '12px Arial';
    
    // Turn angle
    ctx.fillText(`Turn: ${Math.abs(torsoAngle).toFixed(1)}°`, width - 120, 55);
    
    // Direction arrow
    const arrowX = width - 60;
    const arrowY = 55;
    const arrowDir = Math.sign(torsoAngle);
    if (Math.abs(torsoAngle) > 0.1) {
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY - 5);
        ctx.lineTo(arrowX + (arrowDir * 15), arrowY - 5);
        ctx.lineTo(arrowX + (arrowDir * 15), arrowY - 10);
        ctx.lineTo(arrowX + (arrowDir * 25), arrowY);
        ctx.lineTo(arrowX + (arrowDir * 15), arrowY + 10);
        ctx.lineTo(arrowX + (arrowDir * 15), arrowY + 5);
        ctx.lineTo(arrowX, arrowY + 5);
        ctx.closePath();
        ctx.fill();
    }
    
    // Lean (diving/climbing)
    ctx.fillText(`Lean: ${forwardLean.toFixed(1)}°`, width - 120, 80);
    
    // Direction arrow for lean
    const leanArrowX = width - 60;
    const leanArrowY = 80;
    const leanDir = Math.sign(forwardLean);
    if (Math.abs(forwardLean) > 0.1) {
        ctx.beginPath();
        ctx.moveTo(leanArrowX - 5, leanArrowY);
        ctx.lineTo(leanArrowX - 5, leanArrowY + (leanDir * 15));
        ctx.lineTo(leanArrowX - 10, leanArrowY + (leanDir * 15));
        ctx.lineTo(leanArrowX, leanArrowY + (leanDir * 25));
        ctx.lineTo(leanArrowX + 10, leanArrowY + (leanDir * 15));
        ctx.lineTo(leanArrowX + 5, leanArrowY + (leanDir * 15));
        ctx.lineTo(leanArrowX + 5, leanArrowY);
        ctx.closePath();
        ctx.fill();
    }
    
    // Flapping
    let flapSpeed = 0;
    if (leftWrist && rightWrist && leftElbow && rightElbow) {
        // Simple flap detection - vertical position of wrists relative to elbows
        const leftFlapHeight = leftElbow[1] - leftWrist[1];
        const rightFlapHeight = rightElbow[1] - rightWrist[1];
        
        // Combine both arm movements
        flapSpeed = Math.max(0, (leftFlapHeight + rightFlapHeight) * 5);
    }
    
    ctx.fillText(`Flap: ${flapSpeed.toFixed(1)}`, width - 120, 105);
    
    // Flap indicator - animated wings
    if (flapSpeed > 0.1) {
        const flapX = width - 70;
        const flapY = 105;
        const flapSize = Math.min(25, flapSpeed * 10);
        
        // Wing animation based on flap speed
        const wingAngle = Math.sin(Date.now() / (300 - flapSpeed * 50)) * Math.PI/4;
        
        // Left wing
        ctx.save();
        ctx.translate(flapX, flapY);
        ctx.rotate(-Math.PI/4 - wingAngle * flapSpeed);
        ctx.fillRect(-2, 0, -flapSize, 2);
        ctx.restore();
        
        // Right wing
        ctx.save();
        ctx.translate(flapX, flapY);
        ctx.rotate(Math.PI/4 + wingAngle * flapSpeed);
        ctx.fillRect(2, 0, flapSize, 2);
        ctx.restore();
    }
    
    // Calculate glide state
    let isGliding = false;
    if (leftElbow && rightElbow && leftWrist && rightWrist) {
        // Check if arms are horizontally extended
        const leftArmHorizontal = Math.abs(leftShoulder[1] - leftElbow[1]) < 0.05;
        const rightArmHorizontal = Math.abs(rightShoulder[1] - rightElbow[1]) < 0.05;
        
        // Check if arms are straight
        const leftArmStraight = Math.abs(leftElbow[0] - leftWrist[0]) > 0.1;
        const rightArmStraight = Math.abs(rightElbow[0] - rightWrist[0]) > 0.1;
        
        isGliding = (leftArmHorizontal && rightArmHorizontal && leftArmStraight && rightArmStraight);
    }
    
    // Glide indicator
    ctx.fillText(`Glide: ${isGliding ? 'Active' : 'Off'}`, width - 120, 130);
    if (isGliding) {
        ctx.fillStyle = 'rgba(0, 255, 100, 0.8)';
        ctx.fillRect(width - 70, 125, 25, 5);
    }
    
    // Current mode
    let currentMode = "Falling";
    let modeColor = 'red';
    
    if (isGliding) {
        currentMode = "Gliding";
        modeColor = 'rgb(0, 255, 100)';
    } else if (flapSpeed > 0.3) {
        if (forwardLean < -0.1) {
            currentMode = "Gaining Height";
            modeColor = 'rgb(255, 200, 0)';
        } else {
            currentMode = "Flying";
            modeColor = 'rgb(0, 200, 255)';
        }
    } else if (forwardLean > 0.2) {
        currentMode = "Diving";
        modeColor = 'rgb(255, 100, 0)';
    } else if (Math.abs(torsoAngle) > 0.3) {
        currentMode = torsoAngle > 0 ? "Turning Left" : "Turning Right";
        modeColor = 'rgb(200, 100, 255)';
    }
    
    ctx.fillStyle = modeColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(currentMode, width - 120, 150);
}

function drawInstructionsOverlay(ctx, width, height, keypoints) {
    // Draw reference pose diagram on the left side
    const boxWidth = 220;
    const boxHeight = 180;
    const padding = 15;
    
    // Instructions box background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, boxWidth, boxHeight);
    
    // Title
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'rgb(0, 255, 0)';
    ctx.fillText('Movement Controls:', 20, 30);
    
    // Instructions list
    ctx.font = '14px Arial';
    
    const instructions = [
        {text: "• Arms horizontal = Glide", color: '#7FFF7F'},
        {text: "• Lean body = Turn", color: '#7FBFFF'},
        {text: "• Flap arms = Fly upward", color: '#FF7FFF'},
        {text: "• Lean forward = Dive", color: '#FFD700'},
        {text: "• Flap + lean back = Gain height", color: '#FF9F7F'}
    ];
    
    instructions.forEach((instr, i) => {
        ctx.fillStyle = instr.color;
        ctx.fillText(instr.text, 20, 55 + i * 22);
    });
    
    // Physics tips
    ctx.fillStyle = 'rgb(200, 255, 200)';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Physics Tips:', 20, 165);
    ctx.font = '12px Arial';
    ctx.fillText('• Faster flapping = More speed', 20, 180);
    ctx.fillText('• Stop flapping = Fall due to gravity', 20, 195);
    
    // Show hide tip
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(200, 255, 200, 0.7)';
    ctx.fillText('Press H to hide/show this guide', 20, boxHeight + 15);
}

function displayVideoStatus(message, isError = false) {
    let statusElement = document.getElementById('video-status');
    
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'video-status';
        document.getElementById('video-container').appendChild(statusElement);
    }
    
    statusElement.textContent = message;
    statusElement.className = isError ? 'error' : '';
    statusElement.style.display = 'block';
}

function clearVideoStatus() {
    const statusElement = document.getElementById('video-status');
    if (statusElement) {
        statusElement.style.display = 'none';
    }
}
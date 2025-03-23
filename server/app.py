import os
import time
import cv2
import numpy as np
import base64
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
import json
from motion_tracking import process_frame
from utils import BirdPhysics, World

app = Flask(__name__, 
    static_folder="../client",
    template_folder="../client")
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
frame_count = 0
last_process_time = time.time()
fps_limit = 15  # Maximum FPS to process
bird_physics = BirdPhysics()
world = World()

# Process base64 image data
def process_image(base64_image):
    try:
        # Extract the base64 encoded binary data from the input string
        image_data = base64_image.split(',')[1]
        # Decode base64 string
        image_bytes = base64.b64decode(image_data)
        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error processing image: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    socketio.emit('status', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('video_frame')
def handle_video_frame(data):
    global frame_count, last_process_time, bird_physics, world
    
    # Throttle processing to save CPU
    current_time = time.time()
    time_diff = current_time - last_process_time
    
    if time_diff < 1.0/fps_limit:
        return
    
    try:
        # Process the frame
        frame = process_image(data['frame'])
        
        if frame is not None:
            # Get movement commands and keypoints from the pose estimation
            commands, keypoints = process_frame(frame)
            
            # Update bird physics based on commands
            bird_physics.update(commands)
            
            # Update world state
            world_data = world.update(bird_physics)
            
            # Send data back to client
            response_data = {
                'position': bird_physics.get_position(),
                'rotation': bird_physics.get_rotation(),
                'state': commands.get('state', 'none'),
                'world': world_data,
                'bird_data': {
                    'energy': bird_physics.energy,
                    'speed': bird_physics.speed,
                    'height': bird_physics.position[1]
                }
            }
            
            # Include keypoints for skeleton visualization
            client_keypoints = []
            for kp in keypoints:
                if kp is not None:
                    client_keypoints.append({"x": float(kp[0]), "y": float(kp[1])})
                else:
                    client_keypoints.append(None)
                    
            response_data['keypoints'] = client_keypoints
            
            # Send response to client
            socketio.emit('motion_data', response_data)
            
            # Update frame processing stats
            frame_count += 1
            last_process_time = current_time
            
            # Every 30 frames, print stats
            if frame_count % 30 == 0:
                fps = 30 / (current_time - (last_process_time - 30/fps_limit))
                print(f"Processing at {fps:.1f} FPS")
    
    except Exception as e:
        print(f"Error in handle_video_frame: {e}")
        socketio.emit('error', {'message': f'Server error: {str(e)}'})

if __name__ == '__main__':
    print("Starting Bird Movement Game server...")
    print("Ensure the client directory is set up correctly")
    
    # Create models directory if it doesn't exist
    os.makedirs("server/models/pose", exist_ok=True)
    
    # Check if the prototxt file exists, if not suggest download
    protoFile = "server/models/pose/pose_deploy_linevec.prototxt"
    weightsFile = "server/models/pose/pose_iter_440000.caffemodel"
    
    if not os.path.exists(protoFile) or not os.path.exists(weightsFile):
        print("\nNote: OpenPose model files not found. The application will use a fallback mode.")
        print("To enable full pose detection capabilities, download the model files as mentioned when the app starts.")
        print("A fallback method using HOG person detector will be used until the model files are available.")
    
    # Start the server
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
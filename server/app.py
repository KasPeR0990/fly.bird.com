from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import time
from motion_tracking import process_frame
from utils import MovementSmoother, BirdPhysics, TimingUtility

app = Flask(__name__, static_folder="../client")
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize utilities
movement_smoother = MovementSmoother(window_size=5)
bird_physics = BirdPhysics()
timing_utility = TimingUtility(target_fps=30)

# Store player state
player_state = {
    'speed': 0,
    'height': 5,  # Start above ground
    'turn': 0,
    'last_update': time.time()
}

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@socketio.on('video_frame')
def handle_video_frame(data):
    global player_state
    
    try:
        # Decode frame from base64
        nparr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            emit('error', {'message': 'Invalid frame data'})
            return
            
        # Process frame
        commands, keypoints = process_frame(frame)
        
        # Smooth movements to prevent jitter
        smoothed_commands = movement_smoother.smooth(commands)
        
        # Calculate physics
        current_time = time.time()
        delta_time = timing_utility.get_delta_time(current_time)
        player_state = bird_physics.apply_physics(player_state, smoothed_commands)
        player_state['last_update'] = current_time
        
        # Send back movement commands, keypoints, and updated player state
        emit('movement_data', {
            'commands': smoothed_commands, 
            'keypoints': keypoints,
            'bird_state': {
                'speed': player_state['speed'],
                'height': player_state['height'],
                'turn': player_state['turn']
            }
        })
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        emit('error', {'message': str(e)})

@socketio.on('connect')
def handle_connect():
    emit('connected', {'message': 'Connected to server'})
    print("Client connected")

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")

if __name__ == '__main__':
    print("Starting server on http://localhost:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
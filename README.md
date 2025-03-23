This is a vibe coded game, i haven't checked the code, it's only ai generated. My intention creating this was to try out cursor's agentic mode and see it's capabilities.

This is a movement tracking game, where the player flies the bird my moving their body/ arms. It uses the webcam, but does not store any images from the cam. 



# Bird Movement Game

A 3D bird flying game controlled by your body movements using a webcam. This game uses OpenCV for motion tracking and Three.js for 3D rendering.

## Requirements

- Python 3.7+ 
- Webcam
- Modern browser with WebGL support

## Installation

1. Clone this repository:
```
git clone https://your-repository-url/bird-movement-game.git
cd bird-movement-game
```

2. Install Python dependencies:
```
pip install flask flask-socketio opencv-python numpy
```

Or use the npm script:
```
npm run install-deps
```

3. Download the OpenCV pose model files (optional - a fallback mode will be used if not available):
   - Create the directory: `server/models/pose/`
   - Download the pose proto file: [pose_deploy_linevec.prototxt](https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/models/pose/coco/pose_deploy_linevec.prototxt)
   - For full pose detection capability, download the model weights file from [OpenPose GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/tree/master/models)

## Running the Game

1. Start the server:
```
python server/app.py
```

Or use the npm script:
```
npm start
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

3. Allow camera access when prompted.

## Game Controls

Control the bird with your body movements:

- **Glide**: Extend your arms straight out horizontally
- **Turn**: Angle your upper body left or right
- **Dive**: Bend forward with arms slightly down
- **Flap**: Move your arms up and down quickly
- **Gain Height**: Flap while leaning back

Keyboard controls:
- **D**: Toggle debug mode
- **C**: Toggle camera follow
- **S**: Toggle skeleton display
- **P**: Pause/Resume game

## How It Works

1. The webcam captures your movements
2. OpenCV's pose detection identifies key body points
3. The server processes these points to determine flying commands
4. The bird responds to your movements in real-time

## Project Structure

- **server/** - Python server files
  - **app.py** - Main Flask server
  - **motion_tracking.py** - OpenCV pose detection
  - **utils.py** - Physics and utility functions
  - **models/** - OpenCV model files
- **client/** - Frontend files
  - **js/** - JavaScript files
  - **css/** - Stylesheets
  - **index.html** - Main HTML file

## Troubleshooting

- If the camera doesn't connect, check your browser permissions
- If pose detection doesn't work well, try better lighting and ensure your whole body is visible
- If you're using a fallback mode (no pose model files), expect limited detection accuracy
- For performance issues, try closing other applications or reducing the video container size

## License

MIT

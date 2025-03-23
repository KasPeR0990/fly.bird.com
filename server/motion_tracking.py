import cv2
import numpy as np
import math
from collections import deque

# Initialize OpenCV's Deep Neural Network (DNN) module for pose detection
# We'll use the OpenPose model which is supported by OpenCV
try:
    # Load the pose detection model
    protoFile = "server/models/pose/pose_deploy_linevec.prototxt"
    weightsFile = "server/models/pose/pose_iter_440000.caffemodel"
    net = cv2.dnn.readNetFromCaffe(protoFile, weightsFile)
    modelLoaded = True
except Exception as e:
    print(f"Error loading pose model: {e}")
    modelLoaded = False

# Constants for OpenPose
BODY_PARTS = {
    "Nose": 0, "Neck": 1, 
    "RShoulder": 2, "RElbow": 3, "RWrist": 4,
    "LShoulder": 5, "LElbow": 6, "LWrist": 7,
    "RHip": 8, "RKnee": 9, "RAnkle": 10,
    "LHip": 11, "LKnee": 12, "LAnkle": 13,
    "REye": 14, "LEye": 15, "REar": 16, "LEar": 17
}

# Store previous positions for velocity calculation
prev_wrist_positions = {
    'left': deque(maxlen=5),
    'right': deque(maxlen=5)
}

def download_model_files():
    """Download OpenPose model files if not present"""
    import os
    
    # Create models directory if it doesn't exist
    os.makedirs("server/models/pose", exist_ok=True)
    
    # URLs for the model files
    proto_url = "https://raw.githubusercontent.com/CMU-Perceptual-Computing-Lab/openpose/master/models/pose/coco/pose_deploy_linevec.prototxt"
    weights_url = "https://drive.google.com/uc?export=download&id=1wE34s_V-CheZGlfGO3kOgCDBGCTbKbCN"  # Will redirect to download
    
    # Download prototxt file
    if not os.path.exists(protoFile):
        print("Downloading pose model prototxt file...")
        try:
            import urllib.request
            urllib.request.urlretrieve(proto_url, protoFile)
            print("Downloaded prototxt file successfully")
        except Exception as e:
            print(f"Error downloading prototxt file: {e}")
    
    # For the weights file, it's large so we'll provide instructions
    if not os.path.exists(weightsFile):
        print("\nIMPORTANT: You need to manually download the pose model weights file:")
        print("1. Visit: https://github.com/CMU-Perceptual-Computing-Lab/openpose/tree/master/models")
        print("2. Download the 'pose_iter_440000.caffemodel' file")
        print("3. Place it in the server/models/pose/ directory")
        print("\nAlternatively, you can try using a pretrained HOG-based human detector from OpenCV.")
        # Fallback to HOG detector
        return False
    
    return True

def process_frame(frame):
    """Process a frame and return commands and keypoints"""
    # Check if model is loaded, if not try a fallback method
    global modelLoaded
    
    if not modelLoaded:
        modelLoaded = download_model_files()
        
        if not modelLoaded:
            # Fallback to simpler HOG-based detector
            return process_frame_hog_fallback(frame)
    
    # Prepare frame for detection
    frameWidth = frame.shape[1]
    frameHeight = frame.shape[0]
    
    # Convert frame to blob for neural network
    inWidth = 368
    inHeight = 368
    inpBlob = cv2.dnn.blobFromImage(frame, 1.0 / 255, (inWidth, inHeight), (0, 0, 0), swapRB=False, crop=False)
    
    # Set the blob as input to the network
    net.setInput(inpBlob)
    
    # Forward pass through the network
    output = net.forward()
    
    # Process the output to get keypoints
    keypoints = []
    detected_keypoints = {}
    confidence_threshold = 0.1
    
    # Extract the keypoints
    for i in range(len(BODY_PARTS)):
        # Confidence map for bodypart
        probMap = output[0, i, :, :]
        probMap = cv2.resize(probMap, (frameWidth, frameHeight))
        
        # Find global maxima of the probability map
        minVal, prob, minLoc, point = cv2.minMaxLoc(probMap)
        
        if prob > confidence_threshold:
            # Normalize coordinates
            x = point[0] / frameWidth
            y = point[1] / frameHeight
            
            # Store keypoint
            keypoints.append((x, y))
            detected_keypoints[i] = (x, y)
        else:
            # If keypoint not detected, add None
            keypoints.append(None)
    
    # Map keypoints for easy access
    nose = detected_keypoints.get(BODY_PARTS["Nose"])
    neck = detected_keypoints.get(BODY_PARTS["Neck"])
    left_shoulder = detected_keypoints.get(BODY_PARTS["LShoulder"])
    right_shoulder = detected_keypoints.get(BODY_PARTS["RShoulder"])
    left_elbow = detected_keypoints.get(BODY_PARTS["LElbow"])
    right_elbow = detected_keypoints.get(BODY_PARTS["RElbow"])
    left_wrist = detected_keypoints.get(BODY_PARTS["LWrist"])
    right_wrist = detected_keypoints.get(BODY_PARTS["RWrist"])
    left_hip = detected_keypoints.get(BODY_PARTS["LHip"])
    right_hip = detected_keypoints.get(BODY_PARTS["RHip"])
    
    # Initialize commands
    commands = {"state": "none"}
    
    # If not enough keypoints detected, return early
    if not all([left_shoulder, right_shoulder, left_elbow, right_elbow, left_wrist, right_wrist]):
        return commands, keypoints
    
    # Store current wrist positions for velocity calculation
    if left_wrist:
        prev_wrist_positions['left'].append(left_wrist)
    if right_wrist:
        prev_wrist_positions['right'].append(right_wrist)
    
    # Calculate shoulder width for normalization
    shoulder_width = 0
    if left_shoulder and right_shoulder:
        shoulder_width = math.sqrt((right_shoulder[0] - left_shoulder[0])**2 + 
                                  (right_shoulder[1] - left_shoulder[1])**2)
    
    # Gliding: Arms straight out horizontally
    if left_shoulder and left_elbow and left_wrist and right_shoulder and right_elbow and right_wrist:
        left_arm_angle = calculate_angle_points(left_shoulder, left_elbow, left_wrist)
        right_arm_angle = calculate_angle_points(right_shoulder, right_elbow, right_wrist)
        
        # Check if arms are straight (close to 180 degrees)
        arms_straight = abs(left_arm_angle - 180) < 25 and abs(right_arm_angle - 180) < 25
        
        # Check if arms are horizontal
        left_arm_horizontal = abs(left_shoulder[1] - left_elbow[1]) < 0.1
        right_arm_horizontal = abs(right_shoulder[1] - right_elbow[1]) < 0.1
        
        if arms_straight and left_arm_horizontal and right_arm_horizontal:
            commands["state"] = "glide"
    
    # Turning: Body angled to the side
    if left_shoulder and right_shoulder and left_hip and right_hip:
        torso_angle = calculate_torso_angle_points(left_shoulder, right_shoulder, left_hip, right_hip)
        if torso_angle > 15:
            commands["turn"] = "right"
            commands["turn_angle"] = min(torso_angle, 60)
        elif torso_angle < -15:
            commands["turn"] = "left"
            commands["turn_angle"] = min(abs(torso_angle), 60)
    
    # Diving: Bending forward with arms slightly down
    if nose and left_shoulder and right_shoulder and left_hip and right_hip:
        shoulder_mid_y = (left_shoulder[1] + right_shoulder[1]) / 2
        torso_forward_angle = calculate_forward_angle_points(
            nose, shoulder_mid_y, left_hip[1], right_hip[1]
        )
        
        # Arms angled down from shoulders
        arms_down = (left_wrist and left_elbow and left_shoulder and
                    left_wrist[1] > left_elbow[1] > left_shoulder[1] and
                    right_wrist and right_elbow and right_shoulder and
                    right_wrist[1] > right_elbow[1] > right_shoulder[1])
        
        if torso_forward_angle > 30 and arms_down:
            commands["state"] = "dive"
            commands["dive_intensity"] = min(torso_forward_angle / 60, 1.0)
    
    # Flapping: Detect vertical movement of arms
    if len(prev_wrist_positions['left']) >= 2 and len(prev_wrist_positions['right']) >= 2:
        # Calculate vertical velocity
        left_wrist_velocity = prev_wrist_positions['left'][-1][1] - prev_wrist_positions['left'][-2][1]
        right_wrist_velocity = prev_wrist_positions['right'][-1][1] - prev_wrist_positions['right'][-2][1]
        
        # Normalize by shoulder width
        if shoulder_width > 0:
            left_wrist_velocity = left_wrist_velocity / shoulder_width
            right_wrist_velocity = right_wrist_velocity / shoulder_width
        
        # Detect flapping based on arm motion and position
        flapping_threshold = 0.02
        arms_above_shoulders = (left_wrist and left_shoulder and left_wrist[1] < left_shoulder[1] and
                               right_wrist and right_shoulder and right_wrist[1] < right_shoulder[1])
        
        is_flapping = (abs(left_wrist_velocity) > flapping_threshold and 
                      abs(right_wrist_velocity) > flapping_threshold) or arms_above_shoulders
        
        if is_flapping:
            commands["flap"] = True
            
            # Calculate flap intensity
            arm_height = 0
            if left_shoulder and left_wrist and right_shoulder and right_wrist:
                arm_height = ((left_shoulder[1] - left_wrist[1]) + (right_shoulder[1] - right_wrist[1])) / 2
            
            velocity_component = (abs(left_wrist_velocity) + abs(right_wrist_velocity)) / 2
            commands["flap_intensity"] = min(arm_height * 3 + velocity_component * 10, 1.0)
    
    # Gaining More Height: Flapping while angling torso upward
    if "flap" in commands and nose and left_shoulder and right_shoulder and left_hip and right_hip:
        shoulder_mid_y = (left_shoulder[1] + right_shoulder[1]) / 2
        torso_forward_angle = calculate_forward_angle_points(
            nose, shoulder_mid_y, left_hip[1], right_hip[1]
        )
        
        if torso_forward_angle < -20:
            commands["state"] = "gain_height"
            commands["height_gain"] = min(abs(torso_forward_angle) / 40, 1.0)
    
    return commands, keypoints

def process_frame_hog_fallback(frame):
    """Fallback method using HOG detector when OpenPose is not available"""
    # Initialize HOG detector
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    
    # Detect people in the frame
    boxes, weights = hog.detectMultiScale(frame, winStride=(8, 8), padding=(4, 4), scale=1.05)
    
    # Initialize commands and keypoints
    commands = {"state": "none"}
    keypoints = [None] * 9  # 9 keypoints to match expected output
    
    if len(boxes) == 0:
        return commands, keypoints
    
    # Get the largest detection box (assumed to be the main person)
    largest_box = max(boxes, key=lambda box: box[2] * box[3])
    x, y, w, h = largest_box
    
    # Normalize coordinates to 0-1 range
    frame_height, frame_width = frame.shape[:2]
    
    # Generate simple keypoints based on the bounding box
    nose_x = (x + w/2) / frame_width
    nose_y = (y + h/4) / frame_height
    
    left_shoulder_x = (x + w/4) / frame_width
    left_shoulder_y = (y + h/3) / frame_height
    
    right_shoulder_x = (x + 3*w/4) / frame_width
    right_shoulder_y = (y + h/3) / frame_height
    
    left_elbow_x = (x + w/5) / frame_width
    left_elbow_y = (y + h/2) / frame_height
    
    right_elbow_x = (x + 4*w/5) / frame_width
    right_elbow_y = (y + h/2) / frame_height
    
    left_wrist_x = (x + w/6) / frame_width
    left_wrist_y = (y + 2*h/3) / frame_height
    
    right_wrist_x = (x + 5*w/6) / frame_width
    right_wrist_y = (y + 2*h/3) / frame_height
    
    left_hip_x = (x + w/3) / frame_width
    left_hip_y = (y + 2*h/3) / frame_height
    
    right_hip_x = (x + 2*w/3) / frame_width
    right_hip_y = (y + 2*h/3) / frame_height
    
    # Assemble keypoints
    keypoints = [
        (left_shoulder_x, left_shoulder_y),    # Left shoulder
        (right_shoulder_x, right_shoulder_y),  # Right shoulder
        (left_elbow_x, left_elbow_y),          # Left elbow
        (right_elbow_x, right_elbow_y),        # Right elbow
        (left_wrist_x, left_wrist_y),          # Left wrist
        (right_wrist_x, right_wrist_y),        # Right wrist
        (left_hip_x, left_hip_y),              # Left hip
        (right_hip_x, right_hip_y),            # Right hip
        (nose_x, nose_y)                       # Nose
    ]
    
    # Simple movement detection based on position
    # This is a very simplified approximation
    
    # Detect if arms are outstretched (gliding)
    arms_horizontal = abs(left_shoulder_y - left_elbow_y) < 0.05 and abs(right_shoulder_y - right_elbow_y) < 0.05
    if arms_horizontal:
        commands["state"] = "glide"
    
    # Detect turning
    torso_center_x = (left_shoulder_x + right_shoulder_x) / 2
    if abs(torso_center_x - 0.5) > 0.1:
        if torso_center_x < 0.5:
            commands["turn"] = "left"
            commands["turn_angle"] = min(abs(0.5 - torso_center_x) * 100, 60)
        else:
            commands["turn"] = "right"
            commands["turn_angle"] = min(abs(torso_center_x - 0.5) * 100, 60)
    
    return commands, keypoints

def calculate_angle_points(p1, p2, p3):
    """Calculate angle between three points (in degrees)"""
    a = math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
    b = math.sqrt((p3[0] - p2[0])**2 + (p3[1] - p2[1])**2)
    c = math.sqrt((p3[0] - p1[0])**2 + (p3[1] - p1[1])**2)
    
    # Handle cases where points might be collinear
    if a * b == 0:
        return 0
    
    cos_angle = (a**2 + b**2 - c**2) / (2 * a * b)
    # Clamp value to prevent domain errors due to floating point precision
    cos_angle = max(min(cos_angle, 1.0), -1.0)
    
    angle = math.degrees(math.acos(cos_angle))
    return angle

def calculate_torso_angle_points(ls, rs, lh, rh):
    """Calculate torso angle relative to vertical"""
    shoulder_mid = ((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2)
    hip_mid = ((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2)
    return math.degrees(math.atan2(shoulder_mid[0] - hip_mid[0], shoulder_mid[1] - hip_mid[1]))

def calculate_forward_angle_points(nose, shoulder_mid_y, left_hip_y, right_hip_y):
    """Calculate how much the upper body is leaning forward/backward"""
    hip_mid_y = (left_hip_y + right_hip_y) / 2
    torso_length = hip_mid_y - shoulder_mid_y
    
    if torso_length == 0:
        return 0
        
    nose_forward = (nose[1] - shoulder_mid_y) / torso_length
    # Convert to approximate angle: positive = leaning forward, negative = leaning backward
    return 60 * nose_forward
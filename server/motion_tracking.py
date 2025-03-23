import cv2
import mediapipe as mp
import math
import numpy as np
from collections import deque

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Store previous positions for velocity calculation
prev_wrist_positions = {
    'left': deque(maxlen=5),
    'right': deque(maxlen=5)
}

def process_frame(frame):
    # Convert frame to RGB
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(frame_rgb)
    
    if not results.pose_landmarks:
        return {"state": "none"}, []

    landmarks = results.pose_landmarks.landmark
    # Extract key points
    left_shoulder = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]
    right_shoulder = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]
    left_elbow = landmarks[mp_pose.PoseLandmark.LEFT_ELBOW]
    right_elbow = landmarks[mp_pose.PoseLandmark.RIGHT_ELBOW]
    left_wrist = landmarks[mp_pose.PoseLandmark.LEFT_WRIST]
    right_wrist = landmarks[mp_pose.PoseLandmark.RIGHT_WRIST]
    left_hip = landmarks[mp_pose.PoseLandmark.LEFT_HIP]
    right_hip = landmarks[mp_pose.PoseLandmark.RIGHT_HIP]
    nose = landmarks[mp_pose.PoseLandmark.NOSE]

    # Calculate angles and movements
    commands = {}
    
    # Shoulder width for normalization
    shoulder_width = math.sqrt((right_shoulder.x - left_shoulder.x)**2 + 
                              (right_shoulder.y - left_shoulder.y)**2)
    
    # Store current wrist positions for velocity calculation
    prev_wrist_positions['left'].append((left_wrist.x, left_wrist.y))
    prev_wrist_positions['right'].append((right_wrist.x, right_wrist.y))
    
    # Gliding: Arms straight out horizontally (as shown in the third image)
    left_arm_angle = calculate_angle(left_shoulder, left_elbow, left_wrist)
    right_arm_angle = calculate_angle(right_shoulder, right_elbow, right_wrist)
    
    # Check if arms are straight (close to 180 degrees)
    arms_straight = abs(left_arm_angle - 180) < 25 and abs(right_arm_angle - 180) < 25
    
    # Check if arms are horizontal (shoulders and elbows at similar height)
    left_arm_horizontal = abs(left_shoulder.y - left_elbow.y) < 0.1
    right_arm_horizontal = abs(right_shoulder.y - right_elbow.y) < 0.1
    
    if arms_straight and left_arm_horizontal and right_arm_horizontal:
        commands["state"] = "glide"
    
    # Turning: Body angled to the side (as shown in second and fourth images)
    torso_angle = calculate_torso_angle(left_shoulder, right_shoulder, left_hip, right_hip)
    if torso_angle > 15:  # Increased threshold for more definitive turning
        commands["turn"] = "right"
        commands["turn_angle"] = min(torso_angle, 60)  # Allow more turning range based on images
    elif torso_angle < -15:
        commands["turn"] = "left"
        commands["turn_angle"] = min(abs(torso_angle), 60)
    
    # Diving: Bending forward with arms slightly down (as in first image)
    shoulder_mid_y = (left_shoulder.y + right_shoulder.y) / 2
    torso_forward_angle = calculate_forward_angle(nose, shoulder_mid_y, left_hip.y, right_hip.y)
    
    # Arms angled down from shoulders
    arms_down = left_wrist.y > left_elbow.y > left_shoulder.y and right_wrist.y > right_elbow.y > right_shoulder.y
    
    if torso_forward_angle > 30 and arms_down:  # More pronounced forward lean
        commands["state"] = "dive"
        commands["dive_intensity"] = min(torso_forward_angle / 60, 1.0)  # Normalize to 0-1
    
    # Flapping: Detect vertical movement of arms (shown in multiple images)
    # Calculate vertical velocity of wrists
    left_wrist_velocity = 0
    right_wrist_velocity = 0
    
    if len(prev_wrist_positions['left']) >= 2:
        # Calculate vertical velocity (negative = moving up, positive = moving down)
        left_wrist_velocity = prev_wrist_positions['left'][-1][1] - prev_wrist_positions['left'][-2][1]
        right_wrist_velocity = prev_wrist_positions['right'][-1][1] - prev_wrist_positions['right'][-2][1]
    
    # Normalize by shoulder width to account for different distances from camera
    if shoulder_width > 0:
        left_wrist_velocity = left_wrist_velocity / shoulder_width
        right_wrist_velocity = right_wrist_velocity / shoulder_width
    
    # Detect flapping based on arm motion and position
    flapping_threshold = 0.02  # Adjust based on testing
    arms_above_shoulders = left_wrist.y < left_shoulder.y and right_wrist.y < right_shoulder.y
    
    # Active flapping - either arms are moving significantly or positioned above shoulders
    is_flapping = (abs(left_wrist_velocity) > flapping_threshold and 
                  abs(right_wrist_velocity) > flapping_threshold) or arms_above_shoulders
    
    if is_flapping:
        commands["flap"] = True
        
        # Calculate flap intensity based on arm position and velocity
        arm_height = ((left_shoulder.y - left_wrist.y) + (right_shoulder.y - right_wrist.y)) / 2
        velocity_component = (abs(left_wrist_velocity) + abs(right_wrist_velocity)) / 2
        commands["flap_intensity"] = min(arm_height * 3 + velocity_component * 10, 1.0)
    
    # Gaining More Height: Flapping while angling torso upward (combination of flapping and leaning back)
    if "flap" in commands and torso_forward_angle < -20:  # Negative angle means leaning back
        commands["state"] = "gain_height"
        commands["height_gain"] = min(abs(torso_forward_angle) / 40, 1.0)  # Normalize to 0-1
    
    # Keypoints for skeleton visualization
    keypoints = [
        (left_shoulder.x, left_shoulder.y),
        (right_shoulder.x, right_shoulder.y),
        (left_elbow.x, left_elbow.y),
        (right_elbow.x, right_elbow.y),
        (left_wrist.x, left_wrist.y),
        (right_wrist.x, right_wrist.y),
        (left_hip.x, left_hip.y),
        (right_hip.x, right_hip.y),
        (nose.x, nose.y)
    ]
    
    return commands, keypoints

def calculate_angle(p1, p2, p3):
    # Calculate angle between three points (in degrees)
    a = math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2)
    b = math.sqrt((p3.x - p2.x)**2 + (p3.y - p2.y)**2)
    c = math.sqrt((p3.x - p1.x)**2 + (p3.y - p1.y)**2)
    
    # Handle cases where points might be collinear
    if a * b == 0:
        return 0
    
    cos_angle = (a**2 + b**2 - c**2) / (2 * a * b)
    # Clamp value to prevent domain errors due to floating point precision
    cos_angle = max(min(cos_angle, 1.0), -1.0)
    
    angle = math.degrees(math.acos(cos_angle))
    return angle

def calculate_torso_angle(ls, rs, lh, rh):
    # Calculate torso angle relative to vertical
    shoulder_mid = ((ls.x + rs.x) / 2, (ls.y + rs.y) / 2)
    hip_mid = ((lh.x + rh.x) / 2, (lh.y + rh.y) / 2)
    return math.degrees(math.atan2(shoulder_mid[0] - hip_mid[0], shoulder_mid[1] - hip_mid[1]))

def calculate_forward_angle(nose, shoulder_mid_y, left_hip_y, right_hip_y):
    # Calculate how much the upper body is leaning forward/backward
    hip_mid_y = (left_hip_y + right_hip_y) / 2
    torso_length = hip_mid_y - shoulder_mid_y
    
    if torso_length == 0:
        return 0
        
    nose_forward = (nose.y - shoulder_mid_y) / torso_length
    # Convert to angle: positive = leaning forward, negative = leaning backward
    return 60 * nose_forward  # Scale to approximate angle
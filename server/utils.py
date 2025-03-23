import time
import math
import random
import numpy as np
from collections import deque

# Movement smoothing
class MovementSmoother:
    def __init__(self, window_size=5):
        self.window_size = window_size
        self.command_history = {}
        
    def smooth(self, commands):
        """Apply smoothing to movement commands to prevent jittery movements"""
        smoothed_commands = commands.copy()
        
        for key, value in commands.items():
            if key not in self.command_history:
                self.command_history[key] = deque(maxlen=self.window_size)
            
            # Only smooth numeric values
            if isinstance(value, (int, float)):
                self.command_history[key].append(value)
                # Use a weighted average with more weight to recent values
                weights = np.linspace(0.5, 1.0, len(self.command_history[key]))
                weights = weights / np.sum(weights)  # Normalize weights
                smoothed_value = 0
                for i, val in enumerate(self.command_history[key]):
                    smoothed_value += val * weights[i]
                smoothed_commands[key] = smoothed_value
        
        return smoothed_commands

# Physics calculations
class BirdPhysics:
    def __init__(self):
        # Physics parameters
        self.gravity = 0.015
        self.max_speed = 0.6
        self.min_speed = 0.1
        self.glide_drag = 0.0015
        self.dive_acceleration = 0.03
        self.lift_factor = 0.02
        self.turn_factor = 0.1
        self.energy_max = 100
        self.energy_recovery_rate = 0.2
        self.flap_energy_cost = 1.5
        
        # Bird state
        self.position = [0, 5, 0]  # x, y (height), z
        self.rotation = [0, 0, 0]  # pitch, yaw, roll
        self.momentum = [0, 0, 0]  # x, y, z momentum
        self.speed = 0.2
        self.energy = self.energy_max
        self.state = "glide"
        self.on_ground = False
        self.last_update = time.time()
        
        # Smoothing for state changes
        self.state_buffer = deque(["glide"] * 5, maxlen=5)
        
    def update(self, commands):
        # Calculate time delta
        current_time = time.time()
        delta_time = min(current_time - self.last_update, 0.1)  # Cap to prevent large jumps
        self.last_update = current_time
        
        # Determine bird state from commands
        current_state = commands.get("state", "none")
        if current_state != "none":
            self.state_buffer.append(current_state)
            
        # Use most common state in buffer to smooth transitions
        self.state = max(set(self.state_buffer), key=self.state_buffer.count)
        
        # Handle turning
        turn_direction = commands.get("turn", None)
        turn_angle = commands.get("turn_angle", 0)
        
        if turn_direction == "left":
            self.rotation[1] += self.turn_factor * turn_angle * delta_time * 50
            # Banking effect (roll)
            self.rotation[2] = min(25, 0.5 * turn_angle)
        elif turn_direction == "right":
            self.rotation[1] -= self.turn_factor * turn_angle * delta_time * 50
            # Banking effect (roll) - negative for right turn
            self.rotation[2] = max(-25, -0.5 * turn_angle)
        else:
            # Gradually return roll to level
            if abs(self.rotation[2]) > 1:
                self.rotation[2] *= 0.95
            else:
                self.rotation[2] = 0
        
        # Energy management
        if "flap" in commands and commands["flap"]:
            flap_intensity = commands.get("flap_intensity", 0.5)
            energy_cost = self.flap_energy_cost * flap_intensity
            
            if self.energy >= energy_cost:
                self.energy -= energy_cost
                
                # Flapping provides vertical lift and forward thrust
                if self.state == "gain_height":
                    # More upward momentum when trying to gain height
                    height_gain = commands.get("height_gain", 0.5)
                    self.momentum[1] += 0.04 * flap_intensity * height_gain * delta_time * 50
                    self.speed += 0.005 * flap_intensity * delta_time * 50
                else:
                    # Regular flapping provides some lift and speed
                    self.momentum[1] += 0.02 * flap_intensity * delta_time * 50
                    self.speed += 0.01 * flap_intensity * delta_time * 50
        else:
            # Energy recovery when not flapping
            self.energy = min(self.energy_max, self.energy + self.energy_recovery_rate * delta_time)
        
        # Apply physics based on bird state
        if self.state == "glide":
            # Gliding provides lift based on speed but gradually loses speed
            self.momentum[1] += (self.lift_factor * self.speed - self.gravity) * delta_time * 50
            self.speed = max(self.min_speed, self.speed - self.glide_drag * delta_time * 50)
            
            # Set pitch based on vertical momentum for visual effect
            target_pitch = -15 if self.momentum[1] > 0 else 15
            self.rotation[0] = self.rotation[0] * 0.9 + target_pitch * 0.1
            
        elif self.state == "dive":
            # Diving accelerates downward and increases speed
            dive_intensity = commands.get("dive_intensity", 0.5)
            self.momentum[1] -= self.dive_acceleration * dive_intensity * delta_time * 50
            self.speed = min(self.max_speed, self.speed + 0.02 * dive_intensity * delta_time * 50)
            
            # Set steep downward pitch for diving
            self.rotation[0] = self.rotation[0] * 0.8 + 40 * 0.2
            
        elif self.state == "gain_height":
            # Set upward pitch for gaining height
            self.rotation[0] = self.rotation[0] * 0.8 + (-30) * 0.2
        
        # Apply gravity
        self.momentum[1] -= self.gravity * delta_time * 50
        
        # Momentum decay (air resistance)
        for i in range(3):
            self.momentum[i] *= 0.95
        
        # Move bird based on speed and rotation
        yaw_rad = math.radians(self.rotation[1])
        x_move = math.sin(yaw_rad) * self.speed * delta_time * 50
        z_move = math.cos(yaw_rad) * self.speed * delta_time * 50
        
        self.position[0] += x_move + self.momentum[0] * delta_time * 50
        self.position[1] += self.momentum[1] * delta_time * 50
        self.position[2] += z_move + self.momentum[2] * delta_time * 50
        
        # Check if bird is on ground
        if self.position[1] <= 0:
            self.position[1] = 0
            self.momentum[1] = 0
            
            if not self.on_ground:
                self.on_ground = True
                # Reduce speed when landing
                self.speed *= 0.5
                
                # Reset momentum when landing
                self.momentum = [0, 0, 0]
        else:
            self.on_ground = False
        
        # Cap speed to min/max
        self.speed = min(max(self.speed, self.min_speed), self.max_speed)
        
        # Ensure yaw stays within 0-360 range
        self.rotation[1] = self.rotation[1] % 360
        
    def get_position(self):
        return self.position
        
    def get_rotation(self):
        return self.rotation

# Frame rate and timing utilities
class TimingUtility:
    def __init__(self, target_fps=30):
        self.target_fps = target_fps
        self.frame_time = 1.0 / target_fps
        self.last_time = 0
        
    def get_delta_time(self, current_time):
        """Calculate time elapsed since last frame in seconds"""
        if self.last_time == 0:
            self.last_time = current_time
            return self.frame_time
            
        delta = current_time - self.last_time
        self.last_time = current_time
        
        # Cap delta time to prevent large jumps
        return min(delta, self.frame_time * 3)

class World:
    def __init__(self):
        self.terrain_size = 1000
        self.terrain_features = []
        self.clouds = []
        self.obstacles = []
        self.collectibles = []
        
        # Generate initial world features
        self._generate_terrain_features(20)
        self._generate_clouds(15)
        self._generate_obstacles(5)
        self._generate_collectibles(10)
        
        # Track player's region for feature generation
        self.last_region = (0, 0)
        
    def _generate_terrain_features(self, count):
        """Generate terrain features like mountains and lakes"""
        for _ in range(count):
            feature_type = random.choice(["mountain", "lake", "forest"])
            x = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            z = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            size = random.uniform(5, 30)
            height = random.uniform(5, 25) if feature_type == "mountain" else 0
            
            self.terrain_features.append({
                "type": feature_type,
                "position": [x, 0, z],
                "size": size,
                "height": height,
                "color": self._get_feature_color(feature_type)
            })
    
    def _generate_clouds(self, count):
        """Generate clouds at various heights"""
        for _ in range(count):
            x = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            y = random.uniform(30, 100)
            z = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            size = random.uniform(10, 30)
            
            self.clouds.append({
                "position": [x, y, z],
                "size": size,
                "speed": random.uniform(0.01, 0.05)
            })
    
    def _generate_obstacles(self, count):
        """Generate obstacles like birds or weather patterns"""
        for _ in range(count):
            obstacle_type = random.choice(["bird", "storm"])
            x = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            y = random.uniform(15, 60)
            z = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            
            self.obstacles.append({
                "type": obstacle_type,
                "position": [x, y, z],
                "size": random.uniform(2, 8),
                "speed": random.uniform(0.05, 0.2)
            })
    
    def _generate_collectibles(self, count):
        """Generate collectibles like thermal updrafts or food"""
        for _ in range(count):
            collectible_type = random.choice(["thermal", "food"])
            x = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            y = random.uniform(5, 40) if collectible_type == "thermal" else random.uniform(5, 20)
            z = random.uniform(-self.terrain_size/2, self.terrain_size/2)
            
            self.collectibles.append({
                "type": collectible_type,
                "position": [x, y, z],
                "size": random.uniform(5, 15) if collectible_type == "thermal" else random.uniform(1, 3),
                "value": random.uniform(10, 30)
            })
    
    def _get_feature_color(self, feature_type):
        """Return color for different terrain features"""
        if feature_type == "mountain":
            return [0.6, 0.6, 0.6]  # Gray
        elif feature_type == "lake":
            return [0.1, 0.3, 0.8]  # Blue
        elif feature_type == "forest":
            return [0.1, 0.5, 0.1]  # Green
        return [0.5, 0.5, 0.5]  # Default gray
    
    def update(self, bird_physics):
        """Update world state based on bird position"""
        # Get bird position
        bird_pos = bird_physics.get_position()
        
        # Calculate current region (divide world into 100x100 regions)
        current_region = (int(bird_pos[0] / 100), int(bird_pos[2] / 100))
        
        # If bird moved to a new region, generate new features
        if current_region != self.last_region:
            self._generate_terrain_features(3)
            self._generate_clouds(2)
            self._generate_obstacles(1)
            self._generate_collectibles(2)
            
            # Remove far away features to keep memory usage reasonable
            self._cleanup_distant_features(bird_pos)
            
            self.last_region = current_region
        
        # Update cloud positions
        for cloud in self.clouds:
            cloud["position"][0] += cloud["speed"]
            # Wrap clouds around the world
            if cloud["position"][0] > self.terrain_size/2:
                cloud["position"][0] = -self.terrain_size/2
        
        # Update obstacle positions
        for obstacle in self.obstacles:
            # Move obstacles randomly
            obstacle["position"][0] += random.uniform(-1, 1) * obstacle["speed"]
            obstacle["position"][2] += random.uniform(-1, 1) * obstacle["speed"]
            
            # Keep obstacles within world bounds
            for i in [0, 2]:
                if obstacle["position"][i] > self.terrain_size/2:
                    obstacle["position"][i] = self.terrain_size/2
                elif obstacle["position"][i] < -self.terrain_size/2:
                    obstacle["position"][i] = -self.terrain_size/2
        
        # Check for collectible collisions
        for i, collectible in enumerate(self.collectibles):
            # Calculate distance to bird
            dx = collectible["position"][0] - bird_pos[0]
            dy = collectible["position"][1] - bird_pos[1]
            dz = collectible["position"][2] - bird_pos[2]
            distance = math.sqrt(dx*dx + dy*dy + dz*dz)
            
            # If bird is close enough, apply effect
            if distance < collectible["size"] + 2:
                if collectible["type"] == "thermal":
                    # Thermal updraft gives vertical momentum
                    bird_physics.momentum[1] += 0.1
                elif collectible["type"] == "food":
                    # Food restores energy
                    bird_physics.energy = min(bird_physics.energy_max, 
                                             bird_physics.energy + collectible["value"])
                
                # Remove collected item
                self.collectibles.pop(i)
                # Generate a new one
                self._generate_collectibles(1)
                break
        
        # Return relevant world data near the bird
        return self._get_nearby_world_data(bird_pos)
    
    def _cleanup_distant_features(self, bird_pos):
        """Remove features that are too far from the bird"""
        max_distance = self.terrain_size / 2
        
        # Filter terrain features
        self.terrain_features = [f for f in self.terrain_features 
                                if self._distance_2d(f["position"], bird_pos) < max_distance]
        
        # Filter clouds
        self.clouds = [c for c in self.clouds 
                      if self._distance_3d(c["position"], bird_pos) < max_distance]
        
        # Filter obstacles
        self.obstacles = [o for o in self.obstacles 
                         if self._distance_3d(o["position"], bird_pos) < max_distance]
        
        # Filter collectibles
        self.collectibles = [c for c in self.collectibles 
                            if self._distance_3d(c["position"], bird_pos) < max_distance]
    
    def _distance_2d(self, pos1, pos2):
        """Calculate 2D distance (x,z plane)"""
        dx = pos1[0] - pos2[0]
        dz = pos1[2] - pos2[2]
        return math.sqrt(dx*dx + dz*dz)
    
    def _distance_3d(self, pos1, pos2):
        """Calculate 3D distance"""
        dx = pos1[0] - pos2[0]
        dy = pos1[1] - pos2[1]
        dz = pos1[2] - pos2[2]
        return math.sqrt(dx*dx + dy*dy + dz*dz)
    
    def _get_nearby_world_data(self, bird_pos):
        """Return only world data that's near the bird"""
        view_distance = 300  # How far the bird can see
        
        nearby_data = {
            "terrain": [f for f in self.terrain_features 
                       if self._distance_2d(f["position"], bird_pos) < view_distance],
            "clouds": [c for c in self.clouds 
                      if self._distance_3d(c["position"], bird_pos) < view_distance],
            "obstacles": [o for o in self.obstacles 
                         if self._distance_3d(o["position"], bird_pos) < view_distance],
            "collectibles": [c for c in self.collectibles 
                            if self._distance_3d(c["position"], bird_pos) < view_distance]
        }
        
        return nearby_data

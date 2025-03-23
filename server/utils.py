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
        # Base physics parameters - adjusted for more realistic flight
        self.gravity = 0.02         # Stronger gravity for better diving
        self.max_speed = 0.8        # Higher max speed
        self.min_speed = 0.05       # Minimum speed to prevent stopping mid-air
        self.drag = 0.985           # Air resistance (less drag for better momentum)
        self.lift_factor = 0.025    # Base lift when gliding
        
        # Turning mechanics - more responsive turning
        self.max_turn_rate = 0.05   # Increased for sharper turns
        self.turn_responsiveness = 0.02
        self.bank_drag_factor = 0.3 # More speed loss when banking hard
        
        # Flapping mechanics - stronger effect
        self.flap_lift = 0.03
        self.flap_thrust = 0.04     # More thrust from flapping
        self.flap_decay = 0.9       # Flap effect decays quickly
        
        # Diving mechanics - better acceleration
        self.dive_acceleration = 0.035  # Increased acceleration during dives
        self.dive_gravity_multiplier = 1.8  # More gravity pull during dives
        self.dive_recovery_factor = 0.6     # Ability to pull out of dives
        
        # Height gain mechanics
        self.height_gain_factor = 0.05
        self.height_gain_speed_cost = 0.02
        
        # State tracking
        self.momentum = {
            'vertical': 0,         # Vertical momentum
            'forward': 0,          # Forward momentum
            'rotation': 0          # Rotational momentum
        }
        self.energy = 1.0          # Energy system to prevent unlimited flapping
        self.energy_recovery_rate = 0.004
        self.energy_consumption_rate = 0.03
        
        # Previous state for better transitions
        self.prev_state = 'none'
        self.state_transition_timer = 0
        
        # Ground interaction
        self.ground_friction = 0.92
        self.ground_bounce = 0.2   # Slight bounce when hitting ground at speed
        
    def apply_physics(self, bird_state, commands):
        """Apply physics rules to the bird's movement based on commands"""
        updated_state = bird_state.copy()
        
        # Energy management - recovers slowly over time
        if self.energy < 1.0:
            self.energy = min(1.0, self.energy + self.energy_recovery_rate)
        
        # Apply base drag (air resistance)
        updated_state['speed'] *= self.drag
        
        # Default state - always apply gravity (increased for more realistic falling)
        gravity_multiplier = 1.0
        
        # Get the current movement state
        movement_state = commands.get('state', 'none')
        
        # Apply more natural transitions between states
        if movement_state != self.prev_state:
            self.state_transition_timer = 0
        else:
            self.state_transition_timer += 1
        
        # Process movement commands based on state
        if movement_state == 'glide':
            # Gliding provides lift proportional to speed but gradually loses speed
            lift = self.lift_factor * updated_state['speed']
            updated_state['height'] += lift
            
            # Speed decreases more at very low or very high heights (air density simulation)
            height_factor = max(0, 1 - abs(updated_state['height'] - 10) / 15)
            updated_state['speed'] = max(updated_state['speed'] - 0.003 * (1 + height_factor), self.min_speed)
            
            # Gradual build-up of vertical momentum for smoother gliding
            self.momentum['vertical'] = self.momentum['vertical'] * 0.95 + 0.05 * lift
            
            # Forward momentum increases slightly during optimal gliding
            if updated_state['height'] > 5 and updated_state['height'] < 15:
                self.momentum['forward'] = min(self.momentum['forward'] + 0.001, 0.05)
            
        elif movement_state == 'dive':
            # Diving increases speed dramatically based on intensity
            intensity = commands.get('dive_intensity', 0.5)
            
            # Speed increases more when diving from higher altitude
            height_factor = min(updated_state['height'] / 10, 1)
            updated_state['speed'] += self.dive_acceleration * intensity * (1 + height_factor)
            
            # More gravity when diving
            gravity_multiplier = self.dive_gravity_multiplier * intensity
            
            # Add forward momentum during diving
            self.momentum['forward'] = self.momentum['forward'] * 0.9 + 0.1 * intensity
            
        elif movement_state == 'gain_height':
            # Gaining height requires energy and costs speed
            if self.energy > 0.1:  # Need minimum energy to gain height
                height_gain = commands.get('height_gain', 0.5)
                energy_cost = self.energy_consumption_rate * height_gain
                
                # Apply height gain proportional to available energy and current speed
                speed_factor = min(updated_state['speed'] / 0.3, 1)  # Need some speed to gain height effectively
                effective_gain = height_gain * (self.energy / 1.0) * speed_factor
                
                updated_state['height'] += self.height_gain_factor * effective_gain
                updated_state['speed'] = max(updated_state['speed'] - self.height_gain_speed_cost * effective_gain, self.min_speed)
                
                # Consume energy
                self.energy = max(0, self.energy - energy_cost)
                
                # Add upward momentum
                self.momentum['vertical'] = min(self.momentum['vertical'] + 0.01 * effective_gain, 0.1)
        
        # Apply flapping for thrust and lift if enough energy
        if 'flap' in commands and commands['flap'] and self.energy > 0.05:
            intensity = commands.get('flap_intensity', 0.5)
            
            # Energy cost based on flap intensity
            energy_cost = self.energy_consumption_rate * intensity
            
            # More effective flapping with higher energy
            effective_intensity = intensity * (self.energy / 1.0)
            
            # Faster flapping = more speed (as requested)
            thrust_increase = self.flap_thrust * effective_intensity * intensity  # Squared effect
            lift_increase = self.flap_lift * effective_intensity
            
            # Apply thrust and lift
            updated_state['speed'] = min(updated_state['speed'] + thrust_increase, self.max_speed)
            updated_state['height'] += lift_increase
            
            # Add vertical momentum from flapping
            self.momentum['vertical'] = self.momentum['vertical'] * 0.8 + 0.2 * lift_increase
            
            # Consume energy
            self.energy = max(0, self.energy - energy_cost)
        else:
            # Bird falls faster if not actively flapping or gliding
            if movement_state != 'glide':
                gravity_multiplier *= 1.2
        
        # Apply turning with realistic banking physics - sharper turns as requested
        if 'turn' in commands:
            turn_angle = commands.get('turn_angle', 0)
            direction = 1 if commands['turn'] == 'right' else -1
            
            # More extreme turning based on angle
            turn_rate = self.turn_responsiveness * (turn_angle ** 1.5) * 0.01 * direction
            
            # Limit maximum turn rate
            turn_rate = max(min(turn_rate, self.max_turn_rate), -self.max_turn_rate)
            
            # Higher turn rates at higher speeds
            speed_factor = min(updated_state['speed'] / 0.3, 1.5)
            turn_rate *= speed_factor
            
            # Apply turn rate with momentum
            self.momentum['rotation'] = self.momentum['rotation'] * 0.8 + 0.2 * turn_rate
            updated_state['turn'] = self.momentum['rotation']
            
            # Banking reduces speed and height more with sharper turns
            banking_factor = abs(turn_rate) / self.max_turn_rate
            updated_state['speed'] *= (1.0 - banking_factor * self.bank_drag_factor)
            updated_state['height'] -= banking_factor * 0.015
        else:
            # Gradually return to center when not turning
            self.momentum['rotation'] *= 0.9
            updated_state['turn'] = self.momentum['rotation']
        
        # Calculate combined momentum effect
        momentum_lift = self.momentum['vertical'] - (gravity_multiplier * self.gravity)
        
        # Apply gravity with momentum system for smoother flight
        updated_state['height'] += momentum_lift
        
        # Apply forward momentum
        updated_state['speed'] += self.momentum['forward']
        
        # Decay momentum
        self.momentum['vertical'] *= 0.93
        self.momentum['forward'] *= 0.95
        
        # Cap the bird's speed
        updated_state['speed'] = max(min(updated_state['speed'], self.max_speed), 0)
        
        # Prevent bird from going through the ground
        if updated_state['height'] <= 0:
            updated_state['height'] = 0
            
            # Bounce if hitting ground at speed - more realistic
            if momentum_lift < -0.02 and updated_state['speed'] > 0.2:
                self.momentum['vertical'] = abs(momentum_lift) * self.ground_bounce
            else:
                self.momentum['vertical'] = 0
            
            # Ground friction slows the bird
            updated_state['speed'] *= self.ground_friction
        
        # Update state for next frame
        self.prev_state = movement_state
        
        return updated_state

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

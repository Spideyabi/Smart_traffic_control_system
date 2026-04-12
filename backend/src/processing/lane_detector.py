import numpy as np

class LaneDetector:
    """
    Automatically detects which lane has vehicles approaching the camera.
    Uses simple mid-line split and size-growth analysis.
    """
    
    def __init__(self, frame_width, frame_height):
        """
        Initialize lane detector.
        
        Args:
            frame_width: Video frame width
            frame_height: Video frame height
        """
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.midline_x = frame_width // 2
        
    def create_lane_polygon(self, lane_side, top_y=100, bottom_y=None):
        """
        Create ROI polygon for a specific lane.
        
        Args:
            lane_side: "left", "right", or "both"
            top_y: Top boundary of ROI (default: 200)
            bottom_y: Bottom boundary of ROI (default: frame height)
            
        Returns:
            Polygon points [(x1,y1), (x2,y2), ...]
        """
        if bottom_y is None:
            bottom_y = self.frame_height
            
        if lane_side == "left":
            # Left lane (from left edge to midline)
            return [
                (0, top_y),           # Top-left
                (self.midline_x, top_y),  # Top-middle
                (self.midline_x, bottom_y),  # Bottom-middle
                (0, bottom_y)         # Bottom-left
            ]
        elif lane_side == "right":
            # Right lane (from midline to right edge)
            return [
                (self.midline_x, top_y),     # Top-middle
                (self.frame_width, top_y),   # Top-right
                (self.frame_width, bottom_y), # Bottom-right
                (self.midline_x, bottom_y)   # Bottom-middle
            ]
        else:  # "both"
            # Entire road
            return [
                (0, top_y),
                (self.frame_width, top_y),
                (self.frame_width, bottom_y),
                (0, bottom_y)
            ]
    
    def identify_approaching_lane(self, detections_history):
        """
        Analyze vehicle detections to identify which lane has vehicles APPROACHING the camera.
        Uses movement direction (downward) and size growth to identify approaching vehicles.
        
        Args:
            detections_history: List of detection lists from multiple frames
                               Each detection: {'bbox': [x1,y1,x2,y2], ...}
        
        Returns:
            "left", "right", or "both"
        """
        if len(detections_history) < 20:
            return "both"  # Not enough data
        
        left_approaching_score = 0
        right_approaching_score = 0
        
        # Analyze vehicle behavior frame-by-frame
        for i in range(len(detections_history) - 5):
            current_detections = detections_history[i]
            future_detections = detections_history[i + 5]  # Look 5 frames ahead
            
            # Try to match vehicles between frames (simple proximity matching)
            for curr_det in current_detections:
                x1, y1, x2, y2 = curr_det['bbox']
                curr_center_x = (x1 + x2) / 2
                curr_center_y = (y1 + y2) / 2
                curr_area = (x2 - x1) * (y2 - y1)
                
                # Find closest vehicle in future frame
                min_dist = float('inf')
                matched_det = None
                
                for fut_det in future_detections:
                    fx1, fy1, fx2, fy2 = fut_det['bbox']
                    fut_center_x = (fx1 + fx2) / 2
                    fut_center_y = (fy1 + fy2) / 2
                    
                    # Distance between centers
                    dist = ((curr_center_x - fut_center_x)**2 + (curr_center_y - fut_center_y)**2)**0.5
                    
                    if dist < min_dist and dist < 100:  # Within reasonable distance
                        min_dist = dist
                        matched_det = fut_det
                
                # If matched, check if approaching
                if matched_det:
                    fx1, fy1, fx2, fy2 = matched_det['bbox']
                    fut_center_y = (fy1 + fy2) / 2
                    fut_area = (fx2 - fx1) * (fy2 - fy1)
                    
                    # Approaching indicators:
                    # 1. Moving downward (y increasing)
                    # 2. Getting larger (area increasing)
                    y_movement = fut_center_y - curr_center_y
                    area_growth = fut_area - curr_area
                    
                    # Vehicle is approaching if moving down AND growing
                    if y_movement > 2 and area_growth > 0:
                        # Determine which lane
                        if curr_center_x < self.midline_x:
                            left_approaching_score += 1
                        else:
                            right_approaching_score += 1
        
        # Determine lane based on scores
        total_score = left_approaching_score + right_approaching_score
        
        if total_score == 0:
            return "both"  # No clear approaching vehicles detected
        
        left_percentage = left_approaching_score / total_score
        right_percentage = right_approaching_score / total_score
        
        # If one lane has significantly more approaching vehicles (>65%), use that lane
        if left_percentage > 0.65:
            return "left"
        elif right_percentage > 0.65:
            return "right"
        else:
            return "both"  # Both lanes have approaching traffic

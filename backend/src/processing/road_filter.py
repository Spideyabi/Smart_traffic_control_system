import cv2
import numpy as np

class RoadFilter:
    """
    Filter vehicle detections to only include those on the road.
    Uses polygon-based Region of Interest (ROI).
    """
    
    def __init__(self, roi_polygon=None):
        """
        Initialize road filter with optional ROI polygon.
        
        Args:
            roi_polygon: List of (x, y) points defining the road region.
                        If None, uses entire frame.
        """
        self.roi_polygon = roi_polygon
        
    def set_roi_polygon(self, points):
        """
        Set the ROI polygon points.
        
        Args:
            points: List of (x, y) tuples defining polygon vertices
        """
        self.roi_polygon = np.array(points, dtype=np.int32)
        
    def is_on_road(self, bbox):
        """
        Check if a vehicle bounding box is within the road region.
        Uses the bottom-center point of the bounding box for better ground-plane accuracy.
        
        Args:
            bbox: [x1, y1, x2, y2] bounding box coordinates
            
        Returns:
            True if vehicle is on road, False otherwise
        """
        if self.roi_polygon is None:
            return True  # No ROI defined, accept all
            
        # Calculate bottom-center point of bounding box
        x1, y1, x2, y2 = bbox
        center_x = (x1 + x2) // 2
        bottom_y = y2
        
        # Check if point is inside polygon
        result = cv2.pointPolygonTest(self.roi_polygon, (center_x, bottom_y), False)
        return result >= 0  # >= 0 means inside or on edge
    
    def draw_roi(self, frame, color=(0, 255, 255), thickness=2, alpha=0.3):
        """
        Draw the ROI polygon on the frame with transparency.
        
        Args:
            frame: Input frame
            color: ROI line color (BGR)
            thickness: Line thickness
            alpha: Transparency for filled polygon (0-1)
            
        Returns:
            Frame with ROI overlay
        """
        if self.roi_polygon is None:
            return frame
            
        overlay = frame.copy()
        
        # Draw filled polygon with transparency
        cv2.fillPoly(overlay, [self.roi_polygon], color)
        
        # Blend with original frame
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        
        # Draw polygon border
        cv2.polylines(frame, [self.roi_polygon], True, color, thickness)
        
        return frame

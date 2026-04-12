import cv2
import numpy as np
from ultralytics import YOLO

class VehicleDetector:
    """
    Vehicle detection using YOLOv8-L model.
    Detects cars, motorcycles, buses, and trucks.
    """
    
    # COCO class IDs for vehicles
    # Note: Auto-rickshaws are not in standard COCO dataset
    VEHICLE_CLASSES = {
        2: 'car',
        3: 'motorcycle', 
        5: 'bus',
        7: 'truck'
    }
    
    def __init__(self, model_name='yolov8l.pt', confidence_threshold=0.25, iou_threshold=0.6, img_size=960):
        """
        Initialize YOLOv8 detector.

        Args:
            model_name: YOLOv8 model variant
            confidence_threshold: Minimum confidence for detections
            iou_threshold: IOU threshold for NMS
            img_size: Input image size for inference
        """
        print(f"Loading {model_name} model...")
        self.model = YOLO(model_name)
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.img_size = img_size
        print(f"Model loaded successfully.")
        print(f"Confidence: {confidence_threshold} | IOU: {iou_threshold} | Resolution: {img_size}px")
    
    def detect(self, frame):
        """
        Detect vehicles in a frame.
        
        Args:
            frame: Input image/frame (numpy array)
            
        Returns:
            List of detections, each containing:
            - class_name: Vehicle type
            - confidence: Detection confidence
            - bbox: Bounding box [x1, y1, x2, y2]
        """
        # Run inference with custom parameters
        results = self.model(
            frame,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            imgsz=self.img_size,
            verbose=False
        )[0]
        
        detections = []
        
        # Process detections
        for box in results.boxes:
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            
            # Filter for vehicle classes and confidence threshold
            if class_id in self.VEHICLE_CLASSES and confidence >= self.confidence_threshold:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                
                detections.append({
                    'class_name': self.VEHICLE_CLASSES[class_id],
                    'confidence': confidence,
                    'bbox': [int(x1), int(y1), int(x2), int(y2)]
                })
        
        return detections

    def detect_batch(self, frames):
        """
        Detect vehicles in a BATCH of frames with a single YOLO forward pass.
        Much faster than calling detect() N times when processing multiple videos.

        Args:
            frames: List of frames (numpy arrays)

        Returns:
            List of detection lists — one inner list per input frame.
        """
        if not frames:
            return []

        results = self.model(
            frames,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            imgsz=self.img_size,
            verbose=False
        )

        all_detections = []
        for result in results:
            detections = []
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                if class_id in self.VEHICLE_CLASSES and confidence >= self.confidence_threshold:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    detections.append({
                        'class_name': self.VEHICLE_CLASSES[class_id],
                        'confidence': confidence,
                        'bbox': [int(x1), int(y1), int(x2), int(y2)]
                    })
            all_detections.append(detections)

        return all_detections
    
    def draw_detections(self, frame, detections):
        """
        Draw bounding boxes and labels on frame.
        
        Args:
            frame: Input frame
            detections: List of detections from detect()
            
        Returns:
            Annotated frame
        """
        annotated_frame = frame.copy()
        
        # Color mapping for different vehicle types
        colors = {
            'car': (0, 255, 0),         # Green
            'motorcycle': (255, 0, 0),  # Blue
            'bus': (0, 165, 255),       # Orange
            'truck': (0, 0, 255)        # Red
        }
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            class_name = det['class_name']
            confidence = det['confidence']
            
            color = colors.get(class_name, (255, 255, 255))
            
            # Draw bounding box
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw label with tracking ID or confidence
            if 'track_id' in det:
                label = f"ID:{det['track_id']} {class_name}"
            else:
                label = f"{class_name}: {confidence:.2f}"
                
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            
            # Draw label background
            cv2.rectangle(annotated_frame, 
                         (x1, y1 - label_size[1] - 10), 
                         (x1 + label_size[0], y1), 
                         color, -1)
            
            # Draw label text
            cv2.putText(annotated_frame, label, (x1, y1 - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        return annotated_frame

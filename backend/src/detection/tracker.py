import math
from collections import OrderedDict

class CentroidTracker:
    def __init__(self, max_disappeared=50, max_distance=50):
        # Store the next unique object ID
        self.next_object_id = 0
        
        # Store the centroid, bounding box, class name, and confidence for each active object
        self.objects = OrderedDict()
        self.bboxes = OrderedDict()
        self.classes = OrderedDict()
        self.confidences = OrderedDict()
        
        # Store the number of consecutive frames an object has been marked as disappeared
        self.disappeared = OrderedDict()
        
        # Max consecutive frames an object is allowed to be marked as "disappeared" before being deregistered
        self.max_disappeared = max_disappeared
        
        # Max distance between centroids to associate them
        self.max_distance = max_distance

    def register(self, centroid, bbox, class_name, confidence):
        # Register a new object
        self.objects[self.next_object_id] = centroid
        self.bboxes[self.next_object_id] = bbox
        self.classes[self.next_object_id] = class_name
        self.confidences[self.next_object_id] = confidence
        self.disappeared[self.next_object_id] = 0
        self.next_object_id += 1

    def deregister(self, object_id):
        # Remove the tracking ID
        del self.objects[object_id]
        del self.bboxes[object_id]
        del self.classes[object_id]
        del self.confidences[object_id]
        del self.disappeared[object_id]

    def update(self, rects):
        """
        rects is a list of dictionary: [{'bbox': [x1, y1, x2, y2], 'class_name': str, 'confidence': float}, ...]
        Returns a dictionary of objects with their current bounding boxes and class names:
        { id: {'bbox': [x1,y1,x2,y2], 'class_name': str, 'centroid': (cx, cy), 'confidence': float} }
        """
        # Checks if the list of input bounding box rectangles is empty
        if len(rects) == 0:
            # Loop over existing tracked objects and mark them as disappeared
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                
                # If we have reached a maximum number of consecutive frames where
                # a given object has been marked as missing, deregister it
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            
            # Return currently tracked objects early
            return self._get_tracked_objects()

        # Initialize an array of input centroids for the current frame
        input_centroids = []
        input_bboxes = []
        input_classes = []
        input_confidences = []
        
        for det in rects:
            x1, y1, x2, y2 = det['bbox']
            # Calculate centroid
            cx = int((x1 + x2) / 2.0)
            cy = int((y1 + y2) / 2.0)
            
            input_centroids.append((cx, cy))
            input_bboxes.append(det['bbox'])
            input_classes.append(det['class_name'])
            input_confidences.append(det.get('confidence', 0.0))

        # If we are currently not tracking any objects, take the input centroids and register each of them
        if len(self.objects) == 0:
            for i in range(0, len(input_centroids)):
                self.register(input_centroids[i], input_bboxes[i], input_classes[i], input_confidences[i])
        else:
            # Grab the set of object IDs and corresponding centroids
            object_ids = list(self.objects.keys())
            object_centroids = list(self.objects.values())

            # Compute the distance between each pair of existing object centroids
            # and input centroids to associate them
            
            # We want to match input_centroids to object_centroids
            used_objects = set()
            used_inputs = set()

            # Iterate through existing objects, finding the closest input detection
            # A simple greedy nearest-neighbor approach
            for i, existing_centroid in enumerate(object_centroids):
                best_dist = float('inf')
                best_input_idx = -1
                
                for j, in_centroid in enumerate(input_centroids):
                    if j in used_inputs:
                        continue
                    
                    # Calculate Euclidean distance
                    dist = math.hypot(existing_centroid[0] - in_centroid[0], existing_centroid[1] - in_centroid[1])
                    
                    if dist < best_dist and dist < self.max_distance:
                        best_dist = dist
                        best_input_idx = j
                
                if best_input_idx != -1:
                    # Match found
                    obj_id = object_ids[i]
                    self.objects[obj_id] = input_centroids[best_input_idx]
                    self.bboxes[obj_id] = input_bboxes[best_input_idx]
                    self.classes[obj_id] = input_classes[best_input_idx]
                    self.confidences[obj_id] = input_confidences[best_input_idx]
                    self.disappeared[obj_id] = 0
                    
                    used_objects.add(obj_id)
                    used_inputs.add(best_input_idx)

            # Check for disappeared objects
            for obj_id in list(self.objects.keys()):
                if obj_id not in used_objects:
                    self.disappeared[obj_id] += 1
                    if self.disappeared[obj_id] > self.max_disappeared:
                        self.deregister(obj_id)

            # Check for new objects
            for j in range(len(input_centroids)):
                if j not in used_inputs:
                    self.register(input_centroids[j], input_bboxes[j], input_classes[j], input_confidences[j])

        return self._get_tracked_objects()
        
    def _get_tracked_objects(self):
        result = {}
        for obj_id in self.objects.keys():
            result[obj_id] = {
                'centroid': self.objects[obj_id],
                'bbox': self.bboxes[obj_id],
                'class_name': self.classes[obj_id],
                'confidence': self.confidences[obj_id]
            }
        return result

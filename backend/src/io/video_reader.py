import cv2
import os

class VideoReader:
    def __init__(self, video_path):
        """
        Initialize the VideoReader with a video file path.
        """
        self.video_path = video_path
        self.cap = cv2.VideoCapture(video_path)
        
        if not self.cap.isOpened():
            raise ValueError(f"Error: Could not open video file at {video_path}")
            
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.frame_count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        print(f"Video Loaded: {video_path}")
        print(f"Resolution: {self.width}x{self.height}")
        print(f"FPS: {self.fps}")
        print(f"Total Frames: {self.frame_count}")

    def read_frame(self, loop: bool = True):
        """
        Yields frames from the video.
        If loop=True (default), restarts from the beginning when the video ends
        so the stream keeps playing indefinitely.
        """
        while self.cap.isOpened():
            ret, frame = self.cap.read()
            if not ret:
                if loop:
                    # Rewind to beginning and keep going
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break
            yield frame
    
    def release(self):
        """
        Release the video capture object.
        """
        self.cap.release()
        print("Video capture released.")

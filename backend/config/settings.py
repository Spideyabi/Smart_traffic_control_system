"""
config/settings.py
==================
Central configuration for the Traffic Control System.
Edit values here instead of inside main.py.
"""

import os

# ── Video Input ────────────────────────────────────────────────
# Folder that is scanned for input videos (.mp4 / .avi / .mov / .mkv)
VIDEO_FOLDER = os.path.join("data", "videos")

# Pin specific video files instead of auto-discovering (leave [] to auto-discover)
VIDEO_FILES = []

# ── YOLO Model ─────────────────────────────────────────────────
# Options: yolov8n.pt (Nano - Fastest), yolov8s.pt (Small), yolov8m.pt (Medium)
# NOTE: Using 'yolov8n.pt' is recommended for CPU-only machines to speed up startup.
MODEL_PATH = os.path.join("models", "yolov8m.pt")
CONFIDENCE_THRESHOLD = 0.25
IOU_THRESHOLD        = 0.6
IMG_SIZE             = 640          # inference resolution (pixels)

# ── Detection Rate ─────────────────────────────────────────────
# How many times per second YOLO runs on each video stream
# Higher → more frequent detection | Lower → faster processing
DETECTION_FRAMES_PER_SECOND = 1

# ── Lane Detection ─────────────────────────────────────────────
# "auto"  → automatically identify the approaching lane
# "left"  → left lane only
# "right" → right lane only
# "both"  → both lanes
TARGET_LANE = "auto"

# Number of detection samples to collect before deciding the lane (auto mode)
AUTO_DETECT_FRAMES = 33

# ── Display ────────────────────────────────────────────────────
# Window grid: columns before wrapping to next row
WINDOW_COLUMNS  = 2
WINDOW_WIDTH    = 640
WINDOW_HEIGHT   = 400
WINDOW_GAP_X    = 680   # horizontal spacing between windows (px)
WINDOW_GAP_Y    = 420   # vertical spacing between windows (px)

"""
main.py — Traffic Control System Entry Point
=============================================
Buffered Queue Pipeline Architecture.
Runs processing as fast as possible in the background and pushes fully-annotated
frames to a queue. A pacer thread pops frames precisely at native speed (25fps)
so that the live dashboard video stream remains eternally 100% smooth.
"""

import cv2
import os
import glob
import time
import threading
import queue
import concurrent.futures
import numpy as np

from config.settings import (
    VIDEO_FOLDER, VIDEO_FILES,
    MODEL_PATH, CONFIDENCE_THRESHOLD, IOU_THRESHOLD, IMG_SIZE,
    DETECTION_FRAMES_PER_SECOND,
    TARGET_LANE, AUTO_DETECT_FRAMES,
    WINDOW_COLUMNS, WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_GAP_X, WINDOW_GAP_Y,
)
from src.io.video_reader import VideoReader
from src.detection.vehicle_detector import VehicleDetector
from src.processing.road_filter import RoadFilter
from src.processing.lane_detector import LaneDetector
from src.detection.tracker import CentroidTracker

# ── Shared state ───────────────────────────────────────────────
stop_event  = threading.Event()
_print_lock = threading.Lock()

# Buffered Queue System for silky smooth playback
_output_queue = queue.Queue(maxsize=250) # Approx 10 seconds buffer @ 25fps
_cached_jpeg = None
_web_thread = None
_frontend_wants_video = False

_finalized_video_cache = []
_cache_playback_thread = None
_stream_state = "STANDBY"

def get_latest_jpeg_bytes():
    return _cached_jpeg

def signal_video_release(state: bool):
    global _frontend_wants_video, _web_stream_pacer_stopped, _cache_playback_thread, _stream_state
    _frontend_wants_video = state
    
    if not state and _stream_state != "ENDED":
        _stream_state = "STANDBY"
    elif state and _stream_state == "STANDBY":
        _stream_state = "BUFFERING"
    
    # If the main producer/consumer pipeline completely finished its run,
    # and the user hits START VIDEO again, spin up the RAM-cache playback exactly at 20fps!
    if state and _web_stream_pacer_stopped and len(_finalized_video_cache) > 0:
        if _cache_playback_thread is None or not _cache_playback_thread.is_alive():
            _cache_playback_thread = threading.Thread(target=_cache_playback_pacer, args=(20.0,), daemon=True)
            _cache_playback_thread.start()

# ── Log & count callbacks ──────────────────────────────────────
_log_callback   = None
_count_callback = None

def set_log_callback(cb):
    global _log_callback
    _log_callback = cb

def set_count_callback(cb):
    global _count_callback
    _count_callback = cb

def tprint(*args, **kwargs):
    with _print_lock:
        msg = " ".join(map(str, args))
        print(msg, **kwargs)
        if _log_callback:
            _log_callback(msg)

# ── Video discovery ────────────────────────────────────────────
def discover_videos():
    if VIDEO_FILES:
        return [p for p in VIDEO_FILES if os.path.exists(p)]
    patterns = ["*.mp4", "*.avi", "*.mov", "*.mkv"]
    paths = []
    for pat in patterns:
        paths.extend(glob.glob(os.path.join(VIDEO_FOLDER, pat)))
    return sorted(paths)

# ── Per-stream state container ─────────────────────────────────

class VideoStream:
    """Holds all mutable state for a single video being processed synchronously."""
    def __init__(self, index, video_path, headless, fps_ref):
        self.index       = index
        self.video_path  = video_path
        self.video_name  = os.path.basename(video_path)
        self.tag         = f"[{self.video_name}]"
        self.headless    = headless

        self.reader = VideoReader(video_path)
        self.fps    = self.reader.fps
        
        # We skip manually again for consistency!
        self.frames_per_detection = max(1, int(self.fps / fps_ref))

        self.lane_detector      = LaneDetector(self.reader.width, self.reader.height)
        self.road_filter        = RoadFilter()
        self.detected_lane      = TARGET_LANE
        self.detections_history = [] if TARGET_LANE == "auto" else None
        self.tracker            = CentroidTracker(max_disappeared=30, max_distance=100)

        self.frame_number = 0
        self.current_second = 0
        self.vehicles_in_second = []
        self.occupancies_in_second = []
        self.last_on_road = []
        self.last_occupancy = 0.0
        
        self.finished = False
        self._frame_gen = self.reader.read_frame(loop=False)

        if not headless:
            col = index % WINDOW_COLUMNS
            row = index // WINDOW_COLUMNS
            wt  = f"[{index+1}] {self.video_name}"
            cv2.namedWindow(wt, cv2.WINDOW_NORMAL)
            cv2.moveWindow(wt, col * WINDOW_GAP_X, row * WINDOW_GAP_Y)
            cv2.resizeWindow(wt, WINDOW_WIDTH, WINDOW_HEIGHT)
            self.window_title = wt
        else:
            self.window_title = None

        tprint(f"{self.tag} {self.reader.width}x{self.reader.height} @ {self.fps:.1f} FPS")

    def next_frame(self):
        try:
            frame = next(self._frame_gen)
            self.frame_number += 1
            return frame
        except StopIteration:
            return None

    def should_detect(self):
        # Always run 3x faster detection while auto-calibrating lane!
        if TARGET_LANE == "auto" and self.detected_lane == "auto":
            return self.frame_number % 3 == 0
        return self.frame_number % self.frames_per_detection == 0

    def update_lane(self, detections):
        if TARGET_LANE == "auto" and self.detected_lane == "auto":
            self.detections_history.append(detections)
            if len(self.detections_history) >= AUTO_DETECT_FRAMES:
                self.detected_lane = self.lane_detector.identify_approaching_lane(self.detections_history)
                lane_roi = self.lane_detector.create_lane_polygon(self.detected_lane)
                self.road_filter.set_roi_polygon(lane_roi)
                tprint(f"{self.tag} ✓ Auto-detected lane: {self.detected_lane.upper()}")
        elif self.detected_lane != "auto" and self.road_filter.roi_polygon is None:
            lane_roi = self.lane_detector.create_lane_polygon(self.detected_lane)
            self.road_filter.set_roi_polygon(lane_roi)

    def filter_on_road(self, detections):
        if self.road_filter.roi_polygon is not None:
            return [d for d in detections if self.road_filter.is_on_road(d['bbox'])]
        return detections

    def get_lane_occupancy(self, tracked_objects):
        if self.road_filter.roi_polygon is None:
            return 0.0
        roi_area = cv2.contourArea(self.road_filter.roi_polygon)
        if roi_area <= 0:
            return 0.0
        vehicle_area = 0
        for obj in tracked_objects:
            x1, y1, x2, y2 = obj['bbox']
            vehicle_area += (x2 - x1) * (y2 - y1)
        occupancy = (vehicle_area / roi_area) * 100.0
        return min(100.0, occupancy)

    def annotate(self, frame, on_road, occ):
        video_time = self.frame_number / self.fps
        annotated  = self.road_filter.draw_roi(frame.copy())
        if _detect_module_ref:
            annotated = _detect_module_ref.draw_detections(annotated, on_road)
            
        cv2.putText(
            annotated,
            f"{self.video_name} | {video_time:.1f}s | Vehicles: {len(on_road)} | Occ: {occ:.1f}%",
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2,
        )
        return annotated

    def per_second_log(self, video_second):
        if video_second > self.current_second:
            if self.vehicles_in_second:
                avg_count = round(sum(self.vehicles_in_second) / len(self.vehicles_in_second))
                avg_occ   = round(sum(self.occupancies_in_second) / len(self.occupancies_in_second), 1)
                if _count_callback:
                    _count_callback({
                        'type':      'count',
                        'video':     self.video_name,
                        'second':    self.current_second,
                        'count':     avg_count,
                        'occupancy': avg_occ,
                        'sync':      False, # Real-time for AI
                    })
            self.current_second = video_second
            self.vehicles_in_second = []
            self.occupancies_in_second = []
            
    def release(self):
        tprint(f"{self.tag} Stream finished.")
        self.reader.release()
        if not self.headless and self.window_title:
            cv2.destroyWindow(self.window_title)


# ── Producer-Consumer Pacer ────────────────────────────────────
_web_stream_pacer_stopped = False
_producer_finished = False

def _web_stream_pacer(target_fps):
    """
    Acts as the literal television for the web client.
    Pops frames perfectly matched to original video speed,
    while the producer buffers them in the background as fast as possible.
    """
    global _cached_jpeg, _web_stream_pacer_stopped, _producer_finished, _stream_state
    target_delay = 1.0 / target_fps
    
    tprint(f"[BUFFER] Web Stream Pacer started @ {target_fps} FPS. Waiting for buffer cushion and UI Start Signal...")
    
    # Wait until at least 50 frames are buffered or the video completes quickly
    while not stop_event.is_set() and not _web_stream_pacer_stopped:
        if _output_queue.qsize() > 50 or _producer_finished:
            break
        time.sleep(0.1)
        
    tprint("[BUFFER] Cushion achieved. Holding stream until dashboard requests playback.")
    
    while not stop_event.is_set() and not _web_stream_pacer_stopped:
        if not _frontend_wants_video:
            time.sleep(0.1)
            continue
            
        start_time = time.time()
        
        if _stream_state != "PLAYING":
            _stream_state = "PLAYING"
            
        try:
            # Block until a frame + metadata is ready in the buffer
            item = _output_queue.get(timeout=1.0)
            if isinstance(item, tuple):
                _cached_jpeg, metadata = item
            else:
                _cached_jpeg, metadata = item, None

            _finalized_video_cache.append((_cached_jpeg, metadata))

            # EMIT SYNCED COUNTS HERE!
            if metadata and _count_callback:
                for event in metadata:
                    _count_callback(event)

        except queue.Empty:
            # If empty and producer finished, we are truly done
            if _producer_finished:
                _stream_state = "ENDED"
                break
            continue
            
        elapsed = time.time() - start_time
        remaining = target_delay - elapsed
        if remaining > 0:
            time.sleep(remaining)


def _cache_playback_pacer(target_fps):
    """
    Acts as a high-performance RAM playback engine.
    Loops through the pre-annotated _finalized_video_cache at target_fps.
    """
    global _cached_jpeg, _frontend_wants_video, _stream_state
    target_delay = 1.0 / target_fps
    
    tprint(f"[CACHE] Starting lightweight playback from RAM cache @ {target_fps} FPS.")
    
    idx = 0
    cache_len = len(_finalized_video_cache)
    
    while not stop_event.is_set():
        if not _frontend_wants_video:
            time.sleep(0.1)
            continue
            
        start_time = time.time()
        
        if _stream_state != "PLAYING":
            _stream_state = "PLAYING"
            
        item = _finalized_video_cache[idx]
        if isinstance(item, tuple):
            _cached_jpeg, metadata = item
        else:
            _cached_jpeg, metadata = item, None
            
        idx += 1
        
        # EMIT SYNCED COUNTS FOR REPLAY
        if metadata and _count_callback:
            for event in metadata:
                _count_callback(event)

        # End of cache playback
        if idx >= cache_len:
            tprint("[CACHE] Cache playback finished.")
            # Auto-pause after dumping entire cache
            _frontend_wants_video = False
            _stream_state = "ENDED"
            break
            
        elapsed = time.time() - start_time
        remaining = target_delay - elapsed
        if remaining > 0:
            time.sleep(remaining)

_detect_module_ref = None

def run_pipeline(headless=False):
    global _detect_module_ref, _web_thread, _web_stream_pacer_stopped, _producer_finished

    videos = discover_videos()
    if not videos:
        tprint("No videos found. Check data/videos/")
        return

    tprint("=" * 65)
    tprint("Mode: Smooth Buffered Rendering (Producer/Consumer queue)")
    tprint("=" * 65)

    detector = VehicleDetector(
        model_name=MODEL_PATH,
        confidence_threshold=CONFIDENCE_THRESHOLD,
        iou_threshold=IOU_THRESHOLD,
        img_size=IMG_SIZE,
    )
    _detect_module_ref = detector

    if not headless:
        tprint("Press 'q' in any window to stop all streams.")
    tprint("=" * 65)

    streams = []
    fps_list = []
    for i, vp in enumerate(videos):
        try:
            s = VideoStream(i, vp, headless, fps_ref=DETECTION_FRAMES_PER_SECOND)
            streams.append(s)
            fps_list.append(s.fps)
        except Exception as e:
            tprint(f"[ERROR] Could not open {vp}: {e}")

    if not streams:
        return

    # Clear queue in case it's restarting
    with _output_queue.mutex:
        _output_queue.queue.clear()
        
    _web_stream_pacer_stopped = False
    _producer_finished = False

    # Target speed for the consumer (Halved playback speed)
    common_fps = max(min(fps_list), 25.0)
    
    # Start the pacer thread!
    _web_thread = threading.Thread(target=_web_stream_pacer, args=(common_fps / 2.0,), daemon=True)
    _web_thread.start()

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    detection_future = None

    tprint("[BUFFER] Pipeline is filling the queue... Stream will appear shortly!")

    # ── Main Accelerated Background Loop ────────────────────────────
    while streams and not stop_event.is_set():
        current_metadata = []
        # 1. Grab frames synchronously
        active_streams = []
        frames = {}
        for s in streams:
            frame = s.next_frame()
            if frame is None:
                s.release()
            else:
                frames[s.index] = frame
                active_streams.append(s)
                
        streams = active_streams
        if not streams:
            break

        detect_indices = [s.index for s in streams if s.should_detect()]
        detect_frames  = [frames[s.index] for s in streams if s.should_detect()]

        batch_results = {}
        if detection_future is not None and detection_future.done():
            try:
                batch_results = detection_future.result()
            except Exception as e:
                tprint(f"[ERROR] Detection thread failed: {e}")
            detection_future = None

        force_sync = False
        for s in streams:
            if s.index in detect_indices and TARGET_LANE == "auto" and s.detected_lane == "auto":
                force_sync = True
                break

        if force_sync:
            if detect_frames:
                results_list = detector.detect_batch(detect_frames)
                for idx, re in zip(detect_indices, results_list):
                    batch_results[idx] = re
        else:
            if detect_frames and detection_future is None:
                def run_detect(indexes, frms):
                    return {idx: det for idx, det in zip(indexes, detector.detect_batch(frms))}
                detection_future = executor.submit(run_detect, detect_indices, list(detect_frames))

        annotated_frames = {}
        for s in streams:
            frame = frames[s.index]
            vsecond = int(s.frame_number / s.fps)

            if s.index in batch_results:
                detections = batch_results[s.index]
                s.update_lane(detections)
                
                on_road_raw = s.filter_on_road(detections)
                tracked_dict = s.tracker.update(on_road_raw)
                
                on_road = []
                for t_id, t_data in tracked_dict.items():
                    if s.road_filter.is_on_road(t_data['bbox']):
                        det = t_data.copy()
                        det['track_id'] = t_id
                        on_road.append(det)

                s.last_on_road = on_road
                s.last_occupancy = s.get_lane_occupancy(on_road)

                # Immediate AI update (Real-time)
                if _count_callback:
                    _count_callback({
                        'type':      'count',
                        'video':     s.video_name,
                        'second':    vsecond,
                        'count':     len(on_road),
                        'occupancy': round(s.last_occupancy, 1),
                        'sync':      False # AI logic only - immediate
                    })

                if not force_sync:
                    s.vehicles_in_second.append(len(on_road))
                    s.occupancies_in_second.append(s.last_occupancy)
            else:
                on_road = s.last_on_road
                if s.should_detect() and force_sync:
                    s.vehicles_in_second.append(len(on_road))
                    s.occupancies_in_second.append(s.last_occupancy)

            s.per_second_log(vsecond)

            # Record pure annotation
            annotated = s.annotate(frame, on_road, s.last_occupancy)
            annotated_frames[s.index] = annotated
            
            # ── Collect SYNCED Metadata ──
            # Bundled with frame for visual synchronization in the dashboard
            current_metadata.append({
                'type':      'count',
                'video':     s.video_name,
                'second':    vsecond,
                'count':     len(on_road),
                'occupancy': round(s.last_occupancy, 1),
                'sync':      True # UI only
            })
            
            # Render locally if not headless
            if not s.headless:
                cv2.imshow(s.window_title, annotated)

        if not headless:
            if cv2.waitKey(1) & 0xFF == ord('q'):
                stop_event.set()
                break

        # ── Grid Compositing ──
        # Process and composite the annotated frames for the web client
        n = max(annotated_frames.keys()) + 1
        cols = min(n, WINDOW_COLUMNS)
        rows = (n + cols - 1) // cols

        grid_rows = []
        for r in range(rows):
            r_frms = []
            for c in range(cols):
                idx = r * cols + c
                if idx in annotated_frames:
                    f = cv2.resize(annotated_frames[idx], (WINDOW_WIDTH, WINDOW_HEIGHT))
                else:
                    f = np.zeros((WINDOW_HEIGHT, WINDOW_WIDTH, 3), dtype=np.uint8)
                r_frms.append(f)
            grid_rows.append(np.hstack(r_frms))

        grid = np.vstack(grid_rows)

        # Scale for 1080p equivalent streaming (crisp quality)
        h, w = grid.shape[:2]
        if w > 1920:
            scale = 1920.0 / w
            grid = cv2.resize(grid, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LINEAR)
            
        ret, buf = cv2.imencode(".jpg", grid, [cv2.IMWRITE_JPEG_QUALITY, 80])
        
        if ret:
            # PUSH (frame, metadata) into queue.
            # Metadata contains the counts specifically for this frame.
            _output_queue.put((buf.tobytes(), current_metadata), block=True)

    # Cleanup sequence
    tprint("[BUFFER] Background inference finished processing all frames!")
    
    _producer_finished = True
    
    for s in streams:
        s.release()

    executor.shutdown(wait=False)
    
    tprint("[BUFFER] Draining remaining frames to dashboard to full video length...")
    
    # Wait for the consumer thread to naturally drain the queue
    if _web_thread and _web_thread.is_alive():
        _web_thread.join()
        
    _web_stream_pacer_stopped = True

    if not headless:
        cv2.destroyAllWindows()

    tprint("=" * 65)
    tprint("All streams finished.")

def main():
    stop_event.clear()
    run_pipeline(headless=False)

if __name__ == "__main__":
    main()

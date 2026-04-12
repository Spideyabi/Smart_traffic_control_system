
# Smart Traffic Control System — Module Key Functions
=======================================================
Each section below covers one module, its purpose, 
and the single most meaningful function with core logic shown.
=======================================================


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 1 — DECISION ENGINE
File: backend/src/controllers/density_controller.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  The brain of the traffic system. Picks which lane gets green
  next using a strict priority rule system — not a fixed timer.

KEY FUNCTION: _pick_by_density()

  def _pick_by_density(self, exclude_dir=None, revert_dir=None):

      # --- PRIORITY 1: Ambulance Emergency ---
      for d in candidates:
          if self._ambulance_dirs.get(d):
              return d, " EMERGENCY", conf=99, green=60.0

      # --- PRIORITY 2: Starvation Guard (waited > 120s) ---
      starved = [d for d in candidates
                 if (now - self._last_green_time[d]) > 120.0
                 and self._live_densities.get(d, 0) > 0]
      if starved:
          worst = max(starved, key=lambda d: now - self._last_green_time[d])
          return worst, "Starvation", conf, green

      # --- PRIORITY 3: Revert after ambulance ---
      if revert_dir and revert_dir in candidates:
          return revert_dir, "Revert", conf=90, green

      # --- PRIORITY 4: Highest vehicle count (normal AI) ---
      best = max(candidates, key=lambda d: self._live_densities.get(d, 0))
      green = _calc_green_time(self._live_densities[best])
      return best, "Highest Count", conf, green

SUPPORTING HELPER — Green time from vehicle count:

  def _calc_green_time(blended_count):
      if blended_count < 4:   return 5.0   # very low traffic
      elif blended_count <= 7: return 9–11s  # low-medium
      elif blended_count <= 10: return 11–14s # medium-high
      else:                    return 15–18s  # heavy traffic
      # Always clamped between MIN=5s and MAX=18s


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 2 — TRAFFIC PREDICTION
File: backend/src/traffic_predictor.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  Keeps a rolling history (last 60 samples) of vehicle counts
  per direction and uses linear regression to forecast future
  traffic density. Feeds predictions to the decision engine.

KEY FUNCTION: predict()

  def predict(self, direction: str, steps: int = 5) -> list[float]:

      hist = list(self._history[direction])  # up to 60 past counts
      n = len(hist)

      if n < 3:
          return [0.0] * steps   # not enough data yet

      x = np.arange(n, dtype=float)
      y = np.array(hist, dtype=float)

      # Fit a straight line (least-squares regression)
      slope, intercept = np.polyfit(x, y, 1)

      # Project 'steps' frames into the future
      future_x = np.arange(n, n + steps, dtype=float)
      raw = slope * future_x + intercept

      return [max(0.0, round(float(v), 2)) for v in raw]
      # Negative predictions are clamped to 0 (no negative vehicles)

SUPPORTING HELPER — Trend detection:

  def get_trend(self, direction) -> str:
      slope = np.polyfit(x, recent_history, 1)[0]
      if slope >  0.3: return "↑"   # traffic rising
      if slope < -0.3: return "↓"   # traffic falling
      return "→"                     # stable


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 3 — VEHICLE TRACKING
File: backend/src/detection/tracker.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  Assigns a persistent ID to each vehicle across frames so the
  same car is not counted twice. Uses centroid distance to match
  detections frame-to-frame (Centroid Tracking algorithm).

KEY FUNCTION: update()

  def update(self, rects):
      # rects = list of bounding boxes from current frame

      # Step 1: Compute centroid of each new detection
      cx = int((x1 + x2) / 2.0)
      cy = int((y1 + y2) / 2.0)

      # Step 2: Greedy nearest-neighbour matching
      for existing_centroid in tracked_objects:
          for new_centroid in input_centroids:
              dist = math.hypot(ex_cx - nx_cx, ex_cy - nx_cy)
              if dist < max_distance:   # default 100px
                  → update existing ID with new position

      # Step 3: Register brand-new vehicles (no match found)
      for unmatched_input:
          self.register(centroid, bbox, class_name)
          self.next_object_id += 1

      # Step 4: Mark unseen vehicles as disappeared
      self.disappeared[obj_id] += 1
      if disappeared > max_disappeared (30 frames):
          self.deregister(obj_id)   # remove stale track

      return { id: { bbox, centroid, class_name } }
      # Final count = len(result) = unique vehicles in this frame


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 4 — VEHICLE DETECTION
File: backend/src/detection/vehicle_detector.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  Runs the YOLOv8-L neural network model on video frames to find
  every vehicle's bounding box and class. Filters for only the
  4 transport classes that matter for traffic density.

VEHICLE CLASSES DETECTED:
  { 2: 'car',  3: 'motorcycle',  5: 'bus',  7: 'truck' }
  (Standard COCO dataset class IDs)

KEY FUNCTION: detect_batch()

  def detect_batch(self, frames):
      # Single YOLO forward pass for ALL camera frames at once
      results = self.model(
          frames,                         # list of numpy frames
          conf=self.confidence_threshold, # default 0.25
          iou=self.iou_threshold,         # default 0.6 (NMS)
          imgsz=self.img_size,            # default 960px
          verbose=False
      )

      for result in results:
          for box in result.boxes:
              class_id   = int(box.cls[0])
              confidence = float(box.conf[0])

              if class_id in VEHICLE_CLASSES:  # only cars/bikes/bus/truck
                  x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                  detections.append({
                      'class_name': VEHICLE_CLASSES[class_id],
                      'confidence': confidence,
                      'bbox':       [x1, y1, x2, y2]
                  })

      return all_detections   # one list per frame


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 5 — VIDEO INPUT PROCESSING
File: backend/main.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  Reads video frames, detects and tracks vehicles inside the
  road ROI, and emits a live vehicle count to the AI controller.

KEY FUNCTION: process_frame()

  def process_frame(stream, frame):
      detections  = detector.detect_batch([frame])[0]  # YOLO
      on_road     = stream.filter_on_road(detections)  # clip to lane
      tracked     = stream.tracker.update(on_road)     # assign IDs
      count       = len(tracked)                       # density
      _count_callback({ 'count': count })              # send to AI


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULE 6 — SIGNAL CONTROLLER (Phase Executor)
File: backend/src/controllers/density_controller.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE:
  Executes the physical signal phase sequence decided by the
  Decision Engine. Runs the GREEN → AMBER → ALL-RED cycle,
  broadcasts real-time state to the dashboard, and handles
  interrupts (ambulance, manual override, stop).

KEY FUNCTION: _do_density_cycle()

  def _do_density_cycle(self, current_dir, green_time, reason, ...):

      # --- 1. Activate GREEN for chosen direction ---
      sigs = { d: "RED" for d in DIRS }
      sigs[current_dir] = "GREEN"
      self._last_green_time[current_dir] = time.time()

      # --- 2. Hold GREEN for calculated duration ---
      result = self._wait_phase(
          green_time, sigs,
          late_decision=True,           # re-evaluate next turn at 5s left
          allow_ambulance_interrupt=True # break early for emergency
      )

      # --- 3. AMBER clearance phase ---
      sigs[current_dir] = "AMBER"
      self._wait_phase(AMBER_TIME=2.0, sigs, ...)

      # --- 4. ALL-RED safety gap ---
      all_red = { d: "RED" for d in DIRS }
      self._wait_phase(ALL_RED_TIME=1.0, all_red, ...)

      # --- 5. Reset lane density after green served ---
      self._live_densities[current_dir] = 0

KEY FUNCTION: _run_loop() — the master control thread

  def _run_loop(self):
      while not self._sig_stop.is_set():

          if self._manual_override:
              self._run_manual_loop()    # operator takes over
              continue

          if mode == "DENSITY":
              if ambulance_detected:
                  → _do_density_cycle(emg_dir, green=60s, emergency=True)
              else:
                  current_dir, reason, conf, green, scores \
                      = self._pick_by_density()       # ask Decision Engine
                  → _do_density_cycle(current_dir, green, ...)

          if mode == "TIME":
              → fixed round-robin cycle, no AI scoring

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW ALL 6 MODULES CONNECT (Data Flow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [Camera Video]
       |
       v
  VIDEO INPUT PROCESSING (main.py)
    → reads frames, calls detect_batch()
       |
       v
  VEHICLE DETECTION (vehicle_detector.py)
    → YOLOv8 returns bounding boxes
       |
       v
  VEHICLE TRACKING (tracker.py)
    → assigns persistent IDs, removes duplicate counts
       |
       v
  count = len(on_road)   ← THE DENSITY NUMBER
       |
       ├──→ PREDICTION (traffic_predictor.py)
       |      → linear regression on last 60 counts
       |      → feeds forecasted count to Decision Engine
       |
       └──→ DECISION ENGINE (density_controller.py _pick_by_density)
              → applies priority rules (ambulance > starvation > density)
              → returns: which direction, how long, why
                   |
                   v
            SIGNAL CONTROLLER (_do_density_cycle)
              → GREEN → AMBER → ALL-RED phases
              → broadcasts signal state to dashboard via WebSocket


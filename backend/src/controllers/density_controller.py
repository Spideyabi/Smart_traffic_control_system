import threading
import time
from .time_based_controller import TimeBasedController # type: ignore

# ── Tunable constants ──────────────────────────────────────────
STARVATION_SECS      = 120.0   # force-green threshold (seconds)
MIN_GREEN            = 5.0    # shortest green phase
MAX_GREEN            = 18.0   # longest green phase
STARTUP_DELAY        = 2.0    # seconds for first vehicles to react
DISCHARGE_HEADWAY    = 1.5    # seconds per vehicle to clear
AMBER_TIME           = 2.0
ALL_RED_TIME         = 1.0
LATE_DECISION_SECS   = 5.0    # re-evaluate next turn this many secs before phase end
MAX_EXPECTED_VEHICLES = 20    # for normalisation
PREDICTION_WEIGHT    = 0.0    # DISABLED: Only use ACTUAL current vehicle count for decisions
WAIT_PENALTY_WEIGHT  = 0.3    # lower penalty makes density the primary driver

DIRS = ["NORTH", "EAST", "SOUTH", "WEST"]


def _blend(actual: int, predicted: float) -> float:
    """Returns actual count only (prediction disabled as per requirements)."""
    return (1 - PREDICTION_WEIGHT) * actual + PREDICTION_WEIGHT * predicted


def _calc_green_time(blended_count: float) -> float:
    """
    Calculate green time based on vehicle count categories.
    - < 4 vehicles: ~5s
    - 4 to 7 vehicles: 9s - 11s
    - 7 to 10 vehicles: 11s - 14s
    - > 10 vehicles: 15s - 18s
    """
    if blended_count <= 0.1:
        return MIN_GREEN
        
    if blended_count < 4.0:
        # Very low traffic
        needed = 5.0
    elif blended_count <= 7.0:
        # Low to medium traffic
        ratio = (blended_count - 4.0) / 3.0
        needed = 9.0 + ratio * (11.0 - 9.0)
    elif blended_count <= 10.0:
        # Medium to high traffic
        ratio = (blended_count - 7.0) / 3.0
        needed = 11.0 + ratio * (14.0 - 11.0)
    else:
        # High traffic
        ratio = min((blended_count - 10.0) / 10.0, 1.0)
        needed = 15.0 + ratio * (18.0 - 15.0)
    
    # Clamp precisely between 5s and 18s
    return round(max(MIN_GREEN, min(MAX_GREEN, needed)), 1) # type: ignore


def _confidence(scores: dict, chosen: str) -> int:
    """
    Confidence = how much better the chosen direction scores vs the average
    of the others. Clamped to [30, 99] so we never show 0 % or 100 %.
    """
    vals = list(scores.values())
    if len(vals) < 2:
        return 80
    others = [v for k, v in scores.items() if k != chosen]
    avg_others = sum(others) / len(others) if others else 0
    chosen_v = scores.get(chosen, 0)
    total = chosen_v + avg_others
    if total == 0:
        return 50
    raw = int((chosen_v / total) * 100)
    return max(30, min(99, raw))


class DensityController:
    def __init__(self, log_callback, signal_callback, predictor=None):
        self._mode = "DENSITY"           # AI mode is the default now
        self._sig_stop            = threading.Event()
        self._ambulance_interrupt = threading.Event()
        self._manual_interrupt    = threading.Event()

        self._live_densities  = {d: 0   for d in DIRS}
        self._ambulance_dirs  = {d: False for d in DIRS}
        self._last_green_time = {d: time.time() for d in DIRS}

        self._manual_override: bool = False
        self._manual_dir: str | None = None
        self._time_idx: int = 0

        self.log_callback    = log_callback
        self.signal_callback = signal_callback
        self._predictor      = predictor   # may be None; set later via set_predictor()
        self._thread: threading.Thread | None = None

        # State tracking for signal restoration
        self._current_dir: str | None = None
        self._revert_dir: str | None = None

        # Rolling log of AI decisions (kept in memory, exposed via server)
        self._ai_log: list[dict] = []

    # ── Public: predictor injection ───────────────────────────
    def set_predictor(self, predictor):
        self._predictor = predictor

    # ── Public: mode / density / ambulance / manual ───────────
    def set_mode(self, mode: str):
        self._mode = mode
        self.log_callback(f"[CONTROLLER] Switched to {mode}-BASED signal control.")

    def get_mode(self) -> str:
        return self._mode

    def update_density(self, direction: str, count: int):
        self._live_densities[direction] = count

    def set_ambulance(self, direction: str, active: bool):
        prev = self._ambulance_dirs.get(direction, False)
        self._ambulance_dirs[direction] = active
        if active and not prev:
            self._ambulance_interrupt.set()
            self.log_callback(f"[EMERGENCY] 🚑 Ambulance detected in {direction} lane!")
        elif not active and prev:
            if not any(self._ambulance_dirs.values()):
                self._ambulance_interrupt.clear()
            self.log_callback(f"[EMERGENCY] ✅ Ambulance cleared from {direction} lane.")

    def set_manual_override(self, active: bool, direction: str | None = None):
        self._manual_override = active
        self._manual_dir: str | None = direction if active else None
        if active:
            self._manual_interrupt.set()
            self.log_callback(f"[MANUAL] 🎮 Manual override ON → {direction} GREEN")
        else:
            self._manual_interrupt.clear()
            self.log_callback("[MANUAL] 🎮 Manual override OFF — resuming AI control")

    def get_manual_state(self):
        return {"active": self._manual_override, "direction": self._manual_dir}

    def get_ai_log(self) -> list:
        # Avoid Pyre type checking issues on slicing a list of dicts by explicitly casting
        # Also, using list comprehension or direct loop to bypass slice typing if it's strict
        limit = 20
        res = []
        start_idx = max(0, len(self._ai_log) - limit)
        for i in range(start_idx, len(self._ai_log)):
            res.append(self._ai_log[i])
        return res

    # ── Start / Stop ──────────────────────────────────────────
    def start(self):
        t = self._thread
        if t is not None and t.is_alive():
            return
        self._sig_stop.clear()
        self._ambulance_interrupt.clear()
        self._manual_interrupt.clear()
        self._manual_override = False
        self._manual_dir      = None
        self._ambulance_dirs  = {d: False for d in DIRS}
        self._last_green_time = {d: time.time() for d in DIRS}
        self._current_dir     = None
        self._revert_dir      = None
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name="DensityController"
        )
        t = self._thread
        if t is not None:
            t.start()

    def stop(self):
        self._sig_stop.set()
        t = self._thread
        if t is not None:
            t.join(timeout=1.0)

    # ── Internal helpers ──────────────────────────────────────
    def _get_ambulance_dir(self):
        for d in DIRS:
            if self._ambulance_dirs.get(d):
                return d
        return None

    def _get_predicted(self, direction: str) -> float:
        """Return the next-step predicted vehicle count, or fall back to actual."""
        if self._predictor is not None:
            preds = self._predictor.predict(direction, steps=1)
            if preds:
                return float(preds[0])
        return float(self._live_densities.get(direction, 0))

    def _score_directions(self, exclude_dir=None):
        """
        Compute an AI score for every direction.

        Score = blended_density  +  wait_penalty
          blended_density = 100% actual (Prediction Disabled), normalised 0-1
          wait_penalty    = seconds waiting × WAIT_PENALTY_WEIGHT, normalised

        Returns dict {dir: score_0_to_1}
        """
        now = time.time()
        scores = {}
        for d in DIRS:
            if d == exclude_dir:
                continue
            actual    = self._live_densities.get(d, 0)
            predicted = self._get_predicted(d)
            blended   = _blend(actual, predicted)
            density_score = min(blended / MAX_EXPECTED_VEHICLES, 1.0)
            wait_secs     = now - self._last_green_time.get(d, now)
            wait_score    = min(wait_secs * WAIT_PENALTY_WEIGHT / STARVATION_SECS, 1.0)
            scores[d]     = round(density_score + wait_score, 4) # type: ignore
        return scores

    def _pick_by_density(self, exclude_dir=None, revert_dir=None):
        """
        AI engine with strict priority rules:
          1. Ambulance 🚑
          2. Starvation 🚨 (wait > 120s with traffic)
          3. Revert ↩️ (Go back to previous signal after ambulance if no starvation)
          4. Highest Vehicle Count 📊
        """
        now = time.time()
        candidates = [d for d in DIRS if d != exclude_dir]

        # 1. Ambulance
        for d in candidates:
            if self._ambulance_dirs.get(d):
                green = 60.0
                scores = {d2: (1.0 if d2 == d else 0.0) for d2 in candidates}
                return d, f"🚑 EMERGENCY: {d}", 99, green, scores

        # 2. Starvation guard
        starved = [
            d for d in candidates
            if (now - self._last_green_time[d]) > STARVATION_SECS
            and self._live_densities.get(d, 0) > 0
        ]
        if starved:
            worst = max(starved, key=lambda d: now - self._last_green_time[d])
            waited = int(now - self._last_green_time[worst])
            scores = self._score_directions(exclude_dir)
            scores[worst] = max(scores.values() or [1.0]) + 0.5
            actual    = self._live_densities.get(worst, 0)
            green     = _calc_green_time(actual)
            conf      = _confidence(scores, worst)
            return worst, f"🚨 Starvation ({actual} cars waited {waited}s)", conf, green, scores

        # 3. Revert to previous after ambulance (only if no starvation)
        if revert_dir and revert_dir in candidates:
            actual    = self._live_densities.get(revert_dir, 0)
            green     = _calc_green_time(actual)
            scores    = self._score_directions(exclude_dir)
            return revert_dir, f"↩️ Revert to {revert_dir} after ambulance", 90, green, scores

        # 4. Highest Count (Density-First)
        scores = self._score_directions(exclude_dir)
        best   = max(candidates, key=lambda d: self._live_densities.get(d, 0))
        highest_count = self._live_densities.get(best, 0)

        # Ensure we don't pick an empty lane if others have traffic
        if highest_count <= 0:
            best = max(scores, key=lambda d: scores[d])
            reason = f"⏳ {best} (oldest queue, all empty)"
        else:
            reason = f"📊 {best} (Highest Count: {highest_count})"

        green = _calc_green_time(highest_count)
        conf  = _confidence(scores, best)
        return best, reason, conf, green, scores

    def _record_ai_decision(self, direction, reason, confidence, green_time, scores):
        entry = {
            "ts":         time.strftime("%H:%M:%S"),
            "direction":  direction,
            "reason":     reason,
            "confidence": confidence,
            "green_time": green_time,
            "scores":     scores,
        }
        self._ai_log.append(entry)
        if len(self._ai_log) > 100:
            self._ai_log.pop(0)
        return entry

    def _broadcast(self, sigs: dict, remaining: float,
                   next_dir: str, next_reason: str,
                   next_conf: int = 0, next_green: float = 0.0,
                   ai_scores: dict | None = None, is_emergency: bool = False):
        now = time.time()
        wait_times = {}
        for d in DIRS:
            if sigs.get(d) == "GREEN":
                wait_times[d] = 0.0
            else:
                wait_times[d] = round(now - self._last_green_time.get(d, now), 1) # type: ignore

        self.signal_callback({
            "signals":        sigs,
            "remaining":      round(remaining, 1), # type: ignore
            "next_dir":       next_dir,
            "next_reason":    next_reason,
            "next_conf":      next_conf,
            "next_green":     round(next_green, 1), # type: ignore
            "ai_scores":      ai_scores or {},
            "is_emergency":   is_emergency,
            "wait_times":     wait_times,
        })

    def _wait_phase(self, duration: float, sigs: dict,
                    next_dir: str, next_reason: str,
                    next_conf: int = 0, next_green: float = 0.0,
                    ai_scores: dict | None = None, is_emergency: bool = False,
                    current_dir=None, late_decision: bool = False,
                    allow_ambulance_interrupt: bool = False) -> str:
        target_time  = time.time() + duration
        decided_late = False

        while True:
            if self._sig_stop.is_set():
                return "stopped"
            if self._manual_interrupt.is_set() and self._manual_override:
                return "manual"
            if allow_ambulance_interrupt:
                emg = self._get_ambulance_dir()
                if self._ambulance_interrupt.is_set():
                    if emg and emg != current_dir:
                        return "ambulance"
                    elif not emg and is_emergency:
                        # Clear the interrupt event if no ambulance exists anymore
                        self._ambulance_interrupt.clear()
                        return "done"
                    elif not emg:
                        self._ambulance_interrupt.clear()
                
                # Double check: if we are in an emergency loop but the dir is gone, exit
                if is_emergency and not emg:
                    return "done"

            remaining = target_time - time.time()
            elapsed   = duration - remaining

            # Early Termination is DISABLED.
            # Rationale: Vehicles cross the stop line quickly and drop off the 'waiting' density count.
            # Aborting the green phase early causes the 15-18s timers (assigned to heavy traffic) to instantly skip at 5s.
            # We want the calculated green time to explicitly play out fully.

            if remaining <= 0:
                return "done"

            if late_decision and current_dir and not decided_late:
                if remaining <= LATE_DECISION_SECS:
                    decided_late = True
                    nd, nr, nc, ng, ns = self._pick_by_density(exclude_dir=current_dir, revert_dir=self._revert_dir)
                    next_dir, next_reason, next_conf, next_green, ai_scores = nd, nr, nc, ng, ns
                    self.log_callback(
                        f"[AI SIGNAL] 🎯 Decision at 5s remaining: {next_dir} ({nr})"
                    )

            self._broadcast(sigs, remaining, next_dir, next_reason,
                            next_conf, next_green, ai_scores, is_emergency)
            time.sleep(0.1)
        
        return "done"

    def _run_manual_loop(self):
        MANUAL_AMBER_SECS = 2.0
        # Initialise last_dir from the AI's last active green so the first
        # switch also gets a proper amber phase.
        last_dir: str | None = self._current_dir

        while self._manual_override and not self._sig_stop.is_set():
            direction = self._manual_dir
            if not direction:
                time.sleep(0.1)
                continue

            # ── Direction changed: show amber on the outgoing green for 2 s ──
            if last_dir and last_dir != direction:
                amber_sigs = {d: "RED" for d in DIRS}
                amber_sigs[last_dir] = "AMBER"
                amber_end = time.time() + MANUAL_AMBER_SECS
                self.log_callback(
                    f"[MANUAL] 🟡 AMBER → {last_dir} (switching to {direction} in {MANUAL_AMBER_SECS:.0f}s)"
                )
                while time.time() < amber_end:
                    if self._sig_stop.is_set() or not self._manual_override:
                        return
                    # If the operator chose yet another direction mid-amber,
                    # restart the amber on the same outgoing light.
                    if self._manual_dir != direction:
                        break
                    remaining = amber_end - time.time()
                    self._broadcast(
                        amber_sigs, remaining,
                        direction, f"🎮 MANUAL: switching to {direction}"
                    )
                    time.sleep(0.1)

                # Re-read in case operator changed direction during amber
                direction = self._manual_dir
                if not direction:
                    last_dir = None
                    continue

            # ── Show GREEN for the selected direction ──
            sigs = {d: "RED" for d in DIRS}
            sigs[direction] = "GREEN"
            self._broadcast(sigs, 0.0, direction, f"🎮 MANUAL: {direction} selected")
            
            # Record and broadcast for history log
            conf = 100
            scores = {d: (1.0 if d == direction else 0.0) for d in DIRS}
            reason = f"🎮 MANUAL: Override active"
            self._record_ai_decision(direction, reason, conf, 0.0, scores)
            self.signal_callback({
                "type":       "ai_decision",
                "direction":  direction,
                "reason":     reason,
                "confidence": conf,
                "green_time": 0.0,
                "scores":     scores,
                "ts":         time.strftime("%H:%M:%S"),
            })

            last_dir = direction
            time.sleep(0.1)

    def _do_density_cycle(self, current_dir: str, green_time: float,
                          reason: str, confidence: int, scores: dict,
                          is_emergency: bool = False) -> str:
        self._current_dir = current_dir

        nd, nr, nc, ng, ns = self._pick_by_density(exclude_dir=current_dir, revert_dir=self._revert_dir)

        sigs = {d: "RED" for d in DIRS}
        sigs[current_dir] = "GREEN"

        self.log_callback(
            f"[AI SIGNAL] GREEN → {current_dir} | conf={confidence}% | "
            f"green={green_time:.1f}s | {reason}"
        )

        result = self._wait_phase(
            green_time, sigs, nd, nr, nc, ng, ns,
            is_emergency=is_emergency,
            current_dir=current_dir,
            late_decision=(not is_emergency),
            allow_ambulance_interrupt=True,
        )

        # Set last green time NOW so waiting starts calculating after green ends
        self._last_green_time[current_dir] = time.time()

        if result in ("stopped", "manual"):
            return result

        # Amber phase
        nd2, nr2, nc2, ng2, ns2 = self._pick_by_density(exclude_dir=current_dir, revert_dir=self._revert_dir)
        sigs[current_dir] = "AMBER"
        r2 = self._wait_phase(AMBER_TIME, sigs, nd2, nr2, nc2, ng2, ns2)
        if r2 in ("stopped", "manual"):
            return r2

        # All-red clearance
        all_red = {d: "RED" for d in DIRS}
        r3 = self._wait_phase(ALL_RED_TIME, all_red, nd2, nr2, nc2, ng2, ns2)
        if r3 in ("stopped", "manual"):
            return r3

        if not is_emergency:
            self._live_densities[current_dir] = 0

        return "ambulance" if result == "ambulance" else "done"

    # ── Main control loop ─────────────────────────────────────
    def _run_loop(self):
        while not self._sig_stop.is_set():
            try:
                # Manual override
                if self._manual_override:
                    self._manual_interrupt.clear()
                    self._run_manual_loop()
                    continue

                if self._mode == "DENSITY":
                    # Check for ambulance first
                    emg_dir = self._get_ambulance_dir()
                    if emg_dir:
                        # 🚑 Capture the interrupted direction to revert to it later
                        if not self._revert_dir and self._current_dir and self._current_dir != emg_dir:
                            self._revert_dir = self._current_dir
                            self.log_callback(f"[EMERGENCY] Will revert to {self._revert_dir} after preemption.")

                        self._ambulance_interrupt.clear()
                        actual    = self._live_densities.get(emg_dir, 0)
                        predicted = self._get_predicted(emg_dir)
                        blended   = _blend(actual, predicted)
                        # Give a long safety timeout for ambulances, knowing we'll terminate early once it clears.
                        green     = 60.0
                        scores    = {d: (1.0 if d == emg_dir else 0.0) for d in DIRS}
                        reason    = f"🚑 PREEMPT: Ambulance in {emg_dir}"
                        conf      = 99
                        
                        self._record_ai_decision(emg_dir, reason, conf, green, scores)
                        
                        # Broadcast ambulance decision event
                        self.signal_callback({
                            "type":       "ai_decision",
                            "direction":  emg_dir,
                            "reason":     reason,
                            "confidence": conf,
                            "green_time": round(green, 1), # type: ignore
                            "scores":     scores,
                            "ts":         time.strftime("%H:%M:%S"),
                        })

                        result = self._do_density_cycle(
                            emg_dir, green, reason, conf, scores, is_emergency=True
                        )
                    else:
                        # Normal AI cycle or Revert after ambulance
                        current_dir, reason, conf, green, scores = self._pick_by_density(revert_dir=self._revert_dir)

                        # Clear revert dir if it was used
                        if current_dir == self._revert_dir:
                            self._revert_dir = None

                        self._record_ai_decision(current_dir, reason, conf, green, scores)

                        # Also broadcast an ai_decision event to the log queue
                        self.signal_callback({
                            "type":       "ai_decision",
                            "direction":  current_dir,
                            "reason":     reason,
                            "confidence": conf,
                            "green_time": round(green, 1), # type: ignore
                            "scores":     scores,
                            "ts":         time.strftime("%H:%M:%S"),
                        })

                        if current_dir is not None:
                            result = self._do_density_cycle(
                                current_dir, green, reason, conf, scores
                            )
                        else:
                            time.sleep(0.1)
                            continue

                    if result == "stopped":
                        break

                if self._mode == "TIME":
                    # ── TIME-BASED fallback ──────────────────
                    self._time_idx = getattr(self, '_time_idx', 0)
                    current_dir = DIRS[self._time_idx]
                    next_dir    = DIRS[(self._time_idx + 1) % 4]
                    green_time  = TimeBasedController.get_green_time()
                    amber_time  = TimeBasedController.get_wait_time()
                    next_reason = "⏱️ Time-based (fixed cycle)"
                    self.log_callback(
                        f"[TIME SIGNAL] GREEN → {current_dir} | {green_time:.1f}s fixed"
                    )
                    # Record and broadcast for history log
                    conf = 100
                    scores = {d: (1.0 if d == current_dir else 0.0) for d in DIRS}
                    reason = f"⏱️ TIME: Fixed cycle ({green_time}s)"
                    self._record_ai_decision(current_dir, reason, conf, float(green_time), scores)
                    self.signal_callback({
                        "type":       "ai_decision",
                        "direction":  current_dir,
                        "reason":     reason,
                        "confidence": conf,
                        "green_time": round(green_time, 1), # type: ignore
                        "scores":     scores,
                        "ts":         time.strftime("%H:%M:%S"),
                    })

                    sigs = {d: "RED" for d in DIRS}
                    sigs[current_dir] = "GREEN"
                    r = self._wait_phase(green_time, sigs, next_dir, next_reason)

                    # Set last green time NOW so waiting starts calculating after green ends
                    self._last_green_time[current_dir] = time.time()
                    if r == "stopped":
                        break
                    if r == "manual":
                        continue

                    sigs[current_dir] = "AMBER"
                    r = self._wait_phase(amber_time, sigs, next_dir, next_reason)
                    if r == "stopped":
                        break
                    if r == "manual":
                        continue

                    all_red = {d: "RED" for d in DIRS}
                    r = self._wait_phase(ALL_RED_TIME, all_red, next_dir, next_reason)
                    if r == "stopped":
                        break
                    if r == "manual":
                        continue

                    self._time_idx = getattr(self, '_time_idx', 0)
                    self._time_idx = (self._time_idx + 1) % 4

            except Exception as e:
                self.log_callback(f"[CONTROLLER ERROR] {e} — restarting cycle")
                time.sleep(1)

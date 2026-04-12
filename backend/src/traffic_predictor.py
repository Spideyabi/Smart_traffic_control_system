"""
Traffic Flow Predictor
======================
Maintains a rolling history of vehicle counts per direction and uses
simple linear regression (numpy only) to forecast future traffic density.
"""

from collections import deque
import numpy as np

DIRECTIONS = ["NORTH", "EAST", "SOUTH", "WEST"]
HISTORY_SIZE = 60          # max samples to keep per direction
FORECAST_STEPS = 5         # how many future steps to predict
MIN_SAMPLES_FOR_FIT = 3    # need at least this many points to regress


class TrafficPredictor:
    def __init__(self, history_size: int = HISTORY_SIZE):
        self._history: dict[str, deque] = {
            d: deque(maxlen=history_size) for d in DIRECTIONS
        }
        self._history_size = history_size

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, direction: str, count: int):
        """Record a new vehicle count observation for a direction."""
        if direction in self._history:
            self._history[direction].append(max(0, int(count)))

    def predict(self, direction: str, steps: int = FORECAST_STEPS) -> list[float]:
        """
        Return a list of `steps` predicted future vehicle counts for
        the given direction using linear regression over the history.
        Returns [0, 0, ...] if not enough data yet.
        """
        hist = list(self._history.get(direction, []))
        n = len(hist)
        if n < MIN_SAMPLES_FOR_FIT:
            return [0.0] * steps

        x = np.arange(n, dtype=float)
        y = np.array(hist, dtype=float)

        # Least-squares linear fit
        coef = np.polyfit(x, y, 1)          # slope, intercept
        slope, intercept = coef

        future_x = np.arange(n, n + steps, dtype=float)
        raw = slope * future_x + intercept
        # Clamp negatives to 0
        return [max(0.0, round(float(v), 2)) for v in raw]

    def get_all_predictions(self, steps: int = FORECAST_STEPS) -> dict:
        """Return predictions for all four directions."""
        return {d: self.predict(d, steps) for d in DIRECTIONS}

    def get_history(self, direction: str) -> list[int]:
        """Return the stored observation history for one direction."""
        return list(self._history.get(direction, []))

    def get_all_history(self) -> dict:
        """Return observation histories for all directions."""
        return {d: list(self._history[d]) for d in DIRECTIONS}

    def get_trend(self, direction: str) -> str:
        """
        Return a trend indicator string for the direction:
        '↑' rising, '↓' falling, '→' stable, '—' not enough data.
        """
        hist = list(self._history.get(direction, []))
        if len(hist) < MIN_SAMPLES_FOR_FIT:
            return "—"
        recent = hist[-min(10, len(hist)):]
        x = np.arange(len(recent), dtype=float)
        y = np.array(recent, dtype=float)
        slope = np.polyfit(x, y, 1)[0]
        if slope > 0.3:
            return "↑"
        if slope < -0.3:
            return "↓"
        return "→"

    def get_peak_direction(self) -> str | None:
        """Return the direction currently predicted to have the most traffic."""
        preds = self.get_all_predictions(steps=1)
        best = max(DIRECTIONS, key=lambda d: preds[d][0] if preds[d] else 0)
        val = preds[best][0] if preds[best] else 0
        return best if val > 0 else None

    def get_predicted_density(self, direction: str, steps: int = 1) -> float:
        """
        Return the single next-step predicted vehicle count for one direction.
        Falls back to the last observed count if not enough data yet.
        """
        preds = self.predict(direction, steps)
        if preds and preds[0] > 0:
            return float(preds[0])
        # Fall back to last observed value
        hist = list(self._history.get(direction, []))
        return float(hist[-1]) if hist else 0.0

    def get_summary(self) -> dict:
        """
        Return a combined summary dict suitable for broadcast:
        { predictions, history, trends, peak_direction }
        """
        predictions = self.get_all_predictions()
        history = self.get_all_history()
        trends = {d: self.get_trend(d) for d in DIRECTIONS}
        peak = self.get_peak_direction()
        return {
            "type": "prediction_update",
            "predictions": predictions,
            "history": history,
            "trends": trends,
            "peak_direction": peak,
        }

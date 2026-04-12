import asyncio
import json
import queue
import threading
from contextlib import asynccontextmanager
from datetime import datetime

from pydantic import BaseModel # type: ignore
from fastapi import FastAPI, WebSocket, WebSocketDisconnect # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from fastapi.responses import StreamingResponse # type: ignore

import main as pipeline_module # type: ignore
from main import stop_event as pipeline_stop, get_latest_jpeg_bytes, set_log_callback, set_count_callback # type: ignore
from src.controllers.density_controller import DensityController # type: ignore
from src.traffic_predictor import TrafficPredictor # type: ignore
from src.database.db_manager import DBManager # type: ignore

_log_queue: queue.Queue = queue.Queue(maxsize=2000)
_prediction_counter: int = 0
PREDICTION_BROADCAST_EVERY = 5  # broadcast after every N count events

def pipeline_log_callback(msg):
    try:
        _log_queue.put_nowait({
            "ts": datetime.now().strftime("%H:%M:%S"),
            "message": msg,
        })
    except queue.Full:
        pass

set_log_callback(pipeline_log_callback)

def _on_signal_update(payload):
    try:
        # If this is already a typed event (e.g. ai_decision), forward as-is
        if payload.get("type") == "ai_decision":
            _log_queue.put_nowait(payload)
            return
        _log_queue.put_nowait({
            "type":         "signal_update",
            "signals":      payload["signals"],
            "remaining":    payload.get("remaining", 0),
            "next_dir":     payload.get("next_dir", "UNKNOWN"),
            "next_reason":  payload.get("next_reason", ""),
            "next_conf":    payload.get("next_conf", 0),
            "next_green":   payload.get("next_green", 0.0),
            "ai_scores":    payload.get("ai_scores", {}),
            "is_emergency": payload.get("is_emergency", False),
            "wait_times":   payload.get("wait_times", {}),
        })
    except queue.Full:
        pass

predictor    = TrafficPredictor()
signal_ctrl  = DensityController(pipeline_log_callback, _on_signal_update, predictor=predictor)
db_manager   = DBManager()

_last_density_log = {"NORTH": -1, "EAST": -1, "SOUTH": -1, "WEST": -1}

_camera_to_dir = {}
_dirs_order = ["NORTH", "EAST", "SOUTH", "WEST"]

def pipeline_count_callback(event: dict):
    global _prediction_counter
    is_sync = event.get("sync", False)
    
    if event.get("type") == "count":
        # INTERNAL LOGIC: Signal Controller, Predictor, and DB
        # Only run this for real-time (unsynced) events OR if not specified
        if not is_sync:
            vid = event.get("video", "unknown")
            if vid not in _camera_to_dir:
                _camera_to_dir[vid] = _dirs_order[len(_camera_to_dir) % 4]
            direction = _camera_to_dir[vid]
            count = event.get("count", 0)
            occupancy = event.get("occupancy", 0.0)
            
            signal_ctrl.update_density(direction, count)
            predictor.update(direction, count)
            db_manager.insert_log(direction, count, occupancy)
            
            _prediction_counter += 1
            if _prediction_counter % PREDICTION_BROADCAST_EVERY == 0:
                summary = predictor.get_summary()
                try:
                    _log_queue.put_nowait(summary)
                except queue.Full:
                    pass
        
        # UI LOGIC: Broadcast to dashboard
        # Only send to UI if this is a SYNCED event!
        if is_sync:
            try:
                _log_queue.put_nowait(event)
            except queue.Full:
                pass
    else:
        # Other event types (like 'log' messages) just pass through to UI
        try:
            _log_queue.put_nowait(event)
        except queue.Full:
            pass

set_count_callback(pipeline_count_callback)

_state_lock = threading.Lock()
_pipeline_running = False
connected_ws: list[WebSocket] = []


def _run():
    global _pipeline_running
    try:
        pipeline_module.run_pipeline(headless=True)
    except Exception as e:
        print(f"[ERROR] Pipeline crashed: {e}")
    finally:
        with _state_lock:
            _pipeline_running = False


def _start_video_pipeline_only():
    """Boot the video detection pipeline WITHOUT starting the signal controller.
    Used for silent pre-fill of the detection queue on server startup."""
    global _pipeline_running
    with _state_lock:
        if _pipeline_running:
            return {"status": "already_running"}
        _pipeline_running = True
    pipeline_stop.clear()
    threading.Thread(target=_run, daemon=True, name="Pipeline").start()
    return {"status": "started"}

def start_pipeline():
    """Start video detection pipeline.
    Used when user explicitly starts the Live Video feed."""
    global _pipeline_running
    with _state_lock:
        if _pipeline_running:
            return {"status": "already_running"}
        _pipeline_running = True
    pipeline_stop.clear()
    threading.Thread(target=_run, daemon=True, name="Pipeline").start()
    return {"status": "started"}

def stop_pipeline():
    global _pipeline_running
    pipeline_stop.set()
    signal_ctrl.stop()
    with _state_lock:
        _pipeline_running = False
    print("[SERVER] Stop requested by user.")
    return {"status": "stopped"}


async def _broadcast_loop():
    global _prediction_counter
    while True:
        await asyncio.sleep(0.04)
        batch = []
        try:
            while True:
                batch.append(_log_queue.get_nowait())
        except queue.Empty:
            pass

        if not batch or not connected_ws:
            continue

        dead = []
        for event in batch:
            payload = json.dumps(event)
            for ws in list(connected_ws):
                try:
                    await ws.send_text(payload)
                except Exception:
                    if ws not in dead:
                        dead.append(ws)

        for ws in dead:
            if ws in connected_ws:
                connected_ws.remove(ws)


async def _mjpeg_generator():
    loop = asyncio.get_running_loop()
    last_data = None
    while True:
        data = await loop.run_in_executor(None, get_latest_jpeg_bytes)
        if data is not None and data != last_data:
            last_data = data
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" +
                data + b"\r\n"
            )
        await asyncio.sleep(0.01)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_broadcast_loop())
    # Only silently boot the video pipeline for queue pre-fill.
    # Signal controller stays OFF until user explicitly starts Simulation or Live Video!
    _start_video_pipeline_only()
    yield


app = FastAPI(title="Traffic Control System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "message": "Traffic Control System Backend is Running",
        "api_docs": "/docs",
        "status_check": "/api/status"
    }


@app.get("/api/status")
def get_status():
    with _state_lock:
        manual = signal_ctrl.get_manual_state()
        return {
            "running": pipeline_module._frontend_wants_video, # Reflected state follows UI stream state
            "stream_state": pipeline_module._stream_state,    # Connect animated states strictly to engine
            "signal_mode": signal_ctrl.get_mode(),
            "manual_override": manual["active"],
            "manual_dir": manual["direction"],
        }

@app.post("/api/signal_mode")
def set_signal_mode(mode: str):
    if mode in ["TIME", "DENSITY"]:
        signal_ctrl.set_mode(mode)
        return {"status": "updated", "mode": mode}
    return {"status": "error", "message": "Invalid mode"}


class ManualOverridePayload(BaseModel):
    active: bool
    direction: str | None = None

@app.post("/api/manual_override")
def set_manual_override(payload: ManualOverridePayload):
    if payload.active and payload.direction not in ["NORTH", "EAST", "SOUTH", "WEST"]:
        return {"status": "error", "message": "Invalid direction"}
    signal_ctrl.set_manual_override(payload.active, payload.direction)
    return {"status": "ok", "active": payload.active, "direction": payload.direction}


# ── Sim-only: start/stop just the signal controller (no video pipeline) ──
_sim_ctrl_running = False
_sim_ctrl_lock = threading.Lock()

@app.post("/api/sim/start")
def sim_start():
    global _sim_ctrl_running
    with _sim_ctrl_lock:
        # removed check for _pipeline_running to allow signals to start during 3D simulation
        if not _sim_ctrl_running:
            signal_ctrl.start()
            _sim_ctrl_running = True
    return {"status": "ok", "sim_ctrl": _sim_ctrl_running}

@app.post("/api/sim/stop")
def sim_stop():
    global _sim_ctrl_running
    with _sim_ctrl_lock:
        if _sim_ctrl_running:
            signal_ctrl.stop()
            _sim_ctrl_running = False
    return {"status": "ok"}


class DensityPayload(BaseModel):
    NORTH: int
    EAST: int
    SOUTH: int
    WEST: int

_density_post_counter: int = 0

@app.post("/api/density")
def set_density(payload: DensityPayload):
    global _last_density_log, _density_post_counter
    # Always feed predictor — even when real pipeline is running
    predictor.update("NORTH", payload.NORTH)
    predictor.update("EAST", payload.EAST)
    predictor.update("SOUTH", payload.SOUTH)
    predictor.update("WEST", payload.WEST)

    # Broadcast prediction update every 5 posts (~2.5 s at 500 ms interval)
    _density_post_counter += 1 # type: ignore
    if _density_post_counter % 5 == 0:
        try:
            _log_queue.put_nowait(predictor.get_summary())
        except queue.Full:
            pass
            
        # Log simulated data to DB 
        db_manager.insert_log("NORTH", payload.NORTH, 0.0)
        db_manager.insert_log("EAST",  payload.EAST, 0.0)
        db_manager.insert_log("SOUTH", payload.SOUTH, 0.0)
        db_manager.insert_log("WEST",  payload.WEST, 0.0)

    # Always update the density controller with the new payload
    signal_ctrl.update_density("NORTH", payload.NORTH)
    signal_ctrl.update_density("EAST", payload.EAST)
    signal_ctrl.update_density("SOUTH", payload.SOUTH)
    signal_ctrl.update_density("WEST", payload.WEST)
    
    if not _pipeline_running:
        new = {"NORTH": payload.NORTH, "EAST": payload.EAST,
               "SOUTH": payload.SOUTH, "WEST": payload.WEST}
        if new != _last_density_log:
            _last_density_log = new
            pipeline_log_callback(
                f"[DENSITY] N={payload.NORTH} E={payload.EAST} "
                f"S={payload.SOUTH} W={payload.WEST}"
            )
    return {"status": "ok"}


@app.get("/api/prediction")
def get_prediction():
    """Return current traffic flow predictions and history for all directions."""
    return predictor.get_summary()


@app.get("/api/ai_log")
def get_ai_log():
    """Return the last 20 AI signal decisions."""
    return {"decisions": signal_ctrl.get_ai_log()}


class AmbulancePayload(BaseModel):
    direction: str
    active: bool

@app.post("/api/ambulance")
def set_ambulance(payload: AmbulancePayload):
    direction = payload.direction.upper()
    if direction not in ["NORTH", "EAST", "SOUTH", "WEST"]:
        return {"status": "error", "message": "Invalid direction"}
    signal_ctrl.set_ambulance(direction, payload.active)
    return {"status": "ok", "direction": direction, "active": payload.active}


@app.post("/api/start")
def api_start():
    # Signal the dashboard queue to unpause and flush gracefully!
    pipeline_module.signal_video_release(True)
    return {"status": "started"}

@app.post("/api/stop")
def api_stop():
    pipeline_module.signal_video_release(False)
    return {"status": "stopped"}

@app.get("/api/video")
async def api_video():
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

@app.websocket("/ws/logs")
async def ws_logs(ws: WebSocket):
    await ws.accept()
    connected_ws.append(ws)
    await ws.send_text(json.dumps({
        "ts":      datetime.now().strftime("%H:%M:%S"),
        "message": "[SERVER] Connected. Press Start to begin detection pipeline.",
    }))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in connected_ws:
            connected_ws.remove(ws)


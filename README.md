# AI Autonomous Traffic Control System

An intelligent, full-stack traffic management solution that combines Computer Vision (YOLOv8) with an AI-driven density controller to optimize signal timings in real-time.

---

## 🚀 Key Features

- **Real-time Vehicle Detection**: Uses YOLOv8 for accurate vehicle counting across multiple lanes.
- **AI Density Controller**: Dynamically adjusts green light timings based on real-time traffic density.
- **Ambulance Prioritization**: Automatically detects and prioritizes emergency vehicles.
- **3D Digital Twin**: A React Three Fiber-based simulator to visualize traffic flow and signal states.
- **Traffic Analytics**: Dashboard for monitoring vehicle counts, occupancy, and AI decision logs.
- **Historical Data**: Integrated SQLite database for logging and traffic prediction analysis.

---

## 🏗️ Project Architecture

- **Backend**: FastAPI server handling MJPEG video streaming, YOLO inference, and the AI controller loop.
- **Frontend**: React-based dashboard with a 3D simulation environment and real-time data visualization.
- **Database**: SQLite for persistent storage of traffic statistics.

---

## 🛠️ Prerequisites

- **Python**: 3.8+
- **Node.js**: 16+
- **YOLOv8 Model**: The system expects a `yolov8m.pt` model in the `backend/models/` directory.

---

## 📦 Installation & Setup

### 1. Backend Setup
```bash
# Navigate to the backend directory
cd backend

# Install dependencies
pip install -r ..\requirements.txt

# Start the FastAPI server
python server.py
```

### 2. Frontend Setup
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

---

## 🚦 Usage

1. **Start the Backend**: Ensure the FastAPI server is running.
2. **Start the Frontend**: Open the dashboard in your browser (usually `http://localhost:5173`).
3. **Live Feed**: Navigate to the "Live Video" tab and click "Start Video" to see the real-time detection feed.
4. **Simulator**: Use the "3D Simulator" tab to view the traffic behavior in a virtual environment.

---

## 📂 Project Structure
- `backend/`: FastAPI server and AI logic.
- `frontend/`: React + Three.js dashboard.
- `data/`: Database and video storage.
- `models/`: YOLO model weights.

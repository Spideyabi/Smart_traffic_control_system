import subprocess
import os
import sys
import time

def run():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    # 1. Validate directories
    if not os.path.exists(backend_dir):
        print(f"[ERROR] Backend directory not found at {backend_dir}")
        sys.exit(1)
    if not os.path.exists(frontend_dir):
        print(f"[ERROR] Frontend directory not found at {frontend_dir}")
        sys.exit(1)

    print("=" * 60)
    print("      AI Autonomous Traffic Control System Launcher      ")
    print("=" * 60)
    print("Starting backend and frontend in separate terminals...")

    # 2. Start Backend (uvicorn)
    # Using 'cmd /c' to keep the terminal open for better visibility on Windows
    backend_cmd = 'cmd /c "title Traffic-System-Backend && cd /d "{}" && uvicorn server:app --host 0.0.0.0 --port 8000 --reload"'.format(backend_dir)
    
    print(f"-> Launching Backend at http://localhost:8000")
    subprocess.Popen(backend_cmd, creationflags=subprocess.CREATE_NEW_CONSOLE)

    # Brief pause to let backend initialize ports
    time.sleep(2)

    # 3. Start Frontend (npm)
    frontend_cmd = 'cmd /c "title Traffic-System-Frontend && cd /d "{}" && npm run dev"'.format(frontend_dir)
    
    print(f"-> Launching Frontend at http://localhost:5173")
    subprocess.Popen(frontend_cmd, creationflags=subprocess.CREATE_NEW_CONSOLE)

    print("\n[SUCCESS] Both components are starting. Monitoring from their respective windows.")
    print("Press Ctrl+C here to terminate this launcher (processes will remain in their windows).")
    print("=" * 60)

if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("\nLauncher terminated.")

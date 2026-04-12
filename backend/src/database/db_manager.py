import sqlite3
import os
from datetime import datetime
import threading

_db_lock = threading.Lock()

class DBManager:
    """
    Handles SQLite connection for logging historical traffic statistics.
    Thread-safe implementation for use within the FastAPI server.
    """
    def __init__(self, db_path="data/traffic_stats.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with _db_lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS traffic_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    vehicle_count INTEGER NOT NULL,
                    occupancy REAL NOT NULL
                )
            ''')
            # Add indexes for faster querying
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON traffic_log(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_direction ON traffic_log(direction)')
            
            conn.commit()
            conn.close()

    def insert_log(self, direction: str, vehicle_count: int, occupancy: float = 0.0):
        """
        Insert a new log entry.
        """
        with _db_lock:
            try:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                timestamp = datetime.now().isoformat()
                cursor.execute('''
                    INSERT INTO traffic_log (timestamp, direction, vehicle_count, occupancy)
                    VALUES (?, ?, ?, ?)
                ''', (timestamp, direction, vehicle_count, occupancy))
                conn.commit()
            except sqlite3.Error as e:
                print(f"[DB ERROR] Could not insert log: {e}")
            finally:
                if 'conn' in locals():
                    conn.close()

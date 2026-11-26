"""Conexões curtas, transações explícitas e consultas parametrizadas."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def connect(path):
    db = sqlite3.connect(str(path), timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS sensors (
                sensor_id TEXT PRIMARY KEY, type TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id TEXT NOT NULL REFERENCES sensors(sensor_id),
                value REAL NOT NULL, timestamp TEXT NOT NULL,
                UNIQUE(sensor_id, timestamp)
            );
            CREATE INDEX IF NOT EXISTS readings_time ON readings(timestamp DESC, id DESC);
            CREATE INDEX IF NOT EXISTS readings_sensor_time ON readings(sensor_id, timestamp DESC);
        """)


SELECT = """SELECT r.id, r.sensor_id AS sensorId, s.type, r.value, r.timestamp
            FROM readings r JOIN sensors s ON s.sensor_id=r.sensor_id"""

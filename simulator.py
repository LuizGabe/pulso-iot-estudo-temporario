"""Simulador independente: gera JSON, mantém uma fila local e entrega via HTTP."""
import argparse
import json
import logging
import math
import os
import random
import signal
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LOG = logging.getLogger("simulador")
SENSORS = [("T010", "temperature"), ("H010", "humidity"),
           ("L010", "luminosity"), ("M010", "motion")]


def generate(tick, rng):
    """Oscilações suaves e ruído; movimento é um estado binário."""
    phase = tick / 12
    values = [round(24 + 3 * math.sin(phase) + rng.uniform(-.4, .4), 2),
              round(62 - 8 * math.sin(phase) + rng.uniform(-2, 2), 2),
              round(max(0, 650 + 240 * math.sin(phase / 2) + rng.uniform(-35, 35)), 2),
              int(rng.random() < .3)]
    stamp = datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    return [dict(sensorId=sensor_id, type=kind, value=value, timestamp=stamp)
            for (sensor_id, kind), value in zip(SENSORS, values)]


class Outbox:
    """A leitura só sai da fila após confirmação HTTP. Sobrevive a reinícios."""
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS pending(id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS rejected(id INTEGER PRIMARY KEY, payload TEXT, reason TEXT)")
        self.db.commit()

    def add(self, readings):
        with self.db:
            self.db.executemany("INSERT INTO pending(payload) VALUES (?)", [(json.dumps(r),) for r in readings])

    def deliver(self, url, stop, batch=100):
        for key, payload in self.db.execute("SELECT id,payload FROM pending ORDER BY id LIMIT ?", (batch,)).fetchall():
            if stop.is_set():
                break
            request = Request(url, data=payload.encode(), headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urlopen(request, timeout=3) as response:
                    if response.status not in (200, 201):
                        raise OSError(f"HTTP inesperado: {response.status}")
                    # Consome a resposta antes de fechar o socket, evitando resets no Windows.
                    response.read()
                reading = json.loads(payload)
                LOG.info("POST %s | %-11s = %-8s | confirmado", reading["sensorId"], reading["type"], reading["value"])
            except HTTPError as error:
                if 400 <= error.code < 500 and error.code not in (408, 429):
                    reason = error.read().decode(errors="replace")[:1000]
                    with self.db:
                        self.db.execute("INSERT INTO rejected(payload,reason) VALUES (?,?)", (payload, reason))
                        self.db.execute("DELETE FROM pending WHERE id=?", (key,))
                    LOG.error("Leitura rejeitada (HTTP %s), preservada em rejected: %s", error.code, reason)
                    continue
                LOG.warning("API indisponível (HTTP %s). Leituras preservadas na fila.", error.code)
                return False
            except (URLError, OSError, TimeoutError) as error:
                LOG.warning("Falha de comunicação: %s. Leituras preservadas na fila.", error)
                return False
            with self.db:
                self.db.execute("DELETE FROM pending WHERE id=?", (key,))
        return True

    def count(self):
        return self.db.execute("SELECT COUNT(*) FROM pending").fetchone()[0]

    def close(self):
        self.db.close()


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("Use um número positivo e finito")
    return number


def main():
    parser = argparse.ArgumentParser(description="Simulador de quatro sensores IoT · Pulso")
    parser.add_argument("--url", default=os.getenv("API_URL", "http://localhost:8080/api/sensor/data"))
    parser.add_argument("--interval", type=positive, default=2, help="Intervalo entre ciclos, em segundos")
    parser.add_argument("--cycles", type=int, default=0, help="0 = contínuo; útil para demonstrações e testes")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--outbox", default=os.getenv("OUTBOX_PATH", "data/outbox.db"))
    args = parser.parse_args()
    if args.cycles < 0:
        parser.error("--cycles deve ser maior ou igual a zero")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s", datefmt="%H:%M:%S")
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    rng, queue = random.Random(args.seed), Outbox(args.outbox)
    LOG.info("Iniciado | 4 sensores | intervalo %.1fs | destino %s", args.interval, args.url)
    tick, failures, retry_at = 0, 0, 0.0
    try:
        while not stop.is_set() and (not args.cycles or tick < args.cycles):
            started = time.monotonic()
            queue.add(generate(tick, rng))
            if started >= retry_at:
                if queue.deliver(args.url, stop):
                    failures = 0
                else:
                    failures += 1
                    delay = min(30, 2 ** min(failures, 5))
                    retry_at = time.monotonic() + delay
                    LOG.info("Nova tentativa em %ss | %s leituras pendentes", delay, queue.count())
            tick += 1
            if not args.cycles or tick < args.cycles:
                stop.wait(max(0, args.interval - (time.monotonic() - started)))
    finally:
        LOG.info("Encerrado | %s ciclos | %s leituras pendentes preservadas", tick, queue.count())
        queue.close()


if __name__ == "__main__":
    main()

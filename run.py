"""Inicia API e simulador em processos separados. Ctrl+C encerra os dois."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent


def main():
    os.chdir(ROOT)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    processes = []
    try:
        api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "localhost", "--port", "8080"])
        processes.append(api)
        for _ in range(60):
            if api.poll() is not None:
                raise RuntimeError("A API encerrou. Verifique as mensagens acima e se a porta 8080 está livre.")
            try:
                with urlopen("http://127.0.0.1:8080/api/health", timeout=.5) as response:
                    response.read()
                    break
            except (URLError, OSError):
                if stop.wait(.25):
                    return
        else:
            raise RuntimeError("A API não respondeu dentro do tempo esperado.")
        # Dá tempo ao processo de reportar eventual erro de bind antes de iniciar o cliente.
        time.sleep(.2)
        if api.poll() is not None:
            raise RuntimeError("Não foi possível iniciar a API na porta 8080.")
        simulator = subprocess.Popen([sys.executable, "simulator.py"])
        processes.append(simulator)
        print("\nPULSO · http://localhost:8080 · Slides: http://localhost:8080/apresentacao\nCtrl+C encerra API e simulador.\n", flush=True)
        while not stop.wait(.5):
            if any(process.poll() is not None for process in processes):
                raise RuntimeError("Um dos componentes encerrou. Consulte os logs acima.")
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    main()

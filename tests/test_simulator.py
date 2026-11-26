import random
import threading
from io import BytesIO
from urllib.error import HTTPError, URLError
from app.models import Reading
from simulator import Outbox, generate


class Accepted:
    status = 201

    def read(self):
        return b'{}'

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


def test_generator_contract_and_consistent_ids():
    rng = random.Random(42)
    for tick in range(200):
        readings = generate(tick, rng)
        assert [r["sensorId"] for r in readings] == ["T010", "H010", "L010", "M010"]
        for reading in readings:
            Reading.model_validate(reading)


def test_outbox_survives_failure_restart_and_recovery(tmp_path, monkeypatch):
    path = str(tmp_path / "outbox.db")
    queue = Outbox(path)
    queue.add(generate(0, random.Random(1)))
    def unavailable(*args, **kwargs):
        raise URLError("offline")
    monkeypatch.setattr("simulator.urlopen", unavailable)
    assert queue.deliver("http://localhost:8080/api/sensor/data", threading.Event()) is False
    assert queue.count() == 4
    queue.close()
    recovered = Outbox(path)
    sent = []
    def accept(request, **kwargs):
        sent.append(request)
        return Accepted()
    monkeypatch.setattr("simulator.urlopen", accept)
    assert recovered.deliver("http://localhost:8080/api/sensor/data", threading.Event())
    assert recovered.count() == 0 and len(sent) == 4
    assert sent[0].get_header("Content-type") == "application/json"
    recovered.close()


def test_permanent_rejection_does_not_block_queue(tmp_path, monkeypatch):
    queue = Outbox(str(tmp_path / "outbox.db"))
    queue.add(generate(0, random.Random(1)))
    def reject(*args, **kwargs):
        raise HTTPError("http://test", 422, "invalid", {}, BytesIO(b'{"detail":"invalid"}'))
    monkeypatch.setattr("simulator.urlopen", reject)
    queue.deliver("http://test", threading.Event())
    assert queue.count() == 0
    assert queue.db.execute("SELECT COUNT(*) FROM rejected").fetchone()[0] == 4
    queue.close()

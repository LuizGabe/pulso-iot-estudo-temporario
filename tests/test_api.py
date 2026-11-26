from concurrent.futures import ThreadPoolExecutor
import csv
import io
import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.db")) as client:
        yield client


def reading(**changes):
    return {"sensorId": "T010", "type": "temperature", "value": 23.5,
            "timestamp": "2026-11-24T14:32:55Z", **changes}


def test_contract_and_persistence(tmp_path):
    path = tmp_path / "iot.db"
    with TestClient(create_app(path)) as client:
        response = client.post("/api/sensor/data", json=reading())
        assert response.status_code == 201
        assert response.json()["duplicate"] is False
    with TestClient(create_app(path)) as restarted:
        data = restarted.get("/api/sensor/data").json()
        assert data["total"] == 1
        assert data["items"][0]["value"] == 23.5
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT sensor_id,value FROM readings").fetchone() == ("T010", 23.5)


@pytest.mark.parametrize("changes", [
    {"type": "unknown"}, {"sensorId": "<script>"}, {"sensorId": ""},
    {"value": "23.5"}, {"value": True}, {"value": None},
    {"timestamp": "2026-11-24T12:00:00"}, {"timestamp": 1234567},
    {"timestamp": "ontem"}, {"extra": "campo"},
    {"type": "humidity", "value": 101}, {"type": "humidity", "value": -1},
    {"type": "luminosity", "value": -2}, {"type": "motion", "value": .5},
    {"value": -51}, {"value": 101},
])
def test_invalid_payloads_never_persist(client, changes):
    assert client.post("/api/sensor/data", json=reading(**changes)).status_code == 422
    assert client.get("/api/sensor/data").json()["total"] == 0


@pytest.mark.parametrize("kind,value", [("temperature", -10), ("humidity", 0),
                                         ("luminosity", 1000), ("motion", 0), ("motion", 1)])
def test_sensor_types(client, kind, value):
    assert client.post("/api/sensor/data", json=reading(type=kind, value=value)).status_code == 201


def test_idempotency_and_conflicts(client):
    assert client.post("/api/sensor/data", json=reading()).status_code == 201
    duplicate = client.post("/api/sensor/data", json=reading(timestamp="2026-11-24T11:32:55-03:00"))
    assert duplicate.status_code == 200 and duplicate.json()["duplicate"]
    assert client.post("/api/sensor/data", json=reading(value=25)).status_code == 409
    assert client.post("/api/sensor/data", json=reading(type="humidity", value=50)).status_code == 409
    assert client.get("/api/sensor/data").json()["total"] == 1


def test_concurrent_retry(client):
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: client.post("/api/sensor/data", json=reading()).status_code, range(12)))
    assert responses.count(201) == 1
    assert responses.count(200) == 11
    assert client.get("/api/sensor/data").json()["total"] == 1


def test_order_filters_pagination_summary_export(client):
    for sensor, kind, value, timestamp in [
        ("T010", "temperature", 23, "2026-11-24T12:00:00Z"),
        ("T010", "temperature", 25, "2026-11-24T14:00:00Z"),
        ("T010", "temperature", 24, "2026-11-24T13:00:00Z"),
        ("H010", "humidity", 60, "2026-11-24T14:00:00Z"),
    ]:
        assert client.post("/api/sensor/data", json=reading(sensorId=sensor, type=kind, value=value, timestamp=timestamp)).status_code == 201
    result = client.get("/api/sensor/data?type=temperature&limit=1&offset=1").json()
    assert result["total"] == 3 and result["items"][0]["value"] == 24
    result = client.get("/api/sensor/data", params={"since": "2026-11-24T10:30:00-03:00", "sensorId": "T010"}).json()
    assert result["total"] == 1 and result["items"][0]["value"] == 25
    summary = client.get("/api/sensor/summary").json()
    assert summary["total"] == 4 and summary["sensors"] == 2
    assert next(r for r in summary["latest"] if r["sensorId"] == "T010")["value"] == 25
    response = client.get("/api/sensor/export?type=temperature")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 3 and rows[-1]["value"] == "25.0"
    assert "attachment" in response.headers["content-disposition"]


@pytest.mark.parametrize("query", ["limit=0", "limit=501", "offset=-1", "type=wrong", "since=invalid",
                                    "since=2026-11-25T00:00:00Z&until=2026-11-24T00:00:00Z"])
def test_invalid_queries(client, query):
    assert client.get("/api/sensor/data?" + query).status_code == 422


def test_empty_and_static_pages(client):
    assert client.get("/api/health").json()["database"] == "sqlite"
    assert client.get("/api/sensor/summary").json() == {"total": 0, "sensors": 0, "lastReading": None, "latest": []}
    for path in ["/", "/apresentacao", "/docs", "/openapi.json", "/static/dashboard.js"]:
        assert client.get(path).status_code == 200


def test_malformed_json(client):
    assert client.post("/api/sensor/data", content="{bad", headers={"Content-Type": "application/json"}).status_code == 422


@pytest.mark.parametrize("value", ["1e309", "NaN", "Infinity"])
def test_non_finite_numbers(client, value):
    payload = '{"sensorId":"T010","type":"temperature","value":' + value + ',"timestamp":"2026-11-24T12:00:00Z"}'
    assert client.post("/api/sensor/data", content=payload, headers={"Content-Type": "application/json"}).status_code == 422

"""API REST e arquivos estáticos. O simulador é um cliente HTTP independente."""
import csv
import io
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AwareDatetime
from app.database import SELECT, connect, initialize
from app.models import Reading, SensorType, iso

ROOT = Path(__file__).resolve().parent.parent


def create_app(database_path=None):
    path = Path(database_path or os.getenv("DATABASE_PATH", ROOT / "data/iot.db"))

    @asynccontextmanager
    async def lifespan(app):
        initialize(path)
        yield

    api = FastAPI(title="Pulso · API REST IoT", version="1.0.0", lifespan=lifespan,
                  description="Sistemas Distribuídos · Luiz Gabriel e Pedro Butzke")

    @api.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        # Evita serializar NaN/Infinity ou objetos ValueError presentes no contexto.
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]})

    def filters(type: SensorType | None = None, sensorId: Annotated[str | None, Query(max_length=40)] = None,
                since: AwareDatetime | None = None, until: AwareDatetime | None = None):
        if since and until and since > until:
            raise HTTPException(422, "O início deve ser anterior ao fim")
        clauses, params = [], []
        for expression, value in [("s.type=?", type.value if type else None),
                                  ("r.sensor_id=?", sensorId),
                                  ("r.timestamp>=?", iso(since) if since else None),
                                  ("r.timestamp<=?", iso(until) if until else None)]:
            if value is not None:
                clauses.append(expression)
                params.append(value)
        return (" WHERE " + " AND ".join(clauses) if clauses else ""), params

    @api.get("/api/health", tags=["Operação"])
    def health():
        with connect(path) as db:
            db.execute("SELECT 1 FROM readings LIMIT 1").fetchone()
        return {"status": "ok", "database": "sqlite", "time": iso(datetime.now(timezone.utc))}

    @api.post("/api/sensor/data", status_code=201, tags=["Leituras"])
    def receive(reading: Reading, response: Response):
        timestamp = iso(reading.timestamp)
        with connect(path) as db:
            # Serializa a verificação e a escrita também sob requisições concorrentes.
            db.execute("BEGIN IMMEDIATE")
            sensor = db.execute("SELECT type FROM sensors WHERE sensor_id=?", (reading.sensorId,)).fetchone()
            if sensor and sensor["type"] != reading.type.value:
                raise HTTPException(409, "Este sensor já está associado a outro tipo")
            db.execute("INSERT OR IGNORE INTO sensors VALUES (?, ?)", (reading.sensorId, reading.type.value))
            existing = db.execute("SELECT id, value FROM readings WHERE sensor_id=? AND timestamp=?",
                                  (reading.sensorId, timestamp)).fetchone()
            if existing:
                if existing["value"] != reading.value:
                    raise HTTPException(409, "Já existe outra leitura para este sensor e instante")
                response.status_code = 200
                return {"id": existing["id"], "duplicate": True, **reading.model_dump(mode="json")}
            cursor = db.execute("INSERT INTO readings(sensor_id,value,timestamp) VALUES (?,?,?)",
                                (reading.sensorId, reading.value, timestamp))
            return {"id": cursor.lastrowid, "duplicate": False, **reading.model_dump(mode="json")}

    @api.get("/api/sensor/data", tags=["Leituras"])
    def readings(selection=Depends(filters), limit: int = Query(20, ge=1, le=500),
                 offset: int = Query(0, ge=0)):
        where, params = selection
        with connect(path) as db:
            # Snapshot consistente entre a contagem e a página.
            db.execute("BEGIN")
            total = db.execute("SELECT COUNT(*) FROM readings r JOIN sensors s ON s.sensor_id=r.sensor_id" + where, params).fetchone()[0]
            rows = db.execute(SELECT + where + " ORDER BY r.timestamp DESC,r.id DESC LIMIT ? OFFSET ?",
                              [*params, limit, offset]).fetchall()
        return {"items": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset}

    @api.get("/api/sensor/summary", tags=["Leituras"])
    def summary(selection=Depends(filters)):
        where, params = selection
        with connect(path) as db:
            db.execute("BEGIN")
            stats = db.execute("""SELECT COUNT(*) AS total, COUNT(DISTINCT r.sensor_id) AS sensors,
                MAX(r.timestamp) AS lastReading FROM readings r
                JOIN sensors s ON s.sensor_id=r.sensor_id""" + where, params).fetchone()
            latest = db.execute("""SELECT * FROM (SELECT r.id,r.sensor_id AS sensorId,s.type,r.value,r.timestamp,
                ROW_NUMBER() OVER (PARTITION BY r.sensor_id ORDER BY r.timestamp DESC,r.id DESC) AS rank
                FROM readings r JOIN sensors s ON s.sensor_id=r.sensor_id""" + where + ") WHERE rank=1 ORDER BY type,sensorId", params).fetchall()
        return {**dict(stats), "latest": [{k: row[k] for k in ("id", "sensorId", "type", "value", "timestamp")} for row in latest]}

    @api.get("/api/sensor/export", tags=["Leituras"])
    def export(selection=Depends(filters)):
        where, params = selection
        # Limite explícito evita exportações sem limite de memória na demonstração local.
        with connect(path) as db:
            rows = db.execute(SELECT + where + " ORDER BY r.timestamp,r.id LIMIT 50001", params).fetchall()
        if len(rows) > 50000:
            raise HTTPException(422, "Restrinja o período para exportar até 50.000 leituras")
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(["id", "sensorId", "type", "value", "timestamp"])
        writer.writerows(tuple(row) for row in rows)
        return Response(stream.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="leituras-iot.csv"'})

    @api.get("/", include_in_schema=False)
    def dashboard():
        return FileResponse(ROOT / "web/index.html")

    @api.get("/apresentacao", include_in_schema=False)
    def slides():
        return FileResponse(ROOT / "web/apresentacao.html")

    api.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")
    return api


app = create_app()

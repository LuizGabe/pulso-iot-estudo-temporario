"""Contrato HTTP do enunciado e validação das grandezas simuladas."""
from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator, model_validator


class SensorType(str, Enum):
    temperature = "temperature"
    humidity = "humidity"
    luminosity = "luminosity"
    motion = "motion"


class Reading(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    sensorId: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    type: SensorType
    value: float = Field(strict=True)
    timestamp: AwareDatetime

    @field_validator("timestamp", mode="before")
    @classmethod
    def iso_timestamp(cls, value):
        if not isinstance(value, (str, datetime)):
            raise ValueError("Use uma data ISO 8601 com fuso horário")
        return value

    @field_validator("timestamp")
    @classmethod
    def utc(cls, value):
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def valid_range(self):
        ranges = {SensorType.temperature: (-50, 100), SensorType.humidity: (0, 100),
                  SensorType.luminosity: (0, 200000), SensorType.motion: (0, 1)}
        low, high = ranges[self.type]
        if not low <= self.value <= high or (self.type == SensorType.motion and self.value not in (0, 1)):
            raise ValueError(f"Valor inválido para {self.type.value}: esperado entre {low} e {high}")
        return self


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

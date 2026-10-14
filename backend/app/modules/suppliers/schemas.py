import uuid

from app.core.catalog import Capability
from app.core.schemas import CamelModel


class TrustScoreComponent(CamelModel):
    key: str
    label: str
    value: float
    weight: float
    explanation: str


class TrustScoreOut(CamelModel):
    trust: float
    risk: float
    reliability: float
    quality: float
    components: list[TrustScoreComponent]


class SupplierMachine(CamelModel):
    name: str
    model: str
    count: int


class SupplierCertification(CamelModel):
    title: str
    issuer: str
    valid_until: str | None = None


class SupplierOut(CamelModel):
    id: uuid.UUID
    company_name: str
    description: str
    city: str
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    founded_year: int | None = None
    employee_count: int | None = None
    capabilities: list[Capability]
    machines: list[SupplierMachine]
    certifications: list[SupplierCertification]
    production_capacity_per_month: int | None = None
    lead_time_days: int
    completed_jobs: int
    on_time_delivery_rate: float
    response_time_hours: float
    verified: bool
    score: TrustScoreOut
    gallery_titles: list[str] = []


class SupplierPage(CamelModel):
    items: list[SupplierOut]
    total: int
    limit: int
    offset: int

from app.core.schemas import CamelModel


class RfqFile(CamelModel):
    name: str
    size: int
    kind: str
    preview_url: str | None = None


class CreateRfqInput(CamelModel):
    title: str
    description: str
    capability: str
    material: str
    quantity: int
    delivery_city: str
    deadline: str
    files: list[RfqFile] = []


class RfqOut(CamelModel):
    id: str
    title: str
    description: str
    capability: str
    material: str
    quantity: int
    delivery_city: str
    deadline: str
    status: str
    files: list[RfqFile]
    quotations_count: int
    created_at: str

"""مقادیر ثابت دامنه که هم بک‌اند و هم فرانت (از طریق OpenAPI) از آن استفاده می‌کنند."""

from typing import Literal

Capability = Literal[
    "cnc",
    "injection_molding",
    "sheet_metal",
    "casting",
    "welding",
    "tooling",
    "plastic_manufacturing",
    "forging",
    "heat_treatment",
    "surface_treatment",
]

Role = Literal["buyer", "supplier", "agent", "qc", "admin"]
SignupRole = Literal["buyer", "supplier", "agent", "qc"]

ROLES: tuple[str, ...] = ("buyer", "supplier", "agent", "qc", "admin")
RFQ_CREATOR_ROLES: tuple[str, ...] = ("buyer", "agent")

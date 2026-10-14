"""قرارداد OpenAPI را در فایل می‌نویسد تا فرانت تایپ‌هایش را از آن تولید کند.

    python -m app.export_openapi            # ← backend/openapi.json
    cd ../frontend && npm run gen:api       # ← src/lib/api/schema.ts

CI بررسی می‌کند که این فایل و تایپ‌های تولیدشده به‌روز باشند.
"""

import json
import sys
from pathlib import Path

from app.main import app

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    schema = app.openapi()
    # newline ثابت تا خروجی ویندوز و لینوکس (CI) یکسان باشد
    target.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"OpenAPI written to {target}")


if __name__ == "__main__":
    main()

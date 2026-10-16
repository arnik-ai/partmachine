"""متن قرارداد ساخت و تأمین قطعه — از روی سفارش و پارامترهای تنظیم‌شده‌ی کارفرما ساخته می‌شود.

⚠️ پیش‌نویس (O4): پیش از استفاده‌ی واقعی باید توسط وکیل بازبینی شود. هر تغییر در متن ثابت این
فایل باید با تغییر `TEMPLATE_VERSION` همراه باشد. پرداخت‌ها مطابق O6 بیرون از پلتفرم انجام
می‌شوند و متن نباید وعده‌ی نگهداری وجه (escrow) بدهد.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from typing import Any

from app.core.config import settings
from app.core.jalali import format_jalali
from app.core.text import fa_digits

TEMPLATE_VERSION = "2026-10-16"
NDA_YEARS = 5
DRAFT_NOTICE = "این متن پیش‌نویس است و پیش از استفاده‌ی واقعی باید توسط وکیل بازبینی شود."


@dataclass(frozen=True)
class ContractFacts:
    order_number: int
    buyer_name: str
    supplier_name: str
    supplier_verified: bool
    title: str
    quantity: int
    material: str
    amount_rials: int
    delivery_city: str
    # فایل‌های فنی RFQ: (نام، حجم، هش)
    files: tuple[tuple[str, int, str], ...]
    # زمان تولید اعلام‌شده در پیشنهاد (روز)؛ برای قطعه‌ی کارفرما مبنای مهلت تحویل است
    lead_time_days: int = 0


@dataclass(frozen=True)
class ContractTerms:
    delivery_due: date
    prepayment_percent: int
    penalty_per_day_bp: int
    penalty_cap_percent: int
    material_from_buyer: bool = False


def toman(rials: int) -> str:
    """مبلغ ریالی ⇒ «۱۸۵٬۰۰۰٬۰۰۰ تومان»."""
    return f"{fa_digits(f'{rials // 10:,}'.replace(',', '٬'))} تومان"


def percent(basis_points: int) -> str:
    """۵۰ ⇒ «۰٫۵»، ۱۰۰ ⇒ «۱»."""
    whole, fraction = divmod(basis_points, 100)
    text = str(whole) if fraction == 0 else f"{whole}٫{str(fraction).rjust(2, '0').rstrip('0')}"
    return fa_digits(text)


def _delivery(facts: ContractFacts, terms: ContractTerms) -> str:
    if terms.material_from_buyer:
        return (
            "کارفرما قطعه یا مواد اولیه‌ی لازم را برای مجری می‌فرستد و مجری رسیدن آن را در پلتفرم "
            "اعلام می‌کند. مجری متعهد است موضوع قرارداد را حداکثر "
            f"{fa_digits(facts.lead_time_days)} روز پس از رسیدن آن در {facts.delivery_city} "
            "تحویل دهد."
        )
    return (
        f"مجری متعهد است موضوع قرارداد را حداکثر تا {format_jalali(terms.delivery_due)} در "
        f"{facts.delivery_city} تحویل دهد."
    )


def _article(number: int, title: str, *paragraphs: str) -> dict[str, Any]:
    return {"number": number, "title": title, "paragraphs": list(paragraphs)}


def _payment(amount_rials: int, prepayment_percent: int) -> str:
    if prepayment_percent == 0:
        return "کل مبلغ پس از تحویل و تأیید کالا توسط کارفرما پرداخت می‌شود."
    if prepayment_percent == 100:
        return "کل مبلغ پیش از شروع تولید پرداخت می‌شود."
    prepayment = amount_rials * prepayment_percent // 100
    rest = amount_rials - prepayment
    return (
        f"{fa_digits(prepayment_percent)}٪ مبلغ ({toman(prepayment)}) به‌عنوان پیش‌پرداخت پیش از "
        f"شروع تولید، و {fa_digits(100 - prepayment_percent)}٪ باقی‌مانده ({toman(rest)}) پس از "
        "تحویل و تأیید کالا توسط کارفرما پرداخت می‌شود."
    )


def _penalty(terms: ContractTerms) -> str:
    if terms.penalty_per_day_bp == 0:
        return "برای تأخیر در تحویل وجه التزامی تعیین نشده است."
    return (
        f"به ازای هر روز تأخیر غیرموجه در تحویل، {percent(terms.penalty_per_day_bp)}٪ مبلغ قرارداد "
        f"و حداکثر تا {fa_digits(terms.penalty_cap_percent)}٪ آن به‌عنوان وجه التزام از مطالبات "
        "مجری کسر می‌شود."
    )


def render(facts: ContractFacts, terms: ContractTerms) -> list[dict[str, Any]]:
    verified = (
        "هویت مجری در زمان تنظیم این قرارداد توسط تراشینو تأیید شده است."
        if facts.supplier_verified
        else "هویت مجری در زمان تنظیم این قرارداد هنوز توسط تراشینو تأیید نشده است."
    )
    files = [
        f"{name} — {fa_digits(max(1, size // 1024))} کیلوبایت — اثر انگشت: {sha256[:16]}"
        for name, size, sha256 in facts.files
    ] or ["فایلی پیوست نشده است؛ مبنای کار شرح درخواست است."]
    return [
        _article(
            1,
            "طرفین قرارداد",
            f"این قرارداد میان «{facts.buyer_name}» (از این پس «کارفرما») و «{facts.supplier_name}» "
            "(از این پس «مجری») در بستر پلتفرم تراشینو منعقد می‌شود و هر طرف با حساب کاربری مدیر "
            "سازمان خود آن را تأیید می‌کند.",
            verified,
        ),
        _article(
            2,
            "موضوع قرارداد",
            f"ساخت و تحویل {fa_digits(facts.quantity)} عدد «{facts.title}» از جنس {facts.material}، "
            f"مطابق شرح و فایل‌های فنی سفارش PM-{fa_digits(facts.order_number)} که فهرست و اثر "
            "انگشت آن‌ها در پیوست ۱ آمده و جزء جدانشدنی این قرارداد است.",
        ),
        _article(
            3,
            "مبلغ و شرایط پرداخت",
            f"مبلغ کل قرارداد {toman(facts.amount_rials)} است.",
            _payment(facts.amount_rials, terms.prepayment_percent),
            "پرداخت‌ها مستقیماً میان طرفین انجام می‌شود. پلتفرم تراشینو وجهی دریافت یا نگهداری "
            "نمی‌کند و فقط اعلام و تأیید پرداخت‌ها را برای پیگیری ثبت می‌کند.",
        ),
        _article(
            4,
            "زمان و محل تحویل",
            _delivery(facts, terms) + " مسئولیت حمل تا تحویل با مجری است، مگر آنکه طرفین "
            "به‌نحو دیگری توافق کنند.",
        ),
        _article(
            5,
            "تعهدات مجری",
            "قطعات را مطابق نقشه‌ها، مشخصات و تلرانس‌های پیوست تولید می‌کند.",
            "زمان تحویل را رعایت می‌کند و هر تأخیر احتمالی را بی‌درنگ از طریق پلتفرم به کارفرما "
            "اطلاع می‌دهد.",
            "اطلاعات و اسناد کارفرما را طبق ماده‌ی ۹ محرمانه نگه می‌دارد.",
        ),
        _article(
            6,
            "تعهدات کارفرما",
            "صحت نقشه‌ها و مشخصات فنی ارائه‌شده بر عهده‌ی کارفرما است.",
            "پرداخت‌ها را طبق ماده‌ی ۳ در موعد انجام می‌دهد و در پلتفرم اعلام می‌کند.",
            "کالا را پس از دریافت بررسی می‌کند و تأیید تحویل یا ایراد را حداکثر ظرف هفت روز در "
            "پلتفرم ثبت می‌کند.",
        ),
        _article(
            7,
            "کنترل کیفیت و معیار پذیرش",
            "معیار پذیرش، انطباق با نقشه‌ها و تلرانس‌های پیوست است."
            + (
                " کارفرما می‌تواند پیش از ارسال، بازرسی توسط آزمایشگاهی تأییدشده در پلتفرم را "
                "درخواست کند؛ در این صورت ارسال پس از قبولی بازرسی انجام می‌شود."
                if settings.inspections_enabled
                else ""
            ),
            "در صورت رد بخشی از کالا، مجری موظف به اصلاح یا ساخت دوباره‌ی همان بخش بدون هزینه‌ی "
            "اضافی است.",
        ),
        _article(
            8,
            "تأخیر در تحویل",
            _penalty(terms),
            "تأخیر بیش از بیست روز به کارفرما حق فسخ قرارداد را می‌دهد.",
        ),
        _article(
            9,
            "محرمانگی",
            "مجری کلیه‌ی نقشه‌ها، اسناد فنی، نمونه‌ها و اطلاعات تجاری کارفرما را محرمانه نگه "
            "می‌دارد، از آن‌ها فقط برای اجرای همین قرارداد استفاده می‌کند و از تکثیر، افشا یا ساخت "
            f"برای شخص ثالث خودداری می‌کند. این تعهد تا {fa_digits(NDA_YEARS)} سال پس از پایان "
            "قرارداد معتبر است.",
        ),
        _article(
            10,
            "حل اختلاف",
            "اختلاف‌ها ابتدا از طریق سازوکار رسیدگی پلتفرم تراشینو و با استناد به سوابق ثبت‌شده "
            "(قرارداد، تاریخچه‌ی سفارش، اسناد و گزارش‌ها) بررسی می‌شود و در صورت عدم توافق، "
            "مراجع قانونی صالح رسیدگی می‌کنند.",
        ),
        _article(
            11,
            "اعتبار نسخه‌ی الکترونیکی",
            "این قرارداد به‌صورت الکترونیکی تنظیم شده و با تأیید برخط مدیر هر دو طرف در پلتفرم "
            "نافذ می‌شود. متن هر نسخه، اثر انگشت (هش) آن، و هویت، زمان، نشانی IP و مرورگر هر "
            "تأییدکننده در سامانه ثبت می‌شود.",
        ),
        _article(12, "پیوست ۱ — فایل‌های فنی", *files),
    ]


def content_hash(articles: list[dict[str, Any]], terms: ContractTerms) -> str:
    """اثر انگشت نسخه: متن کامل مواد، پارامترها و نسخه‌ی قالب."""
    payload = json.dumps(
        {
            "template": TEMPLATE_VERSION,
            "terms": {
                "delivery_due": terms.delivery_due.isoformat(),
                "prepayment_percent": terms.prepayment_percent,
                "penalty_per_day_bp": terms.penalty_per_day_bp,
                "penalty_cap_percent": terms.penalty_cap_percent,
                # فقط وقتی روشن است؛ اثر انگشت نسخه‌های قبلی همان می‌ماند
                **({"material_from_buyer": True} if terms.material_from_buyer else {}),
            },
            "articles": articles,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()

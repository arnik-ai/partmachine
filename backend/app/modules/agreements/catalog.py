"""متن توافق‌ها — تنها مرجع متن قوانین ثبت‌نام، تعهدات کارفرما، NDA هر RFQ و NDA آزمایشگاه.

نسخه‌ی هر متن از خود محتوا ساخته می‌شود؛ هر تغییری در متن نسخه‌ی تازه می‌دهد و کاربر باید
دوباره بپذیرد. پذیرش‌ها با نسخه، زمان، کاربر و سازمان در `agreement_acceptances` ثبت می‌شوند.

⚠️ این متن‌ها نسخه‌ی اولیه‌اند و پیش از استفاده‌ی واقعی باید توسط وکیل بازبینی شوند.
"""

import hashlib
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class AgreementItem:
    id: str
    text: str
    critical: bool = False


@dataclass(frozen=True)
class Agreement:
    key: str
    title: str
    items: tuple[AgreementItem, ...]

    @property
    def version(self) -> str:
        payload = json.dumps(
            {
                "key": self.key,
                "title": self.title,
                "items": [[i.id, i.text, i.critical] for i in self.items],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:12]


BUYER_SIGNUP = Agreement(
    key="buyer_signup",
    title="قوانین پلتفرم",
    items=(
        AgreementItem("buyer-signup-rules", "قوانین عمومی پلتفرم را مطالعه کرده و می‌پذیرم."),
        AgreementItem(
            "buyer-signup-payments",
            "می‌دانم پرداخت سفارش‌ها مستقیماً میان کارفرما و قطعه‌ساز انجام می‌شود و پلتفرم وجهی "
            "دریافت یا نگهداری نمی‌کند؛ اعلام و تأیید پرداخت‌ها در پلتفرم ثبت می‌شود.",
            critical=True,
        ),
    ),
)

SUPPLIER_SIGNUP = Agreement(
    key="supplier_signup",
    title="تعهدات قطعه‌ساز (شامل عدم افشا)",
    items=(
        AgreementItem(
            "supplier-nda",
            "تعهد عدم افشا (NDA): نقشه‌ها، فایل‌های فنی و اطلاعات کارفرما را محرمانه نگه می‌دارم، "
            "به شخص ثالث منتقل نمی‌کنم و فقط برای انجام همان سفارش استفاده می‌کنم.",
            critical=True,
        ),
        AgreementItem(
            "supplier-info-accuracy",
            "اطلاعات پروفایل، ماشین‌آلات، گواهینامه‌ها و توانمندی‌هایی که ثبت می‌کنم واقعی است.",
        ),
        AgreementItem(
            "supplier-quality",
            "قطعات را مطابق نقشه و تلرانس‌های اعلام‌شده تولید می‌کنم و نتیجه‌ی بازرسی QC را می‌پذیرم.",
        ),
        AgreementItem(
            "supplier-deadline",
            "به زمان تحویل اعلام‌شده در استعلام قیمت خود پایبند می‌مانم و تأخیر بر امتیاز اعتمادم اثر می‌گذارد.",
        ),
        AgreementItem(
            "supplier-platform-orders",
            "سفارش‌هایی را که از طریق پارت‌ماشین به دست می‌آورم در پلتفرم ثبت و پیگیری می‌کنم و برای "
            "دور زدن پلتفرم با کارفرمای معرفی‌شده معامله‌ی جداگانه نمی‌کنم.",
            critical=True,
        ),
    ),
)

AGENT_SIGNUP = Agreement(
    key="agent_signup",
    title="تعهدات مأمور خرید",
    items=(
        AgreementItem("agent-authority", "از طرف کارفرمای خود مجاز به ثبت درخواست و مذاکره هستم."),
        AgreementItem(
            "agent-nda",
            "اطلاعات فنی و قیمت‌های دریافتی را فقط برای همان فرآیند خرید استفاده می‌کنم.",
            critical=True,
        ),
    ),
)

QC_SIGNUP = Agreement(
    key="qc_signup",
    title="تعهدات آزمایشگاه کنترل کیفیت",
    items=(
        AgreementItem(
            "qc-impartial",
            "بازرسی‌ها را بی‌طرفانه و بر اساس استانداردهای اعلام‌شده انجام می‌دهم.",
            critical=True,
        ),
        AgreementItem(
            "qc-nda", "تعهد عدم افشا: نقشه‌ها و نتایج آزمون را محرمانه نگه می‌دارم.", critical=True
        ),
        AgreementItem(
            "qc-docs",
            "گزارش‌ها و گواهی‌های صادره معتبر و قابل استناد است و مسئولیت صحت آن با آزمایشگاه است.",
        ),
    ),
)

BUYER_ORDER = Agreement(
    key="buyer_order",
    title="قوانین و تعهدات کارفرما",
    items=(
        AgreementItem(
            "buyer-info-accuracy",
            "صحت نقشه‌ها، مشخصات فنی و اطلاعات ثبت‌شده را تأیید می‌کنم و مسئولیت خطای اطلاعات با من است.",
        ),
        AgreementItem(
            "buyer-payments",
            "می‌دانم پرداخت مستقیماً به قطعه‌ساز انجام می‌شود و پلتفرم وجهی دریافت یا نگهداری "
            "نمی‌کند؛ پرداخت‌ها را طبق قرارداد انجام می‌دهم و در پلتفرم اعلام می‌کنم.",
            critical=True,
        ),
        AgreementItem(
            "buyer-qc-respect",
            "نتیجه‌ی بازرسی کنترل کیفیت مرضی‌الطرفین را به‌عنوان مبنای تأیید یا رد قطعات می‌پذیرم.",
        ),
        AgreementItem(
            "buyer-platform-rules",
            "قوانین عمومی پلتفرم و فرآیند حل اختلاف را مطالعه کرده و می‌پذیرم.",
        ),
    ),
)

RFQ_NDA = Agreement(
    key="rfq_nda",
    title="تعهد عدم افشای اطلاعات این درخواست",
    items=(
        AgreementItem(
            "rfq-nda-confidential",
            "نقشه‌ها، فایل‌های فنی و اطلاعات این درخواست را محرمانه نگه می‌دارم و در اختیار شخص ثالث "
            "قرار نمی‌دهم.",
            critical=True,
        ),
        AgreementItem(
            "rfq-nda-purpose",
            "این اطلاعات را فقط برای بررسی و قیمت‌دهی همین درخواست، و در صورت انتخاب، برای اجرای "
            "همان سفارش استفاده می‌کنم.",
        ),
        AgreementItem(
            "rfq-nda-team",
            "در سازمان ما فقط افرادی که در این کار نقش دارند به فایل‌ها دسترسی خواهند داشت.",
        ),
        AgreementItem(
            "rfq-nda-logging",
            "می‌دانم هر دانلود فایل به نام من ثبت می‌شود و نقض این تعهد ممکن است به مسدود شدن حساب "
            "و پیگیری حقوقی منجر شود.",
            critical=True,
        ),
    ),
)

# آزمایشگاهی که کارفرما برای بازرسی یک سفارش انتخاب کرده، پیش از دیدن نقشه‌ها می‌پذیرد (3d)
INSPECTION_NDA = Agreement(
    key="inspection_nda",
    title="تعهد عدم افشای اطلاعات این سفارش (آزمایشگاه)",
    items=(
        AgreementItem(
            "inspection-nda-confidential",
            "نقشه‌ها، فایل‌های فنی، نمونه‌ها و نتایج بازرسی این سفارش را محرمانه نگه می‌دارم و در "
            "اختیار شخص ثالث قرار نمی‌دهم.",
            critical=True,
        ),
        AgreementItem(
            "inspection-nda-purpose",
            "این اطلاعات را فقط برای بازرسی کیفیت همین سفارش استفاده می‌کنم.",
        ),
        AgreementItem(
            "inspection-nda-team",
            "در سازمان ما فقط افرادی که در این بازرسی نقش دارند به فایل‌ها دسترسی خواهند داشت.",
        ),
        AgreementItem(
            "inspection-nda-logging",
            "می‌دانم هر دانلود فایل به نام من ثبت می‌شود و نقض این تعهد ممکن است به مسدود شدن حساب "
            "و پیگیری حقوقی منجر شود.",
            critical=True,
        ),
    ),
)

AGREEMENTS: dict[str, Agreement] = {
    a.key: a
    for a in (
        BUYER_SIGNUP,
        SUPPLIER_SIGNUP,
        AGENT_SIGNUP,
        QC_SIGNUP,
        BUYER_ORDER,
        RFQ_NDA,
        INSPECTION_NDA,
    )
}

SIGNUP_AGREEMENT_BY_ROLE: dict[str, str] = {
    "buyer": BUYER_SIGNUP.key,
    "supplier": SUPPLIER_SIGNUP.key,
    "agent": AGENT_SIGNUP.key,
    "qc": QC_SIGNUP.key,
}

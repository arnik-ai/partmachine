import { CAPABILITIES, type CapabilityValue } from "@/lib/constants";
import type { ConfiguratorCopy } from "./configurator";

/** متن صفحه‌ی اول به دو زبان؛ فارسی نشانی «/» و انگلیسی نشانی «/en» دارد. */

export type Lang = "fa" | "en";

type Step = { title: string; text: string };
type Role = { who: string; title: string; points: string[]; cta: string; href: string; primary?: boolean };
type Card = { title: string; text: string };
type Faq = { q: string; a: string };
type Quote = { name: string; meta: string; bars: [number, number, number]; best?: boolean };
type ExplodePart = {
  part: "pipe" | "bolts" | "flangeA" | "gasket" | "flangeB" | "nuts";
  capability: CapabilityValue;
  name: string;
  /** مشخصات نمونه‌ی جزء برای کارت «کلیک روی جزء» */
  spec: string;
  at: number;
  lift?: boolean;
};

export type LandingCopy = {
  meta: { title: string; description: string; ogTitle: string; ogDescription: string };
  brand: { name: string; sub: string; tag: string; home: string };
  nav: {
    label: string;
    how: string;
    roles: string;
    services: string;
    trust: string;
    faq: string;
    login: string;
    register: string;
    switchTo: string;
    switchLabel: string;
  };
  hero: { eyebrow: string; title: [string[], string[]]; lead: string; drag: string };
  sheet: { title: string; material: string; qty: string; tolerance: string; scale: string };
  how: { eyebrow: string; title: string; lead: string; steps: Step[] };
  panels: {
    sample: string;
    request: { title: string; part: string; typed: string; material: string; qty: string; qtyValue: string; deadline: string; deadlineValue: string; nda: string; submit: string };
    quotes: { title: string; best: string; bars: [string, string, string]; items: Quote[] };
    contract: { title: string; version: string; buyer: string; maker: string; stamp: string };
    order: { title: string; steps: { label: string; note?: string; state?: "done" | "now" }[]; paid: string };
  };
  roles: { eyebrow: string; title: string; lead: string; items: Role[] };
  /** پیکربندی زنده‌ی فلنج */
  config: { eyebrow: string; title: string; lead: string } & ConfiguratorCopy;
  /** نقشه‌ی شبکه‌ی ایران؛ {a}، {b} و {c} نام شهرها */
  network: { eyebrow: string; title: string; lead: string; caption: string; note: string };
  services: { eyebrow: string; title: string; labels: Record<CapabilityValue, string> };
  /** نمای انفجاری: هر جزء اتصال فلنجی با خدمت تولیدش (at = آستانه‌ی نمایش برچسب) */
  explode: { title: string; lead: string; hint: string; pickHint: string; cta: string; close: string; parts: ExplodePart[] };
  trust: { eyebrow: string; title: string; cards: Card[] };
  faq: { eyebrow: string; title: string; items: Faq[] };
  closing: { title: string; cta: string };
  footer: { about: string; services: string; servicesTag: string; platform: string; platformTag: string; sheet: string; rev: string; copy: string; mark: string };
};

const FA_SERVICES = Object.fromEntries(CAPABILITIES.map((c) => [c.value, c.label])) as Record<
  CapabilityValue,
  string
>;

export const LANDING: Record<Lang, LandingCopy> = {
  fa: {
    meta: {
      title: "تراشینو؛ ساخت قطعات صنعتی",
      description:
        "تراشینو، بازار آنلاین ساخت قطعات صنعتی: نقشه یا فایل CAD را ثبت کنید، از قطعه‌سازان تأییدشده پیشنهاد قیمت بگیرید، قرارداد ببندید و سفارش را تا تحویل دنبال کنید.",
      ogTitle: "تراشینو | ساخت قطعات صنعتی، به سفارش شما",
      ogDescription: "از قطعه‌سازان تأییدشده پیشنهاد قیمت بگیرید؛ نقشه‌ها فقط پس از تعهد محرمانگی دیده می‌شوند.",
    },
    brand: { name: "تراشینو", sub: "TARASHINO", tag: "سفارش ساخت قطعات صنعتی", home: "تراشینو، صفحه‌ی اول" },
    nav: {
      label: "بخش‌های صفحه",
      how: "فرایند سفارش",
      roles: "راهکارها",
      services: "خدمات تولید",
      trust: "چرا تراشینو",
      faq: "سؤالات متداول",
      login: "ورود",
      register: "ثبت‌نام",
      switchTo: "EN",
      switchLabel: "English version",
    },
    hero: {
      eyebrow: "بازار آنلاین قطعه‌سازی صنعتی",
      title: [
        ["ساخت", "قطعات", "صنعتی،"],
        ["به", "سفارش", "شما"],
      ],
      lead: "نقشه‌ی فنی را ثبت کنید، از قطعه‌سازان تأییدشده پیشنهاد قیمت بگیرید و سفارش را از قرارداد تا تحویل یک‌جا مدیریت کنید.",
      drag: "بکشید تا بچرخد",
    },
    sheet: {
      title: "فلنج اتصال لوله",
      material: "متریال: St37",
      qty: "تعداد: ۲۰۰ عدد",
      // جداسازی دوجهته تا علامت ± کنار عدد بماند
      tolerance: "تلرانس: ⁦±0.05⁩",
      scale: "مقیاس: ⁦1:2⁩",
    },
    how: {
      eyebrow: "فرایند سفارش",
      title: "از نقشه تا تحویل، در چهار قدم",
      lead: "هر قدم در صفحه‌ی همان سفارش ثبت می‌شود و هر دو طرف همان را می‌بینند.",
      steps: [
        { title: "درخواست", text: "نقشه یا فایل CAD، متریال، تعداد و مهلت را ثبت می‌کنید." },
        {
          title: "پیشنهاد",
          text: "قطعه‌سازان قیمت و زمان تحویل می‌دهند و شما آن‌ها را کنار هم می‌بینید: قیمت، زمان و سابقه‌ی واقعی. نقشه را فقط کسی می‌بیند که تعهد محرمانگی را پذیرفته است.",
        },
        {
          title: "قرارداد",
          text: "پیشنهاد مناسب را انتخاب می‌کنید و مدیران دو طرف قرارداد را امضا می‌کنند. همه‌ی نسخه‌ها ثبت می‌شوند.",
        },
        {
          title: "تحویل",
          text: "پیشرفت کار، پرداخت‌ها و بازرسی کیفیتِ اختیاری در صفحه‌ی سفارش ثبت می‌شوند تا قطعه به دستتان برسد.",
        },
      ],
    },
    panels: {
      sample: "نمونه",
      request: {
        title: "درخواست تازه",
        part: "عنوان قطعه",
        typed: "فلنج اتصال لوله",
        material: "متریال",
        qty: "تعداد",
        qtyValue: "۲۰۰ عدد",
        deadline: "مهلت",
        deadlineValue: "۲۰ روز",
        nda: "محرمانه با NDA",
        submit: "ثبت درخواست",
      },
      quotes: {
        title: "پیشنهادهای رسیده",
        best: "متعادل‌ترین",
        bars: ["قیمت", "زمان", "سابقه"],
        items: [
          { name: "قطعه‌ساز الف", meta: "۴۲ میلیون تومان · ۲۴ روز", bars: [92, 55, 48] },
          { name: "قطعه‌ساز ب", meta: "۴۸ میلیون تومان · ۱۸ روز", bars: [78, 84, 90], best: true },
          { name: "قطعه‌ساز ج", meta: "۵۶ میلیون تومان · ۱۲ روز", bars: [52, 96, 70] },
        ],
      },
      contract: { title: "قرارداد ساخت فلنج", version: "نسخه‌ی ۲", buyer: "مدیر کارفرما", maker: "مدیر قطعه‌ساز", stamp: "امضا شد" },
      order: {
        title: "سفارش TR-1048",
        steps: [
          { label: "قرارداد امضا شد", state: "done" },
          { label: "تولید", note: "۱۴ روز", state: "done" },
          { label: "بازرسی کیفیت", note: "اختیاری، قبول", state: "done" },
          { label: "ارسال", note: "در راه", state: "now" },
          { label: "تحویل" },
        ],
        paid: "✓ پیش‌پرداخت ثبت و تأیید شد",
      },
    },
    config: {
      eyebrow: "پیکربندی",
      title: "قطعه‌ی خودتان را بسازید",
      lead: "قطر، تعداد دندانه، جنس و تعداد یک چرخ‌دنده را انتخاب کنید. وزن و برآورد با همان فرمول شفاف پلتفرم محاسبه می‌شود.",
      diameter: "قطر بیرونی",
      teeth: "تعداد دندانه",
      material: "جنس",
      quantity: "تعداد سفارش",
      weight: "وزن هر قطعه",
      estimate: "برآورد کل سفارش",
      kg: "کیلوگرم",
      million: "میلیون تومان",
      cta: "ثبت درخواست با همین مشخصات",
      note: "برآورد تقریبی است؛ قیمت نهایی را قطعه‌سازان در پیشنهادهایشان می‌دهند.",
      drag: "بکشید تا بچرخد",
    },
    network: {
      eyebrow: "شبکه",
      title: "از هر شهر، تا قطعه‌ساز مناسب",
      lead: "درخواست از یک شهر ثبت می‌شود، ساخت در شهر دیگری انجام می‌شود و بازرسی در شهر سوم؛ همه در یک پرونده.",
      caption: "درخواست از {a} ← ساخت در {b} ← بازرسی در {c}",
      note: "مسیرها نمونه‌اند.",
    },
    roles: {
      eyebrow: "راهکارها",
      title: "یک سفارش، سه نقش هماهنگ",
      lead: "کارفرما سفارش می‌دهد، قطعه‌ساز تولید می‌کند و آزمایشگاه کیفیت را می‌سنجد؛ همه در یک پرونده‌ی مشترک.",
      items: [
        {
          who: "کارفرمایان",
          title: "خرید مطمئن قطعه",
          points: [
            "مقایسه‌ی روشن پیشنهادها: قیمت، زمان و سابقه",
            "قطعه‌سازان تأییدشده با سابقه‌ی واقعی",
            "قرارداد و تاریخچه‌ی کامل هر سفارش",
          ],
          cta: "ثبت درخواست قطعه",
          href: "/register?role=buyer",
          primary: true,
        },
        {
          who: "قطعه‌سازان",
          title: "سفارش‌های واقعی در تخصص شما",
          points: [
            "درخواست‌های واقعی، با نقشه پس از تعهد محرمانگی",
            "پروفایل، نمونه‌کار و نشان «تأییدشده»",
            "سابقه‌ی تحویل به‌موقع که امتیاز اعتماد شما را می‌سازد",
          ],
          cta: "ثبت‌نام قطعه‌سازان",
          href: "/register?role=supplier",
        },
        {
          who: "آزمایشگاه‌های کنترل کیفیت",
          title: "بازرسی یکپارچه با سفارش",
          points: ["بازرسی سفارش‌هایی که کارفرما به شما می‌سپارد", "ثبت نتیجه و گزارش در همان سفارش"],
          cta: "ثبت‌نام آزمایشگاه‌ها",
          href: "/register?role=qc",
        },
      ],
    },
    services: { eyebrow: "خدمات تولید", title: "قطعه‌سازان هر رشته را ببینید", labels: FA_SERVICES },
    explode: {
      title: "یک مجموعه، شش فرایند تولید",
      lead: "اتصال فلنجی از شش جزء ساخته می‌شود و هر جزء را قطعه‌سازِ همان رشته می‌سازد.",
      hint: "اسکرول کنید",
      pickHint: "روی هر جزء بزنید تا مشخصاتش را ببینید",
      cta: "دیدن قطعه‌سازان این رشته",
      close: "بستن",
      parts: [
        { part: "pipe", capability: "welding", name: "لوله و جوش", spec: "لوله‌ی فولادی به گلوی فلنج جوش لب‌به‌لب می‌شود و جوش بازرسی چشمی می‌شود.", at: 0.3 },
        { part: "bolts", capability: "forging", name: "پیچ‌های اتصال", spec: "شش پیچ M16 از فولاد گرید ۸.۸؛ سر شش‌گوش فورج‌شده و رزوه‌ی نورد.", at: 0.38, lift: true },
        { part: "flangeA", capability: "cnc", name: "فلنج گلودار", spec: "فولاد St37، قطر ۲۴۰ میلی‌متر، شش سوراخ Ø18 با تلرانس ±0.05.", at: 0.46 },
        { part: "gasket", capability: "injection_molding", name: "واشر آب‌بندی", spec: "واشر حلقوی لاستیکی برای فشار کاری تا ۱۶ بار.", at: 0.54, lift: true },
        { part: "flangeB", capability: "casting", name: "فلنج مقابل", spec: "چدن داکتیل ریخته‌گری‌شده؛ رویه‌ی تماس تراش‌کاری می‌شود.", at: 0.62 },
        { part: "nuts", capability: "heat_treatment", name: "مهره‌ها", spec: "مهره‌های سخت‌کاری‌شده؛ رنگ آبی و طلایی اثر بازپخت فولاد است.", at: 0.7, lift: true },
      ],
    },
    trust: {
      eyebrow: "چرا تراشینو",
      title: "نقشه‌ی شما سرمایه‌ی شماست",
      cards: [
        {
          title: "نقشه‌ها خصوصی‌اند",
          text: "فقط قطعه‌سازی که تعهد محرمانگی همان درخواست را پذیرفته نقشه را می‌بیند و هر دانلود ثبت می‌شود.",
        },
        { title: "قطعه‌ساز تأییدشده", text: "مدارک هر قطعه‌ساز پیش از گرفتن نشان «تأییدشده» بررسی می‌شود." },
        {
          title: "قرارداد امضاشده",
          text: "نسخه‌های قرارداد و تاریخچه‌ی هر سفارش ثبت می‌شوند و همیشه در دسترس دو طرف‌اند.",
        },
        { title: "ورود دومرحله‌ای", text: "حساب را با کد اپ روی گوشی هم محافظت کنید؛ برای ادمین‌ها اجباری است." },
      ],
    },
    faq: {
      eyebrow: "سؤالات متداول",
      title: "پیش از شروع",
      items: [
        {
          q: "پول از راه تراشینو پرداخت می‌شود؟",
          a: "نه. پرداخت مستقیم بین شما و قطعه‌ساز انجام می‌شود و تراشینو ثبت و تأیید هر پرداخت را در صفحه‌ی سفارش نگه می‌دارد.",
        },
        {
          q: "نقشه‌ی من محرمانه می‌ماند؟",
          a: "بله. فقط قطعه‌سازی که تعهد محرمانگی همان درخواست را پذیرفته نقشه را می‌بیند و هر دانلود ثبت می‌شود.",
        },
        {
          q: "قطعه‌سازان چطور تأیید می‌شوند؟",
          a: "قطعه‌ساز مدارک شرکت را می‌فرستد و تیم تراشینو آن‌ها را بررسی می‌کند. پس از تأیید، نشان «تأییدشده» کنار نامش می‌آید.",
        },
        {
          q: "روی گوشی هم کار می‌کند؟",
          a: "بله. روی اندروید و آیفون مثل یک اپ روی صفحه‌ی گوشی نصب می‌شود و نیازی به بازار اپ ندارد.",
        },
      ],
    },
    closing: { title: "پروژه‌ی بعدی‌تان را همین امروز آغاز کنید", cta: "ثبت درخواست ساخت قطعه" },
    footer: {
      about: "اتصال کارفرمایان صنعتی به قطعه‌سازان تأییدشده، با قرارداد امضاشده و پیگیری شفاف هر سفارش.",
      services: "خدمات تولید",
      servicesTag: "SERVICES",
      platform: "تراشینو",
      platformTag: "PLATFORM",
      sheet: "۰۱ از ۰۱",
      rev: "۱۴۰۵",
      copy: "© ۱۴۰۵ تراشینو. همه‌ی حقوق محفوظ است.",
      mark: "تراشینو",
    },
  },
  en: {
    meta: {
      title: "Tarashino — Industrial Parts",
      description:
        "Tarashino is a B2B marketplace for custom industrial parts: upload a drawing, get quotes from verified manufacturers, sign the contract and track the order to delivery.",
      ogTitle: "Tarashino | Industrial parts, made to order",
      ogDescription: "Get quotes from verified manufacturers; drawings are shared only after an NDA.",
    },
    brand: { name: "Tarashino", sub: "تراشینو", tag: "Custom industrial parts, made to order", home: "Tarashino home" },
    nav: {
      label: "Page sections",
      how: "How it works",
      roles: "Solutions",
      services: "Capabilities",
      trust: "Why Tarashino",
      faq: "FAQ",
      login: "Log in",
      register: "Sign up",
      switchTo: "فا",
      switchLabel: "نسخه‌ی فارسی",
    },
    hero: {
      eyebrow: "B2B manufacturing marketplace",
      title: [
        ["Industrial", "parts,"],
        ["made", "to", "order."],
      ],
      lead: "Upload your drawing, get quotes from verified manufacturers, and manage every order from contract to delivery in one place.",
      drag: "Drag to rotate",
    },
    sheet: { title: "Pipe flange", material: "Material: St37", qty: "Qty: 200 pcs", tolerance: "Tol. ±0.05", scale: "Scale: 1:2" },
    how: {
      eyebrow: "How it works",
      title: "From drawing to delivery in four steps",
      lead: "Every step is recorded on the order page, and both parties see the same record.",
      steps: [
        { title: "Request", text: "Submit your drawing or CAD file, material, quantity and deadline." },
        {
          title: "Quotes",
          text: "Manufacturers send their price and lead time, and you compare them side by side: price, timing and real track record. Only manufacturers who accept the NDA can see your drawing.",
        },
        {
          title: "Contract",
          text: "Choose the best offer, and the managers of both companies sign the contract. Every version is kept on record.",
        },
        {
          title: "Delivery",
          text: "Progress, payments and optional quality inspection are recorded on the order page until the part reaches you.",
        },
      ],
    },
    panels: {
      sample: "Sample",
      request: {
        title: "New request",
        part: "Part title",
        typed: "Pipe flange",
        material: "Material",
        qty: "Quantity",
        qtyValue: "200 pcs",
        deadline: "Deadline",
        deadlineValue: "20 days",
        nda: "Confidential under NDA",
        submit: "Submit request",
      },
      quotes: {
        title: "Quotes received",
        best: "Best balance",
        bars: ["Price", "Lead time", "Track record"],
        items: [
          { name: "Manufacturer A", meta: "42M Toman · 24 days", bars: [92, 55, 48] },
          { name: "Manufacturer B", meta: "48M Toman · 18 days", bars: [78, 84, 90], best: true },
          { name: "Manufacturer C", meta: "56M Toman · 12 days", bars: [52, 96, 70] },
        ],
      },
      contract: {
        title: "Flange manufacturing contract",
        version: "Version 2",
        buyer: "Buyer's manager",
        maker: "Manufacturer's manager",
        stamp: "Signed",
      },
      order: {
        title: "Order TR-1048",
        steps: [
          { label: "Contract signed", state: "done" },
          { label: "Production", note: "14 days", state: "done" },
          { label: "Quality inspection", note: "optional, passed", state: "done" },
          { label: "Shipping", note: "in transit", state: "now" },
          { label: "Delivered" },
        ],
        paid: "✓ Prepayment recorded and confirmed",
      },
    },
    config: {
      eyebrow: "Configure",
      title: "Configure your part",
      lead: "Pick a gear's diameter, tooth count, material and quantity. Weight and estimate use the platform's transparent formula.",
      diameter: "Outside diameter",
      teeth: "Teeth",
      material: "Material",
      quantity: "Order quantity",
      weight: "Weight per part",
      estimate: "Order estimate",
      kg: "kg",
      million: "M Toman",
      cta: "Request with these specs",
      note: "This is an approximate estimate; manufacturers set the final price in their quotes.",
      drag: "Drag to rotate",
    },
    network: {
      eyebrow: "Network",
      title: "From any city to the right manufacturer",
      lead: "A request is posted in one city, made in another and inspected in a third, all in one order file.",
      caption: "Requested in {a} → made in {b} → inspected in {c}",
      note: "Routes are examples.",
    },
    roles: {
      eyebrow: "Solutions",
      title: "One order, three coordinated roles",
      lead: "Buyers order, manufacturers produce and labs verify quality, all in one shared order file.",
      items: [
        {
          who: "Buyers",
          title: "Confident sourcing",
          points: [
            "Clear comparison of quotes: price, lead time and track record",
            "Verified manufacturers with a real track record",
            "A contract and full history for every order",
          ],
          cta: "Submit a request",
          href: "/register?role=buyer",
          primary: true,
        },
        {
          who: "Manufacturers",
          title: "Real orders in your specialty",
          points: [
            "Genuine requests, with drawings shared after an NDA",
            "A profile, a portfolio and the “Verified” badge",
            "An on-time delivery record that builds your trust score",
          ],
          cta: "Join as a manufacturer",
          href: "/register?role=supplier",
        },
        {
          who: "Quality-control labs",
          title: "Inspection built into the order",
          points: ["Inspect the orders that buyers assign to you", "Record results and reports on the same order"],
          cta: "Join as a lab",
          href: "/register?role=qc",
        },
      ],
    },
    services: {
      eyebrow: "Capabilities",
      title: "Find manufacturers in every field",
      labels: {
        cnc: "CNC machining",
        injection_molding: "Plastic injection molding",
        sheet_metal: "Sheet metal fabrication",
        casting: "Casting",
        welding: "Welding",
        tooling: "Mold making",
        plastic_manufacturing: "Plastic parts production",
        forging: "Forging",
        heat_treatment: "Heat treatment",
        surface_treatment: "Coating & plating",
      },
    },
    explode: {
      title: "One assembly, six manufacturing processes",
      lead: "A flange joint has six parts, and each one is made by a manufacturer in that field.",
      hint: "Scroll",
      pickHint: "Tap a part to see its details",
      cta: "See manufacturers in this field",
      close: "Close",
      parts: [
        { part: "pipe", capability: "welding", name: "Pipe and weld", spec: "A steel pipe butt-welded to the flange neck; the weld is visually inspected.", at: 0.3 },
        { part: "bolts", capability: "forging", name: "Bolts", spec: "Six M16 grade 8.8 steel bolts with forged hex heads and rolled threads.", at: 0.38, lift: true },
        { part: "flangeA", capability: "cnc", name: "Weld-neck flange", spec: "St37 steel, 240 mm diameter, six Ø18 holes at ±0.05 tolerance.", at: 0.46 },
        { part: "gasket", capability: "injection_molding", name: "Sealing gasket", spec: "A rubber ring gasket for working pressures up to 16 bar.", at: 0.54, lift: true },
        { part: "flangeB", capability: "casting", name: "Mating flange", spec: "Cast ductile iron with a machined sealing face.", at: 0.62 },
        { part: "nuts", capability: "heat_treatment", name: "Nuts", spec: "Hardened nuts; the blue and gold come from tempering the steel.", at: 0.7, lift: true },
      ],
    },
    trust: {
      eyebrow: "Why Tarashino",
      title: "Your drawings are your capital",
      cards: [
        {
          title: "Private drawings",
          text: "Only a manufacturer who has accepted the NDA for that request can view the drawing, and every download is logged.",
        },
        {
          title: "Verified manufacturers",
          text: "Every manufacturer's documents are reviewed before they receive the “Verified” badge.",
        },
        {
          title: "Signed contracts",
          text: "Contract versions and each order's history are recorded and always available to both parties.",
        },
        {
          title: "Two-step login",
          text: "Protect your account with a code from an authenticator app; it is required for admins.",
        },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Before you start",
      items: [
        {
          q: "Is payment made through Tarashino?",
          a: "No. Payment goes directly between you and the manufacturer, and Tarashino records and confirms each payment on the order page.",
        },
        {
          q: "Will my drawing stay confidential?",
          a: "Yes. Only a manufacturer who has accepted the NDA for that request can see the drawing, and every download is logged.",
        },
        {
          q: "How are manufacturers verified?",
          a: "Manufacturers submit their company documents and the Tarashino team reviews them. Once approved, a “Verified” badge appears next to their name.",
        },
        {
          q: "Does it work on mobile?",
          a: "Yes. It installs on Android and iPhone home screens like an app, with no app store needed.",
        },
      ],
    },
    closing: { title: "Start your next project today", cta: "Submit a part request" },
    footer: {
      about: "Connecting industrial buyers with verified manufacturers, with signed contracts and transparent tracking of every order.",
      services: "Capabilities",
      servicesTag: "خدمات تولید",
      platform: "Tarashino",
      platformTag: "تراشینو",
      sheet: "01 of 01",
      rev: "2026",
      copy: "© 2026 Tarashino. All rights reserved.",
      mark: "TARASHINO",
    },
  },
};

/** خدماتی که در پانویس می‌آیند */
export const FOOTER_SERVICES: CapabilityValue[] = ["cnc", "casting", "sheet_metal", "injection_molding", "tooling"];

/**
 * نماد لوگوی تراشینو برای سرصفحه و صفحه‌های پلتفرم: T با ساقه‌ی شیاردار مته و متوازی‌الاضلاع
 * کهربایی. شیارها با fill-rule=evenodd بریده شده‌اند تا به شناسه‌ی SVG نیازی نباشد و چند نماد در
 * یک صفحه با هم تداخل نکنند. رنگ T از currentColor می‌آید.
 */
export function TarashinoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 150" aria-hidden="true" focusable="false" className={className}>
      <polygon points="40,6 118,6 104,30 26,30" fill="currentColor" />
      <polygon points="126,6 158,6 144,30 112,30" fill="#f5a623" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M64 30H90V126L74 146L64 136Z M64 45.4L90 30.54V38.6L64 53.46Z M64 67.4L90 52.54V60.6L64 75.46Z M64 89.4L90 74.54V82.6L64 97.46Z M64 111.4L90 96.54V104.6L64 119.46Z"
      />
    </svg>
  );
}

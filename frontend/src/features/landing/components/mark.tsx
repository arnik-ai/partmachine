/**
 * تعریف‌های SVG صفحه‌ی اول: نماد لوگو (T با ساقه‌ی شیاردار مته و متوازی‌الاضلاع کهربایی)،
 * گرادیان‌های فلز و ماسک شیارها. یک بار در صفحه می‌آید و هر جا با <use> تکرار می‌شود.
 */
export function MarkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lp-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset=".55" stopColor="#e6e6ec" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="lp-faceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2540" stopOpacity=".55" />
          <stop offset="1" stopColor="#14121b" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id="lp-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8e8b9c" />
          <stop offset=".35" stopColor="#f1f0f6" />
          <stop offset=".6" stopColor="#b9b6c6" />
          <stop offset="1" stopColor="#6f6b80" />
        </linearGradient>
        <linearGradient id="lp-holder" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a3550" />
          <stop offset=".45" stopColor="#6d6688" />
          <stop offset="1" stopColor="#2a2639" />
        </linearGradient>
        <linearGradient id="lp-scanGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset=".5" stopColor="#c4b5fd" stopOpacity=".95" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lp-tipGlow">
          <stop offset="0" stopColor="#ffd27a" stopOpacity=".95" />
          <stop offset=".4" stopColor="#f5a623" stopOpacity=".55" />
          <stop offset="1" stopColor="#f5a623" stopOpacity="0" />
        </radialGradient>
        {/* شیارهای ساقه‌ی T لوگو؛ با حرکت شیارها مته می‌چرخد */}
        <mask id="lp-markFlutes" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="150">
          <rect width="160" height="150" fill="white" />
          <g style={{ animation: "lp-flute .6s linear infinite" }}>
            <path
              d="M56 54 L98 30 M56 76 L98 52 M56 98 L98 74 M56 120 L98 96 M56 142 L98 118 M56 164 L98 140"
              stroke="black"
              strokeWidth="7"
            />
          </g>
        </mask>
        <mask id="lp-drillFlutes" maskUnits="userSpaceOnUse" x="-30" y="-130" width="60" height="140">
          <rect x="-30" y="-130" width="60" height="140" fill="white" />
          <g>
            <path
              d="M-14 -96 L14 -112 M-14 -80 L14 -96 M-14 -64 L14 -80 M-14 -48 L14 -64 M-14 -32 L14 -48 M-14 -16 L14 -32 M-14 0 L14 -16 M-14 16 L14 0"
              stroke="black"
              strokeWidth="5"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 -16"
              to="0 0"
              dur=".28s"
              repeatCount="indefinite"
            />
          </g>
        </mask>
        <symbol id="lp-mark" viewBox="0 0 160 150">
          <polygon points="40,6 118,6 104,30 26,30" fill="currentColor" />
          <polygon points="126,6 158,6 144,30 112,30" fill="#f5a623" />
          <polygon points="64,30 90,30 90,126 74,146 64,136" fill="currentColor" mask="url(#lp-markFlutes)" />
        </symbol>
      </defs>
    </svg>
  );
}

export function Mark({ width, height, className }: { width: number; height: number; className?: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 160 150" aria-hidden="true" className={className}>
      <use href="#lp-mark" />
    </svg>
  );
}

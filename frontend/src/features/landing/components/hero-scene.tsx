import type { LandingCopy } from "../content";

/**
 * نقشه‌ی فنی سرصفحه: مته‌ی T لوگو سوراخ‌های فلنج را یکی‌یکی می‌زند و بعد اندازه‌ها روی نقشه
 * می‌نشینند (حرکت در landing-effects). جدول مشخصات، لوگوی تراشینو را در خانه‌ی شرکت دارد.
 */
export function HeroScene({ sheet }: { sheet: LandingCopy["sheet"] }) {
  return (
    <svg className="scene" id="scene" viewBox="0 0 460 420">
      <g className="frame">
        <rect x="4" y="8" width="452" height="404" rx="6" />
        <path d="M4 28 h12 M4 140 h12 M4 280 h12 M444 28 h12 M444 140 h12 M444 280 h12 M120 8 v10 M230 8 v10 M340 8 v10" />
        <g textAnchor="middle">
          <text x="62" y="20">1</text>
          <text x="175" y="20">2</text>
          <text x="285" y="20">3</text>
          <text x="398" y="20">4</text>
          <text x="10" y="88">A</text>
          <text x="10" y="214">B</text>
          <text x="10" y="350">C</text>
        </g>
      </g>
      <g id="part">
        <path className="face" d="M60 200 A170 66 0 1 0 400 200 A170 66 0 1 0 60 200" />
        <path className="stroke draw" pathLength="1" d="M60 200 A170 66 0 1 0 400 200 A170 66 0 1 0 60 200" />
        <path className="stroke draw" pathLength="1" d="M60 200 L60 244 M400 200 L400 244" />
        <path className="stroke draw" pathLength="1" d="M60 244 A170 66 0 0 0 400 244" />
        <path className="stroke draw late" pathLength="1" d="M150 180 A80 31 0 1 0 310 180 A80 31 0 1 0 150 180" />
        <path className="stroke draw late" pathLength="1" d="M150 180 L150 200 M310 180 L310 200" />
        <path className="stroke thin draw late" pathLength="1" d="M192 180 A38 15 0 1 0 268 180 A38 15 0 1 0 192 180" />
        <g id="holes">
          <ellipse className="hole" cx="368" cy="200" rx="13" ry="5" />
          <ellipse className="hole" cx="299" cy="246.8" rx="13" ry="5" />
          <ellipse className="hole" cx="161" cy="246.8" rx="13" ry="5" />
          <ellipse className="hole" cx="92" cy="200" rx="13" ry="5" />
          <ellipse className="hole" cx="161" cy="153.2" rx="13" ry="5" />
          <ellipse className="hole" cx="299" cy="153.2" rx="13" ry="5" />
        </g>
      </g>
      <g className="dims" id="dims">
        <path className="dim" d="M60 194 L60 104 M400 194 L400 104 M60 112 L400 112" />
        <path className="dim" d="M60 112 l9 -4 v8 z M400 112 l-9 -4 v8 z" fill="#8f8d9b" />
        <text x="230" y="104" textAnchor="middle" data-decode="Ø 240 mm">
          Ø --- mm
        </text>
        <path className="dim" d="M378 204 L414 252 L448 252" />
        <text x="448" y="245" textAnchor="end" data-decode="6× Ø 18">
          6× Ø --
        </text>
        <path className="dim" d="M196 184 L132 74 L74 74" />
        <text x="74" y="67" textAnchor="start" data-decode="±0.05">
          ±-.--
        </text>
      </g>
      <g className="titleblock">
        <rect x="262" y="330" width="186" height="74" rx="3" />
        <path d="M262 352 H448 M262 378 H448 M355 352 V404 M312 330 V352" />
        <use href="#lp-mark" x="277.5" y="332.1" width="19" height="17.8" style={{ color: "#ecebf2" }} />
        <g textAnchor="middle">
          <text className="tt" x="380" y="345.5">
            {sheet.title}
          </text>
          <text x="401.5" y="369">
            {sheet.material}
          </text>
          <text x="308.5" y="369">
            {sheet.qty}
          </text>
          <text x="401.5" y="395">
            {sheet.tolerance}
          </text>
          <text x="308.5" y="395">
            {sheet.scale}
          </text>
        </g>
      </g>
      <rect className="scan" id="scan" x="40" y="120" width="380" height="2" fill="url(#lp-scanGrad)" />
      <g id="sparks" />
      {/* مته؛ مبدأ مختصات نوک مته است */}
      <g id="drill" transform="translate(432 156) scale(.8)">
        <circle className="tipglow" r="14" fill="url(#lp-tipGlow)" />
        <rect x="-17" y="-124" width="34" height="32" rx="7" fill="url(#lp-holder)" stroke="rgba(196,181,253,.35)" />
        <rect x="-17" y="-98" width="34" height="5" fill="#f5a623" />
        <polygon points="-10,-93 10,-93 10,-12 0,0 -10,-12" fill="url(#lp-metal)" mask="url(#lp-drillFlutes)" />
      </g>
    </svg>
  );
}

import { headers } from "next/headers";
import Link from "next/link";
import { Fragment } from "react";
import { CAPABILITIES } from "@/lib/constants";
import { HeroScene } from "./components/hero-scene";
import { Mark, MarkDefs } from "./components/mark";
import { Stage } from "./components/stage";
import { FOOTER_SERVICES, LANDING, type Lang } from "./content";
import { LandingEffects } from "./landing-effects";
import { landingJsonLd } from "./metadata";

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2.4" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

/** تیتر بخش‌ها کلمه‌به‌کلمه آشکار می‌شوند (حرکت در landing-effects) */
function Words({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, i) => (
    <Fragment key={i}>
      <span className="w">{word}</span>
      {i < words.length - 1 ? " " : null}
    </Fragment>
  ));
}

// خروجی استاتیک نسخه‌ی نمایشی درخواستی ندارد و CSP هم ندارد
const isStaticExport = process.env.NEXT_OUTPUT === "export";

/** صفحه‌ی اول تراشینو؛ «/» فارسی و «/en» انگلیسی. ورود و ثبت‌نام به صفحه‌های خود پلتفرم می‌روند. */
export async function LandingPage({ lang }: { lang: Lang }) {
  // هر تگ script صفحه، حتی داده‌ی ساختاریافته که اجرا نمی‌شود، nonce همین درخواست را دارد (proxy.ts)
  const nonce = isStaticExport ? undefined : ((await headers()).get("x-nonce") ?? undefined);
  const c = LANDING[lang];
  const en = lang === "en";
  const arrow = en ? "→" : "←";
  const [line1, line2] = c.hero.title;

  return (
    <div className="lp" lang={en ? "en" : "fa"} dir={en ? "ltr" : "rtl"}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: landingJsonLd(lang) }}
      />
      <MarkDefs />
      <div className="grain" aria-hidden="true" />

      <header className="site-header" id="siteHeader">
        <div className="wrap">
          <a className="brand" href="#top" aria-label={c.brand.home}>
            <Mark width={38} height={36} className="mark-light" />
            <span className="brand-text">
              <span className="brand-name">{c.brand.name}</span>
              <span className="brand-sub">{c.brand.sub}</span>
            </span>
          </a>
          <nav className="nav" aria-label={c.nav.label}>
            <a href="#how">{c.nav.how}</a>
            <a href="#roles">{c.nav.roles}</a>
            <a href="#services">{c.nav.services}</a>
            <a href="#trust">{c.nav.trust}</a>
            <a href="#faq">{c.nav.faq}</a>
          </nav>
          <div className="header-actions">
            <Link className="lang" href={en ? "/" : "/en"} hrefLang={en ? "fa" : "en"} aria-label={c.nav.switchLabel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z" />
              </svg>
              <span lang={en ? "fa" : "en"}>{c.nav.switchTo}</span>
            </Link>
            <Link className="btn-text" href="/login">
              {c.nav.login}
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/register">
              {c.nav.register}
            </Link>
          </div>
        </div>
        <div className="progress" id="progress" />
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title" data-pointer>
          <div className="aurora" aria-hidden="true" />
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow eyebrow-chip">
                <Mark width={18} height={17} />
                <span>{c.hero.eyebrow}</span>
              </span>
              <h1 id="hero-title">
                <span className="l1">
                  {line1.map((word, i) => (
                    <Fragment key={word}>
                      <span className="word" style={{ animationDelay: `${i * 0.06}s` }}>
                        {word}
                      </span>
                      {i < line1.length - 1 ? " " : null}
                    </Fragment>
                  ))}
                </span>{" "}
                <span className="grad-text">
                  {line2.map((word, i) => (
                    <Fragment key={word}>
                      <span className="word" style={{ animationDelay: `${(line1.length + 1 + i) * 0.06}s` }}>
                        {word}
                      </span>
                      {i < line2.length - 1 ? " " : null}
                    </Fragment>
                  ))}
                </span>
              </h1>
              <p className="lead">{c.hero.lead}</p>
            </div>
            <div className="visual" aria-hidden="true">
              <HeroScene sheet={c.sheet} />
              {/* بوم قطعه‌ی سه‌بعدی؛ تا WebGL آماده نشود همان نقشه‌ی SVG دیده می‌شود */}
              <canvas className="three" id="heroCanvas" />
              <div className="dims3d">
                <span className="dim3d">Ø 240 mm</span>
                <span className="dim3d">6× Ø 18</span>
                <span className="dim3d">±0.05</span>
              </div>
              <span className="drag-hint">{c.hero.drag}</span>
            </div>
          </div>
          <div className="hero-fade" />
          <div className="horizon" />
          <canvas className="lattice" data-lattice />
        </section>

        <section className="block" id="how" aria-labelledby="how-title">
          <div className="wrap">
            <div className="section-head" data-reveal>
              <span className="eyebrow">{c.how.eyebrow}</span>
              <h2 id="how-title" className="split">
                <Words text={c.how.title} />
              </h2>
              <p>{c.how.lead}</p>
            </div>
            <div className="how-grid">
              <div className="steps-wrap">
                <span className="fillbar" id="fillbar" aria-hidden="true" />
                <ol className="steps" id="steps">
                  {c.how.steps.map((step, i) => (
                    <li key={step.title} className={i === 0 ? "step active" : "step"} data-step={i + 1}>
                      <div className="station">{String(i + 1).padStart(2, "0")}</div>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <Stage panels={c.panels} />
            </div>
          </div>
        </section>

        <section className="block" id="roles" aria-labelledby="roles-title" style={{ paddingBlock: "48px 24px" }}>
          <div className="panel-light">
            <div className="wrap deck">
              <div className="deck-head section-head" data-reveal>
                <span className="eyebrow eyebrow-ink">{c.roles.eyebrow}</span>
                <h2 id="roles-title" className="split">
                  <Words text={c.roles.title} />
                </h2>
                <p>{c.roles.lead}</p>
              </div>
              <div className="deck-cards">
                {c.roles.items.map((role) => (
                  <article key={role.who} className="role spot">
                    <span className="who">{role.who}</span>
                    <h3>{role.title}</h3>
                    <ul>
                      {role.points.map((point) => (
                        <li key={point}>
                          {CHECK}
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    <Link className={role.primary ? "btn btn-primary magnet" : "btn btn-ghost"} href={role.href}>
                      {role.cta}
                      {role.primary && (
                        <span className="arrow" aria-hidden="true">
                          {arrow}
                        </span>
                      )}
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="block explode" id="services" aria-labelledby="services-title">
          {/* نمای انفجاری: صحنه‌ی چسبان که با اسکرول اتصال فلنجی را باز می‌کند (فقط با WebGL) */}
          <div className="explode-pin" id="explodePin">
            <div className="explode-stage">
              <div className="wrap">
                <div className="section-head" data-reveal>
                  <span className="eyebrow">{c.services.eyebrow}</span>
                  <h2 id="services-title" className="split">
                    <Words text={c.explode.title} />
                  </h2>
                  <p>{c.explode.lead}</p>
                </div>
              </div>
              <div className="explode-view" id="explodeView" aria-hidden="true">
                <canvas className="three" id="explodeCanvas" />
                <div className="xlabels">
                  {c.explode.parts.map((p) => (
                    <Link
                      key={p.part}
                      className={p.lift ? "xlabel lift" : "xlabel"}
                      data-part={p.part}
                      data-at={p.at}
                      href={`/suppliers?capability=${p.capability}`}
                      tabIndex={-1}
                    >
                      <b>{c.services.labels[p.capability]}</b>
                      <small>{p.name}</small>
                    </Link>
                  ))}
                </div>
                <span className="scroll-hint">{c.explode.hint}</span>
                <span className="xbar">
                  <i id="explodeBar" />
                </span>
              </div>
            </div>
          </div>
          <div className="wrap">
            <p className="all-label">{c.services.title}</p>
            <ul className="services" id="services-list" data-reveal>
              {CAPABILITIES.map((cap) => (
                <li key={cap.value}>
                  <Link className="spot" href={`/suppliers?capability=${cap.value}`}>
                    <i />
                    <span>{c.services.labels[cap.value]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="block" id="trust" aria-labelledby="trust-title">
          <div className="wrap">
            <div className="section-head" data-reveal>
              <span className="eyebrow">{c.trust.eyebrow}</span>
              <h2 id="trust-title" className="split">
                <Words text={c.trust.title} />
              </h2>
            </div>
            <div className="bento">
              {c.trust.cards.map((card, i) => (
                <article key={card.title} className="glass-card spot" data-reveal data-live>
                  <TrustArt index={i} />
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="block" id="faq" aria-labelledby="faq-title" style={{ paddingBlock: "72px 24px" }}>
          <div className="panel-light faq-panel">
            <div className="wrap">
              <div className="section-head center" data-reveal>
                <span className="eyebrow eyebrow-ink">{c.faq.eyebrow}</span>
                <h2 id="faq-title" className="split">
                  <Words text={c.faq.title} />
                </h2>
              </div>
              <div className="faq" data-reveal>
                {c.faq.items.map((item) => (
                  <details key={item.q}>
                    <summary>
                      <span>{item.q}</span>
                      <span className="pm" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title" data-pointer>
          <div className="aurora" aria-hidden="true" />
          <div className="wrap" data-reveal>
            <div className="closing-mark" aria-hidden="true">
              <Mark width={96} height={90} />
            </div>
            <h2 id="closing-title">{c.closing.title}</h2>
            <Link className="btn btn-primary magnet" href="/rfqs/new">
              {c.closing.cta}{" "}
              <span className="arrow" aria-hidden="true">
                {arrow}
              </span>
            </Link>
          </div>
          <canvas className="lattice" data-lattice />
        </section>
      </main>

      <footer className="site-footer">
        <div className="ruler" id="ruler" aria-hidden="true">
          <span className="laser" />
        </div>
        <div className="wrap">
          <div className="tblock">
            <div className="tb-cell tb-brand">
              <a className="brand" href="#top" aria-label={c.brand.home}>
                <Mark width={58} height={54} className="mark-light" />
                <span>
                  <span className="brand-name">{c.brand.name}</span>
                  <span className="brand-tag">{c.brand.tag}</span>
                </span>
              </a>
              <p>{c.footer.about}</p>
            </div>
            <nav className="tb-cell" aria-label={c.footer.services}>
              <span className="tb-label">
                {c.footer.services} <i>{c.footer.servicesTag}</i>
              </span>
              {FOOTER_SERVICES.map((value) => (
                <Link key={value} href={`/suppliers?capability=${value}`}>
                  {c.services.labels[value]}
                </Link>
              ))}
            </nav>
            <nav className="tb-cell" aria-label={c.footer.platform}>
              <span className="tb-label">
                {c.footer.platform} <i>{c.footer.platformTag}</i>
              </span>
              <a href="#how">{c.nav.how}</a>
              <a href="#roles">{c.nav.roles}</a>
              <a href="#trust">{c.nav.trust}</a>
              <a href="#faq">{c.nav.faq}</a>
              <Link href="/login">{c.nav.login}</Link>
              <Link href="/register">{c.nav.register}</Link>
            </nav>
            <div className="tb-strip" aria-hidden="true">
              <span>
                <i>SHEET</i>
                {c.footer.sheet}
              </span>
              <span>
                <i>SCALE</i>
                <b className="latin">1:1</b>
              </span>
              <span>
                <i>REV</i>
                {c.footer.rev}
              </span>
              <span>
                <i>WEB</i>
                <b className="latin">tarashino.ir</b>
              </span>
            </div>
          </div>
          <p className="legal">{c.footer.copy}</p>
        </div>
        <p className="watermark" aria-hidden="true">
          {c.footer.mark}
        </p>
      </footer>
      <LandingEffects />
    </div>
  );
}

/** نگاره‌های کارت‌های «چرا تراشینو»: قفل، سپر، قرارداد و کد ورود */
function TrustArt({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <svg className="art" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <rect className="fill" x="12" y="24" width="32" height="24" rx="6" />
          <path className="ln" d="M12 30a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z" />
          <path className="ln shackle" d="M19 24v-6a9 9 0 0 1 18 0v6" />
          <path className="ln" d="M28 33v6" />
        </svg>
      );
    case 1:
      return (
        <svg className="art" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <circle className="ring" cx="28" cy="28" r="20" />
          <path className="fill" d="M28 7l16 6v12c0 10-7 17-16 21-9-4-16-11-16-21V13z" />
          <path className="ln" d="M28 7l16 6v12c0 10-7 17-16 21-9-4-16-11-16-21V13z" />
          <path className="ln check" pathLength="1" d="M21 27l5 5 9-10" />
        </svg>
      );
    case 2:
      return (
        <svg className="art" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <path className="fill" d="M16 8h17l9 9v31H16z" />
          <path className="ln" d="M16 8h17l9 9v31H16z" />
          <path className="ln" d="M33 8v9h9" />
          <path className="ln sig" pathLength="1" d="M21 38c3-6 5 3 8-2s4 2 7-1 3 1 5 0" />
        </svg>
      );
    default:
      return (
        <svg className="art" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <rect className="fill" x="18" y="6" width="20" height="44" rx="5" />
          <path className="ln" d="M23 6h10a5 5 0 0 1 5 5v34a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" />
          <text className="code" x="28" y="28" textAnchor="middle" data-otp>
            482 193
          </text>
          <path className="ln" d="M26 44h4" />
        </svg>
      );
  }
}

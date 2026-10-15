import type { LandingCopy } from "../content";
import { Mark } from "./mark";

const VERIFIED = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8b5cf6" aria-hidden="true">
    <path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.3z" />
    <path d="M8 12l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" />
  </svg>
);

/** صحنه‌ی چسبان «فرایند سفارش»: با هر قدم، همان بخش محصول (نمونه) نمایش داده می‌شود */
export function Stage({ panels }: { panels: LandingCopy["panels"] }) {
  const { request, quotes, contract, order } = panels;
  return (
    <div className="stage" id="stage" data-active="1" aria-hidden="true">
      <div className="stage-bar">
        <span className="stage-url">
          <Mark width={15} height={14} />
          tarashino.ir
        </span>
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="panel p1">
        <div className="ptitle">
          <span>{request.title}</span>
          <span className="tag">{panels.sample}</span>
        </div>
        <div className="field">
          <label>{request.part}</label>
          <div className="v caret" id="typeTarget" data-type-text={request.typed}>
            {request.typed}
          </div>
        </div>
        <div className="fields3">
          <div className="field">
            <label>{request.material}</label>
            <div className="v">St37</div>
          </div>
          <div className="field">
            <label>{request.qty}</label>
            <div className="v">{request.qtyValue}</div>
          </div>
          <div className="field">
            <label>{request.deadline}</label>
            <div className="v">{request.deadlineValue}</div>
          </div>
        </div>
        <div className="files">
          <span className="file">flange.dwg</span>
          <span className="file">flange.pdf</span>
          <span className="lockchip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" fill="none" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" />
            </svg>
            {request.nda}
          </span>
        </div>
        <div className="submit">{request.submit}</div>
      </div>
      <div className="panel p2">
        <div className="ptitle">
          <span>{quotes.title}</span>
          <span className="tag">{panels.sample}</span>
        </div>
        {quotes.items.map((quote) => (
          <div key={quote.name} className={quote.best ? "quote best" : "quote"}>
            {quote.best && <span className="badge-best">{quotes.best}</span>}
            <div className="qname">
              {quote.name}
              {quote.best && VERIFIED}
            </div>
            <div className="qmeta">{quote.meta}</div>
            <div className="bars">
              {quotes.bars.map((label, i) => (
                <span key={label} className="bar">
                  {label}
                  <b style={{ "--w": `${quote.bars[i]}%`, "--d": `${i * 0.1}s` } as React.CSSProperties} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="panel p3">
        <div className="doc">
          <h4>
            <span>{contract.title}</span>
            <span style={{ color: "#6b6680", fontWeight: 500 }}>{contract.version}</span>
          </h4>
          <div className="lines">
            {[92, 84, 96, 70, 88].map((width) => (
              <i key={width} style={{ width: `${width}%` }} />
            ))}
          </div>
          <div className="signs">
            <div className="sign">
              <svg viewBox="0 0 140 40" aria-hidden="true">
                <path pathLength="1" d="M6 30 C18 6 26 34 36 18 S52 8 58 26 S78 30 86 14 S104 24 116 20 L132 18" />
              </svg>
              {contract.buyer}
            </div>
            <div className="sign">
              <svg viewBox="0 0 140 40" aria-hidden="true">
                <path pathLength="1" d="M8 22 C20 30 24 8 40 16 S60 34 70 18 S92 6 100 24 S120 28 132 12" />
              </svg>
              {contract.maker}
            </div>
          </div>
          <span className="stamp">{contract.stamp}</span>
        </div>
      </div>
      <div className="panel p4">
        <div className="ptitle">
          <span>{order.title}</span>
          <span className="tag">{panels.sample}</span>
        </div>
        <ol className="track">
          {order.steps.map((step, i) => (
            <li key={step.label} className={step.state} style={{ "--d": `${0.1 + i * 0.25}s` } as React.CSSProperties}>
              {step.label}
              {step.note && <small> · {step.note}</small>}
            </li>
          ))}
        </ol>
        <span className="paychip">{order.paid}</span>
      </div>
    </div>
  );
}

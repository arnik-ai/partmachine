"use client";

import Link from "next/link";
import { AgreementBlock, LegalReviewNotice } from "./agreement-text";

export type RoleSection = { id: string; title: string; paragraphs: string[] };
export type RoleAgreement = { key: string; note: string };

/**
 * صفحه‌ی «قوانین و تعهدات» یک نقش (کارفرما یا قطعه‌ساز).
 *
 * ساختار صفحه آماده است و جای متن حقوقی مشخص؛ وقتی متن وکیل رسید، فقط `sections` عوض می‌شود
 * و بندهای نسخه‌دار پایین صفحه از سرور می‌آیند.
 */
export function RoleTerms({
  title,
  lead,
  sections,
  agreements,
}: {
  title: string;
  lead: string;
  sections: RoleSection[];
  agreements: RoleAgreement[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>

      <LegalReviewNotice>
        متن حقوقی نهایی این صفحه در بازبینی وکیل است و پس از آن جای شرح زیر را می‌گیرد. بندهای
        پایین صفحه همان‌هایی است که همین حالا در سامانه پذیرفته می‌شود و سابقه‌ی پذیرش هر نسخه ثبت
        می‌ماند.
      </LegalReviewNotice>

      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="flex flex-col gap-2">
            <h2 className="font-semibold">{section.title}</h2>
            {section.paragraphs.map((text, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-semibold">بندهای نسخه‌دار سامانه</h2>
        {agreements.map((item) => (
          <AgreementBlock key={item.key} agreementKey={item.key} note={item.note} />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        قوانین عمومی پلتفرم در{" "}
        <Link href="/terms" className="text-primary hover:underline">
          این صفحه
        </Link>{" "}
        آمده است.
      </p>
    </div>
  );
}

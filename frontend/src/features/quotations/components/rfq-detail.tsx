"use client";

import Link from "next/link";
import { ArrowRight, FileText, MapPin, CalendarDays } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { listMyRfqs } from "@/features/rfq/api";
import type { Rfq } from "@/features/rfq/types";
import { useEffect, useState } from "react";
import { quotationsForRfq } from "../mock";
import { QuotationCompare } from "./quotation-compare";

export function RfqDetail({ rfqId }: { rfqId: string }) {
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyRfqs().then((list) => {
      setRfq(list.find((r) => r.id === rfqId) ?? null);
      setLoading(false);
    });
  }, [rfqId]);

  const quotes = quotationsForRfq(rfqId);

  if (loading) {
    return <p className="py-12 text-center text-white/65">در حال بارگذاری...</p>;
  }

  if (!rfq) {
    return <p className="py-12 text-center text-white/65">درخواست پیدا نشد.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/rfqs"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        style={{ alignSelf: "flex-start" }}
      >
        <ArrowRight className="h-4 w-4" />
        بازگشت به درخواست‌ها
      </Link>

      {/* خلاصه‌ی RFQ */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-3 p-5">
          <h1 className="text-xl font-bold">{rfq.title}</h1>
          <p className="text-sm text-muted-foreground">{rfq.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{capabilityLabel(rfq.capability)}</Badge>
            <Badge variant="outline">{rfq.material}</Badge>
            <Badge variant="outline">{faNumber(rfq.quantity)} عدد</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              تحویل در {rfq.deliveryCity}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              مهلت: {faDate(rfq.deadline)}
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {faNumber(rfq.files.length)} فایل پیوست
            </span>
          </div>
        </CardContent>
      </Card>

      {/* مقایسه‌ی استعلام‌ها */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">
          مقایسه‌ی استعلام‌های دریافتی ({faNumber(quotes.length)})
        </h2>
        <QuotationCompare rfqId={rfqId} rfqTitle={rfq.title} quotes={quotes} />
      </div>
    </div>
  );
}

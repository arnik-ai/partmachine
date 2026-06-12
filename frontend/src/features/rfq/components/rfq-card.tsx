import { CalendarDays, FileText, MapPin, MessageSquareQuote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { capabilityLabel } from "@/lib/constants";
import { faDate, faNumber } from "@/lib/utils";
import { RFQ_STATUS_LABELS, type Rfq, type RfqStatus } from "../types";

const STATUS_VARIANT: Record<
  RfqStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  draft: "outline",
  published: "secondary",
  quoting: "warning",
  awarded: "success",
  closed: "outline",
  cancelled: "destructive",
};

export function RfqCard({ rfq }: { rfq: Rfq }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{rfq.title}</h3>
          <Badge variant={STATUS_VARIANT[rfq.status]}>
            {RFQ_STATUS_LABELS[rfq.status]}
          </Badge>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {rfq.description}
        </p>

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
            {faNumber(rfq.files.length)} فایل
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareQuote className="h-3.5 w-3.5" />
            {faNumber(rfq.quotationsCount)} استعلام دریافتی
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

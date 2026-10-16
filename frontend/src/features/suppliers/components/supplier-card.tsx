import Link from "next/link";
import { BadgeCheck, Clock, MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { capabilityLabel } from "@/lib/constants";
import { faNumber } from "@/lib/utils";
import type { Supplier } from "../types";
import { BuyerRating } from "./buyer-rating";
import { SupplierAvatar } from "./supplier-avatar";
import { TrustScoreBadge } from "./trust-score";

export function SupplierCard({ supplier }: { supplier: Supplier }) {
  return (
    <Link href={`/suppliers/${supplier.id}`} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <SupplierAvatar name={supplier.companyName} logoUrl={supplier.logo?.url} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-semibold">
                  {supplier.companyName}
                  {supplier.verified && (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-label="تأیید شده"
                    />
                  )}
                </h3>
                <TrustScoreBadge score={supplier.score} />
              </div>
              <BuyerRating average={supplier.ratingAverage} count={supplier.ratingCount} />
            </div>
          </div>

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {supplier.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {supplier.capabilities.slice(0, 3).map((cap) => (
              <Badge key={cap} variant="secondary">
                {capabilityLabel(cap)}
              </Badge>
            ))}
            {supplier.capabilities.length > 3 && (
              <Badge variant="outline">
                +{faNumber(supplier.capabilities.length - 3)}
              </Badge>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {supplier.city}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              تحویل {faNumber(supplier.leadTimeDays)} روزه
            </span>
            <span className="inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {faNumber(supplier.completedJobs)} پروژه
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { cn, faDate, faNumber } from "@/lib/utils";
import { rateOrder, useOrderAction } from "../api";
import type { OrderDetail } from "../types";

const SCORE_LABELS = ["", "ضعیف", "متوسط", "خوب", "خیلی خوب", "عالی"];

/**
 * امتیاز ۱ تا ۵ کارفرما پس از تکمیل سفارش (O12). کارفرما ثبت یا تغییر می‌دهد و قطعه‌ساز فقط
 * می‌بیند. پروفایل عمومی قطعه‌ساز فقط میانگین و تعداد امتیازها را نشان می‌دهد، نه توضیح را.
 */
export function RatingCard({ order }: { order: OrderDetail }) {
  const action = useOrderAction(order.id);
  const current = order.rating;
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(current?.score ?? 0);
  const [comment, setComment] = useState(current?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!order.canRate && !current) return null;
  const showForm = order.canRate && (!current || editing);

  async function save() {
    setError(null);
    setSaved(false);
    if (score < 1) {
      setError("یکی از ستاره‌ها را انتخاب کنید.");
      return;
    }
    try {
      await action.mutateAsync(() => rateOrder(order.id, { score, comment }));
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" aria-hidden />
          {order.mySide === "buyer" ? "امتیاز شما به قطعه‌ساز" : "امتیاز کارفرما"}
        </CardTitle>
        {order.canRate && (
          <CardDescription>
            امتیاز در سابقه‌ی عمومی قطعه‌ساز (میانگین امتیازها) حساب می‌شود. توضیح شما فقط در
            همین سفارش برای قطعه‌ساز دیده می‌شود.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {showForm ? (
          <>
            <div className="flex flex-col gap-2">
              <span id="rating-label" className="font-medium">
                از ۱ تا ۵ چقدر راضی بودید؟
              </span>
              <div
                role="radiogroup"
                aria-labelledby="rating-label"
                className="flex flex-wrap gap-2"
                dir="ltr"
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={score === value}
                    aria-label={`${faNumber(value)} از ۵ — ${SCORE_LABELS[value]}`}
                    onClick={() => setScore(value)}
                    className={cn(
                      "rounded-lg border p-2 transition-colors hover:border-amber-400",
                      score >= value && "border-amber-400 bg-amber-50",
                    )}
                  >
                    <Star
                      className={cn(
                        "h-6 w-6",
                        score >= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                  </button>
                ))}
              </div>
              {score > 0 && <span className="text-muted-foreground">{SCORE_LABELS[score]}</span>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rating-comment">توضیح برای قطعه‌ساز (اختیاری)</Label>
              <Textarea
                id="rating-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                className="min-h-16"
              />
            </div>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={save} disabled={action.isPending}>
                {action.isPending ? "در حال ثبت..." : "ثبت امتیاز"}
              </Button>
              {editing && (
                <Button variant="outline" onClick={() => setEditing(false)}>
                  انصراف
                </Button>
              )}
            </div>
          </>
        ) : current ? (
          <>
            <StarRating value={current.score} />
            {current.comment && <p>{current.comment}</p>}
            <span className="text-xs text-muted-foreground">
              {current.ratedByName ? `${current.ratedByName} — ` : ""}
              {faDate(current.updatedAt)}
            </span>
            {saved && <p className="text-success">امتیاز شما ثبت شد. سپاس از بازخوردتان.</p>}
            {order.canRate && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  setScore(current.score);
                  setComment(current.comment);
                  setSaved(false);
                  setEditing(true);
                }}
              >
                تغییر امتیاز
              </Button>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

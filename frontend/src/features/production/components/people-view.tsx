"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SITE_URL } from "@/lib/config";
import { cn, faNumber } from "@/lib/utils";
import { addWorker, useOrderEntries, useWorkers } from "../api";
import { tasksOf } from "../rules";
import { SUB, WARN_TEXT } from "./parts";
import { WorkerSheet, WorkerTasksSheet } from "./sheets";

const CARD_HEIGHT = "min-h-[124px]";

/** کارکنان شرکت و اینکه هر نفر الان چند کار دارد */
export function PeopleView() {
  const workers = useWorkers();
  const entries = useOrderEntries();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () => workers.map((worker) => ({ worker, tasks: tasksOf(worker.id, entries) })),
    [workers, entries],
  );
  const open = rows.find((row) => row.worker.id === openId);

  return (
    <>
      <h1 className="text-xl font-bold">کارکنان</h1>
      <p className={SUB}>
        هر نفر با شماره موبایل و کد پیامکی وارد می‌شود و فقط کارهای خودش را می‌بیند؛ مبلغ سفارش‌ها را نمی‌بیند.
      </p>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="grid min-w-0">
          <span className="text-sm font-semibold">پنل کارگرها جداست</span>
          <span className={SUB}>
            این آدرس را برایشان بفرستید: <span dir="ltr">{new URL(SITE_URL).host}/worker</span>
          </span>
        </div>
        <Link href="/worker" target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
          باز کردن پنل کارگر
        </Link>
      </Card>
      <ul className="grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3">
        {rows.map(({ worker, tasks }) => {
          const late = tasks.now.filter((task) => task.row.lateBy > 0).length;
          return (
            <li key={worker.id} className="grid min-w-0">
              <button
                type="button"
                onClick={() => setOpenId(worker.id)}
                className={cn(
                  "grid w-full content-start justify-items-center gap-1 rounded-2xl border bg-card px-2.5 pb-3 pt-3.5 text-center shadow-soft hover:border-ring",
                  CARD_HEIGHT,
                )}
              >
                <span
                  aria-hidden
                  className="grid h-[46px] w-[46px] place-items-center rounded-full bg-secondary text-[17px] font-bold text-primary-deep"
                >
                  {worker.name.charAt(0)}
                </span>
                <span className="font-semibold leading-snug">{worker.name}</span>
                <span className={SUB}>
                  {tasks.now.length ? (
                    <>
                      {faNumber(tasks.now.length)} کار
                      {late > 0 && (
                        <span className={cn("font-semibold", WARN_TEXT)}>، {faNumber(late)} دیر</span>
                      )}
                    </>
                  ) : (
                    "بدون کار فعال"
                  )}
                </span>
              </button>
            </li>
          );
        })}
        <li className="grid min-w-0">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "grid w-full content-center justify-items-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-ring text-[14.5px] font-medium text-primary-deep hover:bg-secondary",
              CARD_HEIGHT,
            )}
          >
            <Plus className="h-6 w-6" aria-hidden />
            افزودن کارگر
          </button>
        </li>
      </ul>

      {adding && (
        <WorkerSheet
          onSave={(name, mobile) => {
            addWorker(name, mobile);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {open && (
        <WorkerTasksSheet
          worker={open.worker}
          now={open.tasks.now}
          later={open.tasks.later}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn, faNumber } from "@/lib/utils";
import {
  createJobType,
  deleteJobType,
  renameJobType,
  setJobTypeSteps,
  useCalendar,
  useJobTypes,
} from "../api";
import { workText, workingDaysText } from "../format";
import { totalWorkDays } from "../rules";
import { Chip, LINK_BUTTON, SUB } from "./parts";
import { ProcessEditor } from "./process-cards";
import { CalendarSheet, JobTypeNameSheet } from "./sheets";

type OpenSheet = "new" | "rename" | "calendar" | null;

/** هر شرکت کارت‌های فرایند را خودش می‌چیند؛ بدون دکمه‌ی ذخیره، تغییر همان لحظه اعمال می‌شود */
export function ProcessesView() {
  const jobTypes = useJobTypes();
  const calendar = useCalendar();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const close = () => setSheet(null);
  const selected = jobTypes.find((type) => type.id === typeId) ?? jobTypes[0];

  return (
    <>
      <h1 className="text-xl font-bold">نوع فرایند</h1>
      <div role="group" aria-label="نوع کار" className="flex flex-wrap gap-2">
        {jobTypes.map((type) => (
          <Chip key={type.id} pressed={type.id === selected.id} onClick={() => setTypeId(type.id)}>
            {type.name}
          </Chip>
        ))}
        <Chip dashed onClick={() => setSheet("new")}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          نوع کار جدید
        </Chip>
      </div>
      <div className="grid min-w-0 gap-2.5">
        <p className={SUB}>کارت‌ها را بکشید و به ترتیب انجام کار بچینید. برای تعیین مسئول و زمان، روی کارت بزنید.</p>
        <ProcessEditor
          key={selected.id}
          steps={selected.steps}
          onChange={(steps) => setJobTypeSteps(selected.id, steps)}
        />
        <p className={SUB}>
          {faNumber(selected.steps.length)} فرایند،{" "}
          {workText(totalWorkDays(selected.steps, calendar), calendar.hoursPerDay)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" className={LINK_BUTTON} onClick={() => setSheet("rename")}>
          تغییر نام این نوع کار
        </button>
        {jobTypes.length > 1 && (
          <button
            type="button"
            className={cn(LINK_BUTTON, "text-destructive")}
            onClick={() => deleteJobType(selected.id)}
          >
            حذف آن
          </button>
        )}
      </div>
      <div className={cn(SUB, "flex flex-wrap items-center gap-x-3 gap-y-1")}>
        <span>
          روزهای کاری: {workingDaysText(calendar)}، روزی {faNumber(calendar.hoursPerDay)} ساعت
        </span>
        <button type="button" className={LINK_BUTTON} onClick={() => setSheet("calendar")}>
          تغییر
        </button>
      </div>

      {sheet === "new" && (
        <JobTypeNameSheet
          onSave={(name) => {
            setTypeId(createJobType(name));
            close();
          }}
          onClose={close}
        />
      )}
      {sheet === "rename" && (
        <JobTypeNameSheet
          initialName={selected.name}
          onSave={(name) => {
            renameJobType(selected.id, name);
            close();
          }}
          onClose={close}
        />
      )}
      {sheet === "calendar" && <CalendarSheet onClose={close} />}
    </>
  );
}

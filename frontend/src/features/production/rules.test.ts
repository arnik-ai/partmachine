import { describe, expect, it } from "vitest";
import { buildDemoData } from "./demo-data";
import { createStep } from "./gadgets";
import {
  addDays,
  addWork,
  clampAmount,
  forecastFromToday,
  groupBoard,
  isValidMobile,
  moveItem,
  planOrder,
  previewIndex,
  reworkTo,
  tasksOf,
  tickStep,
  toDayNumber,
  toggleOffDay,
  undoTick,
} from "./rules";
import type { OrderEntry, ProductionOrder, Step, WorkCalendar } from "./types";

/** جمعه تعطیل، روزی ۸ ساعت */
const CAL: WorkCalendar = { offWeekdays: [5], hoursPerDay: 8 };
const THURSDAY = "2026-11-05";
const FRIDAY = "2026-11-06";
const SATURDAY = "2026-11-07";

function step(amount: number, change: Partial<Step> = {}): Step {
  return { ...createStep("cutting", "ali"), amount, ...change };
}

function order(steps: Step[] | null, change: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    id: "o",
    title: "قطعه",
    customer: "مشتری",
    quantity: 1,
    startOn: THURSDAY,
    deliverOn: addDays(THURSDAY, 30),
    steps,
    ...change,
  };
}

describe("حساب زمان کاری", () => {
  it("روز تعطیل شمرده نمی‌شود", () => {
    // یک روز کاری از پنجشنبه تا پایان پنجشنبه، دو روز کاری از جمعه می‌پرد و شنبه تمام می‌شود
    const start = toDayNumber(THURSDAY);
    expect(addWork(start, 1, CAL)).toBe(start + 1);
    expect(addWork(start, 2, CAL)).toBe(toDayNumber(SATURDAY) + 1);
  });

  it("کاری که جمعه شروع شود از شنبه حساب می‌شود", () => {
    expect(addWork(toDayNumber(FRIDAY), 1, CAL)).toBe(toDayNumber(SATURDAY) + 1);
  });

  it("تقویم بدون روز کاری مرورگر را قفل نمی‌کند", () => {
    const allOff = { ...CAL, offWeekdays: [0, 1, 2, 3, 4, 5, 6] };
    expect(addWork(10, 2, allOff)).toBe(12);
  });

  it("زمان ساعتی با ساعت کار همان شرکت حساب می‌شود", () => {
    const plan = planOrder(order([step(4, { unit: "hour" })]), THURSDAY, CAL);
    expect(plan.rows[0].dueOn).toBe(THURSDAY);
    const longDay = planOrder(order([step(9, { unit: "hour" })]), THURSDAY, CAL);
    expect(longDay.rows[0].dueOn).toBe(SATURDAY);
  });

  it("هیچ کاری در روز تعطیل تمام نمی‌شود و طولش درست است", () => {
    for (let offset = 0; offset < 14; offset++) {
      const start = addDays(THURSDAY, offset);
      for (let days = 1; days <= 12; days++) {
        const { finishOn } = forecastFromToday([step(days)], start, start, CAL);
        expect(new Date(`${finishOn}T00:00:00Z`).getUTCDay()).not.toBe(5);
      }
    }
  });
});

describe("وضعیت سفارش", () => {
  it("سفارش بدون برنامه منتظر است", () => {
    expect(planOrder(order(null, { startOn: null }), THURSDAY, CAL).status).toBe("waiting");
    expect(planOrder(order([]), THURSDAY, CAL).status).toBe("waiting");
  });

  it("به‌موقع، وقتی برنامه تا موعد تحویل جا می‌شود", () => {
    const plan = planOrder(order([step(1), step(1)]), THURSDAY, CAL);
    expect(plan.status).toBe("ok");
    expect(plan.current?.index).toBe(0);
    expect(plan.rows.map((row) => row.state)).toEqual(["current", "next"]);
  });

  it("دیر، وقتی مهلت فرایند جاری گذشته است", () => {
    const plan = planOrder(order([step(1)]), addDays(SATURDAY, 2), CAL);
    expect(plan.status).toBe("late");
    // مهلت پنجشنبه بود؛ جمعه شمرده نمی‌شود: شنبه، یکشنبه، دوشنبه
    expect(plan.current?.lateBy).toBe(3);
  });

  it("در خطر، وقتی فرایند جاری به‌موقع است ولی کل برنامه از موعد می‌گذرد", () => {
    const plan = planOrder(order([step(1), step(5)], { deliverOn: SATURDAY }), THURSDAY, CAL);
    expect(plan.status).toBe("risk");
    expect(plan.slip).toBeGreaterThan(0);
  });

  it("دیرکرد فرایندهای بعدی را هم عقب می‌اندازد", () => {
    const today = addDays(THURSDAY, 10);
    const plan = planOrder(order([step(1), step(2)], { deliverOn: addDays(THURSDAY, 9) }), today, CAL);
    expect(plan.status).toBe("late");
    expect(plan.slip).toBeGreaterThan(0);
  });

  it("تمام، وقتی همه‌ی فرایندها انجام شده‌اند", () => {
    const plan = planOrder(order([step(1, { doneOn: THURSDAY })]), SATURDAY, CAL);
    expect(plan.status).toBe("done");
    expect(plan.rows[0].lateBy).toBe(0);
  });

  it("فرایندی که دیر انجام شده دیرکردش ثبت می‌ماند", () => {
    const plan = planOrder(order([step(1, { doneOn: addDays(SATURDAY, 1) })]), addDays(SATURDAY, 1), CAL);
    expect(plan.rows[0].lateBy).toBe(2);
  });

  it("فرایند برگشت‌خورده از روز برگشت دوباره شمرده می‌شود", () => {
    const today = addDays(THURSDAY, 20);
    const first = step(1, { doneOn: THURSDAY });
    const reworked = reworkTo([first, step(1)], first.id, today, "خارج از تلرانس");
    const plan = planOrder(order(reworked), today, CAL);
    expect(plan.current?.index).toBe(0);
    expect(plan.current?.lateBy).toBe(0);
    expect(plan.current?.step.reworkNote).toBe("خارج از تلرانس");
  });
});

describe("گذر از فرایندها", () => {
  it("فقط فرایند جاری تیک می‌خورد و تیک تکراری اثری ندارد", () => {
    const steps = [step(1), step(1)];
    expect(tickStep(steps, steps[1].id, THURSDAY)).toBe(steps);
    const ticked = tickStep(steps, steps[0].id, THURSDAY);
    expect(ticked[0].doneOn).toBe(THURSDAY);
    expect(tickStep(ticked, steps[0].id, THURSDAY)).toBe(ticked);
  });

  it("برگرداندن تیک، فرایند را دوباره جاری می‌کند", () => {
    const steps = [step(1)];
    const ticked = tickStep(steps, steps[0].id, THURSDAY);
    expect(undoTick(ticked, steps[0].id)[0].doneOn).toBeNull();
  });

  it("برگشت، فرایند مقصد و هرچه بعد از آن است را باز می‌کند و قبلی‌ها را نگه می‌دارد", () => {
    const steps = [
      step(1, { doneOn: THURSDAY }),
      step(1, { doneOn: THURSDAY }),
      step(1, { issue: "دستگاه خراب است" }),
    ];
    const next = reworkTo(steps, steps[1].id, SATURDAY, "دلیل");
    expect(next[0].doneOn).toBe(THURSDAY);
    expect(next[1]).toMatchObject({ doneOn: null, restartOn: SATURDAY, reworkNote: "دلیل" });
    expect(next[2]).toMatchObject({ doneOn: null, restartOn: null, issue: null });
  });

  it("پیش‌نمایش کشیدن کارت با ترتیب نهایی یکی است", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const moved = moveItem(list, from, to);
        list.forEach((item, index) => {
          expect(moved[previewIndex(index, from, to)]).toBe(item);
        });
      }
    }
  });
});

describe("تقویم و ورودی‌ها", () => {
  it("دست‌کم یک روز کاری می‌ماند", () => {
    const six = { ...CAL, offWeekdays: [0, 1, 2, 3, 4, 5] };
    expect(toggleOffDay(six, 6)).toBe(six);
    expect(toggleOffDay(six, 5).offWeekdays).not.toContain(5);
  });

  it("زمان فرایند در بازه‌ی مجاز می‌ماند", () => {
    expect(clampAmount(0, "day")).toBe(1);
    expect(clampAmount(100, "day")).toBe(60);
    expect(clampAmount(100, "hour")).toBe(100);
    expect(clampAmount(900, "hour")).toBe(200);
  });

  it("شماره موبایل", () => {
    expect(isValidMobile("09123456789")).toBe(true);
    expect(isValidMobile("9123456789")).toBe(false);
    expect(isValidMobile("0912345678")).toBe(false);
  });

  it("پیش‌بینی پایان کار و گذشتن از موعد", () => {
    const { finishOn, overBy } = forecastFromToday([step(2)], THURSDAY, THURSDAY, CAL);
    expect(finishOn).toBe(SATURDAY);
    expect(overBy).toBe(1);
  });
});

describe("نمایش‌ها", () => {
  const entry = (item: ProductionOrder, today = THURSDAY): OrderEntry => ({
    order: item,
    plan: planOrder(item, today, CAL),
  });

  it("تابلو سفارش‌ها را درست گروه‌بندی می‌کند", () => {
    const fine = entry(order([step(1)], { id: "fine" }));
    const issue = entry(order([step(1, { issue: "مشکل" })], { id: "issue" }));
    const finished = entry(order([step(1, { doneOn: THURSDAY })], { id: "finished" }));
    const waiting = entry(order(null, { id: "waiting", startOn: null }));
    const groups = groupBoard([fine, issue, finished, waiting]);
    expect(groups.attention.map((item) => item.order.id)).toEqual(["waiting", "issue"]);
    expect(groups.onTrack.map((item) => item.order.id)).toEqual(["fine"]);
    expect(groups.finished.map((item) => item.order.id)).toEqual(["finished"]);
  });

  it("هر کارگر فقط کارهای خودش را می‌بیند", () => {
    const entries = [
      entry(
        order([
          step(1, { assigneeId: "ali", doneOn: THURSDAY }),
          step(1, { assigneeId: "sara" }),
          step(1, { assigneeId: "ali" }),
        ]),
      ),
    ];
    const ali = tasksOf("ali", entries);
    expect(ali.now).toHaveLength(0);
    expect(ali.later).toHaveLength(1);
    expect(ali.done).toHaveLength(1);
    const sara = tasksOf("sara", entries);
    expect(sara.now).toHaveLength(1);
    expect(sara.later).toHaveLength(0);
    expect(tasksOf("nobody", entries)).toEqual({ now: [], later: [], done: [] });
  });

  it("داده‌ی نمونه در هر روز هفته همان وضعیت‌ها را نشان می‌دهد", () => {
    for (let offset = 0; offset < 14; offset++) {
      const today = addDays(THURSDAY, offset);
      const demo = buildDemoData(today);
      const statuses = Object.fromEntries(
        demo.orders.map((item) => [item.id, planOrder(item, today, demo.calendar).status]),
      );
      expect(statuses, today).toEqual({
        flange: "late",
        gearbox: "risk",
        shaft: "ok",
        bracket: "ok",
        bushing: "done",
        gear: "waiting",
      });
    }
  });
});

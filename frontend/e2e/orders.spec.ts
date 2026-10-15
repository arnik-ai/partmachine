import { expect, test } from "@playwright/test";
import { PASSWORD, createRfq, inDays, pickJalaliDate, quote, register, stamp } from "./helpers";

/** سفارش (گام 3a): ساخت خودکار پس از انتخاب برنده، دید مشترک دو طرف، لغو با دلیل پیش از قرارداد. */

test("the winning order is shared by both sides and can be cancelled before the contract", async ({
  browser,
}) => {
  const title = `سفارش آزمون ${stamp}`;
  const company = `کارگاه سفارش ${stamp}`;
  const buyer = await register(browser, "buyer", "کارفرمای سفارش");
  const rfqUrl = await createRfq(buyer, title);

  const supplier = await register(browser, "supplier", "قطعه‌ساز سفارش", company);
  await supplier.goto(rfqUrl);
  await quote(supplier, "95000000", "15");

  await buyer.goto(rfqUrl);
  await buyer.getByRole("button", { name: `انتخاب ${company} به‌عنوان برنده` }).click();
  await buyer
    .getByRole("dialog", { name: "انتخاب برنده" })
    .getByRole("button", { name: "بله، برنده را انتخاب کن" })
    .click();
  await buyer.getByRole("link", { name: "مشاهده‌ی سفارش" }).click();
  await buyer.waitForURL("**/orders/**");
  const orderUrl = buyer.url();
  await expect(buyer.getByRole("heading", { name: title })).toBeVisible();
  await expect(buyer.getByText("قدم بعدی تنظیم و امضای قرارداد")).toBeVisible();

  // قطعه‌ساز برنده سفارش را در فهرست خودش می‌بیند و آن را با دلیل لغو می‌کند
  await supplier.goto("/orders");
  await supplier.getByRole("link", { name: new RegExp(title) }).click();
  await supplier.waitForURL("**/orders/**");
  await supplier.getByRole("button", { name: "لغو سفارش" }).click();
  const dialog = supplier.getByRole("dialog", { name: "لغو سفارش" });
  await dialog.getByLabel("دلیل لغو").fill("ظرفیت تولید این ماه پر شد");
  await dialog.getByRole("button", { name: "بله، سفارش لغو شود" }).click();
  await expect(supplier.getByText("این سفارش لغو شده است. دلیل: ظرفیت تولید این ماه پر شد")).toBeVisible();

  // کارفرما همان را می‌بیند؛ سازمان سوم سفارش را اصلاً نمی‌بیند
  await buyer.reload();
  await expect(buyer.getByText("این سفارش لغو شده است. دلیل: ظرفیت تولید این ماه پر شد")).toBeVisible();
  await expect(buyer.getByText("قطعه‌ساز — قطعه‌ساز سفارش")).toBeVisible();

  const outsider = await register(browser, "buyer", "کاربر بیگانه");
  await outsider.goto(orderUrl);
  await expect(outsider.getByText("سفارش موردنظر پیدا نشد")).toBeVisible();
});

test("both owners sign the contract, the order is shipped, delivered and paid", async ({
  browser,
}) => {
  const title = `قرارداد آزمون ${stamp}`;
  const company = `کارگاه قرارداد ${stamp}`;
  const buyer = await register(browser, "buyer", "کارفرمای قرارداد");
  const rfqUrl = await createRfq(buyer, title);
  const supplier = await register(browser, "supplier", "قطعه‌ساز قرارداد", company);
  await supplier.goto(rfqUrl);
  await quote(supplier, "120000000", "12");

  await buyer.goto(rfqUrl);
  await buyer.getByRole("button", { name: `انتخاب ${company} به‌عنوان برنده` }).click();
  await buyer
    .getByRole("dialog", { name: "انتخاب برنده" })
    .getByRole("button", { name: "بله، برنده را انتخاب کن" })
    .click();
  await buyer.getByRole("link", { name: "مشاهده‌ی سفارش" }).click();
  await buyer.waitForURL("**/orders/**");
  const orderUrl = buyer.url();

  // کارفرما تاریخ تحویل را تغییر می‌دهد (نسخه‌ی ۲) و امضا می‌کند
  await buyer.getByRole("link", { name: "مشاهده و امضای قرارداد" }).click();
  await buyer.waitForURL("**/contract");
  await expect(buyer.getByText("پیش‌نویس است")).toBeVisible();
  await pickJalaliDate(buyer, "تاریخ تحویل", inDays(25));
  await buyer.getByLabel("توضیح تغییر (اختیاری؛ در تاریخچه ثبت می‌شود)").fill("هماهنگی با خط تولید");
  await buyer.getByRole("button", { name: "ذخیره‌ی شرایط" }).click();
  await expect(buyer.getByText("نسخه‌ی تازه‌ی قرارداد ذخیره شد.")).toBeVisible();
  await expect(buyer.getByText("نسخه‌ی ۲").first()).toBeVisible();

  await buyer.getByRole("button", { name: "امضای قرارداد" }).click();
  const signDialog = buyer.getByRole("dialog", { name: "امضای قرارداد" });
  await signDialog.getByLabel("متن این نسخه را خوانده‌ام و از طرف سازمانم می‌پذیرم.").check();
  await signDialog.getByLabel("رمز عبور حساب شما").fill(PASSWORD);
  await signDialog.getByRole("button", { name: "امضا می‌کنم" }).click();
  await expect(buyer.getByText("امضای شما ثبت شد؛ منتظر امضای طرف مقابل هستیم.")).toBeVisible();

  // قطعه‌ساز امضا می‌کند ⇒ قرارداد نافذ و سفارش در تولید
  await supplier.goto(`${orderUrl}/contract`);
  await supplier.getByRole("button", { name: "امضای قرارداد" }).click();
  const supplierDialog = supplier.getByRole("dialog", { name: "امضای قرارداد" });
  await supplierDialog.getByLabel("متن این نسخه را خوانده‌ام و از طرف سازمانم می‌پذیرم.").check();
  await supplierDialog.getByLabel("رمز عبور حساب شما").fill(PASSWORD);
  await supplierDialog.getByRole("button", { name: "امضا می‌کنم" }).click();
  await expect(supplier.getByText("امضاشده و نافذ")).toBeVisible();

  await supplier.goto(orderUrl);
  await expect(supplier.getByText("در حال تولید").first()).toBeVisible();
  await supplier.getByRole("button", { name: "ثبت ارسال" }).click();
  const shipDialog = supplier.getByRole("dialog", { name: "ثبت ارسال" });
  await shipDialog.getByLabel("اطلاعات ارسال (اختیاری)").fill("باربری نمونه، بارنامه ۵۵۵");
  await shipDialog.getByRole("button", { name: "ثبت ارسال" }).click();
  await expect(supplier.getByText("ارسال‌شده").first()).toBeVisible();

  await buyer.goto(orderUrl);
  await buyer.getByRole("button", { name: "تأیید تحویل" }).click();
  await buyer
    .getByRole("dialog", { name: "تأیید تحویل" })
    .getByRole("button", { name: "بله، کالا را تحویل گرفتم" })
    .click();
  await expect(buyer.getByText("تحویل‌شده").first()).toBeVisible();
  await expect(buyer.getByText("باربری نمونه، بارنامه ۵۵۵")).toBeVisible();

  // پرداخت بیرون از پلتفرم انجام می‌شود؛ کارفرما اعلام و قطعه‌ساز تأیید می‌کند ⇒ سفارش تکمیل
  await expect(buyer.getByText("پول از پارت‌ماشین عبور نمی‌کند")).toBeVisible();
  await buyer.getByRole("button", { name: "اعلام پرداخت کامل پس از تحویل" }).click();
  const payDialog = buyer.getByRole("dialog", { name: "اعلام پرداخت" });
  await payDialog.getByLabel("شماره‌ی پیگیری یا حواله").fill("778899");
  await payDialog.getByRole("button", { name: "ثبت اعلام پرداخت" }).click();
  await expect(buyer.getByText("اعلام‌شده — منتظر تأیید قطعه‌ساز")).toBeVisible();

  await supplier.goto(orderUrl);
  await supplier.getByRole("button", { name: "تأیید دریافت پرداخت کامل پس از تحویل" }).click();
  await supplier
    .getByRole("dialog", { name: "تأیید دریافت پرداخت" })
    .getByRole("button", { name: "بله، مبلغ را دریافت کردم" })
    .click();
  await expect(supplier.getByText("تکمیل‌شده").first()).toBeVisible();
  await expect(supplier.getByText("این سفارش با موفقیت تکمیل شده است.")).toBeVisible();

  // کارفرما امتیاز می‌دهد؛ سابقه‌ی عمومی قطعه‌ساز از همین سفارش واقعی ساخته می‌شود (O12)
  await buyer.goto(orderUrl);
  await buyer.getByRole("radio", { name: "۵ از ۵ — عالی" }).click();
  await buyer.getByLabel("توضیح برای قطعه‌ساز (اختیاری)").fill("کیفیت و تحویل عالی");
  await buyer.getByRole("button", { name: "ثبت امتیاز" }).click();
  await expect(buyer.getByText("امتیاز شما ثبت شد. سپاس از بازخوردتان.")).toBeVisible();
  await supplier.reload();
  await expect(supplier.getByText("کیفیت و تحویل عالی").first()).toBeVisible();
  await buyer.getByRole("link", { name: company }).click();
  await buyer.waitForURL("**/suppliers/**");
  await expect(buyer.getByText("تحویل به‌موقع: ۱ از ۱")).toBeVisible();
  await expect(buyer.getByText("امتیاز کارفرماها: ۵ از ۵ (۱ امتیاز)")).toBeVisible();
});

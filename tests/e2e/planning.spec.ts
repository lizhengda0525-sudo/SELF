import { test, expect, type Page } from "@playwright/test";
const nav = (p: Page, name: string) =>
  p
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name, exact: true });
test("calendar date creation, drag, all views, repeat completion and countdown history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await nav(page, "计划").click();
  await page.getByRole("button", { name: "日历", exact: true }).click();
  const month = await page.evaluate(
      () =>
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    ),
    date = `${month}-15`,
    next = `${month}-16`;
  await page
    .locator(`.fc-daygrid-day[data-date="${date}"] .fc-daygrid-day-frame`)
    .click({ position: { x: 45, y: 55 } });
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue(date);
  await page.getByLabel("任务名称").fill("日历拖拽验证");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const event = page.locator(".fc-event").filter({ hasText: "日历拖拽验证" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await event.hover();
  const from = (await event.boundingBox())!,
    to = (await page
      .locator(`.fc-daygrid-day[data-date="${next}"]`)
      .boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, from.y + from.height / 2, {
    steps: 25,
  });
  await page.waitForTimeout(1100);
  /* Hold through a focus-clock tick: it must not interrupt dragging. */ await page.mouse.up();
  await expect(page.getByText("日历安排已保存", { exact: true })).toBeVisible();
  await expect(
    page.locator(`.fc-daygrid-day[data-date="${next}"] .fc-event`),
  ).toContainText("日历拖拽验证");
  await event.click();
  await expect(page.getByLabel("日期", { exact: true })).toHaveValue(next);
  await page.getByLabel("重复规则").selectOption("daily");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  for (const v of ["周", "日", "月"]) {
    await page.getByRole("button", { name: v, exact: true }).click();
    await expect(page.locator(".fc-view")).toBeVisible();
  }
  await page.screenshot({
    path: "artifacts/calendar-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page.locator(".fc-col-header-cell").last().boundingBox();
      return b!.x + b!.width;
    })
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "artifacts/calendar-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "全部任务", exact: true }).click();
  await page
    .getByRole("button", { name: "完成任务 日历拖拽验证", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "恢复任务 日历拖拽验证", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "完成任务 日历拖拽验证", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "倒计时", exact: true }).click();
  await page.getByRole("button", { name: "新建倒计时", exact: true }).click();
  await page.getByLabel("倒计时名称").fill("续证截止");
  await page.locator("input[name=repeatDays]").fill("7");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "完成本次", exact: true }).click();
  await expect(page.getByText("完成历史（1）", { exact: true })).toBeVisible();
  await page.reload();
  await nav(page, "计划").click();
  await page.getByRole("button", { name: "倒计时", exact: true }).click();
  await expect(page.getByText("续证截止", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

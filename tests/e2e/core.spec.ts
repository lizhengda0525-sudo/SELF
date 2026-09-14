import { test, expect, type Page } from "@playwright/test";
const nav = (p: Page, name: string) =>
  p
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name, exact: true });
test("task, habits, ledger, refund validation, membership renewal, recycle bin, offline reload and mobile layout", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，从容一点。" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "快速添加任务" })
    .fill("验证个人管家");
  await page.getByRole("textbox", { name: "快速添加任务" }).press("Enter");
  await page
    .getByRole("button", { name: "完成任务 验证个人管家", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "恢复任务 验证个人管家", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "恢复任务 验证个人管家", exact: true }),
  ).toBeVisible();
  await nav(page, "习惯").click();
  await page.getByRole("button", { name: "新增习惯", exact: true }).click();
  await page.getByLabel("每天想坚持的一件事").fill("阅读 20 分钟");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("button", { name: "记录习惯 阅读 20 分钟", exact: true })
    .click();
  await page.getByRole("button", { name: "完成了 今天的小进步" }).click();
  await expect(page.getByText("连续完成 1 天")).toBeVisible();
  await nav(page, "账本").click();
  await page.getByRole("button", { name: "记一笔", exact: true }).click();
  await page.getByLabel("金额 · CNY", { exact: true }).fill("29.90");
  await page.getByLabel("商户 / 对方").fill("测试书店");
  await page.getByRole("button", { name: "保存账单" }).click();
  await expect(page.getByText("测试书店", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "记一笔", exact: true }).click();
  await page.getByRole("button", { name: "退款", exact: true }).click();
  await page.getByLabel("金额 · CNY", { exact: true }).fill("30");
  await page.getByLabel("关联原支出").selectOption({ index: 1 });
  await page.getByRole("button", { name: "保存账单" }).click();
  await expect(page.getByRole("alert")).toContainText("累计退款不能超过");
  await page.getByLabel("金额 · CNY", { exact: true }).fill("9.90");
  await page.getByRole("button", { name: "保存账单" }).click();
  await expect(
    page.locator(".metrics").getByText("¥20.00", { exact: true }),
  ).toBeVisible();
  await nav(page, "会员").click();
  await page.getByRole("button", { name: "新增会员", exact: true }).click();
  await page.getByLabel("会员 / 周期服务名称").fill("阅读会员");
  await page.getByLabel("本周期已支付 · CNY").fill("31");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "管理会员" }).click();
  await page.getByRole("button", { name: "记录续费" }).click();
  await page.getByLabel("同时记一笔今天支付的支出").check();
  await page.getByRole("button", { name: "确认续费" }).click();
  await nav(page, "账本").click();
  await expect(page.getByText("阅读会员", { exact: true })).toBeVisible();
  await nav(page, "计划").click();
  await page
    .getByRole("button", { name: "删除任务 验证个人管家", exact: true })
    .click();
  await nav(page, "设置").click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await nav(page, "今天").click();
  await expect(
    page.getByRole("button", { name: "恢复任务 验证个人管家", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天，从容一点。" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "快速添加任务" })
    .fill("离线新增任务");
  await page.getByRole("textbox", { name: "快速添加任务" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "完成任务 离线新增任务", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "完成任务 离线新增任务", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  for (const name of ["计划", "习惯", "账本", "会员", "设置"]) {
    await nav(page, name).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/mobile-${name}.png`,
      fullPage: true,
    });
  }
  await nav(page, "今天").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav(page, "今天")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/mobile-today.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/desktop-today.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("stale money edits are blocked across tabs and restoring an export preserves a backup", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await nav(page, "账本").click();
  await page.getByRole("button", { name: "记一笔", exact: true }).click();
  await page.getByLabel("金额 · CNY", { exact: true }).fill("10");
  await page.getByLabel("商户 / 对方").fill("并发账单");
  await page.getByRole("button", { name: "保存账单" }).click();
  const second = await context.newPage();
  await second.goto("/");
  await nav(second, "账本").click();
  await page
    .locator(".entry-description")
    .filter({ hasText: "并发账单" })
    .click();
  await page.getByLabel("金额 · CNY", { exact: true }).fill("11");
  await second
    .locator(".entry-description")
    .filter({ hasText: "并发账单" })
    .click();
  await second.getByLabel("金额 · CNY", { exact: true }).fill("12");
  await second.getByRole("button", { name: "保存账单" }).click();
  await expect(second.getByText("并发账单", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存账单" }).click();
  await expect(page.getByRole("alert")).toContainText("其他页面更新");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.locator(".metrics").getByText("¥12.00", { exact: true }),
  ).toBeVisible();
  await nav(page, "设置").click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出全部数据" }).click();
  const file = await dl;
  const path = await file.path();
  await nav(page, "今天").click();
  await page.getByRole("textbox", { name: "快速添加任务" }).fill("导出后新增");
  await page.getByRole("textbox", { name: "快速添加任务" }).press("Enter");
  await expect(
    page.getByRole("button", { name: "完成任务 导出后新增", exact: true }),
  ).toBeVisible();
  await nav(page, "设置").click();
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "恢复备份预览" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(
    page.getByText("恢复备份前的本机版本", { exact: true }),
  ).toBeVisible();
  await nav(page, "今天").click();
  await expect(
    page.getByRole("button", { name: "完成任务 导出后新增", exact: true }),
  ).toHaveCount(0);
  await second.close();
});
test("two independent devices sync encrypted data and keep both conflict versions", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage();
  const key = "ab".repeat(32),
    token = "self-e2e-only-token-with-at-least-32-characters";
  async function configure(p: Page) {
    await nav(p, "设置").click();
    await p.getByLabel("访问令牌", { exact: true }).fill(token);
    await p.getByLabel("同步密钥（64 位十六进制）").fill(key);
  }
  async function add(p: Page, title: string) {
    await nav(p, "今天").click();
    await p.getByRole("textbox", { name: "快速添加任务" }).fill(title);
    await p.getByRole("textbox", { name: "快速添加任务" }).press("Enter");
    await expect(
      p.getByRole("button", { name: `完成任务 ${title}`, exact: true }),
    ).toBeVisible();
  }
  try {
    await pa.goto("/");
    await add(pa, "从设备 A 创建");
    await configure(pa);
    await pa.getByRole("button", { name: "立即同步" }).click();
    await expect(pa.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pa.getByText("同步检查完成", { exact: true })).toBeVisible();
    await pb.goto("/");
    await configure(pb);
    await pb.getByRole("button", { name: "立即同步" }).click();
    await expect(pb.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pb.getByText("同步检查完成", { exact: true })).toBeVisible();
    await nav(pb, "今天").click();
    await expect(
      pb.getByRole("button", { name: "完成任务 从设备 A 创建", exact: true }),
    ).toBeVisible();
    await add(pa, "设备 A 的离线修改");
    await configure(pa);
    await pa.getByRole("button", { name: "立即同步" }).click();
    await expect(pa.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pa.getByText("同步检查完成", { exact: true })).toBeVisible();
    await add(pb, "设备 B 的离线修改");
    await configure(pb);
    await pb.getByRole("button", { name: "立即同步" }).click();
    await expect(pb.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pb.getByText("同步检查完成", { exact: true })).toBeVisible();
    await pa.getByRole("button", { name: "立即同步" }).click();
    await expect(pa.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pa.getByText("同步检查完成", { exact: true })).toBeVisible();
    await nav(pa, "今天").click();
    await expect(
      pa.getByRole("button", {
        name: "完成任务 设备 B 的离线修改",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pa.getByRole("button", {
        name: "完成任务 设备 A 的离线修改",
        exact: true,
      }),
    ).toBeVisible();
    // Both devices now edit the same record independently.
    await pa
      .locator(".task-content")
      .filter({ hasText: "从设备 A 创建" })
      .click();
    await pa.getByLabel("任务名称").fill("A 修改共同任务");
    await pa.getByRole("button", { name: "保存", exact: true }).click();
    await nav(pb, "今天").click();
    await pb
      .locator(".task-content")
      .filter({ hasText: "从设备 A 创建" })
      .click();
    await pb.getByLabel("任务名称").fill("B 修改共同任务");
    await pb.getByRole("button", { name: "保存", exact: true }).click();
    await configure(pa);
    await pa.getByRole("button", { name: "立即同步" }).click();
    await expect(pa.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(pa.getByText("同步检查完成", { exact: true })).toBeVisible();
    await configure(pb);
    await pb.getByRole("button", { name: "立即同步" }).click();
    await expect(pb.getByRole("button", { name: "立即同步" })).toBeEnabled();
    await expect(
      pb.getByRole("heading", { name: "逐条处理同步冲突" }),
    ).toBeVisible();
    await pb.getByRole("radio").first().check();
    await pb.getByRole("button", { name: "应用选择并同步" }).click();
    await expect(
      pb.getByText("逐条冲突已处理，两端原版本已备份", { exact: true }),
    ).toBeVisible();
    await nav(pb, "今天").click();
    await expect(
      pb.getByRole("button", { name: "完成任务 B 修改共同任务", exact: true }),
    ).toBeVisible();
    await expect(
      pb.getByRole("button", {
        name: "完成任务 设备 A 的离线修改",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});

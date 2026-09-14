import { test, expect } from "@playwright/test";
test("owner creates a device token in settings and revoked device loses access", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page
    .getByLabel("访问令牌", { exact: true })
    .fill("self-e2e-only-token-with-at-least-32-characters");
  await page.getByRole("button", { name: "查看账户与设备" }).click();
  await expect(
    page.getByText("我的个人账库 · 所有者", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("新设备名称").fill("测试手机");
  await page.getByRole("button", { name: "创建设备令牌" }).click();
  const token = await page
    .getByLabel("新设备令牌", { exact: true })
    .inputValue();
  expect(token).toHaveLength(64);
  expect(
    (
      await request.get("/api/sync", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".device-row")
    .filter({ hasText: "测试手机" })
    .getByRole("button", { name: "撤销", exact: true })
    .click();
  await expect(
    page.locator(".device-row").filter({ hasText: "测试手机" }),
  ).toContainText("已撤销");
  expect(
    (
      await request.get("/api/sync", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "今天", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "快速添加任务" })
    .fill("撤销后仍能本地使用");
  await page.getByRole("textbox", { name: "快速添加任务" }).press("Enter");
  await expect(
    page.getByRole("button", {
      name: "完成任务 撤销后仍能本地使用",
      exact: true,
    }),
  ).toBeVisible();
});

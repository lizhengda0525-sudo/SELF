import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const svg = await readFile("public/icon.svg", "utf8");
const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({
      path: `public/icon-${size}.png`,
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

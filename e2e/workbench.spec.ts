import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("converts a local reference and exposes diagnostics", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Pixel Art Workbench" }),
  ).toBeVisible();
  const image = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: { r: 126, g: 70, b: 36, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await page.locator(".upload input[type=file]").setInputFiles({
    name: "desk-reference.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".masthead .status")).toContainText("Ready", {
    timeout: 10_000,
  });
  await expect(page.getByLabel("Converted pixel underpainting")).toBeVisible();
  await expect(page.getByText("Reference underpainting.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download underpainting" }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("workbench-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workbench-mobile.png"),
    fullPage: true,
  });
});

import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

test("downloads a playable moving flyover and preserves the interactive view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/vinny-table.stl")),
    page.goto("/?model=vinny-table&quality=standard&tableWood=1&grooveWood=3"),
  ]);
  const canvas = page.locator(".viewer canvas");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot();
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download flyover", exact: true }).click();
  await expect(page.getByRole("button", { name: "Recording flyover…" })).toBeDisabled();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("vinny-table-flyover.webm");
  const file = await download.path();
  const videoBytes = await fs.readFile(file!);
  expect(videoBytes.length).toBeGreaterThan(10_000);
  expect(videoBytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  await expect(page.getByRole("status")).toHaveText("Flyover ready to preview or download");
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  expect(await canvas.screenshot()).toEqual(before);

  const decoded = await page.evaluate(async (bytes) => {
    const video = document.createElement("video");
    video.muted = true;
    video.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Downloaded video could not be decoded"));
    });
    await loaded;
    const capture = document.createElement("canvas");
    capture.width = 320;
    capture.height = 180;
    const context = capture.getContext("2d")!;
    const pixels = () => {
      context.drawImage(video, 0, 0, 320, 180);
      return context.getImageData(0, 0, 320, 180).data;
    };
    const first = pixels();
    const seeked = new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    video.currentTime = 3;
    await seeked;
    const next = pixels();
    let changed = 0;
    for (let index = 0; index < first.length; index += 4) {
      if (Math.abs(first[index] - next[index]) > 15) changed++;
    }
    const result = { width: video.videoWidth, height: video.videoHeight, changed };
    URL.revokeObjectURL(video.src);
    return result;
  }, [...videoBytes]);
  expect(decoded.width).toBe(1280);
  expect(decoded.height).toBe(720);
  expect(decoded.changed).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("explains unsupported recording and allows retry", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true });
  });
  await page.goto("/?model=vinny-table&quality=standard");
  await expect(page.locator(".viewer canvas")).toBeVisible();
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  await page.getByRole("button", { name: "Download flyover", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Video downloads are not supported");
  await expect(page.getByRole("button", { name: "Download flyover", exact: true })).toBeEnabled();
});


test("previews and downloads the same video, then refreshes it after a finish change", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Reflect.set(window, "flyoverRecordings", 0);
    window.MediaRecorder = new Proxy(window.MediaRecorder, {
      construct(target, args) {
        Reflect.set(window, "flyoverRecordings", Reflect.get(window, "flyoverRecordings") + 1);
        return Reflect.construct(target, args);
      },
    });
  });
  await page.goto("/?model=vinny-table&quality=standard&tableWood=5&grooveWood=3");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  await page.getByRole("button", { name: "Preview flyover", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview flyover", exact: true })).toBeDisabled();
  const preview = page.getByRole("dialog", { name: "Vinny Table flyover preview" });
  await expect(preview).toBeVisible({ timeout: 15_000 });
  const video = preview.locator("video");
  await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((element) => [element.videoWidth, element.videoHeight])).toEqual([1280, 720]);
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
  const firstUrl = await video.getAttribute("src");
  const firstDownload = page.waitForEvent("download");
  await preview.getByRole("button", { name: "Download video" }).click();
  const first = await firstDownload;
  expect(first.suggestedFilename()).toBe("vinny-table-flyover.webm");
  const firstBytes = await fs.readFile((await first.path())!);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview flyover", exact: true })).toBeFocused();
  const nextDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download flyover", exact: true }).click();
  const next = await nextDownload;
  expect(await fs.readFile((await next.path())!)).toEqual(firstBytes);
  expect(await page.evaluate(() => Reflect.get(window, "flyoverRecordings"))).toBe(1);
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  await page.getByLabel("Vinny table wood").click();
  await page.getByRole("option", { name: "Maple", exact: true }).click();
  await page.getByRole("button", { name: "Workspace actions", exact: true }).click();
  await page.getByRole("button", { name: "Preview flyover", exact: true }).click();
  await expect(preview).toBeVisible({ timeout: 15_000 });
  expect(await video.getAttribute("src")).not.toBe(firstUrl);
  expect(await page.evaluate(() => Reflect.get(window, "flyoverRecordings"))).toBe(2);
  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(preview).toHaveCount(0);
  expect(errors).toEqual([]);
});

import { expect, type Page, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import { PNG } from "pngjs";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { api } from "../../convex/_generated/api";

const THEME_STORAGE_KEY = "3d-prints:theme";
const PLAYWRIGHT_TEST_VERSION_PREFIX = "Playwright ";

async function expectCanvasHasRenderedModel(page: Page) {
  const canvas = page.locator(".scene-panel canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(350);

  const image = PNG.sync.read(await canvas.screenshot());
  const sampleStep = Math.max(1, Math.floor(Math.min(image.width, image.height) / 80));
  const colors = new Set<string>();
  let variedSamples = 0;

  for (let y = 0; y < image.height; y += sampleStep) {
    for (let x = 0; x < image.width; x += sampleStep) {
      const offset = (image.width * y + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const a = image.data[offset + 3];
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}:${a >> 4}`);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 8) {
        variedSamples += 1;
      }
    }
  }

  expect(colors.size).toBeGreaterThan(18);
  expect(variedSamples).toBeGreaterThan(120);
}

function countChangedPixels(before: Buffer, after: Buffer) {
  const beforeImage = PNG.sync.read(before);
  const afterImage = PNG.sync.read(after);
  expect(afterImage.width).toBe(beforeImage.width);
  expect(afterImage.height).toBe(beforeImage.height);

  let changedPixels = 0;
  for (let offset = 0; offset < beforeImage.data.length; offset += 4) {
    const difference =
      Math.abs(beforeImage.data[offset] - afterImage.data[offset]) +
      Math.abs(beforeImage.data[offset + 1] - afterImage.data[offset + 1]) +
      Math.abs(beforeImage.data[offset + 2] - afterImage.data[offset + 2]);
    if (difference > 24) {
      changedPixels += 1;
    }
  }
  return changedPixels;
}

async function expectNoPageErrors(page: Page, run: () => Promise<void>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await run();
  expect(errors).toEqual([]);
}

async function openReady(page: Page, path = "/") {
  await setStoredTheme(page, "light");
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
  await expectCanvasHasRenderedModel(page);
}

async function setStoredTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    ({ key, themeMode }) => {
      window.localStorage.setItem(key, themeMode);
    },
    { key: THEME_STORAGE_KEY, themeMode: theme },
  );
}

async function chooseSelectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openSidebarModel(page: Page, modelName: string) {
  await page.getByRole("button", { name: `Open ${modelName}` }).click();
}

async function openActions(page: Page) {
  await page.getByRole("button", { name: "Workspace actions" }).click();
}

async function cleanupPlaywrightVersions(titles: string[]) {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl || titles.length === 0) {
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  await client.mutation(api.library.deletePlaywrightTestVersions, { titles });
}

function analyzeStlTopology(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const position = geometry.getAttribute("position");
  const precision = 100000;
  const vertexKeys: string[] = [];
  const edges = new Map<string, number>();
  let degenerateTriangles = 0;
  let finiteCoordinates = true;
  let buildPlateContactArea = 0;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };

  for (let index = 0; index < position.count; index += 1) {
    finiteCoordinates &&=
      Number.isFinite(position.getX(index)) &&
      Number.isFinite(position.getY(index)) &&
      Number.isFinite(position.getZ(index));
    vertexKeys[index] = [
      Math.round(position.getX(index) * precision) / precision,
      Math.round(position.getY(index) * precision) / precision,
      Math.round(position.getZ(index) * precision) / precision,
    ].join(",");
  }

  for (let index = 0; index < position.count; index += 3) {
    const triangle = [
      vertexKeys[index],
      vertexKeys[index + 1],
      vertexKeys[index + 2],
    ];
    const zValues = [
      position.getZ(index),
      position.getZ(index + 1),
      position.getZ(index + 2),
    ];
    if (zValues.every((value) => Math.abs(value - bounds.min.z) < 1e-4)) {
      const ax = position.getX(index);
      const ay = position.getY(index);
      const bx = position.getX(index + 1);
      const by = position.getY(index + 1);
      const cx = position.getX(index + 2);
      const cy = position.getY(index + 2);
      buildPlateContactArea +=
        Math.abs(ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2;
    }
    if (
      triangle[0] === triangle[1] ||
      triangle[1] === triangle[2] ||
      triangle[2] === triangle[0]
    ) {
      degenerateTriangles += 1;
      continue;
    }

    for (const [start, end] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      const key = start < end ? `${start}|${end}` : `${end}|${start}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count !== 2) {
      nonManifoldEdges += 1;
    }
  }

  geometry.dispose();

  return {
    degenerateTriangles,
    buildPlateContactArea,
    finiteCoordinates,
    nonManifoldEdges,
    minZ: bounds.min.z,
    size,
    triangles: position.count / 3,
  };
}

test.describe("3D print app", () => {
  test("opens the default workspace with model navigation in the sidebar", async ({
    page,
  }) => {
    await setStoredTheme(page, "light");
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).toHaveURL(/unit=in/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Paper Towel Holder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expectCanvasHasRenderedModel(page);
  });

  test("renders distinct keyboard-operable 3D previews in the model library", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=in");

    const trayPreview = page.getByTestId("model-preview-japandi-tray");
    const tablePreview = page.getByTestId("model-preview-dining-table");
    await expect(trayPreview).toHaveAttribute("data-load-state", "ready");
    await expect(trayPreview.locator("canvas")).toBeVisible();
    await tablePreview.scrollIntoViewIfNeeded();
    await expect(tablePreview).toHaveAttribute("data-load-state", "ready");
    await expect(tablePreview.locator("canvas")).toBeVisible();

    const before = await tablePreview.screenshot();
    await tablePreview.focus();
    await tablePreview.press("ArrowRight");
    const after = await tablePreview.screenshot();
    expect(countChangedPixels(before, after)).toBeGreaterThan(20);

    await expect(page.getByRole("button", { name: "Open Plate Table" })).toBeVisible();

    await page.setViewportSize({ width: 393, height: 852 });
    await page.getByRole("button", { name: "Open workspace navigation" }).click();
    await expect(trayPreview).toHaveAttribute("data-load-state", "ready");
    const compactLayout = await page.evaluate(() => {
      const preview = document
        .querySelector<HTMLElement>('[data-testid="model-preview-japandi-tray"]')!
        .getBoundingClientRect();
      const openButton = document
        .querySelector<HTMLElement>('[aria-label="Open Japandi Tray"]')!
        .getBoundingClientRect();
      const navigationTargets = [
        ...document.querySelectorAll<HTMLElement>(
          ".workspace-library-nav button",
        ),
      ].map((element) => element.getBoundingClientRect().height);
      return {
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        minimumNavigationTarget: Math.min(...navigationTargets),
        openButtonHeight: openButton.height,
        previewHeight: preview.height,
        previewWidth: preview.width,
      };
    });
    expect(compactLayout.documentOverflow).toBeLessThanOrEqual(0);
    expect(compactLayout.minimumNavigationTarget).toBeGreaterThanOrEqual(44);
    expect(compactLayout.openButtonHeight).toBeGreaterThanOrEqual(44);
    expect(compactLayout.previewHeight).toBeGreaterThanOrEqual(72);
    expect(compactLayout.previewWidth).toBeGreaterThanOrEqual(72);

    await page.getByRole("button", { name: "Saved Versions" }).click();
    await expect(
      page.locator(".workspace-sidebar-section-heading strong"),
    ).toHaveText("Japandi Tray");
    const savedVersionLayout = await page.evaluate(() => {
      const heading = document
        .querySelector<HTMLElement>(".workspace-sidebar-section-heading")!
        .getBoundingClientRect();
      const message = document
        .querySelector<HTMLElement>(".workspace-version-content .library-note")!
        .getBoundingClientRect();
      return {
        clearance: message.top - heading.bottom,
        messageHeight: message.height,
      };
    });
    expect(savedVersionLayout.clearance).toBeGreaterThanOrEqual(8);
    expect(savedVersionLayout.messageHeight).toBeLessThan(100);
  });

  test("root model opening clears stale parameter query values", async ({ page }) => {
    await setStoredTheme(page, "dark");
    await page.goto(
      "/?unit=mm&length=360&width=300&height=80&floorThickness=8&ribRelief=1.8",
    );

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page).not.toHaveURL(/length=360/);
    await expect(page).not.toHaveURL(/floorThickness=8/);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("190.1");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("110.1");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
  });

  test("unknown model ids render a load error instead of a blank workspace", async ({
    page,
  }) => {
    await setStoredTheme(page, "light");
    await page.goto("/?model=missing-model");

    await expect(page.getByText('Unknown model "missing-model"')).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("loads the default paper towel holder with audited controls and a rendered canvas", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=paper-towel-holder&unit=mm");

      await expect(page.getByRole("heading", { name: "Paper Towel Holder" })).toBeVisible();
      await expect(page.getByLabel("Paper Towel Holder model viewer")).toBeVisible();
      await expect(page.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Workspace actions" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Toggle workspace appearance" }),
      ).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Library" })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(0);
      await expect(page.locator("select")).toHaveCount(0);

      await expect(page.locator("#holder-height")).toHaveAttribute("max", "450");
      await expect(page.locator("#holder-diameter")).toHaveAttribute("max", "260");
      await expect(page.getByLabel("Holder height in millimeters")).toHaveValue("215.7");
      await expect(page.getByLabel("Holder diameter in millimeters")).toHaveValue("123.8");
      await expect(page.getByLabel("Center tube diameter in millimeters")).toHaveValue("36.0");

      await expect(page.getByText("Sand chamber")).toBeVisible();
      await expect(page.getByText("Estimated sand mass")).toBeVisible();
      await expect(page.getByText("Flush sand floor")).toBeVisible();
      await expect(page.getByText("Rounded top", { exact: true })).toBeVisible();
      await expect(page.getByText("Tube-to-holder clearance")).toBeVisible();
    });
  });

  test("edits center tube diameter independently and saves millimeter params in the URL", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    const holderDiameter = page.getByLabel("Holder diameter in millimeters");
    const tubeDiameter = page.getByLabel("Center tube diameter in millimeters");
    await expect(holderDiameter).toHaveValue("123.8");

    await tubeDiameter.fill("50");
    await tubeDiameter.blur();

    await expect(tubeDiameter).toHaveValue("50.0");
    await expect(holderDiameter).toHaveValue("123.8");
    await expect(page).toHaveURL(/tubeDiameter=50/);
    await expect(page.getByTestId("viewer-status")).toContainText("Center tube diameter 50.0 mm");
    await expect(page.getByText("Center tube outer diameter")).toBeVisible();
    await expect(page.getByText("50.0 mm").first()).toBeVisible();
  });

  test("uses one contextual unit dropdown to switch all parameter rows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    const unitTrigger = page.getByRole("combobox", {
      name: "Holder height units",
    });
    const unitChevron = unitTrigger.locator("svg");
    const [triggerBox, chevronBox] = await Promise.all([
      unitTrigger.boundingBox(),
      unitChevron.boundingBox(),
    ]);
    expect(triggerBox).not.toBeNull();
    expect(chevronBox).not.toBeNull();
    expect(chevronBox?.width).toBe(14);
    expect(chevronBox?.x).toBeGreaterThanOrEqual(triggerBox?.x ?? 0);
    expect((chevronBox?.x ?? 0) + (chevronBox?.width ?? 0)).toBeLessThanOrEqual(
      (triggerBox?.x ?? 0) + (triggerBox?.width ?? 0),
    );

    await chooseSelectOption(page, "Holder height units", "cm");

    await expect(page).toHaveURL(/unit=cm/);
    await expect(page.getByLabel("Holder height in centimeters")).toHaveValue("21.57");
    await expect(page.getByLabel("Holder diameter in centimeters")).toHaveValue("12.38");
    await expect(page.getByLabel("Center tube diameter in centimeters")).toHaveValue("3.60");

    const holderHeight = page.getByLabel("Holder height in centimeters");
    await holderHeight.fill("30");
    await holderHeight.blur();

    await expect(holderHeight).toHaveValue("30.00");
    await expect(page).toHaveURL(/height=30/);
    await expect(page.getByTestId("viewer-status")).toContainText("Holder height 30.00 cm");
  });

  test("clamps dependent holder diameter and tube diameter limits", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    const holderDiameter = page.getByLabel("Holder diameter in millimeters");
    const tubeDiameter = page.getByLabel("Center tube diameter in millimeters");

    await tubeDiameter.fill("120");
    await tubeDiameter.blur();
    await expect(tubeDiameter).toHaveValue("95.8");

    await holderDiameter.fill("100");
    await holderDiameter.blur();
    await expect(holderDiameter).toHaveValue("123.8");
    await expect(page.getByText("Tube-to-holder clearance")).toBeVisible();
  });

  test("opens catalog models from the sidebar and exposes tray parameters", async ({
    page,
  }) => {
    await setStoredTheme(page, "dark");
    await page.goto("/?model=paper-towel-holder&unit=mm");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);
    await expect(page.locator("html")).toHaveClass(/dark/);

    await openSidebarModel(page, "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(0);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("190.1");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("110.1");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
    await expect(page.getByLabel("Rib relief in millimeters")).toHaveValue("1.0");
    await expect(page.getByRole("heading", { name: "Orientation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Align tray to X axis" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use tray source angle" })).toHaveCount(0);
    await expect(page).toHaveURL(/rotation=0/);
    await expect(page.getByText("Weighted Center")).toHaveCount(0);
    await expectCanvasHasRenderedModel(page);
  });

  test("keeps tray orientation controls flagged off by default", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=in&rotation=30");

    await expect(page).toHaveURL(/rotation=30/);
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expect(page.getByRole("button", { name: "Align tray to X axis" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use tray source angle" })).toHaveCount(0);
    await chooseSelectOption(page, "Tray length units", "cm");
    await expect(page).toHaveURL(/unit=cm/);
    await expect(page).toHaveURL(/rotation=30/);
  });

  test("accepts contextual unit changes and fractional inch input", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray");

    await chooseSelectOption(page, "Floor thickness units", "in");
    await expect(page).toHaveURL(/unit=in/);
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("3/32");

    const floorThickness = page.getByLabel("Floor thickness in inches");
    await floorThickness.fill("1/8th in");
    await floorThickness.blur();

    await expect(floorThickness).toHaveValue("1/8");
    await expect(page).toHaveURL(/floorThickness=0\.126/);
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");

    await floorThickness.press("ArrowUp");
    await expect(floorThickness).toHaveValue("5/32");

    const wallHeight = page.getByLabel("Wall height in inches");
    await wallHeight.fill('1 1/8"');
    await expect(wallHeight).toHaveValue("1 1/8");
    await wallHeight.press("ArrowUp");
    await expect(wallHeight).toHaveValue("1 1/4");
    await wallHeight.press("ArrowDown");
    await expect(wallHeight).toHaveValue("1 1/8");

    await wallHeight.fill("3/4");
    await expect(wallHeight).toHaveValue("3/4");
    await wallHeight.press("ArrowUp");
    await expect(wallHeight).toHaveValue("13/16");
  });

  test("clamps tray floor thickness below the selected wall height", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=mm");

    const wallHeight = page.getByLabel("Wall height in millimeters");
    const floorThickness = page.getByLabel("Floor thickness in millimeters");

    await wallHeight.fill("10");
    await wallHeight.blur();
    await expect(wallHeight).toHaveValue("10.0");

    await floorThickness.fill("20");
    await floorThickness.blur();
    await expect(floorThickness).toHaveValue("8.0");
    await expect(page).toHaveURL(/height=10/);
    await expect(page).toHaveURL(/floorThickness=8/);
  });

  test("rehydrates model, unit, parameters, and stored theme separately", async ({ page }) => {
    await setStoredTheme(page, "dark");
    await page.goto(
      "/?model=japandi-tray&unit=in&length=203.2&width=101.6&height=25.4&floorThickness=3.175&ribRelief=1.4",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toHaveValue("8");
    await expect(page.getByLabel("Tray width in inches")).toHaveValue("4");
    await expect(page.getByLabel("Wall height in inches")).toHaveValue("1");
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("1/8");
    await expect(page.getByTestId("viewer-status")).toContainText("L 8 in");
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page).toHaveURL(/length=8/);
    await expect(page).toHaveURL(/width=4/);
    await expect(page).toHaveURL(/floorThickness=0\.125/);
  });

  test("normalizes legacy millimeter tray links when centimeters are selected", async ({
    page,
  }) => {
    await openReady(
      page,
      "/?model=japandi-tray&unit=cm&length=141&width=300&height=44&floorThickness=4.9&ribRelief=1",
    );

    await expect(page.getByLabel("Tray length in centimeters")).toHaveValue("14.10");
    await expect(page.getByLabel("Tray width in centimeters")).toHaveValue("30.00");
    await expect(page.getByLabel("Wall height in centimeters")).toHaveValue("4.40");
    await expect(page.getByLabel("Floor thickness in centimeters")).toHaveValue("0.49");
    await expect(page.getByLabel("Rib relief in centimeters")).toHaveValue("0.10");
    await expect(page.getByTestId("viewer-status")).toContainText("L 14.10 cm");
    await expect(page.getByTestId("viewer-status")).toContainText("W 30.00 cm");
    await expect(page).toHaveURL(/length=14\.1/);
    await expect(page).toHaveURL(/width=30/);
    await expect(page).toHaveURL(/height=4\.4/);
    await expect(page).toHaveURL(/floorThickness=0\.49/);
    await expect(page).toHaveURL(/ribRelief=0\.1/);
  });

  test("toggles dark theme and records the preference in localStorage", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder");

    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await openActions(page);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe("dark");

    await page.getByRole("button", { name: "Use light theme" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe("light");
  });

  test("supports rendering modes and original overlay toggles", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder");

    await page.getByRole("button", { name: "Fill" }).click();
    await expect(page.getByRole("button", { name: "Fill" })).toHaveClass(/active/);
    await page.getByRole("button", { name: "Section" }).click();
    await expect(page.getByRole("button", { name: "Section" })).toHaveClass(/active/);

    await expect(
      page
        .locator(".inspector-body > .panel-section > h2")
        .filter({ hasText: "Rendering" }),
    ).toHaveCount(0);
    await openActions(page);
    const renderingSettings = page.getByLabel("Rendering settings");
    await expect(renderingSettings).toBeVisible();

    await renderingSettings.getByRole("button", { name: "X-Ray" }).click();
    await expect(
      renderingSettings.getByRole("button", { name: "X-Ray" }),
    ).toHaveClass(/active/);
    await expect(page.getByTestId("viewer-status")).toContainText("X-Ray");
    await renderingSettings.getByRole("button", { name: "Wire" }).click();
    await expect(
      renderingSettings.getByRole("button", { name: "Wire" }),
    ).toHaveClass(/active/);
    await expect(page.getByTestId("viewer-status")).toContainText("Wire");

    const overlay = renderingSettings.getByLabel("Original inlay");
    await renderingSettings
      .getByText("Original inlay", { exact: true })
      .click();
    await expect(overlay).toBeChecked();
    await expectCanvasHasRenderedModel(page);
  });

  test("orientation indicator, workspace actions, and zoom keep the 3D canvas alive", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=japandi-tray&unit=mm");

      const trayLength = page.getByLabel("Tray length in millimeters");
      await trayLength.fill("200");
      await trayLength.blur();
      await expect(trayLength).toHaveValue("200.0");
      await page.getByRole("button", { name: "Reset parameters" }).click();
      await expect(trayLength).toHaveValue("190.1");

      await openActions(page);
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Workspace actions" })).toBeVisible();
      await page.mouse.click(24, 24);
      await expect(page.getByRole("dialog", { name: "Workspace actions" })).toBeHidden();

      for (const label of [
        "Zoom in",
        "Zoom out",
        "Center view",
      ]) {
        await page.getByRole("button", { name: label }).first().click();
      }

      const orientationIndicator = page.getByRole("img", {
        name: "Current camera orientation",
      });
      await expect(orientationIndicator).toBeVisible();
      await expect(orientationIndicator.getByRole("button")).toHaveCount(0);
      await expect(page.locator(".orientation-cube-face")).toHaveText([
        "Top",
        "Front",
        "Right",
        "Bottom",
        "Back",
        "Left",
      ]);

      for (const label of [
        "Top view",
        "Bottom view",
        "Align X edge to view",
        "Align Y edge to view",
        "Isometric view",
      ]) {
        await expect(page.getByRole("button", { name: label })).toHaveCount(0);
      }

      const orientationBeforeParameterEdit = await page
        .locator(".orientation-cube")
        .getAttribute("style");
      await trayLength.fill("200");
      await trayLength.blur();
      await expect(page.locator(".orientation-cube")).toHaveAttribute(
        "style",
        orientationBeforeParameterEdit!,
      );

      await page.getByRole("button", { name: "Zoom in" }).click();
      await trayLength.fill("210");
      await trayLength.blur();

      const orientationBeforeDrag = await page
        .locator(".orientation-cube")
        .getAttribute("style");
      const canvasBox = await page.locator(".scene-panel canvas").boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2,
        canvasBox!.y + canvasBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2 + 90,
        canvasBox!.y + canvasBox!.height / 2 + 35,
        { steps: 6 },
      );
      await page.mouse.up();
      await expect
        .poll(() =>
          page.locator(".orientation-cube").getAttribute("style"),
        )
        .not.toBe(orientationBeforeDrag);

      await expectCanvasHasRenderedModel(page);

      await openReady(page, "/?model=dining-table&unit=in");
      await expect(
        page.getByRole("img", { name: "Current camera orientation" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Top view" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Bottom view" })).toHaveCount(0);
      await expectCanvasHasRenderedModel(page);
    });
  });

  test("pans with a primary mouse drag without changing camera orientation", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=mm");

    const panButton = page.getByRole("button", { name: "Pan view" });
    const viewer = page.locator(".viewer");
    const canvas = page.locator(".scene-panel canvas");
    await panButton.click();
    await expect(panButton).toHaveAttribute("aria-pressed", "true");
    await expect(viewer).toHaveAttribute("data-interaction-mode", "pan");

    const orientationBefore = await page.locator(".orientation-cube").getAttribute("style");
    const before = await canvas.screenshot();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width / 2,
      canvasBox!.y + canvasBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width / 2 + 100,
      canvasBox!.y + canvasBox!.height / 2 + 55,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await canvas.screenshot();
    expect(countChangedPixels(before, after)).toBeGreaterThan(1_000);
    await expect(page.locator(".orientation-cube")).toHaveAttribute(
      "style",
      orientationBefore!,
    );
  });

  test("distinguishes desktop trackpad pan, pinch zoom, and mouse-wheel zoom", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=mm");

    const canvas = page.locator(".scene-panel canvas");
    const orientation = page.locator(".orientation-cube");
    const orientationBefore = await orientation.getAttribute("style");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width / 2,
      canvasBox!.y + canvasBox!.height / 2,
    );
    await page.evaluate(() => {
      const viewerCanvas = document.querySelector(".scene-panel canvas");
      viewerCanvas?.addEventListener("wheel", (event) => {
        viewerCanvas.setAttribute(
          "data-wheel-route",
          event.ctrlKey ? "pinch-zoom" : "mouse-wheel-zoom",
        );
      });
    });

    const beforeTrackpadPan = await canvas.screenshot();
    await page.mouse.wheel(12, 8);
    await page.waitForTimeout(300);
    const afterTrackpadPan = await canvas.screenshot();
    expect(countChangedPixels(beforeTrackpadPan, afterTrackpadPan)).toBeGreaterThan(
      500,
    );
    await expect(canvas).not.toHaveAttribute("data-wheel-route");
    await expect(orientation).toHaveAttribute("style", orientationBefore!);

    await page.getByRole("button", { name: "Center view" }).click();
    await page.waitForTimeout(300);
    const beforePinchZoom = await canvas.screenshot();
    await canvas.evaluate((element) => {
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY: -24,
        }),
      );
    });
    await page.waitForTimeout(300);
    const afterPinchZoom = await canvas.screenshot();
    expect(countChangedPixels(beforePinchZoom, afterPinchZoom)).toBeGreaterThan(
      500,
    );
    await expect(canvas).toHaveAttribute("data-wheel-route", "pinch-zoom");
    await expect(orientation).toHaveAttribute("style", orientationBefore!);

    await page.getByRole("button", { name: "Center view" }).click();
    await canvas.evaluate((element) => element.removeAttribute("data-wheel-route"));
    await page.mouse.move(
      canvasBox!.x + canvasBox!.width / 2,
      canvasBox!.y + canvasBox!.height / 2,
    );
    await page.mouse.wheel(0, 100);
    await expect(canvas).toHaveAttribute("data-wheel-route", "mouse-wheel-zoom");
  });

  test("pans with a one-finger drag on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReady(page, "/?model=japandi-tray&unit=mm");

    const panButton = page.getByRole("button", { name: "Pan view" });
    const canvas = page.locator(".scene-panel canvas");
    await panButton.click();
    await expect(panButton).toHaveAttribute("aria-pressed", "true");

    const orientationBefore = await page.locator(".orientation-cube").getAttribute("style");
    const before = await canvas.screenshot();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const start = {
      x: Math.round(canvasBox!.x + canvasBox!.width * 0.58),
      y: Math.round(canvasBox!.y + canvasBox!.height * 0.48),
    };
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    });
    for (let step = 1; step <= 8; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            id: 1,
            x: start.x - step * 10,
            y: start.y + step * 6,
          },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(300);

    const after = await canvas.screenshot();
    expect(countChangedPixels(before, after)).toBeGreaterThan(500);
    await expect(page.locator(".orientation-cube")).toHaveAttribute(
      "style",
      orientationBefore!,
    );
  });

  test("exports the active generated STL with a parameterized file name", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&length=210&width=120&height=28");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      openActions(page).then(() =>
        page.getByRole("button", { name: "Export" }).click(),
      ),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^japandi-tray-length-210\.0-width-120\.0-height-28\.0-floorThickness-2\.6-ribRelief-1\.0-rotation-0\.0\.stl$/,
    );
  });

  test("exports a manifold paper towel holder STL for slicers", async ({
    page,
  }) => {
    await openReady(
      page,
      "/?model=paper-towel-holder&height=254&diameter=152.4&tubeDiameter=28.6",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      openActions(page).then(() =>
        page.getByRole("button", { name: "Export" }).click(),
      ),
    ]);

    expect(download.suggestedFilename()).toBe(
      "paper-towel-holder-height-254.0-diameter-152.4-tubeDiameter-28.6.stl",
    );

    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const topology = analyzeStlTopology(downloadPath!);

    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
  });

  test("renders and exports the parametric door lock adapter", async ({ page }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=door-lock-adapter&unit=mm");

      await expect(
        page.getByRole("heading", { name: "Door Lock Adapter" }),
      ).toBeVisible();
      for (const [label, value] of [
        ["Tube diameter in millimeters", "9.3"],
        ["Tube length in millimeters", "23.0"],
        ["Box width in millimeters", "10.3"],
        ["Box length in millimeters", "10.9"],
        ["Triangle notch height in millimeters", "1.5"],
        ["Triangle notch width in millimeters", "4.0"],
        ["Triangle notch length in millimeters", "10.9"],
        ["Inner cutout width in millimeters", "3.0"],
        ["Inner cutout length in millimeters", "7.3"],
      ]) {
        await expect(page.getByLabel(label)).toHaveValue(value);
      }
      const cutoutRotation = page.getByLabel(
        "Inner cutout rotation in degrees",
      );
      await expect(cutoutRotation).toHaveValue("90");

      const notchHeight = page.getByLabel(
        "Triangle notch height in millimeters",
      );
      await notchHeight.fill("2");
      await notchHeight.blur();
      await expect(notchHeight).toHaveValue("2.0");
      await expect(page).toHaveURL(/notchHeight=2/);
      await cutoutRotation.fill("45");
      await cutoutRotation.blur();
      await expect(cutoutRotation).toHaveValue("45");
      await expect(page).toHaveURL(/cutoutRotation=45/);
      await expectCanvasHasRenderedModel(page);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        openActions(page).then(() =>
          page.getByRole("button", { name: "Export", exact: true }).click(),
        ),
      ]);
      expect(download.suggestedFilename()).toMatch(
        /^door-lock-adapter-tubeDiameter-9\.3-tubeLength-23\.0-boxWidth-10\.3-boxLength-10\.9-notchHeight-2\.0-notchWidth-4\.0-notchLength-10\.9-cutoutWidth-3\.0-cutoutLength-7\.3-cutoutRotation-45\.0\.stl$/,
      );
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const topology = analyzeStlTopology(downloadPath!);
      expect(topology.finiteCoordinates).toBe(true);
      expect(topology.degenerateTriangles).toBe(0);
      expect(topology.nonManifoldEdges).toBe(0);
      expect(topology.size.x).toBeCloseTo(10.3, 1);
      expect(topology.size.y).toBeCloseTo(12.3, 1);
      expect(topology.size.z).toBeCloseTo(23, 1);
    });
  });

  test("renders and exports a finite manifold simple box with editable dividers", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=simple-box&unit=in");

      await expect(page.getByRole("heading", { name: "Simple Box" })).toBeVisible();
      await expect(page.getByLabel("Box length in inches")).toHaveValue("13");
      await expect(page.getByLabel("Box width in inches")).toHaveValue("3");
      await expect(page.getByLabel("Box height in inches")).toHaveValue("3 1/2");
      await expect(page.getByLabel("Stacking fit clearance in inches")).toHaveValue("0.014");
      await expect(page.getByLabel("Rib relief in inches")).toHaveCount(0);
      await expect(page.getByLabel("Divider 1 position in inches")).toHaveValue("5 3/4");
      await expect(page.getByLabel("Divider 2 position in inches")).toHaveValue("9");
      await expect(page.getByLabel("Gridfinity compatibility")).not.toBeChecked();
      await page
        .locator("label.toggle-control", { hasText: "Gridfinity compatibility" })
        .click();
      await expect(page.getByLabel("Gridfinity compatibility")).toBeChecked();
      await expect(
        page.getByText("8 × 2 units · 42 mm pitch · standard base + stacking rim"),
      ).toBeVisible();
      await expect(page.getByLabel("Box length in inches")).toHaveValue("13 1/4");
      await expect(page.getByLabel("Box width in inches")).toHaveValue("3 1/4");
      const [gridfinityDownload] = await Promise.all([
        page.waitForEvent("download"),
        openActions(page).then(() =>
          page.getByRole("button", { name: "Export", exact: true }).click(),
        ),
      ]);
      const gridfinityPath = await gridfinityDownload.path();
      expect(gridfinityPath).not.toBeNull();
      const gridfinityTopology = analyzeStlTopology(gridfinityPath!);
      expect(gridfinityTopology.finiteCoordinates).toBe(true);
      expect(gridfinityTopology.degenerateTriangles).toBe(0);
      expect(gridfinityTopology.nonManifoldEdges).toBe(0);
      expect(gridfinityTopology.size.x).toBeCloseTo(335.5, 1);
      expect(gridfinityTopology.size.y).toBeCloseTo(83.5, 1);
      expect(gridfinityTopology.size.z).toBeCloseTo(98.05, 1);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Stacked pair" })).toBeVisible();
      await page.getByRole("button", { name: "Stacked pair" }).click();
      await expect(page.getByRole("button", { name: "Stacked pair" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expectCanvasHasRenderedModel(page);
      await page.getByRole("button", { name: "Fitted lid" }).click();
      await expect(page.getByRole("button", { name: "Fitted lid" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expectCanvasHasRenderedModel(page);
      await page.getByRole("button", { name: "Print layout" }).click();
      await expect(page.getByRole("button", { name: "Print layout" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expectCanvasHasRenderedModel(page);

      await page.getByRole("button", { name: "Remove divider 1" }).click();
      await expect(page.getByLabel("Divider 1 position in inches")).toHaveValue("9");
      await page.getByRole("button", { name: "Add divider" }).click();
      await expect(page.getByLabel("Divider 2 position in inches")).toHaveValue("10");

      await page.getByRole("button", { name: "Reset parameters" }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        openActions(page).then(() =>
          page.getByRole("button", { name: "Export", exact: true }).click(),
        ),
      ]);
      expect(download.suggestedFilename()).toMatch(/^simple-box-/);
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const topology = analyzeStlTopology(downloadPath!);
      expect(topology.finiteCoordinates).toBe(true);
      expect(topology.degenerateTriangles).toBe(0);
      expect(topology.nonManifoldEdges).toBe(0);
      expect(topology.buildPlateContactArea).toBeGreaterThan(20_000);
      expect(topology.triangles).toBeGreaterThan(40);
      expect(topology.size.x).toBeCloseTo(330.2, 1);
      expect(topology.size.y).toBeCloseTo(76.2, 1);
      expect(topology.size.z).toBeGreaterThan(91.5);
      expect(topology.size.z).toBeLessThan(92);

      const [lidDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Export lid" }).click(),
      ]);
      expect(lidDownload.suggestedFilename()).toBe(
        "simple-box-lid-length-330.2-width-76.2.stl",
      );
      const lidPath = await lidDownload.path();
      expect(lidPath).not.toBeNull();
      const lidTopology = analyzeStlTopology(lidPath!);
      expect(lidTopology.finiteCoordinates).toBe(true);
      expect(lidTopology.degenerateTriangles).toBe(0);
      expect(lidTopology.nonManifoldEdges).toBe(0);
      expect(lidTopology.size.x).toBeCloseTo(330.2, 1);
      expect(lidTopology.size.y).toBeCloseTo(76.2, 1);
      expect(lidTopology.size.z).toBeCloseTo(5.2, 1);
      expect(lidTopology.minZ).toBeCloseTo(0, 3);

      const [combinedDownload] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Export box + lid" }).click(),
      ]);
      expect(combinedDownload.suggestedFilename()).toBe(
        "simple-box-box-and-lid-length-330.2-width-76.2.stl",
      );
      const combinedPath = await combinedDownload.path();
      expect(combinedPath).not.toBeNull();
      const combinedTopology = analyzeStlTopology(combinedPath!);
      expect(combinedTopology.finiteCoordinates).toBe(true);
      expect(combinedTopology.degenerateTriangles).toBe(0);
      expect(combinedTopology.nonManifoldEdges).toBe(0);
      expect(combinedTopology.buildPlateContactArea).toBeGreaterThan(20_000);
      expect(combinedTopology.size.x).toBeCloseTo(330.2, 1);
      expect(combinedTopology.size.y).toBeCloseTo(162.4, 1);
      expect(combinedTopology.size.z).toBeGreaterThan(91.5);
      expect(combinedTopology.size.z).toBeLessThan(92);
      expect(combinedTopology.minZ).toBeCloseTo(0, 3);
    });
  });

  test("resizes and collapses the model library and inspector sidebars", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray");

    const library = page.getByRole("complementary", { name: "Workspace model library" });
    const scene = page.getByLabel("Japandi Tray model viewer");
    const librarySeparator = page.getByRole("separator", { name: "Resize model library" });
    const libraryBefore = (await library.boundingBox())?.width ?? 0;
    const sceneBeforeLibraryCollapse = (await scene.boundingBox())?.width ?? 0;
    const librarySeparatorBox = await librarySeparator.boundingBox();
    expect(librarySeparatorBox).not.toBeNull();

    await page.mouse.move(librarySeparatorBox!.x + 2, librarySeparatorBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(librarySeparatorBox!.x + 80, librarySeparatorBox!.y + 80, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await library.boundingBox())?.width ?? 0)
      .toBeGreaterThan(libraryBefore + 40);
    await expect
      .poll(async () =>
        Number(await page.evaluate(() => window.localStorage.getItem("3d-prints:library-sidebar-width"))),
      )
      .toBeGreaterThan(libraryBefore + 40);

    await librarySeparator.focus();
    await page.keyboard.press("Home");
    await expect(librarySeparator).toHaveAttribute("aria-valuenow", "280");
    await page.keyboard.press("End");
    await expect(librarySeparator).toHaveAttribute("aria-valuenow", "460");

    await page.getByRole("button", { name: "Collapse model library" }).click();
    await expect(page.getByRole("button", { name: "Expand model library" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize model library" })).toBeHidden();
    await expect
      .poll(async () => (await scene.boundingBox())?.width ?? 0)
      .toBeGreaterThan(sceneBeforeLibraryCollapse);
    await expectCanvasHasRenderedModel(page);
    await page.getByRole("button", { name: "Expand model library" }).click();
    await expect(page.getByRole("button", { name: "Collapse model library" })).toBeVisible();

    const inspector = page.getByRole("complementary", { name: "Parameters and audit" });
    const separator = page.getByRole("separator", { name: "Resize inspector" });
    const before = (await inspector.boundingBox())?.width ?? 0;
    const separatorBox = await separator.boundingBox();
    expect(separatorBox).not.toBeNull();

    await page.mouse.move(separatorBox!.x + 4, separatorBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(separatorBox!.x - 120, separatorBox!.y + 80, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await inspector.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before + 70);
    await expect
      .poll(async () =>
        Number(await page.evaluate(() => window.localStorage.getItem("3d-prints:sidebar-width"))),
      )
      .toBeGreaterThan(before + 70);

    await separator.focus();
    await page.keyboard.press("End");
    await expect(separator).toHaveAttribute("aria-valuenow", "320");
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "620");

    const sceneBeforeInspectorCollapse = (await scene.boundingBox())?.width ?? 0;
    await page.getByRole("button", { name: "Collapse inspector" }).click();
    await expect(page.getByRole("button", { name: "Expand inspector" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize inspector" })).toBeHidden();
    await expect
      .poll(async () => (await scene.boundingBox())?.width ?? 0)
      .toBeGreaterThan(sceneBeforeInspectorCollapse);
    await expectCanvasHasRenderedModel(page);
    await page.getByRole("button", { name: "Expand inspector" }).click();
    await expect(page.getByRole("button", { name: "Collapse inspector" })).toBeVisible();
  });

  test("renders the model viewer and inspector on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setStoredTheme(page, "dark");
    await page.goto("/?model=japandi-tray&unit=in");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize model library" })).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize inspector" })).toBeHidden();
    await expectCanvasHasRenderedModel(page);
  });

  test("saves and forks through the actions menu, then lists selected-model versions", async ({
    page,
  }) => {
    test.skip(
      !process.env.VITE_CONVEX_URL,
      "Set VITE_CONVEX_URL to run live Convex persistence coverage.",
    );

    await openReady(page, "/?model=japandi-tray");

    const title = `${PLAYWRIGHT_TEST_VERSION_PREFIX}${Date.now()}`;
    const forkTitle = `${title} fork`;
    try {
      await openActions(page);
      await expect(
        page.getByRole("button", { name: "Save current version" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Fork current version" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Fork current version" }).click();
      await page.getByLabel("Version name").fill(forkTitle);
      await page.getByRole("button", { name: "Fork version" }).click();
      await expect(page.getByRole("status")).toContainText("Fork saved.");
      await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();

      await expect(
        page.getByRole("button", { name: "Save current version" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Fork current version" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Save current version" }).click();
      await page.getByLabel("Version name").fill(title);
      await page.getByRole("button", { name: "Save version" }).click();
      await expect(page.getByRole("status")).toContainText("Version saved.");

      await page.getByRole("button", { name: "Saved Versions" }).click();
      await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Open ${forkTitle}` })).toHaveCount(0);
      await expect(page.getByLabel("Upload STL")).toHaveCount(0);

      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.locator(".workspace-title-context")).toHaveCount(0);
      await expect(page).toHaveURL(/model=japandi-tray/);
      if (
        !(await page
          .getByRole("button", { name: "Save current version" })
          .isVisible())
      ) {
        await openActions(page);
      }
      await expect(page.getByRole("button", { name: "Save current version" })).toBeVisible();
    } finally {
      await cleanupPlaywrightVersions([title, forkTitle]);
    }
  });
});

import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

async function checkStl(file: string, expectedZ: number) {
  const data = await fs.readFile(file),
    count = data.readUInt32LE(80);
  expect(data.length).toBe(84 + count * 50);
  let minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < count; i++)
    for (let j = 0; j < 3; j++) {
      const z = data.readFloatLE(84 + i * 50 + 12 + j * 12 + 8);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  expect(minZ).toBeCloseTo(0, 4);
  expect(maxZ).toBeCloseTo(expectedZ, 3);
}

test("opens Lee from library, shows selected default dimensions and real colored geometry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("Ignored an invalid model"))
      errors.push(m.text());
  });
  await page.goto("/?model=dining-table&unit=in&quality=standard");
  await page.getByRole("button", { name: "Jig Library", exact: true }).click();
  await page.getByRole("button", { name: "Open Lee Step Stool" }).click();
  await expect(
    page.getByRole("heading", { name: "Lee Step Stool", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Lee Step Stool model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(
    page.getByLabel("Top length in inches", { exact: true }),
  ).toHaveValue("13");
  await expect(
    page.getByLabel("Top width in inches", { exact: true }),
  ).toHaveValue("9");
  await expect(
    page.getByLabel("Top thickness in inches", { exact: true }),
  ).toHaveValue("1 1/2");
  await expect(
    page.getByLabel("Leg clearance in inches", { exact: true }),
  ).toHaveValue("6 1/4");
  await page.screenshot({ path: ".playwright/lee-stool-assembled.png" });
  await page.getByText("Assembly & exports", { exact: true }).click();
  await page
    .getByRole("button", { name: "Lift letters & separate legs" })
    .click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await page.screenshot({ path: ".playwright/lee-stool-exploded.png" });
  await page.getByRole("button", { name: "Assemble stool" }).click();
  await page.getByLabel("Top length in inches", { exact: true }).fill("14");
  await page.getByLabel("Top length in inches", { exact: true }).blur();
  await expect(page).toHaveURL(/length=14(&|$)/);
  await page.reload();
  await expect(
    page.getByLabel("Top length in inches", { exact: true }),
  ).toHaveValue("14");
  expect(errors).toEqual([]);
});

test("couples pocket depth to floor stock and downloads actual parts and full-size template", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/?model=lee-step-stool&unit=mm&quality=standard&topThickness=31.75&letterDepth=38.1&edgeRoundover=3.175",
  );
  await expect(
    page.getByLabel("Letter and pocket depth in millimeters", { exact: true }),
  ).toHaveValue("25.4");
  await page.getByText("Assembly & exports", { exact: true }).click();
  await page
    .getByRole("button", { name: "Lift letters & separate legs" })
    .click();
  const partDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Letter L STL", exact: true })
    .click();
  const part = await partDownload;
  const partFile = testInfo.outputPath("letter.stl");
  await part.saveAs(partFile);
  await checkStl(partFile, 25.4);
  const templateDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full-size layout SVG" })
    .click();
  const template = await templateDownload;
  const templateFile = testInfo.outputPath("layout.svg");
  await template.saveAs(templateFile);
  const svg = await fs.readFile(templateFile, "utf8");
  expect(svg).toContain('width="330.2mm"');
  expect(svg).toContain('height="228.6mm"');
  expect(svg.match(/<circle /g)).toHaveLength(4);
  await page
    .getByRole("button", { name: "Workspace actions", exact: true })
    .click();
  const assembledDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const assembled = await assembledDownload;
  const assembledFile = testInfo.outputPath("assembled.stl");
  await assembled.saveAs(assembledFile);
  await checkStl(assembledFile, 190.5);
});

test("renders on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?model=lee-step-stool&unit=in&quality=standard");
  await expect(
    page.getByRole("heading", { name: "Lee Step Stool", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: ".playwright/lee-stool-mobile.png" });
});

test("keeps fine fit clearances and furniture rendering controls", async ({
  page,
}) => {
  await page.goto("/?model=lee-step-stool&unit=mm&quality=high");
  await expect(page.getByTestId("viewer-status")).toContainText("High render");
  const clearance = page.getByLabel(
    "Letter clearance per side in millimeters",
    { exact: true },
  );
  await expect(clearance).toHaveValue("0.96");
  await clearance.fill("0.45");
  await clearance.blur();
  await expect(page).toHaveURL(/letterClearance=0.45(&|$)/);
  await page.reload();
  await expect(clearance).toHaveValue("0.45");
  await page
    .getByRole("button", { name: "Workspace actions", exact: true })
    .click();
  await expect(page.getByLabel("Rendering quality")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Photo", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Wire", exact: true }).click();
  await expect(page.getByTestId("viewer-status")).toContainText("Wire");
});

test("edits rounded letter layout independently and uses shorter thicker leg presets", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("Ignored an invalid model"))
      errors.push(message.text());
  });
  await page.goto("/?model=lee-step-stool&unit=in&quality=standard");
  const height = page.getByLabel("Letter height in inches", { exact: true });
  const width = page.getByLabel("Letter width in inches", { exact: true });
  const gap = page.getByLabel("Horizontal letter gap in inches", {
    exact: true,
  });
  await expect(height).toHaveValue("3 1/4");
  await expect(width).toHaveValue("2");
  await expect(gap).toHaveValue("1");
  await expect(height).toBeInViewport();
  await expect(gap).toBeInViewport();
  await height.fill("3");
  await height.blur();
  await width.fill("2.25");
  await width.blur();
  await gap.fill("0.75");
  await gap.blur();
  await expect(height).toHaveValue("3");
  await expect(width).toHaveValue("2 1/4");
  await expect(gap).toHaveValue("3/4");
  await page
    .getByRole("group", { name: "Leg clearance presets" })
    .getByRole("button", { name: "5″", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Leg diameter presets" })
    .getByRole("button", { name: "2″", exact: true })
    .click();
  await expect(
    page.getByLabel("Leg clearance in inches", { exact: true }),
  ).toHaveValue("5");
  await expect(
    page.getByLabel("Leg diameter in inches", { exact: true }),
  ).toHaveValue("2");
  await expect(height).toHaveValue("3");
  await expect(width).toHaveValue("2 1/4");
  await page.reload();
  await expect(
    page.getByLabel("Leg diameter in inches", { exact: true }),
  ).toHaveValue("2");
  await expect(gap).toHaveValue("3/4");
  await page.screenshot({
    path: ".playwright/lee-stool-rounded-short-legs.png",
  });
  expect(errors).toEqual([]);
});

test("explains fit clearances and persists values above the former limits", async ({
  page,
}) => {
  await page.goto("/?model=lee-step-stool&unit=mm");
  await expect(page.getByTestId("viewer-status")).toContainText("High render");
  const letter = page.getByLabel("Letter clearance per side in millimeters", {
    exact: true,
  });
  const socket = page.getByLabel(
    "Leg socket clearance per side in millimeters",
    { exact: true },
  );
  await expect(socket).toHaveValue("0.50");
  await expect(
    page.getByLabel("Letter clearance per side", { exact: true }),
  ).toHaveAttribute("max", "3.175");
  await expect(
    page.getByLabel("Leg socket clearance per side", { exact: true }),
  ).toHaveAttribute("max", "1.5875");
  const letterInfo = page.getByRole("button", {
    name: "About letter clearance per side",
    exact: true,
  });
  await letterInfo.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "the letter size stays the same",
  );
  await page.screenshot({
    path: ".playwright/lee-stool-clearance-tooltip.png",
  });
  await letter.fill("3");
  await letter.blur();
  await socket.fill("1.5");
  await socket.blur();
  await page.reload();
  await expect(letter).toHaveValue("3.00");
  await expect(socket).toHaveValue("1.50");
  // Exercise actual keyboard navigation after the field has scrolled into view.
  await socket.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", {
      name: "About leg socket clearance per side",
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText(
    "leg diameter plus twice this value",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("keeps independent upper roundovers, thumb presets and actual export profiles", async ({
  page,
}, testInfo) => {
  await page.goto("/?model=lee-step-stool&unit=mm&quality=high");
  const letter = page.getByLabel("Letter top roundover in millimeters", {
    exact: true,
  });
  const pocket = page.getByLabel("Pocket rim roundover in millimeters", {
    exact: true,
  });
  await expect(letter).toHaveValue("1.6");
  await expect(pocket).toHaveValue("1.6");
  await letter.fill("2");
  await letter.blur();
  await pocket.fill("1");
  await pocket.blur();
  await expect(
    page.getByLabel("Letter clearance per side in millimeters", {
      exact: true,
    }),
  ).toHaveValue("0.96");
  await page
    .getByRole("group", { name: "Thumb access presets" })
    .getByRole("button", { name: "Shared ½″" })
    .click();
  await expect(
    page.getByLabel("Finger well radius in millimeters", { exact: true }),
  ).toHaveValue("12.7");
  await page.reload();
  await expect(letter).toHaveValue("2.0");
  await expect(pocket).toHaveValue("1.0");
  await expect(page).toHaveURL(/letterRoundover=2(&|$)/);
  await expect(page).toHaveURL(/pocketRoundover=1(&|$)/);
  await expect(
    page
      .getByRole("group", { name: "Thumb access presets" })
      .getByRole("button", { name: "Roomy ⅝″" }),
  ).toBeDisabled();
  await page.locator(".lee-stool-access-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".playwright/lee-stool-edge-controls.png" });
  await page.getByText("Assembly & exports", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Letter L STL", exact: true })
    .click();
  const file = testInfo.outputPath("rounded-letter.stl");
  await (await download).saveAs(file);
  await checkStl(file, 19.05);
  const data = await fs.readFile(file);
  const xs: number[] = [],
    topXs: number[] = [],
    zs = new Set<number>();
  for (let i = 0; i < data.readUInt32LE(80); i++)
    for (let j = 0; j < 3; j++) {
      const x = data.readFloatLE(84 + i * 50 + 12 + j * 12),
        z = data.readFloatLE(84 + i * 50 + 12 + j * 12 + 8);
      xs.push(x);
      zs.add(Number(z.toFixed(3)));
      if (Math.abs(z - 19.05) < 0.0001) topXs.push(x);
    }
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(50.8, 3);
  expect(Math.max(...topXs) - Math.min(...topXs)).toBeCloseTo(46.8, 3);
  expect(zs.size).toBeGreaterThan(5);
  const svgDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full-size layout SVG" })
    .click();
  const svgFile = testInfo.outputPath("rounded-layout.svg");
  await (await svgDownload).saveAs(svgFile);
  expect(await fs.readFile(svgFile, "utf8")).toContain(
    'stroke-dasharray="2 1"',
  );
  await page
    .getByRole("button", { name: "Lift letters & separate legs" })
    .click();
  await page.screenshot({
    path: ".playwright/lee-stool-rounded-edges-exploded.png",
  });
  await page
    .getByRole("button", { name: "Open Plate Table", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Plate Table", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/(?:letterRoundover|pocketRoundover)=/);
});

test("exports the half-thickness CNC upper lamination with through cuts or a blind floor", async ({
  page,
}, testInfo) => {
  await page.goto("/?model=lee-step-stool&unit=in&quality=standard");
  await page.getByText("Assembly & exports", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upper lamination · CNC" }),
  ).toBeVisible();
  const cnc = page.locator(".lee-stool-cnc-export");
  await expect(cnc).toContainText("13 in × 9 in × 3/4 in stock");
  await expect(cnc).toContainText(
    "Letter pockets and leg sockets cut through this layer",
  );
  await page
    .getByRole("button", { name: "Lift letters & separate legs" })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export upper lamination CNC STL" })
    .click();
  const stl = await download;
  expect(stl.suggestedFilename()).toBe(
    "lee-step-stool-top-upper-lamination-cnc.stl",
  );
  const file = testInfo.outputPath("upper-lamination.stl");
  await stl.saveAs(file);
  await checkStl(file, 19.05);
  expect(await fs.readFile(file)).toEqual(
    await fs.readFile(
      "public/models/lee-step-stool/lee-step-stool-top-upper-lamination-cnc.stl",
    ),
  );
  await cnc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".playwright/lee-stool-cnc-export.png" });
  await page.getByRole("button", { name: "Assemble stool" }).click();
  await page
    .getByLabel("Letter and pocket depth in inches", { exact: true })
    .fill("0.5");
  await page
    .getByLabel("Letter and pocket depth in inches", { exact: true })
    .blur();
  await expect(cnc).toContainText("Letter pockets are 1/2 in deep");
  await page
    .getByLabel("Letter and pocket depth in inches", { exact: true })
    .fill("1");
  await page
    .getByLabel("Letter and pocket depth in inches", { exact: true })
    .blur();
  await expect(cnc).toContainText(
    "lower layer also needs 1/4 in of pocket depth",
  );
});

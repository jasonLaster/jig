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

test("opens Lee from library, shows source dimensions and real colored geometry", async ({
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
  ).toHaveValue("12 1/2");
  await expect(
    page.getByLabel("Top width in inches", { exact: true }),
  ).toHaveValue("9 1/2");
  await expect(
    page.getByLabel("Top thickness in inches", { exact: true }),
  ).toHaveValue("1 1/2");
  await expect(
    page.getByLabel("Exposed leg height in inches", { exact: true }),
  ).toHaveValue("7 1/2");
  await page.screenshot({ path: ".playwright/lee-stool-assembled.png" });
  await page
    .getByRole("button", { name: "Lift letters & separate legs" })
    .click();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await page.screenshot({ path: ".playwright/lee-stool-exploded.png" });
  await page.getByRole("button", { name: "Assemble stool" }).click();
  await page.getByLabel("Top length in inches", { exact: true }).fill("13");
  await page.getByLabel("Top length in inches", { exact: true }).blur();
  await expect(page).toHaveURL(/length=13(&|$)/);
  await page.reload();
  await expect(
    page.getByLabel("Top length in inches", { exact: true }),
  ).toHaveValue("13");
  expect(errors).toEqual([]);
});

test("couples pocket depth to floor stock and downloads actual parts and full-size template", async ({
  page,
}, testInfo) => {
  await page.goto(
    "/?model=lee-step-stool&unit=mm&quality=standard&topThickness=31.75&letterDepth=38.1",
  );
  await expect(
    page.getByLabel("Letter and pocket depth in millimeters", { exact: true }),
  ).toHaveValue("25.4");
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
  expect(svg).toContain('width="317.5mm"');
  expect(svg).toContain('height="241.3mm"');
  expect(svg.match(/<circle /g)).toHaveLength(4);
  await page
    .getByRole("button", { name: "Workspace actions", exact: true })
    .click();
  const assembledDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const assembled = await assembledDownload;
  const assembledFile = testInfo.outputPath("assembled.stl");
  await assembled.saveAs(assembledFile);
  await checkStl(assembledFile, 222.25);
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
  await expect(clearance).toHaveValue("0.35");
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

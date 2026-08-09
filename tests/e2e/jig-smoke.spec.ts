import { expect, test } from "@playwright/test";

const WOODWORKING_MODELS = [
  "Plate Table",
  "Whisperer",
  "X-Hover Dining Table",
  "The Wave",
] as const;

test("opens Jig on the woodworking catalog and keeps legacy print models out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page).toHaveTitle("Jig — Woodworking Models");
  await expect(page).toHaveURL(/model=dining-table/);
  await expect(page).toHaveURL(/unit=in/);
  await expect(page.getByRole("heading", { name: "Plate Table" })).toBeVisible();
  await expect(page.getByLabel("Plate Table model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await page.getByRole("button", { name: "Jig Library", exact: true }).click();

  for (const model of WOODWORKING_MODELS) {
    await expect(page.getByRole("button", { name: `Open ${model}` })).toBeVisible();
  }

  for (const legacyModel of [
    "Paper Towel Holder",
    "Japandi Tray",
    "Simple Box",
    "Door Lock Adapter",
    "Concentric Tube Jig",
  ]) {
    await expect(
      page.getByRole("button", { name: `Open ${legacyModel}` }),
    ).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test("opens every woodworking model through the Jig library", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?model=dining-table&unit=in");

  for (const model of WOODWORKING_MODELS.slice(1)) {
    await page.getByRole("button", { name: "Jig Library", exact: true }).click();
    await page.getByRole("button", { name: `Open ${model}` }).click();
    await expect(page.getByRole("heading", { name: model })).toBeVisible();
    await expect(page.getByLabel(`${model} model viewer`)).toBeVisible();
    await expect(page.locator(".scene-panel canvas")).toBeVisible();
  }
});

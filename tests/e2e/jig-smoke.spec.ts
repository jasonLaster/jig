import { expect, test } from "@playwright/test";
import { getWoodSpeciesForModel } from "../../src/woodTexture";

const WOODWORKING_MODELS = [
  { id: "dining-table", name: "Plate Table" },
  { id: "whisperer", name: "Whisperer" },
  { id: "hover-dining-table", name: "X-Hover Dining Table" },
  { id: "wave-dining-table", name: "The Wave" },
] as const;

test("classifies every Jig furniture model for oak rendering", () => {
  for (const model of WOODWORKING_MODELS) {
    expect(getWoodSpeciesForModel(model.id), model.name).toBe("oak");
  }
});

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
    await expect(
      page.getByRole("button", { name: `Open ${model.name}` }),
    ).toBeVisible();
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
    await page.getByRole("button", { name: `Open ${model.name}` }).click();
    await expect(page.getByRole("heading", { name: model.name })).toBeVisible();
    await expect(page.getByLabel(`${model.name} model viewer`)).toBeVisible();
    await expect(page.locator(".scene-panel canvas")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Jig Library", exact: true }),
    ).toHaveClass(/active/);
    await expect(
      page.getByRole("button", { name: "Design checks", exact: true }),
    ).not.toHaveClass(/active/);
    await expect(
      page.getByRole("button", { name: `Open ${model.name}` }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("offers high-fidelity oak rendering on every furniture model", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const model of WOODWORKING_MODELS) {
    await page.goto(`/?model=${model.id}&unit=in`);
    await expect(page.getByRole("heading", { name: model.name })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText("High render");
    await expect(page).toHaveURL(/quality=high/);
    await page.getByRole("button", { name: "Workspace actions" }).click();
    await expect(page.getByLabel("Rendering quality")).toBeVisible();
  }
});

import { expect, test, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDiningTableStructuralAssessment,
} from "../../src/models/diningTable";
import { getDefaultParams } from "../../src/models/shared";
import { getVinnyTableCutList } from "../../src/models/vinnyTable";
import type { DiningTableModelDefinition } from "../../src/models/types";
import { getWoodSpeciesForModel } from "../../src/woodTexture";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/vinny-table/model.json"), "utf8"),
) as DiningTableModelDefinition;

test("builds the plan-derived advanced Vinny envelope and member set", () => {
  const params = getDefaultParams(model);
  const geometry = createDiningTableWoodGeometry(params, model);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const parts = geometry.userData.woodGrainParts as Array<{
    direction: [number, number, number];
    name: string;
    vertexCount: number;
    vertexStart: number;
  }>;

  expect(getWoodSpeciesForModel(model.id)).toBe("oak");
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(243.84, 2);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(101.6, 2);
  expect(bounds.max.z).toBeCloseTo(76.2, 2);
  expect(bounds.min.z).toBeCloseTo(1.27, 3);
  expect(parts.map((part) => part.name)).toEqual([
    "tabletop",
    "leg-left-front",
    "leg-left-rear",
    "leg-right-front",
    "leg-right-rear",
    "long-apron-front",
    "long-apron-rear",
    "side-apron-left",
    "side-apron-right",
    "stretcher-left",
    "stretcher-center",
    "stretcher-right",
  ]);
  expect(parts[0].direction).toEqual([1, 0, 0]);
  expect(parts.slice(1, 5).every((part) => part.direction[2] === 1)).toBe(true);
  expect(parts.slice(5, 7).every((part) => part.direction[0] === 1)).toBe(true);
  expect(parts.slice(7).every((part) => Math.abs(part.direction[1]) === 1)).toBe(true);
  expect(parts.reduce((total, part) => total + part.vertexCount, 0)).toBe(
    geometry.getAttribute("position").count,
  );

  const hardware = createDiningTableHardwareGeometries(params);
  expect(hardware.plates).toEqual([]);
  expect(hardware.channels).toEqual([]);
  expect(hardware.feet).toHaveLength(4);
  for (const foot of hardware.feet) {
    foot.computeBoundingBox();
    expect(foot.boundingBox!.min.z).toBeCloseTo(0, 4);
    foot.dispose();
  }
  geometry.dispose();
});

test("derives the fabrication list and all documented style alternatives", () => {
  const params = getDefaultParams(model);
  const advanced = getVinnyTableCutList(params);
  expect(advanced.find((part) => part.id === "A1")).toMatchObject({ quantity: 8 });
  expect(advanced.find((part) => part.id === "A1")!.length).toBeCloseTo(28 * 25.4, 6);
  expect(advanced.find((part) => part.id === "B1")!.length).toBeCloseTo(84 * 25.4, 6);
  expect(advanced.find((part) => part.id === "B2")!.length).toBeCloseTo(28 * 25.4, 6);
  expect(advanced.find((part) => part.id === "B3")!.length).toBeCloseTo(37 * 25.4, 6);
  expect(
    getVinnyTableCutList({ ...params, levelingFeetEnabled: 0 }).find(
      (part) => part.id === "A1",
    )!.length,
  ).toBeCloseTo(28.5 * 25.4, 6);

  const intermediate = { ...params, legStyle: 1, topStyle: 1 };
  const intermediateParts = getVinnyTableCutList(intermediate);
  expect(intermediateParts.find((part) => part.id === "A1")).toMatchObject({
    name: "Double-tapered leg blanks",
    quantity: 4,
  });
  expect(intermediateParts.find((part) => part.id === "B1")!.length).toBeCloseTo(88 * 25.4, 6);
  expect(intermediateParts.find((part) => part.id === "B2")!.length).toBeCloseTo(32 * 25.4, 6);
  expect(intermediateParts.find((part) => part.id === "B3")!.length).toBeCloseTo(34.5 * 25.4, 6);

  for (const styleParams of [
    intermediate,
    { ...params, legStyle: 0 },
    { ...params, topStyle: 1 },
    { ...params, levelingFeetEnabled: 0 },
  ]) {
    const geometry = createDiningTableWoodGeometry(styleParams, model);
    const position = geometry.getAttribute("position");
    expect(
      Array.from({ length: position.count }, (_, index) =>
        [position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite),
      ).every(Boolean),
    ).toBe(true);
    geometry.dispose();
  }
});

test("screens the closed frame without presenting a certification", () => {
  const params = getDefaultParams(model);
  const baseline = getDiningTableStructuralAssessment(params);
  expect(baseline.metrics.map((metric) => metric.key)).toEqual([
    "longitudinal-racking",
    "end-box-racking",
    "torsion",
    "tipping",
    "floor-rocking",
    "member-stiffness",
  ]);
  expect(baseline.metrics.reduce((sum, metric) => sum + metric.calculation.weight, 0)).toBeCloseTo(1, 10);
  expect(baseline.basis).toBe("geometry-only screening");
  expect(
    getDiningTableStructuralAssessment({ ...params, overallHeight: params.overallHeight + 25.4 }).overallScore,
  ).toBeLessThan(baseline.overallScore);
  expect(
    getDiningTableStructuralAssessment({ ...params, levelingFeetEnabled: 0 })
      .metrics.find((metric) => metric.key === "floor-rocking")!.score,
  ).toBeLessThan(
    baseline.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  );
});

test("ships a finite binary seed STL at the default scale", () => {
  const buffer = fs.readFileSync(path.join(root, "public/models/vinny-table/vinny-table.stl"));
  const geometry = new STLLoader().parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(243.84, 2);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(101.6, 2);
  expect(bounds.max.z).toBeCloseTo(76.2, 2);
  geometry.dispose();
});

test("loads the live Vinny model and its parameter-driven cut sheet", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/?model=vinny-table&unit=in");
  await expect(page.getByRole("heading", { name: "Vinny Table" }).first()).toBeVisible();
  await expect(page.locator(".viewer canvas")).toBeVisible();
  await expect(page.getByText("Length 96 in", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Vinny leg style")).toContainText("Advanced");
  await expect(page.getByLabel("Vinny top style")).toContainText("Flush");

  await page.getByRole("button", { name: "Cut list" }).click();
  const cutList = page.getByTestId("vinny-cut-list");
  await expect(cutList).toBeVisible();
  await expect(cutList).toContainText("Advanced leg profile halves");
  await expect(cutList).toContainText("84 in");
  await expect(cutList).toContainText("37 in");

  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page.getByRole("button", { name: "Export two-color STLs" }).click();
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.map((download) => download.suggestedFilename()).sort()).toEqual([
    "vinny-table-scale-1-10-length-2438.4-width-1016.0-support-free-hardware-color-2.stl",
    "vinny-table-scale-1-10-length-2438.4-width-1016.0-support-free-wood-color-1.stl",
  ]);
  expect(consoleErrors).toEqual([]);
});

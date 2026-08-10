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
import type { DiningTableModelDefinition } from "../../src/models/types";
import { getWoodSpeciesForModel } from "../../src/woodTexture";
import { assignDirectionalWoodUvs } from "../../src/models/woodGrainUvs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/whisperer/model.json"), "utf8"),
) as DiningTableModelDefinition;

test("classifies the Whisperer as solid oak across its model surfaces", () => {
  expect(getWoodSpeciesForModel(model.id)).toBe("oak");
  expect(model.description).toContain("solid-oak");
});

test("maps oak grain along every Whisperer wood member", () => {
  const geometry = createDiningTableWoodGeometry(getDefaultParams(model), model);
  const parts = geometry.userData.woodGrainParts as Array<{
    direction: [number, number, number];
    name: string;
    vertexCount: number;
    vertexStart: number;
  }>;

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
  ]);
  expect(parts[0].direction).toEqual([1, 0, 0]);
  for (const leg of parts.slice(1, 5)) {
    expect(Math.abs(leg.direction[0])).toBeGreaterThan(0);
    expect(leg.direction[1]).toBeCloseTo(0, 8);
    expect(leg.direction[2]).toBeGreaterThan(0.9);
  }
  for (const apron of parts.slice(5, 7)) {
    expect(apron.direction).toEqual([1, 0, 0]);
  }
  for (const apron of parts.slice(7, 9)) {
    expect(apron.direction).toEqual([0, -1, 0]);
  }
  expect(
    parts.reduce((count, part) => count + part.vertexCount, 0),
  ).toBe(geometry.getAttribute("position").count);
  expect(parts.at(-1)!.vertexStart + parts.at(-1)!.vertexCount).toBe(
    geometry.getAttribute("position").count,
  );

  const sample = new THREE.BoxGeometry(10, 6, 4).toNonIndexed();
  assignDirectionalWoodUvs(sample, new THREE.Vector3(1, 0, 0), 10);
  const position = sample.getAttribute("position");
  const normal = sample.getAttribute("normal");
  const uv = sample.getAttribute("uv");
  for (let index = 0; index < position.count; index += 1) {
    expect(Number.isFinite(uv.getX(index))).toBe(true);
    expect(Number.isFinite(uv.getY(index))).toBe(true);
    if (Math.abs(normal.getZ(index)) > 0.99) {
      expect(uv.getX(index)).toBeCloseTo(position.getX(index) / 10, 6);
      expect(Math.abs(uv.getY(index))).toBeCloseTo(
        Math.abs(position.getY(index) / 10),
        6,
      );
    }
  }

  sample.dispose();
  geometry.dispose();
});

test("builds the Whisperer on four independent leveling feet", () => {
  const params = getDefaultParams(model);
  const geometry = createDiningTableWoodGeometry(params, model);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");

  expect(bounds.max.x - bounds.min.x).toBeCloseTo(182.88, 2);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(101.6, 2);
  expect(bounds.max.z).toBeCloseTo(76.2, 2);
  expect(bounds.min.z).toBeCloseTo(1.905, 3);
  expect(
    Array.from({ length: position.count }, (_, index) => [
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ]).flat().every(Number.isFinite),
  ).toBe(true);

  const hardware = createDiningTableHardwareGeometries(params);
  expect(hardware.plates).toEqual([]);
  expect(hardware.channels).toEqual([]);
  expect(hardware.feet).toHaveLength(4);
  const footCenters: string[] = [];
  for (const foot of hardware.feet) {
    foot.computeBoundingBox();
    const footBounds = foot.boundingBox!;
    expect(footBounds.min.z).toBeCloseTo(0, 4);
    expect(footBounds.max.z).toBeCloseTo(8.255, 3);
    footCenters.push(
      `${((footBounds.min.x + footBounds.max.x) / 2).toFixed(3)}:${((footBounds.min.y + footBounds.max.y) / 2).toFixed(3)}`,
    );
  }
  expect(new Set(footCenters).size).toBe(4);

  const directContactParams = { ...params, levelingFeetEnabled: 0 };
  const directContactWood = createDiningTableWoodGeometry(
    directContactParams,
    model,
  );
  directContactWood.computeBoundingBox();
  expect(directContactWood.boundingBox!.min.z).toBeCloseTo(0, 4);
  expect(
    directContactWood.boundingBox!.max.z -
      directContactWood.boundingBox!.min.z,
  ).toBeCloseTo(76.2, 2);
  expect(
    createDiningTableHardwareGeometries(directContactParams).feet,
  ).toEqual([]);
  hardware.feet.forEach((foot) => foot.dispose());
  directContactWood.dispose();
  geometry.dispose();
});

test("screens the Whisperer apron frame and responds to structural dimensions", () => {
  const params = getDefaultParams(model);
  const baseline = getDiningTableStructuralAssessment(params);
  const score = (
    assessment: ReturnType<typeof getDiningTableStructuralAssessment>,
    key: ReturnType<
      typeof getDiningTableStructuralAssessment
    >["metrics"][number]["key"],
  ) => assessment.metrics.find((metric) => metric.key === key)!.score;

  expect(baseline.metrics.map((metric) => metric.key)).toEqual([
    "longitudinal-racking",
    "end-box-racking",
    "torsion",
    "tipping",
    "floor-rocking",
    "member-stiffness",
  ]);
  expect(baseline.metrics.every((metric) =>
    Number.isFinite(metric.score) && metric.score >= 0 && metric.score <= 100,
  )).toBe(true);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(1, 10);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.score * metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(baseline.overallScore, 1);
  expect(baseline.overallCalculation.formula).toContain(
    "24% × Long-apron racking",
  );
  expect(baseline.heightSensitivity.lower?.delta).toBeGreaterThan(0);
  expect(baseline.heightSensitivity.higher?.delta).toBeLessThan(0);

  for (const metric of baseline.metrics) {
    expect(metric.calculation.rationale.length, metric.key).toBeGreaterThan(40);
    expect(metric.calculation.formula.length, metric.key).toBeGreaterThan(20);
    expect(metric.calculation.inputs.length, metric.key).toBeGreaterThanOrEqual(5);
    expect(
      new Set(metric.calculation.inputs.map((input) => input.key)).size,
      metric.key,
    ).toBe(metric.calculation.inputs.length);
  }

  const taller = getDiningTableStructuralAssessment({
    ...params,
    overallHeight: params.overallHeight + 25.4,
  });
  expect(taller.overallScore).toBeLessThan(baseline.overallScore);
  for (const key of [
    "longitudinal-racking",
    "end-box-racking",
    "tipping",
    "member-stiffness",
  ] as const) {
    expect(score(taller, key), key).toBeLessThan(score(baseline, key));
  }

  const deeperLongAprons = getDiningTableStructuralAssessment({
    ...params,
    longApronHeight: params.longApronHeight + 25.4,
  });
  expect(score(deeperLongAprons, "longitudinal-racking")).toBeGreaterThan(
    score(baseline, "longitudinal-racking"),
  );
  expect(score(deeperLongAprons, "torsion")).toBeGreaterThan(
    score(baseline, "torsion"),
  );

  const deeperSideAprons = getDiningTableStructuralAssessment({
    ...params,
    sideApronHeight: params.sideApronHeight + 25.4,
  });
  expect(score(deeperSideAprons, "end-box-racking")).toBeGreaterThan(
    score(baseline, "end-box-racking"),
  );

  const thickerTop = getDiningTableStructuralAssessment({
    ...params,
    topThickness: params.topThickness + 12.7,
  });
  expect(score(thickerTop, "torsion")).toBeGreaterThan(
    score(baseline, "torsion"),
  );
  expect(score(thickerTop, "member-stiffness")).toBeGreaterThan(
    score(baseline, "member-stiffness"),
  );

  const fixedWoodFeet = getDiningTableStructuralAssessment({
    ...params,
    levelingFeetEnabled: 0,
  });
  expect(score(baseline, "floor-rocking")).toBeGreaterThan(
    score(fixedWoodFeet, "floor-rocking"),
  );
  expect(
    baseline.metrics.find((metric) => metric.key === "floor-rocking")!.detail,
  ).toContain("independently adjustable pads");
  expect(
    fixedWoodFeet.metrics.find((metric) => metric.key === "floor-rocking")!
      .detail,
  ).toContain("fixed chamfered wood contacts");

  const widerChamfers = getDiningTableStructuralAssessment({
    ...params,
    levelingFeetEnabled: 0,
    legFootChamfer: params.legFootChamfer + 3.175,
  });
  expect(score(widerChamfers, "floor-rocking")).toBeLessThan(
    score(fixedWoodFeet, "floor-rocking"),
  );
});

test("documents each Whisperer structural formula", () => {
  const structuralSpec = fs.readFileSync(
    path.join(root, "docs/whisperer-table-audit-specifications.md"),
    "utf8",
  );
  for (const heading of [
    "Long-apron racking",
    "Side-frame racking",
    "Apron-frame torsion",
    "Splayed-foot tipping margin",
    "Floor rocking tolerance",
    "Member stiffness",
    "Overall weighting and grades",
  ]) {
    expect(structuralSpec).toContain(`### ${heading}`);
  }
  expect(structuralSpec).toContain("geometry-only comparison");
  expect(structuralSpec).toContain("full-size corner mock");
  expect(structuralSpec).toContain("physical result overrides this screen");
  expect(structuralSpec).toContain("four independently adjustable leveling feet");
  expect(structuralSpec).toContain("registered support-free wood and hardware STLs");
});

test("renders, persists its feet, and exports registered Whisperer STLs", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=whisperer&unit=in");
  await expect(page.getByRole("heading", { name: "Whisperer" })).toBeVisible();
  await expect(page.getByLabel("Whisperer model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Table length in inches")).toHaveValue("72");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("40");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 3/4");
  const feetToggle = page.getByLabel("Use independent leveling feet");
  await expect(feetToggle).toBeChecked();
  await expect(page.getByLabel("Leveling-foot pad diameter in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Installed floor-to-leg extension in inches")).toHaveValue("3/4");
  await expect(page.getByText(/4 independent 1 1\/2 in pads/)).toBeVisible();
  const bevelInset = page.getByLabel("Underside bevel inset in inches");
  await expect(bevelInset).toHaveValue("5");
  await bevelInset.fill("4 1/2");
  await bevelInset.press("Enter");
  await expect(page).toHaveURL(/undersideBevelInset=4\.5/);
  await page.reload();
  await expect(bevelInset).toHaveValue("4 1/2");
  await expect(page.getByText(/15° splay/)).toBeVisible();
  await expect(page.getByText(/1 top · 4 legs/)).toBeVisible();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Export two-color STLs" }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const woodDownload = downloads.find((download) =>
    download.suggestedFilename().endsWith("-support-free-wood-color-1.stl"),
  );
  const hardwareDownload = downloads.find((download) =>
    download.suggestedFilename().endsWith("-support-free-hardware-color-2.stl"),
  );
  expect(woodDownload?.suggestedFilename()).toBe(
    "whisperer-scale-1-10-length-1828.8-width-1016.0-support-free-wood-color-1.stl",
  );
  expect(hardwareDownload?.suggestedFilename()).toBe(
    "whisperer-scale-1-10-length-1828.8-width-1016.0-support-free-hardware-color-2.stl",
  );
  const downloadPath = await woodDownload?.path();
  const buffer = fs.readFileSync(downloadPath!);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const exported = new STLLoader().parse(arrayBuffer);
  exported.computeBoundingBox();
  expect(exported.boundingBox!.min.z).toBeCloseTo(0, 3);
  expect(
    exported.boundingBox!.max.z - exported.boundingBox!.min.z,
  ).toBeCloseTo(74.295, 1);
  const exportedPosition = exported.getAttribute("position");
  let bedMinX = Infinity;
  let bedMaxX = -Infinity;
  let bedMinY = Infinity;
  let bedMaxY = -Infinity;
  for (let index = 0; index < exportedPosition.count; index += 1) {
    if (
      Math.abs(
        exportedPosition.getZ(index) - exported.boundingBox!.min.z,
      ) > 1e-4
    ) {
      continue;
    }
    bedMinX = Math.min(bedMinX, exportedPosition.getX(index));
    bedMaxX = Math.max(bedMaxX, exportedPosition.getX(index));
    bedMinY = Math.min(bedMinY, exportedPosition.getY(index));
    bedMaxY = Math.max(bedMaxY, exportedPosition.getY(index));
  }
  expect(bedMaxX - bedMinX).toBeGreaterThan(180);
  expect(bedMaxY - bedMinY).toBeGreaterThan(100);
  exported.dispose();

  const hardwarePath = await hardwareDownload?.path();
  const hardwareBuffer = fs.readFileSync(hardwarePath!);
  const hardwareArrayBuffer = hardwareBuffer.buffer.slice(
    hardwareBuffer.byteOffset,
    hardwareBuffer.byteOffset + hardwareBuffer.byteLength,
  );
  const exportedHardware = new STLLoader().parse(hardwareArrayBuffer);
  exportedHardware.computeBoundingBox();
  expect(exportedHardware.boundingBox!.min.z).toBeCloseTo(67.945, 2);
  expect(exportedHardware.boundingBox!.max.z).toBeCloseTo(76.2, 2);
  expect(
    exportedHardware.boundingBox!.max.x - exportedHardware.boundingBox!.min.x,
  ).toBeGreaterThan(170);
  expect(
    exportedHardware.boundingBox!.max.y - exportedHardware.boundingBox!.min.y,
  ).toBeGreaterThan(65);
  exportedHardware.dispose();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page.getByText("Use independent leveling feet", { exact: true }).click();
  await expect(feetToggle).not.toBeChecked();
  await expect(page).toHaveURL(/levelingFeetEnabled=0/);
  await page.reload();
  await expect(feetToggle).not.toBeChecked();
  await expect(page.getByText(/fixed floor contact/)).toBeVisible();
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("switches between standard, high, and photo oak rendering", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=whisperer&unit=in");
  await expect(page.getByTestId("viewer-status")).toContainText("High render");
  await expect(page).toHaveURL(/quality=high/);

  await page.getByRole("button", { name: "Workspace actions" }).click();
  await expect(page.getByLabel("Rendering quality")).toBeVisible();
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page).toHaveURL(/quality=standard/);
  await expect(page.getByTestId("viewer-status")).toContainText(
    "Standard render",
  );

  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await expect(page).toHaveURL(/quality=photo/);
  await expect(page.getByTestId("viewer-status")).toContainText("Photo render");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();

  const tableLength = page.getByLabel("Table length in inches");
  await tableLength.fill("70");
  await tableLength.press("Enter");
  await expect(page).toHaveURL(/tableLength=70/);
  await page.reload();
  await expect(page.getByTestId("viewer-status")).toContainText("Photo render");
  await expect(tableLength).toHaveValue("70");
  await expect.poll(() => pageErrors, { timeout: 10_000 }).toEqual([]);
});

test("shows Whisperer structural checks with its own formulas and sources", async ({
  page,
}) => {
  await page.goto("/?model=whisperer&unit=in");
  const designChecks = page.getByLabel("Workspace model library");
  await expect(
    designChecks.getByRole("button", { name: "Design checks", exact: true }),
  ).toHaveClass(/active/);
  const structuralAssessment = designChecks.getByLabel(
    "Structural wobble assessment",
  );
  await expect(structuralAssessment).toBeVisible();
  await expect(structuralAssessment.getByRole("listitem")).toHaveCount(6);
  await expect(
    structuralAssessment
      .locator('[data-metric="longitudinal-racking"]')
      .getByText("Long-apron racking", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment
      .locator('[data-metric="end-box-racking"]')
      .getByText("Side-frame racking", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment
      .locator('[data-metric="torsion"]')
      .getByText("Apron-frame torsion", { exact: true }),
  ).toBeVisible();

  await structuralAssessment
    .getByRole("button", { name: "Explain Long-apron racking calculation" })
    .click();
  const calculation = structuralAssessment.getByLabel(
    "Long-apron racking calculation details",
  );
  await expect(calculation).toContainText("Long apron depth");
  await expect(calculation).toContainText("mortise-and-tenon dimensions");
  await expect(
    calculation.getByRole("link", {
      name: "Long-apron racking detailed specification",
    }),
  ).toHaveAttribute(
    "href",
    /whisperer-table-audit-specifications\.md#long-apron-racking$/,
  );
  await expect(
    calculation.getByRole("link", {
      name: "Long-apron racking formula source code",
    }),
  ).toHaveAttribute("href", /whispererTable\.ts#L527-L634$/);

  const baselineScore = Number(
    await structuralAssessment.getAttribute("data-overall-score"),
  );
  await page.getByLabel("Overall height in inches").fill("31");
  await expect.poll(async () =>
    Number(await structuralAssessment.getAttribute("data-overall-score")),
  ).toBeLessThan(baselineScore);
});

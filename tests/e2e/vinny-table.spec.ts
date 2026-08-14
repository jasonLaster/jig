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
import {
  getVinnyTableCutList,
  getVinnyTableFabricationSpec,
} from "../../src/models/vinnyTable";
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
    "diagonal-brace-left-front",
    "diagonal-brace-left-rear",
    "diagonal-brace-right-front",
    "diagonal-brace-right-rear",
  ]);
  expect(parts[0].direction).toEqual([1, 0, 0]);
  expect(parts.slice(1, 5).every((part) => part.direction[2] === 1)).toBe(true);
  expect(parts.slice(5, 7).every((part) => part.direction[0] === 1)).toBe(true);
  expect(parts.slice(7, 12).every((part) => Math.abs(part.direction[1]) === 1)).toBe(true);
  expect(
    parts.slice(12).every(
      (part) =>
        Math.abs(Math.abs(part.direction[0]) - Math.SQRT1_2) < 1e-6 &&
        Math.abs(Math.abs(part.direction[1]) - Math.SQRT1_2) < 1e-6,
    ),
  ).toBe(true);
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
  expect(advanced.find((part) => part.id === "B4")).toMatchObject({
    material: "Oak",
    name: "Diagonal apron blocks",
    quantity: 4,
  });
  expect(advanced.find((part) => part.id === "B4")!.length).toBeCloseTo(
    8 * Math.SQRT2 * 25.4,
    6,
  );
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
  expect(intermediateParts.find((part) => part.id === "B3")!.length).toBeCloseTo(34 * 25.4, 6);

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

test("keeps direct apron dimensions, flush edge treatments, supports, and corner blocks parametric", () => {
  const params = getDefaultParams(model);
  const parameterKeys = model.parameters.map((parameter) => parameter.key);
  expect(model.parameters.every((parameter) => parameter.group)).toBe(true);
  expect(parameterKeys.some((key) => key.endsWith("Deduction"))).toBe(false);
  const baselineSpec = getVinnyTableFabricationSpec(params);
  expect(baselineSpec.shoulderJoinHeight).toBeCloseTo(
    baselineSpec.apronBottomHeight,
    10,
  );
  const deeperApronSpec = getVinnyTableFabricationSpec({
    ...params,
    apronHeight: params.apronHeight + 12.7,
  });
  expect(deeperApronSpec.shoulderJoinHeight).toBeCloseTo(
    deeperApronSpec.apronBottomHeight,
    10,
  );
  expect(deeperApronSpec.shoulderJoinHeight).toBeLessThan(
    baselineSpec.shoulderJoinHeight,
  );

  const treated = createDiningTableWoodGeometry(params, model);
  const square = createDiningTableWoodGeometry(
    {
      ...params,
      tabletopCornerRadius: 3.175,
      tabletopRoundoverRadius: 0,
      legOuterCornerRadius: 0,
      legEdgeRadius: 0,
      apronOuterBottomRoundoverRadius: 0,
    },
    model,
  );
  expect(treated.getAttribute("position").count).toBeGreaterThan(
    square.getAttribute("position").count,
  );

  const treatedParts = treated.userData.woodGrainParts as Array<{
    name: string;
    vertexCount: number;
    vertexStart: number;
  }>;
  const frontApron = treatedParts.find(
    (part) => part.name === "long-apron-front",
  )!;
  const treatedPositions = treated.getAttribute("position");
  const apronPoints = Array.from(
    { length: frontApron.vertexCount },
    (_, offset) => {
      const index = frontApron.vertexStart + offset;
      return new THREE.Vector3(
        treatedPositions.getX(index),
        treatedPositions.getY(index),
        treatedPositions.getZ(index),
      );
    },
  );
  const scale = params.mockScale;
  const apronHalfLength = baselineSpec.longApronLength / scale / 2;
  const apronBottom = baselineSpec.apronBottomHeight / scale;
  const apronOuterY = -params.tableWidth / scale / 2;
  const apronInnerY =
    apronOuterY + params.apronThickness / scale;
  const roundoverStation =
    -apronHalfLength + params.apronOuterBottomRoundoverRadius / scale;
  const hasPoint = (x: number, y: number, z: number) =>
    apronPoints.some(
      (point) =>
        Math.abs(point.x - x) < 1e-3 &&
        Math.abs(point.y - y) < 1e-3 &&
        Math.abs(point.z - z) < 1e-3,
    );
  expect(hasPoint(-apronHalfLength, apronOuterY, apronBottom)).toBe(true);
  expect(hasPoint(roundoverStation, apronInnerY, apronBottom)).toBe(true);
  expect(hasPoint(roundoverStation, apronOuterY, apronBottom)).toBe(false);

  const leftFrontBlock = treatedParts.find(
    (part) => part.name === "diagonal-brace-left-front",
  )!;
  const blockPoints = Array.from(
    { length: leftFrontBlock.vertexCount },
    (_, offset) => {
      const index = leftFrontBlock.vertexStart + offset;
      return new THREE.Vector3(
        treatedPositions.getX(index),
        treatedPositions.getY(index),
        treatedPositions.getZ(index),
      );
    },
  );
  const insideSideApronX =
    -params.tableLength / scale / 2 + params.apronThickness / scale;
  const insideLongApronY =
    -params.tableWidth / scale / 2 + params.apronThickness / scale;
  expect(
    blockPoints.some((point) => Math.abs(point.x - insideSideApronX) < 1e-3),
  ).toBe(true);
  expect(
    blockPoints.some((point) => Math.abs(point.y - insideLongApronY) < 1e-3),
  ).toBe(true);
  expect(Math.max(...blockPoints.map((point) => point.z))).toBeCloseTo(
    baselineSpec.apronBottomHeight / scale + params.apronHeight / scale,
    3,
  );
  expect(Math.min(...blockPoints.map((point) => point.z))).toBeCloseTo(
    apronBottom,
    3,
  );

  const asymmetricBlockParams = {
    ...params,
    diagonalBraceLongReach: 10 * 25.4,
    diagonalBraceSideReach: 6 * 25.4,
  };
  const asymmetricBlockSpec = getVinnyTableFabricationSpec(
    asymmetricBlockParams,
  );
  expect(asymmetricBlockSpec.diagonalLongAngleDegrees).toBeCloseTo(
    Math.atan2(6, 10) * (180 / Math.PI),
    8,
  );
  expect(asymmetricBlockSpec.diagonalSideAngleDegrees).toBeCloseTo(
    90 - Math.atan2(6, 10) * (180 / Math.PI),
    8,
  );
  const asymmetricGeometry = createDiningTableWoodGeometry(
    asymmetricBlockParams,
    model,
  );
  const asymmetricPositions = asymmetricGeometry.getAttribute("position");
  expect(
    Array.from({ length: asymmetricPositions.count }, (_, index) =>
      [
        asymmetricPositions.getX(index),
        asymmetricPositions.getY(index),
        asymmetricPositions.getZ(index),
      ].every(Number.isFinite),
    ).every(Boolean),
  ).toBe(true);

  const channelParams = { ...params, supportMode: 1 };
  const channelWood = createDiningTableWoodGeometry(channelParams, model);
  const channelParts = channelWood.userData.woodGrainParts as Array<{
    name: string;
  }>;
  expect(channelParts.some((part) => part.name.startsWith("stretcher-"))).toBe(
    false,
  );
  expect(
    channelParts.filter((part) => part.name.startsWith("diagonal-brace-")),
  ).toHaveLength(4);
  const channelHardware = createDiningTableHardwareGeometries(channelParams);
  expect(channelHardware.channels).toHaveLength(3);
  expect(channelHardware.feet).toHaveLength(4);
  const channelCutList = getVinnyTableCutList(channelParams);
  expect(channelCutList.find((part) => part.id === "B3")).toBeUndefined();
  expect(channelCutList.find((part) => part.id === "H1")).toMatchObject({
    material: "Steel",
    quantity: 3,
  });

  const braced = getDiningTableStructuralAssessment(channelParams);
  const unbraced = getDiningTableStructuralAssessment({
    ...channelParams,
    diagonalBracesEnabled: 0,
  });
  expect(
    braced.metrics.find((metric) => metric.key === "end-box-racking")!.score,
  ).toBeGreaterThan(
    unbraced.metrics.find((metric) => metric.key === "end-box-racking")!.score,
  );
  expect(
    getVinnyTableCutList({
      ...channelParams,
      diagonalBracesEnabled: 0,
    }).find((part) => part.id === "B4"),
  ).toBeUndefined();

  treated.dispose();
  square.dispose();
  asymmetricGeometry.dispose();
  channelWood.dispose();
  channelHardware.channels.forEach((geometry) => geometry.dispose());
  channelHardware.feet.forEach((geometry) => geometry.dispose());
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
  await expect(page.getByRole("button", { name: "Overall", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Apron", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Apron height / board width", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Apron thickness in inches")).toBeVisible();
  await expect(page.getByText("Apron outer-bottom roundover", { exact: true })).toBeVisible();
  await expect(page.getByText(/deduction/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Tabletop", exact: true }).click();
  await expect(
    page.getByText("Tabletop corner radius", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tabletop top-edge roundover", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Legs", exact: true }).click();
  await expect(page.getByText("Leg outside-corner radius", { exact: true })).toBeVisible();
  await expect(page.getByText("Other leg-edge radius", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Corner blocks", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Diagonal apron blocks" }),
  ).toBeChecked();
  await expect(page.getByText("Block reach along long apron", { exact: true })).toBeVisible();
  await expect(page.getByText("Block reach along side apron", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cross supports", exact: true }).click();
  await expect(page.getByLabel("Vinny cross-support system")).toContainText(
    "Oak stretchers",
  );
  await page.getByLabel("Vinny cross-support system").click();
  await page.getByRole("option", { name: "Steel C-channels" }).click();
  await expect(page).toHaveURL(/supportMode=1/);
  await page.getByRole("button", { name: "C-channels", exact: true }).click();
  await expect(page.getByText("C-channel visible width", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cut list" }).click();
  const cutList = page.getByTestId("vinny-cut-list");
  await expect(cutList).toBeVisible();
  await expect(cutList).toContainText("Advanced leg profile halves");
  await expect(cutList).toContainText("C-channels");
  await expect(cutList).toContainText("Diagonal apron blocks");
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

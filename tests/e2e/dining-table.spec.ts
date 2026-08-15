import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Download } from "@playwright/test";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDefaultParams,
  getDiningTableStructuralAssessment,
} from "../../src/models";
import type { WoodGrainPart } from "../../src/models/woodGrainUvs";
import { getWoodSpeciesForModel } from "../../src/woodTexture";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/dining-table/model.json"), "utf8"),
);
const defaultParams = getDefaultParams(model);

test("maps Plate Table oak grain along its top and four posts", () => {
  expect(getWoodSpeciesForModel(model.id)).toBe("oak");
  const geometry = createDiningTableWoodGeometry(defaultParams, model);
  const parts = geometry.userData.woodGrainParts as WoodGrainPart[];
  expect(parts.map((part) => part.name)).toEqual([
    "tabletop",
    "leg-left-front",
    "leg-left-rear",
    "leg-right-front",
    "leg-right-rear",
  ]);
  expect(parts[0].direction).toEqual([1, 0, 0]);
  for (const leg of parts.slice(1)) {
    expect(leg.direction).toEqual([0, 0, 1]);
  }
  expect(parts.reduce((sum, part) => sum + part.vertexCount, 0)).toBe(
    geometry.getAttribute("position").count,
  );
  const uv = geometry.getAttribute("uv");
  expect(uv.count).toBe(geometry.getAttribute("position").count);
  for (let index = 0; index < uv.count; index += 1) {
    expect(Number.isFinite(uv.getX(index))).toBe(true);
    expect(Number.isFinite(uv.getY(index))).toBe(true);
  }
  geometry.dispose();
});

function inspectStl(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");
  let finite = true;
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const a = new Float32Array([
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ]);
    const b = new Float32Array([
      position.getX(index + 1),
      position.getY(index + 1),
      position.getZ(index + 1),
    ]);
    const c = new Float32Array([
      position.getX(index + 2),
      position.getY(index + 2),
      position.getZ(index + 2),
    ]);
    finite &&= [...a, ...b, ...c].every(Number.isFinite);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 <= 1e-12) {
      degenerateTriangles += 1;
    }
  }
  let bedMinX = Infinity;
  let bedMaxX = -Infinity;
  let bedMinY = Infinity;
  let bedMaxY = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index) - bounds.min.z) > 1e-4) continue;
    bedMinX = Math.min(bedMinX, position.getX(index));
    bedMaxX = Math.max(bedMaxX, position.getX(index));
    bedMinY = Math.min(bedMinY, position.getY(index));
    bedMaxY = Math.max(bedMaxY, position.getY(index));
  }
  geometry.dispose();
  return {
    finite,
    degenerateTriangles,
    min: {
      x: bounds.min.x,
      y: bounds.min.y,
      z: bounds.min.z,
    },
    bedContactSize: {
      x: bedMaxX - bedMinX,
      y: bedMaxY - bedMinY,
    },
    size: {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    },
  };
}

test("renders the Plate Table and exports the registered two-color 1:10 mock", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=dining-table&unit=in");
  await expect(page.getByRole("heading", { name: "Plate Table" })).toBeVisible();
  await expect(page.getByLabel("Plate Table model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Mock scale denominator")).toHaveValue("10");
  await expect(page.getByLabel("Table length in inches")).toHaveValue("76");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("38");
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("30");
  await expect(page.getByLabel("Leg post size in inches")).toHaveValue("4");
  const otherCornerRadii = page.getByLabel("Other three post corner radii in inches");
  const outerCornerRadius = page.getByLabel("Outer post corner radius in inches");
  await expect(otherCornerRadii).toHaveValue("1");
  await expect(outerCornerRadius).toHaveValue("1");
  await outerCornerRadius.fill("1/2");
  await expect(outerCornerRadius).toHaveValue("1/2");
  await expect(otherCornerRadii).toHaveValue("1");
  await expect(page.getByText("1/2 in outer · 1 in other three")).toBeVisible();
  const grooveToggle = page.getByLabel("Post-top groove / rabbet");
  await expect(grooveToggle).toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toHaveValue("1/4");
  await expect(page.getByLabel("Post groove depth in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Leg top shoulder roundover radius in inches")).toHaveValue("1/4");
  await expect(page.getByLabel("Leg bottom roundover radius in inches")).toHaveValue("1/4");
  await expect(page.getByLabel("Independent leg leveling")).toBeChecked();
  await expect(page.getByLabel("Left-front installed extension in inches")).toHaveValue("3/4");
  await expect(page.getByLabel("Left-rear installed extension in inches")).toHaveValue("3/4");
  await expect(page.getByLabel("Right-front installed extension in inches")).toHaveValue("3/4");
  await expect(page.getByLabel("Right-rear installed extension in inches")).toHaveValue("3/4");
  await expect(page.getByText("1/4 in high × 1/8 in deep; 1/4 in shoulder")).toBeVisible();
  await expect(page.getByLabel("Plate edge setback in inches")).toHaveValue("1/2");
  await expect(page.getByText("16 in · 38 in · 60 in")).toBeVisible();
  await expect(page.getByText("1:10; 193.0 × 96.5 × 76.2 mm")).toBeVisible();

  await page.getByText("Post-top groove / rabbet", { exact: true }).click();
  await expect(grooveToggle).not.toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toHaveCount(0);
  await expect(page.getByLabel("Post groove depth in inches")).toHaveCount(0);
  await expect(page.getByText("1/4 in top · 1/4 in bottom")).toBeVisible();
  await page.getByText("Post-top groove / rabbet", { exact: true }).click();
  await expect(grooveToggle).toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toBeVisible();

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
    "dining-table-scale-1-10-length-1930.4-width-965.2-support-free-wood-color-1.stl",
  );
  expect(hardwareDownload?.suggestedFilename()).toBe(
    "dining-table-scale-1-10-length-1930.4-width-965.2-support-free-hardware-color-2.stl",
  );
  const woodPath = await woodDownload?.path();
  const hardwarePath = await hardwareDownload?.path();
  expect(woodPath).not.toBeNull();
  expect(hardwarePath).not.toBeNull();
  const woodStl = inspectStl(fs.readFileSync(woodPath!));
  const hardwareStl = inspectStl(fs.readFileSync(hardwarePath!));
  expect(woodStl.finite).toBe(true);
  expect(woodStl.degenerateTriangles).toBe(0);
  expect(woodStl.min.z).toBeCloseTo(0, 3);
  expect(woodStl.size.x).toBeCloseTo(193.04, 1);
  expect(woodStl.size.y).toBeCloseTo(96.52, 1);
  expect(woodStl.size.z).toBeCloseTo(74.295, 1);
  expect(woodStl.bedContactSize.x).toBeGreaterThan(185);
  expect(woodStl.bedContactSize.y).toBeGreaterThan(90);
  expect(hardwareStl.finite).toBe(true);
  expect(hardwareStl.degenerateTriangles).toBe(0);
  expect(hardwareStl.min.z).toBeCloseTo(2.54, 1);
  expect(hardwareStl.size.x).toBeCloseTo(190.5, 1);
  expect(hardwareStl.size.y).toBeCloseTo(93.98, 1);
  expect(hardwareStl.size.z).toBeCloseTo(73.66, 1);
  expect(pageErrors).toEqual([]);
});

test("renders the reported Plate Table shared URL without crashing", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    "/?model=dining-table&unit=in&quality=high&mockScale=10&tableLength=76&tableWidth=38&overallHeight=30&topThickness=1.5&tabletopCornerRadius=1&topRoundoverRadius=0.5&bottomRoundoverRadius=0.5&legSize=4&legCornerRadius=1&legOuterCornerRadius=1&legEdgeInset=0&legGrooveEnabled=1&legGrooveHeight=0.25&legGrooveDepth=0.125&legTopRoundoverRadius=0.25&legBottomRoundoverRadius=0.25&levelingFeetEnabled=1&levelingFootPadDiameter=1.5&levelingFootPadThickness=0.25&levelingFootRodDiameter=0.375&levelingFootRodLength=3&levelingFootExtensionLeftFront=0.75&levelingFootExtensionLeftRear=0.75&levelingFootExtensionRightFront=0.75&levelingFootExtensionRightRear=0.75&plateSize=6&plateThickness=0.25&plateEdgeInset=0.5&channelPosition1=16&channelPosition2=38&channelPosition3=60&channelLength=32&channelWidth=2&channelDepth=0.5",
  );

  await expect(page.getByRole("heading", { name: "Plate Table" })).toBeVisible();
  await expect(page.getByLabel("Plate Table model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Table length in inches")).toHaveValue("76");
  await expect(page.getByLabel("Left-front installed extension in inches")).toHaveValue("3/4");
  await expect(page.getByText("16 in · 38 in · 60 in")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("screens Plate Table structure and responds monotonically to key geometry", () => {
  const baseline = getDiningTableStructuralAssessment(defaultParams);
  expect(baseline.metrics).toHaveLength(6);
  expect(baseline.overallScore).toBeGreaterThanOrEqual(0);
  expect(baseline.overallScore).toBeLessThanOrEqual(100);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(1, 8);
  for (const metric of baseline.metrics) {
    expect(Number.isFinite(metric.score)).toBe(true);
    expect(metric.score).toBeGreaterThanOrEqual(0);
    expect(metric.score).toBeLessThanOrEqual(100);
    expect(metric.calculation.inputs.length).toBeGreaterThan(0);
  }

  const metric = (
    assessment: ReturnType<typeof getDiningTableStructuralAssessment>,
    key: (typeof assessment.metrics)[number]["key"],
  ) => assessment.metrics.find((entry) => entry.key === key)!.score;
  const taller = getDiningTableStructuralAssessment({
    ...defaultParams,
    overallHeight: defaultParams.overallHeight + 25.4,
  });
  expect(taller.overallScore).toBeLessThan(baseline.overallScore);
  expect(metric(taller, "longitudinal-racking")).toBeLessThan(
    metric(baseline, "longitudinal-racking"),
  );
  expect(metric(taller, "tipping")).toBeLessThan(metric(baseline, "tipping"));

  const largerPosts = getDiningTableStructuralAssessment({
    ...defaultParams,
    legSize: defaultParams.legSize + 25.4,
  });
  expect(metric(largerPosts, "longitudinal-racking")).toBeGreaterThan(
    metric(baseline, "longitudinal-racking"),
  );
  expect(metric(largerPosts, "member-stiffness")).toBeGreaterThanOrEqual(
    metric(baseline, "member-stiffness"),
  );

  const largerPlates = getDiningTableStructuralAssessment({
    ...defaultParams,
    plateSize: defaultParams.plateSize + 25.4,
    plateThickness: defaultParams.plateThickness + 3.175,
  });
  expect(metric(largerPlates, "end-box-racking")).toBeGreaterThan(
    metric(baseline, "end-box-racking"),
  );
  expect(metric(largerPlates, "torsion")).toBeGreaterThan(
    metric(baseline, "torsion"),
  );

  const clusteredChannels = getDiningTableStructuralAssessment({
    ...defaultParams,
    channelPosition1: 34 * 25.4,
    channelPosition2: 38 * 25.4,
    channelPosition3: 42 * 25.4,
  });
  expect(metric(clusteredChannels, "torsion")).toBeLessThan(
    metric(baseline, "torsion"),
  );
  expect(baseline.heightSensitivity.lower?.delta).toBeGreaterThan(0);
  expect(baseline.heightSensitivity.higher?.delta).toBeLessThan(0);

  const fixedPosts = getDiningTableStructuralAssessment({
    ...defaultParams,
    levelingFeetEnabled: 0,
  });
  expect(metric(baseline, "floor-rocking")).toBeGreaterThan(
    metric(fixedPosts, "floor-rocking"),
  );
  expect(baseline.overallScore).toBeGreaterThan(fixedPosts.overallScore);
});

test("models four independently installed leveling feet on one floor plane", () => {
  const extensions = [12.7, 15.875, 19.05, 22.225];
  const independentParams = {
    ...defaultParams,
    levelingFootExtensionLeftFront: extensions[0],
    levelingFootExtensionLeftRear: extensions[1],
    levelingFootExtensionRightFront: extensions[2],
    levelingFootExtensionRightRear: extensions[3],
  };
  const hardware = createDiningTableHardwareGeometries(independentParams);
  expect(hardware.feet).toHaveLength(4);
  for (const foot of hardware.feet) {
    foot.computeBoundingBox();
    expect(foot.boundingBox!.min.z).toBeCloseTo(0, 4);
    expect(foot.boundingBox!.max.z).toBeCloseTo(
      (defaultParams.levelingFootPadThickness +
        defaultParams.levelingFootRodLength) /
        defaultParams.mockScale,
      4,
    );
    foot.dispose();
  }
  hardware.plates.forEach((geometry) => geometry.dispose());
  hardware.channels.forEach((geometry) => geometry.dispose());

  const wood = createDiningTableWoodGeometry(independentParams, model);
  const positions = wood.getAttribute("position");
  const quadrantMinimums = [Infinity, Infinity, Infinity, Infinity];
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const quadrant = (x >= 0 ? 2 : 0) + (y >= 0 ? 1 : 0);
    quadrantMinimums[quadrant] = Math.min(
      quadrantMinimums[quadrant],
      positions.getZ(index),
    );
  }
  quadrantMinimums.forEach((minimum, index) => {
    expect(minimum).toBeCloseTo(extensions[index] / defaultParams.mockScale, 4);
  });
  wood.dispose();

  const disabledHardware = createDiningTableHardwareGeometries({
    ...defaultParams,
    levelingFeetEnabled: 0,
  });
  expect(disabledHardware.feet).toHaveLength(0);
  disabledHardware.plates.forEach((geometry) => geometry.dispose());
  disabledHardware.channels.forEach((geometry) => geometry.dispose());
  const disabledWood = createDiningTableWoodGeometry(
    { ...defaultParams, levelingFeetEnabled: 0 },
    model,
  );
  disabledWood.computeBoundingBox();
  expect(disabledWood.boundingBox!.min.z).toBeCloseTo(0, 4);
  disabledWood.dispose();
});

test("documents every Plate Table structural formula", () => {
  const structuralSpec = fs.readFileSync(
    path.join(root, "docs/dining-table-audit-specifications.md"),
    "utf8",
  );
  for (const heading of [
    "Apronless post racking",
    "Plate-joint leverage",
    "Tabletop torsional rigidity",
    "Tipping margin",
    "Floor rocking tolerance",
    "Independent leveling feet",
    "Member stiffness",
    "Overall weighting and grades",
  ]) {
    expect(structuralSpec).toContain(`### ${heading}`);
  }
  expect(structuralSpec).toContain("1/8 in channel wall");
  expect(structuralSpec).toContain("geometry-only comparison");
  expect(structuralSpec).toContain("full-size corner mock");
});

test("shows the Plate Table structural screen with transparent calculations", async ({
  page,
}) => {
  await page.goto("/?model=dining-table&unit=in");
  const designChecks = page.getByLabel("Workspace model library");
  const structuralAssessment = designChecks.getByLabel(
    "Structural wobble assessment",
  );
  await expect(structuralAssessment).toBeVisible();
  await expect(structuralAssessment.getByRole("listitem")).toHaveCount(6);
  await expect(
    structuralAssessment
      .locator('[data-metric="end-box-racking"]')
      .getByText("Plate-joint leverage", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment
      .locator('[data-metric="torsion"]')
      .getByText("Tabletop torsional rigidity", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment.locator(".structural-reference-links a"),
  ).toHaveCount(14);

  await structuralAssessment
    .getByRole("button", { name: "Explain Plate-joint leverage calculation" })
    .click();
  const calculation = structuralAssessment.getByLabel(
    "Plate-joint leverage calculation details",
  );
  await expect(calculation).toContainText("Plate projection beyond post");
  await expect(
    calculation.getByRole("link", { name: "Plate-joint leverage detailed specification" }),
  ).toHaveAttribute("href", /dining-table-audit-specifications\.md#plate-joint-leverage$/);

  const baselineScore = Number(
    await structuralAssessment.getAttribute("data-overall-score"),
  );
  await page.getByLabel("Overall height in inches").fill("31");
  await expect
    .poll(async () =>
      Number(await structuralAssessment.getAttribute("data-overall-score")),
    )
    .toBeLessThan(baselineScore);
});

test("persists independent Plate Table leveling controls in the URL", async ({
  page,
}) => {
  await page.goto("/?model=dining-table&unit=in");
  const toggle = page.getByLabel("Independent leg leveling");
  const leftFront = page.getByLabel("Left-front installed extension in inches");
  await leftFront.fill("1");
  await expect(page).toHaveURL(/levelingFootExtensionLeftFront=1(?:&|$)/);
  await page.reload();
  await expect(leftFront).toHaveValue("1");

  const assessment = page.getByLabel("Structural wobble assessment");
  const enabledScore = Number(await assessment.getAttribute("data-overall-score"));
  await page.getByText("Independent leg leveling", { exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await expect(leftFront).toHaveCount(0);
  await expect(page).toHaveURL(/levelingFeetEnabled=0(?:&|$)/);
  await expect
    .poll(async () => Number(await assessment.getAttribute("data-overall-score")))
    .toBeLessThan(enabledScore);
});

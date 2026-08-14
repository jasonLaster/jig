import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(root, "public/models/vinny-table/model.json");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(model.parameters.map((parameter) => [parameter.key, parameter.default]));
const inch = 25.4;
const close = (actual, expected, label, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);

assert.equal(model.id, "vinny-table");
assert.equal(model.name, "Vinny Table");
assert.equal(model.viewer, "dining-table-v1");
assert.equal(model.geometry.channelCount, 3);
close(params.tableLength, 96 * inch, "table length");
close(params.tableWidth, 40 * inch, "table width");
close(params.overallHeight, 30 * inch, "overall height");
close(params.topThickness, 1.5 * inch, "top thickness");
close(params.tabletopCornerRadius, 1 * inch, "tabletop corner radius");
close(params.tabletopRoundoverRadius, 0.5 * inch, "tabletop roundover");
assert.equal(params.topStyle, 0);
assert.equal(params.legStyle, 2);
close(params.topOverhang, 1.5 * inch, "overhang option");
close(params.flushGrooveWidth, 0.5 * inch, "flush groove width");
close(params.flushGrooveDepth, 0.25 * inch, "flush groove depth");
close(params.advancedLegTopWidth, 6 * inch, "advanced leg top width");
close(params.advancedLegFootWidth, 2 * inch, "advanced leg foot width");
close(params.advancedLegThickness, 1.5 * inch, "advanced leg-half thickness");
close(params.advancedShoulderRadius, 1.5 * inch, "advanced shoulder radius");
close(params.legOuterCornerRadius, 0.75 * inch, "leg outside-corner radius");
close(params.legEdgeRadius, 0.125 * inch, "other leg-edge radius");
close(params.apronHeight, 2.5 * inch, "apron height / board width");
close(params.apronThickness, 1.5 * inch, "apron thickness");
close(params.apronOuterBottomRoundoverRadius, 0.75 * inch, "apron outer-bottom roundover");
close(params.stretcherSpacing, 22 * inch, "stretcher spacing");
assert.equal(params.supportMode, 0);
close(params.cChannelWidth, 2 * inch, "C-channel width");
close(params.cChannelDepth, 0.5 * inch, "C-channel depth");
close(params.cChannelWallThickness, 0.125 * inch, "C-channel wall");
assert.equal(params.diagonalBracesEnabled, 1);
close(params.diagonalBraceLongReach, 8 * inch, "diagonal long-apron reach");
close(params.diagonalBraceSideReach, 8 * inch, "diagonal side-apron reach");
assert.equal(params.levelingFeetEnabled, 1);
close(params.levelingFootPadDiameter, 1.25 * inch, "leveling pad diameter");
close(params.levelingFootRodDiameter, 0.375 * inch, "leveling rod diameter");

const longApron = params.tableLength - 2 * params.advancedLegTopWidth;
const shortApron = params.tableWidth - 2 * params.advancedLegTopWidth;
const stretcher = params.tableWidth - 2 * params.apronThickness;
close(longApron, 84 * inch, "derived long apron");
close(shortApron, 28 * inch, "derived short apron");
close(stretcher, 37 * inch, "derived stretcher");
assert.ok(params.advancedLegFootWidth > params.advancedLegThickness);
assert.ok(params.advancedShoulderRadius <= params.advancedLegTopWidth - params.advancedLegFootWidth);
assert.equal(params.apronHeight, 2.5 * inch, "apron height owns the shoulder join elevation");
assert.ok(params.tabletopRoundoverRadius <= params.tabletopCornerRadius);
assert.ok(params.apronOuterBottomRoundoverRadius <= params.apronThickness / 2);
assert.ok(params.cChannelWallThickness < Math.min(params.cChannelWidth / 2, params.cChannelDepth));
assert.ok(params.flushGrooveDepth < params.topThickness);
assert.ok(params.levelingFootPadThickness <= params.levelingFootExtension);
assert.ok(params.levelingFootExtension < params.levelingFootRodLength);
assert.ok(model.parameters.every((parameter) => parameter.group), "every Vinny parameter must belong to a UI group");
assert.ok(
  model.parameters.every((parameter) => !/Deduction$/.test(parameter.key)),
  "Vinny lengths must be derived without deduction parameters",
);

const mockEnvelope = [params.tableLength, params.tableWidth, params.overallHeight].map((value) => value / params.mockScale);
assert.ok(mockEnvelope[0] <= 256, "default mock length must fit a 256 mm bed");
assert.ok(mockEnvelope[1] <= 256, "default mock width must fit a 256 mm bed");

const source = fs.readFileSync(path.join(root, "src/models/vinnyTable.ts"), "utf8");
for (const required of [
  "createVinnyTableWoodGeometry",
  "createAdvancedLegGeometry",
  "advancedLegRing",
  "treatedLegRing",
  "createVinnyTopGeometry",
  "createFrameGeometries",
  "createPrismaticMember",
  "createMiteredDiagonalBrace",
  "createCChannelGeometry",
  "createVinnyTableHardwareGeometries",
  "getVinnyTableCutList",
  "getVinnyTableFabricationSpec",
  "getVinnyTableStructuralAssessment",
  "getVinnyTableParameterLimits",
  "getVinnyTableAuditValue",
]) {
  assert.ok(source.includes(required), `procedural source is missing ${required}`);
}

const spec = fs.readFileSync(path.join(root, "docs/vinny-table-audit-specifications.md"), "utf8");
for (const required of [
  "Long-apron racking",
  "End-frame racking",
  "Frame-and-support torsion",
  "Tipping margin",
  "Floor rocking tolerance",
  "Member stiffness",
  "Overall weighting and grades",
  "four independently adjustable leveling feet",
  "always meets - the live apron bottom",
  "Tabletop corner radius and top-edge roundover are separate controls",
  "C-channel mode removes those stretchers",
  "Four optional diagonal oak blocks",
  "outer lower edge",
  "calculated contact angles",
  "deduction controls",
  "physical result overrides this screen",
]) {
  assert.ok(spec.includes(required), `structural spec is missing ${required}`);
}

console.log(`vinny-table audit passed: 96 × 40 × 30 in full size, 1:${params.mockScale} mock ${mockEnvelope.map((value) => value.toFixed(1)).join(" × ")} mm`);

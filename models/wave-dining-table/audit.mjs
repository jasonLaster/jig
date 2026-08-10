import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(
  root,
  "public/models/wave-dining-table/model.json",
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);
const inch = 25.4;
const close = (actual, expected, label, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );

assert.equal(model.id, "wave-dining-table");
assert.equal(model.name, "The Wave");
assert.equal(model.viewer, "hover-dining-table-v1");
assert.equal(model.export.filePrefix, model.id);
assert.equal(model.stl.url, `/models/${model.id}/${model.stl.fileName}`);
assert.equal(model.geometry.channelCount, 3);

close(params.tableLength, 75 * inch, "table length");
close(params.tableWidth, 35.5 * inch, "table width");
close(params.overallHeight, 29.5 * inch, "overall height");
close(params.topThickness, 1.25 * inch, "tabletop thickness");
assert.equal(params.endFrameStyle, 1, "open leg frames must be the default");
assert.equal(params.topSupportStyle, 1, "two lengthwise upper rails must be the default");
assert.equal(params.bottomSupportStyle, 2, "the floor must remain open by default");
assert.equal(params.levelingFeetEnabled, 1, "recessed leveling feet must be enabled by default");
close(params.frameDepth, 4 * inch, "leg-frame depth");
close(params.frameSideWidth, 2 * inch, "leg width");
close(params.frameTopRailHeight, 2 * inch, "wave top-rail height");
close(params.topSupportWidth, 2.5 * inch, "lengthwise rail width");
close(params.topSupportThickness, 2.5 * inch, "lengthwise rail height");
close(params.topSupportShoulderRadius, 2.5 * inch, "lengthwise rail upper-end radius");
close(params.cornerBraceReach, 10 * inch, "corner-brace reach");
assert.equal(
  params.matchLengthwiseRailRoundover,
  1,
  "lengthwise rail ends must match the leg round-over by default",
);
close(
  params.topSupportEndRadius,
  params.frameEdgeRoundover,
  "default rail-end/leg round-over parity",
);
close(params.topSupportEdgeRadius, 0.375 * inch, "independent top round-over");
for (const removedBezierControl of [
  "frameOuterRailCurveTension",
  "frameOuterStileCurveTension",
  "frameInnerRailCurveTension",
  "frameInnerStileCurveTension",
]) {
  assert.equal(
    removedBezierControl in params,
    false,
    `${removedBezierControl} must not remain in The Wave controls`,
  );
}

const topBottom = params.overallHeight - params.topThickness;
const frameTopWidth = params.tableWidth - 2 * params.sideOverhang;
const openingTopWidth = frameTopWidth - 2 * params.frameSideWidth;
const supportSpan =
  params.tableLength - 2 * (params.endOverhang + params.frameDepth);
assert.ok(topBottom > params.frameTopRailHeight + params.frameInnerTopCornerRadius);
assert.ok(openingTopWidth > 2 * params.frameInnerTopCornerRadius);
assert.ok(supportSpan > 4 * inch);
assert.ok(params.frameEdgeRoundover * 2 < params.frameSideWidth);
assert.ok(params.frameEdgeRoundover * 2 < params.frameTopRailHeight);

const source = fs.readFileSync(
  path.join(root, "src/models/hoverDiningTable.ts"),
  "utf8",
);
const templateSource = fs.readFileSync(
  path.join(root, "src/models/hoverDiningTableTemplates.ts"),
  "utf8",
);
for (const required of [
  'HoverDiningTableEndFrameStyle = "box" | "legs"',
  'spec.endFrameStyle === "legs"',
  "Unable to merge open-leg end-frame geometry",
  "Wave-curve top rail",
  "Full-height leg",
  "createCornerKneeBraceParts",
  'id: "K1"',
  "cornerBraceCount",
  "consistent corner returns and two square tangent seams",
  "getCircularRoundedTrapezoidDefinition",
  "straightSupportSideProfile",
  "Upper-end shoulder radius",
  "Matched lengthwise rail end face-edge must use the leg round-over",
]) {
  assert.ok(source.includes(required), `shared source is missing ${required}`);
}
for (const required of [
  'spec.endFrameStyle === "box"',
  "model.export.filePrefix",
  "profiles.top",
  "profiles.right",
]) {
  assert.ok(templateSource.includes(required), `template source is missing ${required}`);
}

const auditText = [
  ...model.audit.dimensionTargets,
  ...model.audit.invariants,
].join(" ");
for (const phrase of [
  "two open transverse frames",
  "distinctive wave-shaped shoulder",
  "true circular fillets",
  "2.5 in high by 2.5 in wide lengthwise rails with mirrored 2.5 in circular upper-end returns",
  "Top and end treatments are independent",
  "Derive the top round-over maximum from the rail width and height",
  "two parallel lengthwise upper rails",
  "four plan-view corner knee braces",
  "no floor connector",
  "20 default pieces",
  "four recessed leveling feet",
  "top-rail and mirrored full-height-leg routing templates",
]) {
  assert.ok(auditText.includes(phrase), `audit contract is missing: ${phrase}`);
}

console.log(
  `wave-dining-table audit passed: open 2 × 4 in wave-curve leg frames, 2 lengthwise rails, 4 corner knee braces, 4 leveling feet, no lower support, ${supportSpan.toFixed(1)} mm support span`,
);

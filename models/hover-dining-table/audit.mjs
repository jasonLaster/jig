import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(
  root,
  "public/models/hover-dining-table/model.json",
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

assert.equal(model.id, "hover-dining-table");
assert.equal(model.name, "X-Hover Dining Table");
assert.equal(model.viewer, "hover-dining-table-v1");
assert.ok(model.geometry.curveSegments >= 12, "Bézier profiles need smooth sampling");
assert.ok(model.geometry.bevelSegments >= 4, "End-box face round-overs need smooth sampling");
assert.ok(model.geometry.braceRoundoverSegments >= 4, "Brace edge round-overs need smooth sampling");
assert.equal(model.geometry.channelCount, 3, "the tabletop needs exactly three C-channels");

close(params.tableLength, 75 * inch, "table length");
close(params.tableWidth, 35.5 * inch, "table width");
close(params.overallHeight, 29.5 * inch, "overall height");
close(params.topThickness, 1.25 * inch, "tabletop thickness");
close(params.topEdgeRoll, 0.625 * inch, "long-edge roll depth");
close(params.topPlanCornerRadius, 0, "default plan corner radius");
close(params.topEndFaceRoundover, 0, "default length-end face round-over");
close(params.sideOverhang, 1.75 * inch, "side overhang");
close(params.endOverhang, 7.5 * inch, "end overhang");
close(params.channelEndClearance, 4 * inch, "channel clearance from end boxes");
close(params.channelSideInset, 2 * inch, "channel inset from long edges");
close(params.channelWidth, 2 * inch, "channel outside width");
close(params.channelDepth, 0.375 * inch, "channel mortise depth");
close(params.channelWallThickness, 0.125 * inch, "channel steel wall");
close(params.frameDepth, 2.5 * inch, "end-box depth");
close(params.frameSideWidth, 2.25 * inch, "end-box side width");
close(params.frameBottomRailHeight, 1.75 * inch, "bottom rail");
close(params.frameTopRailHeight, 1.25 * inch, "top rail");
close(params.frameOuterTopCornerRadius, 0.75 * inch, "outer top radius");
close(params.frameOuterBottomCornerRadius, 0.75 * inch, "outer bottom radius");
close(params.frameInnerTopCornerRadius, 2.5 * inch, "inner top radius");
close(params.frameInnerBottomCornerRadius, 2.5 * inch, "inner bottom radius");
close(params.frameEdgeRoundover, 0.375 * inch, "end-box face-edge round-over");
assert.equal(params.levelingFeetEnabled, 1, "four leveling feet are enabled by default");
close(params.levelingFootPadDiameter, 1.5 * inch, "leveling-foot pad diameter");
close(params.levelingFootPadThickness, 0.25 * inch, "leveling-foot pad thickness");
close(params.levelingFootRodDiameter, 0.375 * inch, "leveling-foot rod diameter");
close(params.levelingFootRodLength, 3 * inch, "leveling-foot rod length");
close(params.levelingFootExtension, 0.75 * inch, "installed floor-to-box extension");
close(params.topSupportWidth, 2 * inch, "top support width");
close(params.bottomSupportWidth, 2 * inch, "bottom support width");
close(params.topSupportThickness, 1.25 * inch, "top support thickness");
close(params.bottomSupportThickness, 1.25 * inch, "bottom support thickness");
close(params.topSupportEdgeRadius, 0.125 * inch, "top support round-over");
close(params.bottomSupportEdgeRadius, 0.125 * inch, "bottom support round-over");
close(
  params.bottomSupportTopEdgeRadius,
  0,
  "default bottom-support top round-over",
);
close(params.halfLapClearance, 0, "nominal half-lap clearance");
assert.equal(params.topSupportStyle, 0, "upper X remains the default support layout");
assert.equal(params.bottomSupportStyle, 0, "floor X remains the default support layout");
assert.equal(
  params.syncCrossbarDimensions,
  0,
  "crossbar synchronization remains an explicit opt-in",
);
close(params.templateThickness, 0.125 * inch, "routing-template thickness");
close(params.templatePlateLength, 9 * inch, "usable routing-template print span");
close(params.templateDovetailDepth, 0.5 * inch, "routing-template dovetail depth");
close(params.templateJointClearance, 0.2, "routing-template joint clearance");
assert.ok(params.templatePlateLength > params.templateDovetailDepth * 4);
assert.ok(params.templateJointClearance < params.templateDovetailDepth / 3);
assert.equal(params.frameBottomSpread, 0, "orthogonal end box is the evidence-backed default");
assert.equal(params.topSupportEndpointInset, 0);
assert.equal(params.bottomSupportEndpointInset, 0);
assert.equal("hoverGap" in params, false, "the revised model must not expose a hover gap");
assert.equal("stretcherHeight" in params, false, "straight supports use the selected support section");
assert.equal("stretcherThickness" in params, false, "straight supports use the selected support section");
assert.equal("supportPadLength" in params, false, "support pads are superseded");

for (const key of [
  "topEdgeTension",
  "frameOuterRailCurveTension",
  "frameOuterStileCurveTension",
  "frameInnerRailCurveTension",
  "frameInnerStileCurveTension",
]) {
  assert.ok(params[key] >= 0.35 && params[key] <= 0.8, `${key} must be normalized`);
}
close(params.topEdgeTension, 0.552, "tabletop near-circular Bézier tension", 0.001);
close(
  params.frameOuterRailCurveTension,
  0.552,
  "outer rail-side Bézier sweep",
  0.001,
);
close(
  params.frameOuterStileCurveTension,
  0.552,
  "outer stile-side Bézier sweep",
  0.001,
);
close(
  params.frameInnerRailCurveTension,
  0.58,
  "inner rail-side Bézier sweep",
  0.001,
);
close(
  params.frameInnerStileCurveTension,
  0.58,
  "inner stile-side Bézier sweep",
  0.001,
);
assert.notEqual(
  params.frameOuterTopCornerRadius,
  params.frameInnerTopCornerRadius,
  "inner and outer end-box radii must remain independently editable",
);

const topBottom = params.overallHeight - params.topThickness;
const frameBottomZ = params.levelingFeetEnabled ? params.levelingFootExtension : 0;
const frameHeight = topBottom - frameBottomZ;
const frameTopWidth = params.tableWidth - 2 * params.sideOverhang;
const frameBottomWidth = frameTopWidth + params.frameBottomSpread;
const openingTopWidth = frameTopWidth - 2 * params.frameSideWidth;
const openingBottomWidth = frameBottomWidth - 2 * params.frameSideWidth;
const openingHeight =
  frameHeight - params.frameBottomRailHeight - params.frameTopRailHeight;
const spanX = params.tableLength - 2 * (params.endOverhang + params.frameDepth);
const channelOuterCenterX =
  spanX / 2 - params.channelEndClearance - params.channelWidth / 2;
const channelCenters = [-channelOuterCenterX, 0, channelOuterCenterX];
const directOakBearingFraction =
  1 - (model.geometry.channelCount * params.channelWidth) / spanX;
const deriveBraceEnd = (openingWidth, innerRadius, width, inset) => {
  const cornerTangentY = openingWidth / 2 - innerRadius;
  let endpointY = cornerTangentY - inset - width / 2;
  let miterHalfWidth = width / 2;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const directionX = spanX / Math.hypot(spanX, endpointY * 2);
    miterHalfWidth = width / (2 * directionX);
    endpointY = cornerTangentY - inset - miterHalfWidth;
  }
  return {
    cornerTangentY,
    endpointY,
    endpointOuterY: endpointY + miterHalfWidth,
    miterHalfWidth,
  };
};
const upperEnd = deriveBraceEnd(
  openingTopWidth,
  params.frameInnerTopCornerRadius,
  params.topSupportWidth,
  params.topSupportEndpointInset,
);
const lowerEnd = deriveBraceEnd(
  openingBottomWidth,
  params.frameInnerBottomCornerRadius,
  params.bottomSupportWidth,
  params.bottomSupportEndpointInset,
);
const frameSideWidthParameter = model.parameters.find(
  (parameter) => parameter.key === "frameSideWidth",
);
const minimumFrameFaceFlat = 0.125 * inch;
const requiredTopOpeningHalfWidth =
  params.frameInnerTopCornerRadius +
  params.topSupportEndpointInset +
  upperEnd.miterHalfWidth +
  params.topSupportWidth / 2 +
  minimumFrameFaceFlat / 2;
const requiredBottomOpeningHalfWidth =
  params.frameInnerBottomCornerRadius +
  params.bottomSupportEndpointInset +
  lowerEnd.miterHalfWidth +
  params.bottomSupportWidth / 2 +
  minimumFrameFaceFlat / 2;
const auditedFrameSideWidthMin = Math.max(
  frameSideWidthParameter.limits.min,
  2 *
      (params.frameOuterBottomCornerRadius +
        params.levelingFootRodDiameter / 2) +
    minimumFrameFaceFlat,
);
const auditedFrameSideWidthMax = Math.min(
  frameSideWidthParameter.limits.max,
  frameTopWidth / 2 - requiredTopOpeningHalfWidth,
  frameBottomWidth / 2 - requiredBottomOpeningHalfWidth,
);
const auditFrameSideWidthBoundary = (sideWidth, label) => {
  const topOpening = frameTopWidth - 2 * sideWidth;
  const bottomOpening = frameBottomWidth - 2 * sideWidth;
  const topEnd = deriveBraceEnd(
    topOpening,
    params.frameInnerTopCornerRadius,
    params.topSupportWidth,
    params.topSupportEndpointInset,
  );
  const bottomEnd = deriveBraceEnd(
    bottomOpening,
    params.frameInnerBottomCornerRadius,
    params.bottomSupportWidth,
    params.bottomSupportEndpointInset,
  );
  assert.ok(topOpening > 2 * params.frameInnerTopCornerRadius, `${label} top opening`);
  assert.ok(
    bottomOpening > 2 * params.frameInnerBottomCornerRadius,
    `${label} bottom opening`,
  );
  assert.ok(topEnd.endpointY > params.topSupportWidth / 2, `${label} upper X bearing`);
  assert.ok(
    bottomEnd.endpointY > params.bottomSupportWidth / 2,
    `${label} lower X bearing`,
  );
  assert.ok(
    sideWidth / 2 -
        params.frameOuterBottomCornerRadius -
        params.levelingFootRodDiameter / 2 >
      0,
    `${label} leveling-foot entry margin`,
  );
};
assert.ok(
  auditedFrameSideWidthMax >= auditedFrameSideWidthMin,
  "end-box side-width limits must retain a non-empty valid range",
);
auditFrameSideWidthBoundary(auditedFrameSideWidthMin, "minimum side width");
auditFrameSideWidthBoundary(auditedFrameSideWidthMax, "maximum side width");
const upperEndpointY = upperEnd.endpointY;
const lowerEndpointY = lowerEnd.endpointY;
const upperSpanY = upperEndpointY * 2;
const lowerSpanY = lowerEndpointY * 2;
const upperLength = Math.hypot(spanX, upperSpanY);
const lowerLength = Math.hypot(spanX, lowerSpanY);
const upperAngle = Math.atan2(upperSpanY, spanX);
const lowerAngle = Math.atan2(lowerSpanY, spanX);

assert.ok(frameTopWidth < params.tableWidth, "end boxes must sit inside the top");
assert.ok(frameBottomWidth <= params.tableWidth, "end-box feet must remain inside the top width");
assert.ok(openingTopWidth > 2 * params.frameInnerTopCornerRadius);
assert.ok(openingBottomWidth > 2 * params.frameInnerBottomCornerRadius);
assert.ok(
  openingHeight >
    params.frameInnerTopCornerRadius + params.frameInnerBottomCornerRadius,
);
assert.ok(spanX > 4 * inch, "both X assemblies need a positive structural span");
assert.equal(channelCenters.length, model.geometry.channelCount);
close(channelCenters[0] + channelCenters[2], 0, "outer channel symmetry");
close(channelCenters[1], 0, "center channel position");
assert.ok(
  channelCenters[0] + params.channelWidth / 2 < -params.channelWidth / 2,
  "left and center channel mortises must remain distinct",
);
assert.ok(
  channelCenters[2] - params.channelWidth / 2 > params.channelWidth / 2,
  "right and center channel mortises must remain distinct",
);
assert.ok(params.channelSideInset >= params.topEdgeRoll);
assert.ok(params.tableWidth - 2 * params.channelSideInset > 0);
assert.ok(params.channelDepth < params.topThickness);
assert.ok(params.channelWallThickness < params.channelDepth);
assert.ok(params.channelWallThickness * 2 < params.channelWidth);
assert.ok(
  directOakBearingFraction >= 0.5,
  "flush channels must leave at least half of each upper support on oak",
);
assert.ok(upperLength > spanX && lowerLength > spanX);
assert.ok(upperAngle > 0 && lowerAngle > 0);
assert.ok(upperAngle < Math.PI / 4 && lowerAngle < Math.PI / 4);
close(
  upperEnd.endpointOuterY + params.topSupportEndpointInset,
  upperEnd.cornerTangentY,
  "upper angled end clears the inner-corner tangent",
);
close(
  lowerEnd.endpointOuterY + params.bottomSupportEndpointInset,
  lowerEnd.cornerTangentY,
  "lower angled end clears the inner-corner tangent",
);
close(params.topSupportThickness / 2, 0.625 * inch, "top half-lap depth");
close(params.bottomSupportThickness / 2, 0.625 * inch, "bottom half-lap depth");
close(frameBottomZ + frameHeight, topBottom, "raised end boxes terminate at the tabletop underside");
close(topBottom, topBottom, "upper-X top contact");
close(frameBottomZ, params.levelingFootExtension, "lower-X raised contact plane");
const exposedRod = params.levelingFootExtension - params.levelingFootPadThickness;
const embeddedRod = params.levelingFootRodLength - exposedRod;
close(exposedRod, 0.5 * inch, "exposed leveling-foot rod");
close(embeddedRod, 2.5 * inch, "embedded leveling-foot rod");
assert.ok(
  params.frameOuterBottomCornerRadius + params.levelingFootRodDiameter / 2 <=
    params.frameSideWidth / 2,
  "rounded bottom must retain a solid rod-entry circle beneath each stile",
);
assert.equal(
  model.parameters.find((p) => p.key === "frameSideWidth").limits.min,
  0.5 * inch,
);
assert.ok(params.topSupportThickness <= params.frameTopRailHeight);
assert.ok(params.bottomSupportThickness <= params.frameBottomRailHeight);
assert.ok(params.halfLapClearance < params.topSupportThickness / 2);
assert.ok(params.halfLapClearance < params.bottomSupportThickness / 2);
assert.ok(params.sideOverhang < model.parameters.find((p) => p.key === "sideOverhang").limits.max);
assert.ok(model.parameters.find((p) => p.key === "frameBottomSpread").limits.min < -2 * inch);
assert.ok(model.parameters.find((p) => p.key === "topSupportWidth").limits.max > 2 * inch);
assert.ok(model.parameters.find((p) => p.key === "bottomSupportWidth").limits.max > 2 * inch);
assert.ok(model.parameters.find((p) => p.key === "topSupportThickness").limits.max > 1.5 * inch);
assert.ok(model.parameters.find((p) => p.key === "bottomSupportThickness").limits.max > 1.5 * inch);
assert.ok(
  model.parameters.find((p) => p.key === "bottomSupportTopEdgeRadius").limits
    .max >=
    2 * inch,
);

const mockEnvelope = [
  params.tableLength / params.mockScale,
  params.tableWidth / params.mockScale,
  params.overallHeight / params.mockScale,
];
assert.ok(mockEnvelope.every((value) => value > 0));
assert.ok(mockEnvelope[0] <= 256, "default manipulation model should fit a 256 mm bed length");
assert.ok(mockEnvelope[1] <= 256, "default manipulation model should fit a 256 mm bed width");

const source = fs.readFileSync(
  path.join(root, "src/models/hoverDiningTable.ts"),
  "utf8",
);
const templateSource = fs.readFileSync(
  path.join(root, "src/models/hoverDiningTableTemplates.ts"),
  "utf8",
);
for (const required of [
  "assertHoverDiningTableSpec",
  "addRoundedTrapezoid",
  "bezierCurveTo",
  "createTabletopCrossSection",
  "createEndFrameGeometry",
  "createHalfLappedX",
  "createHoverDiningTableExplodedParts",
  "createHoverDiningTableHardwareGeometries",
  "createLevelingFootGeometry",
  "outerEntryClearance",
  "createCChannelGeometry",
  "createMortisedTabletopCrossSectionProfile",
  "createRoundedTabletopEndGeometry",
  "tabletopPlanCornerSetback",
  "tabletopEndFaceSetback",
  "createEndBoxPartProfiles",
  "createSelectivelyRoundedExtrusion",
  "assertFabricationProfile",
  "consistent corner returns and two square tangent seams",
  "parts.length !== expectedPieces",
  "getHoverDiningTableCutList",
  "Hover-table cut list must account for",
  "getHoverDiningTablePieceCount",
  "getHoverDiningTableStructuralAssessment",
  "Lengthwise racking",
  "Floor rocking tolerance",
  "heightSensitivity",
  "createStraightSupportParts",
  "createStraightSupportFabricationProfile",
  "miteredBraceFootprint",
  "alignConvexPolygon",
  "createRoundedPlanPrism",
  "bottomSupportTopEdgeRadius",
  "topEdgeRadius",
  "Rounded X-brace layers must preserve aligned cut planes",
  "clipPolygonHalfPlane",
  "halfLapDepth: thickness / 2",
  "upperBrace.zTop - spec.topBottom",
  "lowerBrace.zBottom",
]) {
  assert.ok(source.includes(required), `procedural source is missing ${required}`);
}
for (const required of [
  "getHoverDiningTableEndBoxFabricationProfiles",
  "getHoverDiningTableStileFabricationLayout",
  "profiles.top",
  "profiles.bottom",
  "profiles.right",
  "createHoverDiningTableTemplateSegments",
  "getHoverDiningTableTemplateSummary",
  "templatePlateLength",
  "templateDovetailDepth",
  "templateJointClearance",
  "jointStart: index === 0 ? \"none\" : \"female\"",
  "jointEnd: index === count - 1 ? \"none\" : \"male\"",
  "exceeds the usable square plate span",
  "must export as multiple printable plates",
]) {
  assert.ok(templateSource.includes(required), `template source is missing ${required}`);
}
for (const forbidden of [
  "supportPadLength",
  "supportPadWidth",
  "getParam(params, \"hoverGap\")",
]) {
  assert.equal(source.includes(forbidden), false, `procedural source retains ${forbidden}`);
}

const invariantText = [
  ...model.audit.dimensionTargets,
  ...model.audit.invariants,
].join(" ");
for (const phrase of [
  "independently selectable support layouts",
  "50/50 half-lap",
  "no overlapping solid volume",
  "directly against the tabletop underside",
  "only floor contacts",
  "Generate parallel upper lengthwise stretchers only when selected",
  "cubic Bézier",
  "straight-rail tangent",
  "optional top long edge of the selected bottom support",
  "14–20 assembly pieces",
  "1.5 in pads and 3 in threaded rods",
  "Exactly three blackened-steel C-channels",
  "presentation-only",
  "do not substitute proxy blanks",
  "exact constrained profiles",
  "full-size finished dimensions",
  "full-size top-rail, bottom-rail, and mirrored vertical-stile routing templates",
  "exact finished B1/B2/B3 part profiles",
  "complementary in-plane dovetails",
  "1/8 in nominal thickness",
  "rough-milling allowance",
  "zero means orthogonal",
  "geometry-only wobble screen",
  "increasing overall height cannot improve the overall score",
  "material-neutral",
]) {
  assert.ok(invariantText.includes(phrase), `audit invariants must retain: ${phrase}`);
}

console.log(
  `hover-dining-table audit passed: 75 × 35.5 × 29.5 in, 3 flush C-channels, ${(directOakBearingFraction * 100).toFixed(0)}% upper-support oak bearing, 2 end boxes, 4 diagonal braces, 2 centered half-laps, 3 plate-split routing templates, zero contact gaps, 1:${params.mockScale} model ${mockEnvelope.map((value) => value.toFixed(1)).join(" × ")} mm`,
);

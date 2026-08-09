import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createHoverDiningTableCutPartGeometry,
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  createHoverDiningTableHardwareGeometries,
  getHoverDiningTableCutList,
  getHoverDiningTableParameterLimits,
  getHoverDiningTablePieceCount,
  getHoverDiningTableSpec,
  getHoverDiningTableStructuralAssessment,
} from "../../src/models/hoverDiningTable";
import {
  createHoverDiningTableTemplateSegments,
  getHoverDiningTableTemplateSummary,
} from "../../src/models/hoverDiningTableTemplates";
import type {
  HoverDiningTableModelDefinition,
  ModelParams,
} from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/hover-dining-table/model.json"),
    "utf8",
  ),
) as HoverDiningTableModelDefinition;
const defaultParams = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
) as ModelParams;
const waveModel = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/wave-dining-table/model.json"),
    "utf8",
  ),
) as HoverDiningTableModelDefinition;
const waveDefaultParams = Object.fromEntries(
  waveModel.parameters.map((parameter) => [parameter.key, parameter.default]),
) as ModelParams;

function inspectGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");
  let finite = true;
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const ab = [
      position.getX(index + 1) - ax,
      position.getY(index + 1) - ay,
      position.getZ(index + 1) - az,
    ];
    const ac = [
      position.getX(index + 2) - ax,
      position.getY(index + 2) - ay,
      position.getZ(index + 2) - az,
    ];
    finite &&= [ax, ay, az, ...ab, ...ac].every(Number.isFinite);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 <= 1e-12) {
      degenerateTriangles += 1;
    }
  }
  return {
    finite,
    degenerateTriangles,
    position,
    min: bounds.min.clone(),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function inspectStl(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const result = inspectGeometry(geometry);
  geometry.dispose();
  return result;
}

function inspectWoodUvs(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  let finite = Boolean(uv) && uv.count === position.count;
  let inUnitRange = finite;
  if (uv) {
    for (let index = 0; index < uv.count; index += 1) {
      const u = uv.getX(index);
      const v = uv.getY(index);
      finite &&= Number.isFinite(u) && Number.isFinite(v);
      inUnitRange &&= u >= -1e-6 && u <= 1 + 1e-6;
      inUnitRange &&= v >= -1e-6 && v <= 1 + 1e-6;
    }
  }
  return { finite, inUnitRange, count: uv?.count ?? 0 };
}

function uniqueAxisCoordinates(
  geometry: THREE.BufferGeometry,
  axis: "x" | "y" | "z",
  precision = 5,
) {
  const position = geometry.getAttribute("position");
  const getter = axis === "x"
    ? (index: number) => position.getX(index)
    : axis === "y"
      ? (index: number) => position.getY(index)
      : (index: number) => position.getZ(index);
  return new Set(
    Array.from({ length: position.count }, (_, index) =>
      getter(index).toFixed(precision),
    ),
  ).size;
}

function inspectPlanarContactFace(
  geometry: THREE.BufferGeometry,
  planeX: number,
  tolerance = 1e-4,
) {
  const position = geometry.getAttribute("position");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let area = 0;
  let triangleCount = 0;
  let minimumAbsoluteNormalX = 1;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (
      Math.abs(a.x - planeX) > tolerance ||
      Math.abs(b.x - planeX) > tolerance ||
      Math.abs(c.x - planeX) > tolerance
    ) {
      continue;
    }
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const triangleArea = normal.length() / 2;
    if (triangleArea <= 1e-8) continue;
    area += triangleArea;
    triangleCount += 1;
    minimumAbsoluteNormalX = Math.min(
      minimumAbsoluteNormalX,
      Math.abs(normal.normalize().x),
    );
    for (const point of [a, b, c]) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
  }

  return {
    area,
    triangleCount,
    minimumAbsoluteNormalX,
    ySpan: maxY - minY,
    zSpan: maxZ - minZ,
  };
}

function centerlineZRange(
  geometry: THREE.BufferGeometry,
  tolerance = 1e-4,
) {
  const position = geometry.getAttribute("position");
  const zValues: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    if (
      Math.abs(position.getX(index)) <= tolerance &&
      Math.abs(position.getY(index)) <= tolerance
    ) {
      zValues.push(position.getZ(index));
    }
  }
  return {
    count: zValues.length,
    min: Math.min(...zValues),
    max: Math.max(...zValues),
  };
}

test("builds The Wave with four top-frame corner triangles", () => {
  const { fullSize } = getHoverDiningTableSpec(waveDefaultParams);
  expect(fullSize.endFrameStyle).toBe("legs");
  expect(fullSize.topSupportStyle).toBe("stretchers");
  expect(fullSize.bottomSupportStyle).toBe("none");
  expect(fullSize.frameDepth).toBeCloseTo(4 * 25.4, 6);
  expect(fullSize.frameSideWidth).toBeCloseTo(2 * 25.4, 6);
  expect(fullSize.frameTopRailHeight).toBeCloseTo(2 * 25.4, 6);
  expect(fullSize.frameCornerStyle).toBe("circular");
  expect(fullSize.matchLengthwiseRailRoundover).toBe(true);
  expect(fullSize.upperStretchers.edgeRadius).toBe(0);
  expect(fullSize.upperStretchers.topEdgeRadius).toBeCloseTo(
    fullSize.frameEdgeRoundover,
    6,
  );
  expect(fullSize.upperStretchers.endRadius).toBeCloseTo(
    fullSize.frameEdgeRoundover,
    6,
  );
  expect(fullSize.levelingFeet.enabled).toBe(true);
  expect(fullSize.cornerKneeBraces.enabled).toBe(true);
  expect(fullSize.cornerKneeBraces.count).toBe(4);
  expect(fullSize.cornerKneeBraces.reach).toBeCloseTo(10 * 25.4, 6);
  expect(fullSize.cornerKneeBraces.centerlineLength).toBeCloseTo(
    Math.SQRT2 * fullSize.cornerKneeBraces.reach,
    6,
  );
  expect(fullSize.cornerKneeBraces.longPointLength).toBeCloseTo(
    fullSize.cornerKneeBraces.centerlineLength +
      fullSize.cornerKneeBraces.width,
    6,
  );
  expect(fullSize.openingBottom).toBe(0);
  expect(fullSize.openingHeight).toBeCloseTo(
    fullSize.frameHeight - fullSize.frameTopRailHeight,
    6,
  );

  const cutList = getHoverDiningTableCutList(waveDefaultParams);
  expect(cutList.totalPieces).toBe(20);
  expect(getHoverDiningTablePieceCount(waveDefaultParams)).toBe(20);
  expect(cutList.parts.map((part) => part.id)).toEqual([
    "T1",
    "H1",
    "L1",
    "B1",
    "B3",
    "S1",
    "K1",
  ]);
  expect(cutList.parts.find((part) => part.id === "B2")).toBeUndefined();
  expect(cutList.parts.find((part) => part.id === "L1")?.quantity).toBe(4);
  expect(cutList.parts.find((part) => part.id === "S1")?.quantity).toBe(2);
  const lengthwiseRail = cutList.parts.find((part) => part.id === "S1")!;
  expect(lengthwiseRail.fabricationProfile.support?.endRadius).toBeCloseTo(
    fullSize.frameEdgeRoundover,
    6,
  );
  expect(
    lengthwiseRail.fabricationProfile.outline.filter(
      (command) => command.kind === "arc",
    ),
  ).toHaveLength(4);
  expect(lengthwiseRail.processDimensions).toContainEqual({
    label: "End-face round-over",
    value: fullSize.frameEdgeRoundover,
  });
  expect(lengthwiseRail.processDimensions).toContainEqual({
    label: "Top edge round-over",
    value: fullSize.frameEdgeRoundover,
  });
  expect(lengthwiseRail.processDimensions).not.toContainEqual(
    expect.objectContaining({ label: "Bottom edge round-over" }),
  );
  const kneeBrace = cutList.parts.find((part) => part.id === "K1")!;
  expect(kneeBrace.quantity).toBe(4);
  expect(kneeBrace.cutAngleDegrees).toBeCloseTo(45, 6);
  expect(kneeBrace.length).toBeCloseTo(
    fullSize.cornerKneeBraces.longPointLength,
    6,
  );
  expect(kneeBrace.fabricationProfile.outline).toHaveLength(5);

  const topRail = cutList.parts.find((part) => part.id === "B1")!;
  const leg = cutList.parts.find((part) => part.id === "B3")!;
  expect(topRail.name).toBe("Wave-curve top rail");
  expect(
    topRail.fabricationProfile.outline.filter((command) => command.kind === "arc"),
  ).toHaveLength(4);
  expect(topRail.fabricationProfile.bezier).toBeUndefined();
  expect(topRail.fabricationProfile.cornerRadii).toEqual({
    outerRadius: fullSize.frameOuterTopCornerRadius,
    innerRadius: fullSize.frameInnerTopCornerRadius,
  });
  const railOutline = topRail.fabricationProfile.outline;
  railOutline.forEach((command, index) => {
    if (command.kind !== "arc") return;
    const previous = railOutline[index - 1];
    if (!previous || previous.kind === "close") {
      throw new Error("Circular rail return must follow an explicit profile point");
    }
    expect(
      Math.hypot(
        previous.to.x - command.center.x,
        previous.to.y - command.center.y,
      ),
    ).toBeCloseTo(command.radius, 6);
    expect(
      Math.hypot(
        command.to.x - command.center.x,
        command.to.y - command.center.y,
      ),
    ).toBeCloseTo(command.radius, 6);
  });
  const { fullSize: independentlyRounded } = getHoverDiningTableSpec({
    ...waveDefaultParams,
    matchLengthwiseRailRoundover: 0,
    topSupportEdgeRadius: 0.25 * 25.4,
  });
  expect(independentlyRounded.matchLengthwiseRailRoundover).toBe(false);
  expect(independentlyRounded.upperStretchers.edgeRadius).toBe(0);
  expect(independentlyRounded.upperStretchers.topEdgeRadius).toBeCloseTo(
    0.25 * 25.4,
    6,
  );
  expect(independentlyRounded.upperStretchers.endRadius).toBeCloseTo(
    0.25 * 25.4,
    6,
  );
  expect(independentlyRounded.frameEdgeRoundover).toBeCloseTo(
    fullSize.frameEdgeRoundover,
    6,
  );
  expect(leg.name).toBe("Full-height leg");
  expect(leg.quantity).toBe(4);
  expect(leg.fabricationProfile.bounds.minY).toBeCloseTo(0, 6);
  expect(
    leg.fabricationProfile.outline.filter(
      (command) =>
        command.kind !== "move" && command.edgeTreatment === "square",
    ),
  ).toHaveLength(1);

  const geometry = createHoverDiningTableGeometry(
    waveDefaultParams,
    waveModel,
  );
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  expect(inspected.size.x).toBeCloseTo(fullSize.length / fullSize.scale, 4);
  expect(inspected.size.y).toBeCloseTo(fullSize.width / fullSize.scale, 4);
  expect(inspected.size.z).toBeCloseTo(
    (fullSize.height - fullSize.levelingFeet.extension) / fullSize.scale,
    4,
  );
  geometry.dispose();

  const exploded = createHoverDiningTableExplodedParts(
    waveDefaultParams,
    waveModel,
  );
  expect(exploded).toHaveLength(20);
  expect(
    exploded.filter((part) => part.category === "end-box-vertical"),
  ).toHaveLength(4);
  expect(exploded.some((part) => part.name.includes("bottom-rail"))).toBe(false);
  expect(
    exploded.filter((part) => part.category === "upper-corner-brace"),
  ).toHaveLength(4);
  expect(
    exploded.filter((part) => part.category === "leveling-foot"),
  ).toHaveLength(4);
  const explodedLengthwiseRails = exploded.filter(
    (part) => part.category === "upper-stretcher",
  );
  expect(explodedLengthwiseRails).toHaveLength(2);
  for (const part of explodedLengthwiseRails) {
    const railGeometry = inspectGeometry(part.geometry);
    expect(railGeometry.finite).toBe(true);
    expect(railGeometry.degenerateTriangles).toBe(0);
    expect(uniqueAxisCoordinates(part.geometry, "x")).toBeGreaterThan(2);
  }
  exploded.forEach((part) => part.geometry.dispose());

  const withoutCornerBraces = getHoverDiningTableStructuralAssessment({
    ...waveDefaultParams,
    cornerBraceReach: 0,
  });
  const withCornerBraces = getHoverDiningTableStructuralAssessment(
    waveDefaultParams,
  );
  expect(withCornerBraces.overallScore).toBeGreaterThan(
    withoutCornerBraces.overallScore,
  );
  expect(
    withCornerBraces.metrics.find(
      (metric) => metric.key === "longitudinal-racking",
    )!.score,
  ).toBeGreaterThan(
    withoutCornerBraces.metrics.find(
      (metric) => metric.key === "longitudinal-racking",
    )!.score,
  );
  expect(
    withCornerBraces.metrics.find((metric) => metric.key === "torsion")!.score,
  ).toBeGreaterThan(
    withoutCornerBraces.metrics.find((metric) => metric.key === "torsion")!
      .score,
  );
  expect(
    withCornerBraces.metrics.find(
      (metric) => metric.key === "end-box-racking",
    )!.score,
  ).toBe(
    withoutCornerBraces.metrics.find(
      (metric) => metric.key === "end-box-racking",
    )!.score,
  );

  const hardware = createHoverDiningTableHardwareGeometries(waveDefaultParams);
  expect(hardware.channels).toHaveLength(3);
  expect(hardware.feet).toHaveLength(4);
  [...hardware.channels, ...hardware.feet].forEach((part) => part.dispose());

  const templateSummary = getHoverDiningTableTemplateSummary(
    waveDefaultParams,
    waveModel,
  );
  expect(templateSummary.templates.map((template) => template.kind)).toEqual([
    "top-rail",
    "vertical-stile",
  ]);
  const templateSegments = createHoverDiningTableTemplateSegments(
    waveDefaultParams,
    waveModel,
  );
  expect(templateSegments).toHaveLength(templateSummary.totalSegments);
  expect(
    templateSegments.every((segment) =>
      segment.fileName.startsWith("wave-dining-table-"),
    ),
  ).toBe(true);
  templateSegments.forEach((segment) => segment.geometry.dispose());
});

test("derives two centered half-lapped Xs above four adjustable feet", () => {
  const { fullSize, scaled } = getHoverDiningTableSpec(defaultParams);
  for (const brace of [fullSize.upperBrace, fullSize.lowerBrace]) {
    expect(brace.endpointOuterY + brace.endpointInset).toBeCloseTo(
      brace.cornerTangentY,
      6,
    );
    expect(brace.miterHalfWidth).toBeCloseTo(
      brace.width / (2 * Math.cos(brace.angleRadians)),
      6,
    );
    expect(brace.edgeRadius).toBeLessThan(
      brace.halfLapDepth - fullSize.halfLapClearance / 2,
    );
  }
  expect(fullSize.upperBrace.width).toBe(fullSize.lowerBrace.width);
  expect(fullSize.upperBrace.thickness).toBe(fullSize.lowerBrace.thickness);
  expect(fullSize.upperBrace.endpointInset).toBe(
    fullSize.lowerBrace.endpointInset,
  );
  expect(fullSize.upperBrace.edgeRadius).toBe(fullSize.lowerBrace.edgeRadius);

  const largerTopRadius = getHoverDiningTableSpec({
    ...defaultParams,
    frameInnerTopCornerRadius:
      defaultParams.frameInnerTopCornerRadius + 12.7,
  }).fullSize;
  expect(largerTopRadius.upperBrace.endpointY).toBeLessThan(
    fullSize.upperBrace.endpointY,
  );
  expect(largerTopRadius.lowerBrace.endpointY).toBeCloseTo(
    fullSize.lowerBrace.endpointY,
    6,
  );
  expect(largerTopRadius.upperBrace.endpointOuterY).toBeCloseTo(
    largerTopRadius.upperBrace.cornerTangentY,
    6,
  );
  const largerBottomRadius = getHoverDiningTableSpec({
    ...defaultParams,
    frameInnerBottomCornerRadius:
      defaultParams.frameInnerBottomCornerRadius + 12.7,
  }).fullSize;
  expect(largerBottomRadius.lowerBrace.endpointY).toBeLessThan(
    fullSize.lowerBrace.endpointY,
  );
  expect(largerBottomRadius.upperBrace.endpointY).toBeCloseTo(
    fullSize.upperBrace.endpointY,
    6,
  );
  expect(fullSize.frameBottomZ + fullSize.frameHeight).toBeCloseTo(
    fullSize.topBottom,
    6,
  );
  expect(fullSize.upperBrace.zTop).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.lowerBrace.zBottom).toBeCloseTo(fullSize.frameBottomZ, 6);
  expect(fullSize.upperBrace.halfLapDepth).toBeCloseTo(
    fullSize.upperBrace.thickness / 2,
    6,
  );
  expect(fullSize.lowerBrace.halfLapDepth).toBeCloseTo(
    fullSize.lowerBrace.thickness / 2,
    6,
  );
  expect(fullSize.upperBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.upperBrace.spanX, fullSize.upperBrace.spanY),
    6,
  );
  expect(fullSize.lowerBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.lowerBrace.spanX, fullSize.lowerBrace.spanY),
    6,
  );
  expect(fullSize.upperBrace.angleRadians).toBeGreaterThan(0);
  expect(fullSize.lowerBrace.angleRadians).toBeGreaterThan(0);
  expect(fullSize.channels.count).toBe(3);
  expect(fullSize.channels.centerXs[1]).toBeCloseTo(0, 6);
  expect(fullSize.channels.centerXs[0]).toBeCloseTo(
    -fullSize.channels.centerXs[2],
    6,
  );
  expect(fullSize.channels.zBottom).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.channels.zBottom).toBeCloseTo(fullSize.upperBrace.zTop, 6);
  expect(fullSize.channels.zBottom).toBeCloseTo(
    fullSize.upperStretchers.zTop,
    6,
  );
  expect(fullSize.channels.zTop).toBeLessThan(fullSize.height);
  const directOakBearingFraction =
    1 -
    (fullSize.channels.count * fullSize.channels.width) /
      fullSize.braceSpanX;
  expect(directOakBearingFraction).toBeGreaterThanOrEqual(0.5);

  const hardware = createHoverDiningTableHardwareGeometries(defaultParams);
  expect(hardware.channels).toHaveLength(3);
  expect(hardware.feet).toHaveLength(4);
  hardware.channels.forEach((channel, index) => {
    const inspectedChannel = inspectGeometry(channel);
    expect(inspectedChannel.finite, `channel ${index + 1}`).toBe(true);
    expect(inspectedChannel.degenerateTriangles, `channel ${index + 1}`).toBe(0);
    expect(inspectedChannel.size.x, `channel ${index + 1} width`).toBeCloseTo(
      scaled.channels.width,
      5,
    );
    expect(inspectedChannel.size.y, `channel ${index + 1} length`).toBeCloseTo(
      scaled.channels.length,
      5,
    );
    expect(inspectedChannel.size.z, `channel ${index + 1} depth`).toBeCloseTo(
      scaled.channels.depth,
      5,
    );
    expect(inspectedChannel.min.z).toBeCloseTo(scaled.topBottom, 5);
    channel.dispose();
  });
  hardware.feet.forEach((foot, index) => {
    const inspectedFoot = inspectGeometry(foot);
    expect(inspectedFoot.finite, `foot ${index + 1}`).toBe(true);
    expect(inspectedFoot.min.z, `foot ${index + 1} floor contact`).toBeCloseTo(
      0,
      5,
    );
    expect(inspectedFoot.size.z, `foot ${index + 1} hardware height`).toBeCloseTo(
      scaled.levelingFeet.padThickness + scaled.levelingFeet.rodLength,
      5,
    );
    foot.dispose();
  });

  const geometry = createHoverDiningTableGeometry(defaultParams, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  expect(inspected.min.z).toBeCloseTo(scaled.frameBottomZ, 5);
  expect(inspected.size.x).toBeCloseTo(scaled.length, 4);
  expect(inspected.size.y).toBeCloseTo(scaled.width, 4);
  expect(inspected.size.z).toBeCloseTo(scaled.height - scaled.frameBottomZ, 4);
  const woodUvs = inspectWoodUvs(geometry);
  expect(woodUvs.finite).toBe(true);
  expect(woodUvs.inUnitRange).toBe(true);
  expect(woodUvs.count).toBe(inspected.position.count);

  let centralFloorVertices = 0;
  let centralUpperContactVertices = 0;
  for (let index = 0; index < inspected.position.count; index += 1) {
    const x = inspected.position.getX(index);
    const z = inspected.position.getZ(index);
    if (Math.abs(x) > scaled.length / 8) continue;
    if (Math.abs(z - scaled.frameBottomZ) < 1e-4) centralFloorVertices += 1;
    if (Math.abs(z - scaled.topBottom) < 1e-4) {
      centralUpperContactVertices += 1;
    }
  }
  expect(centralFloorVertices).toBeGreaterThan(0);
  expect(centralUpperContactVertices).toBeGreaterThan(0);
  geometry.dispose();
});

test("keeps leveling-foot rods inside rounded stile entries and preserves overall height", () => {
  const { fullSize: spec } = getHoverDiningTableSpec(defaultParams);
  expect(spec.levelingFeet.enabled).toBe(true);
  expect(spec.levelingFeet.count).toBe(4);
  expect(spec.levelingFeet.padDiameter).toBeCloseTo(1.5 * 25.4, 6);
  expect(spec.levelingFeet.rodLength).toBeCloseTo(3 * 25.4, 6);
  expect(spec.levelingFeet.exposedRodLength).toBeCloseTo(0.5 * 25.4, 6);
  expect(spec.levelingFeet.embeddedRodLength).toBeCloseTo(2.5 * 25.4, 6);
  expect(spec.levelingFeet.outerEntryClearance).toBeGreaterThanOrEqual(0);
  expect(spec.frameBottomZ + spec.frameHeight + spec.topThickness).toBeCloseTo(
    spec.height,
    6,
  );
  expect(
    getHoverDiningTableParameterLimits(
      model,
      defaultParams,
      "frameOuterBottomCornerRadius",
    ).max,
  ).toBeCloseTo(
    spec.frameSideWidth / 2 - spec.levelingFeet.rodDiameter / 2,
    6,
  );

  expect(() =>
    getHoverDiningTableSpec({
      ...defaultParams,
      frameOuterBottomCornerRadius:
        spec.frameSideWidth / 2 - spec.levelingFeet.rodDiameter / 2 + 1,
    }),
  ).toThrow(/solid entry face/);

  const disabled = getHoverDiningTableSpec({
    ...defaultParams,
    levelingFeetEnabled: 0,
  }).fullSize;
  expect(disabled.frameBottomZ).toBe(0);
  expect(disabled.frameHeight).toBeCloseTo(disabled.topBottom, 6);
  expect(disabled.lowerBrace.zBottom).toBe(0);
  expect(
    createHoverDiningTableHardwareGeometries({
      ...defaultParams,
      levelingFeetEnabled: 0,
    }).feet,
  ).toHaveLength(0);
});

test("rounds tabletop plan corners and length-end faces independently", () => {
  const params = {
    ...defaultParams,
    topPlanCornerRadius: 2 * 25.4,
    topEndFaceRoundover: 0.25 * 25.4,
  };
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const geometry = createHoverDiningTableGeometry(params, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  expect(inspected.size.x).toBeCloseTo(spec.length, 4);
  expect(inspected.size.y).toBeCloseTo(spec.width, 4);
  expect(inspected.size.z).toBeCloseTo(spec.height - spec.frameBottomZ, 4);

  let maximumTopEndX = -Infinity;
  let maximumMidFaceY = -Infinity;
  const midZ = spec.topBottom + spec.topThickness / 2;
  for (let index = 0; index < inspected.position.count; index += 1) {
    const x = inspected.position.getX(index);
    const y = inspected.position.getY(index);
    const z = inspected.position.getZ(index);
    if (Math.abs(z - spec.height) <= 1e-4) {
      maximumTopEndX = Math.max(maximumTopEndX, x);
    }
    if (
      Math.abs(x - spec.length / 2) <= 1e-4 &&
      Math.abs(z - midZ) <= 1e-4
    ) {
      maximumMidFaceY = Math.max(maximumMidFaceY, y);
    }
  }
  expect(maximumTopEndX).toBeCloseTo(
    spec.length / 2 - spec.topEndFaceRoundover,
    4,
  );
  expect(maximumMidFaceY).toBeCloseTo(
    spec.width / 2 - spec.topPlanCornerRadius,
    4,
  );

  const tabletop = getHoverDiningTableCutList(params).parts.find(
    (part) => part.id === "T1",
  )!;
  expect(tabletop.fabricationProfile.tabletop).toEqual({
    planCornerRadius: 2 * 25.4,
    endFaceRoundover: 0.25 * 25.4,
  });
  expect(
    tabletop.fabricationProfile.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(4);
  expect(
    getHoverDiningTableParameterLimits(model, params, "endOverhang").min,
  ).toBeGreaterThanOrEqual(2.25 * 25.4);
  expect(
    getHoverDiningTableParameterLimits(model, params, "topThickness").min,
  ).toBeGreaterThan(0.5 * 25.4);
  geometry.dispose();
});

test("keeps widened parameter ranges inside the shared geometric contract", () => {
  const definitions = Object.fromEntries(
    model.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(definitions.sideOverhang.limits.max).toBeGreaterThan(4 * 25.4);
  expect(definitions.endOverhang.limits.max).toBeGreaterThan(12 * 25.4);
  expect(definitions.frameBottomSpread.limits.min).toBeLessThan(-2 * 25.4);
  expect(definitions.topSupportWidth.limits.max).toBeGreaterThan(2 * 25.4);
  expect(definitions.bottomSupportWidth.limits.max).toBeGreaterThan(2 * 25.4);
  expect(definitions.topSupportThickness.limits.min).toBeCloseTo(1 * 25.4, 6);
  expect(definitions.bottomSupportThickness.limits.min).toBeCloseTo(
    1 * 25.4,
    6,
  );
  expect(definitions.topSupportThickness.limits.max).toBeGreaterThan(1.5 * 25.4);
  expect(definitions.bottomSupportThickness.limits.max).toBeGreaterThan(1.5 * 25.4);
  expect(definitions.topSupportEndpointInset.limits).toEqual(
    definitions.bottomSupportEndpointInset.limits,
  );
  expect(definitions.topSupportEndpointInset.limits.max).toBeCloseTo(
    12 * 25.4,
    6,
  );
  expect(definitions.bottomSupportEndpointInset.limits.max).toBeCloseTo(
    12 * 25.4,
    6,
  );
  expect(definitions.bottomSupportEdgeRadius.limits.max).toBeCloseTo(
    1.5 * 25.4,
    6,
  );
  expect(definitions.bottomSupportTopEdgeRadius.limits.max).toBeCloseTo(
    2 * 25.4,
    6,
  );
  expect(
    getHoverDiningTableParameterLimits(
      model,
      defaultParams,
      "topSupportEndpointInset",
    ).max,
  ).toBeCloseTo(
    getHoverDiningTableParameterLimits(
      model,
      defaultParams,
      "bottomSupportEndpointInset",
    ).max,
    6,
  );
  expect(
    getHoverDiningTableParameterLimits(
      model,
      defaultParams,
      "topSupportEndpointInset",
    ).max,
  ).toBeGreaterThan(8 * 25.4);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      defaultParams,
      "channelWidth",
    ).max,
  ).toBeLessThanOrEqual(
    getHoverDiningTableSpec(defaultParams).fullSize.braceSpanX / 6,
  );

  const expandedMembers = {
    ...defaultParams,
    frameSideWidth: 127,
    frameTopRailHeight: 63.5,
    frameBottomRailHeight: 63.5,
  };
  expect(
    getHoverDiningTableParameterLimits(
      model,
      expandedMembers,
      "topSupportWidth",
    ).max,
  ).toBeGreaterThan(2 * 25.4);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      expandedMembers,
      "topSupportThickness",
    ).max,
  ).toBeGreaterThan(1.5 * 25.4);
  const expanded = getHoverDiningTableSpec({
    ...expandedMembers,
    topSupportWidth: 63.5,
    bottomSupportWidth: 76.2,
    topSupportThickness: 50.8,
    bottomSupportThickness: 44.45,
  }).fullSize;
  expect(expanded.upperBrace.width).toBeCloseTo(2.5 * 25.4, 6);
  expect(expanded.lowerBrace.width).toBeCloseTo(3 * 25.4, 6);
  expect(expanded.upperBrace.thickness).toBeCloseTo(2 * 25.4, 6);
  expect(expanded.lowerBrace.thickness).toBeCloseTo(1.75 * 25.4, 6);

  const insetLowerSupport = getHoverDiningTableSpec({
    ...defaultParams,
    bottomSupportEndpointInset: 8 * 25.4,
  }).fullSize;
  expect(insetLowerSupport.lowerBrace.endpointInset).toBeCloseTo(8 * 25.4, 6);
  expect(insetLowerSupport.lowerBrace.endpointOuterY).toBeLessThanOrEqual(
    insetLowerSupport.lowerBrace.cornerTangentY,
  );
  const insetUpperSupport = getHoverDiningTableSpec({
    ...defaultParams,
    topSupportEndpointInset: 8 * 25.4,
  }).fullSize;
  expect(insetUpperSupport.upperBrace.endpointInset).toBeCloseTo(8 * 25.4, 6);
  expect(insetUpperSupport.upperBrace.endpointOuterY).toBeLessThanOrEqual(
    insetUpperSupport.upperBrace.cornerTangentY,
  );

  const expandedBottomSupportParams = {
    ...defaultParams,
    frameBottomRailHeight: 2.5 * 25.4,
    bottomSupportWidth: 3 * 25.4,
    bottomSupportThickness: 2.5 * 25.4,
  };
  expect(
    getHoverDiningTableParameterLimits(
      model,
      expandedBottomSupportParams,
      "bottomSupportEdgeRadius",
    ).max,
  ).toBeGreaterThan(1 * 25.4);
  const roundedLowerSupport = getHoverDiningTableSpec({
    ...expandedBottomSupportParams,
    bottomSupportEdgeRadius: 1 * 25.4,
  }).fullSize;
  expect(roundedLowerSupport.lowerBrace.edgeRadius).toBeCloseTo(1 * 25.4, 6);
  expect(roundedLowerSupport.lowerBrace.edgeRadius).toBeLessThan(
    roundedLowerSupport.lowerBrace.halfLapDepth,
  );

  const centerBoardParams = {
    ...defaultParams,
    bottomSupportStyle: 1,
    bottomSupportWidth: 2.4409 * 25.4,
    bottomSupportThickness: 1.4409 * 25.4,
  };
  expect(
    getHoverDiningTableParameterLimits(
      model,
      centerBoardParams,
      "bottomSupportEdgeRadius",
    ).max,
  ).toBeCloseTo((1.4409 / 2 - 1 / 16) * 25.4, 6);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      centerBoardParams,
      "bottomSupportTopEdgeRadius",
    ).max,
  ).toBeCloseTo((2.4409 / 2 - 1 / 16) * 25.4, 6);
  const deepRoundedCenterBoard = getHoverDiningTableSpec({
    ...centerBoardParams,
    bottomSupportTopEdgeRadius: 1 * 25.4,
  }).fullSize;
  expect(deepRoundedCenterBoard.lowerCenterBoard.topEdgeRadius).toBeCloseTo(
    1 * 25.4,
    6,
  );
  expect(deepRoundedCenterBoard.lowerCenterBoard.topEdgeRadius).toBeGreaterThan(
    deepRoundedCenterBoard.lowerBrace.halfLapDepth,
  );
  const centerBoardCutPart = getHoverDiningTableCutList(
    {
      ...centerBoardParams,
      bottomSupportTopEdgeRadius: 1 * 25.4,
    },
    model,
  ).parts.find((part) => part.id === "C1");
  expect(centerBoardCutPart).toBeDefined();
  expect(centerBoardCutPart!.fabricationProfile.section.topRadius).toBeCloseTo(
    1 * 25.4,
    6,
  );
  expect(
    centerBoardCutPart!.fabricationProfile.section.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(4);
  const centerBoardGeometry = createHoverDiningTableGeometry(
    {
      ...centerBoardParams,
      bottomSupportTopEdgeRadius: 1 * 25.4,
    },
    model,
  );
  expect(inspectGeometry(centerBoardGeometry).finite).toBe(true);
  centerBoardGeometry.dispose();
});

test("clamps top and bottom support thicknesses at one inch", async ({
  page,
}) => {
  await page.goto("/?model=hover-dining-table&unit=in");
  await page.getByRole("button", { name: "Top support members" }).click();
  const topThickness = page.getByLabel("Top support thickness in inches");
  await topThickness.fill("3/4");

  await expect(topThickness).toHaveValue("1");
  await expect(page).toHaveURL(/topSupportThickness=1/);

  await page.getByRole("button", { name: "Bottom support members" }).click();
  const bottomThickness = page.getByLabel(
    "Bottom support thickness in inches",
  );
  await bottomThickness.fill("3/4");

  await expect(bottomThickness).toHaveValue("1");
  await expect(page).toHaveURL(/bottomSupportThickness=1/);
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
});

test("accepts expanded support controls and a lower top round-over", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    "/?model=hover-dining-table&unit=in&frameBottomRailHeight=2.5&bottomSupportStyle=1&bottomSupportWidth=2.4409&bottomSupportThickness=1.4409",
  );
  await page.getByRole("button", { name: "Top support members" }).click();
  const topInsetInput = page.getByLabel(
    "Top support bearing-zone inset in inches",
  );
  await topInsetInput.fill("8");
  await page.getByRole("button", { name: "Bottom support members" }).click();
  const insetInput = page.getByLabel(
    "Bottom support bearing-zone inset in inches",
  );
  const topRoundOverInput = page.getByLabel(
    "Bottom support top round-over in inches",
  );
  await insetInput.fill("8");
  await topRoundOverInput.fill("1");

  await expect(topInsetInput).toHaveValue("8");
  await expect(insetInput).toHaveValue("8");
  await expect(topRoundOverInput).toHaveValue("1");
  await expect(page).toHaveURL(/topSupportEndpointInset=8/);
  await expect(page).toHaveURL(/bottomSupportEndpointInset=8/);
  await expect(page).toHaveURL(/bottomSupportTopEdgeRadius=1/);
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cut list" }).click();
  await expect(page.locator('.hover-cut-card[data-part-id="C1"]')).toContainText(
    "Top edge round-over",
  );
  await page.getByRole("button", { name: "Assembled" }).click();

  await page.getByRole("button", { name: "Support layout" }).click();
  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: /Cross bars \(X\)/ }).click();
  await expect(topRoundOverInput).not.toHaveValue("1");
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("edits and reloads both tabletop end treatments", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.goto("/?model=hover-dining-table&unit=in");
  await page.getByRole("button", { name: "Tabletop" }).click();
  const planRadius = page.getByLabel(
    "Tabletop plan corner radius in inches",
  );
  const endRoundover = page.getByLabel(
    "Tabletop length-end face round-over in inches",
  );
  await expect(planRadius).toHaveValue("0");
  await expect(endRoundover).toHaveValue("0");
  await planRadius.fill("2");
  await endRoundover.fill("1/4");
  await expect(page).toHaveURL(/topPlanCornerRadius=2/);
  await expect(page).toHaveURL(/topEndFaceRoundover=0\.248/);
  await expect(page.getByText(/2 in plan corners/)).toBeVisible();
  await expect(page.getByText(/1\/4 in length-end round-over/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Tabletop" }).click();
  await expect(planRadius).toHaveValue("2");
  await expect(endRoundover).toHaveValue("1/4");
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("optionally keeps top and bottom X crossbar dimensions synchronized", async ({
  page,
}) => {
  await page.goto(
    "/?model=hover-dining-table&unit=in&topSupportWidth=2.25&bottomSupportWidth=3&topSupportThickness=1.25&bottomSupportThickness=1.5&topSupportEndpointInset=0.5&bottomSupportEndpointInset=1&topSupportEdgeRadius=0.125&bottomSupportEdgeRadius=0.25",
  );
  await page.getByRole("button", { name: "Support layout" }).click();
  const syncToggle = page.getByLabel(
    "Keep top and bottom crossbars in sync",
  );
  await expect(syncToggle).toBeVisible();
  await expect(syncToggle).not.toBeChecked();
  await page
    .getByText("Keep top and bottom crossbars in sync", { exact: true })
    .click();
  await expect(syncToggle).toBeChecked();
  await expect(page).toHaveURL(/syncCrossbarDimensions=1/);

  await page.getByRole("button", { name: "Top support members" }).click();
  await page.getByRole("button", { name: "Bottom support members" }).click();
  const topWidth = page.getByLabel("Top support width in inches");
  const bottomWidth = page.getByLabel("Bottom support width in inches");
  const topThickness = page.getByLabel("Top support thickness in inches");
  const bottomThickness = page.getByLabel("Bottom support thickness in inches");
  const topInset = page.getByLabel(
    "Top support bearing-zone inset in inches",
  );
  const bottomInset = page.getByLabel(
    "Bottom support bearing-zone inset in inches",
  );
  const topRadius = page.getByLabel(
    "Top support bottom round-over in inches",
  );
  const bottomRadius = page.getByLabel(
    "Bottom support bottom round-over in inches",
  );

  await expect(bottomWidth).toHaveValue("2 1/4");
  await expect(bottomThickness).toHaveValue("1 1/4");
  await expect(bottomInset).toHaveValue("1/2");
  await expect(bottomRadius).toHaveValue("1/8");

  await bottomWidth.fill("2 1/2");
  await expect(topWidth).toHaveValue("2 1/2");
  await topThickness.fill("1 1/2");
  await expect(bottomThickness).toHaveValue("1 1/2");
  await topInset.fill("8");
  await expect(bottomInset).toHaveValue("8");
  await bottomRadius.fill("1/4");
  await expect(topRadius).toHaveValue("1/4");
  await expect(page).toHaveURL(/topSupportWidth=2\.5/);
  await expect(page).toHaveURL(/bottomSupportWidth=2\.5/);
  await expect(page).toHaveURL(/topSupportEndpointInset=8/);
  await expect(page).toHaveURL(/bottomSupportEndpointInset=8/);

  await page.reload();
  await page.getByRole("button", { name: "Support layout" }).click();
  await expect(syncToggle).toBeChecked();
  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: /Single center board/ }).click();
  await expect(syncToggle).toHaveCount(0);
  await page.getByRole("button", { name: "Bottom support members" }).click();
  await page.getByLabel("Bottom support width in inches").fill("3");
  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: /Cross bars \(X\)/ }).click();
  await expect(syncToggle).toBeVisible();
  await expect(syncToggle).toBeChecked();
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue(
    "2 1/2",
  );
});

test("supports independent half-inch end-box stiles", () => {
  const halfInch = 0.5 * 25.4;
  const narrowParams = {
    ...defaultParams,
    levelingFeetEnabled: 0,
    frameSideWidth: halfInch,
  };
  const definitions = Object.fromEntries(
    model.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(definitions.frameSideWidth.limits.min).toBeCloseTo(halfInch, 6);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      narrowParams,
      "frameSideWidth",
    ).min,
  ).toBeCloseTo(halfInch, 6);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      narrowParams,
      "topSupportWidth",
    ).max,
  ).toBeGreaterThan(halfInch);

  const spec = getHoverDiningTableSpec(narrowParams).fullSize;
  expect(spec.frameSideWidth).toBeCloseTo(halfInch, 6);
  expect(spec.upperBrace.width).toBeGreaterThan(spec.frameSideWidth);
  expect(spec.lowerBrace.width).toBeGreaterThan(spec.frameSideWidth);
  expect(spec.frameEdgeRoundover).toBeCloseTo(0.1875 * 25.4, 6);

  const cutList = getHoverDiningTableCutList(narrowParams);
  const stile = cutList.parts.find((part) => part.id === "B3")!;
  expect(stile.width).toBeCloseTo(halfInch, 5);
  const template = getHoverDiningTableTemplateSummary(
    narrowParams,
    model,
  ).templates.find((candidate) => candidate.kind === "vertical-stile")!;
  expect(template.finishedWidth).toBeCloseTo(stile.width, 5);

  const assembled = createHoverDiningTableGeometry(narrowParams, model);
  const assembledInspection = inspectGeometry(assembled);
  expect(assembledInspection.finite).toBe(true);
  expect(assembledInspection.degenerateTriangles).toBe(0);
  assembled.dispose();

  const exploded = createHoverDiningTableExplodedParts(narrowParams, model);
  for (const part of exploded) {
    const inspection = inspectGeometry(part.geometry);
    expect(inspection.finite, part.name).toBe(true);
    expect(inspection.degenerateTriangles, part.name).toBe(0);
    part.geometry.dispose();
  }
});

test("grades wobble risks and responds monotonically to structural parameters", () => {
  const baseline = getHoverDiningTableStructuralAssessment(defaultParams);
  expect(baseline.metrics).toHaveLength(6);
  expect(baseline.overallScore).toBeGreaterThanOrEqual(0);
  expect(baseline.overallScore).toBeLessThanOrEqual(100);
  expect(baseline.metrics.every((metric) =>
    Number.isFinite(metric.score) && metric.score >= 0 && metric.score <= 100,
  )).toBe(true);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(1, 10);
  expect(baseline.overallCalculation.formula).toContain(
    "23% × Lengthwise racking",
  );
  expect(baseline.overallCalculation.scoringNote).toContain(
    baseline.overallScore.toFixed(1),
  );
  for (const metric of baseline.metrics) {
    expect(metric.calculation.rationale.length, metric.key).toBeGreaterThan(40);
    expect(metric.calculation.formula.length, metric.key).toBeGreaterThan(20);
    expect(metric.calculation.inputs.length, metric.key).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(metric.calculation.rawScore), metric.key).toBe(true);
    expect(metric.calculation.scoringNote, metric.key).toContain(
      `${(metric.calculation.weight * 100).toFixed(0)}%`,
    );
    expect(
      new Set(metric.calculation.inputs.map((input) => input.key)).size,
      metric.key,
    ).toBe(metric.calculation.inputs.length);
  }
  expect(
    baseline.metrics
      .find((metric) => metric.key === "longitudinal-racking")!
      .calculation.inputs.map((input) => input.key),
  ).toEqual(
    expect.arrayContaining([
      "overallHeight",
      "topSupportStyle",
      "topSupportWidth",
      "bottomSupportStyle",
      "bottomSupportWidth",
    ]),
  );
  expect(
    baseline.metrics
      .find((metric) => metric.key === "torsion")!
      .calculation.inputs.map((input) => input.key),
  ).toEqual(
    expect.arrayContaining([
      "channelWidth",
      "channelDepth",
      "channelWallThickness",
      "channelLengthCoverage",
      "channelDistributionFactor",
      "channelTorsionFactor",
    ]),
  );
  expect(
    baseline.metrics
      .find((metric) => metric.key === "member-stiffness")!
      .calculation.inputs.map((input) => input.key),
  ).toEqual(
    expect.arrayContaining([
      "channelStripFraction",
      "channelTransformedSectionRatio",
      "topPlaneStiffnessFactor",
      "effectiveTopThickness",
      "tabletopSlenderness",
      "materialAssumption",
    ]),
  );
  expect(baseline.heightSensitivity.lower?.delta).toBeGreaterThan(0);
  expect(baseline.heightSensitivity.higher?.delta).toBeLessThan(0);

  const taller = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    overallHeight: defaultParams.overallHeight + 6 * 25.4,
  });
  expect(taller.overallScore).toBeLessThan(baseline.overallScore);
  for (const key of ["end-box-racking", "tipping", "member-stiffness"] as const) {
    expect(
      taller.metrics.find((metric) => metric.key === key)!.score,
      key,
    ).toBeLessThan(
      baseline.metrics.find((metric) => metric.key === key)!.score,
    );
  }

  const openFloor = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    topSupportStyle: 1,
    bottomSupportStyle: 2,
  });
  expect(
    openFloor.metrics.find((metric) => metric.key === "torsion")!.score,
  ).toBeLessThan(
    baseline.metrics.find((metric) => metric.key === "torsion")!.score,
  );
  expect(
    openFloor.metrics.find((metric) => metric.key === "longitudinal-racking")!
      .score,
  ).toBeLessThan(
    baseline.metrics.find((metric) => metric.key === "longitudinal-racking")!
      .score,
  );
  expect(
    openFloor.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  ).toBe(
    baseline.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  );
  const fixedFloorX = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    levelingFeetEnabled: 0,
  });
  const fixedOpenFloor = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    levelingFeetEnabled: 0,
    bottomSupportStyle: 2,
  });
  expect(
    baseline.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  ).toBeGreaterThan(
    fixedFloorX.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  );
  expect(
    fixedOpenFloor.metrics.find((metric) => metric.key === "floor-rocking")!
      .score,
  ).toBeGreaterThan(
    fixedFloorX.metrics.find((metric) => metric.key === "floor-rocking")!.score,
  );

  const widerBoxes = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    frameSideWidth: 3.5 * 25.4,
    frameDepth: 3.5 * 25.4,
  });
  expect(
    widerBoxes.metrics.find((metric) => metric.key === "end-box-racking")!
      .score,
  ).toBeGreaterThan(
    baseline.metrics.find((metric) => metric.key === "end-box-racking")!
      .score,
  );

  const lighterChannels = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    channelSideInset: 4 * 25.4,
    channelWidth: 1 * 25.4,
    channelDepth: 0.25 * 25.4,
    channelWallThickness: 0.0625 * 25.4,
  });
  const heavierChannels = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    channelSideInset: 0.625 * 25.4,
    channelWidth: 3 * 25.4,
    channelDepth: 0.5 * 25.4,
    channelWallThickness: 0.1875 * 25.4,
  });
  for (const key of ["torsion", "member-stiffness"] as const) {
    expect(
      lighterChannels.metrics.find((metric) => metric.key === key)!.score,
      `${key} with lighter C-channels`,
    ).toBeLessThan(
      baseline.metrics.find((metric) => metric.key === key)!.score,
    );
    expect(
      heavierChannels.metrics.find((metric) => metric.key === key)!.score,
      `${key} with heavier C-channels`,
    ).toBeGreaterThan(
      baseline.metrics.find((metric) => metric.key === key)!.score,
    );
  }

  const clusteredChannels = getHoverDiningTableStructuralAssessment({
    ...defaultParams,
    channelEndClearance: 10 * 25.4,
  });
  expect(
    clusteredChannels.metrics.find((metric) => metric.key === "torsion")!
      .score,
  ).toBeLessThan(
    baseline.metrics.find((metric) => metric.key === "torsion")!.score,
  );
  expect(
    clusteredChannels.metrics.find(
      (metric) => metric.key === "member-stiffness",
    )!.score,
  ).toBe(
    baseline.metrics.find((metric) => metric.key === "member-stiffness")!
      .score,
  );
});

test("documents each structural formula with its implementation", () => {
  const structuralSpec = fs.readFileSync(
    path.join(root, "docs/hover-dining-table-audit-specifications.md"),
    "utf8",
  );
  for (const [heading, sourceLines] of [
    ["Overall weighting and grades", "L4843-L4866"],
    ["Lengthwise racking", "L4272-L4291"],
    ["End-box racking", "L4293-L4300"],
    ["Torsional rigidity", "L4302-L4332"],
    ["Tipping margin", "L4334-L4347"],
    ["Floor rocking tolerance", "L4349-L4370"],
    ["Member stiffness", "L4372-L4398"],
  ] as const) {
    expect(structuralSpec).toContain(`### ${heading}`);
    expect(structuralSpec).toContain(
      `../src/models/hoverDiningTable.ts#${sourceLines}`,
    );
  }
  expect(structuralSpec).toContain("### C-channel transformed-section model");
  expect(structuralSpec).toContain(
    "../src/models/hoverDiningTable.ts#L4181-L4267",
  );
});

test("keeps one-inch rail heights independent from thicker supports", () => {
  const transientParams = {
    ...defaultParams,
    frameSideWidth: 4 * 25.4,
    frameTopRailHeight: 1 * 25.4,
    frameBottomRailHeight: 1 * 25.4,
    topSupportWidth: 4 * 25.4,
    bottomSupportWidth: 3 * 25.4,
    topSupportThickness: 2 * 25.4,
    bottomSupportThickness: 1.5 * 25.4,
  };

  const spec = getHoverDiningTableSpec(transientParams).fullSize;
  expect(spec.frameSideWidth).toBeCloseTo(transientParams.frameSideWidth, 6);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      transientParams,
      "frameTopRailHeight",
    ).min,
  ).toBeCloseTo(1 * 25.4, 6);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      transientParams,
      "frameBottomRailHeight",
    ).min,
  ).toBeCloseTo(1 * 25.4, 6);
  expect(spec.frameTopRailHeight).toBeCloseTo(1 * 25.4, 6);
  expect(spec.frameBottomRailHeight).toBeCloseTo(1 * 25.4, 6);
  expect(spec.upperBrace.thickness).toBeCloseTo(2 * 25.4, 6);
  expect(spec.lowerBrace.thickness).toBeCloseTo(1.5 * 25.4, 6);

  const geometry = createHoverDiningTableGeometry(transientParams, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  geometry.dispose();
});

test("loads one-inch rails with thicker supports", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    "/?model=hover-dining-table&unit=in&frameTopRailHeight=1&frameBottomRailHeight=1&topSupportThickness=1.5&bottomSupportThickness=1.5",
  );
  await page.getByRole("button", { name: "End boxes" }).click();

  await expect(page.getByLabel("End-box top rail height in inches")).toHaveValue(
    "1",
  );
  await expect(
    page.getByLabel("End-box bottom rail height in inches"),
  ).toHaveValue("1");
  await expect(page).toHaveURL(/frameTopRailHeight=1/);
  await expect(page).toHaveURL(/frameBottomRailHeight=1/);
  await expect(page).toHaveURL(/topSupportThickness=1\.5/);
  await expect(page).toHaveURL(/bottomSupportThickness=1\.5/);
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("explodes the assembly into wood parts, channels, and four leveling feet", () => {
  const parts = createHoverDiningTableExplodedParts(defaultParams, model);
  const { scaled: spec } = getHoverDiningTableSpec(defaultParams);
  expect(parts).toHaveLength(20);
  expect(new Set(parts.map((part) => part.name)).size).toBe(20);
  expect(
    Object.fromEntries(
      [...new Set(parts.map((part) => part.category))].map((category) => [
        category,
        parts.filter((part) => part.category === category).length,
      ]),
    ),
  ).toEqual({
    tabletop: 1,
    "tabletop-hardware": 3,
    "end-box-horizontal": 4,
    "end-box-vertical": 4,
    "upper-x": 2,
    "floor-x": 2,
    "leveling-foot": 4,
  });

  const horizontalBoxParts = parts.filter(
    (part) => part.category === "end-box-horizontal",
  );
  const verticalBoxParts = parts.filter(
    (part) => part.category === "end-box-vertical",
  );
  for (const part of horizontalBoxParts) {
    const profile = part.fabricationProfile;
    expect(profile.family, part.name).toBe("frame-rail");
    expect(
      profile.outline.filter((command) => command.kind === "cubic"),
      `${part.name} four shared curve segments`,
    ).toHaveLength(4);
    expect(
      profile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${part.name} square tangent seams`,
    ).toHaveLength(2);
    const top = part.name.includes("top");
    expect(profile.bezier?.outerRadius, part.name).toBeCloseTo(
      top
        ? spec.frameOuterTopCornerRadius
        : spec.frameOuterBottomCornerRadius,
      6,
    );
    expect(profile.bezier?.innerRadius, part.name).toBeCloseTo(
      top
        ? spec.frameInnerTopCornerRadius
        : spec.frameInnerBottomCornerRadius,
      6,
    );
    expect(profile.section.radius, part.name).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
    expect(uniqueAxisCoordinates(part.geometry, "x"), part.name).toBeGreaterThan(
      model.geometry.bevelSegments * 2,
    );
  }
  for (const part of verticalBoxParts) {
    const profile = part.fabricationProfile;
    expect(profile.family, part.name).toBe("frame-stile");
    expect(
      profile.outline.filter((command) => command.kind === "cubic"),
      `${part.name} derives splay without fake corner curves`,
    ).toHaveLength(0);
    expect(
      profile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${part.name} square rail seams`,
    ).toHaveLength(2);
    expect(profile.section.radius, part.name).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
    expect(uniqueAxisCoordinates(part.geometry, "x"), part.name).toBeGreaterThan(
      model.geometry.bevelSegments * 2,
    );
  }

  const tabletopProfile = parts.find(
    (part) => part.category === "tabletop",
  )!.fabricationProfile;
  expect(tabletopProfile.family).toBe("tabletop");
  expect(
    tabletopProfile.section.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(2);

  for (const [category, brace] of [
    ["upper-x", spec.upperBrace],
    ["floor-x", spec.lowerBrace],
  ] as const) {
    const members = parts.filter((part) => part.category === category);
    expect(members, category).toHaveLength(2);
    members.forEach((member, memberIndex) => {
      expect(member.fabricationProfile.family, member.name).toBe("brace");
      expect(member.fabricationProfile.section.radius, member.name).toBeCloseTo(
        brace.edgeRadius,
        6,
      );
      expect(
        member.fabricationProfile.section.outline.filter(
          (command) => command.kind === "cubic",
        ),
        `${member.name} rounded section`,
      ).toHaveLength(2);
      member.geometry.computeBoundingBox();
      const bounds = member.geometry.boundingBox!;
      expect(bounds.min.x, member.name).toBeCloseTo(-brace.spanX / 2, 4);
      expect(bounds.max.x, member.name).toBeCloseTo(brace.spanX / 2, 4);

      for (const endSign of [-1, 1] as const) {
        const contact = inspectPlanarContactFace(
          member.geometry,
          endSign * brace.spanX / 2,
        );
        expect(contact.triangleCount, `${member.name} contact ${endSign}`).toBeGreaterThan(0);
        expect(contact.minimumAbsoluteNormalX, `${member.name} contact normal`).toBeCloseTo(1, 5);
        expect(contact.ySpan, `${member.name} full-width contact`).toBeCloseTo(
          brace.miterHalfWidth * 2,
          4,
        );
        expect(contact.zSpan, `${member.name} full-depth contact`).toBeCloseTo(
          brace.thickness,
          4,
        );
        expect(contact.area, `${member.name} useful contact area`).toBeGreaterThan(
          brace.width * brace.thickness * 0.7,
        );
      }

      const center = centerlineZRange(member.geometry);
      expect(center.count, `${member.name} centered pocket`).toBeGreaterThan(0);
      if (memberIndex === 0) {
        expect(center.min, `${member.name} lower envelope`).toBeCloseTo(
          brace.zBottom,
          4,
        );
        expect(center.max, `${member.name} top-pocket depth`).toBeCloseTo(
          (brace.zBottom + brace.zTop - spec.halfLapClearance) / 2,
          4,
        );
      } else {
        expect(center.min, `${member.name} bottom-pocket depth`).toBeCloseTo(
          (brace.zBottom + brace.zTop + spec.halfLapClearance) / 2,
          4,
        );
        expect(center.max, `${member.name} upper envelope`).toBeCloseTo(
          brace.zTop,
          4,
        );
      }
    });
  }

  for (const part of parts) {
    const inspected = inspectGeometry(part.geometry);
    expect(inspected.finite, part.name).toBe(true);
    expect(inspected.degenerateTriangles, part.name).toBe(0);
    expect(inspected.size.x, part.name).toBeGreaterThan(0);
    expect(inspected.size.y, part.name).toBeGreaterThan(0);
    expect(inspected.size.z, part.name).toBeGreaterThan(0);
    if (part.material === "Oak") {
      const woodUvs = inspectWoodUvs(part.geometry);
      expect(woodUvs.finite, part.name).toBe(true);
      expect(woodUvs.inUnitRange, part.name).toBe(true);
      expect(woodUvs.count, part.name).toBe(inspected.position.count);
    }
    expect(part.offset.toArray().every(Number.isFinite), part.name).toBe(true);
    part.geometry.dispose();
  }
});

test("derives assembled, exploded, and cut-list geometry for all six support layouts", () => {
  const variants = [
    { top: 0, bottom: 0, pieces: 20, lines: 10, topCategory: "upper-x", bottomCategory: "floor-x" },
    { top: 0, bottom: 1, pieces: 19, lines: 9, topCategory: "upper-x", bottomCategory: "floor-center-board" },
    { top: 0, bottom: 2, pieces: 18, lines: 8, topCategory: "upper-x", bottomCategory: null },
    { top: 1, bottom: 0, pieces: 20, lines: 9, topCategory: "upper-stretcher", bottomCategory: "floor-x" },
    { top: 1, bottom: 1, pieces: 19, lines: 8, topCategory: "upper-stretcher", bottomCategory: "floor-center-board" },
    { top: 1, bottom: 2, pieces: 18, lines: 7, topCategory: "upper-stretcher", bottomCategory: null },
  ] as const;

  for (const variant of variants) {
    const params = {
      ...defaultParams,
      topSupportStyle: variant.top,
      bottomSupportStyle: variant.bottom,
    };
    const { scaled: spec } = getHoverDiningTableSpec(params);
    expect(spec.topSupportStyle).toBe(variant.top === 0 ? "x" : "stretchers");
    expect(spec.bottomSupportStyle).toBe(
      variant.bottom === 0
        ? "x"
        : variant.bottom === 1
          ? "center-board"
          : "none",
    );
    expect(getHoverDiningTablePieceCount(params)).toBe(variant.pieces);

    const geometry = createHoverDiningTableGeometry(params, model);
    const inspected = inspectGeometry(geometry);
    expect(inspected.finite, `${variant.top}/${variant.bottom} assembled`).toBe(true);
    expect(inspected.degenerateTriangles).toBe(0);
    expect(inspected.min.z).toBeCloseTo(spec.frameBottomZ, 5);
    expect(inspected.size.x).toBeCloseTo(spec.length, 4);
    expect(inspected.size.y).toBeCloseTo(spec.width, 4);
    expect(inspected.size.z).toBeCloseTo(spec.height - spec.frameBottomZ, 4);
    geometry.dispose();

    const exploded = createHoverDiningTableExplodedParts(params, model);
    expect(exploded).toHaveLength(variant.pieces);
    expect(exploded.filter((part) => part.category === "tabletop-hardware")).toHaveLength(3);
    expect(exploded.filter((part) => part.category === "leveling-foot")).toHaveLength(4);
    expect(exploded.filter((part) => part.category === variant.topCategory)).toHaveLength(2);
    expect(exploded.filter((part) => part.category === "upper-x")).toHaveLength(
      variant.top === 0 ? 2 : 0,
    );
    expect(exploded.filter((part) => part.category === "upper-stretcher")).toHaveLength(
      variant.top === 1 ? 2 : 0,
    );
    expect(exploded.filter((part) => part.category === "floor-x")).toHaveLength(
      variant.bottom === 0 ? 2 : 0,
    );
    expect(
      exploded.filter((part) => part.category === "floor-center-board"),
    ).toHaveLength(variant.bottom === 1 ? 1 : 0);
    if (variant.bottomCategory) {
      for (const part of exploded.filter(
        (candidate) => candidate.category === variant.bottomCategory,
      )) {
        part.geometry.computeBoundingBox();
        expect(part.geometry.boundingBox!.min.z).toBeCloseTo(spec.frameBottomZ, 5);
      }
    }
    for (const part of exploded.filter(
      (candidate) => candidate.category === variant.topCategory,
    )) {
      part.geometry.computeBoundingBox();
      expect(part.geometry.boundingBox!.max.z).toBeCloseTo(spec.topBottom, 5);
    }

    const cutList = getHoverDiningTableCutList(params);
    expect(cutList.totalPieces).toBe(variant.pieces);
    expect(cutList.parts).toHaveLength(variant.lines);
    expect(cutList.parts.filter((part) => part.lap)).toHaveLength(
      (variant.top === 0 ? 2 : 0) + (variant.bottom === 0 ? 2 : 0),
    );
    expect(cutList.parts.filter((part) => part.kind === "support")).toHaveLength(
      (variant.top === 1 ? 1 : 0) + (variant.bottom === 1 ? 1 : 0),
    );
    for (const cutPart of cutList.parts) {
      const cutGeometry = createHoverDiningTableCutPartGeometry(
        params,
        model,
        cutPart.id,
      );
      const cutInspection = inspectGeometry(cutGeometry);
      expect(cutInspection.finite, `${variant.top}/${variant.bottom} ${cutPart.id}`).toBe(
        true,
      );
      expect(
        cutInspection.degenerateTriangles,
        `${variant.top}/${variant.bottom} ${cutPart.id}`,
      ).toBe(0);
      expect(cutInspection.size.x).toBeGreaterThan(0);
      expect(cutInspection.size.y).toBeGreaterThan(0);
      expect(cutInspection.size.z).toBeGreaterThan(0);
      cutGeometry.dispose();
    }
    exploded.forEach((part) => part.geometry.dispose());
  }

  const originalStretchers = getHoverDiningTableSpec({
    ...defaultParams,
    topSupportStyle: 1,
  }).fullSize.upperStretchers;
  expect(originalStretchers.centerYs[0]).toBeCloseTo(
    -originalStretchers.centerYs[1],
    6,
  );
  expect(
    Math.abs(originalStretchers.centerYs[0]) +
      originalStretchers.width / 2 +
      originalStretchers.endpointInset,
  ).toBeCloseTo(originalStretchers.placementBoundaryY!, 6);
});

test("derives a full-size finished cut schedule including four leveling feet", () => {
  const cutList = getHoverDiningTableCutList(defaultParams);
  const { fullSize: spec } = getHoverDiningTableSpec(defaultParams);
  expect(cutList.material).toBe("White oak + blackened steel");
  expect(cutList.dimensionBasis).toBe("full-size finished dimensions");
  expect(cutList.totalPieces).toBe(20);
  expect(cutList.parts).toHaveLength(10);
  expect(cutList.parts.reduce((sum, part) => sum + part.quantity, 0)).toBe(20);
  expect(cutList.parts.map((part) => part.id)).toEqual([
    "T1",
    "H1",
    "L1",
    "B1",
    "B2",
    "B3",
    "U1",
    "U2",
    "F1",
    "F2",
  ]);

  const tabletop = cutList.parts.find((part) => part.id === "T1")!;
  expect(tabletop.length).toBeCloseTo(defaultParams.tableLength, 6);
  expect(tabletop.width).toBeCloseTo(defaultParams.tableWidth, 6);
  expect(tabletop.fabricationProfile.family).toBe("tabletop");
  expect(
    tabletop.fabricationProfile.section.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(2);
  expect(tabletop.fabricationProfile.section.radius).toBeCloseTo(
    spec.topEdgeRoll,
    6,
  );

  const channel = cutList.parts.find((part) => part.id === "H1")!;
  expect(channel.quantity).toBe(3);
  expect(channel.material).toBe("Steel");
  expect(channel.grainDirection).toBe("n/a");
  expect(channel.length).toBeCloseTo(spec.channels.length, 6);
  expect(channel.width).toBeCloseTo(spec.channels.width, 6);
  expect(channel.thickness).toBeCloseTo(spec.channels.depth, 6);
  expect(channel.fabricationProfile.family).toBe("channel");
  expect(channel.fabricationProfile.section.radius).toBe(0);
  expect(channel.fabricationProfile.section.outline).toHaveLength(9);

  const levelingFoot = cutList.parts.find((part) => part.id === "L1")!;
  expect(levelingFoot.quantity).toBe(4);
  expect(levelingFoot.material).toBe("Steel");
  expect(levelingFoot.fabricationProfile.family).toBe("leveling-foot");
  expect(levelingFoot.width).toBeCloseTo(spec.levelingFeet.padDiameter, 6);

  for (const id of ["B1", "B2"] as const) {
    const rail = cutList.parts.find((part) => part.id === id)!;
    expect(rail.fabricationProfile.family, id).toBe("frame-rail");
    expect(
      rail.fabricationProfile.outline.filter(
        (command) => command.kind === "cubic",
      ),
      `${id} exact routed returns`,
    ).toHaveLength(4);
    expect(
      rail.fabricationProfile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${id} square glue seams`,
    ).toHaveLength(2);
    const top = id === "B1";
    expect(rail.fabricationProfile.bezier).toEqual({
      outerRadius: top
        ? spec.frameOuterTopCornerRadius
        : spec.frameOuterBottomCornerRadius,
      innerRadius: top
        ? spec.frameInnerTopCornerRadius
        : spec.frameInnerBottomCornerRadius,
      outerRailTension: spec.frameOuterRailCurveTension,
      outerStileTension: spec.frameOuterStileCurveTension,
      innerRailTension: spec.frameInnerRailCurveTension,
      innerStileTension: spec.frameInnerStileCurveTension,
    });
    expect(rail.fabricationProfile.section.radius).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
  }
  const topRail = cutList.parts.find((part) => part.id === "B1")!;
  const bottomRail = cutList.parts.find((part) => part.id === "B2")!;
  expect(topRail.width).toBeGreaterThan(spec.frameTopRailHeight);
  expect(bottomRail.width).toBeGreaterThan(spec.frameBottomRailHeight);

  const stile = cutList.parts.find((part) => part.id === "B3")!;
  expect(stile.fabricationProfile.family).toBe("frame-stile");
  expect(
    stile.fabricationProfile.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(0);
  expect(
    stile.fabricationProfile.outline.filter(
      (command) =>
        command.kind !== "move" && command.edgeTreatment === "square",
    ),
  ).toHaveLength(2);
  expect(stile.fabricationProfile.section.radius).toBeCloseTo(
    spec.frameEdgeRoundover,
    6,
  );
  const upperMembers = cutList.parts.filter((part) => part.assembly === "upper X");
  expect(upperMembers).toHaveLength(2);
  expect(upperMembers.map((part) => part.lap?.face)).toEqual(["top", "bottom"]);
  for (const part of cutList.parts) {
    expect(part.quantity, part.id).toBeGreaterThan(0);
    expect(part.length, part.id).toBeGreaterThan(0);
    expect(part.width, part.id).toBeGreaterThan(0);
    expect(part.thickness, part.id).toBeGreaterThan(0);
    expect(
      part.fabricationProfile.bounds.maxX -
        part.fabricationProfile.bounds.minX,
      `${part.id} profile width`,
    ).toBeGreaterThan(0);
    expect(
      part.fabricationProfile.bounds.maxY -
        part.fabricationProfile.bounds.minY,
      `${part.id} profile height`,
    ).toBeGreaterThan(0);
    if (part.kind === "channel") {
      expect(
        part.fabricationProfile.section.outline.some(
          (command) => command.kind === "cubic",
        ),
      ).toBe(false);
    } else {
      expect(
        part.fabricationProfile.section.outline.some(
          (command) => command.kind === "cubic",
        ),
        `${part.id} edge-treatment section`,
      ).toBe(true);
    }
    if (part.lap) {
      expect(part.lap.centerFromEnd, part.id).toBeCloseTo(part.length / 2, 6);
      expect(part.lap.length, part.id).toBeGreaterThan(part.width);
      expect(part.lap.depth, part.id).toBeLessThan(part.thickness);
      expect(part.lap.shoulderAngleDegrees, part.id).toBeGreaterThan(0);
      expect(part.lap.shoulderAngleDegrees, part.id).toBeLessThan(90);
    }
  }

  const changedScale = getHoverDiningTableCutList({
    ...defaultParams,
    mockScale: defaultParams.mockScale * 2,
  });
  expect(changedScale.parts).toEqual(cutList.parts);

  const changedCurves = getHoverDiningTableCutList({
    ...defaultParams,
    frameInnerTopCornerRadius:
      defaultParams.frameInnerTopCornerRadius + 12.7,
    frameInnerRailCurveTension: 0.64,
    frameInnerStileCurveTension: 0.64,
  });
  const changedTopRail = changedCurves.parts.find((part) => part.id === "B1")!;
  expect(changedTopRail.width).toBeGreaterThan(topRail.width);
  expect(changedTopRail.fabricationProfile.outline).not.toEqual(
    topRail.fabricationProfile.outline,
  );
  expect(changedTopRail.fabricationProfile.bezier?.innerRadius).toBeCloseTo(
    spec.frameInnerTopCornerRadius + 12.7,
    6,
  );
  expect(changedTopRail.fabricationProfile.bezier?.innerRailTension).toBe(0.64);
  expect(changedTopRail.fabricationProfile.bezier?.innerStileTension).toBe(0.64);

  const changedBottomRadii = getHoverDiningTableCutList({
    ...defaultParams,
    levelingFootRodDiameter: 0.25 * 25.4,
    frameOuterBottomCornerRadius:
      defaultParams.frameOuterBottomCornerRadius + 6.35,
    frameInnerBottomCornerRadius:
      defaultParams.frameInnerBottomCornerRadius + 6.35,
  });
  const radiusChangedTop = changedBottomRadii.parts.find(
    (part) => part.id === "B1",
  )!;
  const radiusChangedBottom = changedBottomRadii.parts.find(
    (part) => part.id === "B2",
  )!;
  expect(radiusChangedTop.fabricationProfile.outline).toEqual(
    topRail.fabricationProfile.outline,
  );
  expect(radiusChangedBottom.fabricationProfile.outline).not.toEqual(
    bottomRail.fabricationProfile.outline,
  );

  const firstOuterCubic = (params: ModelParams) => {
    const rail = getHoverDiningTableCutList(params).parts.find(
      (part) => part.id === "B1",
    )!;
    const command = rail.fabricationProfile.outline.find(
      (candidate) => candidate.kind === "cubic",
    );
    if (!command || command.kind !== "cubic") {
      throw new Error("Top rail must begin with an outer cubic return");
    }
    return { command, bezier: rail.fabricationProfile.bezier! };
  };
  const baseOuter = firstOuterCubic(defaultParams);
  const railSweepChanged = firstOuterCubic({
    ...defaultParams,
    frameOuterRailCurveTension: 0.72,
  });
  const stileSweepChanged = firstOuterCubic({
    ...defaultParams,
    frameOuterStileCurveTension: 0.72,
  });
  expect(railSweepChanged.command.control1).toEqual(
    baseOuter.command.control1,
  );
  expect(railSweepChanged.command.control2).not.toEqual(
    baseOuter.command.control2,
  );
  expect(stileSweepChanged.command.control1).not.toEqual(
    baseOuter.command.control1,
  );
  expect(stileSweepChanged.command.control2).toEqual(
    baseOuter.command.control2,
  );
  expect(railSweepChanged.bezier.outerRailTension).toBe(0.72);
  expect(railSweepChanged.bezier.outerStileTension).toBe(0.552);
  expect(stileSweepChanged.bezier.outerRailTension).toBe(0.552);
  expect(stileSweepChanged.bezier.outerStileTension).toBe(0.72);

  const firstInnerCubic = (params: ModelParams) => {
    const rail = getHoverDiningTableCutList(params).parts.find(
      (part) => part.id === "B1",
    )!;
    const command = rail.fabricationProfile.outline.filter(
      (candidate) => candidate.kind === "cubic",
    )[2];
    if (!command || command.kind !== "cubic") {
      throw new Error("Top rail must retain its inner cubic return");
    }
    return { command, bezier: rail.fabricationProfile.bezier! };
  };
  const baseInner = firstInnerCubic(defaultParams);
  const innerRailSweepChanged = firstInnerCubic({
    ...defaultParams,
    frameInnerRailCurveTension: 0.72,
  });
  const innerStileSweepChanged = firstInnerCubic({
    ...defaultParams,
    frameInnerStileCurveTension: 0.72,
  });
  expect(innerRailSweepChanged.command.control1).toEqual(
    baseInner.command.control1,
  );
  expect(innerRailSweepChanged.command.control2).not.toEqual(
    baseInner.command.control2,
  );
  expect(innerStileSweepChanged.command.control1).not.toEqual(
    baseInner.command.control1,
  );
  expect(innerStileSweepChanged.command.control2).toEqual(
    baseInner.command.control2,
  );
  expect(innerRailSweepChanged.bezier.innerRailTension).toBe(0.72);
  expect(innerRailSweepChanged.bezier.innerStileTension).toBe(0.58);
  expect(innerStileSweepChanged.bezier.innerRailTension).toBe(0.58);
  expect(innerStileSweepChanged.bezier.innerStileTension).toBe(0.72);
});

test("builds three full-size routing templates as plate-safe dovetailed STLs", () => {
  const expectTemplateParity = (params: ModelParams) => {
    const cutList = getHoverDiningTableCutList(params);
    const templateSummary = getHoverDiningTableTemplateSummary(params, model);
    for (const [templateKind, cutPartId] of [
      ["top-rail", "B1"],
      ["bottom-rail", "B2"],
      ["vertical-stile", "B3"],
    ] as const) {
      const template = templateSummary.templates.find(
        (candidate) => candidate.kind === templateKind,
      )!;
      const cutPart = cutList.parts.find((candidate) => candidate.id === cutPartId)!;
      expect(template.finishedLength, `${templateKind} length`).toBeCloseTo(
        cutPart.length,
        5,
      );
      expect(template.finishedWidth, `${templateKind} width`).toBeCloseTo(
        cutPart.width,
        5,
      );
    }
  };

  const summary = getHoverDiningTableTemplateSummary(defaultParams, model);
  expectTemplateParity(defaultParams);
  expect(summary.thickness).toBeCloseTo(3.175, 6);
  expect(summary.plateLength).toBeCloseTo(228.6, 6);
  expect(summary.dovetailDepth).toBeCloseTo(12.7, 6);
  expect(summary.jointClearance).toBeCloseTo(0.2, 6);
  expect(summary.templates.map((template) => template.kind)).toEqual([
    "top-rail",
    "bottom-rail",
    "vertical-stile",
  ]);
  expect(summary.templates.every((template) => template.segmentCount >= 2)).toBe(true);

  const segments = createHoverDiningTableTemplateSegments(
    defaultParams,
    model,
  );
  expect(segments).toHaveLength(summary.totalSegments);
  expect(new Set(segments.map((segment) => segment.fileName)).size).toBe(
    segments.length,
  );
  for (const kind of ["top-rail", "bottom-rail", "vertical-stile"] as const) {
    const family = segments.filter((segment) => segment.template === kind);
    const template = summary.templates.find(
      (candidate) => candidate.kind === kind,
    )!;
    expect(family).toHaveLength(
      template.segmentCount,
    );
    family.forEach((segment, index) => {
      expect(segment.index).toBe(index);
      expect(segment.count).toBe(family.length);
      expect(segment.jointStart).toBe(index === 0 ? "none" : "female");
      expect(segment.jointEnd).toBe(
        index === family.length - 1 ? "none" : "male",
      );
      expect(segment.fileName).toContain(`${kind}-template-part-`);
      const inspected = inspectGeometry(segment.geometry);
      expect(inspected.finite, segment.fileName).toBe(true);
      expect(inspected.degenerateTriangles, segment.fileName).toBe(0);
      expect(inspected.min.x, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.min.y, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.min.z, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.size.x, segment.fileName).toBeLessThanOrEqual(
        summary.plateLength + 1e-4,
      );
      expect(inspected.size.y, segment.fileName).toBeLessThanOrEqual(
        summary.plateLength + 1e-4,
      );
      expect(inspected.size.z, segment.fileName).toBeCloseTo(
        summary.thickness,
        5,
      );
      expect(segment.assemblyOffset.toArray().every(Number.isFinite)).toBe(true);
    });
    const assembledBounds = family.reduce(
      (bounds, segment) => {
        segment.geometry.computeBoundingBox();
        const geometryBounds = segment.geometry.boundingBox!;
        bounds.minX = Math.min(bounds.minX, segment.assemblyOffset.x);
        bounds.maxX = Math.max(
          bounds.maxX,
          segment.assemblyOffset.x + geometryBounds.max.x,
        );
        bounds.minY = Math.min(bounds.minY, segment.assemblyOffset.y);
        bounds.maxY = Math.max(
          bounds.maxY,
          segment.assemblyOffset.y + geometryBounds.max.y,
        );
        return bounds;
      },
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );
    expect(assembledBounds.maxX - assembledBounds.minX).toBeCloseTo(
      template.finishedLength,
      4,
    );
    expect(assembledBounds.maxY - assembledBounds.minY).toBeCloseTo(
      template.finishedWidth,
      4,
    );
    family.forEach((segment) => segment.geometry.dispose());
  }

  const preview = createHoverDiningTableTemplateSegments(
    defaultParams,
    model,
    defaultParams.mockScale,
  );
  expect(preview).toHaveLength(summary.totalSegments);
  preview.forEach((segment) => {
    const inspected = inspectGeometry(segment.geometry);
    expect(inspected.size.z).toBeCloseTo(
      summary.thickness / defaultParams.mockScale,
      5,
    );
    segment.geometry.dispose();
  });

  const smallerPlate = getHoverDiningTableTemplateSummary(
    { ...defaultParams, templatePlateLength: 177.8 },
    model,
  );
  expect(smallerPlate.totalSegments).toBeGreaterThan(summary.totalSegments);

  const splayedParams = {
    ...defaultParams,
    tableWidth: 40 * 25.4,
    overallHeight: 30 * 25.4,
    topThickness: 1.5 * 25.4,
    sideOverhang: 3 * 25.4,
    frameDepth: 2 * 25.4,
    frameSideWidth: 2.5 * 25.4,
    frameBottomRailHeight: 1.5 * 25.4,
    frameTopRailHeight: 1.5 * 25.4,
    frameBottomSpread: -2 * 25.4,
    frameOuterTopCornerRadius: 1 * 25.4,
    frameInnerTopCornerRadius: 3 * 25.4,
    frameOuterRailCurveTension: 0.62,
    frameOuterStileCurveTension: 0.71,
    frameInnerRailCurveTension: 0.51,
    frameInnerStileCurveTension: 0.51,
  };
  expectTemplateParity(splayedParams);
  const splayedSegments = createHoverDiningTableTemplateSegments(
    splayedParams,
    model,
  );
  expect(splayedSegments.length).toBeGreaterThanOrEqual(4);
  splayedSegments.forEach((segment) => {
    const inspected = inspectGeometry(segment.geometry);
    expect(inspected.finite, segment.fileName).toBe(true);
    expect(inspected.degenerateTriangles, segment.fileName).toBe(0);
    expect(inspected.size.x, segment.fileName).toBeLessThanOrEqual(
      summary.plateLength + 1e-4,
    );
    expect(inspected.size.y, segment.fileName).toBeLessThanOrEqual(
      summary.plateLength + 1e-4,
    );
    segment.geometry.dispose();
  });
});

test("renders The Wave across assembly and fabrication views", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto(
    "/?model=wave-dining-table&unit=in&bottomSupportStyle=0",
  );
  await expect(
    page.getByRole("heading", { name: "The Wave" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("The Wave model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByText(/2 open frames · 4 full-height legs/)).toBeVisible();
  await expect(
    page.getByText(/2 original lengthwise stretchers/),
  ).toBeVisible();
  await expect(
    page.getByText(/2 original lengthwise stretchers .* 4 corner triangles/),
  ).toBeVisible();
  await expect(page.getByText("None · four legs remain independent at floor level")).toBeVisible();

  const legFrameGroup = page
    .locator(".parameter-group")
    .filter({ has: page.getByRole("heading", { name: "Leg frames" }) });
  await legFrameGroup.locator(".parameter-group-toggle").click();
  await expect(page.getByLabel("Use open leg frames")).toBeChecked();
  await expect(page.getByLabel("End-box bottom rail height in inches")).toHaveCount(0);
  await expect(page.getByLabel("End-box outer bottom radius in inches")).toHaveCount(0);
  await expect(page.getByLabel("End-box inner bottom radius in inches")).toHaveCount(0);
  await expect(page.getByLabel("End-box outer top radius in inches")).toBeVisible();
  await expect(
    page.getByLabel("Outer corner rail-side sweep Bézier tension"),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Inner corner stile-side sweep Bézier tension"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Use adjustable leveling feet")).toBeChecked();
  await expect(page.getByLabel("Top support style")).toContainText("Original stretchers");
  await expect(page.getByLabel("Bottom support style")).toContainText("None");
  await expect(page).toHaveURL(/bottomSupportStyle=2(?:&|$)/);
  const supportLayoutGroup = page
    .locator(".parameter-group")
    .filter({ has: page.getByRole("heading", { name: "Support layout" }) });
  await supportLayoutGroup.locator(".parameter-group-toggle").click();
  await expect(page.getByText("The Wave keeps the floor open with no lower support.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bottom support members" }),
  ).toHaveCount(0);
  const topSupportGroup = page
    .locator(".parameter-group")
    .filter({ has: page.getByRole("heading", { name: "Top support members" }) });
  await topSupportGroup.locator(".parameter-group-toggle").click();
  const matchRailRoundover = page.getByLabel("Match the leg round-over");
  await expect(matchRailRoundover).toBeChecked();
  await expect(
    page.getByLabel("Lengthwise rail top/end round-over in inches"),
  ).toHaveCount(0);
  await page.getByLabel("End-box face-edge round-over in inches").fill("1/4");
  await expect(
    page.getByText(/1\/4 in top-edge \+ end-face round-over matching legs/),
  ).toBeVisible();
  await matchRailRoundover.evaluate((input: HTMLInputElement) => input.click());
  await expect(matchRailRoundover).not.toBeChecked();
  const railRoundover = page.getByLabel(
    "Lengthwise rail top/end round-over in inches",
  );
  await expect(railRoundover).toBeVisible();
  await railRoundover.fill("1/8");
  await expect(page).toHaveURL(/matchLengthwiseRailRoundover=0/);
  await expect(page).toHaveURL(/topSupportEdgeRadius=0\.126/);
  const cornerBraceGroup = page
    .locator(".parameter-group")
    .filter({ has: page.getByRole("heading", { name: "Corner braces" }) });
  await cornerBraceGroup.locator(".parameter-group-toggle").click();
  const cornerBraceReach = page.getByLabel(
    "Corner-brace reach along each rail in inches",
  );
  await expect(cornerBraceReach).toHaveValue("10");
  await cornerBraceReach.fill("11");
  await expect(cornerBraceReach).toHaveValue("11");
  await expect(page).toHaveURL(/cornerBraceReach=11(?:&|$)/);
  await expect(page).toHaveURL(/endFrameStyle=1(?:&|$)/);
  await page.reload();
  await expect(page.getByLabel("Use open leg frames")).toBeChecked();
  await expect(page.getByLabel("Match the leg round-over")).not.toBeChecked();
  await expect(
    page.getByLabel("Lengthwise rail top/end round-over in inches"),
  ).toHaveValue("1/8");
  await expect(page.getByText(/2 open frames · 4 full-height legs/)).toBeVisible();

  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByText("Exploded · 20 pieces")).toBeVisible();

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(
    page.getByText("Routing templates · exact B1 + B3 profiles · segmented STLs"),
  ).toBeVisible();
  await expect(page.getByText("Top rail · B1")).toBeVisible();
  await expect(page.getByText("Full-height leg · B3")).toBeVisible();
  await expect(page.getByText("Bottom rail · B2")).toHaveCount(0);

  await page.getByRole("button", { name: "Cut list" }).click();
  await expect(page.getByText("Cut list · full-size · 20 pieces")).toBeVisible();
  await expect(page.getByLabel("The Wave full-size cut list")).toBeVisible();
  await expect(page.locator(".hover-cut-table tbody tr")).toHaveCount(7);
  await expect(page.locator('.hover-cut-card[data-part-id="B2"]')).toHaveCount(0);
  await expect(page.locator('.hover-cut-card[data-part-id="B3"]')).toContainText(
    "Full-height leg",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="S1"]')).toContainText(
    "rounded-end member profile",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="S1"]')).toContainText(
    "End perimeter R 1/8 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="S1"]')).toContainText(
    "Top R 1/8 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="K1"]')).toContainText(
    "Top-frame diagonal knee brace",
  );
  expect(pageErrors).toEqual([]);
});

test("renders, manipulates, and exports the oak X-Hover table", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(
    page.getByRole("heading", { name: "X-Hover Dining Table" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(
    page.locator(".inspector-body > .panel-section > h2"),
  ).toHaveText(["Assembly", "Model controls"]);
  const designChecks = page.getByLabel("Hover-table design checks");
  await expect(designChecks).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Design checks", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".inspector-design-checks")).toBeHidden();
  const librarySidebar = page.getByLabel("Workspace model library");
  await librarySidebar
    .getByRole("button", { name: "Jig Library", exact: true })
    .click();
  await expect(designChecks).toBeHidden();
  await librarySidebar
    .getByRole("button", { name: "Design checks", exact: true })
    .click();
  await expect(designChecks).toBeVisible();
  const overflowState = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    app: document.querySelector<HTMLElement>(".app-shell")!.scrollWidth -
      document.querySelector<HTMLElement>(".app-shell")!.clientWidth,
    libraryOverflowX: getComputedStyle(
      document.querySelector<HTMLElement>(".workspace-design-checks")!,
    ).overflowX,
    inspectorOverflowX: getComputedStyle(
      document.querySelector<HTMLElement>(".inspector-body")!,
    ).overflowX,
  }));
  expect(overflowState.document).toBeLessThanOrEqual(0);
  expect(overflowState.app).toBeLessThanOrEqual(0);
  expect(overflowState.libraryOverflowX).toBe("hidden");
  expect(overflowState.inspectorOverflowX).toBe("hidden");

  const viewer = page.locator(".viewer");
  const orientationBeforeDisclosure = await page
    .locator(".orientation-cube")
    .getAttribute("style");
  const auditToggle = designChecks.getByRole("button", {
    name: "Audit",
    exact: true,
  });
  const structureToggle = designChecks.getByRole("button", {
    name: "Structure",
    exact: true,
  });
  await expect(auditToggle).toHaveAttribute("aria-expanded", "true");
  await expect(structureToggle).toHaveAttribute("aria-expanded", "true");
  await auditToggle.focus();
  await page.keyboard.press("Enter");
  await expect(auditToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#sidebar-design-checks-audit-content")).toBeHidden();
  await structureToggle.click();
  await expect(structureToggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.locator("#sidebar-design-checks-structure-content"),
  ).toBeHidden();
  await expect(viewer).toHaveAttribute("data-assembly-mode", "assembled");
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeDisclosure!,
  );
  await auditToggle.click();
  await structureToggle.click();
  await expect(
    page.locator("#sidebar-design-checks-audit-content"),
  ).toBeVisible();
  await expect(
    page.locator("#sidebar-design-checks-structure-content"),
  ).toBeVisible();
  await page.locator(".inspector-body").evaluate((element) => {
    element.scrollTo({ top: 0 });
  });
  await expect(page.locator(".assembly-panel-section")).toBeVisible();

  const assemblyPanelBeforeModeSwitch = await page
    .locator(".assembly-panel-section")
    .boundingBox();
  const modelControlsBeforeModeSwitch = await page
    .locator(".inspector-body > .panel-section")
    .nth(1)
    .boundingBox();
  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(viewer).toHaveAttribute("data-assembly-mode", "exploded");
  const assemblyPanelAfterModeSwitch = await page
    .locator(".assembly-panel-section")
    .boundingBox();
  const modelControlsAfterModeSwitch = await page
    .locator(".inspector-body > .panel-section")
    .nth(1)
    .boundingBox();
  expect(assemblyPanelBeforeModeSwitch).not.toBeNull();
  expect(assemblyPanelAfterModeSwitch).not.toBeNull();
  expect(modelControlsBeforeModeSwitch).not.toBeNull();
  expect(modelControlsAfterModeSwitch).not.toBeNull();
  expect(assemblyPanelAfterModeSwitch!.y).toBeCloseTo(
    assemblyPanelBeforeModeSwitch!.y,
    0,
  );
  expect(modelControlsAfterModeSwitch!.y).toBeCloseTo(
    modelControlsBeforeModeSwitch!.y,
    0,
  );
  await page.getByRole("button", { name: "Assembled" }).click();
  await expect(viewer).toHaveAttribute("data-assembly-mode", "assembled");

  const parameterGroupToggles = page.locator(".parameter-group-toggle");
  await expect(parameterGroupToggles).toHaveCount(9);
  await expect(page.getByLabel("Table length in inches")).toBeHidden();
  for (const toggle of await parameterGroupToggles.all()) {
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.getByLabel("Mock scale denominator")).toHaveValue("10");
  await expect(page.getByLabel("Table length in inches")).toHaveValue("75");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("Use adjustable leveling feet")).toBeChecked();
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("29 1/2");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Long-edge roll depth in inches")).toHaveValue("5/8");
  await expect(page.getByLabel("End-box inner top radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box inner bottom radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Use adjustable leveling feet")).toBeChecked();
  await expect(page.getByLabel("Leveling-foot pad diameter in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Leveling-foot rod length in inches")).toHaveValue("3");
  await expect(page.getByLabel("Installed floor-to-box extension in inches")).toHaveValue("3/4");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Top support thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Bottom support thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Top support bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Bottom support bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Bottom support top round-over in inches")).toHaveValue("0");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(page.getByLabel("Top support style")).toContainText("Cross bars (X)");
  await expect(page.getByLabel("Top support style")).toContainText(
    "Diagonal X-brace layout",
  );
  await expect(page.getByLabel("Bottom support style")).toContainText("Cross bars (X)");
  await page.getByLabel("Top support style").click();
  await expect(
    page.getByRole("option", { name: /Original stretchers/ }),
  ).toContainText("Two lengthwise members");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Routing-template thickness in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Usable square print-plate span in inches")).toHaveValue("9");
  await expect(page.getByLabel("Template dovetail depth in inches")).toHaveValue("1/2");
  await expect(page.getByLabel("Template dovetail fit clearance in inches")).toHaveValue("0.008");
  await expect(page.getByLabel("Tabletop hover gap in inches")).toHaveCount(0);
  await expect(page.getByLabel("Lengthwise stretcher height in inches")).toHaveCount(0);
  const parameterGroups = page.locator(".parameter-group h3");
  await expect(parameterGroups).toHaveText([
    "Overall",
    "Tabletop",
    "End boxes",
    "Adjustable feet",
    "Support layout",
    "Top support members",
    "Bottom support members",
    "Support joinery",
    "Routing templates",
  ]);
  await expect(
    page.getByText("Dimensions for the selected top X or stretcher members."),
  ).toBeVisible();
  const xGroupHeading = await page
    .getByRole("region", { name: "Top support members" })
    .getByRole("heading", { name: "Top support members" })
    .boundingBox();
  const xGroupNote = await page
    .getByText("Dimensions for the selected top X or stretcher members.")
    .boundingBox();
  expect(xGroupHeading).not.toBeNull();
  expect(xGroupNote).not.toBeNull();
  expect(xGroupNote!.y).toBeGreaterThanOrEqual(
    xGroupHeading!.y + xGroupHeading!.height + 3,
  );
  expect(xGroupNote!.x).toBeCloseTo(xGroupHeading!.x, 0);
  await expect(
    page.getByLabel("Tabletop edge curve tension Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Outer corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Outer corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Inner corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.580");
  await expect(
    page.getByLabel("Inner corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.580");
  await expect(page.getByLabel("X-Hover assembly view")).toBeVisible();
  const assembledButton = page.getByRole("button", { name: "Assembled" });
  const explodedButton = page.getByRole("button", { name: "Exploded" });
  const cutListButton = page.getByRole("button", { name: "Cut list" });
  const templatesButton = page.getByRole("button", {
    name: "Templates",
    exact: true,
  });
  await expect(assembledButton).toHaveAttribute("aria-pressed", "true");
  await expect(explodedButton).toHaveAttribute("aria-pressed", "false");
  await expect(cutListButton).toHaveAttribute("aria-pressed", "false");
  await expect(templatesButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "assembled",
  );
  await expect(
    page.getByText(/full-size cut sheet, and routing templates/),
  ).toBeVisible();

  const orientationBeforeExplosion = await page
    .locator(".orientation-cube")
    .getAttribute("style");
  await explodedButton.click();
  await expect(explodedButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await expect(page.getByText("Exploded · 20 pieces")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );

  await expect(page.getByText("75 in × 35 1/2 in × 29 1/2 in")).toBeVisible();
  await expect(page.getByText("2 × 32 in wide closed boxes")).toBeVisible();
  await expect(page.getByText("0 in bottom spread")).toBeVisible();
  await expect(page.getByText(/2 × .* at ±\d+\.\d°/).first()).toBeVisible();
  await expect(
    page.getByText(
      "2 centered · full width · complementary 50% depth · 0 in fit clearance",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/top supports \+ recessed channel webs Z 28 1\/4 in · \d+% direct oak bearing · lower supports Z 3\/4 in · feet alone contact floor/),
  ).toBeVisible();
  await expect(page.getByText(/8 box-parallel support end faces/)).toBeVisible();
  await expect(
    designChecks.locator(".audit-row .status-dot.pass"),
  ).toHaveCount(17);

  const structuralAssessment = designChecks.getByLabel(
    "Structural wobble assessment",
  );
  await expect(structuralAssessment).toBeVisible();
  await expect(
    structuralAssessment.getByRole("listitem"),
  ).toHaveCount(6);
  await expect(
    structuralAssessment.locator(".structural-reference-links"),
  ).toHaveCount(7);
  await expect(
    structuralAssessment.locator(".structural-reference-links a"),
  ).toHaveCount(14);
  await expect(
    structuralAssessment.getByText("Overall-height sensitivity"),
  ).toBeVisible();
  const overallCalculationButton = structuralAssessment.getByRole("button", {
    name: "Explain overall structural score calculation",
  });
  await overallCalculationButton.click();
  const overallCalculation = structuralAssessment.getByLabel(
    "Overall structural score calculation details",
  );
  await expect(overallCalculation).toBeVisible();
  await expect(
    overallCalculation.getByText(/23% × Lengthwise racking/),
  ).toBeVisible();
  await expect(
    overallCalculation.getByText(/90 × 0\.23 = 20\.7/),
  ).toBeVisible();
  await expect(
    overallCalculation.getByRole("link", {
      name: "Overall structural score detailed specification",
    }),
  ).toHaveAttribute("href", /#overall-weighting-and-grades$/);
  await expect(
    overallCalculation.getByRole("link", {
      name: "Overall structural score formula source code",
    }),
  ).toHaveAttribute("href", /hoverDiningTable\.ts#L4843-L4866$/);
  await overallCalculationButton.click();
  await expect(overallCalculation).toBeHidden();
  const calculationButtons = structuralAssessment.locator(
    ".structural-metric .structural-info-button",
  );
  await expect(calculationButtons).toHaveCount(6);
  const rackingCalculationButton = structuralAssessment.getByRole("button", {
    name: "Explain Lengthwise racking calculation",
  });
  await rackingCalculationButton.click();
  await expect(rackingCalculationButton).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const rackingCalculation = structuralAssessment.getByLabel(
    "Lengthwise racking calculation details",
  );
  await expect(rackingCalculation).toBeVisible();
  await expect(rackingCalculation.getByText("Rationale")).toBeVisible();
  await expect(
    rackingCalculation.getByText(/30 \+ 35 × .*Topology/),
  ).toBeVisible();
  await expect(
    rackingCalculation.getByRole("link", {
      name: "Lengthwise racking detailed specification",
    }),
  ).toHaveAttribute("href", /#lengthwise-racking$/);
  await expect(
    rackingCalculation.getByRole("link", {
      name: "Lengthwise racking formula source code",
    }),
  ).toHaveAttribute("href", /hoverDiningTable\.ts#L4272-L4291$/);
  const rackingHeightInput = rackingCalculation
    .locator(".structural-calculation-inputs > div")
    .filter({ hasText: "overallHeight" });
  await expect(rackingHeightInput.getByText("29 1/2 in")).toBeVisible();
  const torsionCalculationButton = structuralAssessment.getByRole("button", {
    name: "Explain Torsional rigidity calculation",
  });
  await torsionCalculationButton.click();
  const torsionCalculation = structuralAssessment.getByLabel(
    "Torsional rigidity calculation details",
  );
  await expect(
    torsionCalculation.getByText(/√\(channelTorsionFactor\)/),
  ).toBeVisible();
  await expect(
    torsionCalculation.getByRole("link", {
      name: "Torsional rigidity detailed specification",
    }),
  ).toHaveAttribute("href", /#torsional-rigidity$/);
  const channelDepthInput = torsionCalculation
    .locator(".structural-calculation-inputs > div")
    .filter({ hasText: "channelDepth" });
  await expect(channelDepthInput.getByText("3/8 in")).toBeVisible();
  const memberCalculationButton = structuralAssessment.getByRole("button", {
    name: "Explain Member stiffness calculation",
  });
  await memberCalculationButton.click();
  const memberCalculation = structuralAssessment.getByLabel(
    "Member stiffness calculation details",
  );
  await expect(
    memberCalculation.getByText(/∛topPlaneStiffnessFactor/),
  ).toBeVisible();
  await expect(
    memberCalculation
      .locator(".structural-calculation-inputs > div")
      .filter({ hasText: "channelTransformedSectionRatio" }),
  ).toBeVisible();
  const baselineStructuralScore = Number(
    await structuralAssessment.getAttribute("data-overall-score"),
  );
  await page.getByLabel("Overall height in inches").fill("35");
  await expect.poll(async () =>
    Number(await structuralAssessment.getAttribute("data-overall-score")),
  ).toBeLessThan(baselineStructuralScore);
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("32");
  await expect(rackingHeightInput.getByText("32 in")).toBeVisible();
  await page.getByLabel("Overall height in inches").fill("29 1/2");

  await page.getByLabel("Table width in inches").fill("36");
  await expect(page.getByText("2 × 32 1/2 in wide closed boxes")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("1");
  await expect(page.getByText("+1 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("-1/2");
  await expect(page.getByText("-1/2 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box inner top radius in inches").fill("3");
  await expect(page).toHaveURL(/frameInnerTopCornerRadius=3/);
  await page.getByLabel("End-box inner bottom radius in inches").fill("2 3/4");
  await expect(page).toHaveURL(/frameInnerBottomCornerRadius=2\.748/);
  await expect(page.getByText(/8 box-parallel support end faces/)).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );
  await page.getByLabel("End-box side width in inches").fill("3 1/2");
  await expect(page).toHaveURL(/frameSideWidth=3.5/);
  await page.getByLabel("Top support width in inches").fill("3");
  await expect(page).toHaveURL(/topSupportWidth=3/);
  await expect(page.getByLabel("End-box side width in inches")).toHaveValue(
    "3 1/2",
  );
  await page.getByLabel("Bottom support width in inches").fill("2 1/2");
  await expect(page).toHaveURL(/bottomSupportWidth=2\.5/);
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("3");
  await page.getByLabel("Top support width in inches").fill("2 1/8");
  await expect(page).toHaveURL(/topSupportWidth=2\.126/);
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2 1/2");
  await page
    .getByLabel("Use adjustable leveling feet")
    .evaluate((input: HTMLInputElement) => input.click());
  await expect(page).toHaveURL(/levelingFeetEnabled=0/);
  await page.getByLabel("End-box side width in inches").fill("1/2");
  await expect(page).toHaveURL(/frameSideWidth=0\.5/);
  await expect(page.getByLabel("End-box side width in inches")).toHaveValue("1/2");
  await expect(
    page.getByLabel("End-box face-edge round-over in inches"),
  ).toHaveValue("3/16");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("2 1/8");
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("Upper-X brace width in inches")).toHaveCount(0);
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveCount(0);
  await page.getByLabel("Top support thickness in inches").fill("2");
  await expect(page).toHaveURL(/topSupportThickness=2/);
  await expect(page.getByLabel("End-box top rail height in inches")).toHaveValue("2");
  await expect(page.getByLabel("End-box bottom rail height in inches")).toHaveValue("1 3/4");
  await page.getByLabel("Half-lap fit clearance in inches").fill("1/32");
  await expect(page).toHaveURL(/halfLapClearance=0\.0315/);
  await page
    .getByLabel("Inner corner rail-side sweep Bézier tension")
    .fill("0.48");
  await page
    .getByLabel("Inner corner stile-side sweep Bézier tension")
    .fill("0.72");
  await expect(page).toHaveURL(/frameInnerRailCurveTension=0\.48/);
  await expect(page).toHaveURL(/frameInnerStileCurveTension=0\.72/);
  await page
    .getByLabel("Outer corner rail-side sweep Bézier tension")
    .fill("0.48");
  await page
    .getByLabel("Outer corner stile-side sweep Bézier tension")
    .fill("0.72");
  await expect(page).toHaveURL(/frameOuterRailCurveTension=0\.48/);
  await expect(page).toHaveURL(/frameOuterStileCurveTension=0\.72/);
  await expect(
    designChecks.locator(".audit-row .status-dot.pass"),
  ).toHaveCount(17);

  await page.getByRole("button", { name: "Reset parameters" }).click();
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(
    page.getByLabel("Inner corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.580");
  await expect(
    page.getByLabel("Inner corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.580");
  await expect(
    page.getByLabel("Outer corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Outer corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.552");
  await templatesButton.click();
  await expect(templatesButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "templates",
  );
  await expect(
    page.getByText(
      "Routing templates · exact B1 + B2 + B3 profiles · segmented STLs",
    ),
  ).toBeVisible();
  await expect(page.getByText("Top rail · B1")).toBeVisible();
  await expect(page.getByText("Bottom rail · B2")).toBeVisible();
  await expect(page.getByText("Vertical stile · B3")).toBeVisible();
  const templateDownloads: string[] = [];
  page.on("download", (download) => {
    if (download.suggestedFilename().includes("-template-part-")) {
      templateDownloads.push(download.suggestedFilename());
    }
  });
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page
    .getByRole("button", { name: "Export routing-template STL set" })
    .click();
  const defaultTemplateSummary = getHoverDiningTableTemplateSummary(
    defaultParams,
    model,
  );
  await expect.poll(() => templateDownloads.length).toBe(
    defaultTemplateSummary.totalSegments,
  );
  expect(new Set(templateDownloads).size).toBe(templateDownloads.length);
  expect(templateDownloads.some((name) => name.includes("top-rail"))).toBe(true);
  expect(templateDownloads.some((name) => name.includes("bottom-rail"))).toBe(true);
  expect(templateDownloads.some((name) => name.includes("vertical-stile"))).toBe(true);
  await page.keyboard.press("Escape");
  await cutListButton.click();
  await expect(cutListButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "cut-list",
  );
  await expect(page.getByText("Cut list · full-size · 20 pieces")).toBeVisible();
  await expect(page.getByLabel("X-Hover full-size cut list")).toBeVisible();
  await expect(page.locator(".hover-cut-table tbody tr")).toHaveCount(10);
  await expect(page.locator(".hover-cut-card")).toHaveCount(10);
  await expect(page.locator(".hover-cut-3d")).toHaveCount(10);
  await expect(
    page.getByRole("img", { name: /dimensioned cut diagram/ }),
  ).toHaveCount(10);
  await expect(page.locator(".cut-part-section > path")).toHaveCount(9);
  await expect(
    page.locator('.cut-part-section[data-section-kind="half-lap"]'),
  ).toHaveCount(4);
  await expect(page.locator(".cut-part-section-pocket")).toHaveCount(4);
  await expect(
    page.locator('[data-profile-family="frame-rail"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('[data-profile-family="frame-stile"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-profile-family="brace"]'),
  ).toHaveCount(4);
  await expect(
    page.locator('[data-profile-family="channel"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.hover-cut-card[data-part-id="H1"]'),
  ).toHaveAttribute("data-grain-axis", "none");
  await expect(page.locator('.hover-cut-card[data-part-id="H1"]')).toContainText(
    "U-channel web + flanges",
  );
  await expect(
    page.locator('.hover-cut-card[data-part-id="B1"] [data-profile-family="frame-rail"]'),
  ).toHaveAttribute("d", /C/);
  await expect(
    page.locator('.hover-cut-card[data-part-id="B2"] [data-profile-family="frame-rail"]'),
  ).toHaveAttribute("d", /C/);
  await expect(page.locator('.hover-cut-card[data-part-id="B1"]')).toContainText(
    "true routed rail profile",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="B3"]')).toContainText(
    "true splayed stile profile",
  );
  await expect(
    page.locator('.hover-cut-card[data-part-id="B3"]'),
  ).toHaveAttribute("data-grain-axis", "vertical");
  await expect(
    page.locator('.hover-cut-card[data-part-id="B3"]'),
  ).toHaveAttribute("data-length-axis", "vertical");
  await expect(
    page.locator('.hover-cut-card[data-part-id="B1"]'),
  ).toHaveAttribute("data-grain-axis", "horizontal");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "Bézier long-edge roll",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U1"]')).toContainText(
    "bottom long-edge round-over",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "L 75 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U1"]')).toContainText(
    "top half-lap",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U2"]')).toContainText(
    "bottom half-lap",
  );
  const upperLapPreview = page.locator(
    '.hover-cut-card[data-part-id="U1"] .hover-cut-3d',
  );
  await upperLapPreview.scrollIntoViewIfNeeded();
  await expect(upperLapPreview).toHaveAttribute("data-ready", "true");
  await expect(
    upperLapPreview.getByRole("img", { name: /Interactive 3D view/ }),
  ).toBeVisible();
  for (const label of ["ISO", "Top", "Bottom", "Front", "End"]) {
    await expect(upperLapPreview.getByRole("button", { name: label })).toBeVisible();
  }
  const edgeToggle = upperLapPreview.getByRole("button", { name: "Edges" });
  await expect(edgeToggle).toHaveAttribute("aria-pressed", "true");
  await edgeToggle.click();
  await expect(edgeToggle).toHaveAttribute("aria-pressed", "false");
  await edgeToggle.click();
  const upperLapCanvas = upperLapPreview.getByRole("img", {
    name: "Interactive 3D view of Upper X — member A. Drag to rotate and scroll to zoom.",
  });
  const upperLapCanvasBounds = await upperLapCanvas.boundingBox();
  expect(upperLapCanvasBounds).not.toBeNull();
  await page.mouse.move(
    upperLapCanvasBounds!.x + upperLapCanvasBounds!.width * 0.5,
    upperLapCanvasBounds!.y + upperLapCanvasBounds!.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    upperLapCanvasBounds!.x + upperLapCanvasBounds!.width * 0.68,
    upperLapCanvasBounds!.y + upperLapCanvasBounds!.height * 0.36,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(upperLapPreview).toHaveAttribute("data-view", "free");
  await upperLapPreview.getByRole("button", { name: "Top" }).click();
  await expect(upperLapPreview).toHaveAttribute("data-view", "top");
  await page.getByLabel("Table width in inches").fill("36");
  await expect(upperLapPreview).toHaveAttribute("data-ready", "true");
  await expect(upperLapPreview).toHaveAttribute("data-view", "top");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "W 36 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="B1"]')).toContainText(
    "L 32 1/2 in",
  );
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "cut-list",
  );
  await page.getByLabel("Table width in inches").fill("35 1/2");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "W 35 1/2 in",
  );
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "hover-dining-table-scale-1-10-length-1905.0-width-901.7.stl",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const stl = inspectStl(fs.readFileSync(downloadPath!));
  expect(stl.finite).toBe(true);
  expect(stl.degenerateTriangles).toBe(0);
  expect(stl.min.z).toBeCloseTo(0, 3);
  expect(stl.size.x).toBeCloseTo(190.5, 1);
  expect(stl.size.y).toBeCloseTo(90.17, 1);
  expect(stl.size.z).toBeCloseTo(74.93, 1);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Workspace actions" }),
  ).toBeHidden();
  await assembledButton.click();
  await expect(assembledButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "assembled",
  );
  await expect(page.getByText("Exploded · 20 pieces")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("switches support layouts associatively across viewer, exploded mode, cut list, URL, and reload", async ({
  page,
}) => {
  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await page.getByRole("button", { name: "Support layout" }).click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const orientationBefore = await page
    .locator(".orientation-cube")
    .getAttribute("style");

  await page.getByLabel("Top support style").click();
  await page.getByRole("option", { name: "Original stretchers" }).click();
  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: "Single center board" }).click();
  await expect(page).toHaveURL(/topSupportStyle=1/);
  await expect(page).toHaveURL(/bottomSupportStyle=1/);
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveCount(0);
  await expect(page.getByText(/2 original lengthwise stretchers/)).toBeVisible();
  await expect(page.getByText(/1 centered lengthwise board/)).toBeVisible();
  await expect(page.getByText(/6 box-parallel support end faces/)).toBeVisible();
  await expect(page.getByText("Not required by the selected straight-support layouts")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByText("Exploded · 19 pieces")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Cut list" }).click();
  await expect(page.getByText("Cut list · full-size · 19 pieces")).toBeVisible();
  await expect(page.locator(".hover-cut-table tbody tr")).toHaveCount(8);
  await expect(page.locator('[data-profile-family="support"]')).toHaveCount(2);
  await expect(
    page.locator('.cut-part-section[data-section-kind="half-lap"]'),
  ).toHaveCount(0);
  await expect(page.getByText("Upper lengthwise stretcher").first()).toBeVisible();
  await expect(page.getByText("Floor center board").first()).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Support layout" }).click();
  await expect(page.getByLabel("Top support style")).toContainText(
    "Original stretchers",
  );
  await expect(page.getByLabel("Bottom support style")).toContainText(
    "Single center board",
  );

  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: "None" }).click();
  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByText("Exploded · 18 pieces")).toBeVisible();
  await expect(page.getByText(/None · end boxes remain unconnected/)).toBeVisible();
});

test("migrates legacy split-brace and shared-radius links to canonical parameters", async ({
  page,
}) => {
  await page.goto(
    "/?model=hover-dining-table&unit=in&frameTopRailHeight=1.5&frameBottomRailHeight=1.5&frameSideWidth=2.5&frameInnerCornerRadius=3&frameOuterCornerRadius=1&frameOuterCurveTension=0.64&frameInnerCurveTension=0.66&upperBraceWidth=1.75&lowerBraceWidth=2.25&upperBraceThickness=1&lowerBraceThickness=1.5&upperBraceEdgeRadius=0.125&lowerBraceEdgeRadius=0.25",
  );
  await expect(page.getByLabel("End-box inner top radius in inches")).toHaveValue("3");
  await expect(page.getByLabel("End-box inner bottom radius in inches")).toHaveValue("3");
  await expect(page.getByLabel("End-box outer top radius in inches")).toHaveValue("1");
  await expect(page.getByLabel("End-box outer bottom radius in inches")).toHaveValue("1");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("1 3/4");
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2 1/4");
  await expect(page.getByLabel("Top support thickness in inches")).toHaveValue("1");
  await expect(page.getByLabel("Bottom support thickness in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Top support bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Bottom support bottom round-over in inches")).toHaveValue("1/4");
  await expect(
    page.getByLabel("Outer corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.640");
  await expect(
    page.getByLabel("Outer corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.640");
  await expect(
    page.getByLabel("Inner corner rail-side sweep Bézier tension"),
  ).toHaveValue("0.660");
  await expect(
    page.getByLabel("Inner corner stile-side sweep Bézier tension"),
  ).toHaveValue("0.660");
  await expect(page).toHaveURL(/topSupportWidth=1\.75/);
  await expect(page).toHaveURL(/bottomSupportWidth=2\.25/);
  await expect(page).toHaveURL(/topSupportThickness=1/);
  await expect(page).toHaveURL(/bottomSupportThickness=1\.5/);
  await expect(page).toHaveURL(/frameInnerTopCornerRadius=3/);
  await expect(page).toHaveURL(/frameOuterRailCurveTension=0\.64/);
  await expect(page).toHaveURL(/frameOuterStileCurveTension=0\.64/);
  await expect(page).toHaveURL(/frameInnerRailCurveTension=0\.66/);
  await expect(page).toHaveURL(/frameInnerStileCurveTension=0\.66/);
  await expect(page).not.toHaveURL(/lowerBraceWidth=/);
  await expect(page).not.toHaveURL(/frameInnerCornerRadius=/);
  await expect(page).not.toHaveURL(/frameOuterCurveTension=/);
  await expect(page).not.toHaveURL(/frameInnerCurveTension=/);
});

test("loads the narrow end-box shared configuration without crashing", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  const search = new URLSearchParams({
    model: "hover-dining-table",
    unit: "in",
    channelEndClearance: "4",
    channelSideInset: "2",
    channelWallThickness: "0.125",
    mockScale: "10",
    tableLength: "75",
    tableWidth: "35.5",
    overallHeight: "29.5",
    topThickness: "1.25",
    topEdgeRoll: "0.625",
    topEdgeTension: "0.552",
    sideOverhang: "10.5",
    endOverhang: "8.248",
    channelWidth: "2",
    channelDepth: "0.375",
    frameDepth: "3",
    frameSideWidth: "2",
    frameBottomRailHeight: "1.252",
    frameTopRailHeight: "1.748",
    frameBottomSpread: "0",
    frameOuterTopCornerRadius: "0.75",
    frameOuterBottomCornerRadius: "0.75",
    frameInnerTopCornerRadius: "2.5",
    frameInnerBottomCornerRadius: "2.5",
    frameOuterCurveTension: "0.552",
    frameInnerCurveTension: "0.58",
    frameEdgeRoundover: "0.375",
    topSupportStyle: "0",
    bottomSupportStyle: "1",
    topSupportWidth: "2",
    topSupportThickness: "1.25",
    topSupportEndpointInset: "0",
    topSupportEdgeRadius: "0.125",
    bottomSupportWidth: "2.5",
    bottomSupportThickness: "1.25",
    bottomSupportEndpointInset: "0",
    bottomSupportEdgeRadius: "0.5315",
    halfLapClearance: "0",
    templateThickness: "0.125",
    templatePlateLength: "9",
    templateDovetailDepth: "0.5",
    templateJointClearance: "0.0079",
  });

  await page.goto(`/?${search.toString()}`);
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(
    page.getByLabel("Structural wobble assessment"),
  ).toHaveAttribute("data-overall-score", "73.4");
  await expect(
    page.getByText("2 × 14 1/2 in wide closed boxes"),
  ).toBeVisible();
  await expect(
    page.getByText("1 centered lengthwise board · 52 1/2 in long"),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps the fabrication sheet usable in narrow center panes and on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 981, height: 1000 });
  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  const compactSceneWidth = await page.locator(".scene-panel").evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(compactSceneWidth).toBeGreaterThanOrEqual(600);
  await expect(
    page.getByRole("button", { name: "Open workspace navigation" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open workspace navigation" })
    .click();
  await expect(page.getByLabel("Workspace model library")).toBeVisible();
  await page
    .getByRole("button", { name: "Close workspace navigation" })
    .click();
  await expect(page.getByLabel("Workspace model library")).toBeHidden();
  await page.getByRole("button", { name: "Top support members" }).click();
  await page.getByRole("button", { name: "Cut list" }).click();

  const desktopContainment = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".hover-cut-sheet")!;
    const header = document
      .querySelector<HTMLElement>(".hover-cut-sheet-header")!
      .getBoundingClientRect();
    const metrics = document
      .querySelector<HTMLElement>(".hover-cut-sheet-header dl")!
      .getBoundingClientRect();
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".hover-cut-card"),
    )
      .slice(0, 2)
      .map((card) => card.getBoundingClientRect());

    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      metricsRight: metrics.right,
      headerRight: header.right,
      firstCardX: cards[0].x,
      firstCardBottom: cards[0].bottom,
      secondCardX: cards[1].x,
      secondCardTop: cards[1].top,
    };
  });

  expect(desktopContainment.documentOverflow).toBeLessThanOrEqual(0);
  expect(desktopContainment.sheetOverflow).toBeLessThanOrEqual(0);
  expect(desktopContainment.metricsRight).toBeLessThanOrEqual(
    desktopContainment.headerRight + 1,
  );
  expect(desktopContainment.secondCardX).toBeCloseTo(
    desktopContainment.firstCardX,
    0,
  );
  expect(desktopContainment.secondCardTop).toBeGreaterThan(
    desktopContainment.firstCardBottom,
  );

  await page.setViewportSize({ width: 393, height: 852 });
  const mobileViewer = page.locator('.viewer[data-assembly-mode="cut-list"]');
  await expect(mobileViewer).toBeVisible();
  await expect(page.locator('.hover-cut-sheet')).toBeVisible();
  await expect(page.getByLabel("Hover-table design checks")).toBeHidden();
  const mobileAssemblyButtonHeights = await page
    .locator('[aria-label="X-Hover assembly view"] button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await expect(page.locator(".inspector-design-checks")).toBeVisible();
  await expect(
    page
      .locator(".inspector-design-checks")
      .getByLabel("Structural wobble assessment"),
  ).toBeVisible();
  const mobileMeasurements = await mobileViewer.evaluate((viewerElement) => {
    const viewer = viewerElement.getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>(".hover-cut-sheet")!;
    const previewButtonHeights = Array.from(
      document.querySelectorAll<HTMLElement>(".hover-cut-3d-toolbar button"),
    ).map((button) => button.getBoundingClientRect().height);
    const auditRows = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".inspector-design-checks .audit-row",
      ),
    ).map((row) => {
      const rowBounds = row.getBoundingClientRect();
      const valueBounds = row
        .querySelector<HTMLElement>("strong")!
        .getBoundingClientRect();
      return valueBounds.right - rowBounds.right;
    });
    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      documentScrollLeft: document.documentElement.scrollLeft,
      sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      sheetOverflowX: getComputedStyle(sheet).overflowX,
      viewerHeight: viewer.height,
      previewButtonHeights,
      auditOverflow: Math.max(...auditRows),
    };
  });
  await page.getByRole("button", { name: "Parameters", exact: true }).click();
  const mobileParameterMeasurements = await page.evaluate(() => {
    const xGroup = document.querySelector<HTMLElement>(
      '.parameter-group[aria-labelledby="parameter-group-top-support-members"]',
    )!;
    const xHeading = xGroup.querySelector("h3")!.getBoundingClientRect();
    const xNote = xGroup.querySelector("p")!.getBoundingClientRect();
    return {
      xHeadingLeft: xHeading.left,
      xHeadingBottom: xHeading.bottom,
      xNoteLeft: xNote.left,
      xNoteTop: xNote.top,
    };
  });

  expect(mobileMeasurements.documentOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.documentScrollLeft).toBe(0);
  expect(mobileMeasurements.sheetOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.sheetOverflowX).toBe("hidden");
  expect(mobileMeasurements.viewerHeight).toBeGreaterThanOrEqual(700);
  expect(Math.min(...mobileAssemblyButtonHeights)).toBeGreaterThanOrEqual(
    44,
  );
  expect(
    Math.min(...mobileMeasurements.previewButtonHeights),
  ).toBeGreaterThanOrEqual(44);
  expect(mobileMeasurements.auditOverflow).toBeLessThanOrEqual(0);
  expect(mobileParameterMeasurements.xNoteTop).toBeGreaterThanOrEqual(
    mobileParameterMeasurements.xHeadingBottom + 3,
  );
  expect(mobileParameterMeasurements.xNoteLeft).toBeCloseTo(
    mobileParameterMeasurements.xHeadingLeft,
    0,
  );
});

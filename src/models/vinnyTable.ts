import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import { assignDirectionalWoodUvs } from "./woodGrainUvs";
import type {
  AuditCheckDefinition,
  AuditItem,
  DiningTableModelDefinition,
  LengthUnit,
  ModelParams,
  NumberLimits,
} from "./types";
import type {
  HoverDiningTableStructuralAssessment,
  HoverDiningTableStructuralGrade,
  HoverDiningTableStructuralMetric,
} from "./hoverDiningTable";

const EPSILON = 1e-5;
const INCH = 25.4;

type Point = { x: number; y: number };
type Layer = { z: number; points: Point[] };

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function createLoftGeometry(
  layers: Layer[],
  grainDirection: THREE.Vector3,
  textureSize: number,
) {
  const pointCount = layers[0]?.points.length ?? 0;
  if (
    layers.length < 2 ||
    pointCount < 3 ||
    layers.some((layer) => layer.points.length !== pointCount)
  ) {
    throw new Error("Vinny loft layers must share one polygon topology");
  }
  const positions: number[] = [];
  const vectorAt = (layer: Layer, index: number) =>
    new THREE.Vector3(layer.points[index].x, layer.points[index].y, layer.z);

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    for (let index = 0; index < pointCount; index += 1) {
      const next = (index + 1) % pointCount;
      const a = vectorAt(layers[layerIndex], index);
      const b = vectorAt(layers[layerIndex], next);
      const c = vectorAt(layers[layerIndex + 1], next);
      const d = vectorAt(layers[layerIndex + 1], index);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const addCap = (layer: Layer, upward: boolean) => {
    const contour = layer.points.map((point) =>
      new THREE.Vector2(point.x, point.y),
    );
    for (const [aIndex, bIndex, cIndex] of THREE.ShapeUtils.triangulateShape(
      contour,
      [],
    )) {
      const a = vectorAt(layer, aIndex);
      const b = vectorAt(layer, bIndex);
      const c = vectorAt(layer, cIndex);
      if (upward) addTriangle(positions, a, b, c);
      else addTriangle(positions, a, c, b);
    }
  };
  addCap(layers[0], false);
  addCap(layers[layers.length - 1], true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignDirectionalWoodUvs(geometry, grainDirection, textureSize);
  geometry.computeBoundingSphere();
  return geometry;
}

function scaled(params: ModelParams, key: string) {
  return getParam(params, key) / getParam(params, "mockScale");
}

function textureSize(params: ModelParams) {
  return 800 / getParam(params, "mockScale");
}

export function isVinnyParams(params: ModelParams) {
  return Number.isFinite(params.legStyle) && Number.isFinite(params.topStyle);
}

function isAdvanced(params: ModelParams) {
  return getParam(params, "legStyle") >= 1.5;
}

function isIntermediate(params: ModelParams) {
  const style = getParam(params, "legStyle");
  return style >= 0.5 && style < 1.5;
}

function isOverhang(params: ModelParams) {
  return getParam(params, "topStyle") >= 0.5;
}

function levelingFeetEnabled(params: ModelParams) {
  return getParam(params, "levelingFeetEnabled") >= 0.5;
}

function baseLength(params: ModelParams) {
  return scaled(params, "tableLength") -
    (isOverhang(params) ? scaled(params, "topOverhang") * 2 : 0);
}

function baseWidth(params: ModelParams) {
  return scaled(params, "tableWidth") -
    (isOverhang(params) ? scaled(params, "topOverhang") * 2 : 0);
}

function topBottom(params: ModelParams) {
  return scaled(params, "overallHeight") - scaled(params, "topThickness");
}

function woodBottom(params: ModelParams) {
  return levelingFeetEnabled(params) ? scaled(params, "levelingFootExtension") : 0;
}

function legHeight(params: ModelParams) {
  return topBottom(params) - woodBottom(params);
}

function rectangle(width: number, depth: number, x = 0, y = 0): Point[] {
  return [
    { x: x - width / 2, y: y - depth / 2 },
    { x: x + width / 2, y: y - depth / 2 },
    { x: x + width / 2, y: y + depth / 2 },
    { x: x - width / 2, y: y + depth / 2 },
  ];
}

function createVinnyTopGeometry(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const bottom = topBottom(params);
  const top = scaled(params, "overallHeight");
  const grooveWidth = Math.min(
    scaled(params, "flushGrooveWidth"),
    Math.min(length, width) / 4,
  );
  const grooveDepth = Math.min(
    scaled(params, "flushGrooveDepth"),
    scaled(params, "topThickness") - EPSILON,
  );
  const insetLength = length - grooveWidth * 2;
  const insetWidth = width - grooveWidth * 2;
  const grooved = !isOverhang(params) && grooveWidth > EPSILON && grooveDepth > EPSILON;
  const layers: Layer[] = grooved
    ? [
        { z: bottom, points: rectangle(insetLength, insetWidth) },
        { z: bottom + grooveDepth, points: rectangle(insetLength, insetWidth) },
        { z: bottom + grooveDepth, points: rectangle(length, width) },
        { z: top, points: rectangle(length, width) },
      ]
    : [
        { z: bottom, points: rectangle(length, width) },
        { z: top, points: rectangle(length, width) },
      ];
  return createLoftGeometry(
    layers,
    new THREE.Vector3(1, 0, 0),
    textureSize(params),
  );
}

function advancedLegRing(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
  arm: number,
): Point[] {
  const thickness = scaled(params, "advancedLegThickness");
  const outerX = xSign * baseLength(params) / 2;
  const outerY = ySign * baseWidth(params) / 2;
  const points = [
    [0, 0],
    [arm, 0],
    [arm, thickness],
    [thickness, thickness],
    [thickness, arm],
    [0, arm],
  ];
  return points.map(([inwardX, inwardY]) => ({
    x: outerX - xSign * inwardX,
    y: outerY - ySign * inwardY,
  }));
}

function createAdvancedLegGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const bottom = woodBottom(params);
  const height = legHeight(params);
  const topArm = scaled(params, "advancedLegTopWidth");
  const footArm = scaled(params, "advancedLegFootWidth");
  const shoulderDrop = Math.min(
    scaled(params, "advancedShoulderDrop"),
    height / 3,
  );
  const shoulderRadius = Math.min(
    scaled(params, "advancedShoulderRadius"),
    topArm - footArm,
    height - shoulderDrop,
  );
  const shoulderBottom = bottom + height - shoulderDrop - shoulderRadius;
  const layers: Layer[] = [
    { z: bottom, points: advancedLegRing(params, xSign, ySign, footArm) },
    {
      z: Math.max(bottom + EPSILON, shoulderBottom),
      points: advancedLegRing(
        params,
        xSign,
        ySign,
        Math.max(footArm, topArm - shoulderRadius),
      ),
    },
    ...[0.25, 0.5, 0.75].map((progress) => ({
      z: shoulderBottom + shoulderRadius * progress,
      points: advancedLegRing(
        params,
        xSign,
        ySign,
        topArm - shoulderRadius * (1 - Math.sqrt(1 - progress ** 2)),
      ),
    })),
    {
      z: bottom + height - shoulderDrop,
      points: advancedLegRing(params, xSign, ySign, topArm),
    },
    { z: bottom + height, points: advancedLegRing(params, xSign, ySign, topArm) },
  ];
  return createLoftGeometry(
    layers,
    new THREE.Vector3(0, 0, 1),
    textureSize(params),
  );
}

function postRing(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
  size: number,
): Point[] {
  const outerX = xSign * baseLength(params) / 2;
  const outerY = ySign * baseWidth(params) / 2;
  return [
    { x: outerX, y: outerY },
    { x: outerX - xSign * size, y: outerY },
    { x: outerX - xSign * size, y: outerY - ySign * size },
    { x: outerX, y: outerY - ySign * size },
  ];
}

function createPostLegGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const bottom = woodBottom(params);
  const height = legHeight(params);
  const topSize = scaled(params, "postLegTopSize");
  const footSize = isIntermediate(params)
    ? scaled(params, "postLegFootSize")
    : topSize;
  const taperStart = Math.max(bottom, bottom + height - scaled(params, "postTaperStart"));
  return createLoftGeometry(
    [
      { z: bottom, points: postRing(params, xSign, ySign, footSize) },
      { z: taperStart, points: postRing(params, xSign, ySign, topSize) },
      { z: bottom + height, points: postRing(params, xSign, ySign, topSize) },
    ],
    new THREE.Vector3(0, 0, 1),
    textureSize(params),
  );
}

function boxGeometry(
  params: ModelParams,
  dimensions: [number, number, number],
  center: [number, number, number],
  grain: THREE.Vector3,
) {
  const geometry = new THREE.BoxGeometry(...dimensions).toNonIndexed();
  geometry.translate(...center);
  assignDirectionalWoodUvs(geometry, grain, textureSize(params));
  return geometry;
}

function memberThickness(params: ModelParams) {
  return isAdvanced(params)
    ? scaled(params, "advancedMemberThickness")
    : scaled(params, "postMemberThickness");
}

function memberDepth(params: ModelParams) {
  return scaled(params, "memberDepth");
}

function longApronLength(params: ModelParams) {
  const deduction = isAdvanced(params)
    ? scaled(params, "advancedApronDeduction")
    : scaled(params, "postApronDeduction");
  return baseLength(params) - deduction;
}

function sideApronLength(params: ModelParams) {
  const deduction = isAdvanced(params)
    ? scaled(params, "advancedApronDeduction")
    : scaled(params, "postApronDeduction");
  return baseWidth(params) - deduction;
}

function stretcherLength(params: ModelParams) {
  const deduction = isAdvanced(params)
    ? scaled(params, "advancedStretcherDeduction")
    : scaled(params, "postStretcherDeduction");
  return baseWidth(params) - deduction;
}

function createFrameGeometries(params: ModelParams) {
  const thickness = memberThickness(params);
  const depth = memberDepth(params);
  const z = topBottom(params) - depth / 2;
  const longY = baseWidth(params) / 2 - thickness / 2;
  const sideX = baseLength(params) / 2 - thickness / 2;
  const geometries = [
    boxGeometry(params, [longApronLength(params), thickness, depth], [0, -longY, z], new THREE.Vector3(1, 0, 0)),
    boxGeometry(params, [longApronLength(params), thickness, depth], [0, longY, z], new THREE.Vector3(1, 0, 0)),
    boxGeometry(params, [thickness, sideApronLength(params), depth], [-sideX, 0, z], new THREE.Vector3(0, 1, 0)),
    boxGeometry(params, [thickness, sideApronLength(params), depth], [sideX, 0, z], new THREE.Vector3(0, 1, 0)),
  ];
  const spacing = Math.min(
    scaled(params, "stretcherSpacing"),
    Math.max(thickness, longApronLength(params) / 3),
  );
  for (const x of [-spacing, 0, spacing]) {
    geometries.push(
      boxGeometry(
        params,
        [thickness, stretcherLength(params), depth],
        [x, 0, z],
        new THREE.Vector3(0, 1, 0),
      ),
    );
  }
  return geometries;
}

function createLevelingFootGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const scale = getParam(params, "mockScale");
  const padDiameter = getParam(params, "levelingFootPadDiameter") / scale;
  const padThickness = getParam(params, "levelingFootPadThickness") / scale;
  const rodDiameter = getParam(params, "levelingFootRodDiameter") / scale;
  const rodLength = getParam(params, "levelingFootRodLength") / scale;
  const contactInset = isAdvanced(params)
    ? scaled(params, "advancedLegFootWidth") / 2
    : scaled(params, "postLegFootSize") / 2;
  const centerX = xSign * (baseLength(params) / 2 - contactInset);
  const centerY = ySign * (baseWidth(params) / 2 - contactInset);
  const pad = new THREE.CylinderGeometry(padDiameter / 2, padDiameter / 2, padThickness, 32);
  pad.rotateX(Math.PI / 2);
  pad.translate(centerX, centerY, padThickness / 2);
  const rod = new THREE.CylinderGeometry(rodDiameter / 2, rodDiameter / 2, rodLength, 24);
  rod.rotateX(Math.PI / 2);
  rod.translate(centerX, centerY, padThickness + rodLength / 2);
  const merged = mergeGeometries([pad, rod], false);
  pad.dispose();
  rod.dispose();
  if (!merged) throw new Error("Unable to merge Vinny leveling foot");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createVinnyTableHardwareGeometries(params: ModelParams) {
  if (!levelingFeetEnabled(params)) return { feet: [] };
  return {
    feet: ([-1, 1] as const).flatMap((xSign) =>
      ([-1, 1] as const).map((ySign) =>
        createLevelingFootGeometry(params, xSign, ySign),
      ),
    ),
  };
}

export function createVinnyTableWoodGeometry(params: ModelParams) {
  const legs = ([-1, 1] as const).flatMap((xSign) =>
    ([-1, 1] as const).map((ySign) =>
      isAdvanced(params)
        ? createAdvancedLegGeometry(params, xSign, ySign)
        : createPostLegGeometry(params, xSign, ySign),
    ),
  );
  const geometries = [createVinnyTopGeometry(params), ...legs, ...createFrameGeometries(params)];
  const names = [
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
  ];
  const merged = mergeGeometries(geometries, false);
  let vertexStart = 0;
  const woodGrainParts = geometries.map((geometry, index) => {
    const vertexCount = geometry.getAttribute("position").count;
    const part = {
      direction: geometry.userData.woodGrainDirection as [number, number, number],
      name: names[index],
      vertexCount,
      vertexStart,
    };
    vertexStart += vertexCount;
    return part;
  });
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge Vinny table geometry");
  merged.userData.woodGrainParts = woodGrainParts;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export type VinnyCutPart = {
  id: string;
  name: string;
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  notes: string;
};

export function getVinnyTableCutList(params: ModelParams): VinnyCutPart[] {
  const advanced = isAdvanced(params);
  const topLength = getParam(params, "tableLength");
  const topWidth = getParam(params, "tableWidth");
  const topThickness = getParam(params, "topThickness");
  const floorToWoodExtension = levelingFeetEnabled(params)
    ? getParam(params, "levelingFootExtension")
    : 0;
  const legBlankLength =
    getParam(params, "overallHeight") - topThickness - floorToWoodExtension;
  const legs: VinnyCutPart = advanced
    ? {
        id: "A1",
        name: "Advanced leg profile halves",
        quantity: 8,
        length: legBlankLength,
        width: getParam(params, "advancedLegTopWidth"),
        thickness: getParam(params, "advancedLegThickness"),
        notes: `Mirror the curved shoulder profile, then miter matching halves at 45° into four L-shaped corner legs.${levelingFeetEnabled(params) ? " Length is shortened by the installed foot extension to preserve overall height." : ""}`,
      }
    : {
        id: "A1",
        name: isIntermediate(params) ? "Double-tapered leg blanks" : "Square leg blanks",
        quantity: 4,
        length: legBlankLength,
        width: getParam(params, "postLegTopSize"),
        thickness: getParam(params, "postLegTopSize"),
        notes: `${isIntermediate(params)
          ? "Leave the top 3 in square and taper both inside faces to the specified foot."
          : "Keep the four post blanks square and straight."}${levelingFeetEnabled(params) ? " Length is shortened by the installed foot extension to preserve overall height." : ""}`,
      };
  return [
    { id: "T1", name: "Tabletop panel", quantity: 1, length: topLength, width: topWidth, thickness: topThickness, notes: isOverhang(params) ? "Centered over the smaller base." : "Flush to the base with the modeled perimeter shadow groove." },
    legs,
    { id: "B1", name: "Long aprons", quantity: 2, length: longApronLength(params) * getParam(params, "mockScale"), width: getParam(params, "memberDepth"), thickness: memberThickness(params) * getParam(params, "mockScale"), notes: "Length changes with the table length." },
    { id: "B2", name: "Short aprons", quantity: 2, length: sideApronLength(params) * getParam(params, "mockScale"), width: getParam(params, "memberDepth"), thickness: memberThickness(params) * getParam(params, "mockScale"), notes: "Width changes with the table width." },
    { id: "B3", name: "Cross stretchers", quantity: 3, length: stretcherLength(params) * getParam(params, "mockScale"), width: getParam(params, "memberDepth"), thickness: memberThickness(params) * getParam(params, "mockScale"), notes: "One centered; outer two use the editable on-center spacing." },
  ];
}

const WEIGHTS: Record<HoverDiningTableStructuralMetric["key"], number> = {
  "longitudinal-racking": 0.23,
  "end-box-racking": 0.22,
  torsion: 0.2,
  tipping: 0.12,
  "floor-rocking": 0.1,
  "member-stiffness": 0.13,
};

function score(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function grade(value: number): HoverDiningTableStructuralGrade {
  if (value >= 85) return "A";
  if (value >= 75) return "B";
  if (value >= 65) return "C";
  if (value >= 50) return "D";
  return "F";
}

function metric(
  key: HoverDiningTableStructuralMetric["key"],
  label: string,
  rawScore: number,
  detail: string,
  rationale: string,
  inputs: HoverDiningTableStructuralMetric["calculation"]["inputs"],
): HoverDiningTableStructuralMetric {
  const value = score(rawScore);
  return {
    key,
    label,
    score: value,
    grade: grade(value),
    detail,
    calculation: {
      formula: "normalized geometry factors × documented frame topology",
      inputs,
      rationale,
      rawScore: Number(rawScore.toFixed(1)),
      weight: WEIGHTS[key],
      scoringNote: "Relative geometry screen clamped to 0–100; joinery and material testing remain outside this model.",
    },
  };
}

function evaluateStructure(params: ModelParams) {
  const height = getParam(params, "overallHeight");
  const topThickness = getParam(params, "topThickness");
  const longSpan = longApronLength(params) * getParam(params, "mockScale");
  const sideSpan = sideApronLength(params) * getParam(params, "mockScale");
  const depth = getParam(params, "memberDepth");
  const thickness = memberThickness(params) * getParam(params, "mockScale");
  const legWidth = isAdvanced(params)
    ? getParam(params, "advancedLegTopWidth")
    : getParam(params, "postLegTopSize");
  const legFoot = isAdvanced(params)
    ? getParam(params, "advancedLegFootWidth")
    : isIntermediate(params)
      ? getParam(params, "postLegFootSize")
      : getParam(params, "postLegTopSize");
  const heightFactor = (30 * INCH) / height;
  const longFactor = (depth / (2.5 * INCH)) ** 1.5 * Math.sqrt((84 * INCH) / longSpan);
  const sideFactor = (depth / (2.5 * INCH)) ** 1.5 * Math.sqrt((28 * INCH) / sideSpan);
  const legFactor = Math.sqrt((legWidth * thickness) / (6 * 1.5 * INCH ** 2));
  const longRacking = 27 + 45 * longFactor * heightFactor ** 1.5 + 17 * legFactor * heightFactor;
  const sideRacking = 27 + 44 * sideFactor * heightFactor ** 1.5 + 17 * legFactor * heightFactor;
  const stretcherCoverage = Math.min(1, 3 * thickness / Math.max(longSpan, EPSILON));
  const torsion = 34 + 36 * Math.sqrt(longFactor * sideFactor) * heightFactor + 18 * Math.min(1, stretcherCoverage / 0.055);
  const footprintLength = getParam(params, "tableLength") - (isOverhang(params) ? 2 * getParam(params, "topOverhang") : 0);
  const footprintWidth = getParam(params, "tableWidth") - (isOverhang(params) ? 2 * getParam(params, "topOverhang") : 0);
  const tippingRatio = Math.min(footprintLength, footprintWidth) / (2 * height);
  const tipping = 20 + 80 * Math.min(1, tippingRatio / 0.62);
  const floorRocking = levelingFeetEnabled(params) ? 98 : 70;
  const legSlenderness = (height - topThickness) / Math.sqrt(legWidth * thickness);
  const longSlenderness = longSpan / Math.sqrt(depth * thickness);
  const topSlenderness = getParam(params, "tableWidth") / topThickness;
  const stiffness = 100 - Math.max(0, legSlenderness - 9) * 3 - Math.max(0, longSlenderness - 31) * 1.2 - Math.max(0, topSlenderness - 28) * 0.7;
  const commonInputs = [
    { key: "overallHeight", label: "Overall height", value: height, format: "length" as const },
    { key: "memberDepth", label: "Frame member depth", value: depth, format: "length" as const },
    { key: "memberThickness", label: "Frame member thickness", value: thickness, format: "length" as const },
    { key: "legTopWidth", label: "Leg width at frame", value: legWidth, format: "length" as const },
    { key: "legFootWidth", label: "Leg contact width", value: legFoot, format: "length" as const },
  ];
  const metrics = [
    metric("longitudinal-racking", "Long-apron racking", longRacking, `${formatLength(depth, "in")} frame depth · ${formatLength(longSpan, "in")} span`, "The two continuous long aprons and four corner legs form the modeled lengthwise load path. Joint rotation is not credited.", commonInputs),
    metric("end-box-racking", "End-frame racking", sideRacking, `${formatLength(depth, "in")} frame depth · ${formatLength(sideSpan, "in")} span`, "The two short aprons close the end frames. Domino, dowel, or pocket-hole capacity must be established by the selected physical joint.", commonInputs),
    metric("torsion", "Frame-and-stretcher torsion", torsion, "closed perimeter frame · three cross stretchers", "The closed apron loop and three cross stretchers receive topology credit; tabletop fastener slip and joint stiffness remain unmodeled.", commonInputs),
    metric("tipping", "Tipping margin", tipping, `controlling half-footprint / height ${tippingRatio.toFixed(2)}`, "The support polygon is derived from the base envelope. This is not a safe-load prediction for sitting or climbing.", commonInputs),
    metric("floor-rocking", "Floor rocking tolerance", floorRocking, levelingFeetEnabled(params) ? "four independent adjusters" : "four fixed wood contacts", "Independent adjusters can bring all four contacts onto one plane; insert capacity and floor bearing still require physical checks.", commonInputs),
    metric("member-stiffness", "Member stiffness", stiffness, `leg ${legSlenderness.toFixed(1)}:1 · long apron ${longSlenderness.toFixed(1)}:1`, "This relative slenderness screen does not calculate allowable stress, deflection, buckling, or connection capacity.", commonInputs),
  ];
  const overallScore = score(metrics.reduce((total, entry) => total + entry.score * entry.calculation.weight, 0));
  return {
    overallScore,
    overallGrade: grade(overallScore),
    overallCalculation: {
      rationale: "The Vinny composite emphasizes the orthogonal apron frames and the three-stretcher torsional path while keeping floor contact, tipping, and slenderness visible.",
      formula: metrics.map((entry) => `${(entry.calculation.weight * 100).toFixed(0)}% × ${entry.label}`).join(" + "),
      scoringNote: "Geometry-only comparison, not a load, joint, or durability certification.",
    },
    metrics,
    basis: "geometry-only screening" as const,
  };
}

export function getVinnyTableStructuralAssessment(
  params: ModelParams,
): HoverDiningTableStructuralAssessment {
  const current = evaluateStructure(params);
  const height = getParam(params, "overallHeight");
  const stepMm = INCH;
  const assess = (heightMm: number) => {
    const next = evaluateStructure({ ...params, overallHeight: heightMm });
    return { heightMm, score: next.overallScore, delta: Number((next.overallScore - current.overallScore).toFixed(1)) };
  };
  return {
    ...current,
    heightSensitivity: {
      stepMm,
      lower: assess(height - stepMm),
      higher: assess(height + stepMm),
    },
  };
}

export function getVinnyTableParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const topThickness = getParam(params, "topThickness");
  const height = getParam(params, "overallHeight");
  if (key === "overallHeight") {
    limits.min = Math.max(limits.min, topThickness + 20 * INCH);
  } else if (key === "topThickness") {
    limits.max = Math.min(limits.max, height / 4);
    limits.min = Math.max(limits.min, getParam(params, "flushGrooveDepth") + limits.step);
  } else if (key === "topOverhang") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 8);
  } else if (key === "advancedLegFootWidth") {
    limits.max = Math.min(limits.max, getParam(params, "advancedLegTopWidth") - limits.step);
    limits.min = Math.max(limits.min, getParam(params, "advancedLegThickness") + limits.step);
  } else if (key === "advancedLegThickness") {
    limits.max = Math.min(limits.max, getParam(params, "advancedLegFootWidth") - limits.step);
  } else if (key === "advancedShoulderRadius") {
    limits.max = Math.min(limits.max, getParam(params, "advancedLegTopWidth") - getParam(params, "advancedLegFootWidth"));
  } else if (key === "flushGrooveDepth") {
    limits.max = Math.min(limits.max, topThickness - limits.step);
  } else if (key === "levelingFootExtension") {
    limits.min = Math.max(limits.min, getParam(params, "levelingFootPadThickness"));
    limits.max = Math.min(limits.max, getParam(params, "levelingFootRodLength") - limits.step);
  }
  return limits;
}

function auditItem(label: string, value: string, status: "pass" | "warn" = "pass"): AuditItem {
  return { label, value, status };
}

export function getVinnyTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const scale = getParam(params, "mockScale");
  const style = isAdvanced(params) ? "advanced mitered L" : isIntermediate(params) ? "intermediate double-taper" : "simple square";
  switch (check.key) {
    case "tableEnvelope":
      return auditItem(check.label, `${formatLength(getParam(params, "tableLength"), unit)} × ${formatLength(getParam(params, "tableWidth"), unit)} × ${formatLength(getParam(params, "overallHeight"), unit)}`);
    case "tabletopProfile":
      return auditItem(check.label, `${formatLength(getParam(params, "topThickness"), unit)} top · ${isOverhang(params) ? `${formatLength(getParam(params, "topOverhang"), unit)} overhang` : `${formatLength(getParam(params, "flushGrooveWidth"), unit)} × ${formatLength(getParam(params, "flushGrooveDepth"), unit)} flush shadow groove`}`);
    case "legGeometry":
      return auditItem(check.label, `4 ${style} legs · ${formatLength(getParam(params, isAdvanced(params) ? "advancedLegTopWidth" : "postLegTopSize"), unit)} top width`);
    case "legEndRoundovers":
      return auditItem(check.label, levelingFeetEnabled(params) ? `4 independent ${formatLength(getParam(params, "levelingFootPadDiameter"), unit)} pads` : "4 fixed wood contacts");
    case "cornerPlates":
      return auditItem(check.label, `2 × ${formatLength(longApronLength(params) * scale, unit)} long · 2 × ${formatLength(sideApronLength(params) * scale, unit)} short aprons`);
    case "channelLayout":
      return auditItem(check.label, `3 × ${formatLength(stretcherLength(params) * scale, unit)} cross stretchers · ${formatLength(getParam(params, "stretcherSpacing"), unit)} outer spacing`);
    case "printEnvelope": {
      const length = getParam(params, "tableLength") / scale;
      const width = getParam(params, "tableWidth") / scale;
      const height = getParam(params, "overallHeight") / scale;
      return auditItem(check.label, `1:${scale}; ${length.toFixed(1)} × ${width.toFixed(1)} × ${height.toFixed(1)} mm`, length <= 256 && width <= 256 ? "pass" : "warn");
    }
    case "minimumMockFeature": {
      const feature = Math.min(getParam(params, "flushGrooveDepth"), memberThickness(params) * scale, getParam(params, "levelingFootRodDiameter")) / scale;
      return auditItem(check.label, `${feature.toFixed(2)} mm`, feature >= 0.3 ? "pass" : "warn");
    }
    default:
      return auditItem(check.label, "Unsupported audit check", "warn");
  }
}

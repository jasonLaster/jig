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
const LEG_SPLAY_RADIANS = THREE.MathUtils.degToRad(15);

type RingPoint = { x: number; y: number };
type LoftLayer = {
  z: number;
  centerX?: number;
  centerY?: number;
  points: RingPoint[];
};

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function createLoftGeometry(
  layers: LoftLayer[],
  grainDirection: THREE.Vector3,
  textureSize: number,
) {
  if (layers.length < 2) throw new Error("A loft requires at least two layers");
  const pointCount = layers[0].points.length;
  if (
    pointCount < 3 ||
    layers.some((layer) => layer.points.length !== pointCount)
  ) {
    throw new Error("Every loft layer must share one polygon topology");
  }

  const vectorAt = (layer: LoftLayer, index: number) =>
    new THREE.Vector3(
      layer.points[index].x + (layer.centerX ?? 0),
      layer.points[index].y + (layer.centerY ?? 0),
      layer.z,
    );
  const positions: number[] = [];

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const lower = layers[layerIndex];
    const upper = layers[layerIndex + 1];
    for (let index = 0; index < pointCount; index += 1) {
      const next = (index + 1) % pointCount;
      const a = vectorAt(lower, index);
      const b = vectorAt(lower, next);
      const c = vectorAt(upper, next);
      const d = vectorAt(upper, index);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const addCap = (layer: LoftLayer, upward: boolean) => {
    const contour = layer.points.map(
      (point) =>
        new THREE.Vector2(
          point.x + (layer.centerX ?? 0),
          point.y + (layer.centerY ?? 0),
        ),
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

function rectanglePoints(width: number, depth: number): RingPoint[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ];
}

function chamferedRectanglePoints(
  width: number,
  depth: number,
  requestedChamfer: number,
): RingPoint[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const chamfer = Math.max(
    EPSILON,
    Math.min(requestedChamfer, halfWidth - EPSILON, halfDepth - EPSILON),
  );
  return [
    { x: -halfWidth + chamfer, y: -halfDepth },
    { x: halfWidth - chamfer, y: -halfDepth },
    { x: halfWidth, y: -halfDepth + chamfer },
    { x: halfWidth, y: halfDepth - chamfer },
    { x: halfWidth - chamfer, y: halfDepth },
    { x: -halfWidth + chamfer, y: halfDepth },
    { x: -halfWidth, y: halfDepth - chamfer },
    { x: -halfWidth, y: -halfDepth + chamfer },
  ];
}

function createPrismAlongX(
  length: number,
  crossSection: THREE.Vector2[],
  textureSize: number,
) {
  const positions: number[] = [];
  const xMin = -length / 2;
  const xMax = length / 2;
  const vectorAt = (x: number, point: THREE.Vector2) =>
    new THREE.Vector3(x, point.x, point.y);

  for (let index = 0; index < crossSection.length; index += 1) {
    const next = (index + 1) % crossSection.length;
    const a = vectorAt(xMin, crossSection[index]);
    const b = vectorAt(xMin, crossSection[next]);
    const c = vectorAt(xMax, crossSection[next]);
    const d = vectorAt(xMax, crossSection[index]);
    addTriangle(positions, a, c, b);
    addTriangle(positions, a, d, c);
  }
  const triangles = THREE.ShapeUtils.triangulateShape(crossSection, []);
  for (const [aIndex, bIndex, cIndex] of triangles) {
    addTriangle(
      positions,
      vectorAt(xMin, crossSection[aIndex]),
      vectorAt(xMin, crossSection[bIndex]),
      vectorAt(xMin, crossSection[cIndex]),
    );
    addTriangle(
      positions,
      vectorAt(xMax, crossSection[aIndex]),
      vectorAt(xMax, crossSection[cIndex]),
      vectorAt(xMax, crossSection[bIndex]),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignDirectionalWoodUvs(
    geometry,
    new THREE.Vector3(1, 0, 0),
    textureSize,
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function createPrismAlongY(
  length: number,
  crossSection: THREE.Vector2[],
  textureSize: number,
) {
  const alongX = createPrismAlongX(length, crossSection, textureSize);
  alongX.rotateZ(-Math.PI / 2);
  alongX.userData.woodGrainDirection = [0, -1, 0];
  return alongX;
}

function scaled(params: ModelParams, key: string) {
  return getParam(params, key) / getParam(params, "mockScale");
}

function grainTextureSize(params: ModelParams) {
  return 800 / getParam(params, "mockScale");
}

function getWhispererTopBottom(params: ModelParams) {
  return scaled(params, "overallHeight") - scaled(params, "topThickness");
}

function whispererLevelingFeetEnabled(params: ModelParams) {
  return getParam(params, "levelingFeetEnabled") >= 0.5;
}

function getWhispererWoodBottom(params: ModelParams) {
  return whispererLevelingFeetEnabled(params)
    ? scaled(params, "levelingFootExtension")
    : 0;
}

function getWhispererLegHeight(params: ModelParams) {
  return getWhispererTopBottom(params) - getWhispererWoodBottom(params);
}

function createWhispererTopGeometry(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const thickness = scaled(params, "topThickness");
  const edgeThickness = Math.min(
    scaled(params, "topEdgeThickness"),
    thickness - EPSILON,
  );
  const bevelInset = Math.min(
    scaled(params, "undersideBevelInset"),
    length / 2 - EPSILON,
    width / 2 - EPSILON,
  );
  const topBottom = getWhispererTopBottom(params);
  const innerLength = length - bevelInset * 2;
  const innerWidth = width - bevelInset * 2;
  return createLoftGeometry(
    [
      {
        z: topBottom,
        points: rectanglePoints(innerLength, innerWidth),
      },
      {
        z: topBottom + thickness - edgeThickness,
        points: rectanglePoints(length, width),
      },
      {
        z: topBottom + thickness,
        points: rectanglePoints(length, width),
      },
    ],
    new THREE.Vector3(1, 0, 0),
    grainTextureSize(params),
  );
}

function createWhispererLegGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const height = getWhispererLegHeight(params);
  const topWidth = scaled(params, "legTopWidth");
  const footWidth = scaled(params, "legFootWidth");
  const thickness = scaled(params, "legThickness");
  const footChamfer = scaled(params, "legFootChamfer");
  const woodBottom = getWhispererWoodBottom(params);
  const topCenterX = xSign * scaled(params, "longApronLength") / 2;
  const bottomCenterX =
    topCenterX + xSign * height * Math.tan(LEG_SPLAY_RADIANS);
  const centerY = ySign * scaled(params, "sideApronLength") / 2;

  return createLoftGeometry(
    [
      {
        z: woodBottom,
        centerX: bottomCenterX,
        centerY,
        points: chamferedRectanglePoints(
          footWidth,
          thickness,
          footChamfer,
        ),
      },
      {
        z: woodBottom + height,
        centerX: topCenterX,
        centerY,
        points: chamferedRectanglePoints(topWidth, thickness, EPSILON),
      },
    ],
    new THREE.Vector3(topCenterX - bottomCenterX, 0, height),
    grainTextureSize(params),
  );
}

function apronCrossSection(depth: number, height: number, chamferRise: number) {
  const halfDepth = depth / 2;
  const rise = Math.min(chamferRise, height / 2, depth - EPSILON);
  return [
    new THREE.Vector2(-halfDepth, 0),
    new THREE.Vector2(-halfDepth, height),
    new THREE.Vector2(halfDepth, height),
    new THREE.Vector2(halfDepth, rise),
    new THREE.Vector2(halfDepth - rise, 0),
  ];
}

function createLongApronGeometry(params: ModelParams, ySign: -1 | 1) {
  const length = scaled(params, "longApronLength");
  const height = scaled(params, "longApronHeight");
  const thickness = scaled(params, "apronThickness");
  const setback = scaled(params, "apronSetback");
  const legDepth = scaled(params, "legThickness");
  const y =
    ySign *
    (scaled(params, "sideApronLength") / 2 + legDepth / 2 - setback - thickness / 2);
  const geometry = createPrismAlongX(
    length,
    apronCrossSection(thickness, height, thickness / 2),
    grainTextureSize(params),
  );
  geometry.translate(0, y, getWhispererTopBottom(params) - height);
  return geometry;
}

function createSideApronGeometry(params: ModelParams, xSign: -1 | 1) {
  const length = scaled(params, "sideApronLength");
  const height = scaled(params, "sideApronHeight");
  const thickness = scaled(params, "apronThickness");
  const setback = scaled(params, "apronSetback");
  const topCenter =
    xSign *
    (scaled(params, "longApronLength") / 2 +
      scaled(params, "legTopWidth") / 2 -
      setback -
      thickness / 2);
  const crossSection = apronCrossSection(
    thickness,
    height,
    thickness * Math.tan(THREE.MathUtils.degToRad(30)),
  ).map(
    (point) =>
      new THREE.Vector2(
        point.x +
          xSign * (height - point.y) * Math.tan(LEG_SPLAY_RADIANS),
        point.y,
      ),
  );
  const geometry = createPrismAlongY(
    length,
    crossSection,
    grainTextureSize(params),
  );
  geometry.translate(topCenter, 0, getWhispererTopBottom(params) - height);
  return geometry;
}

function createWhispererLevelingFootGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const scale = getParam(params, "mockScale");
  const padDiameter = getParam(params, "levelingFootPadDiameter") / scale;
  const padThickness = getParam(params, "levelingFootPadThickness") / scale;
  const rodDiameter = getParam(params, "levelingFootRodDiameter") / scale;
  const rodLength = getParam(params, "levelingFootRodLength") / scale;
  const woodHeight = getWhispererLegHeight(params);
  const centerX =
    xSign * scaled(params, "longApronLength") / 2 +
    xSign * woodHeight * Math.tan(LEG_SPLAY_RADIANS);
  const centerY = ySign * scaled(params, "sideApronLength") / 2;
  const pad = new THREE.CylinderGeometry(
    padDiameter / 2,
    padDiameter / 2,
    padThickness,
    32,
  );
  pad.rotateX(Math.PI / 2);
  pad.translate(centerX, centerY, padThickness / 2);
  const rod = new THREE.CylinderGeometry(
    rodDiameter / 2,
    rodDiameter / 2,
    rodLength,
    24,
  );
  rod.rotateX(Math.PI / 2);
  rod.translate(centerX, centerY, padThickness + rodLength / 2);
  const geometry = mergeGeometries([pad, rod], false);
  pad.dispose();
  rod.dispose();
  if (!geometry) throw new Error("Unable to merge Whisperer leveling foot");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createWhispererTableHardwareGeometries(params: ModelParams) {
  if (!whispererLevelingFeetEnabled(params)) return { feet: [] };
  return {
    feet: ([-1, 1] as const).flatMap((xSign) =>
      ([-1, 1] as const).map((ySign) =>
        createWhispererLevelingFootGeometry(params, xSign, ySign),
      ),
    ),
  };
}

export function isWhispererParams(params: ModelParams) {
  return Number.isFinite(params.undersideBevelInset);
}

const WHISPERER_STRUCTURAL_REFERENCE = {
  height: 30 * 25.4,
  topThickness: 1.75 * 25.4,
  topEdgeThickness: 0.5 * 25.4,
  legTopWidth: 4 * 25.4,
  legFootWidth: 2.375 * 25.4,
  legThickness: 1.75 * 25.4,
  longApronLength: 52.25 * 25.4,
  longApronHeight: 3.5 * 25.4,
  sideApronLength: 25.5 * 25.4,
  sideApronHeight: 4 * 25.4,
  apronThickness: 1.5 * 25.4,
} as const;

const WHISPERER_STRUCTURAL_WEIGHTS: Record<
  HoverDiningTableStructuralMetric["key"],
  number
> = {
  "longitudinal-racking": 0.24,
  "end-box-racking": 0.22,
  torsion: 0.18,
  tipping: 0.14,
  "floor-rocking": 0.1,
  "member-stiffness": 0.12,
};

function whispererStructuralScore(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function whispererStructuralGrade(
  score: number,
): HoverDiningTableStructuralGrade {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function whispererStructuralMetric(
  key: HoverDiningTableStructuralMetric["key"],
  label: string,
  rawScore: number,
  detail: string,
  calculation: Pick<
    HoverDiningTableStructuralMetric["calculation"],
    "rationale" | "formula" | "inputs"
  >,
): HoverDiningTableStructuralMetric {
  const score = whispererStructuralScore(rawScore);
  const weight = WHISPERER_STRUCTURAL_WEIGHTS[key];
  return {
    key,
    label,
    score,
    grade: whispererStructuralGrade(score),
    detail,
    calculation: {
      ...calculation,
      rawScore: Number(rawScore.toFixed(1)),
      weight,
      scoringNote: `Raw result ${rawScore.toFixed(1)} is clamped to 0–100, then contributes ${(weight * 100).toFixed(0)}% of the overall score (${(score * weight).toFixed(1)} weighted points). Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50.`,
    },
  };
}

function evaluateWhispererTableStructure(
  params: ModelParams,
): Omit<HoverDiningTableStructuralAssessment, "heightSensitivity"> {
  const height = getParam(params, "overallHeight");
  const topThickness = getParam(params, "topThickness");
  const topEdgeThickness = getParam(params, "topEdgeThickness");
  const tableWidth = getParam(params, "tableWidth");
  const bevelInset = getParam(params, "undersideBevelInset");
  const legTopWidth = getParam(params, "legTopWidth");
  const legFootWidth = getParam(params, "legFootWidth");
  const legThickness = getParam(params, "legThickness");
  const legFootChamfer = getParam(params, "legFootChamfer");
  const levelingFeetEnabled = whispererLevelingFeetEnabled(params);
  const levelingFootPadDiameter = getParam(
    params,
    "levelingFootPadDiameter",
  );
  const levelingFootRodDiameter = getParam(
    params,
    "levelingFootRodDiameter",
  );
  const levelingFootExtension = levelingFeetEnabled
    ? getParam(params, "levelingFootExtension")
    : 0;
  const longApronLength = getParam(params, "longApronLength");
  const longApronHeight = getParam(params, "longApronHeight");
  const sideApronLength = getParam(params, "sideApronLength");
  const sideApronHeight = getParam(params, "sideApronHeight");
  const apronThickness = getParam(params, "apronThickness");
  const apronSetback = getParam(params, "apronSetback");
  const legHeight = height - topThickness - levelingFootExtension;
  const heightFactor = WHISPERER_STRUCTURAL_REFERENCE.height / height;
  const legSectionFactor = Math.sqrt(
    (legTopWidth * legThickness) /
      (WHISPERER_STRUCTURAL_REFERENCE.legTopWidth *
        WHISPERER_STRUCTURAL_REFERENCE.legThickness),
  );
  const setbackFactor = Math.max(
    0.7,
    Math.min(1, 1 - (apronSetback / legThickness) * 0.25),
  );
  const longApronFactor =
    (longApronHeight / WHISPERER_STRUCTURAL_REFERENCE.longApronHeight) ** 1.5 *
    (apronThickness / WHISPERER_STRUCTURAL_REFERENCE.apronThickness) ** 0.5 *
    (WHISPERER_STRUCTURAL_REFERENCE.longApronLength / longApronLength) ** 0.5;
  const sideApronFactor =
    (sideApronHeight / WHISPERER_STRUCTURAL_REFERENCE.sideApronHeight) ** 1.5 *
    (apronThickness / WHISPERER_STRUCTURAL_REFERENCE.apronThickness) ** 0.5 *
    (WHISPERER_STRUCTURAL_REFERENCE.sideApronLength / sideApronLength) ** 0.5;

  const longitudinalRacking =
    25 +
    42 * longApronFactor * setbackFactor * heightFactor ** 1.5 +
    18 * legSectionFactor * heightFactor;
  const sideFrameRacking =
    25 +
    44 * sideApronFactor * setbackFactor * heightFactor ** 1.5 +
    16 * legSectionFactor * heightFactor;

  const centerFieldFraction = Math.max(
    0,
    Math.min(1, (tableWidth - 2 * bevelInset) / tableWidth),
  );
  const effectiveTopThickness =
    topEdgeThickness +
    (topThickness - topEdgeThickness) * Math.cbrt(centerFieldFraction);
  const topTorsionFactor =
    effectiveTopThickness /
    (WHISPERER_STRUCTURAL_REFERENCE.topEdgeThickness +
      (WHISPERER_STRUCTURAL_REFERENCE.topThickness -
        WHISPERER_STRUCTURAL_REFERENCE.topEdgeThickness) *
        Math.cbrt(0.75));
  const torsion =
    25 +
    42 *
      Math.sqrt(longApronFactor * sideApronFactor) *
      setbackFactor *
      heightFactor ** 0.6 +
    18 * topTorsionFactor;

  const splayRun = legHeight * Math.tan(LEG_SPLAY_RADIANS);
  const contactDiameter = levelingFeetEnabled
    ? levelingFootPadDiameter
    : 0;
  const footprintLength =
    longApronLength +
    2 * splayRun +
    (levelingFeetEnabled ? contactDiameter : legFootWidth);
  const footprintWidth =
    sideApronLength +
    (levelingFeetEnabled ? contactDiameter : legThickness);
  const controllingTippingRatio = Math.min(
    footprintLength / (2 * height),
    footprintWidth / (2 * height),
  );
  const tipping =
    20 + 80 * Math.min(1, controllingTippingRatio / 0.65);

  const nominalFootArea = legFootWidth * legThickness;
  const flatFootArea = Math.max(
    0,
    nominalFootArea - 2 * legFootChamfer ** 2,
  );
  const flatFootFraction = flatFootArea / nominalFootArea;
  const rodEntryClearance =
    Math.min(legFootWidth, legThickness) / 2 - levelingFootRodDiameter / 2;
  const floorRocking = levelingFeetEnabled
    ? 96 +
      2 *
        Math.max(
          0,
          Math.min(1, rodEntryClearance / levelingFootRodDiameter),
        )
    : 52 + 20 * flatFootFraction;

  const averageLegWidth = (legTopWidth + legFootWidth) / 2;
  const legSlenderness = legHeight / Math.sqrt(averageLegWidth * legThickness);
  const longApronSlenderness =
    longApronLength / Math.sqrt(longApronHeight * apronThickness);
  const sideApronSlenderness =
    sideApronLength / Math.sqrt(sideApronHeight * apronThickness);
  const tabletopSlenderness = tableWidth / effectiveTopThickness;
  const memberStiffness =
    100 -
    Math.max(0, legSlenderness - 11) * 3 -
    Math.max(0, longApronSlenderness - 24) * 1 -
    Math.max(0, sideApronSlenderness - 14) * 0.7 -
    Math.max(0, tabletopSlenderness - 24) * 0.9;

  const metrics = [
    whispererStructuralMetric(
      "longitudinal-racking",
      "Long-apron racking",
      longitudinalRacking,
      `${formatLength(longApronHeight, "in")} deep apron · ${longApronSlenderness.toFixed(1)}:1 span ratio`,
      {
        rationale:
          "Lengthwise sway is screened from the long-apron section, span, leg section, table height, and apron setback. The model does not specify mortise-and-tenon dimensions, glue area, or fasteners, so joint rotation remains uncredited and must be tested physically.",
        formula:
          "25 + 42 × longApronFactor × setbackFactor × heightFactor^1.5 + 18 × legSectionFactor × heightFactor",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "longApronLength", label: "Long apron span", value: longApronLength, format: "length" },
          { key: "longApronHeight", label: "Long apron depth", value: longApronHeight, format: "length" },
          { key: "apronThickness", label: "Apron thickness", value: apronThickness, format: "length" },
          { key: "apronSetback", label: "Apron setback", value: apronSetback, format: "length" },
          { key: "longApronFactor", label: "Derived long-apron factor", value: longApronFactor, format: "number", precision: 3 },
        ],
      },
    ),
    whispererStructuralMetric(
      "end-box-racking",
      "Side-frame racking",
      sideFrameRacking,
      `${formatLength(sideApronHeight, "in")} deep apron · ${sideApronSlenderness.toFixed(1)}:1 span ratio`,
      {
        rationale:
          "Crosswise sway is screened from each side apron and its two leg sections. The splayed geometry is represented by height and section proportions, but the unknown apron-to-leg joint stiffness is deliberately not treated as proven capacity.",
        formula:
          "25 + 44 × sideApronFactor × setbackFactor × heightFactor^1.5 + 16 × legSectionFactor × heightFactor",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "sideApronLength", label: "Side apron span", value: sideApronLength, format: "length" },
          { key: "sideApronHeight", label: "Side apron depth", value: sideApronHeight, format: "length" },
          { key: "apronThickness", label: "Apron thickness", value: apronThickness, format: "length" },
          { key: "apronSetback", label: "Apron setback", value: apronSetback, format: "length" },
          { key: "sideApronFactor", label: "Derived side-apron factor", value: sideApronFactor, format: "number", precision: 3 },
        ],
      },
    ),
    whispererStructuralMetric(
      "torsion",
      "Apron-frame torsion",
      torsion,
      `closed four-apron frame · ${formatLength(effectiveTopThickness, "in")} effective top thickness`,
      {
        rationale:
          "The closed four-apron loop and the beveled solid top provide the modeled torsional load paths. The effective top thickness preserves the full center field while discounting the thin perimeter; tabletop fastener slip and joint rotation remain outside the screen.",
        formula:
          "25 + 42 × sqrt(longApronFactor × sideApronFactor) × setbackFactor × heightFactor^0.6 + 18 × topTorsionFactor",
        inputs: [
          { key: "topThickness", label: "Full top thickness", value: topThickness, format: "length" },
          { key: "topEdgeThickness", label: "Perimeter edge thickness", value: topEdgeThickness, format: "length" },
          { key: "undersideBevelInset", label: "Underside bevel inset", value: bevelInset, format: "length" },
          { key: "centerFieldFraction", label: "Full-thickness center fraction", value: centerFieldFraction, format: "number", precision: 3 },
          { key: "effectiveTopThickness", label: "Derived effective top thickness", value: effectiveTopThickness, format: "length" },
          { key: "topTorsionFactor", label: "Derived tabletop factor", value: topTorsionFactor, format: "number", precision: 3 },
        ],
      },
    ),
    whispererStructuralMetric(
      "tipping",
      "Splayed-foot tipping margin",
      tipping,
      `controlling half-footprint / height ${controllingTippingRatio.toFixed(2)}`,
      {
        rationale:
          "The support polygon uses the actual longitudinal 15-degree splay and the crosswise contact spacing. Adjustable pads replace the wood-foot extents when enabled. The smaller half-footprint-to-height ratio controls; this is not a safe-load prediction for sitting, leaning, or climbing.",
        formula:
          "20 + 80 × min(1, min(footprintLength ÷ 2 ÷ height, footprintWidth ÷ 2 ÷ height) ÷ 0.65)",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "floorContactSystem", label: "Floor-contact system", value: levelingFeetEnabled ? "independent leveling pads" : "fixed wood feet", format: "choice" },
          { key: "legSplayDegrees", label: "Fixed leg splay", value: 15, format: "number", precision: 0, suffix: "°" },
          { key: "splayRun", label: "Derived longitudinal splay run", value: splayRun, format: "length" },
          { key: "contactDiameter", label: "Controlling contact width", value: levelingFeetEnabled ? contactDiameter : Math.min(legFootWidth, legThickness), format: "length" },
          { key: "footprintLength", label: "Contact footprint length", value: footprintLength, format: "length" },
          { key: "footprintWidth", label: "Contact footprint width", value: footprintWidth, format: "length" },
        ],
      },
    ),
    whispererStructuralMetric(
      "floor-rocking",
      "Floor rocking tolerance",
      floorRocking,
      levelingFeetEnabled
        ? `four independently adjustable pads · ${formatLength(rodEntryClearance, "in")} minimum rod-entry clearance`
        : `four fixed chamfered wood contacts · ${(flatFootFraction * 100).toFixed(0)}% nominal foot area`,
      {
        rationale: levelingFeetEnabled
          ? "Four independently adjustable corner pads can be brought onto one plane, so the score no longer depends on a perfectly flat floor. The small final term rewards clearance around the centered threaded-rod entry; adjuster travel, insert capacity, floor friction, and settling still require physical checks."
          : "Four fixed legs are statically over-constrained on an uneven floor. Chamfered feet retain most of their nominal contact area, but cannot independently level themselves; the finished table may still need field shimming.",
        formula: levelingFeetEnabled
          ? "96 + 2 × clamp(rodEntryClearance ÷ rodDiameter, 0, 1)"
          : "52 + 20 × clamp((footWidth × footThickness − 2 × chamfer²) ÷ (footWidth × footThickness), 0, 1)",
        inputs: levelingFeetEnabled
          ? [
              { key: "levelingFeetEnabled", label: "Floor-contact system", value: "four independent adjusters", format: "choice" },
              { key: "levelingFootPadDiameter", label: "Pad diameter", value: levelingFootPadDiameter, format: "length" },
              { key: "levelingFootRodDiameter", label: "Threaded-rod diameter", value: levelingFootRodDiameter, format: "length" },
              { key: "levelingFootExtension", label: "Installed extension", value: levelingFootExtension, format: "length" },
              { key: "rodEntryClearance", label: "Derived rod-entry clearance", value: rodEntryClearance, format: "length" },
            ]
          : [
              { key: "levelingFeetEnabled", label: "Floor-contact system", value: "fixed wood contacts", format: "choice" },
              { key: "legFootWidth", label: "Foot width", value: legFootWidth, format: "length" },
              { key: "legThickness", label: "Foot thickness", value: legThickness, format: "length" },
              { key: "legFootChamfer", label: "Foot corner chamfer", value: legFootChamfer, format: "length" },
              { key: "flatFootArea", label: "Derived flat contact area", value: flatFootArea, format: "number", precision: 0, suffix: " mm²" },
              { key: "flatFootFraction", label: "Derived contact fraction", value: flatFootFraction, format: "number", precision: 3 },
            ],
      },
    ),
    whispererStructuralMetric(
      "member-stiffness",
      "Member stiffness",
      memberStiffness,
      `leg ${legSlenderness.toFixed(1)}:1 · long apron ${longApronSlenderness.toFixed(1)}:1 · top ${tabletopSlenderness.toFixed(1)}:1`,
      {
        rationale:
          "This relative screen compares tapered-leg, apron, and effective tabletop slenderness. It does not calculate load deflection, allowable stress, buckling, grain direction, or connection capacity.",
        formula:
          "100 − max(0, legSlenderness − 11) × 3 − max(0, longApronSlenderness − 24) − max(0, sideApronSlenderness − 14) × 0.7 − max(0, tabletopSlenderness − 24) × 0.9",
        inputs: [
          { key: "legHeight", label: "Clear leg height", value: legHeight, format: "length" },
          { key: "averageLegWidth", label: "Average tapered-leg width", value: averageLegWidth, format: "length" },
          { key: "legSlenderness", label: "Derived leg slenderness", value: legSlenderness, format: "number", precision: 2, suffix: ":1" },
          { key: "longApronSlenderness", label: "Derived long-apron slenderness", value: longApronSlenderness, format: "number", precision: 2, suffix: ":1" },
          { key: "sideApronSlenderness", label: "Derived side-apron slenderness", value: sideApronSlenderness, format: "number", precision: 2, suffix: ":1" },
          { key: "tabletopSlenderness", label: "Derived tabletop slenderness", value: tabletopSlenderness, format: "number", precision: 2, suffix: ":1" },
        ],
      },
    ),
  ];
  const overallScore = whispererStructuralScore(
    metrics.reduce(
      (total, metric) =>
        total + metric.score * WHISPERER_STRUCTURAL_WEIGHTS[metric.key],
      0,
    ),
  );
  return {
    overallScore,
    overallGrade: whispererStructuralGrade(overallScore),
    overallCalculation: {
      rationale:
        "The Whisperer composite emphasizes its two orthogonal apron-frame racking screens, followed by closed-frame torsion. Splayed-foot tipping, fixed-floor contact, and member slenderness remain visible without implying that undocumented joinery has been validated.",
      formula: metrics
        .map(
          (metric) =>
            `${(WHISPERER_STRUCTURAL_WEIGHTS[metric.key] * 100).toFixed(0)}% × ${metric.label}`,
        )
        .join(" + "),
      scoringNote: `The weighted sum is ${overallScore.toFixed(1)}. Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50. This remains a geometry-only comparison, not a load, joint, or durability certification.`,
    },
    metrics,
    basis: "geometry-only screening",
  };
}

export function getWhispererTableStructuralAssessment(
  params: ModelParams,
): HoverDiningTableStructuralAssessment {
  const current = evaluateWhispererTableStructure(params);
  const height = getParam(params, "overallHeight");
  const stepMm = 25.4;
  const assessHeight = (heightMm: number) => {
    try {
      const score = evaluateWhispererTableStructure({
        ...params,
        overallHeight: heightMm,
      }).overallScore;
      return {
        heightMm,
        score,
        delta: Number((score - current.overallScore).toFixed(1)),
      };
    } catch {
      return null;
    }
  };
  return {
    ...current,
    heightSensitivity: {
      stepMm,
      lower: assessHeight(height - stepMm),
      higher: assessHeight(height + stepMm),
    },
  };
}

export function createWhispererTableWoodGeometry(params: ModelParams) {
  const partNames = [
    "tabletop",
    "leg-left-front",
    "leg-left-rear",
    "leg-right-front",
    "leg-right-rear",
    "long-apron-front",
    "long-apron-rear",
    "side-apron-left",
    "side-apron-right",
  ] as const;
  const geometries = [
    createWhispererTopGeometry(params),
    createWhispererLegGeometry(params, -1, -1),
    createWhispererLegGeometry(params, -1, 1),
    createWhispererLegGeometry(params, 1, -1),
    createWhispererLegGeometry(params, 1, 1),
    createLongApronGeometry(params, -1),
    createLongApronGeometry(params, 1),
    createSideApronGeometry(params, -1),
    createSideApronGeometry(params, 1),
  ];
  const merged = mergeGeometries(geometries, false);
  let vertexStart = 0;
  const woodGrainParts = geometries.map((geometry, index) => {
    const vertexCount = geometry.getAttribute("position").count;
    const part = {
      direction: geometry.userData.woodGrainDirection as [number, number, number],
      name: partNames[index],
      vertexCount,
      vertexStart,
    };
    vertexStart += vertexCount;
    return part;
  });
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge Whisperer table geometry");
  merged.userData.woodGrainParts = woodGrainParts;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function getWhispererTableParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const topThickness = getParam(params, "topThickness");
  const overallHeight = getParam(params, "overallHeight");
  const legTopWidth = getParam(params, "legTopWidth");
  const legFootWidth = getParam(params, "legFootWidth");
  const legThickness = getParam(params, "legThickness");
  const feetEnabled = whispererLevelingFeetEnabled(params);
  const footExtension = feetEnabled
    ? getParam(params, "levelingFootExtension")
    : 0;
  const footPadThickness = getParam(params, "levelingFootPadThickness");
  const footRodDiameter = getParam(params, "levelingFootRodDiameter");
  const footRodLength = getParam(params, "levelingFootRodLength");

  if (key === "topThickness") {
    limits.max = Math.min(limits.max, overallHeight / 4);
    limits.min = Math.max(limits.min, getParam(params, "topEdgeThickness"));
  } else if (key === "topEdgeThickness") {
    limits.max = Math.min(limits.max, topThickness - limits.step);
  } else if (key === "undersideBevelInset") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 2 - limits.step);
  } else if (key === "overallHeight") {
    limits.min = Math.max(
      limits.min,
      topThickness + footExtension + 20 * 25.4,
    );
  } else if (key === "legTopWidth") {
    limits.max = Math.min(limits.max, length / 8);
    limits.min = Math.max(limits.min, legFootWidth);
  } else if (key === "legFootWidth") {
    limits.max = Math.min(limits.max, legTopWidth);
    if (feetEnabled) {
      limits.min = Math.max(limits.min, footRodDiameter + limits.step);
    }
  } else if (key === "legThickness") {
    limits.max = Math.min(limits.max, width / 8);
    limits.min = Math.max(
      limits.min,
      getParam(params, "legFootChamfer") * 2 + limits.step,
      ...(feetEnabled ? [footRodDiameter + limits.step] : []),
    );
  } else if (key === "legFootChamfer") {
    limits.max = Math.min(
      limits.max,
      legFootWidth / 2 - limits.step,
      legThickness / 2 - limits.step,
    );
  } else if (key === "longApronLength") {
    limits.max = Math.min(limits.max, length - legTopWidth);
  } else if (key === "sideApronLength") {
    limits.max = Math.min(limits.max, width - legThickness);
  } else if (key === "longApronHeight" || key === "sideApronHeight") {
    limits.max = Math.min(limits.max, overallHeight - topThickness);
  } else if (key === "apronThickness") {
    limits.max = Math.min(limits.max, legThickness);
  } else if (key === "apronSetback") {
    limits.max = Math.min(limits.max, legThickness / 2 - limits.step);
  } else if (key === "levelingFootPadThickness" && feetEnabled) {
    limits.max = Math.min(limits.max, footExtension);
  } else if (key === "levelingFootRodDiameter" && feetEnabled) {
    limits.max = Math.min(
      limits.max,
      legFootWidth - limits.step,
      legThickness - limits.step,
    );
  } else if (key === "levelingFootRodLength" && feetEnabled) {
    const exposedRodLength = Math.max(0, footExtension - footPadThickness);
    limits.min = Math.max(limits.min, exposedRodLength + limits.step);
    limits.max = Math.min(
      limits.max,
      overallHeight - topThickness - footExtension + exposedRodLength,
    );
  } else if (key === "levelingFootExtension" && feetEnabled) {
    limits.min = Math.max(limits.min, footPadThickness);
    limits.max = Math.min(
      limits.max,
      footPadThickness + footRodLength - limits.step,
      overallHeight - topThickness - 20 * 25.4,
    );
  }
  return limits;
}

function item(
  label: string,
  value: string,
  status: "pass" | "warn" = "pass",
): AuditItem {
  return { label, value, status };
}

export function getWhispererTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const scale = getParam(params, "mockScale");
  const feetEnabled = whispererLevelingFeetEnabled(params);
  const footExtension = feetEnabled
    ? getParam(params, "levelingFootExtension")
    : 0;
  const legVerticalHeight =
    getParam(params, "overallHeight") -
    getParam(params, "topThickness") -
    footExtension;
  const legBlankLength = legVerticalHeight / Math.cos(LEG_SPLAY_RADIANS);
  switch (check.key) {
    case "tableEnvelope":
      return item(
        check.label,
        `${formatLength(getParam(params, "tableLength"), unit)} × ${formatLength(getParam(params, "tableWidth"), unit)} × ${formatLength(getParam(params, "overallHeight"), unit)}`,
      );
    case "tabletopProfile":
      return item(
        check.label,
        `${formatLength(getParam(params, "topThickness"), unit)} top · ${formatLength(getParam(params, "topEdgeThickness"), unit)} edge · ${formatLength(getParam(params, "undersideBevelInset"), unit)} bevel inset`,
      );
    case "legGeometry":
      return item(
        check.label,
        `4 × ${formatLength(legBlankLength, unit)} blanks · 15° splay · ${formatLength(getParam(params, "legTopWidth"), unit)} to ${formatLength(getParam(params, "legFootWidth"), unit)} taper`,
      );
    case "legEndRoundovers":
      return feetEnabled
        ? item(
            check.label,
            `4 independent ${formatLength(getParam(params, "levelingFootPadDiameter"), unit)} pads · ${formatLength(getParam(params, "levelingFootRodDiameter"), unit)} rods · ${formatLength(footExtension, unit)} installed · ${formatLength(getParam(params, "legFootChamfer"), unit)} wood chamfers`,
          )
        : item(
            check.label,
            `${formatLength(getParam(params, "legFootChamfer"), unit)} wood chamfers · fixed floor contact`,
          );
    case "cornerPlates":
      return item(
        check.label,
        `2 long + 2 side aprons · ${formatLength(getParam(params, "apronThickness"), unit)} thick · ${formatLength(getParam(params, "apronSetback"), unit)} setback`,
      );
    case "channelLayout":
      return item(
        check.label,
        `1 top · 4 legs · 2 × ${formatLength(getParam(params, "longApronLength"), unit)} long aprons · 2 × ${formatLength(getParam(params, "sideApronLength"), unit)} side aprons${feetEnabled ? " · 4 leveling feet" : ""}`,
      );
    case "printEnvelope": {
      const length = getParam(params, "tableLength") / scale;
      const width = getParam(params, "tableWidth") / scale;
      const height = getParam(params, "overallHeight") / scale;
      return item(
        check.label,
        `1:${scale}; ${length.toFixed(1)} × ${width.toFixed(1)} × ${height.toFixed(1)} mm`,
        length <= 256 && width <= 256 ? "pass" : "warn",
      );
    }
    case "minimumMockFeature": {
      const feature =
        Math.min(
          getParam(params, "topEdgeThickness"),
          getParam(params, "legFootChamfer"),
          getParam(params, "apronSetback"),
        ) / scale;
      return item(
        check.label,
        `${feature.toFixed(2)} mm`,
        feature >= 0.3 ? "pass" : "warn",
      );
    }
    default:
      return item(check.label, "Unsupported audit check", "warn");
  }
}

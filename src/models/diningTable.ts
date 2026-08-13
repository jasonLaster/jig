import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import {
  assignDirectionalWoodUvs,
  collectWoodGrainParts,
} from "./woodGrainUvs";
import {
  createWhispererTableWoodGeometry,
  createWhispererTableHardwareGeometries,
  getWhispererTableAuditValue,
  getWhispererTableParameterLimits,
  getWhispererTableStructuralAssessment,
  isWhispererParams,
} from "./whispererTable";
import {
  createVinnyTableHardwareGeometries,
  createVinnyTableWoodGeometry,
  getVinnyTableAuditValue,
  getVinnyTableParameterLimits,
  getVinnyTableStructuralAssessment,
  isVinnyParams,
} from "./vinnyTable";
import type {
  AuditCheckDefinition,
  AuditItem,
  DiningTableModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";
import type {
  HoverDiningTableStructuralAssessment,
  HoverDiningTableStructuralGrade,
  HoverDiningTableStructuralMetric,
} from "./hoverDiningTable";

type LoftLayer = {
  z: number;
  width: number;
  depth: number;
  radius: number | CornerRadii;
};

type CornerRadii = [number, number, number, number];

const EPSILON = 1e-6;

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function roundedRectRing(
  width: number,
  depth: number,
  radius: number | CornerRadii,
  cornerSegments: number,
) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const requestedRadii: CornerRadii = Array.isArray(radius)
    ? radius
    : [radius, radius, radius, radius];
  const safeRadii = requestedRadii.map((cornerRadius) =>
    Math.max(
      0,
      Math.min(cornerRadius, halfWidth - EPSILON, halfDepth - EPSILON),
    ),
  ) as CornerRadii;
  const centers = safeRadii.map((cornerRadius, cornerIndex) => {
    const xSign = cornerIndex === 0 || cornerIndex === 3 ? 1 : -1;
    const ySign = cornerIndex < 2 ? 1 : -1;
    return new THREE.Vector2(
      xSign * (halfWidth - cornerRadius),
      ySign * (halfDepth - cornerRadius),
    );
  });

  return centers.flatMap((center, cornerIndex) =>
    Array.from({ length: cornerSegments }, (_, segmentIndex) => {
      const angle =
        (cornerIndex * Math.PI) / 2 +
        (segmentIndex / cornerSegments) * (Math.PI / 2);
      const cornerRadius = safeRadii[cornerIndex];
      return new THREE.Vector2(
        center.x + Math.cos(angle) * cornerRadius,
        center.y + Math.sin(angle) * cornerRadius,
      );
    }),
  );
}

function assignPlanarUvs(geometry: THREE.BufferGeometry) {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  const size = new THREE.Vector3();
  bounds.getSize(size);
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    let u = 0;
    let v = 0;
    if (nz >= nx && nz >= ny) {
      u = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      v = (y - bounds.min.y) / Math.max(size.y, EPSILON);
    } else if (nx >= ny) {
      u = (y - bounds.min.y) / Math.max(size.y, EPSILON);
      v = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    } else {
      u = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      v = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    }
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function createRoundedLoft(
  layers: LoftLayer[],
  cornerSegments: number,
) {
  const sorted = layers.slice().sort((a, b) => a.z - b.z);
  const rings = sorted.map((layer) =>
    roundedRectRing(
      layer.width,
      layer.depth,
      layer.radius,
      cornerSegments,
    ),
  );
  const positions: number[] = [];

  for (let layerIndex = 0; layerIndex < rings.length - 1; layerIndex += 1) {
    const lower = rings[layerIndex];
    const upper = rings[layerIndex + 1];
    for (let index = 0; index < lower.length; index += 1) {
      const next = (index + 1) % lower.length;
      const a = new THREE.Vector3(lower[index].x, lower[index].y, sorted[layerIndex].z);
      const b = new THREE.Vector3(lower[next].x, lower[next].y, sorted[layerIndex].z);
      const c = new THREE.Vector3(upper[next].x, upper[next].y, sorted[layerIndex + 1].z);
      const d = new THREE.Vector3(upper[index].x, upper[index].y, sorted[layerIndex + 1].z);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const addCap = (ring: THREE.Vector2[], z: number, upward: boolean) => {
    const triangles = THREE.ShapeUtils.triangulateShape(
      ring.map((point) => point.clone()),
      [],
    );
    for (const [aIndex, bIndex, cIndex] of triangles) {
      const a = new THREE.Vector3(ring[aIndex].x, ring[aIndex].y, z);
      const b = new THREE.Vector3(ring[bIndex].x, ring[bIndex].y, z);
      const c = new THREE.Vector3(ring[cIndex].x, ring[cIndex].y, z);
      if (upward) addTriangle(positions, a, b, c);
      else addTriangle(positions, a, c, b);
    }
  };
  addCap(rings[0], sorted[0].z, false);
  addCap(rings[rings.length - 1], sorted[sorted.length - 1].z, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignPlanarUvs(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function tabletopLayers(
  length: number,
  width: number,
  thickness: number,
  cornerRadius: number,
  bottomRadius: number,
  topRadius: number,
  segments: number,
) {
  const layers: LoftLayer[] = [];
  const add = (z: number, inset: number) => {
    const layer = {
      z,
      width: length - inset * 2,
      depth: width - inset * 2,
      radius: Math.max(cornerRadius - inset, EPSILON),
    };
    const previous = layers[layers.length - 1];
    if (
      previous &&
      Math.abs(previous.z - layer.z) < EPSILON &&
      Math.abs(previous.width - layer.width) < EPSILON
    ) {
      return;
    }
    layers.push(layer);
  };

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      bottomRadius - bottomRadius * Math.cos(angle),
      bottomRadius - bottomRadius * Math.sin(angle),
    );
  }
  add(thickness - topRadius, 0);
  for (let index = 1; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      thickness - topRadius + topRadius * Math.sin(angle),
      topRadius - topRadius * Math.cos(angle),
    );
  }
  return layers;
}

function legLayers(
  size: number,
  height: number,
  cornerRadii: CornerRadii,
  bottomRoundover: number,
  topRoundover: number,
  grooveEnabled: boolean,
  grooveHeight: number,
  grooveDepth: number,
  segments: number,
) {
  const layers: LoftLayer[] = [];
  const add = (z: number, inset: number) => {
    const safeInset = Math.min(inset, size / 2 - EPSILON);
    const layer = {
      z,
      width: size - safeInset * 2,
      depth: size - safeInset * 2,
      radius: cornerRadii.map((cornerRadius) =>
        Math.max(cornerRadius - safeInset, EPSILON),
      ) as CornerRadii,
    };
    const previous = layers[layers.length - 1];
    if (
      previous &&
      Math.abs(previous.z - layer.z) < EPSILON &&
      Math.abs(previous.width - layer.width) < EPSILON
    ) {
      return;
    }
    layers.push(layer);
  };

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      bottomRoundover - bottomRoundover * Math.cos(angle),
      bottomRoundover - bottomRoundover * Math.sin(angle),
    );
  }

  if (!grooveEnabled) {
    add(height - topRoundover, 0);
    for (let index = 1; index <= segments; index += 1) {
      const angle = (index / segments) * (Math.PI / 2);
      add(
        height - topRoundover + topRoundover * Math.sin(angle),
        topRoundover - topRoundover * Math.cos(angle),
      );
    }
    return layers;
  }

  const grooveBottom = height - grooveHeight;
  const shoulderBottom = grooveBottom - topRoundover;
  add(shoulderBottom, 0);
  for (let index = 1; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      shoulderBottom + topRoundover * Math.sin(angle),
      grooveDepth * (1 - Math.cos(angle)),
    );
  }
  add(height, grooveDepth);
  return layers;
}

function scaled(params: ModelParams, key: string) {
  return getParam(params, key) / getParam(params, "mockScale");
}

function grainTextureSize(params: ModelParams) {
  return 800 / getParam(params, "mockScale");
}

function createTabletopGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const thickness = scaled(params, "topThickness");
  const cornerRadius = scaled(params, "tabletopCornerRadius");
  const topRadius = Math.min(scaled(params, "topRoundoverRadius"), thickness / 2);
  const bottomRadius = Math.min(
    scaled(params, "bottomRoundoverRadius"),
    thickness / 2,
  );
  const legHeight = scaled(params, "overallHeight") - thickness;
  const geometry = createRoundedLoft(
    tabletopLayers(
      length,
      width,
      thickness,
      cornerRadius,
      bottomRadius,
      topRadius,
      model.geometry.edgeProfileSegments,
    ),
    model.geometry.cornerSegments,
  );
  geometry.translate(0, 0, legHeight);
  assignDirectionalWoodUvs(
    geometry,
    new THREE.Vector3(1, 0, 0),
    grainTextureSize(params),
    "tabletop",
  );
  return geometry;
}

function createLegGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
  x: number,
  y: number,
  bottomZ = 0,
) {
  const size = scaled(params, "legSize");
  const sharedRadius = Math.min(scaled(params, "legCornerRadius"), size / 2);
  const outerRadius = Math.min(
    scaled(params, "legOuterCornerRadius"),
    size / 2,
  );
  const outerCornerIndex =
    x >= 0 ? (y >= 0 ? 0 : 3) : y >= 0 ? 1 : 2;
  const cornerRadii: CornerRadii = [
    sharedRadius,
    sharedRadius,
    sharedRadius,
    sharedRadius,
  ];
  cornerRadii[outerCornerIndex] = outerRadius;
  const thickness = scaled(params, "topThickness");
  const height = scaled(params, "overallHeight") - thickness - bottomZ;
  const grooveEnabled = getParam(params, "legGrooveEnabled") >= 0.5;
  const grooveHeight = Math.min(
    scaled(params, "legGrooveHeight"),
    height / 3,
  );
  const grooveDepth = Math.min(
    scaled(params, "legGrooveDepth"),
    size / 3,
    Math.max(Math.min(...cornerRadii) - EPSILON, EPSILON),
  );
  const bottomRoundover = Math.min(
    scaled(params, "legBottomRoundoverRadius"),
    size / 2,
    height / 2,
  );
  const topRoundover = Math.min(
    scaled(params, "legTopRoundoverRadius"),
    size / 2,
    grooveEnabled
      ? Math.max(height - grooveHeight - bottomRoundover, EPSILON)
      : height / 2,
  );
  const geometry = createRoundedLoft(
    legLayers(
      size,
      height,
      cornerRadii,
      bottomRoundover,
      topRoundover,
      grooveEnabled,
      grooveHeight,
      grooveDepth,
      model.geometry.edgeProfileSegments,
    ),
    model.geometry.cornerSegments,
  );
  geometry.translate(x, y, bottomZ);
  assignDirectionalWoodUvs(
    geometry,
    new THREE.Vector3(0, 0, 1),
    grainTextureSize(params),
  );
  return geometry;
}

const PLATE_TABLE_LEVELING_EXTENSION_KEYS = [
  "levelingFootExtensionLeftFront",
  "levelingFootExtensionLeftRear",
  "levelingFootExtensionRightFront",
  "levelingFootExtensionRightRear",
] as const;

type PlateTableLevelingFeetSpec = {
  enabled: boolean;
  padDiameter: number;
  padThickness: number;
  rodDiameter: number;
  rodLength: number;
  extensions: [number, number, number, number];
  exposedRodLengths: [number, number, number, number];
  embeddedRodLengths: [number, number, number, number];
  minimumEmbedment: number;
};

function getPlateTableLevelingFeetSpec(
  params: ModelParams,
  applyMockScale: boolean,
): PlateTableLevelingFeetSpec {
  const divisor = applyMockScale ? getParam(params, "mockScale") : 1;
  const enabled = getParam(params, "levelingFeetEnabled") >= 0.5;
  const padDiameter = getParam(params, "levelingFootPadDiameter") / divisor;
  const padThickness = getParam(params, "levelingFootPadThickness") / divisor;
  const rodDiameter = getParam(params, "levelingFootRodDiameter") / divisor;
  const rodLength = getParam(params, "levelingFootRodLength") / divisor;
  const extensions = PLATE_TABLE_LEVELING_EXTENSION_KEYS.map((key) =>
    enabled ? getParam(params, key) / divisor : 0,
  ) as PlateTableLevelingFeetSpec["extensions"];
  const exposedRodLengths = extensions.map((extension) =>
    Math.max(0, extension - padThickness),
  ) as PlateTableLevelingFeetSpec["exposedRodLengths"];
  const embeddedRodLengths = exposedRodLengths.map(
    (exposed) => rodLength - exposed,
  ) as PlateTableLevelingFeetSpec["embeddedRodLengths"];
  const minimumEmbedment = Math.max(rodDiameter * 2, 25.4 / divisor);
  return {
    enabled,
    padDiameter,
    padThickness,
    rodDiameter,
    rodLength,
    extensions,
    exposedRodLengths,
    embeddedRodLengths,
    minimumEmbedment,
  };
}

function assertPlateTableLevelingFeet(
  feet: PlateTableLevelingFeetSpec,
  legSize: number,
  bottomRoundover: number,
) {
  if (!feet.enabled) return;
  const flatBottomWidth = legSize - 2 * bottomRoundover;
  if (feet.padDiameter > legSize + EPSILON) {
    throw new Error("Leveling-foot pads must fit beneath the square posts");
  }
  if (feet.rodDiameter > flatBottomWidth + EPSILON) {
    throw new Error(
      "Leveling-foot rods must enter the flat solid face inside the bottom roundover",
    );
  }
  feet.extensions.forEach((extension, index) => {
    if (extension < feet.padThickness - EPSILON) {
      throw new Error(
        `${PLATE_TABLE_LEVELING_EXTENSION_KEYS[index]} must include the full pad thickness`,
      );
    }
    if (feet.embeddedRodLengths[index] < feet.minimumEmbedment - EPSILON) {
      throw new Error(
        `${PLATE_TABLE_LEVELING_EXTENSION_KEYS[index]} must retain positive threaded-rod embedment`,
      );
    }
  });
}

function getLegCenters(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const size = scaled(params, "legSize");
  const inset = scaled(params, "legEdgeInset");
  const x = length / 2 - size / 2 - inset;
  const y = width / 2 - size / 2 - inset;
  return [
    new THREE.Vector2(-x, -y),
    new THREE.Vector2(-x, y),
    new THREE.Vector2(x, -y),
    new THREE.Vector2(x, y),
  ];
}

export function createDiningTableWoodGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  if (model.id === "whisperer") {
    return createWhispererTableWoodGeometry(params);
  }
  if (model.id === "vinny-table") {
    return createVinnyTableWoodGeometry(params);
  }
  const levelingFeet = getPlateTableLevelingFeetSpec(params, true);
  assertPlateTableLevelingFeet(
    levelingFeet,
    scaled(params, "legSize"),
    scaled(params, "legBottomRoundoverRadius"),
  );
  const geometries = [
    createTabletopGeometry(params, model),
    ...getLegCenters(params).map((center, index) =>
      createLegGeometry(
        params,
        model,
        center.x,
        center.y,
        levelingFeet.extensions[index],
      ),
    ),
  ];
  const legNames = [
    "leg-left-front",
    "leg-left-rear",
    "leg-right-front",
    "leg-right-rear",
  ];
  geometries.slice(1).forEach((geometry, index) => {
    const direction = geometry.userData.woodGrainDirection as [
      number,
      number,
      number,
    ];
    geometry.userData.woodGrainParts = [
      {
        direction,
        name: legNames[index],
        vertexCount: geometry.getAttribute("position").count,
        vertexStart: 0,
      },
    ];
  });
  const merged = mergeGeometries(geometries, false);
  const woodGrainParts = collectWoodGrainParts(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge dining-table wood geometry");
  merged.userData.woodGrainParts = woodGrainParts;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createDiningTableHardwareGeometries(
  params: ModelParams,
) {
  if (isVinnyParams(params)) {
    return {
      plates: [],
      channels: [],
      feet: createVinnyTableHardwareGeometries(params).feet,
    };
  }
  if (isWhispererParams(params)) {
    return {
      plates: [],
      channels: [],
      feet: createWhispererTableHardwareGeometries(params).feet,
    };
  }
  const scale = getParam(params, "mockScale");
  const length = getParam(params, "tableLength") / scale;
  const width = getParam(params, "tableWidth") / scale;
  const legInset = getParam(params, "legEdgeInset") / scale;
  const legHeight =
    (getParam(params, "overallHeight") - getParam(params, "topThickness")) /
    scale;
  const plateSize = getParam(params, "plateSize") / scale;
  const legSize = getParam(params, "legSize") / scale;
  const plateEdgeInset = getParam(params, "plateEdgeInset") / scale;
  const exposedPlateWidth = Math.max(
    plateSize + plateEdgeInset - legSize,
    0.01,
  );
  const coveredLegSpan = Math.max(legSize - plateEdgeInset, 0.01);
  const plateThickness = getParam(params, "plateThickness") / scale;
  const plates = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([xSign, ySign]) => {
    const inwardStrip = new THREE.BoxGeometry(
      exposedPlateWidth,
      plateSize,
      plateThickness,
    );
    inwardStrip.translate(
      xSign *
        (length / 2 - legInset - legSize - exposedPlateWidth / 2),
      ySign *
        (width / 2 - legInset - plateEdgeInset - plateSize / 2),
      legHeight + plateThickness / 2,
    );
    const crossStrip = new THREE.BoxGeometry(
      coveredLegSpan,
      exposedPlateWidth,
      plateThickness,
    );
    crossStrip.translate(
      xSign *
        (length / 2 - legInset - (legSize + plateEdgeInset) / 2),
      ySign *
        (width / 2 - legInset - legSize - exposedPlateWidth / 2),
      legHeight + plateThickness / 2,
    );
    const geometry = mergeGeometries([inwardStrip, crossStrip], false);
    inwardStrip.dispose();
    crossStrip.dispose();
    if (!geometry) throw new Error("Unable to build dining-table plate geometry");
    return geometry;
  });

  const channelLength = getParam(params, "channelLength") / scale;
  const channelWidth = getParam(params, "channelWidth") / scale;
  const channelDepth = getParam(params, "channelDepth") / scale;
  const channels = [1, 2, 3].map((index) => {
    const position = getParam(params, `channelPosition${index}`) / scale;
    const geometry = new THREE.BoxGeometry(
      channelWidth,
      channelLength,
      channelDepth,
    );
    geometry.translate(
      position - length / 2,
      0,
      legHeight + channelDepth / 2,
    );
    return geometry;
  });
  const levelingFeet = getPlateTableLevelingFeetSpec(params, true);
  assertPlateTableLevelingFeet(
    levelingFeet,
    legSize,
    scaled(params, "legBottomRoundoverRadius"),
  );
  const feet = levelingFeet.enabled
    ? getLegCenters(params).map((center) => {
        const pad = new THREE.CylinderGeometry(
          levelingFeet.padDiameter / 2,
          levelingFeet.padDiameter / 2,
          levelingFeet.padThickness,
          32,
        );
        pad.rotateX(Math.PI / 2);
        pad.translate(
          center.x,
          center.y,
          levelingFeet.padThickness / 2,
        );
        const rod = new THREE.CylinderGeometry(
          levelingFeet.rodDiameter / 2,
          levelingFeet.rodDiameter / 2,
          levelingFeet.rodLength,
          24,
        );
        rod.rotateX(Math.PI / 2);
        rod.translate(
          center.x,
          center.y,
          levelingFeet.padThickness + levelingFeet.rodLength / 2,
        );
        const geometry = mergeGeometries([pad, rod], false);
        pad.dispose();
        rod.dispose();
        if (!geometry) {
          throw new Error("Unable to merge Plate Table leveling-foot geometry");
        }
        return geometry;
      })
    : [];
  return { plates, channels, feet };
}

export function getDiningTableDimensions(params: ModelParams): ModelDimensions {
  const scale = getParam(params, "mockScale");
  return {
    length: getParam(params, "tableLength") / scale,
    width: getParam(params, "tableWidth") / scale,
    height: getParam(params, "overallHeight") / scale,
  };
}

export function updateDiningTableGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const dimensions = getDiningTableDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

const PLATE_TABLE_STRUCTURAL_REFERENCE = {
  height: 30 * 25.4,
  legSize: 4 * 25.4,
  plateSize: 6 * 25.4,
  plateThickness: 0.25 * 25.4,
  plateProjection: 1 * 25.4,
} as const;

const PLATE_TABLE_STRUCTURAL_MATERIAL = {
  assumedChannelWallThickness: 0.125 * 25.4,
  steelModulusGPa: 200,
  whiteOakModulusGPa: 12.27,
} as const;

const PLATE_TABLE_STRUCTURAL_WEIGHTS: Record<
  HoverDiningTableStructuralMetric["key"],
  number
> = {
  "longitudinal-racking": 0.24,
  "end-box-racking": 0.24,
  torsion: 0.18,
  tipping: 0.12,
  "floor-rocking": 0.1,
  "member-stiffness": 0.12,
};

function plateTableStructuralScore(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function plateTableStructuralGrade(
  score: number,
): HoverDiningTableStructuralGrade {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function plateTableStructuralMetric(
  key: HoverDiningTableStructuralMetric["key"],
  label: string,
  rawScore: number,
  detail: string,
  calculation: Pick<
    HoverDiningTableStructuralMetric["calculation"],
    "rationale" | "formula" | "inputs"
  >,
): HoverDiningTableStructuralMetric {
  const score = plateTableStructuralScore(rawScore);
  const weight = PLATE_TABLE_STRUCTURAL_WEIGHTS[key];
  return {
    key,
    label,
    score,
    grade: plateTableStructuralGrade(score),
    detail,
    calculation: {
      ...calculation,
      rawScore: Number(rawScore.toFixed(1)),
      weight,
      scoringNote: `Raw result ${rawScore.toFixed(1)} is clamped to 0–100, then contributes ${(weight * 100).toFixed(0)}% of the overall score (${(score * weight).toFixed(1)} weighted points). Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50.`,
    },
  };
}

function getPlateTableChannelStiffness(params: ModelParams) {
  const topThickness = getParam(params, "topThickness");
  const tableLength = getParam(params, "tableLength");
  const tableWidth = getParam(params, "tableWidth");
  const channelWidth = getParam(params, "channelWidth");
  const channelDepth = getParam(params, "channelDepth");
  const channelLength = getParam(params, "channelLength");
  const wallThickness = Math.min(
    PLATE_TABLE_STRUCTURAL_MATERIAL.assumedChannelWallThickness,
    channelDepth / 3,
    channelWidth / 4,
  );
  const modularRatio =
    PLATE_TABLE_STRUCTURAL_MATERIAL.steelModulusGPa /
    PLATE_TABLE_STRUCTURAL_MATERIAL.whiteOakModulusGPa;
  const remainingOakHeight = Math.max(EPSILON, topThickness - channelDepth);
  const flangeHeight = Math.max(EPSILON, channelDepth - wallThickness);
  const transformedSections = [
    {
      area: channelWidth * remainingOakHeight,
      centroid: channelDepth + remainingOakHeight / 2,
      localSecondMoment:
        (channelWidth * remainingOakHeight ** 3) / 12,
    },
    {
      area: modularRatio * channelWidth * wallThickness,
      centroid: wallThickness / 2,
      localSecondMoment:
        (modularRatio * channelWidth * wallThickness ** 3) / 12,
    },
    {
      area: modularRatio * 2 * wallThickness * flangeHeight,
      centroid: wallThickness + flangeHeight / 2,
      localSecondMoment:
        (modularRatio * 2 * wallThickness * flangeHeight ** 3) / 12,
    },
  ];
  const transformedArea = transformedSections.reduce(
    (total, section) => total + section.area,
    0,
  );
  const neutralAxis =
    transformedSections.reduce(
      (total, section) => total + section.area * section.centroid,
      0,
    ) / transformedArea;
  const transformedSecondMoment = transformedSections.reduce(
    (total, section) =>
      total +
      section.localSecondMoment +
      section.area * (section.centroid - neutralAxis) ** 2,
    0,
  );
  const bareOakSecondMoment =
    (channelWidth * topThickness ** 3) / 12;
  const transformedSectionRatio =
    transformedSecondMoment / bareOakSecondMoment;
  const channelStripFraction = Math.min(
    1,
    (3 * channelWidth) / tableLength,
  );
  const channelLengthCoverage = Math.min(1, channelLength / tableWidth);
  const topPlaneStiffnessFactor =
    1 +
    channelStripFraction *
      channelLengthCoverage *
      Math.max(0, transformedSectionRatio - 1);
  const channelCenterSpread =
    getParam(params, "channelPosition3") -
    getParam(params, "channelPosition1");
  const availableChannelCenterSpread = Math.max(
    channelWidth,
    tableLength - 2 * channelWidth,
  );
  const channelDistributionFactor = Math.max(
    0,
    Math.min(1, channelCenterSpread / availableChannelCenterSpread),
  );
  const channelTorsionFactor =
    1 +
    (topPlaneStiffnessFactor - 1) *
      (0.5 + 0.5 * channelDistributionFactor);
  const effectiveTopThickness =
    topThickness * Math.cbrt(topPlaneStiffnessFactor);

  return {
    assumedWallThickness: wallThickness,
    modularRatio,
    transformedSectionRatio,
    channelStripFraction,
    channelLengthCoverage,
    channelDistributionFactor,
    channelTorsionFactor,
    topPlaneStiffnessFactor,
    effectiveTopThickness,
    widthSlenderness: tableWidth / effectiveTopThickness,
    lengthSlenderness: tableLength / effectiveTopThickness,
  };
}

function evaluatePlateTableStructure(
  params: ModelParams,
): Omit<HoverDiningTableStructuralAssessment, "heightSensitivity"> {
  const height = getParam(params, "overallHeight");
  const topThickness = getParam(params, "topThickness");
  const legHeight = height - topThickness;
  const legSize = getParam(params, "legSize");
  const plateSize = getParam(params, "plateSize");
  const plateThickness = getParam(params, "plateThickness");
  const plateEdgeInset = getParam(params, "plateEdgeInset");
  const legEdgeInset = getParam(params, "legEdgeInset");
  const tableLength = getParam(params, "tableLength");
  const tableWidth = getParam(params, "tableWidth");
  const bottomRoundover = getParam(params, "legBottomRoundoverRadius");
  const levelingFeet = getPlateTableLevelingFeetSpec(params, false);
  assertPlateTableLevelingFeet(levelingFeet, legSize, bottomRoundover);
  const heightFactor = PLATE_TABLE_STRUCTURAL_REFERENCE.height / height;
  const postBendingFactor = Math.min(
    1.8,
    (legSize / PLATE_TABLE_STRUCTURAL_REFERENCE.legSize) ** 2,
  );
  const plateProjection = Math.max(0, (plateSize - legSize) / 2);
  const plateAreaFactor = Math.min(
    1.8,
    (plateSize / PLATE_TABLE_STRUCTURAL_REFERENCE.plateSize) ** 2,
  );
  const plateThicknessFactor = Math.min(
    1.8,
    Math.sqrt(
      plateThickness / PLATE_TABLE_STRUCTURAL_REFERENCE.plateThickness,
    ),
  );
  const plateProjectionFactor = Math.min(
    1.5,
    plateProjection / PLATE_TABLE_STRUCTURAL_REFERENCE.plateProjection,
  );
  const setbackFactor = Math.max(
    0.65,
    Math.min(1, 1 - plateEdgeInset / Math.max(plateSize, EPSILON)),
  );
  const plateEngagementFactor =
    Math.sqrt(plateAreaFactor * plateThicknessFactor) *
    plateProjectionFactor *
    setbackFactor;
  const channel = getPlateTableChannelStiffness(params);

  const longitudinalRacking =
    24 +
    28 * postBendingFactor * heightFactor ** 1.7 +
    24 * plateEngagementFactor * heightFactor ** 1.2;
  const plateJointLeverage =
    28 +
    48 * plateEngagementFactor * heightFactor ** 1.4;
  const channelContribution = Math.min(
    1.5,
    Math.max(0, (channel.channelTorsionFactor - 1) / 0.15),
  );
  const torsion =
    24 +
    34 * plateEngagementFactor * heightFactor +
    18 * channelContribution;

  const contactSize = levelingFeet.enabled
    ? levelingFeet.padDiameter
    : legSize;
  const footprintLength =
    tableLength - 2 * legEdgeInset - legSize + contactSize;
  const footprintWidth =
    tableWidth - 2 * legEdgeInset - legSize + contactSize;
  const controllingTippingRatio =
    Math.min(footprintLength, footprintWidth) / (2 * height);
  const tipping =
    20 + 80 * Math.min(1, controllingTippingRatio / 0.65);

  const flatFootFraction = Math.max(
    0,
    Math.min(1, (legSize - 2 * bottomRoundover) / legSize),
  );
  const minimumEmbeddedRod = Math.min(...levelingFeet.embeddedRodLengths);
  const embedmentFactor = levelingFeet.enabled
    ? Math.max(
        0,
        Math.min(1, minimumEmbeddedRod / (4 * levelingFeet.rodDiameter)),
      )
    : 0;
  const floorRocking = levelingFeet.enabled
    ? 96 + 2 * embedmentFactor
    : 52 + 20 * flatFootFraction;

  const longestWoodPost = levelingFeet.enabled
    ? legHeight - Math.min(...levelingFeet.extensions)
    : legHeight;
  const legSlenderness = longestWoodPost / legSize;
  const memberStiffness =
    100 -
    Math.max(0, legSlenderness - 7.5) * 4 -
    Math.max(0, channel.widthSlenderness - 24) * 1.2 -
    Math.max(0, channel.lengthSlenderness - 48) * 0.45;

  const metrics = [
    plateTableStructuralMetric(
      "longitudinal-racking",
      "Apronless post racking",
      longitudinalRacking,
      `post slenderness ${legSlenderness.toFixed(1)}:1 · ${formatLength(plateProjection, "in")} plate projection`,
      {
        rationale:
          "With no apron or stretcher, lateral sway is screened from the fourth-power post section (expressed here as its square-root factor), table height, and the geometry available for each recessed plate to engage the tabletop beyond the post. Actual screw slip and wood crushing are deliberately excluded.",
        formula:
          "24 + 28 × postBendingFactor × heightFactor^1.7 + 24 × plateEngagementFactor × heightFactor^1.2",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "legSize", label: "Square post size", value: legSize, format: "length" },
          { key: "plateSize", label: "Plate size", value: plateSize, format: "length" },
          { key: "plateThickness", label: "Plate thickness", value: plateThickness, format: "length" },
          { key: "postBendingFactor", label: "Derived post bending factor", value: postBendingFactor, format: "number", precision: 3 },
          { key: "plateEngagementFactor", label: "Derived plate engagement factor", value: plateEngagementFactor, format: "number", precision: 3 },
        ],
      },
    ),
    plateTableStructuralMetric(
      "end-box-racking",
      "Plate-joint leverage",
      plateJointLeverage,
      `${formatLength(plateSize, "in")} plate · ${formatLength(plateThickness, "in")} thick · geometry proxy only`,
      {
        rationale:
          "The plate score rewards plan area, thickness, and projection beyond the post while penalizing excessive edge setback. It is only a geometry proxy: screw pattern, embedment, slot direction, plate bending, post mortise fit, and repeated-load loosening require a physical corner test.",
        formula:
          "28 + 48 × sqrt(plateAreaFactor × plateThicknessFactor) × plateProjectionFactor × setbackFactor × heightFactor^1.4",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "plateSize", label: "Plate size", value: plateSize, format: "length" },
          { key: "plateThickness", label: "Plate thickness", value: plateThickness, format: "length" },
          { key: "plateEdgeInset", label: "Plate edge setback", value: plateEdgeInset, format: "length" },
          { key: "plateProjection", label: "Plate projection beyond post", value: plateProjection, format: "length" },
          { key: "plateEngagementFactor", label: "Derived plate engagement factor", value: plateEngagementFactor, format: "number", precision: 3 },
        ],
      },
    ),
    plateTableStructuralMetric(
      "torsion",
      "Tabletop torsional rigidity",
      torsion,
      `three channels · ${channel.channelTorsionFactor.toFixed(3)}× top-plane factor`,
      {
        rationale:
          "Table twisting is screened from the four plate connections plus the transformed oak/steel contribution of the three widthwise channels. Channel credit applies only to the tabletop plane; it does not brace the posts or prove composite action at slotted fasteners.",
        formula:
          "24 + 34 × plateEngagementFactor × heightFactor + 18 × clamp((channelTorsionFactor − 1) ÷ 0.15, 0, 1.5)",
        inputs: [
          { key: "plateEngagementFactor", label: "Derived plate engagement factor", value: plateEngagementFactor, format: "number", precision: 3 },
          { key: "channelWidth", label: "Channel visible width", value: getParam(params, "channelWidth"), format: "length" },
          { key: "channelDepth", label: "Channel depth", value: getParam(params, "channelDepth"), format: "length" },
          { key: "channelLength", label: "Channel length", value: getParam(params, "channelLength"), format: "length" },
          { key: "assumedChannelWallThickness", label: "Fixed channel wall assumption", value: channel.assumedWallThickness, format: "length" },
          { key: "channelDistributionFactor", label: "Channel distribution", value: channel.channelDistributionFactor, format: "number", precision: 3 },
          { key: "channelTorsionFactor", label: "Derived channel torsion factor", value: channel.channelTorsionFactor, format: "number", precision: 3, suffix: "×" },
        ],
      },
    ),
    plateTableStructuralMetric(
      "tipping",
      "Tipping margin",
      tipping,
      `controlling half-footprint / height ${controllingTippingRatio.toFixed(2)}`,
      {
        rationale:
          "The smaller tabletop-direction support footprint controls how far the center of mass can move before passing the leg-contact polygon. This is a geometry margin, not a prediction for a person sitting or climbing on the tabletop.",
        formula:
          "20 + 80 × min(1, min(contactWidth ÷ 2 ÷ height, contactLength ÷ 2 ÷ height) ÷ 0.65)",
        inputs: [
          { key: "overallHeight", label: "Overall height", value: height, format: "length" },
          { key: "tableLength", label: "Table length", value: tableLength, format: "length" },
          { key: "tableWidth", label: "Table width", value: tableWidth, format: "length" },
          { key: "legEdgeInset", label: "Leg edge inset", value: legEdgeInset, format: "length" },
          { key: "footprintLength", label: "Contact footprint length", value: footprintLength, format: "length" },
          { key: "footprintWidth", label: "Contact footprint width", value: footprintWidth, format: "length" },
        ],
      },
    ),
    plateTableStructuralMetric(
      "floor-rocking",
      "Floor rocking tolerance",
      floorRocking,
      levelingFeet.enabled
        ? `four independent contacts · ${formatLength(Math.min(...levelingFeet.extensions), "in")}–${formatLength(Math.max(...levelingFeet.extensions), "in")} installed range`
        : "four fixed wood contacts · no independent leveling",
      {
        rationale: levelingFeet.enabled
          ? "Four threaded feet provide independent contact adjustment while the tabletop stays at its specified height. The score also checks the shortest remaining threaded embedment; it does not certify the insert, threads, or floor bearing capacity."
          : "Four fixed legs are statically over-constrained on an uneven floor. The flat portion left by each bottom round-over earns limited contact credit, but cannot substitute for adjustable feet or field shimming.",
        formula: levelingFeet.enabled
          ? "96 + 2 × clamp(minimumEmbeddedRod ÷ (4 × rodDiameter), 0, 1)"
          : "52 + 20 × clamp((legSize − 2 × bottomRoundover) ÷ legSize, 0, 1)",
        inputs: [
          { key: "levelingFeetEnabled", label: "Independent leveling enabled", value: levelingFeet.enabled ? 1 : 0, format: "number", precision: 0 },
          { key: "legSize", label: "Square post size", value: legSize, format: "length" },
          { key: "legBottomRoundoverRadius", label: "Bottom round-over", value: bottomRoundover, format: "length" },
          { key: "flatFootFraction", label: "Derived flat-foot fraction", value: flatFootFraction, format: "number", precision: 3 },
          ...(levelingFeet.enabled
            ? [
                ...PLATE_TABLE_LEVELING_EXTENSION_KEYS.map((key, index) => ({ key, label: `Installed extension ${index + 1}`, value: levelingFeet.extensions[index], format: "length" as const })),
                { key: "levelingFootPadDiameter", label: "Pad diameter", value: levelingFeet.padDiameter, format: "length" as const },
                { key: "levelingFootRodDiameter", label: "Rod diameter", value: levelingFeet.rodDiameter, format: "length" as const },
                { key: "minimumEmbeddedRod", label: "Minimum embedded rod", value: minimumEmbeddedRod, format: "length" as const },
              ]
            : []),
        ],
      },
    ),
    plateTableStructuralMetric(
      "member-stiffness",
      "Member stiffness",
      memberStiffness,
      `post ${legSlenderness.toFixed(1)}:1 · reinforced top ${channel.widthSlenderness.toFixed(1)}:1 across width`,
      {
        rationale:
          "This relative screen penalizes posts above 7.5:1 slenderness and the channel-reinforced top above reference width and length slenderness limits. The steel contribution uses a fixed 1/8 in wall assumption because wall thickness is not currently an editable model parameter.",
        formula:
          "100 − max(0, legSlenderness − 7.5) × 4 − max(0, widthSlenderness − 24) × 1.2 − max(0, lengthSlenderness − 48) × 0.45",
        inputs: [
          { key: "legHeight", label: "Controlling wood-post height", value: longestWoodPost, format: "length" },
          { key: "legSize", label: "Square post size", value: legSize, format: "length" },
          { key: "legSlenderness", label: "Derived post slenderness", value: legSlenderness, format: "number", precision: 2, suffix: ":1" },
          { key: "topThickness", label: "Tabletop thickness", value: topThickness, format: "length" },
          { key: "topPlaneStiffnessFactor", label: "Derived tabletop stiffness factor", value: channel.topPlaneStiffnessFactor, format: "number", precision: 3, suffix: "×" },
          { key: "effectiveTopThickness", label: "Equivalent tabletop thickness", value: channel.effectiveTopThickness, format: "length" },
          { key: "widthSlenderness", label: "Reinforced top width slenderness", value: channel.widthSlenderness, format: "number", precision: 2, suffix: ":1" },
          { key: "lengthSlenderness", label: "Reinforced top length slenderness", value: channel.lengthSlenderness, format: "number", precision: 2, suffix: ":1" },
        ],
      },
    ),
  ];
  const overallScore = plateTableStructuralScore(
    metrics.reduce(
      (total, metric) =>
        total + metric.score * PLATE_TABLE_STRUCTURAL_WEIGHTS[metric.key],
      0,
    ),
  );
  return {
    overallScore,
    overallGrade: plateTableStructuralGrade(overallScore),
    overallCalculation: {
      rationale:
        "The Plate Table composite emphasizes the two apronless plate/post connection screens, followed by tabletop torsion. Tipping, floor contact, and member slenderness remain visible contributors without disguising the untested joint behavior.",
      formula: metrics
        .map(
          (metric) =>
            `${(PLATE_TABLE_STRUCTURAL_WEIGHTS[metric.key] * 100).toFixed(0)}% × ${metric.label}`,
        )
        .join(" + "),
      scoringNote: `The weighted sum is ${overallScore.toFixed(1)}. Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50. This remains a geometry-only comparison, not a load or joint certification.`,
    },
    metrics,
    basis: "geometry-only screening",
  };
}

export function getDiningTableStructuralAssessment(
  params: ModelParams,
): HoverDiningTableStructuralAssessment {
  if (isVinnyParams(params)) {
    return getVinnyTableStructuralAssessment(params);
  }
  if (isWhispererParams(params)) {
    return getWhispererTableStructuralAssessment(params);
  }
  const current = evaluatePlateTableStructure(params);
  const height = getParam(params, "overallHeight");
  const stepMm = 25.4;
  const assessHeight = (heightMm: number) => {
    try {
      const score = evaluatePlateTableStructure({
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

export function getDiningTableParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  if (model.id === "whisperer") {
    return getWhispererTableParameterLimits(model, params, key);
  }
  if (model.id === "vinny-table") {
    return getVinnyTableParameterLimits(model, params, key);
  }
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const thickness = getParam(params, "topThickness");
  const legSize = getParam(params, "legSize");
  const feetEnabled = getParam(params, "levelingFeetEnabled") >= 0.5;
  const padThickness = getParam(params, "levelingFootPadThickness");
  const rodDiameter = getParam(params, "levelingFootRodDiameter");
  const rodLength = getParam(params, "levelingFootRodLength");
  const extensions = PLATE_TABLE_LEVELING_EXTENSION_KEYS.map((extensionKey) =>
    getParam(params, extensionKey),
  );
  const minimumEmbedment = Math.max(rodDiameter * 2, 25.4);

  if (key === "topThickness") {
    limits.max = Math.min(limits.max, getParam(params, "overallHeight") / 4);
    limits.min = Math.max(
      limits.min,
      getParam(params, "topRoundoverRadius") * 2,
      getParam(params, "bottomRoundoverRadius") * 2,
      getParam(params, "channelDepth"),
      getParam(params, "plateThickness"),
    );
  } else if (key === "overallHeight") {
    limits.min = Math.max(
      limits.min,
      thickness + legSize * 2 + (feetEnabled ? Math.max(...extensions) : 0),
    );
  } else if (key === "tabletopCornerRadius") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 2);
  } else if (key === "topRoundoverRadius" || key === "bottomRoundoverRadius") {
    limits.max = Math.min(limits.max, thickness / 2);
  } else if (key === "legSize") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 3);
    limits.min = Math.max(
      limits.min,
      getParam(params, "legCornerRadius") * 2,
      getParam(params, "legOuterCornerRadius") * 2,
      ...(feetEnabled
        ? [rodDiameter + 2 * getParam(params, "legBottomRoundoverRadius")]
        : []),
    );
  } else if (
    key === "legCornerRadius" ||
    key === "legOuterCornerRadius"
  ) {
    limits.max = Math.min(limits.max, legSize / 2);
  } else if (
    key === "legTopRoundoverRadius" ||
    key === "legBottomRoundoverRadius"
  ) {
    const legHeight = getParam(params, "overallHeight") - thickness;
    const reservedHeight =
      key === "legTopRoundoverRadius" &&
      getParam(params, "legGrooveEnabled") >= 0.5
        ? getParam(params, "legGrooveHeight") +
          getParam(params, "legBottomRoundoverRadius")
        : 0;
    limits.max = Math.min(
      limits.max,
      legSize / 2,
      key === "legBottomRoundoverRadius" ? legHeight / 2 : legHeight - reservedHeight,
      ...(key === "legBottomRoundoverRadius" && feetEnabled
        ? [(legSize - rodDiameter) / 2]
        : []),
    );
  } else if (key === "legGrooveHeight") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "overallHeight") -
        thickness -
        getParam(params, "legTopRoundoverRadius") -
        getParam(params, "legBottomRoundoverRadius"),
    );
  } else if (key === "legGrooveDepth") {
    limits.max = Math.min(
      limits.max,
      legSize / 3,
      Math.min(
        getParam(params, "legCornerRadius"),
        getParam(params, "legOuterCornerRadius"),
      ) - limits.step,
    );
  } else if (key === "plateSize") {
    limits.min = Math.max(limits.min, legSize);
    limits.max = Math.min(limits.max, Math.min(length, width) / 2);
  } else if (key === "plateEdgeInset") {
    limits.max = Math.min(limits.max, legSize - limits.step);
  } else if (key === "plateThickness" || key === "channelDepth") {
    limits.max = Math.min(limits.max, thickness);
  } else if (key === "levelingFootPadDiameter") {
    limits.max = Math.min(limits.max, legSize);
    limits.min = Math.max(limits.min, rodDiameter);
  } else if (key === "levelingFootPadThickness") {
    limits.max = Math.min(limits.max, ...extensions);
  } else if (key === "levelingFootRodDiameter") {
    limits.max = Math.min(
      limits.max,
      legSize - 2 * getParam(params, "legBottomRoundoverRadius"),
      getParam(params, "levelingFootPadDiameter"),
    );
  } else if (key === "levelingFootRodLength") {
    limits.min = Math.max(
      limits.min,
      Math.max(...extensions) - padThickness + minimumEmbedment,
    );
  } else if (
    PLATE_TABLE_LEVELING_EXTENSION_KEYS.includes(
      key as (typeof PLATE_TABLE_LEVELING_EXTENSION_KEYS)[number],
    )
  ) {
    limits.min = Math.max(limits.min, padThickness);
    limits.max = Math.min(
      limits.max,
      padThickness + rodLength - minimumEmbedment,
    );
  } else if (key === "channelLength") {
    limits.max = Math.min(limits.max, width - 2 * getParam(params, "legEdgeInset"));
  } else if (key.startsWith("channelPosition")) {
    const index = Number(key.slice(-1));
    const previous = index > 1 ? getParam(params, `channelPosition${index - 1}`) : 0;
    const next = index < 3 ? getParam(params, `channelPosition${index + 1}`) : length;
    limits.min = Math.max(limits.min, previous + getParam(params, "channelWidth"));
    limits.max = Math.min(limits.max, next - getParam(params, "channelWidth"), length);
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

export function getDiningTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  if (isVinnyParams(params)) {
    return getVinnyTableAuditValue(check, params, unit);
  }
  if (isWhispererParams(params)) {
    return getWhispererTableAuditValue(check, params, unit);
  }
  const scale = getParam(params, "mockScale");
  const topThickness = getParam(params, "topThickness");
  const topRadius = getParam(params, "topRoundoverRadius");
  const bottomRadius = getParam(params, "bottomRoundoverRadius");
  const flatBand = topThickness - topRadius - bottomRadius;
  const dimensions = getDiningTableDimensions(params);
  const levelingFeet = getPlateTableLevelingFeetSpec(params, false);
  switch (check.key) {
    case "tableEnvelope":
      return item(
        check.label,
        `${formatLength(getParam(params, "tableLength"), unit)} × ${formatLength(getParam(params, "tableWidth"), unit)} × ${formatLength(getParam(params, "overallHeight"), unit)}`,
      );
    case "tabletopProfile":
      return item(
        check.label,
        `${formatLength(topThickness, unit)} top; ${formatLength(flatBand, unit)} flat band`,
        flatBand >= 0 ? "pass" : "warn",
      );
    case "legGeometry":
      return item(
        check.label,
        `4 × ${formatLength(getParam(params, "legSize"), unit)} posts; ${formatLength(getParam(params, "legOuterCornerRadius"), unit)} outer · ${formatLength(getParam(params, "legCornerRadius"), unit)} other three`,
      );
    case "legEndRoundovers":
      return getParam(params, "legGrooveEnabled") >= 0.5
        ? item(
            check.label,
            `${formatLength(getParam(params, "legGrooveHeight"), unit)} high × ${formatLength(getParam(params, "legGrooveDepth"), unit)} deep; ${formatLength(getParam(params, "legTopRoundoverRadius"), unit)} shoulder`,
          )
        : item(
            check.label,
            `${formatLength(getParam(params, "legTopRoundoverRadius"), unit)} top · ${formatLength(getParam(params, "legBottomRoundoverRadius"), unit)} bottom`,
          );
    case "cornerPlates":
      return item(
        check.label,
        `4 × ${formatLength(getParam(params, "plateSize"), unit)} square × ${formatLength(getParam(params, "plateThickness"), unit)}; ${formatLength(getParam(params, "plateEdgeInset"), unit)} setback`,
      );
    case "channelLayout":
      return item(
        check.label,
        [1, 2, 3]
          .map((index) => formatLength(getParam(params, `channelPosition${index}`), unit))
          .join(" · "),
      );
    case "levelingFeet": {
      if (!levelingFeet.enabled) {
        return item(check.label, "Disabled; wood posts contact the floor", "warn");
      }
      const minimumEmbeddedRod = Math.min(...levelingFeet.embeddedRodLengths);
      return item(
        check.label,
        `4 independent extensions ${levelingFeet.extensions.map((extension) => formatLength(extension, unit)).join(" · ")}; ${formatLength(levelingFeet.padDiameter, unit)} pads · ${formatLength(levelingFeet.rodDiameter, unit)} rods · ${formatLength(minimumEmbeddedRod, unit)} minimum embedded`,
        minimumEmbeddedRod >= levelingFeet.minimumEmbedment ? "pass" : "warn",
      );
    }
    case "printEnvelope":
      return item(
        check.label,
        `1:${scale}; ${dimensions.length.toFixed(1)} × ${dimensions.width.toFixed(1)} × ${dimensions.height.toFixed(1)} mm`,
        dimensions.length <= 256 && dimensions.width <= 256 ? "pass" : "warn",
      );
    case "minimumMockFeature": {
      const feature = Math.min(
        getParam(params, "legTopRoundoverRadius") / scale,
        getParam(params, "legBottomRoundoverRadius") / scale,
        getParam(params, "plateThickness") / scale,
        ...(getParam(params, "legGrooveEnabled") >= 0.5
          ? [getParam(params, "legGrooveDepth") / scale]
          : []),
        ...(levelingFeet.enabled
          ? [
              levelingFeet.padThickness / scale,
              levelingFeet.rodDiameter / scale,
            ]
          : []),
      );
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

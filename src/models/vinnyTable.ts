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
const PLAN_CORNER_SEGMENTS = 8;
const EDGE_PROFILE_SEGMENTS = 8;

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

function apronBottom(params: ModelParams) {
  return topBottom(params) - apronHeight(params);
}

function rectangle(width: number, depth: number, x = 0, y = 0): Point[] {
  return [
    { x: x - width / 2, y: y - depth / 2 },
    { x: x + width / 2, y: y - depth / 2 },
    { x: x + width / 2, y: y + depth / 2 },
    { x: x - width / 2, y: y + depth / 2 },
  ];
}

function roundedRectangle(
  width: number,
  depth: number,
  radius: number,
  x = 0,
  y = 0,
): Point[] {
  const safeRadius = Math.max(
    EPSILON,
    Math.min(radius, width / 2 - EPSILON, depth / 2 - EPSILON),
  );
  const centers = [
    [x - width / 2 + safeRadius, y - depth / 2 + safeRadius, Math.PI, (Math.PI * 3) / 2],
    [x + width / 2 - safeRadius, y - depth / 2 + safeRadius, (Math.PI * 3) / 2, Math.PI * 2],
    [x + width / 2 - safeRadius, y + depth / 2 - safeRadius, 0, Math.PI / 2],
    [x - width / 2 + safeRadius, y + depth / 2 - safeRadius, Math.PI / 2, Math.PI],
  ] as const;
  return centers.flatMap(([centerX, centerY, start, end]) =>
    Array.from({ length: PLAN_CORNER_SEGMENTS + 1 }, (_, index) => {
      const angle = start + ((end - start) * index) / PLAN_CORNER_SEGMENTS;
      return {
        x: centerX + Math.cos(angle) * safeRadius,
        y: centerY + Math.sin(angle) * safeRadius,
      };
    }),
  );
}

function polygonArea(points: Point[]) {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function treatedLegRing(
  points: Point[],
  outerCornerIndex: number,
  outerRadius: number,
  otherRadius: number,
): Point[] {
  const orientation = Math.sign(polygonArea(points)) || 1;
  return points.flatMap((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const toPrevious = new THREE.Vector2(
      previous.x - point.x,
      previous.y - point.y,
    );
    const toNext = new THREE.Vector2(next.x - point.x, next.y - point.y);
    const previousLength = toPrevious.length();
    const nextLength = toNext.length();
    toPrevious.normalize();
    toNext.normalize();
    const cross = toPrevious.x * toNext.y - toPrevious.y * toNext.x;
    const convex = cross * orientation < -EPSILON;
    if (!convex) return [point];

    const requestedRadius =
      index === outerCornerIndex ? outerRadius : otherRadius;
    if (requestedRadius <= EPSILON) return [point];
    const angle = Math.acos(
      THREE.MathUtils.clamp(toPrevious.dot(toNext), -1, 1),
    );
    const tangentDistance = Math.min(
      requestedRadius / Math.max(Math.tan(angle / 2), EPSILON),
      previousLength * 0.45,
      nextLength * 0.45,
    );
    const effectiveRadius = tangentDistance * Math.tan(angle / 2);
    const bisector = toPrevious.clone().add(toNext).normalize();
    const centerDistance =
      effectiveRadius / Math.max(Math.sin(angle / 2), EPSILON);
    const center = new THREE.Vector2(point.x, point.y).addScaledVector(
      bisector,
      centerDistance,
    );
    const start = new THREE.Vector2(point.x, point.y).addScaledVector(
      toPrevious,
      tangentDistance,
    );
    const end = new THREE.Vector2(point.x, point.y).addScaledVector(
      toNext,
      tangentDistance,
    );
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const direction = cross < 0 ? 1 : -1;
    let sweep = endAngle - startAngle;
    if (direction > 0 && sweep < 0) sweep += Math.PI * 2;
    if (direction < 0 && sweep > 0) sweep -= Math.PI * 2;
    return Array.from({ length: PLAN_CORNER_SEGMENTS + 1 }, (_, segment) => {
      const arcAngle = startAngle + (sweep * segment) / PLAN_CORNER_SEGMENTS;
      return {
        x: center.x + Math.cos(arcAngle) * effectiveRadius,
        y: center.y + Math.sin(arcAngle) * effectiveRadius,
      };
    });
  });
}

function createVinnyTopGeometry(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const bottom = topBottom(params);
  const top = scaled(params, "overallHeight");
  const cornerRadius = Math.min(
    scaled(params, "tabletopCornerRadius"),
    Math.min(length, width) / 2 - EPSILON,
  );
  const roundover = Math.min(
    scaled(params, "tabletopRoundoverRadius"),
    scaled(params, "topThickness") / 2,
    cornerRadius,
  );
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
  const layers: Layer[] = [];
  const addLayer = (
    z: number,
    inset: number,
    planLength = length,
    planWidth = width,
  ) => {
    const safeInset = Math.min(
      Math.max(inset, 0),
      planLength / 2 - EPSILON,
      planWidth / 2 - EPSILON,
    );
    const next: Layer = {
      z,
      points: roundedRectangle(
        planLength - safeInset * 2,
        planWidth - safeInset * 2,
        Math.max(cornerRadius - grooveWidth - safeInset, 0),
      ),
    };
    if (planLength === length && planWidth === width) {
      next.points = roundedRectangle(
        planLength - safeInset * 2,
        planWidth - safeInset * 2,
        Math.max(cornerRadius - safeInset, 0),
      );
    }
    const previous = layers[layers.length - 1];
    if (
      previous &&
      Math.abs(previous.z - next.z) < EPSILON &&
      previous.points.length === next.points.length &&
      previous.points.every(
        (point, index) =>
          Math.abs(point.x - next.points[index].x) < EPSILON &&
          Math.abs(point.y - next.points[index].y) < EPSILON,
      )
    ) {
      return;
    }
    layers.push(next);
  };
  if (grooved) {
    addLayer(bottom, 0, insetLength, insetWidth);
    addLayer(bottom + grooveDepth, 0, insetLength, insetWidth);
    addLayer(bottom + grooveDepth, 0);
  } else {
    addLayer(bottom, 0);
  }
  addLayer(top - roundover, 0);
  if (roundover > EPSILON) {
    for (let index = 1; index <= EDGE_PROFILE_SEGMENTS; index += 1) {
      const angle = (index / EDGE_PROFILE_SEGMENTS) * (Math.PI / 2);
      addLayer(
        top - roundover + roundover * Math.sin(angle),
        roundover - roundover * Math.cos(angle),
      );
    }
  } else {
    addLayer(top, 0);
  }
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
  const ring = points.map(([inwardX, inwardY]) => ({
    x: outerX - xSign * inwardX,
    y: outerY - ySign * inwardY,
  }));
  return treatedLegRing(
    ring,
    0,
    scaled(params, "legOuterCornerRadius"),
    scaled(params, "legEdgeRadius"),
  );
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
  const shoulderJoin = apronBottom(params);
  const shoulderRadius = Math.min(
    scaled(params, "advancedShoulderRadius"),
    topArm - footArm,
    shoulderJoin - bottom,
  );
  const shoulderBottom = shoulderJoin - shoulderRadius;
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
    ...Array.from({ length: EDGE_PROFILE_SEGMENTS - 1 }, (_, index) => {
      const angle = ((index + 1) / EDGE_PROFILE_SEGMENTS) * (Math.PI / 2);
      return {
      z: shoulderBottom + shoulderRadius * Math.sin(angle),
      points: advancedLegRing(
        params,
        xSign,
        ySign,
        topArm - shoulderRadius * Math.cos(angle),
      ),
    };
    }),
    {
      z: shoulderJoin,
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
  const ring = [
    { x: outerX, y: outerY },
    { x: outerX - xSign * size, y: outerY },
    { x: outerX - xSign * size, y: outerY - ySign * size },
    { x: outerX, y: outerY - ySign * size },
  ];
  return treatedLegRing(
    ring,
    0,
    scaled(params, "legOuterCornerRadius"),
    scaled(params, "legEdgeRadius"),
  );
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

function supportModeUsesChannels(params: ModelParams) {
  return getParam(params, "supportMode") >= 0.5;
}

function diagonalBracesEnabled(params: ModelParams) {
  return getParam(params, "diagonalBracesEnabled") >= 0.5;
}

function memberCrossSection(
  thickness: number,
  depth: number,
  bottomRoundover: number,
  roundoverSide: -1 | 0 | 1,
  blend = 1,
): Point[] {
  const radius = Math.max(
    0,
    Math.min(bottomRoundover, thickness / 2, depth - EPSILON),
  );
  if (radius <= EPSILON || roundoverSide === 0) {
    return rectangle(thickness, depth);
  }
  const innerX = (-roundoverSide * thickness) / 2;
  const outerX = (roundoverSide * thickness) / 2;
  const bottom = -depth / 2;
  const top = depth / 2;
  const arcStart = new THREE.Vector2(
    outerX - roundoverSide * radius,
    bottom,
  );
  const squareCorner = new THREE.Vector2(outerX, bottom);
  const arcEnd = new THREE.Vector2(outerX, bottom + radius);
  const points: Point[] = [
    { x: innerX, y: top },
    { x: innerX, y: bottom },
  ];
  for (let index = 0; index <= EDGE_PROFILE_SEGMENTS; index += 1) {
    const progress = index / EDGE_PROFILE_SEGMENTS;
    const angle = -Math.PI / 2 + progress * (Math.PI / 2);
    const rounded = new THREE.Vector2(
      outerX - roundoverSide * radius +
        roundoverSide * Math.cos(angle) * radius,
      bottom + radius + Math.sin(angle) * radius,
    );
    const squared =
      progress <= 0.5
        ? arcStart.clone().lerp(squareCorner, progress * 2)
        : squareCorner.clone().lerp(arcEnd, (progress - 0.5) * 2);
    const point = squared.lerp(rounded, blend);
    points.push({
      x: point.x,
      y: point.y,
    });
  }
  points.push({ x: outerX, y: top });
  return roundoverSide > 0 ? points : points.reverse();
}

function createPrismaticMember(
  params: ModelParams,
  start: THREE.Vector2,
  end: THREE.Vector2,
  thickness: number,
  depth: number,
  centerZ: number,
  bottomRoundover = 0,
  roundoverSide: -1 | 0 | 1 = 0,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= EPSILON) throw new Error("Vinny frame member must have length");
  direction.normalize();
  const across = new THREE.Vector2(-direction.y, direction.x);
  const hasRoundover =
    bottomRoundover > EPSILON && roundoverSide !== 0;
  const endLand = Math.min(bottomRoundover, length / 2);
  const stations = hasRoundover
    ? [
        { distance: 0, blend: 0 },
        { distance: endLand, blend: 1 },
        { distance: length - endLand, blend: 1 },
        { distance: length, blend: 0 },
      ].filter(
        (station, index, entries) =>
          index === 0 ||
          Math.abs(station.distance - entries[index - 1].distance) > EPSILON,
      )
    : [
        { distance: 0, blend: 0 },
        { distance: length, blend: 0 },
      ];
  const sections = stations.map((station) =>
    memberCrossSection(
      thickness,
      depth,
      bottomRoundover,
      roundoverSide,
      station.blend,
    ),
  );
  const positions: number[] = [];
  const pointAt = (distance: number, point: Point) =>
    new THREE.Vector3(
      start.x + direction.x * distance + across.x * point.x,
      start.y + direction.y * distance + across.y * point.x,
      centerZ + point.y,
    );
  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex += 1) {
    const section = sections[stationIndex];
    const nextSection = sections[stationIndex + 1];
    for (let index = 0; index < section.length; index += 1) {
      const next = (index + 1) % section.length;
      const a = pointAt(stations[stationIndex].distance, section[index]);
      const b = pointAt(stations[stationIndex + 1].distance, nextSection[index]);
      const c = pointAt(stations[stationIndex + 1].distance, nextSection[next]);
      const d = pointAt(stations[stationIndex].distance, section[next]);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }
  const firstSection = sections[0];
  const lastSection = sections[sections.length - 1];
  const triangles = THREE.ShapeUtils.triangulateShape(
    firstSection.map((point) => new THREE.Vector2(point.x, point.y)),
    [],
  );
  for (const [aIndex, bIndex, cIndex] of triangles) {
    addTriangle(
      positions,
      pointAt(0, firstSection[aIndex]),
      pointAt(0, firstSection[cIndex]),
      pointAt(0, firstSection[bIndex]),
    );
    addTriangle(
      positions,
      pointAt(length, lastSection[aIndex]),
      pointAt(length, lastSection[bIndex]),
      pointAt(length, lastSection[cIndex]),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignDirectionalWoodUvs(
    geometry,
    new THREE.Vector3(direction.x, direction.y, 0),
    textureSize(params),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function memberThickness(params: ModelParams) {
  return scaled(params, "apronThickness");
}

function apronHeight(params: ModelParams) {
  return scaled(params, "apronHeight");
}

function legWidthAtApron(params: ModelParams) {
  return isAdvanced(params)
    ? scaled(params, "advancedLegTopWidth")
    : scaled(params, "postLegTopSize");
}

function longApronLength(params: ModelParams) {
  return baseLength(params) - legWidthAtApron(params) * 2;
}

function sideApronLength(params: ModelParams) {
  return baseWidth(params) - legWidthAtApron(params) * 2;
}

function stretcherLength(params: ModelParams) {
  return baseWidth(params) - memberThickness(params) * 2;
}

type NamedGeometry = { geometry: THREE.BufferGeometry; name: string };

function createMiteredDiagonalBrace(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
  innerX: number,
  innerY: number,
  longReach: number,
  sideReach: number,
  thickness: number,
  depth: number,
) {
  const corner = new THREE.Vector2(xSign * innerX, ySign * innerY);
  const longContact = new THREE.Vector2(
    corner.x - xSign * longReach,
    corner.y,
  );
  const sideContact = new THREE.Vector2(
    corner.x,
    corner.y - ySign * sideReach,
  );
  const direction = sideContact.clone().sub(longContact);
  const length = direction.length();
  if (length <= EPSILON) {
    throw new Error("Vinny diagonal block must have a calculated angle");
  }
  direction.normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const intersectHorizontal = (offset: number) => {
    const origin = longContact.clone().addScaledVector(normal, offset);
    const distance = (corner.y - origin.y) / direction.y;
    return origin.addScaledVector(direction, distance);
  };
  const intersectVertical = (offset: number) => {
    const origin = sideContact.clone().addScaledVector(normal, offset);
    const distance = (corner.x - origin.x) / direction.x;
    return origin.addScaledVector(direction, distance);
  };
  const halfThickness = thickness / 2;
  const plan = [
    intersectHorizontal(-halfThickness),
    intersectHorizontal(halfThickness),
    intersectVertical(halfThickness),
    intersectVertical(-halfThickness),
  ].map((point) => ({ x: point.x, y: point.y }));
  if (polygonArea(plan) < 0) plan.reverse();
  const top = topBottom(params);
  const bottom = top - depth;
  return createLoftGeometry(
    [
      { z: bottom, points: plan },
      { z: top, points: plan },
    ],
    new THREE.Vector3(direction.x, direction.y, 0),
    textureSize(params),
  );
}

function createFrameGeometries(params: ModelParams): NamedGeometry[] {
  const thickness = memberThickness(params);
  const depth = apronHeight(params);
  const z = topBottom(params) - depth / 2;
  const longY = baseWidth(params) / 2 - thickness / 2;
  const sideX = baseLength(params) / 2 - thickness / 2;
  const longLength = longApronLength(params);
  const sideLength = sideApronLength(params);
  const apronRoundover = scaled(params, "apronOuterBottomRoundoverRadius");
  const geometries: NamedGeometry[] = [
    {
      name: "long-apron-front",
      geometry: createPrismaticMember(
        params,
        new THREE.Vector2(-longLength / 2, -longY),
        new THREE.Vector2(longLength / 2, -longY),
        thickness,
        depth,
        z,
        apronRoundover,
        -1,
      ),
    },
    {
      name: "long-apron-rear",
      geometry: createPrismaticMember(
        params,
        new THREE.Vector2(-longLength / 2, longY),
        new THREE.Vector2(longLength / 2, longY),
        thickness,
        depth,
        z,
        apronRoundover,
        1,
      ),
    },
    {
      name: "side-apron-left",
      geometry: createPrismaticMember(
        params,
        new THREE.Vector2(-sideX, -sideLength / 2),
        new THREE.Vector2(-sideX, sideLength / 2),
        thickness,
        depth,
        z,
        apronRoundover,
        1,
      ),
    },
    {
      name: "side-apron-right",
      geometry: createPrismaticMember(
        params,
        new THREE.Vector2(sideX, -sideLength / 2),
        new THREE.Vector2(sideX, sideLength / 2),
        thickness,
        depth,
        z,
        apronRoundover,
        -1,
      ),
    },
  ];
  const spacing = Math.min(
    scaled(params, "stretcherSpacing"),
    Math.max(thickness, longApronLength(params) / 3),
  );
  if (!supportModeUsesChannels(params)) {
    for (const [index, x] of [-spacing, 0, spacing].entries()) {
      geometries.push({
        name: ["stretcher-left", "stretcher-center", "stretcher-right"][index],
        geometry: createPrismaticMember(
          params,
          new THREE.Vector2(x, -stretcherLength(params) / 2),
          new THREE.Vector2(x, stretcherLength(params) / 2),
          thickness,
          depth,
          z,
        ),
      });
    }
  }
  if (diagonalBracesEnabled(params)) {
    const innerX = baseLength(params) / 2 - thickness;
    const innerY = baseWidth(params) / 2 - thickness;
    const longReach = Math.min(
      scaled(params, "diagonalBraceLongReach"),
      longLength / 3,
    );
    const sideReach = Math.min(
      scaled(params, "diagonalBraceSideReach"),
      sideLength / 3,
    );
    for (const xSign of [-1, 1] as const) {
      for (const ySign of [-1, 1] as const) {
        geometries.push({
          name: `diagonal-brace-${xSign < 0 ? "left" : "right"}-${ySign < 0 ? "front" : "rear"}`,
          geometry: createMiteredDiagonalBrace(
            params,
            xSign,
            ySign,
            innerX,
            innerY,
            longReach,
            sideReach,
            thickness,
            depth,
          ),
        });
      }
    }
  }
  return geometries;
}

function createCChannelGeometry(params: ModelParams, x: number) {
  const width = scaled(params, "cChannelWidth");
  const depth = scaled(params, "cChannelDepth");
  const wall = Math.min(
    scaled(params, "cChannelWallThickness"),
    width / 2 - EPSILON,
    depth - EPSILON,
  );
  const length = stretcherLength(params);
  const underside = topBottom(params);
  const web = new THREE.BoxGeometry(width, length, wall).toNonIndexed();
  web.translate(x, 0, underside - wall / 2);
  const legs = [-1, 1].map((sign) => {
    const geometry = new THREE.BoxGeometry(
      wall,
      length,
      depth - wall,
    ).toNonIndexed();
    geometry.translate(
      x + sign * (width / 2 - wall / 2),
      0,
      underside - wall - (depth - wall) / 2,
    );
    return geometry;
  });
  const merged = mergeGeometries([web, ...legs], false);
  web.dispose();
  legs.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge Vinny C-channel geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
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
  const spacing = Math.min(
    scaled(params, "stretcherSpacing"),
    Math.max(memberThickness(params), longApronLength(params) / 3),
  );
  return {
    channels: supportModeUsesChannels(params)
      ? [-spacing, 0, spacing].map((x) => createCChannelGeometry(params, x))
      : [],
    feet: levelingFeetEnabled(params)
      ? ([-1, 1] as const).flatMap((xSign) =>
          ([-1, 1] as const).map((ySign) =>
            createLevelingFootGeometry(params, xSign, ySign),
          ),
        )
      : [],
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
  const frame = createFrameGeometries(params);
  const names = [
    "tabletop",
    "leg-left-front",
    "leg-left-rear",
    "leg-right-front",
    "leg-right-rear",
    ...frame.map((part) => part.name),
  ];
  const geometries = [
    createVinnyTopGeometry(params),
    ...legs,
    ...frame.map((part) => part.geometry),
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
  material: "Oak" | "Steel";
  name: string;
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  notes: string;
};

export function getVinnyTableFabricationSpec(params: ModelParams) {
  const scale = getParam(params, "mockScale");
  const diagonalLongReach = Math.min(
    scaled(params, "diagonalBraceLongReach"),
    longApronLength(params) / 3,
  );
  const diagonalSideReach = Math.min(
    scaled(params, "diagonalBraceSideReach"),
    sideApronLength(params) / 3,
  );
  const diagonalLongAngleDegrees =
    THREE.MathUtils.radToDeg(
      Math.atan2(diagonalSideReach, diagonalLongReach),
    );
  const apronBottomHeight = apronBottom(params) * scale;
  return {
    apronBottomHeight,
    shoulderJoinHeight: apronBottomHeight,
    apronHeight: getParam(params, "apronHeight"),
    apronThickness: getParam(params, "apronThickness"),
    longApronLength: longApronLength(params) * scale,
    sideApronLength: sideApronLength(params) * scale,
    support: supportModeUsesChannels(params) ? "c-channels" : "stretchers",
    crossSupportCount: 3,
    crossSupportLength: stretcherLength(params) * scale,
    diagonalBraceCount: diagonalBracesEnabled(params) ? 4 : 0,
    diagonalBraceLength:
      Math.hypot(diagonalLongReach, diagonalSideReach) * scale,
    diagonalLongAngleDegrees,
    diagonalSideAngleDegrees: 90 - diagonalLongAngleDegrees,
  } as const;
}

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
        material: "Oak",
        name: "Advanced leg profile halves",
        quantity: 8,
        length: legBlankLength,
        width: getParam(params, "advancedLegTopWidth"),
        thickness: getParam(params, "advancedLegThickness"),
        notes: `Mirror the circular shoulder profile so it meets the live apron bottom, miter matching halves at 45° into four L-shaped corner legs, round the outside corner independently, and round the other four exposed vertical edges to their shared radius.${levelingFeetEnabled(params) ? " Length is shortened by the installed foot extension to preserve overall height." : ""}`,
      }
    : {
        id: "A1",
        material: "Oak",
        name: isIntermediate(params) ? "Double-tapered leg blanks" : "Square leg blanks",
        quantity: 4,
        length: legBlankLength,
        width: getParam(params, "postLegTopSize"),
        thickness: getParam(params, "postLegTopSize"),
        notes: `${isIntermediate(params)
          ? "Leave the top 3 in square and taper both inside faces to the specified foot."
          : "Keep the four post blanks square and straight."} Round the outside corner independently and round the other exposed vertical edges to their shared radius.${levelingFeetEnabled(params) ? " Length is shortened by the installed foot extension to preserve overall height." : ""}`,
      };
  const scale = getParam(params, "mockScale");
  const support: VinnyCutPart = supportModeUsesChannels(params)
    ? {
        id: "H1",
        material: "Steel",
        name: "C-channels",
        quantity: 3,
        length: stretcherLength(params) * scale,
        width: getParam(params, "cChannelWidth"),
        thickness: getParam(params, "cChannelDepth"),
        notes: `${formatLength(getParam(params, "cChannelWallThickness"), "in")} wall · one centered; outer two use the editable on-center spacing. Verify the actual channel profile and attachment slots before fabrication.`,
      }
    : {
        id: "B3",
        material: "Oak",
        name: "Cross stretchers",
        quantity: 3,
        length: stretcherLength(params) * scale,
        width: getParam(params, "apronHeight"),
        thickness: memberThickness(params) * scale,
        notes: "One centered; outer two use the editable on-center spacing. Length is derived from the live inside faces of the two long aprons.",
      };
  const fabrication = getVinnyTableFabricationSpec(params);
  return [
    { id: "T1", material: "Oak", name: "Tabletop panel", quantity: 1, length: topLength, width: topWidth, thickness: topThickness, notes: `${isOverhang(params) ? "Centered over the smaller base." : "Flush to the base with the modeled perimeter shadow groove."} Shape the plan corners and top edge to the listed radii.` },
    legs,
    { id: "B1", material: "Oak", name: "Long aprons", quantity: 2, length: longApronLength(params) * scale, width: getParam(params, "apronHeight"), thickness: getParam(params, "apronThickness"), notes: "Length is derived from the table and leg widths. Round only the outer lower longitudinal edge; leave the inner edge and both end lands square for flush joinery." },
    { id: "B2", material: "Oak", name: "Short aprons", quantity: 2, length: sideApronLength(params) * scale, width: getParam(params, "apronHeight"), thickness: getParam(params, "apronThickness"), notes: "Length is derived from the table and leg widths. Round only the outer lower longitudinal edge; leave the inner edge and both end lands square for flush joinery." },
    support,
    ...(diagonalBracesEnabled(params)
      ? [{
          id: "B4",
          material: "Oak" as const,
          name: "Diagonal apron blocks",
          quantity: 4,
          length: fabrication.diagonalBraceLength,
          width: getParam(params, "apronHeight"),
          thickness: memberThickness(params) * scale,
          notes: `Miter to the calculated ${fabrication.diagonalLongAngleDegrees.toFixed(1)}° long-apron and ${fabrication.diagonalSideAngleDegrees.toFixed(1)}° side-apron contact angles; both end faces and the block top/bottom finish flush with the square apron inside faces.`,
        }]
      : []),
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
  const depth = getParam(params, "apronHeight");
  const thickness = memberThickness(params) * getParam(params, "mockScale");
  const legWidth = isAdvanced(params)
    ? getParam(params, "advancedLegTopWidth")
    : getParam(params, "postLegTopSize");
  const legFoot = isAdvanced(params)
    ? getParam(params, "advancedLegFootWidth")
    : isIntermediate(params)
      ? getParam(params, "postLegFootSize")
      : getParam(params, "postLegTopSize");
  const braced = diagonalBracesEnabled(params);
  const channels = supportModeUsesChannels(params);
  const braceFactor = braced
    ? Math.min(
        1,
        Math.sqrt(
          (getParam(params, "diagonalBraceLongReach") / (8 * INCH)) *
            (getParam(params, "diagonalBraceSideReach") / (8 * INCH)),
        ),
      )
    : 0;
  const channelFactor = channels
    ? Math.min(
        1,
        (3 *
          getParam(params, "cChannelWidth") *
          getParam(params, "cChannelDepth")) /
          (3 * 2 * 0.5 * INCH ** 2),
      )
    : 0;
  const heightFactor = (30 * INCH) / height;
  const longFactor = (depth / (2.5 * INCH)) ** 1.5 * Math.sqrt((84 * INCH) / longSpan);
  const sideFactor = (depth / (2.5 * INCH)) ** 1.5 * Math.sqrt((28 * INCH) / sideSpan);
  const legFactor = Math.sqrt((legWidth * thickness) / (6 * 1.5 * INCH ** 2));
  const longRacking =
    27 +
    45 * longFactor * heightFactor ** 1.5 +
    17 * legFactor * heightFactor +
    8 * braceFactor;
  const sideRacking =
    27 +
    44 * sideFactor * heightFactor ** 1.5 +
    17 * legFactor * heightFactor +
    12 * braceFactor;
  const stretcherCoverage = channels
    ? 0
    : Math.min(1, 3 * thickness / Math.max(longSpan, EPSILON));
  const torsion =
    34 +
    36 * Math.sqrt(longFactor * sideFactor) * heightFactor +
    (channels
      ? 12 * channelFactor
      : 18 * Math.min(1, stretcherCoverage / 0.055)) +
    12 * braceFactor;
  const footprintLength = getParam(params, "tableLength") - (isOverhang(params) ? 2 * getParam(params, "topOverhang") : 0);
  const footprintWidth = getParam(params, "tableWidth") - (isOverhang(params) ? 2 * getParam(params, "topOverhang") : 0);
  const tippingRatio = Math.min(footprintLength, footprintWidth) / (2 * height);
  const tipping = 20 + 80 * Math.min(1, tippingRatio / 0.62);
  const floorRocking = levelingFeetEnabled(params) ? 98 : 70;
  const legSlenderness = (height - topThickness) / Math.sqrt(legWidth * thickness);
  const longSlenderness = longSpan / Math.sqrt(depth * thickness);
  const topSlenderness = getParam(params, "tableWidth") / topThickness;
  const stiffness =
    100 -
    Math.max(0, legSlenderness - 9) * 3 -
    Math.max(0, longSlenderness - 31) * 1.2 -
    Math.max(0, topSlenderness - 28) * 0.7 +
    4 * channelFactor;
  const commonInputs = [
    { key: "overallHeight", label: "Overall height", value: height, format: "length" as const },
    { key: "apronHeight", label: "Apron height", value: depth, format: "length" as const },
    { key: "apronThickness", label: "Apron thickness", value: thickness, format: "length" as const },
    { key: "legTopWidth", label: "Leg width at frame", value: legWidth, format: "length" as const },
    { key: "legFootWidth", label: "Leg contact width", value: legFoot, format: "length" as const },
    { key: "diagonalBracesEnabled", label: "Diagonal corner blocks enabled", value: braced ? 1 : 0, format: "number" as const, precision: 0 },
    { key: "supportMode", label: "C-channel support mode", value: channels ? 1 : 0, format: "number" as const, precision: 0 },
  ];
  const metrics = [
    metric("longitudinal-racking", "Long-apron racking", longRacking, `${formatLength(depth, "in")} frame depth · ${formatLength(longSpan, "in")} span${braced ? " · four corner blocks" : ""}`, `The two continuous long aprons and four corner legs form the modeled lengthwise load path.${braced ? " The four modeled diagonal blocks receive triangulation credit." : ""} Joint rotation is not credited.`, commonInputs),
    metric("end-box-racking", "End-frame racking", sideRacking, `${formatLength(depth, "in")} frame depth · ${formatLength(sideSpan, "in")} span${braced ? " · four corner blocks" : ""}`, `The two short aprons close the end frames.${braced ? " The four modeled diagonal blocks receive triangulation credit." : ""} Domino, dowel, pocket-hole, or block-joint capacity must be established physically.`, commonInputs),
    metric("torsion", "Frame-and-support torsion", torsion, `closed perimeter frame · ${channels ? "three C-channels" : "three oak stretchers"}${braced ? " · four corner blocks" : ""}`, `The closed apron loop and ${channels ? "three modeled C-channels receive limited tabletop-plane credit; they are not credited as apron-leg braces" : "three cross stretchers receive frame-topology credit"}.${braced ? " Four diagonal blocks receive corner-triangulation credit." : ""} Fastener slip and joint stiffness remain unmodeled.`, commonInputs),
    metric("tipping", "Tipping margin", tipping, `controlling half-footprint / height ${tippingRatio.toFixed(2)}`, "The support polygon is derived from the base envelope. This is not a safe-load prediction for sitting or climbing.", commonInputs),
    metric("floor-rocking", "Floor rocking tolerance", floorRocking, levelingFeetEnabled(params) ? "four independent adjusters" : "four fixed wood contacts", "Independent adjusters can bring all four contacts onto one plane; insert capacity and floor bearing still require physical checks.", commonInputs),
    metric("member-stiffness", "Member stiffness", stiffness, `leg ${legSlenderness.toFixed(1)}:1 · long apron ${longSlenderness.toFixed(1)}:1`, "This relative slenderness screen does not calculate allowable stress, deflection, buckling, or connection capacity.", commonInputs),
  ];
  const overallScore = score(metrics.reduce((total, entry) => total + entry.score * entry.calculation.weight, 0));
  return {
    overallScore,
    overallGrade: grade(overallScore),
    overallCalculation: {
      rationale: `The Vinny composite emphasizes the orthogonal apron frame, ${braced ? "four diagonal corner blocks" : "unbraced corners"}, and the selected ${channels ? "C-channel tabletop support" : "oak stretcher frame path"} while keeping floor contact, tipping, and slenderness visible.`,
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
    limits.min = Math.max(
      limits.min,
      getParam(params, "flushGrooveDepth") + limits.step,
      getParam(params, "tabletopRoundoverRadius"),
    );
  } else if (key === "tabletopCornerRadius") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 2);
    limits.min = Math.max(
      limits.min,
      getParam(params, "tabletopRoundoverRadius"),
    );
  } else if (key === "tabletopRoundoverRadius") {
    limits.max = Math.min(
      limits.max,
      topThickness,
      getParam(params, "tabletopCornerRadius"),
    );
  } else if (key === "topOverhang") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 8);
  } else if (key === "advancedLegFootWidth") {
    limits.max = Math.min(limits.max, getParam(params, "advancedLegTopWidth") - limits.step);
    limits.min = Math.max(limits.min, getParam(params, "advancedLegThickness") + limits.step);
  } else if (key === "advancedLegThickness") {
    limits.max = Math.min(limits.max, getParam(params, "advancedLegFootWidth") - limits.step);
  } else if (key === "advancedShoulderRadius") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "advancedLegTopWidth") -
        getParam(params, "advancedLegFootWidth"),
      height - topThickness - getParam(params, "apronHeight"),
    );
  } else if (key === "legOuterCornerRadius") {
    const legWidth = isAdvanced(params)
      ? getParam(params, "advancedLegTopWidth")
      : getParam(params, "postLegTopSize");
    limits.max = Math.min(limits.max, legWidth / 2);
  } else if (key === "legEdgeRadius") {
    const legWidth = isAdvanced(params)
      ? getParam(params, "advancedLegThickness")
      : getParam(params, "postLegTopSize");
    limits.max = Math.min(limits.max, legWidth / 4);
  } else if (key === "apronOuterBottomRoundoverRadius") {
    limits.max = Math.min(
      limits.max,
      memberThickness(params) * getParam(params, "mockScale") / 2,
      getParam(params, "apronHeight"),
    );
  } else if (key === "cChannelWallThickness") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "cChannelWidth") / 2 - limits.step,
      getParam(params, "cChannelDepth") - limits.step,
    );
  } else if (key === "diagonalBraceLongReach") {
    limits.max = Math.min(
      limits.max,
      longApronLength(params) * getParam(params, "mockScale") / 3,
    );
  } else if (key === "diagonalBraceSideReach") {
    limits.max = Math.min(
      limits.max,
      sideApronLength(params) * getParam(params, "mockScale") / 3,
    );
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
      return auditItem(check.label, `${formatLength(getParam(params, "topThickness"), unit)} top · ${formatLength(getParam(params, "tabletopCornerRadius"), unit)} corners · ${formatLength(getParam(params, "tabletopRoundoverRadius"), unit)} top roundover · ${isOverhang(params) ? `${formatLength(getParam(params, "topOverhang"), unit)} overhang` : `${formatLength(getParam(params, "flushGrooveWidth"), unit)} × ${formatLength(getParam(params, "flushGrooveDepth"), unit)} flush shadow groove`}`);
    case "legGeometry":
      return auditItem(check.label, `4 ${style} legs · ${formatLength(getParam(params, isAdvanced(params) ? "advancedLegTopWidth" : "postLegTopSize"), unit)} top width · ${formatLength(getParam(params, "legOuterCornerRadius"), unit)} outside radius · ${formatLength(getParam(params, "legEdgeRadius"), unit)} shared radius on the other exposed vertical edges${isAdvanced(params) ? " · shoulder tangent at apron bottom" : ""}`);
    case "legEndRoundovers":
      return auditItem(check.label, levelingFeetEnabled(params) ? `4 independent ${formatLength(getParam(params, "levelingFootPadDiameter"), unit)} pads` : "4 fixed wood contacts");
    case "cornerPlates":
      return auditItem(check.label, `2 × ${formatLength(longApronLength(params) * scale, unit)} long · 2 × ${formatLength(sideApronLength(params) * scale, unit)} short aprons · ${formatLength(getParam(params, "apronHeight"), unit)} high × ${formatLength(getParam(params, "apronThickness"), unit)} thick · ${formatLength(getParam(params, "apronOuterBottomRoundoverRadius"), unit)} outer-only bottom roundover · ${diagonalBracesEnabled(params) ? `4 calculated-angle diagonal blocks (${getVinnyTableFabricationSpec(params).diagonalLongAngleDegrees.toFixed(1)}° / ${getVinnyTableFabricationSpec(params).diagonalSideAngleDegrees.toFixed(1)}°)` : "no diagonal blocks"}`);
    case "channelLayout":
      return auditItem(check.label, `3 × ${formatLength(stretcherLength(params) * scale, unit)} ${supportModeUsesChannels(params) ? `steel C-channels (${formatLength(getParam(params, "cChannelWidth"), unit)} × ${formatLength(getParam(params, "cChannelDepth"), unit)})` : "oak cross stretchers"} · ${formatLength(getParam(params, "stretcherSpacing"), unit)} outer spacing`);
    case "printEnvelope": {
      const length = getParam(params, "tableLength") / scale;
      const width = getParam(params, "tableWidth") / scale;
      const height = getParam(params, "overallHeight") / scale;
      return auditItem(check.label, `1:${scale}; ${length.toFixed(1)} × ${width.toFixed(1)} × ${height.toFixed(1)} mm`, length <= 256 && width <= 256 ? "pass" : "warn");
    }
    case "minimumMockFeature": {
      const candidates = [
        getParam(params, "flushGrooveDepth"),
        getParam(params, "legEdgeRadius"),
        getParam(params, "apronOuterBottomRoundoverRadius"),
        memberThickness(params) * scale,
        getParam(params, "levelingFootRodDiameter"),
        ...(supportModeUsesChannels(params)
          ? [getParam(params, "cChannelWallThickness")]
          : []),
      ].filter((value) => value > EPSILON);
      const feature = Math.min(...candidates) / scale;
      return auditItem(check.label, `${feature.toFixed(2)} mm`, feature >= 0.3 ? "pass" : "warn");
    }
    default:
      return auditItem(check.label, "Unsupported audit check", "warn");
  }
}

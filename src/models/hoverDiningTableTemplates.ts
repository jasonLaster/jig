import * as THREE from "three";
import { getParam } from "./shared";
import {
  getHoverDiningTableEndBoxFabricationProfiles,
  getHoverDiningTableSpec,
  getHoverDiningTableStileFabricationLayout,
  type HoverDiningTableFabricationProfile,
  type HoverDiningTableProfileCommand,
  type HoverDiningTableProfilePoint,
} from "./hoverDiningTable";
import type {
  HoverDiningTableModelDefinition,
  ModelParams,
} from "./types";

const EPSILON = 1e-5;

type TemplatePoint = {
  u: number;
  v: number;
};

type TemplateBoundary = {
  kind: HoverDiningTableTemplateKind;
  label: string;
  outer: TemplatePoint[];
  inner: TemplatePoint[];
};

export type HoverDiningTableTemplateKind =
  | "top-rail"
  | "bottom-rail"
  | "vertical-stile";

export type HoverDiningTableTemplateSegment = {
  template: HoverDiningTableTemplateKind;
  templateLabel: string;
  index: number;
  count: number;
  fileName: string;
  geometry: THREE.BufferGeometry;
  assemblyOffset: THREE.Vector3;
  jointStart: "none" | "female";
  jointEnd: "none" | "male";
  plateLength: number;
  thickness: number;
};

export type HoverDiningTableTemplateSummary = {
  thickness: number;
  plateLength: number;
  dovetailDepth: number;
  jointClearance: number;
  totalSegments: number;
  templates: Array<{
    kind: HoverDiningTableTemplateKind;
    label: string;
    finishedLength: number;
    finishedWidth: number;
    segmentCount: number;
  }>;
};

function cubicPoint(
  p0: THREE.Vector2,
  c1: THREE.Vector2,
  c2: THREE.Vector2,
  p3: THREE.Vector2,
  t: number,
) {
  const mt = 1 - t;
  return new THREE.Vector2(
    mt ** 3 * p0.x +
      3 * mt ** 2 * t * c1.x +
      3 * mt * t ** 2 * c2.x +
      t ** 3 * p3.x,
    mt ** 3 * p0.y +
      3 * mt ** 2 * t * c1.y +
      3 * mt * t ** 2 * c2.y +
      t ** 3 * p3.y,
  );
}

function appendCubic(
  target: THREE.Vector2[],
  p0: THREE.Vector2,
  c1: THREE.Vector2,
  c2: THREE.Vector2,
  p3: THREE.Vector2,
  segments: number,
) {
  if (target.length === 0) target.push(p0.clone());
  for (let index = 1; index <= segments; index += 1) {
    target.push(cubicPoint(p0, c1, c2, p3, index / segments));
  }
}

function appendLine(target: THREE.Vector2[], point: THREE.Vector2) {
  const previous = target[target.length - 1];
  if (!previous || previous.distanceToSquared(point) > EPSILON ** 2) {
    target.push(point.clone());
  }
}

function asBoundaryPoints(
  points: THREE.Vector2[],
  kind: HoverDiningTableTemplateKind,
  scale: number,
  stileLayout?: ReturnType<typeof getHoverDiningTableStileFabricationLayout>,
) {
  return points.map((point) => {
    if (kind !== "vertical-stile") {
      return {
        u: point.x / scale,
        v: (kind === "bottom-rail" ? -point.y : point.y) / scale,
      };
    }
    if (!stileLayout) {
      throw new Error("Vertical-stile template is missing its fabrication frame");
    }
    const relative = point.clone().sub(stileLayout.origin);
    return {
      u: relative.dot(stileLayout.lengthAxis) / scale,
      v: relative.dot(stileLayout.widthAxis) / scale,
    };
  });
}

function vectorFromProfilePoint(point: HoverDiningTableProfilePoint) {
  return new THREE.Vector2(point.x, point.y);
}

function sampleProfilePath(
  start: HoverDiningTableProfilePoint,
  commands: HoverDiningTableProfileCommand[],
  curveSegments: number,
) {
  const points = [vectorFromProfilePoint(start)];
  let current = points[0];
  for (const command of commands) {
    if (command.kind === "line") {
      current = vectorFromProfilePoint(command.to);
      appendLine(points, current);
    } else if (command.kind === "cubic") {
      const end = vectorFromProfilePoint(command.to);
      appendCubic(
        points,
        current,
        vectorFromProfilePoint(command.control1),
        vectorFromProfilePoint(command.control2),
        end,
        curveSegments,
      );
      current = end;
    } else if (command.kind === "arc") {
      let sweep = command.endAngle - command.startAngle;
      if (command.clockwise && sweep > 0) sweep -= Math.PI * 2;
      if (!command.clockwise && sweep < 0) sweep += Math.PI * 2;
      for (let index = 1; index <= curveSegments; index += 1) {
        const angle = command.startAngle + sweep * (index / curveSegments);
        points.push(
          new THREE.Vector2(
            command.center.x + Math.cos(angle) * command.radius,
            command.center.y + Math.sin(angle) * command.radius,
          ),
        );
      }
      current = vectorFromProfilePoint(command.to);
    } else {
      throw new Error("Routing-template path contains an unexpected command");
    }
  }
  return points;
}

function boundaryFromFabricationProfile(
  profile: HoverDiningTableFabricationProfile,
  kind: HoverDiningTableTemplateKind,
  scale: number,
  curveSegments: number,
): TemplateBoundary {
  const outline = profile.outline;
  const move = outline[0];
  const close = outline[outline.length - 1];
  const seamIndex = outline.findIndex(
    (command, index) =>
      index > 0 &&
      (command.kind === "line" ||
        command.kind === "cubic" ||
        command.kind === "arc") &&
      command.edgeTreatment === "square",
  );
  if (
    move?.kind !== "move" ||
    close?.kind !== "close" ||
    seamIndex <= 1
  ) {
    throw new Error(`${kind} template requires a closed two-seam part profile`);
  }
  const seam = outline[seamIndex];
  if (seam.kind === "close" || seam.kind === "move") {
    throw new Error(`${kind} template has an invalid tangent seam`);
  }
  const stileLayout =
    kind === "vertical-stile"
      ? getHoverDiningTableStileFabricationLayout(profile)
      : undefined;

  const outer = asBoundaryPoints(
    sampleProfilePath(
      move.to,
      outline.slice(1, seamIndex),
      curveSegments,
    ),
    kind,
    scale,
    stileLayout,
  );
  const inner = asBoundaryPoints(
    sampleProfilePath(
      seam.to,
      outline.slice(seamIndex + 1, -1),
      curveSegments,
    ).reverse(),
    kind,
    scale,
    stileLayout,
  );
  for (const [label, points] of [
    ["outer", outer],
    ["inner", inner],
  ] as const) {
    if (
      points.length < 2 ||
      points.some((point) => !Number.isFinite(point.u) || !Number.isFinite(point.v)) ||
      points[0].u > points[points.length - 1].u + EPSILON
    ) {
      throw new Error(`${kind} ${label} boundary has an invalid direction`);
    }
  }
  return {
    kind,
    label:
      kind === "top-rail"
        ? "Top rail routing template"
        : kind === "bottom-rail"
          ? "Bottom rail routing template"
          : "Vertical stile routing template",
    outer,
    inner,
  };
}

function buildTemplateBoundaries(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
  scale: number,
): TemplateBoundary[] {
  const curveSegments = Math.max(12, model.geometry.curveSegments * 3);
  const profiles = getHoverDiningTableEndBoxFabricationProfiles(params);
  const { fullSize: spec } = getHoverDiningTableSpec(params);

  return [
    boundaryFromFabricationProfile(
      profiles.top,
      "top-rail",
      scale,
      curveSegments,
    ),
    ...(spec.endFrameStyle === "box"
      ? [
          boundaryFromFabricationProfile(
            profiles.bottom,
            "bottom-rail",
            scale,
            curveSegments,
          ),
        ]
      : []),
    boundaryFromFabricationProfile(
      profiles.right,
      "vertical-stile",
      scale,
      curveSegments,
    ),
  ];
}

function boundaryValue(points: TemplatePoint[], u: number) {
  if (u <= points[0].u + EPSILON) return points[0].v;
  if (u >= points[points.length - 1].u - EPSILON) {
    return points[points.length - 1].v;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const lower = Math.min(start.u, end.u);
    const upper = Math.max(start.u, end.u);
    if (u >= lower - EPSILON && u <= upper + EPSILON) {
      const span = end.u - start.u;
      if (Math.abs(span) <= EPSILON) return (start.v + end.v) / 2;
      const t = (u - start.u) / span;
      return start.v + (end.v - start.v) * t;
    }
  }
  throw new Error("Unable to sample routing-template boundary");
}

function sliceBoundary(
  points: TemplatePoint[],
  start: number,
  end: number,
  includeNaturalStart: boolean,
  includeNaturalEnd: boolean,
) {
  const result: TemplatePoint[] = [];
  if (includeNaturalStart) {
    result.push(points[0]);
  } else {
    result.push({ u: start, v: boundaryValue(points, start) });
  }
  for (const point of points) {
    if (point.u > start + EPSILON && point.u < end - EPSILON) {
      result.push(point);
    }
  }
  if (includeNaturalEnd) {
    result.push(points[points.length - 1]);
  } else {
    result.push({ u: end, v: boundaryValue(points, end) });
  }
  return result;
}

function seamProfile(
  u: number,
  outerV: number,
  innerV: number,
  depth: number,
  clearance: number,
) {
  const span = outerV - innerV;
  if (span <= clearance * 6 + EPSILON) {
    throw new Error("Dovetail seam does not fit inside the routing-template width");
  }
  const center = (outerV + innerV) / 2;
  const headWidth = Math.min(span * 0.58 + clearance * 2, span - clearance * 4);
  const neckWidth = Math.min(span * 0.34 + clearance * 2, headWidth - clearance * 2);
  return [
    { u, v: outerV },
    { u, v: center + neckWidth / 2 },
    { u: u + depth + clearance, v: center + headWidth / 2 },
    { u: u + depth + clearance, v: center - headWidth / 2 },
    { u, v: center - neckWidth / 2 },
    { u, v: innerV },
  ];
}

function polygonArea(points: THREE.Vector2[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function cleanPolygon(points: THREE.Vector2[]) {
  const cleaned: THREE.Vector2[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.distanceToSquared(point) > EPSILON ** 2) {
      cleaned.push(point);
    }
  }
  if (
    cleaned.length > 2 &&
    cleaned[0].distanceToSquared(cleaned[cleaned.length - 1]) <= EPSILON ** 2
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3 || Math.abs(polygonArea(cleaned)) <= EPSILON) {
    throw new Error("Routing-template segment collapsed to a degenerate polygon");
  }
  return polygonArea(cleaned) < 0 ? cleaned.reverse() : cleaned;
}

function createSegmentGeometry(
  boundary: TemplateBoundary,
  index: number,
  count: number,
  seams: number[],
  thickness: number,
  dovetailDepth: number,
  clearance: number,
) {
  const first = index === 0;
  const last = index === count - 1;
  const start = first
    ? Math.min(boundary.outer[0].u, boundary.inner[0].u)
    : seams[index - 1];
  const end = last
    ? Math.max(
        boundary.outer[boundary.outer.length - 1].u,
        boundary.inner[boundary.inner.length - 1].u,
      )
    : seams[index];
  const outer = sliceBoundary(boundary.outer, start, end, first, last);
  const inner = sliceBoundary(boundary.inner, start, end, first, last);
  const points: TemplatePoint[] = [...outer];

  if (last) {
    points.push(inner[inner.length - 1]);
  } else {
    points.push(
      ...seamProfile(
        end,
        outer[outer.length - 1].v,
        inner[inner.length - 1].v,
        dovetailDepth,
        0,
      ).slice(1),
    );
  }

  const reversedInner = inner.slice().reverse();
  if (
    points[points.length - 1].u === reversedInner[0].u &&
    points[points.length - 1].v === reversedInner[0].v
  ) {
    reversedInner.shift();
  }
  points.push(...reversedInner);

  if (!first) {
    const female = seamProfile(
      start,
      outer[0].v,
      inner[0].v,
      dovetailDepth,
      clearance,
    ).reverse();
    points.push(...female.slice(1));
  }

  const polygon = cleanPolygon(
    points.map((point) => new THREE.Vector2(point.u, point.v)),
  );
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].y);
  polygon.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: thickness,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const originalBounds = geometry.boundingBox;
  if (!originalBounds) throw new Error("Unable to bound routing-template segment");
  const assemblyOffset = originalBounds.min.clone();
  geometry.translate(-originalBounds.min.x, -originalBounds.min.y, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, assemblyOffset };
}

function templateEnvelope(boundary: TemplateBoundary) {
  const all = [...boundary.outer, ...boundary.inner];
  const minU = Math.min(...all.map((point) => point.u));
  const maxU = Math.max(...all.map((point) => point.u));
  const minV = Math.min(...all.map((point) => point.v));
  const maxV = Math.max(...all.map((point) => point.v));
  return {
    minU,
    maxU,
    length: maxU - minU,
    width: maxV - minV,
    overlapStart: Math.max(
      Math.min(...boundary.outer.map((point) => point.u)),
      Math.min(...boundary.inner.map((point) => point.u)),
    ),
    overlapEnd: Math.min(
      Math.max(...boundary.outer.map((point) => point.u)),
      Math.max(...boundary.inner.map((point) => point.u)),
    ),
  };
}

function buildSegments(
  boundary: TemplateBoundary,
  filePrefix: string,
  thickness: number,
  plateLength: number,
  dovetailDepth: number,
  clearance: number,
) {
  const envelope = templateEnvelope(boundary);
  const usableSpan = plateLength - dovetailDepth - clearance;
  const count = Math.max(2, Math.ceil(envelope.length / usableSpan));
  const nominalSpan = envelope.length / count;
  const seams = Array.from(
    { length: count - 1 },
    (_, index) => envelope.minU + nominalSpan * (index + 1),
  );
  if (
    seams[0] <= envelope.overlapStart + EPSILON ||
    seams[seams.length - 1] >= envelope.overlapEnd - EPSILON
  ) {
    throw new Error(
      `${boundary.label} cannot place all dovetails on the shared inner/outer profile`,
    );
  }

  return Array.from({ length: count }, (_, index) => {
    const { geometry, assemblyOffset } = createSegmentGeometry(
      boundary,
      index,
      count,
      seams,
      thickness,
      dovetailDepth,
      clearance,
    );
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error("Unable to audit routing-template segment bounds");
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x > plateLength + EPSILON || size.y > plateLength + EPSILON) {
      geometry.dispose();
      throw new Error(
        `${boundary.label} part ${index + 1} exceeds the usable square plate span`,
      );
    }
    if (Math.abs(size.z - thickness) > EPSILON) {
      geometry.dispose();
      throw new Error(`${boundary.label} part ${index + 1} lost template thickness`);
    }
    const position = geometry.getAttribute("position");
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      if (
        !Number.isFinite(position.getX(vertex)) ||
        !Number.isFinite(position.getY(vertex)) ||
        !Number.isFinite(position.getZ(vertex))
      ) {
        geometry.dispose();
        throw new Error(`${boundary.label} contains a non-finite STL vertex`);
      }
    }
    return {
      template: boundary.kind,
      templateLabel: boundary.label,
      index,
      count,
      fileName: `${filePrefix}-${boundary.kind}-template-part-${String(index + 1).padStart(2, "0")}-of-${String(count).padStart(2, "0")}.stl`,
      geometry,
      assemblyOffset,
      jointStart: index === 0 ? "none" : "female",
      jointEnd: index === count - 1 ? "none" : "male",
      plateLength,
      thickness,
    } satisfies HoverDiningTableTemplateSegment;
  });
}

function getTemplateParameters(params: ModelParams, scale: number) {
  const thickness = getParam(params, "templateThickness") / scale;
  const plateLength = getParam(params, "templatePlateLength") / scale;
  const dovetailDepth = getParam(params, "templateDovetailDepth") / scale;
  const jointClearance = getParam(params, "templateJointClearance") / scale;
  for (const [label, value] of [
    ["Template thickness", thickness],
    ["Usable printer plate span", plateLength],
    ["Template dovetail depth", dovetailDepth],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be finite and positive`);
    }
  }
  if (!Number.isFinite(jointClearance) || jointClearance < 0) {
    throw new Error("Template dovetail clearance must be finite and non-negative");
  }
  if (plateLength <= dovetailDepth * 4 + jointClearance) {
    throw new Error("Usable printer plate span must leave room around each dovetail");
  }
  if (jointClearance >= dovetailDepth / 3) {
    throw new Error("Template dovetail clearance is too large for the joint depth");
  }
  return { thickness, plateLength, dovetailDepth, jointClearance };
}

export function createHoverDiningTableTemplateSegments(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
  scale = 1,
) {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Routing-template scale must be finite and positive");
  }
  const boundaries = buildTemplateBoundaries(params, model, scale);
  const { thickness, plateLength, dovetailDepth, jointClearance } =
    getTemplateParameters(params, scale);
  const segments = boundaries.flatMap((boundary) =>
    buildSegments(
      boundary,
      model.export.filePrefix,
      thickness,
      plateLength,
      dovetailDepth,
      jointClearance,
    ),
  );
  for (const { kind } of boundaries) {
    const family = segments.filter((segment) => segment.template === kind);
    if (family.length < 2) {
      segments.forEach((segment) => segment.geometry.dispose());
      throw new Error(`${kind} template must export as multiple printable plates`);
    }
    family.forEach((segment, index) => {
      if (
        segment.jointStart !== (index === 0 ? "none" : "female") ||
        segment.jointEnd !== (index === family.length - 1 ? "none" : "male")
      ) {
        segments.forEach((entry) => entry.geometry.dispose());
        throw new Error(`${kind} template dovetail sequence is not complementary`);
      }
    });
  }
  return segments;
}

export function getHoverDiningTableTemplateSummary(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
): HoverDiningTableTemplateSummary {
  const boundaries = buildTemplateBoundaries(params, model, 1);
  const { thickness, plateLength, dovetailDepth, jointClearance } =
    getTemplateParameters(params, 1);
  const segments = boundaries.flatMap((boundary) =>
    buildSegments(
      boundary,
      model.export.filePrefix,
      thickness,
      plateLength,
      dovetailDepth,
      jointClearance,
    ),
  );
  const templates = boundaries.map((boundary) => {
    const envelope = templateEnvelope(boundary);
    return {
      kind: boundary.kind,
      label: boundary.label,
      finishedLength: envelope.length,
      finishedWidth: envelope.width,
      segmentCount: segments.filter(
        (segment) => segment.template === boundary.kind,
      ).length,
    };
  });
  segments.forEach((segment) => segment.geometry.dispose());
  return {
    thickness,
    plateLength,
    dovetailDepth,
    jointClearance,
    totalSegments: templates.reduce(
      (total, template) => total + template.segmentCount,
      0,
    ),
    templates,
  };
}

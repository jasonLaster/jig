import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getParameter, getParam } from "./shared";
import { formatLength } from "../units";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDefinition,
  ModelParams,
} from "./types";

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const clamp = THREE.MathUtils.clamp;
const letterStroke = (w: number, h: number) =>
  Math.min(w * 0.36, h * 0.24, (h - 4 * 3.175 - 2 * 1.27) / 3);
const fit = (low: number, high: number, safe: (n: number) => boolean) => {
  if (safe(high)) return high;
  for (let i = 0; i < 36; i++) {
    const middle = (low + high) / 2;
    if (safe(middle)) low = middle;
    else high = middle;
  }
  return low;
};
export type StoolPart = {
  name: string;
  material: "Sycamore" | "Cherry" | "Blue wood";
  geometry: THREE.BufferGeometry;
};

export function getLeeStoolSpec(p: ModelParams) {
  const length = getParam(p, "length"),
    width = getParam(p, "width");
  const thickness = getParam(p, "topThickness"),
    legHeight = getParam(p, "legHeight");
  const legDiameter = getParam(p, "legDiameter");
  const cornerRadius = Math.min(
    getParam(p, "cornerRadius"),
    Math.min(length, width) / 4,
  );
  const edgeRoundover = Math.min(
    getParam(p, "edgeRoundover"),
    thickness / 4,
    cornerRadius / 2,
  );
  const legClearance = getParam(p, "legClearance");
  const minInset = cornerRadius + legDiameter / 2 + legClearance + 2;
  let legInset = clamp(
    getParam(p, "legInset"),
    minInset,
    Math.min(length, width) / 4,
  );
  const clearance = getParam(p, "letterClearance"),
    requestedFingerRadius = getParam(p, "fingerRadius");
  const letterDepth = Math.min(
    getParam(p, "letterDepth"),
    thickness - Math.max(6.35, edgeRoundover + 1),
  );
  const requestedPocketRoundover = Math.min(
    p.pocketRoundover ?? 1.5875,
    letterDepth * 0.4,
    requestedFingerRadius * 0.18,
  );
  // Reserve the mouth's full envelope while fitting the letters; the small
  // allowance also covers the faceted semicircle's parallel offset.
  const envelopeClearance = clearance + requestedPocketRoundover * 1.01;
  const minWidth = 31.75,
    minHeight = 38.1,
    minGap = Math.max(6.35, 2 * envelopeClearance + 1.27);
  const wellRadius = (w: number, h: number) =>
    Math.min(
      requestedFingerRadius,
      (w / 2 - letterStroke(w, h) * 0.45 - 1) / Math.sqrt(1.4),
    );
  const letterMargin = Math.min(
    getParam(p, "letterMargin"),
    (length - 3 * minWidth - 2 * minGap - 2 * envelopeClearance) / 2,
    (width - minHeight - 2 * requestedFingerRadius - 2 * envelopeClearance) / 2,
  );
  const holeWebRadius = legDiameter / 2 + legClearance + 3.175;
  legInset = fit(minInset, legInset, (inset) => {
    const dx = Math.max(
      0,
      length / 2 - inset - (1.5 * minWidth + minGap + envelopeClearance),
    );
    const dy = Math.max(
      0,
      width / 2 -
        inset -
        (minHeight / 2 + wellRadius(minWidth, minHeight) + envelopeClearance),
    );
    return Math.hypot(dx, dy) >= holeWebRadius;
  });
  const centerX = length / 2 - legInset,
    centerY = width / 2 - legInset;
  const layoutSafe = (w: number, h: number, gap: number) => {
    const dx = Math.max(0, centerX - (1.5 * w + gap + envelopeClearance));
    const dy = Math.max(
      0,
      centerY - (h / 2 + wellRadius(w, h) + envelopeClearance),
    );
    return Math.hypot(dx, dy) >= holeWebRadius;
  };
  const gapLimit =
    (length - 2 * letterMargin - 3 * minWidth - 2 * envelopeClearance) / 2;
  const letterGap = fit(
    minGap,
    Math.max(minGap, Math.min(getParam(p, "letterGap"), gapLimit)),
    (gap) => layoutSafe(minWidth, minHeight, gap),
  );
  const widthLimit =
    (length - 2 * letterMargin - 2 * letterGap - 2 * envelopeClearance) / 3;
  const letterWidth = fit(
    minWidth,
    Math.min(getParam(p, "letterWidth"), widthLimit),
    (w) => layoutSafe(w, minHeight, letterGap),
  );
  const heightLimit =
    width -
    2 * letterMargin -
    2 * requestedFingerRadius -
    2 * envelopeClearance;
  const letterHeight = fit(
    minHeight,
    Math.min(getParam(p, "letterHeight"), heightLimit),
    (h) => layoutSafe(letterWidth, h, letterGap),
  );
  const stroke = letterStroke(letterWidth, letterHeight);
  const fingerRadius = wellRadius(letterWidth, letterHeight);
  const letterRoundover = Math.min(
    p.letterRoundover ?? 1.5875,
    letterDepth * 0.4,
    stroke * 0.2,
  );
  const notch = (letterHeight - 3 * stroke) / 2 - 2 * clearance;
  const pocketRoundover = Math.min(
    requestedPocketRoundover,
    stroke * 0.2,
    notch * 0.2,
    fingerRadius * 0.18,
  );
  const overallHeight = thickness + legHeight;
  const xs = [-letterWidth - letterGap, 0, letterWidth + letterGap];
  return {
    length,
    width,
    thickness,
    legHeight,
    legDiameter,
    legInset,
    legClearance,
    cornerRadius,
    edgeRoundover,
    clearance,
    fingerRadius,
    letterGap,
    letterMargin,
    letterHeight,
    letterWidth,
    letterDepth,
    letterRoundover: letterRoundover < 0.05 ? 0 : letterRoundover,
    pocketRoundover: pocketRoundover < 0.05 ? 0 : pocketRoundover,
    minGap,
    overallHeight,
    xs,
    floorZ: overallHeight - letterDepth,
    floorThickness: thickness - letterDepth,
  };
}

export function normalizeLeeStoolParams(p: ModelParams) {
  const s = getLeeStoolSpec(p);
  return {
    ...p,
    legInset: s.legInset,
    edgeRoundover: s.edgeRoundover,
    cornerRadius: s.cornerRadius,
    letterWidth: s.letterWidth,
    letterMargin: s.letterMargin,
    letterHeight: s.letterHeight,
    letterGap: s.letterGap,
    letterDepth: s.letterDepth,
    letterRoundover: s.letterRoundover,
    pocketRoundover: s.pocketRoundover,
    fingerRadius: s.fingerRadius,
  };
}

export function getLeeStoolParameterLimits(
  model: ModelDefinition,
  p: ModelParams,
  key: string,
) {
  const limits = { ...getParameter(model, key).limits };
  const s = getLeeStoolSpec(p);
  if (key === "letterDepth")
    limits.max = Math.min(
      limits.max,
      s.thickness - Math.max(6.35, s.edgeRoundover + 1),
    );
  if (key === "edgeRoundover")
    limits.max = Math.min(limits.max, s.thickness / 4, s.cornerRadius / 2);
  if (key === "legInset") {
    limits.min = Math.max(
      limits.min,
      s.cornerRadius + s.legDiameter / 2 + s.legClearance + 2,
    );
    limits.max = Math.min(limits.max, Math.min(s.length, s.width) / 4);
  }
  if (key === "letterGap") limits.min = Math.max(limits.min, s.minGap);
  if (
    [
      "letterHeight",
      "letterWidth",
      "letterGap",
      "letterMargin",
      "letterRoundover",
      "pocketRoundover",
      "fingerRadius",
      "legInset",
    ].includes(key)
  ) {
    const fitted = getLeeStoolSpec({ ...p, [key]: limits.max });
    limits.max = Math.min(
      limits.max,
      fitted[
        key as
          | "letterHeight"
          | "letterWidth"
          | "letterGap"
          | "letterMargin"
          | "letterRoundover"
          | "pocketRoundover"
          | "fingerRadius"
          | "legInset"
      ],
    );
  }
  return limits;
}

// Rounded orthogonal outlines preserve the same vertices for pockets, inserts and templates.
function roundedPolygon(points: THREE.Vector2[], radius: number) {
  const result: THREE.Vector2[] = [];
  points.forEach((b, i) => {
    const a = points[(i + points.length - 1) % points.length],
      c = points[(i + 1) % points.length];
    const r = Math.min(radius, a.distanceTo(b) * 0.49, c.distanceTo(b) * 0.49);
    const start = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(r));
    const end = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(r));
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      result.push(
        start
          .clone()
          .multiplyScalar((1 - t) ** 2)
          .add(b.clone().multiplyScalar(2 * t * (1 - t)))
          .add(end.clone().multiplyScalar(t * t)),
      );
    }
  });
  return result;
}
function offsetOrthogonal(points: THREE.Vector2[], offset: number) {
  return points.map((b, i) => {
    const prev = b
      .clone()
      .sub(points[(i + points.length - 1) % points.length])
      .normalize();
    const next = points[(i + 1) % points.length].clone().sub(b).normalize();
    return b
      .clone()
      .add(V(prev.y + next.y, -prev.x - next.x).multiplyScalar(offset));
  });
}
export function getLeeLetterContour(
  p: ModelParams,
  index: number,
  pocket = false,
) {
  const s = getLeeStoolSpec(p),
    w = s.letterWidth,
    h = s.letterHeight;
  // Simple sans-serif strokes with soft corners and a shorter middle E arm.
  // Keep the E's inner notches open even at the maximum 3.175 mm fit
  // clearance and minimum letter height. Inserts retain the same outline
  // when only clearance changes.
  const stroke = letterStroke(w, h);
  const raw = (
    index === 0
      ? [
          [0, 0],
          [w, 0],
          [w, stroke],
          [stroke, stroke],
          [stroke, h],
          [0, h],
        ]
      : [
          [0, 0],
          [w, 0],
          [w, stroke],
          [stroke, stroke],
          [stroke, (h - stroke) / 2],
          [w * 0.82, (h - stroke) / 2],
          [w * 0.82, (h + stroke) / 2],
          [stroke, (h + stroke) / 2],
          [stroke, h - stroke],
          [w, h - stroke],
          [w, h],
          [0, h],
        ]
  ).map(([x, y]) => V(x, y));
  const contour = roundedPolygon(
    offsetOrthogonal(raw, pocket ? s.clearance : 0),
    stroke * 0.45,
  );
  if (pocket) {
    // Bottom edge runs from the first rounded corner to the next; splice a semicircle into that straight segment.
    const x = w * 0.5,
      y = -s.clearance,
      r = s.fingerRadius;
    // A circular well with tangent entry fillets avoids sharp reentrant corners
    // when the mouth is offset for its roundover. The central radius remains r.
    const blend = r * 0.2,
      halfOpening = Math.sqrt(r * r + 2 * r * blend);
    const angle = Math.atan2(blend, halfOpening);
    const arc: THREE.Vector2[] = [];
    const appendArc = (
      cx: number,
      cy: number,
      radius: number,
      a: number,
      b: number,
      steps: number,
    ) => {
      for (let j = 0; j <= steps; j++) {
        if (arc.length && j === 0) continue;
        const theta = a + ((b - a) * j) / steps;
        arc.push(
          V(cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)),
        );
      }
    };
    appendArc(x - halfOpening, y - blend, blend, Math.PI / 2, angle, 8);
    appendArc(x, y, r, Math.PI + angle, 2 * Math.PI - angle, 24);
    appendArc(
      x + halfOpening,
      y - blend,
      blend,
      Math.PI - angle,
      Math.PI / 2,
      8,
    );
    contour.splice(11, 0, ...arc);
  }
  return contour.map((v) => v.add(V(s.xs[index] - w / 2, -h / 2)));
}
function offsetContour(points: THREE.Vector2[], distance: number) {
  if (distance === 0) return points.map((v) => v.clone());
  return points.map((v, i) => {
    const incoming = v
      .clone()
      .sub(points[(i + points.length - 1) % points.length])
      .normalize();
    const outgoing = points[(i + 1) % points.length].clone().sub(v).normalize();
    const n0 = V(incoming.y, -incoming.x),
      n1 = V(outgoing.y, -outgoing.x);
    return v.clone().add(
      n0
        .clone()
        .add(n1)
        .multiplyScalar(distance / (1 + n0.dot(n1))),
    );
  });
}
export function getLeePocketMouthContour(p: ModelParams, index: number) {
  return offsetContour(
    getLeeLetterContour(p, index, true),
    getLeeStoolSpec(p).pocketRoundover,
  );
}
export function getLeeLetterFaceContour(p: ModelParams, index: number) {
  return offsetContour(
    getLeeLetterContour(p, index),
    -getLeeStoolSpec(p).letterRoundover,
  );
}
function circle(x: number, y: number, radius: number) {
  return Array.from({ length: 64 }, (_, i) =>
    V(
      x + radius * Math.cos((i * Math.PI) / 32),
      y + radius * Math.sin((i * Math.PI) / 32),
    ),
  );
}
function outer(p: ModelParams, inset = 0) {
  const s = getLeeStoolSpec(p),
    r = s.cornerRadius - inset,
    x = s.length / 2 - s.cornerRadius,
    y = s.width / 2 - s.cornerRadius;
  const result: THREE.Vector2[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const cx = [x, -x, -x, x][corner],
      cy = [y, y, -y, -y][corner];
    for (let j = 0; j <= 12; j++) {
      const a = (corner * Math.PI) / 2 + (j * Math.PI) / 24;
      result.push(V(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  }
  return result;
}
function geometryFromPositions(positions: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3)
    uv.push(
      positions[i] / 180,
      (positions[i + 1] + positions[i + 2] * 0.4) / 60,
    );
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function cap(
  outline: THREE.Vector2[],
  holes: THREE.Vector2[][],
  z: number,
  up: boolean,
  positions: number[],
) {
  const vertices = [...outline, ...holes.flat()];
  const triangles = THREE.ShapeUtils.triangulateShape(
    outline.map((v) => v.clone()),
    holes.map((h) => h.map((v) => v.clone())),
  );
  for (const indices of triangles) {
    const [a, b, c] = indices.map((i) => vertices[i]);
    const positive = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
    const face = positive === up ? [a, b, c] : [a, c, b];
    face.forEach((v) => positions.push(v.x, v.y, z));
  }
}
function wall(
  bottom: THREE.Vector2[],
  top: THREE.Vector2[],
  z0: number,
  z1: number,
  positions: number[],
) {
  bottom.forEach((a, i) => {
    const n = (i + 1) % bottom.length,
      b = bottom[n],
      c = top[n],
      d = top[i];
    positions.push(
      a.x,
      a.y,
      z0,
      b.x,
      b.y,
      z0,
      c.x,
      c.y,
      z1,
      a.x,
      a.y,
      z0,
      c.x,
      c.y,
      z1,
      d.x,
      d.y,
      z1,
    );
  });
}
export function createLeeStoolTop(p: ModelParams) {
  const s = getLeeStoolSpec(p),
    positions: number[] = [];
  const legHoles = [-1, 1].flatMap((x) =>
    [-1, 1].map((y) =>
      circle(
        x * (s.length / 2 - s.legInset),
        y * (s.width / 2 - s.legInset),
        s.legDiameter / 2 + s.legClearance,
      ).reverse(),
    ),
  );
  const pockets = [0, 1, 2].map((i) => getLeeLetterContour(p, i, true));
  const edge = s.edgeRoundover;
  cap(outer(p, edge), legHoles, s.legHeight, false, positions);
  cap(
    outer(p, edge),
    [
      ...legHoles,
      ...pockets.map((c) => offsetContour(c, s.pocketRoundover).reverse()),
    ],
    s.overallHeight,
    true,
    positions,
  );
  legHoles.forEach((h) => wall(h, h, s.legHeight, s.overallHeight, positions));
  pockets.forEach((c) => {
    cap(c, [], s.floorZ, true, positions);
    const h = c.slice().reverse();
    wall(h, h, s.floorZ, s.overallHeight - s.pocketRoundover, positions);
    if (s.pocketRoundover > 0) {
      for (let j = 0; j < 8; j++) {
        const a = (j * Math.PI) / 16,
          b = ((j + 1) * Math.PI) / 16,
          r = s.pocketRoundover;
        wall(
          offsetContour(c, r * (1 - Math.cos(a))).reverse(),
          offsetContour(c, r * (1 - Math.cos(b))).reverse(),
          s.overallHeight - r + r * Math.sin(a),
          s.overallHeight - r + r * Math.sin(b),
          positions,
        );
      }
    }
  });
  // Outer-only quarter-rounds leave socket and letter dimensions untouched.
  for (let j = 0; j < 5; j++) {
    const a = (j * Math.PI) / 10,
      b = ((j + 1) * Math.PI) / 10;
    wall(
      outer(p, edge * (1 - Math.sin(a))),
      outer(p, edge * (1 - Math.sin(b))),
      s.legHeight + edge * (1 - Math.cos(a)),
      s.legHeight + edge * (1 - Math.cos(b)),
      positions,
    );
    wall(
      outer(p, edge * (1 - Math.cos(a))),
      outer(p, edge * (1 - Math.cos(b))),
      s.overallHeight - edge + edge * Math.sin(a),
      s.overallHeight - edge + edge * Math.sin(b),
      positions,
    );
  }
  wall(
    outer(p),
    outer(p),
    s.legHeight + edge,
    s.overallHeight - edge,
    positions,
  );
  return geometryFromPositions(positions);
}
export function createLeeStoolParts(p: ModelParams): StoolPart[] {
  const s = getLeeStoolSpec(p);
  const parts: StoolPart[] = [
    { name: "top", material: "Sycamore", geometry: createLeeStoolTop(p) },
  ];
  [-1, 1].forEach((x) =>
    [-1, 1].forEach((y) => {
      const positions: number[] = [];
      const c = circle(
        x * (s.length / 2 - s.legInset),
        y * (s.width / 2 - s.legInset),
        s.legDiameter / 2,
      );
      cap(c, [], 0, false, positions);
      cap(c, [], s.overallHeight, true, positions);
      wall(c, c, 0, s.overallHeight, positions);
      const geometry = geometryFromPositions(positions);
      const normal = geometry.getAttribute("normal"),
        position = geometry.getAttribute("position");
      for (let i = 0; i < normal.count; i++) {
        if (Math.abs(normal.getZ(i)) < 0.5) {
          normal.setXYZ(
            i,
            (position.getX(i) - c[0].x + s.legDiameter / 2) /
              (s.legDiameter / 2),
            (position.getY(i) - c[0].y) / (s.legDiameter / 2),
            0,
          );
        }
      }
      parts.push({ name: `leg-${parts.length}`, material: "Cherry", geometry });
    }),
  );
  [0, 1, 2].forEach((i) => {
    const c = getLeeLetterContour(p, i),
      positions: number[] = [];
    cap(c, [], s.floorZ, false, positions);
    cap(getLeeLetterFaceContour(p, i), [], s.overallHeight, true, positions);
    wall(c, c, s.floorZ, s.overallHeight - s.letterRoundover, positions);
    if (s.letterRoundover > 0) {
      for (let j = 0; j < 8; j++) {
        const a = (j * Math.PI) / 16,
          b = ((j + 1) * Math.PI) / 16,
          r = s.letterRoundover;
        wall(
          offsetContour(c, -r * (1 - Math.cos(a))),
          offsetContour(c, -r * (1 - Math.cos(b))),
          s.overallHeight - r + r * Math.sin(a),
          s.overallHeight - r + r * Math.sin(b),
          positions,
        );
      }
    }
    parts.push({
      name: `letter-${i === 0 ? "L" : "E"}-${i + 1}`,
      material: "Blue wood",
      geometry: geometryFromPositions(positions),
    });
  });
  return parts;
}
export function createLeeStoolGeometry(p: ModelParams, exploded = false) {
  const parts = createLeeStoolParts(p),
    s = getLeeStoolSpec(p);
  if (exploded)
    parts.forEach((part, i) => {
      if (i === 0) part.geometry.translate(0, 0, 35);
      else if (i >= 5) part.geometry.translate(0, 0, 85);
      else {
        part.geometry.computeBoundingBox();
        const center = part.geometry.boundingBox!.getCenter(
          new THREE.Vector3(),
        );
        part.geometry.translate(
          Math.sign(center.x) * 12,
          Math.sign(center.y) * 12,
          0,
        );
      }
    });
  const g = mergeGeometries(
    parts.map((part) => part.geometry),
    true,
  )!;
  g.groups.forEach((group, i) => {
    group.materialIndex = i === 0 ? 0 : i < 5 ? 1 : 2;
  });
  g.userData = {
    partCount: 8,
    floorThickness: s.floorThickness,
    letterWidth: s.letterWidth,
    letterMargin: s.letterMargin,
    letterHeight: s.letterHeight,
  };
  parts.forEach((part) => part.geometry.dispose());
  g.computeBoundingBox();
  return g;
}
export function getLeeStoolDimensions(p: ModelParams) {
  const s = getLeeStoolSpec(p);
  return { length: s.length, width: s.width, height: s.overallHeight };
}
export function getLeeStoolAuditValue(
  check: AuditCheckDefinition,
  p: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const s = getLeeStoolSpec(p),
    f = (n: number) => formatLength(n, unit);
  const values: Record<string, string> = {
    envelope: `${f(s.length)} × ${f(s.width)} × ${f(s.overallHeight)}`,
    pockets: `${f(s.letterDepth)} deep · ${f(s.floorThickness)} floor`,
    legs: `4 × ${f(s.legDiameter)} diameter · ${f(s.overallHeight)} blank length`,
    letters: `L + E + E · ${f(s.letterHeight)} tall · ${f(s.clearance)} clearance per side`,
    parts: "8 separate solids · sycamore top, 4 cherry legs, 3 blue letters",
  };
  return {
    label: check.label,
    value:
      values[check.key] ?? "Source dimensions with editable inferred details",
    status: "pass",
  };
}
export function createLeeStoolTemplate(p: ModelParams) {
  const s = getLeeStoolSpec(p),
    path = (c: THREE.Vector2[]) =>
      `M ${c.map((v) => `${(v.x + s.length / 2).toFixed(3)},${(s.width / 2 - v.y).toFixed(3)}`).join(" L ")} Z`;
  const mouths = [0, 1, 2].map((i) => getLeePocketMouthContour(p, i));
  const paths = [
    outer(p),
    ...[0, 1, 2].map((i) => getLeeLetterContour(p, i, true)),
  ];
  const sockets = [-1, 1]
    .flatMap((x) =>
      [-1, 1].map(
        (y) =>
          `<circle cx="${s.length / 2 + x * (s.length / 2 - s.legInset)}" cy="${s.width / 2 - y * (s.width / 2 - s.legInset)}" r="${s.legDiameter / 2 + s.legClearance}"/>`,
      ),
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.length}mm" height="${s.width}mm" viewBox="0 0 ${s.length} ${s.width}"><title>Lee step stool — full-size top and pocket layout; print at 100%</title><g fill="none" stroke="black" stroke-width="0.2">${paths.map((c) => `<path d="${path(c)}"/>`).join("")}${sockets}</g><g fill="none" stroke="#b56a18" stroke-dasharray="2 1" stroke-width="0.15">${mouths.map((c) => `<path d="${path(c)}"/>`).join("")}</g><g fill="none" stroke="#245b87" stroke-width="0.15">${[0, 1, 2].map((i) => `<path d="${path(getLeeLetterContour(p, i))}"/>`).join("")}</g></svg>`;
}

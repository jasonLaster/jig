import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { Mesh, Group, Raycaster, Vector3 } from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const model = JSON.parse(
  fs.readFileSync(
    process.argv[2] ??
      path.join(root, "public/models/lee-step-stool/model.json"),
    "utf8",
  ),
);
const temporary = fs.mkdtempSync(path.join(root, "node_modules/.lee-audit-"));
let module;
try {
  for (const [name, source] of [
    ["leeStepStool", "src/models/leeStepStool.ts"],
    ["shared", "src/models/shared.ts"],
    ["units", "src/units.ts"],
  ]) {
    let js = ts.transpileModule(
      fs.readFileSync(path.join(root, source), "utf8"),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
        },
      },
    ).outputText;
    js = js
      .replaceAll('"./shared"', '"./shared.mjs"')
      .replaceAll('"../units"', '"./units.mjs"');
    fs.writeFileSync(path.join(temporary, `${name}.mjs`), js);
  }
  module = await import(
    pathToFileURL(path.join(temporary, "leeStepStool.mjs"))
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
const defaults = Object.fromEntries(
  model.parameters.map((p) => [p.key, p.default]),
);
// The release defaults reproduce the user's supplied inch URL exactly.
const selectedInches = {
  length: 13,
  width: 9,
  topThickness: 1.5,
  legHeight: 6.25,
  legDiameter: 1.25,
  legInset: 1.3952,
  cornerRadius: 0.5,
  edgeRoundover: 0.2398,
  letterHeight: 3.25,
  letterMargin: 1.5,
  letterWidth: 2,
  letterGap: 1,
  letterDepth: 0.75,
  letterClearance: 0.0379,
  legClearance: 0.0197,
  fingerRadius: 0.375,
  letterRoundover: 0.0625,
  pocketRoundover: 0.0625,
};
for (const [key, inches] of Object.entries(selectedInches)) {
  assert.ok(
    Math.abs(defaults[key] - inches * 25.4) < 1e-6,
    `${key}: selected default`,
  );
  assert.ok(
    Math.abs(module.normalizeLeeStoolParams(defaults)[key] - defaults[key]) <
      1e-6,
    `${key}: default remains unchanged by constraints`,
  );
}
assert.equal(
  model.parameters.find((p) => p.key === "letterClearance").limits.max,
  3.175,
);
assert.equal(
  model.parameters.find((p) => p.key === "legClearance").limits.max,
  1.5875,
);
function verifyGeometry(g, label) {
  const pos = g.getAttribute("position"),
    edges = new Map();
  let volume = 0;
  const key = (i) =>
    [pos.getX(i), pos.getY(i), pos.getZ(i)]
      .map((n) => {
        assert.ok(Number.isFinite(n), label);
        return Math.round(n * 10000);
      })
      .join(",");
  for (let i = 0; i < pos.count; i += 3) {
    const keys = [key(i), key(i + 1), key(i + 2)];
    assert.equal(new Set(keys).size, 3, `${label}: degenerate face`);
    for (let j = 0; j < 3; j++) {
      const a = keys[j],
        b = keys[(j + 1) % 3],
        k = [a, b].sort().join("|");
      const entry = edges.get(k) ?? { count: 0, balance: 0 };
      entry.count++;
      entry.balance += a < b ? 1 : -1;
      edges.set(k, entry);
    }
    const ax = pos.getX(i),
      ay = pos.getY(i),
      az = pos.getZ(i),
      bx = pos.getX(i + 1),
      by = pos.getY(i + 1),
      bz = pos.getZ(i + 1),
      cx = pos.getX(i + 2),
      cy = pos.getY(i + 2),
      cz = pos.getZ(i + 2);
    volume +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;
  }
  for (const [key, e] of edges) {
    assert.equal(e.count, 2, `${label}: open/nonmanifold edge ${key}`);
    assert.equal(e.balance, 0, `${label}: inconsistent winding ${key}`);
  }
  assert.ok(volume > 0, `${label}: positive enclosed volume`);
  return volume;
}
const cases = [
  defaults,
  {
    ...defaults,
    letterClearance: 3.175,
    legClearance: 1.5875,
    letterGap: 6.35,
  },
  ...[127, 152.4].flatMap((legHeight) =>
    [38.1, 50.8].map((legDiameter) => ({
      ...defaults,
      legHeight,
      legDiameter,
    })),
  ),
];
for (const p of model.parameters)
  for (const value of [p.limits.min, p.limits.max])
    cases.push({ ...defaults, [p.key]: value });
for (const high of [false, true])
  cases.push(
    Object.fromEntries(
      model.parameters.map((p) => [p.key, high ? p.limits.max : p.limits.min]),
    ),
  );
// Mix enlarged legs and inset/spacing extremes on the smallest supported top.
cases.push({
  ...Object.fromEntries(model.parameters.map((p) => [p.key, p.limits.max])),
  length: 279.4,
  width: 215.9,
});
let seed = 20261010;
for (let sample = 0; sample < 64; sample++)
  cases.push(
    Object.fromEntries(
      model.parameters.map((parameter) => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return [
          parameter.key,
          parameter.limits.min +
            ((parameter.limits.max - parameter.limits.min) * seed) / 0xffffffff,
        ];
      }),
    ),
  );
for (const [caseIndex, p] of cases.entries()) {
  const s = module.getLeeStoolSpec(p),
    parts = module.createLeeStoolParts(p);
  const upper = module.createLeeStoolUpperLamination(p);
  verifyGeometry(upper, `case ${caseIndex} CNC upper lamination`);
  upper.computeBoundingBox();
  const box = upper.boundingBox;
  assert.ok(Math.abs(box.min.z) < 1e-6, "CNC stock bottom at Z=0");
  assert.ok(
    Math.abs(box.max.z - s.thickness / 2) < 1e-4,
    "CNC stock is half thickness",
  );
  assert.ok(Math.abs(box.max.x - box.min.x - s.length) < 1e-4);
  assert.ok(Math.abs(box.max.y - box.min.y - s.width) < 1e-4);
  const upperMesh = new Mesh(upper);
  const ray = new Raycaster(
    new Vector3(s.xs[0] - s.letterWidth / 2 + 3, 0, s.thickness),
    new Vector3(0, 0, -1),
  );
  const pocketHits = ray.intersectObject(upperMesh);
  const laminate = module.getLeeStoolLaminationSpec(p);
  assert.equal(
    pocketHits.length,
    laminate.throughPockets ? 0 : 1,
    "CNC layer has through cuts or an actual blind floor",
  );
  if (pocketHits.length)
    assert.ok(
      Math.abs(pocketHits[0].point.z - (laminate.thickness - s.letterDepth)) <
        1e-4,
    );
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      ray.set(
        new Vector3(
          x * (s.length / 2 - s.legInset),
          y * (s.width / 2 - s.legInset),
          s.thickness,
        ),
        new Vector3(0, 0, -1),
      );
      const legSiteHits = ray.intersectObject(upperMesh);
      assert.equal(
        legSiteHits.length,
        1,
        "CNC layer retains stock at each future leg socket",
      );
      assert.ok(
        Math.abs(legSiteHits[0].point.z - laminate.thickness) < 1e-4,
        "future socket has a solid top face",
      );
    }
  upper.dispose();
  assert.equal(parts.length, 8);
  assert.ok(s.floorThickness >= 6.35 - 1e-6);
  const topVolume = verifyGeometry(parts[0].geometry, `case ${caseIndex} top`);
  assert.ok(
    topVolume < s.length * s.width * s.thickness,
    "pockets and sockets remove real top material",
  );
  for (const [i, part] of parts.entries()) {
    if (i > 0) verifyGeometry(part.geometry, `case ${caseIndex} ${part.name}`);
    part.geometry.dispose();
  }
  const letters = [0, 1, 2].map((i) => module.getLeePocketMouthContour(p, i));
  for (let index = 0; index < 3; index++) {
    for (const contour of [
      letters[index],
      module.getLeeLetterFaceContour(p, index),
    ]) {
      const cross = (a, b, c) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i],
          b = contour[(i + 1) % contour.length];
        for (let j = i + 2; j < contour.length; j++) {
          if (i === 0 && j === contour.length - 1) continue;
          const c = contour[j],
            d = contour[(j + 1) % contour.length];
          assert.ok(
            !(
              cross(a, b, c) * cross(a, b, d) < -1e-10 &&
              cross(c, d, a) * cross(c, d, b) < -1e-10
            ),
            `case ${caseIndex}: self-intersecting face/mouth`,
          );
        }
      }
    }
  }
  assert.ok(s.letterDepth - Math.max(s.letterRoundover, s.pocketRoundover) > 0);
  const fitted = module.normalizeLeeStoolParams(p);
  for (const [key, value] of Object.entries(fitted)) {
    assert.ok(
      Math.abs(module.normalizeLeeStoolParams(fitted)[key] - value) < 1e-6,
      `case ${caseIndex}: idempotent ${key}`,
    );
  }
  const bounds = letters.map((c) => ({
    minX: Math.min(...c.map((v) => v.x)),
    maxX: Math.max(...c.map((v) => v.x)),
    minY: Math.min(...c.map((v) => v.y)),
    maxY: Math.max(...c.map((v) => v.y)),
  }));
  bounds.forEach((b, i) => {
    assert.ok(b.minX > -s.length / 2 + s.edgeRoundover);
    assert.ok(b.maxX < s.length / 2 - s.edgeRoundover);
    assert.ok(b.minY > -s.width / 2 + s.edgeRoundover);
    assert.ok(b.maxY < s.width / 2 - s.edgeRoundover);
    if (i > 0) assert.ok(b.minX > bounds[i - 1].maxX);
  });
  for (const b of bounds) {
    assert.ok(b.minX >= -s.length / 2 + s.letterMargin - 1e-6);
    assert.ok(b.maxX <= s.length / 2 - s.letterMargin + 1e-6);
    assert.ok(b.minY >= -s.width / 2 + s.letterMargin - 1e-6);
    assert.ok(b.maxY <= s.width / 2 - s.letterMargin + 1e-6);
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        const cx = x * (s.length / 2 - s.legInset),
          cy = y * (s.width / 2 - s.legInset);
        const dx = Math.max(b.minX - cx, 0, cx - b.maxX),
          dy = Math.max(b.minY - cy, 0, cy - b.maxY);
        assert.ok(
          Math.hypot(dx, dy) >=
            s.legDiameter / 2 + s.legClearance + 3.175 - 1e-6,
          "letter pockets leave positive wood between corner sockets",
        );
      }
  }
}
// Roundovers remove actual solid material while preserving the straight-wall fit.
for (const [key, index] of [
  ["letterRoundover", 5],
  ["pocketRoundover", 0],
]) {
  const square = { ...defaults, [key]: 0 };
  const rounded = { ...defaults, [key]: 1.5875 };
  const squareParts = module.createLeeStoolParts(square);
  const roundedParts = module.createLeeStoolParts(rounded);
  assert.ok(
    verifyGeometry(roundedParts[index].geometry, key) <
      verifyGeometry(squareParts[index].geometry, key),
    `${key}: removes material`,
  );
  for (let letter = 0; letter < 3; letter++) {
    assert.deepEqual(
      module.getLeeLetterContour(square, letter),
      module.getLeeLetterContour(rounded, letter),
    );
    assert.deepEqual(
      module.getLeeLetterContour(square, letter, true),
      module.getLeeLetterContour(rounded, letter, true),
    );
  }
  [...squareParts, ...roundedParts].forEach((part) => part.geometry.dispose());
}

{
  const parts = module.createLeeStoolParts(defaults),
    group = new Group();
  parts.forEach((part) => group.add(new Mesh(part.geometry)));
  const bytes = new STLExporter().parse(group, { binary: true });
  const output = path.join(
    root,
    "public/models/lee-step-stool/lee-step-stool.stl",
  );
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (process.argv.includes("--write-stl")) fs.writeFileSync(output, buffer);
  assert.ok(
    fs.readFileSync(output).equals(buffer),
    "registered default STL matches the shared procedural geometry",
  );
  parts.forEach((part) => part.geometry.dispose());
}
{
  const geometry = module.createLeeStoolUpperLamination(defaults);
  const bytes = new STLExporter().parse(new Mesh(geometry), { binary: true });
  const output = path.join(
    root,
    "public/models/lee-step-stool/lee-step-stool-top-upper-lamination-cnc.stl",
  );
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (process.argv.includes("--write-stl")) fs.writeFileSync(output, buffer);
  assert.ok(
    fs.readFileSync(output).equals(buffer),
    "default CNC STL matches the upper-lamination geometry",
  );
  geometry.dispose();
}
const stlPath = path.join(
  root,
  "public/models/lee-step-stool/lee-step-stool.stl",
);
assert.ok(fs.existsSync(stlPath), "registered default STL exists");
console.log(
  `Lee Step Stool: ${cases.length} dimension/fit cases, eight closed assembly solids plus a closed CNC upper lamination each, selected defaults and pocket/socket separation passed.`,
);

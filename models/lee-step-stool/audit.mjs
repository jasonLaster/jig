import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { Mesh, Group } from "three";
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
assert.equal(defaults.length, 317.5);
assert.equal(defaults.width, 241.3);
assert.equal(defaults.topThickness, 38.1);
assert.equal(defaults.legHeight, 190.5);
assert.equal(defaults.legDiameter, 25.4);
assert.equal(defaults.letterDepth, 25.4);
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
const cases = [defaults];
for (const p of model.parameters)
  for (const value of [p.limits.min, p.limits.max])
    cases.push({ ...defaults, [p.key]: value });
for (const high of [false, true])
  cases.push(
    Object.fromEntries(
      model.parameters.map((p) => [p.key, high ? p.limits.max : p.limits.min]),
    ),
  );
for (const [caseIndex, p] of cases.entries()) {
  const s = module.getLeeStoolSpec(p),
    parts = module.createLeeStoolParts(p);
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
  const letters = [0, 1, 2].map((i) => module.getLeeLetterContour(p, i, true));
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
  for (const b of bounds)
    assert.ok(
      b.minX >
        -s.length / 2 + s.legInset + s.legDiameter / 2 + s.legClearance &&
        b.maxX < s.length / 2 - s.legInset - s.legDiameter / 2 - s.legClearance,
      "letters clear sockets",
    );
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
const stlPath = path.join(
  root,
  "public/models/lee-step-stool/lee-step-stool.stl",
);
assert.ok(fs.existsSync(stlPath), "registered default STL exists");
console.log(
  `Lee Step Stool: ${cases.length} dimension/fit cases, eight closed solids each, source dimensions and pocket/socket separation passed.`,
);

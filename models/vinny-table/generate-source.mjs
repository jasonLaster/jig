import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Mesh } from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/vinny-table/model.json");
const outputPath = path.join(root, "public/models/vinny-table/vinny-table.stl");
const bundlePath = path.join(os.tmpdir(), `vinny-table-${process.pid}-${Date.now()}.mjs`);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(model.parameters.map((parameter) => [parameter.key, parameter.default]));

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/vinnyTable.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createVinnyTableWoodGeometry } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const geometry = createVinnyTableWoodGeometry(params);
  const result = new STLExporter().parse(new Mesh(geometry), { binary: true });
  fs.writeFileSync(outputPath, Buffer.from(result.buffer, result.byteOffset, result.byteLength));
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}

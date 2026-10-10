import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import {
  createLeeStoolParts,
  createLeeStoolTemplate,
  getLeeStoolSpec,
} from "../models/leeStepStool";
import { formatLength } from "../units";
import type { LengthUnit, ModelParams } from "../models/types";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LeeStoolFabrication({
  params,
  unit,
  exploded,
  onExplodedChange,
}: {
  params: ModelParams;
  unit: LengthUnit;
  exploded: boolean;
  onExplodedChange: (value: boolean) => void;
}) {
  const s = getLeeStoolSpec(params),
    f = (n: number) => formatLength(n, unit);
  const exportPart = (index: number) => {
    const parts = createLeeStoolParts(params),
      part = parts[index];
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    part.geometry.translate(-center.x, -center.y, -bounds.min.z);
    const bytes = new STLExporter().parse(new THREE.Mesh(part.geometry), {
      binary: true,
    });
    download(
      new Blob([bytes], { type: "model/stl" }),
      `lee-step-stool-${part.name}.stl`,
    );
    parts.forEach((p) => p.geometry.dispose());
  };
  return (
    <section className="panel-section assembly-panel-section lee-stool-fabrication">
      <h2>Assembly & fabrication</h2>
      <button
        className="secondary-button"
        type="button"
        aria-pressed={exploded}
        onClick={() => onExplodedChange(!exploded)}
      >
        {exploded ? "Assemble stool" : "Lift letters & separate legs"}
      </button>
      <p className="assembly-mode-note">
        Sycamore top · cherry through legs · removable blue LEE letters.
      </p>
      <dl className="lee-stool-cut-list">
        <dt>Top · 1</dt>
        <dd>
          {f(s.length)} × {f(s.width)} × {f(s.thickness)}
        </dd>
        <dt>Leg blanks · 4</dt>
        <dd>
          Ø {f(s.legDiameter)} × {f(s.overallHeight)}; {f(s.legHeight)} exposed
        </dd>
        <dt>Letters · 3</dt>
        <dd>
          {f(s.letterHeight)} tall × {f(s.letterWidth)} wide ×{" "}
          {f(s.letterDepth)} thick
        </dd>
        <dt>Pocket floor</dt>
        <dd>{f(s.floorThickness)} remaining</dd>
      </dl>
      <button
        className="secondary-button"
        type="button"
        onClick={() =>
          download(
            new Blob([createLeeStoolTemplate(params)], {
              type: "image/svg+xml",
            }),
            "lee-step-stool-layout.svg",
          )
        }
      >
        Download full-size layout SVG
      </button>
      <p className="assembly-mode-note">
        Print the layout at 100%. Fit clearances are per side; make a scrap fit
        test with your finish.
      </p>
      <div className="lee-stool-exports">
        {["Top", "Leg", "Letter L", "First E", "Second E"].map((label, i) => (
          <button
            className="secondary-button"
            type="button"
            key={label}
            onClick={() => exportPart([0, 1, 5, 6, 7][i])}
          >
            Export {label} STL
          </button>
        ))}
      </div>
      <p className="assembly-mode-note">
        Default: 12½″ × 9½″ top, 6″ leg clearance and 1½″ legs. Letter layout,
        roundovers and fit are inferred from the illustration. No load rating is
        established.
      </p>
    </section>
  );
}

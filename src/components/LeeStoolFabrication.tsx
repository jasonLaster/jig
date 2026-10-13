import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import {
  createLeeStoolParts,
  createLeeStoolUpperLamination,
  getLeeStoolLaminationSpec,
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
  const lamination = getLeeStoolLaminationSpec(params);
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
  const exportCncLamination = () => {
    const geometry = createLeeStoolUpperLamination(params);
    const bytes = new STLExporter().parse(new THREE.Mesh(geometry), {
      binary: true,
    });
    download(
      new Blob([bytes], { type: "model/stl" }),
      "lee-step-stool-top-upper-lamination-cnc.stl",
    );
    geometry.dispose();
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
        <dt>Upper edge radii</dt>
        <dd>
          Letter {f(s.letterRoundover)} · pocket rim {f(s.pocketRoundover)}
        </dd>
        <dt>Thumb access</dt>
        <dd>
          {f(2 * s.fingerRadius)} circular diameter · {f(s.fingerRadius)} well
          radius
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
        test with your finish. Black lines mark the straight pocket walls;
        dashed amber lines show the rounded mouths; blue lines mark the letters.
      </p>
      <div className="lee-stool-cnc-export">
        <h3>Upper lamination · CNC</h3>
        <p className="assembly-mode-note">
          {f(s.length)} × {f(s.width)} × {f(lamination.thickness)} stock.
          {lamination.throughPockets
            ? " Letter pockets and leg sockets cut through this layer."
            : ` Letter pockets are ${f(lamination.pocketDepth)} deep; leg sockets cut through.`}
          {lamination.lowerPocketDepth > 1e-6
            ? ` The lower layer also needs ${f(lamination.lowerPocketDepth)} of pocket depth beneath the letters.`
            : " The lower layer supplies the remaining pocket floor."}
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={exportCncLamination}
        >
          Export upper lamination CNC STL
        </button>
        <p className="assembly-mode-note">
          Includes top-edge and pocket-rim roundovers, a flat glue face, and the
          current fit clearances. Millimeter geometry with the bottom at Z = 0;
          choose stock setup and toolpaths in CAM. Cut matching leg sockets in
          the lower layer.
        </p>
      </div>
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
        Default: 13″ × 9″ top, 6¼″ leg clearance and 1¼″ legs. Letter layout,
        roundovers and fit are inferred from the illustration. No load rating is
        established.
      </p>
    </section>
  );
}

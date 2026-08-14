import { formatLength } from "../units";
import { getVinnyTableCutList } from "../models/vinnyTable";
import type { LengthUnit, ModelParams } from "../models";

export function VinnyTableCutList({
  params,
  unit,
}: {
  params: ModelParams;
  unit: LengthUnit;
}) {
  const parts = getVinnyTableCutList(params);
  const pieceCount = parts.reduce(
    (total, part) => total + part.quantity,
    0,
  );

  return (
    <section
      aria-label="Vinny Table fabrication cut list"
      className="hover-cut-sheet"
      data-testid="vinny-cut-list"
    >
      <div className="hover-cut-sheet-inner">
        <header className="hover-cut-sheet-header">
          <div>
            <p className="hover-cut-eyebrow">
              Fabrication sheet · dimensions follow the live model
            </p>
            <h2>Vinny Table cut list</h2>
          </div>
          <p>
            {pieceCount} fabrication pieces · full size · verify every part against the
            physical build before cutting
          </p>
        </header>

        <div className="hover-cut-table-wrap">
          <table className="hover-cut-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Material</th>
                <th>Qty</th>
                <th>Length</th>
                <th>Width</th>
                <th>Thickness</th>
                <th>Fabrication note</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr key={part.id}>
                  <th scope="row">
                    <span className="hover-cut-part-id">{part.id}</span>{" "}
                    {part.name}
                  </th>
                  <td>{part.material}</td>
                  <td>{part.quantity}</td>
                  <td>{formatLength(part.length, unit)}</td>
                  <td>{formatLength(part.width, unit)}</td>
                  <td>{formatLength(part.thickness, unit)}</td>
                  <td>{part.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="hover-cut-sheet-footer">
          <p>
            The advanced A1 quantity is eight profiled halves: pair and miter
            them into four continuous corner legs. C-channel stock and all
            joinery locations must be verified against the physical hardware,
            assembled frame, course, and builder-selected attachment method.
          </p>
        </footer>
      </div>
    </section>
  );
}

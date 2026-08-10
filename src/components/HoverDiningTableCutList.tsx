import {
  getHoverDiningTableCutList,
  type LengthUnit,
  type ModelParams,
} from "../models";
import type { HoverDiningTableCutPart } from "../models/hoverDiningTable";
import type { HoverDiningTableModelDefinition } from "../models/types";
import { formatLength } from "../units";
import { HoverCutPartPreview } from "./HoverCutPartPreview";

function formatAngle(value: number | undefined) {
  if (!value || Math.abs(value) < 0.05) return "square";
  return `${value.toFixed(1)}° from square`;
}

function formatProcessing(part: HoverDiningTableCutPart) {
  if (part.kind === "brace" && part.lap) {
    return `${formatAngle(part.cutAngleDegrees)} box-parallel ends · ${part.lap.face} half-lap`;
  }
  if (part.kind === "tabletop") {
    return "rounded plan corners · rounded end faces · Bézier-roll long edges";
  }
  if (part.kind === "channel") {
    return "flush underside mortise · U-channel web + flanges";
  }
  if (part.kind === "rail") {
    return part.fabricationProfile.cornerRadii
      ? "finished inner/outer circular radii · rounded face edges"
      : "finished inner/outer Bézier corners · rounded face edges";
  }
  if (part.kind === "stile") {
    return `${formatAngle(part.cutAngleDegrees)} tangent-seam profile · rounded face edges`;
  }
  if (part.kind === "support") {
    const endRadius = part.fabricationProfile.support?.endRadius ?? 0;
    const shoulderRadius = part.fabricationProfile.support?.shoulderRadius ?? 0;
    const bottomRadius = part.fabricationProfile.section.radius;
    const topRadius = part.fabricationProfile.section.topRadius ?? 0;
    const longEdges = topRadius > 0 && bottomRadius > 0
      ? "rounded top + bottom long edges"
      : topRadius > 0
        ? "rounded tabletop-facing top edges"
        : bottomRadius > 0
          ? "rounded bottom long edges"
          : "square long edges";
    return shoulderRadius > 0
      ? `circular upper-end returns · ${longEdges}`
      : endRadius > 0
      ? `rounded end-face perimeters · flat bearing centers · ${longEdges}`
      : `square box-parallel ends · ${longEdges}`;
  }
  return "finished profile";
}

function GrainArrow({
  markerId,
  layout,
  vertical,
}: {
  markerId: string;
  layout: SvgProfileLayout;
  vertical: boolean;
}) {
  if (vertical) {
    const x = (layout.left + layout.right) / 2;
    const centerY = (layout.top + layout.bottom) / 2;
    return (
      <g className="cut-part-grain">
        <line
          markerEnd={`url(#${markerId})`}
          x1={x}
          x2={x}
          y1={layout.bottom - 12}
          y2={layout.top + 12}
        />
        <text transform={`rotate(-90 ${x - 8} ${centerY})`} x={x - 8} y={centerY}>
          grain
        </text>
      </g>
    );
  }
  const y = (layout.top + layout.bottom) / 2;
  return (
    <g className="cut-part-grain">
      <line
        markerEnd={`url(#${markerId})`}
        x1={layout.left + (layout.right - layout.left) * 0.18}
        x2={layout.right - (layout.right - layout.left) * 0.18}
        y1={y}
        y2={y}
      />
      <text x={layout.left + (layout.right - layout.left) * 0.22} y={y - 7}>
        grain
      </text>
    </g>
  );
}

type SvgProfileLayout = {
  d: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  scale: number;
};

function layoutProfile(
  profile: HoverDiningTableCutPart["fabricationProfile"],
  frame: { x: number; y: number; width: number; height: number },
  section = false,
): SvgProfileLayout {
  const commands = section ? profile.section.outline : profile.outline;
  const rawBounds = section
    ? (() => {
        const points = commands.flatMap((command) => {
          if (command.kind === "close") return [];
          if (command.kind === "cubic") {
            return [command.control1, command.control2, command.to];
          }
          return [command.to];
        });
        return {
          minX: Math.min(...points.map((point) => point.x)),
          minY: Math.min(...points.map((point) => point.y)),
          maxX: Math.max(...points.map((point) => point.x)),
          maxY: Math.max(...points.map((point) => point.y)),
        };
      })()
    : profile.bounds;
  const spanX = Math.max(rawBounds.maxX - rawBounds.minX, 1e-6);
  const spanY = Math.max(rawBounds.maxY - rawBounds.minY, 1e-6);
  const scale = Math.min(frame.width / spanX, frame.height / spanY);
  const renderedWidth = spanX * scale;
  const renderedHeight = spanY * scale;
  const left = frame.x + (frame.width - renderedWidth) / 2;
  const top = frame.y + (frame.height - renderedHeight) / 2;
  const map = (point: { x: number; y: number }) => ({
    x: left + (point.x - rawBounds.minX) * scale,
    y: top + renderedHeight - (point.y - rawBounds.minY) * scale,
  });
  const d = commands.map((command) => {
    if (command.kind === "close") return "Z";
    if (command.kind === "cubic") {
      const control1 = map(command.control1);
      const control2 = map(command.control2);
      const to = map(command.to);
      return `C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${to.x} ${to.y}`;
    }
    if (command.kind === "arc") {
      const to = map(command.to);
      const renderedRadius = command.radius * scale;
      const sweep = command.clockwise ? 0 : 1;
      return `A ${renderedRadius} ${renderedRadius} 0 0 ${sweep} ${to.x} ${to.y}`;
    }
    const to = map(command.to);
    return `${command.kind === "move" ? "M" : "L"} ${to.x} ${to.y}`;
  }).join(" ");
  return {
    d,
    left,
    right: left + renderedWidth,
    top,
    bottom: top + renderedHeight,
    scale,
  };
}

function PartOutline({
  part,
  layout,
}: {
  part: HoverDiningTableCutPart;
  layout: SvgProfileLayout;
}) {
  return (
    <path
      className="cut-part-outline"
      data-profile-family={part.fabricationProfile.family}
      d={layout.d}
    />
  );
}

function PartSection({
  part,
  unit,
}: {
  part: HoverDiningTableCutPart;
  unit: LengthUnit;
}) {
  const section = layoutProfile(
    part.fabricationProfile,
    { x: 326, y: 35, width: 64, height: 56 },
    true,
  );
  const sectionMidY = (section.top + section.bottom) / 2;
  const pocketTop = part.lap?.face === "top";
  const clipId = `section-clip-${part.id}`;
  const isFrameMember =
    part.fabricationProfile.family === "frame-rail" ||
    part.fabricationProfile.family === "frame-stile";
  return (
    <g
      className="cut-part-section"
      data-section-kind={part.lap ? "half-lap" : "edge-treatment"}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={section.d} />
        </clipPath>
      </defs>
      <text x="358" y="25">
        {part.lap
          ? "Lap section"
          : part.kind === "channel"
            ? "U-channel section"
            : isFrameMember
              ? "Straight section"
            : "Edge section"}
      </text>
      <path d={section.d} />
      {part.lap ? (
        <>
          <rect
            className="cut-part-section-pocket"
            clipPath={`url(#${clipId})`}
            fill={`url(#lap-hatch-${part.id})`}
            height={(section.bottom - section.top) / 2}
            width={section.right - section.left}
            x={section.left}
            y={pocketTop ? section.top : sectionMidY}
          />
          <line
            className="cut-part-section-pocket-line"
            x1={section.left}
            x2={section.right}
            y1={sectionMidY}
            y2={sectionMidY}
          />
        </>
      ) : null}
      <line x1={section.left} x2={section.left - 10} y1={section.top} y2={section.top - 9} />
      {part.kind !== "channel" && sectionRadiusIsVisible(part) && !isFrameMember ? (
        <text x="318" y="105">
          {part.fabricationProfile.section.radius > 0
            ? `Bottom R ${formatLength(part.fabricationProfile.section.radius, unit)}`
            : ""}
          {part.fabricationProfile.section.radius > 0 &&
          (part.fabricationProfile.section.topRadius ?? 0) > 0
            ? " · "
            : ""}
          {(part.fabricationProfile.section.topRadius ?? 0) > 0
            ? `Top R ${formatLength(part.fabricationProfile.section.topRadius!, unit)}`
            : ""}
        </text>
      ) : null}
      <text x="358" y={isFrameMember ? "105" : "117"}>
        {sectionDimensionLabel(part, unit)}
      </text>
      <text x="358" y={isFrameMember ? "117" : "128"}>
        {isFrameMember
          ? `R ${formatLength(part.fabricationProfile.section.radius, unit)} face edges`
          : part.fabricationProfile.section.label}
      </text>
    </g>
  );
}

function ProfileFeatureLabels({
  part,
  unit,
}: {
  part: HoverDiningTableCutPart;
  unit: LengthUnit;
}) {
  const supportEndRadius = part.fabricationProfile.support?.endRadius ?? 0;
  const shoulderRadius = part.fabricationProfile.support?.shoulderRadius ?? 0;
  if (shoulderRadius > 0) {
    return (
      <g className="cut-part-feature-labels">
        <text x="45" y="29">
          Mirrored upper-end R {formatLength(shoulderRadius, unit)} · true circular
        </text>
      </g>
    );
  }
  if (supportEndRadius > 0) {
    return (
      <g className="cut-part-feature-labels">
        <text x="45" y="29">
          End perimeter R {formatLength(supportEndRadius, unit)} · flat bearing center
        </text>
      </g>
    );
  }
  const bezier = part.fabricationProfile.bezier;
  const radii = part.fabricationProfile.cornerRadii;
  if (!bezier && !radii) return null;
  return (
    <g className="cut-part-feature-labels">
      <text x="45" y="29">
        Outer R {formatLength((radii ?? bezier!).outerRadius, unit)}
        {bezier
          ? ` · κ rail ${bezier.outerRailTension.toFixed(3)} / stile ${bezier.outerStileTension.toFixed(3)}`
          : " · circular"}
      </text>
      <text x="45" y="124">
        Inner R {formatLength((radii ?? bezier!).innerRadius, unit)}
        {bezier
          ? ` · κ rail ${bezier.innerRailTension.toFixed(3)} / stile ${bezier.innerStileTension.toFixed(3)}`
          : " · circular"}
      </text>
    </g>
  );
}

function formatProcessDimension(
  process: NonNullable<HoverDiningTableCutPart["processDimensions"]>[number],
  unit: LengthUnit,
) {
  if (process.format === "ratio") return `κ ${process.value.toFixed(3)}`;
  return formatLength(process.value, unit);
}

function dimensionLabel(part: HoverDiningTableCutPart) {
  if (part.fabricationProfile.family === "frame-rail") return "routed profile envelope";
  if (part.fabricationProfile.family === "frame-stile") return "tangent-to-tangent";
  if (part.fabricationProfile.family === "brace") return "true member length";
  if (part.fabricationProfile.family === "support") return "finished member length";
  if (part.fabricationProfile.family === "channel") return "finished channel length";
  if (part.fabricationProfile.family === "leveling-foot") return "overall hardware height";
  return "finished plan";
}

function widthDimensionPrefix(part: HoverDiningTableCutPart) {
  if (part.fabricationProfile.family === "frame-rail") return "Envelope H";
  if ((part.fabricationProfile.support?.shoulderRadius ?? 0) > 0) return "H";
  return "W";
}

function thicknessLabel(part: HoverDiningTableCutPart) {
  if (
    part.fabricationProfile.family === "frame-rail" ||
    part.fabricationProfile.family === "frame-stile"
  ) {
    return "Frame depth";
  }
  if (part.fabricationProfile.family === "channel") return "Channel depth";
  if (part.fabricationProfile.family === "leveling-foot") return "Pad thickness";
  return "Thickness";
}

function sectionDimensionLabel(part: HoverDiningTableCutPart, unit: LengthUnit) {
  const section = part.fabricationProfile.section;
  if (part.fabricationProfile.family === "frame-rail") {
    return `H ${formatLength(section.width, unit)} × D ${formatLength(section.thickness, unit)}`;
  }
  if (part.fabricationProfile.family === "frame-stile") {
    return `W ${formatLength(section.width, unit)} × D ${formatLength(section.thickness, unit)}`;
  }
  return `W ${formatLength(section.width, unit)} × T ${formatLength(section.thickness, unit)}`;
}

function lapPolygon(
  part: HoverDiningTableCutPart,
  layout: SvgProfileLayout,
) {
  if (!part.lap) return "";
  const lapWidth = part.lap.length * layout.scale;
  const shoulderShift =
    part.width /
    Math.tan((part.lap.shoulderAngleDegrees * Math.PI) / 180) *
    layout.scale;
  const centerX = (layout.left + layout.right) / 2;
  return [
    `${centerX - lapWidth / 2 + shoulderShift / 2},${layout.top}`,
    `${centerX + lapWidth / 2 + shoulderShift / 2},${layout.top}`,
    `${centerX + lapWidth / 2 - shoulderShift / 2},${layout.bottom}`,
    `${centerX - lapWidth / 2 - shoulderShift / 2},${layout.bottom}`,
  ].join(" ");
}

function lengthDimensionY(layout: SvgProfileLayout) {
  return Math.max(145, layout.bottom + 28);
}

function widthDimensionX(layout: SvgProfileLayout) {
  return layout.right + 18;
}

function sectionRadiusIsVisible(part: HoverDiningTableCutPart) {
  return (
    part.fabricationProfile.section.radius > 0 ||
    (part.fabricationProfile.section.topRadius ?? 0) > 0
  );
}

function shouldShowProfileFeatureLabels(part: HoverDiningTableCutPart) {
  return Boolean(
      part.fabricationProfile.bezier ||
      part.fabricationProfile.cornerRadii ||
      (part.fabricationProfile.support?.shoulderRadius ?? 0) > 0 ||
      (part.fabricationProfile.support?.endRadius ?? 0) > 0,
  );
}

function shouldShowLap(part: HoverDiningTableCutPart) {
  return Boolean(part.lap);
}

function shouldShowSection(part: HoverDiningTableCutPart) {
  return part.fabricationProfile.family === "channel" || sectionRadiusIsVisible(part);
}

function profileLabel(part: HoverDiningTableCutPart) {
  switch (part.fabricationProfile.family) {
    case "frame-rail":
      return "true routed rail profile";
    case "frame-stile":
      return "true splayed stile profile";
    case "brace":
      return "mitered plan profile";
    case "support":
      return (part.fabricationProfile.support?.shoulderRadius ?? 0) > 0
        ? "circular upper-end side profile"
        : (part.fabricationProfile.support?.endRadius ?? 0) > 0
        ? "rounded-end member profile"
        : "square-ended member profile";
    case "channel":
      return "widthwise steel C-channel";
    case "leveling-foot":
      return "adjustable pad and threaded rod";
    default:
      return "square-ended plan profile";
  }
}

function HoverCutPartDiagram({
  model,
  params,
  part,
  unit,
}: {
  model: HoverDiningTableModelDefinition;
  params: ModelParams;
  part: HoverDiningTableCutPart;
  unit: LengthUnit;
}) {
  const arrowId = `cut-arrow-${part.id}`;
  const grainArrowId = `grain-arrow-${part.id}`;
  const isFrameRail = part.fabricationProfile.family === "frame-rail";
  const layout = layoutProfile(
    part.fabricationProfile,
    { x: 45, y: 38, width: isFrameRail ? 205 : 238, height: 82 },
  );
  const lengthY = lengthDimensionY(layout);
  const verticalDimensionX = widthDimensionX(layout);
  const verticalTextX = verticalDimensionX + 18;
  const lapCenterX = (layout.left + layout.right) / 2;
  const isStile = part.fabricationProfile.family === "frame-stile";
  const isShoulderedSupport =
    (part.fabricationProfile.support?.shoulderRadius ?? 0) > 0;
  const hasGrain = part.grainDirection !== "n/a";
  return (
    <article
      className="hover-cut-card"
      data-grain-axis={hasGrain ? (isStile ? "vertical" : "horizontal") : "none"}
      data-length-axis={isStile ? "vertical" : "horizontal"}
      data-part-id={part.id}
    >
      <header>
        <span className="hover-cut-part-id">{part.id}</span>
        <div>
          <h3>{part.name}</h3>
          <p>{part.assembly}</p>
        </div>
        <span className="hover-cut-quantity">Qty {part.quantity}</span>
      </header>
      <HoverCutPartPreview model={model} params={params} part={part} />
      <svg
        aria-label={`${part.name} dimensioned cut diagram`}
        className="hover-cut-diagram"
        role="img"
        viewBox="0 0 420 205"
      >
        <defs>
          <marker
            id={arrowId}
            markerHeight="6"
            markerWidth="6"
            orient="auto-start-reverse"
            refX="3"
            refY="3"
            viewBox="0 0 6 6"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" />
          </marker>
          <marker
            id={grainArrowId}
            markerHeight="5"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="2.5"
            viewBox="0 0 6 5"
          >
            <path d="M 0 0 L 6 2.5 L 0 5 z" />
          </marker>
          <pattern
            height="6"
            id={`lap-hatch-${part.id}`}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="6"
          >
            <line x1="0" x2="0" y1="0" y2="6" />
          </pattern>
        </defs>

        <PartOutline layout={layout} part={part} />
        {shouldShowProfileFeatureLabels(part) ? (
          <ProfileFeatureLabels part={part} unit={unit} />
        ) : null}
        {shouldShowLap(part) ? (
          <g className="cut-part-lap">
            <polygon
              fill={`url(#lap-hatch-${part.id})`}
              points={lapPolygon(part, layout)}
            />
            <text x={lapCenterX} y={layout.top - 16}>
              {part.lap!.face} half-lap · {part.lap!.shoulderAngleDegrees.toFixed(1)}°
            </text>
          </g>
        ) : null}
        {shouldShowSection(part) ? <PartSection part={part} unit={unit} /> : null}
        {hasGrain ? (
          <GrainArrow
            layout={layout}
            markerId={grainArrowId}
            vertical={part.fabricationProfile.family === "frame-stile"}
          />
        ) : null}

        <g className="cut-dimension-lines">
          <line x1={layout.left} x2={layout.left} y1={layout.bottom + 4} y2={lengthY + 8} />
          <line x1={layout.right} x2={layout.right} y1={layout.bottom + 4} y2={lengthY + 8} />
          <line
            markerEnd={`url(#${arrowId})`}
            markerStart={`url(#${arrowId})`}
            x1={layout.left + 3}
            x2={layout.right - 3}
            y1={lengthY}
            y2={lengthY}
          />
          <text x={(layout.left + layout.right) / 2} y={lengthY + 19}>
            {isStile ? "W" : "L"} {formatLength(isStile ? part.width : part.length, unit)}
          </text>
          <line x1={layout.right + 4} x2={verticalDimensionX + 7} y1={layout.top} y2={layout.top} />
          <line x1={layout.right + 4} x2={verticalDimensionX + 7} y1={layout.bottom} y2={layout.bottom} />
          <line
            markerEnd={`url(#${arrowId})`}
            markerStart={`url(#${arrowId})`}
            x1={verticalDimensionX}
            x2={verticalDimensionX}
            y1={layout.top + 3}
            y2={layout.bottom - 3}
          />
          <text
            transform={`rotate(-90 ${verticalTextX} ${(layout.top + layout.bottom) / 2})`}
            x={verticalTextX}
            y={(layout.top + layout.bottom) / 2}
          >
            {isStile ? "L" : widthDimensionPrefix(part)}{" "}
            {formatLength(
              isStile
                ? part.length
                : isShoulderedSupport
                  ? part.thickness
                  : part.width,
              unit,
            )}
          </text>
        </g>
        <g className="cut-part-view-label">
          <text x="45" y="192">{profileLabel(part)} · {dimensionLabel(part)}</text>
        </g>
      </svg>
      <dl className="hover-cut-card-data">
        <div>
          <dt>Material</dt>
          <dd>{part.material}</dd>
        </div>
        <div>
          <dt>{thicknessLabel(part)}</dt>
          <dd>{formatLength(part.thickness, unit)}</dd>
        </div>
        <div>
          <dt>End cut</dt>
          <dd>
            {(part.fabricationProfile.support?.shoulderRadius ?? 0) > 0
              ? `upper return R ${formatLength(part.fabricationProfile.support!.shoulderRadius, unit)}`
              : (part.fabricationProfile.support?.endRadius ?? 0) > 0
              ? `square core · perimeter R ${formatLength(part.fabricationProfile.support!.endRadius, unit)}`
              : formatAngle(part.cutAngleDegrees)}
          </dd>
        </div>
        {part.lap ? (
          <>
            <div>
              <dt>Lap width</dt>
              <dd>{formatLength(part.lap.length, unit)}</dd>
            </div>
            <div>
              <dt>Lap depth</dt>
              <dd>{formatLength(part.lap.depth, unit)}</dd>
            </div>
            <div>
              <dt>Shoulder angle</dt>
              <dd>{part.lap.shoulderAngleDegrees.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Lap center from end</dt>
              <dd>{formatLength(part.lap.centerFromEnd, unit)}</dd>
            </div>
            <div>
              <dt>Fit clearance</dt>
              <dd>{formatLength(part.lap.fitClearance, unit)}</dd>
            </div>
          </>
        ) : null}
        {part.processDimensions?.map((process) => (
          <div key={process.label}>
            <dt>{process.label}</dt>
            <dd>{formatProcessDimension(process, unit)}</dd>
          </div>
        ))}
      </dl>
      <ul className="hover-cut-card-notes">
        {part.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </article>
  );
}

export function HoverDiningTableCutList({
  model,
  params,
  unit,
}: {
  model: HoverDiningTableModelDefinition;
  params: ModelParams;
  unit: LengthUnit;
}) {
  const cutList = getHoverDiningTableCutList(params);
  const hasHalfLaps = cutList.parts.some((part) => part.lap);
  return (
    <section
      className="hover-cut-sheet"
      aria-label={`${model.name.replace(/ Dining Table$/, "")} full-size cut list`}
    >
      <div className="hover-cut-sheet-inner">
        <header className="hover-cut-sheet-header">
          <div>
            <p className="hover-cut-eyebrow">Fabrication sheet · revision follows model parameters</p>
            <h2>{model.name} Cut List</h2>
            <p>
              Full-size finished dimensions. Add rough-milling allowance for
              your stock and verify critical joinery on a full-size story stick.
            </p>
            <p>
              Profiled rails list the routed blank envelope separately from
              the straight rail section and front-to-back frame depth.
            </p>
            <p>
              Each interactive 3D view uses the exact exploded-model solid;
              rotate it freely or snap to a face to inspect cuts and borders.
            </p>
          </div>
          <dl>
            <div>
              <dt>Material</dt>
              <dd>{cutList.material}</dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{cutList.totalPieces}</dd>
            </div>
            <div>
              <dt>Schedule lines</dt>
              <dd>{cutList.parts.length}</dd>
            </div>
          </dl>
        </header>

        <div className="hover-cut-table-wrap">
          <table className="hover-cut-table">
            <caption>Grouped finished-part schedule</caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Part</th>
                <th>Material</th>
                <th>Qty</th>
                <th>Length</th>
                <th>Width / envelope</th>
                <th>Depth / thickness</th>
                <th>Processing</th>
              </tr>
            </thead>
            <tbody>
              {cutList.parts.map((part) => (
                <tr key={part.id}>
                  <td>{part.id}</td>
                  <th scope="row">{part.name}</th>
                  <td>{part.material}</td>
                  <td>{part.quantity}</td>
                  <td>{formatLength(part.length, unit)}</td>
                  <td>{formatLength(part.width, unit)}</td>
                  <td>{formatLength(part.thickness, unit)}</td>
                  <td>{formatProcessing(part)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hover-cut-card-grid">
          {cutList.parts.map((part) => (
            <HoverCutPartDiagram
              key={part.id}
              model={model}
              params={params}
              part={part}
              unit={unit}
            />
          ))}
        </div>

        <footer className="hover-cut-sheet-footer">
          {hasHalfLaps ? (
            <p>
              X-brace length is the true centerline length between the two
              parallel end-frame contact planes. Half-laps are centered at half
              the member length; A is relieved from the top and B from the bottom.
            </p>
          ) : (
            <p>
              Straight-support lengths run between the two parallel end-frame
              contact planes. Rounded lengthwise-rail ends retain flat central
              bearing faces; other straight supports keep square ends.
            </p>
          )}
          <p>
            Grain runs with every listed oak length; H1 is blackened steel and
            has no grain direction. The end-box curves are routed
            from the same constrained profiles used by the assembled and
            exploded models: B1/B2 carry the inner and outer
            {cutList.parts.some((part) => part.fabricationProfile.cornerRadii)
              ? " circular-radius returns"
              : " Bézier returns"},
            while B3 runs between their tangent seams. Section views preserve
            every listed edge treatment.
          </p>
        </footer>
      </div>
    </section>
  );
}

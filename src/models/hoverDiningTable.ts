import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength, formatSignedLength } from "../units";
import { getParam, getParameter } from "./shared";
import {
  assignDirectionalWoodUvs,
  collectWoodGrainParts,
} from "./woodGrainUvs";
import type {
  AuditCheckDefinition,
  AuditItem,
  HoverDiningTableModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-5;
const MIN_BRACE_SPAN = 101.6;
const MIN_FRAME_FACE_FLAT = 3.175;

type BracePlaneSpec = {
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  topEdgeRadius: number;
  spanX: number;
  spanY: number;
  endpointY: number;
  endpointOuterY: number;
  cornerTangentY: number;
  miterHalfWidth: number;
  diagonalLength: number;
  angleRadians: number;
  zBottom: number;
  zTop: number;
  halfLapDepth: number;
};

export type HoverDiningTableTopSupportStyle = "x" | "stretchers";
export type HoverDiningTableBottomSupportStyle = "x" | "center-board" | "none";
export type HoverDiningTableEndFrameStyle = "box" | "legs";

type StraightSupportSpec = {
  count: 1 | 2;
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  topEdgeRadius: number;
  endRadius: number;
  shoulderRadius: number;
  spanX: number;
  centerYs: number[];
  placementBoundaryY?: number;
  zBottom: number;
  zTop: number;
};

type CornerKneeBraceSpec = {
  enabled: boolean;
  count: 4;
  reach: number;
  width: number;
  thickness: number;
  edgeRadius: number;
  contactX: number;
  contactY: number;
  centerlineLength: number;
  longPointLength: number;
  angleRadians: number;
  zBottom: number;
  zTop: number;
};

type CChannelSpec = {
  count: 3;
  endClearance: number;
  sideInset: number;
  width: number;
  depth: number;
  wallThickness: number;
  length: number;
  centerXs: [number, number, number];
  zBottom: number;
  zTop: number;
};

type LevelingFeetSpec = {
  enabled: boolean;
  count: 4;
  padDiameter: number;
  padThickness: number;
  rodDiameter: number;
  rodLength: number;
  extension: number;
  exposedRodLength: number;
  embeddedRodLength: number;
  centerYs: [number, number];
  outerEntryClearance: number;
  stileClearance: number;
  depthClearance: number;
};

export type HoverDiningTableProfilePoint = {
  x: number;
  y: number;
};

export type HoverDiningTableProfileCommand =
  | { kind: "move"; to: HoverDiningTableProfilePoint }
  | {
      kind: "line";
      to: HoverDiningTableProfilePoint;
      edgeTreatment?: "roundover" | "square";
    }
  | {
      kind: "cubic";
      control1: HoverDiningTableProfilePoint;
      control2: HoverDiningTableProfilePoint;
      to: HoverDiningTableProfilePoint;
      edgeTreatment?: "roundover" | "square";
    }
  | {
      kind: "arc";
      center: HoverDiningTableProfilePoint;
      radius: number;
      startAngle: number;
      endAngle: number;
      clockwise: boolean;
      to: HoverDiningTableProfilePoint;
      edgeTreatment?: "roundover" | "square";
    }
  | { kind: "close"; edgeTreatment?: "roundover" | "square" };

export type HoverDiningTableFabricationProfile = {
  family:
    | "tabletop"
    | "frame-rail"
    | "frame-stile"
    | "brace"
    | "corner-brace"
    | "support"
    | "channel"
    | "leveling-foot";
  outline: HoverDiningTableProfileCommand[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  section: {
    width: number;
    thickness: number;
    radius: number;
    topRadius?: number;
    label: string;
    outline: HoverDiningTableProfileCommand[];
  };
  bezier?: {
    outerRadius: number;
    innerRadius: number;
    outerRailTension: number;
    outerStileTension: number;
    innerRailTension: number;
    innerStileTension: number;
  };
  cornerRadii?: {
    outerRadius: number;
    innerRadius: number;
  };
  support?: {
    endRadius: number;
    shoulderRadius: number;
  };
  tabletop?: {
    planCornerRadius: number;
    endFaceRoundover: number;
  };
};

export type HoverDiningTableSpec = {
  scale: number;
  length: number;
  width: number;
  height: number;
  topThickness: number;
  topBottom: number;
  frameBottomZ: number;
  topEdgeRoll: number;
  topEdgeTension: number;
  topPlanCornerRadius: number;
  topEndFaceRoundover: number;
  sideOverhang: number;
  endOverhang: number;
  endFrameStyle: HoverDiningTableEndFrameStyle;
  frameDepth: number;
  frameSideWidth: number;
  frameBottomRailHeight: number;
  frameTopRailHeight: number;
  frameBottomSpread: number;
  frameOuterTopCornerRadius: number;
  frameOuterBottomCornerRadius: number;
  frameInnerTopCornerRadius: number;
  frameInnerBottomCornerRadius: number;
  frameCornerStyle: "bezier" | "circular";
  frameOuterRailCurveTension: number;
  frameOuterStileCurveTension: number;
  frameInnerRailCurveTension: number;
  frameInnerStileCurveTension: number;
  frameEdgeRoundover: number;
  matchLengthwiseRailRoundover: boolean;
  halfLapClearance: number;
  frameHeight: number;
  frameTopWidth: number;
  frameBottomWidth: number;
  openingTopWidth: number;
  openingBottomWidth: number;
  openingHeight: number;
  openingBottom: number;
  openingTop: number;
  frameCenterX: number;
  braceSpanX: number;
  topSupportStyle: HoverDiningTableTopSupportStyle;
  bottomSupportStyle: HoverDiningTableBottomSupportStyle;
  upperBrace: BracePlaneSpec;
  lowerBrace: BracePlaneSpec;
  upperStretchers: StraightSupportSpec;
  cornerKneeBraces: CornerKneeBraceSpec;
  lowerCenterBoard: StraightSupportSpec;
  channels: CChannelSpec;
  levelingFeet: LevelingFeetSpec;
};

export type HoverDiningTableStructuralGrade = "A" | "B" | "C" | "D" | "F";

export type HoverDiningTableStructuralMetric = {
  key:
    | "longitudinal-racking"
    | "end-box-racking"
    | "torsion"
    | "tipping"
    | "floor-rocking"
    | "member-stiffness";
  label: string;
  score: number;
  grade: HoverDiningTableStructuralGrade;
  detail: string;
  calculation: {
    rationale: string;
    formula: string;
    inputs: Array<{
      key: string;
      label: string;
      value: number | string;
      format: "length" | "number" | "choice";
      precision?: number;
      suffix?: string;
    }>;
    rawScore: number;
    weight: number;
    scoringNote: string;
  };
};

export type HoverDiningTableStructuralAssessment = {
  overallScore: number;
  overallGrade: HoverDiningTableStructuralGrade;
  overallCalculation: {
    rationale: string;
    formula: string;
    scoringNote: string;
  };
  metrics: HoverDiningTableStructuralMetric[];
  heightSensitivity: {
    stepMm: number;
    lower: { heightMm: number; score: number; delta: number } | null;
    higher: { heightMm: number; score: number; delta: number } | null;
  };
  basis: "geometry-only screening";
};

function topSupportStyle(value: number): HoverDiningTableTopSupportStyle {
  return value >= 0.5 ? "stretchers" : "x";
}

function bottomSupportStyle(value: number): HoverDiningTableBottomSupportStyle {
  const option = Math.round(value);
  if (option >= 2) return "none";
  if (option >= 1) return "center-board";
  return "x";
}

function endFrameStyle(value: number): HoverDiningTableEndFrameStyle {
  return value >= 0.5 ? "legs" : "box";
}

function createBracePlaneSpec({
  width,
  thickness,
  endpointInset,
  edgeRadius,
  topEdgeRadius,
  spanX,
  openingWidth,
  innerCornerRadius,
  zBottom,
  zTop,
}: {
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  topEdgeRadius: number;
  spanX: number;
  openingWidth: number;
  innerCornerRadius: number;
  zBottom: number;
  zTop: number;
}): BracePlaneSpec {
  const cornerTangentY = openingWidth / 2 - innerCornerRadius;
  let endpointY = cornerTangentY - endpointInset - width / 2;
  let miterHalfWidth = width / 2;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const diagonalLength = Math.hypot(spanX, endpointY * 2);
    const directionX = spanX / diagonalLength;
    miterHalfWidth = width / (2 * directionX);
    endpointY = cornerTangentY - endpointInset - miterHalfWidth;
  }
  const spanY = endpointY * 2;
  return {
    width,
    thickness,
    endpointInset,
    edgeRadius,
    topEdgeRadius,
    spanX,
    spanY,
    endpointY,
    endpointOuterY: endpointY + miterHalfWidth,
    cornerTangentY,
    miterHalfWidth,
    diagonalLength: Math.hypot(spanX, spanY),
    angleRadians: Math.atan2(spanY, spanX),
    zBottom,
    zTop,
    halfLapDepth: thickness / 2,
  };
}

function rawHoverDiningTableSpec(params: ModelParams): HoverDiningTableSpec {
  const scale = getParam(params, "mockScale");
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const height = getParam(params, "overallHeight");
  const topThickness = getParam(params, "topThickness");
  const topBottom = height - topThickness;
  const levelingFeetEnabled = getParam(params, "levelingFeetEnabled") >= 0.5;
  const levelingFootPadDiameter = getParam(params, "levelingFootPadDiameter");
  const levelingFootPadThickness = getParam(params, "levelingFootPadThickness");
  const levelingFootRodDiameter = getParam(params, "levelingFootRodDiameter");
  const levelingFootRodLength = getParam(params, "levelingFootRodLength");
  const levelingFootExtension = levelingFeetEnabled
    ? getParam(params, "levelingFootExtension")
    : 0;
  const sideOverhang = getParam(params, "sideOverhang");
  const selectedEndFrameStyle = endFrameStyle(getParam(params, "endFrameStyle"));
  const selectedTopSupportStyle = topSupportStyle(
    getParam(params, "topSupportStyle"),
  );
  const selectedBottomSupportStyle = bottomSupportStyle(
    getParam(params, "bottomSupportStyle"),
  );
  const topSupportWidth = getParam(params, "topSupportWidth");
  const topSupportThickness = getParam(params, "topSupportThickness");
  const topSupportEndpointInset = getParam(params, "topSupportEndpointInset");
  const requestedTopSupportEdgeRadius = getParam(
    params,
    "topSupportEdgeRadius",
  );
  const topSupportShoulderRadius = Number.isFinite(
      params.topSupportShoulderRadius,
    )
    ? params.topSupportShoulderRadius
    : 0;
  const bottomSupportWidth = getParam(params, "bottomSupportWidth");
  const bottomSupportThickness = getParam(params, "bottomSupportThickness");
  const bottomSupportEndpointInset = getParam(
    params,
    "bottomSupportEndpointInset",
  );
  const bottomSupportEdgeRadius = getParam(params, "bottomSupportEdgeRadius");
  const bottomSupportTopEdgeRadius = getParam(
    params,
    "bottomSupportTopEdgeRadius",
  );
  const frameTopWidth = width - sideOverhang * 2;
  const frameBottomSpread = getParam(params, "frameBottomSpread");
  const frameBottomWidth = frameTopWidth + frameBottomSpread;
  // Keep the end-box side width as its own construction dimension. Supports
  // bear on the horizontal rails, so their plan width does not set the stile
  // width and must never resize it behind the user's back.
  const frameSideWidth = getParam(params, "frameSideWidth");
  const openingTopWidth = frameTopWidth - frameSideWidth * 2;
  const openingBottomWidth = frameBottomWidth - frameSideWidth * 2;
  const frameBottomRailHeight = getParam(params, "frameBottomRailHeight");
  const frameTopRailHeight = getParam(params, "frameTopRailHeight");
  const frameHeight = topBottom - levelingFootExtension;
  const openingBottom = selectedEndFrameStyle === "box"
    ? frameBottomRailHeight
    : 0;
  const openingTop = frameHeight - frameTopRailHeight;
  const frameDepth = getParam(params, "frameDepth");
  const frameEdgeRoundover = Math.min(
    getParam(params, "frameEdgeRoundover"),
    Math.min(
      frameDepth,
      frameSideWidth,
      frameTopRailHeight,
      ...(selectedEndFrameStyle === "box" ? [frameBottomRailHeight] : []),
    ) /
      2 -
      MIN_FRAME_FACE_FLAT / 2,
  );
  const matchLengthwiseRailRoundover =
    Number.isFinite(params.matchLengthwiseRailRoundover) &&
    params.matchLengthwiseRailRoundover >= 0.5;
  const topSupportEdgeRadius = matchLengthwiseRailRoundover
    ? frameEdgeRoundover
    : requestedTopSupportEdgeRadius;
  const hasLengthwiseRailRoundoverControls = Number.isFinite(
    params.matchLengthwiseRailRoundover,
  );
  const lengthwiseRailBottomRadius = hasLengthwiseRailRoundoverControls
    ? 0
    : topSupportEdgeRadius;
  const lengthwiseRailTopRadius = hasLengthwiseRailRoundoverControls
    ? topSupportEdgeRadius
    : 0;
  const lengthwiseRailEndRadius = hasLengthwiseRailRoundoverControls
    ? topSupportEdgeRadius
    : 0;
  const hasBezierFrameControls = [
    params.frameOuterRailCurveTension,
    params.frameOuterStileCurveTension,
    params.frameInnerRailCurveTension,
    params.frameInnerStileCurveTension,
  ].every(Number.isFinite);
  const frameCurveTension = (key: string) =>
    Number.isFinite(params[key]) ? params[key] : 0.5522847498;
  const endOverhang = getParam(params, "endOverhang");
  const braceSpanX = length - 2 * (endOverhang + frameDepth);
  const channelWidth = getParam(params, "channelWidth");
  const channelEndClearance = getParam(params, "channelEndClearance");
  const channelOuterCenterX =
    braceSpanX / 2 - channelEndClearance - channelWidth / 2;
  const frameInnerTopCornerRadius = getParam(
    params,
    "frameInnerTopCornerRadius",
  );
  const frameInnerBottomCornerRadius = getParam(
    params,
    "frameInnerBottomCornerRadius",
  );
  const upperPlacementBoundaryY = frameTopWidth / 2;
  const upperStretcherCenterY =
    upperPlacementBoundaryY - topSupportEndpointInset - topSupportWidth / 2;
  const cornerBraceReach = Number.isFinite(params.cornerBraceReach)
    ? params.cornerBraceReach
    : 0;
  const cornerBraceWidth = Math.min(topSupportWidth, frameDepth);
  const cornerBraceThickness = Math.min(
    topSupportThickness,
    frameTopRailHeight,
  );
  const cornerBraceContactY =
    Math.abs(upperStretcherCenterY) - topSupportWidth / 2;
  const cornerBraceEnabled =
    cornerBraceReach > EPSILON &&
    selectedEndFrameStyle === "legs" &&
    selectedTopSupportStyle === "stretchers";
  const levelingFootCenterY = frameBottomWidth / 2 - frameSideWidth / 2;
  const levelingFootRodRadius = levelingFootRodDiameter / 2;
  const levelingFootExposedRodLength = Math.max(
    0,
    levelingFootExtension - levelingFootPadThickness,
  );

  return {
    scale,
    length,
    width,
    height,
    topThickness,
    topBottom,
    frameBottomZ: levelingFootExtension,
    topEdgeRoll: getParam(params, "topEdgeRoll"),
    topEdgeTension: getParam(params, "topEdgeTension"),
    topPlanCornerRadius: getParam(params, "topPlanCornerRadius"),
    topEndFaceRoundover: getParam(params, "topEndFaceRoundover"),
    sideOverhang,
    endOverhang,
    endFrameStyle: selectedEndFrameStyle,
    frameDepth,
    frameSideWidth,
    frameBottomRailHeight,
    frameTopRailHeight,
    frameBottomSpread,
    frameOuterTopCornerRadius: getParam(params, "frameOuterTopCornerRadius"),
    frameOuterBottomCornerRadius: getParam(
      params,
      "frameOuterBottomCornerRadius",
    ),
    frameInnerTopCornerRadius,
    frameInnerBottomCornerRadius,
    frameCornerStyle: hasBezierFrameControls ? "bezier" : "circular",
    frameOuterRailCurveTension: frameCurveTension(
      "frameOuterRailCurveTension",
    ),
    frameOuterStileCurveTension: frameCurveTension(
      "frameOuterStileCurveTension",
    ),
    frameInnerRailCurveTension: frameCurveTension(
      "frameInnerRailCurveTension",
    ),
    frameInnerStileCurveTension: frameCurveTension(
      "frameInnerStileCurveTension",
    ),
    frameEdgeRoundover,
    matchLengthwiseRailRoundover,
    halfLapClearance: getParam(params, "halfLapClearance"),
    frameHeight,
    frameTopWidth,
    frameBottomWidth,
    openingTopWidth,
    openingBottomWidth,
    openingHeight: openingTop - openingBottom,
    openingBottom,
    openingTop,
    frameCenterX: length / 2 - endOverhang - frameDepth / 2,
    braceSpanX,
    topSupportStyle: selectedTopSupportStyle,
    bottomSupportStyle: selectedBottomSupportStyle,
    upperBrace: createBracePlaneSpec({
      width: topSupportWidth,
      thickness: topSupportThickness,
      endpointInset: topSupportEndpointInset,
      edgeRadius: topSupportEdgeRadius,
      topEdgeRadius: 0,
      spanX: braceSpanX,
      openingWidth: openingTopWidth,
      innerCornerRadius: frameInnerTopCornerRadius,
      zBottom: topBottom - topSupportThickness,
      zTop: topBottom,
    }),
    lowerBrace: createBracePlaneSpec({
      width: bottomSupportWidth,
      thickness: bottomSupportThickness,
      endpointInset: bottomSupportEndpointInset,
      edgeRadius: bottomSupportEdgeRadius,
      topEdgeRadius: bottomSupportTopEdgeRadius,
      spanX: braceSpanX,
      openingWidth: openingBottomWidth,
      innerCornerRadius: frameInnerBottomCornerRadius,
      zBottom: levelingFootExtension,
      zTop: levelingFootExtension + bottomSupportThickness,
    }),
    upperStretchers: {
      count: 2,
      width: topSupportWidth,
      thickness: topSupportThickness,
      endpointInset: topSupportEndpointInset,
      edgeRadius: lengthwiseRailBottomRadius,
      topEdgeRadius: lengthwiseRailTopRadius,
      endRadius: lengthwiseRailEndRadius,
      shoulderRadius: topSupportShoulderRadius,
      spanX: braceSpanX,
      centerYs: [-upperStretcherCenterY, upperStretcherCenterY],
      placementBoundaryY: upperPlacementBoundaryY,
      zBottom: topBottom - topSupportThickness,
      zTop: topBottom,
    },
    cornerKneeBraces: {
      enabled: cornerBraceEnabled,
      count: 4,
      reach: cornerBraceReach,
      width: cornerBraceWidth,
      thickness: cornerBraceThickness,
      edgeRadius: 0,
      contactX: braceSpanX / 2,
      contactY: cornerBraceContactY,
      centerlineLength: Math.SQRT2 * cornerBraceReach,
      longPointLength: Math.SQRT2 * cornerBraceReach + cornerBraceWidth,
      angleRadians: Math.PI / 4,
      zBottom: topBottom - cornerBraceThickness,
      zTop: topBottom,
    },
    lowerCenterBoard: {
      count: 1,
      width: bottomSupportWidth,
      thickness: bottomSupportThickness,
      endpointInset: bottomSupportEndpointInset,
      edgeRadius: bottomSupportEdgeRadius,
      topEdgeRadius: bottomSupportTopEdgeRadius,
      endRadius: 0,
      shoulderRadius: 0,
      spanX: braceSpanX,
      centerYs: [0],
      zBottom: levelingFootExtension,
      zTop: levelingFootExtension + bottomSupportThickness,
    },
    channels: {
      count: 3,
      endClearance: channelEndClearance,
      sideInset: getParam(params, "channelSideInset"),
      width: channelWidth,
      depth: getParam(params, "channelDepth"),
      wallThickness: getParam(params, "channelWallThickness"),
      length: width - getParam(params, "channelSideInset") * 2,
      centerXs: [-channelOuterCenterX, 0, channelOuterCenterX],
      zBottom: topBottom,
      zTop: topBottom + getParam(params, "channelDepth"),
    },
    levelingFeet: {
      enabled: levelingFeetEnabled,
      count: 4,
      padDiameter: levelingFootPadDiameter,
      padThickness: levelingFootPadThickness,
      rodDiameter: levelingFootRodDiameter,
      rodLength: levelingFootRodLength,
      extension: levelingFootExtension,
      exposedRodLength: levelingFootExposedRodLength,
      embeddedRodLength:
        levelingFootRodLength - levelingFootExposedRodLength,
      centerYs: [-levelingFootCenterY, levelingFootCenterY],
      outerEntryClearance:
        frameSideWidth / 2 -
        (selectedEndFrameStyle === "box"
          ? getParam(params, "frameOuterBottomCornerRadius")
          : 0) -
        levelingFootRodRadius,
      stileClearance: frameSideWidth / 2 - levelingFootRodRadius,
      depthClearance: frameDepth / 2 - levelingFootRodRadius,
    },
  };
}

function upperSupportOakBearingFraction(spec: HoverDiningTableSpec) {
  // A widthwise channel interrupts the same fraction of an X member as it
  // does a straight stretcher: both the interrupted diagonal length and the
  // full diagonal length scale by 1 / cos(planAngle).
  return 1 -
    (spec.channels.count * spec.channels.width) / spec.braceSpanX;
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value; received ${value}`);
  }
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative; received ${value}`);
  }
}

function assertBracePlane(
  brace: BracePlaneSpec,
  spec: HoverDiningTableSpec,
  label: "Upper" | "Lower",
) {
  for (const [dimensionLabel, value] of [
    [`${label} brace width`, brace.width],
    [`${label} brace thickness`, brace.thickness],
    [`${label} brace edge radius`, brace.edgeRadius],
    [`${label} brace longitudinal span`, brace.spanX],
    [`${label} brace lateral span`, brace.spanY],
    [`${label} brace diagonal length`, brace.diagonalLength],
  ] as const) {
    assertPositive(value, dimensionLabel);
  }
  assertNonNegative(brace.topEdgeRadius, `${label} brace top edge radius`);
  assertNonNegative(brace.endpointInset, `${label} brace endpoint inset`);
  if (brace.spanX < MIN_BRACE_SPAN) {
    throw new Error(`${label} X needs a positive structural span between end boxes`);
  }
  if (brace.endpointY <= brace.width / 2) {
    throw new Error(`${label} X endpoints must remain separated across the table width`);
  }
  if (brace.cornerTangentY <= 0) {
    throw new Error(`${label} end-box opening has no straight rail between its corner radii`);
  }
  if (
    Math.abs(
      brace.endpointOuterY + brace.endpointInset - brace.cornerTangentY,
    ) > EPSILON
  ) {
    throw new Error(`${label} mitered end must stop at the inner-corner tangent`);
  }
  if (brace.edgeRadius * 2 >= brace.width) {
    throw new Error(`${label} brace edge radius must preserve a flat cross-section`);
  }
  if (brace.topEdgeRadius * 2 >= brace.width) {
    throw new Error(`${label} brace top edge radius must preserve a flat cross-section`);
  }
  const directionX = Math.cos(brace.angleRadians);
  const expectedMiterHalfWidth = brace.width / (2 * directionX);
  if (Math.abs(brace.miterHalfWidth - expectedMiterHalfWidth) > EPSILON) {
    throw new Error(`${label} end cut must be angled flush to the end-box face`);
  }
  if (brace.endpointOuterY > brace.cornerTangentY + EPSILON) {
    throw new Error(`${label} X brace end runs into the rounded end-box corner`);
  }
  if (Math.abs(brace.diagonalLength - Math.hypot(brace.spanX, brace.spanY)) > EPSILON) {
    throw new Error(`${label} diagonal length must remain derived from both spans`);
  }
  if (Math.abs(brace.angleRadians - Math.atan2(brace.spanY, brace.spanX)) > EPSILON) {
    throw new Error(`${label} diagonal angle must remain derived rather than independently rotated`);
  }
  if (Math.abs(brace.halfLapDepth * 2 - brace.thickness) > EPSILON) {
    throw new Error(`${label} half-lap depth must equal half the brace thickness`);
  }
}

function assertStraightSupport(
  support: StraightSupportSpec,
  label: "Upper stretchers" | "Floor center board",
) {
  for (const [dimensionLabel, value] of [
    [`${label} width`, support.width],
    [`${label} thickness`, support.thickness],
    [`${label} longitudinal span`, support.spanX],
  ] as const) {
    assertPositive(value, dimensionLabel);
  }
  assertNonNegative(support.edgeRadius, `${label} bottom edge radius`);
  assertNonNegative(support.topEdgeRadius, `${label} top edge radius`);
  assertNonNegative(support.endRadius, `${label} end-face edge radius`);
  assertNonNegative(support.shoulderRadius, `${label} upper-end radius`);
  assertNonNegative(support.endpointInset, `${label} endpoint inset`);
  if (support.centerYs.length !== support.count) {
    throw new Error(`${label} must retain its declared piece count`);
  }
  if (support.spanX < MIN_BRACE_SPAN) {
    throw new Error(`${label} needs a positive structural span between end boxes`);
  }
  if (
    support.edgeRadius * 2 >= support.width ||
    support.topEdgeRadius * 2 >= support.width ||
    support.endRadius * 2 >= support.width ||
    support.edgeRadius * 2 >= support.thickness ||
    support.endRadius * 2 >= support.thickness ||
    support.edgeRadius + support.topEdgeRadius >= support.thickness
  ) {
    throw new Error(`${label} edge radius must preserve a flat cross-section`);
  }
  if (support.endRadius * 2 >= support.spanX) {
    throw new Error(`${label} end radius must preserve a flat longitudinal run`);
  }
  if (support.shoulderRadius > support.thickness + EPSILON) {
    throw new Error(`${label} upper-end radius cannot exceed its height`);
  }
  if (support.shoulderRadius * 2 >= support.spanX) {
    throw new Error(`${label} upper-end radii must preserve a flat top run`);
  }
  const placementBoundaryY = support.placementBoundaryY;
  if (
    placementBoundaryY !== undefined &&
    support.centerYs.some(
      (centerY) =>
        Math.abs(centerY) + support.width / 2 + support.endpointInset >
        placementBoundaryY + EPSILON,
    )
  ) {
    throw new Error(`${label} must stop inside the end-box bearing boundary`);
  }
}

function assertCornerKneeBraces(braces: CornerKneeBraceSpec) {
  if (!braces.enabled) return;
  for (const [label, value] of [
    ["corner-brace reach", braces.reach],
    ["corner-brace width", braces.width],
    ["corner-brace thickness", braces.thickness],
    ["corner-brace centerline length", braces.centerlineLength],
    ["corner-brace long-point length", braces.longPointLength],
    ["corner-brace longitudinal contact", braces.contactX],
    ["corner-brace transverse contact", braces.contactY],
  ] as const) {
    assertPositive(value, label);
  }
  assertNonNegative(braces.edgeRadius, "Corner-brace edge radius");
  if (braces.count !== 4) {
    throw new Error("The triangulated top frame requires four mirrored corner braces");
  }
  if (braces.reach + braces.width > Math.min(braces.contactX, braces.contactY) + EPSILON) {
    throw new Error("Corner-brace reach must leave material between opposing top-frame triangles");
  }
  if (braces.edgeRadius * 2 >= Math.min(braces.width, braces.thickness)) {
    throw new Error("Corner-brace round-over must preserve a flat cross-section");
  }
  if (
    Math.abs(braces.centerlineLength - Math.SQRT2 * braces.reach) > EPSILON ||
    Math.abs(braces.longPointLength - (braces.centerlineLength + braces.width)) >
      EPSILON ||
    Math.abs(braces.angleRadians - Math.PI / 4) > EPSILON
  ) {
    throw new Error("Corner-brace length and 45-degree end cuts must remain derived from reach");
  }
}

/**
 * Central construction assertions. Geometry, audit, and export all pass through
 * this contract so parameter edits cannot silently detach an X, open a contact
 * gap, or turn a centered half-lap into overlapping solids.
 */
export function assertHoverDiningTableSpec(spec: HoverDiningTableSpec) {
  for (const [label, value] of [
    ["mock scale", spec.scale],
    ["table length", spec.length],
    ["table width", spec.width],
    ["overall height", spec.height],
    ["top thickness", spec.topThickness],
    ["top edge roll", spec.topEdgeRoll],
    ["frame depth", spec.frameDepth],
    ["frame side width", spec.frameSideWidth],
    ["frame bottom rail", spec.frameBottomRailHeight],
    ["frame top rail", spec.frameTopRailHeight],
    ["frame outer top radius", spec.frameOuterTopCornerRadius],
    ["frame outer bottom radius", spec.frameOuterBottomCornerRadius],
    ["frame inner top radius", spec.frameInnerTopCornerRadius],
    ["frame inner bottom radius", spec.frameInnerBottomCornerRadius],
    ["frame edge round-over", spec.frameEdgeRoundover],
    ["C-channel end clearance", spec.channels.endClearance],
    ["C-channel side inset", spec.channels.sideInset],
    ["C-channel width", spec.channels.width],
    ["C-channel depth", spec.channels.depth],
    ["C-channel wall thickness", spec.channels.wallThickness],
    ["C-channel length", spec.channels.length],
  ] as const) {
    assertPositive(value, label);
  }
  assertNonNegative(spec.topPlanCornerRadius, "Tabletop plan corner radius");
  assertNonNegative(spec.topEndFaceRoundover, "Tabletop end-face round-over");
  assertNonNegative(spec.halfLapClearance, "Half-lap fit clearance");

  if (spec.topThickness >= spec.height) {
    throw new Error("Tabletop thickness must remain below the overall height");
  }
  if (
    spec.endFrameStyle === "box" &&
    spec.frameHeight <= spec.frameBottomRailHeight + spec.frameTopRailHeight
  ) {
    throw new Error("End-box rails leave no positive interior opening height");
  }
  if (spec.frameTopWidth >= spec.width || spec.frameBottomWidth > spec.width + EPSILON) {
    throw new Error("Both end-box silhouettes must remain inside the tabletop width");
  }
  if (spec.openingTopWidth <= 0 || spec.openingBottomWidth <= 0) {
    throw new Error("End-box side members leave no positive interior opening width");
  }
  if (spec.frameCenterX - spec.frameDepth / 2 <= -spec.length / 2) {
    throw new Error("End-box placement extends beyond the tabletop length");
  }
  if (
    spec.frameInnerTopCornerRadius * 2 >= spec.openingTopWidth ||
    (spec.endFrameStyle === "box" &&
      spec.frameInnerBottomCornerRadius * 2 >= spec.openingBottomWidth) ||
    (spec.endFrameStyle === "box" &&
      spec.frameInnerTopCornerRadius + spec.frameInnerBottomCornerRadius >=
        spec.openingHeight)
  ) {
    throw new Error("Interior top and bottom radii must fit inside the end-box opening");
  }
  if (
    spec.frameOuterTopCornerRadius * 2 >= spec.frameTopWidth ||
    (spec.endFrameStyle === "box" &&
      spec.frameOuterBottomCornerRadius * 2 >= spec.frameBottomWidth) ||
    (spec.endFrameStyle === "box" &&
      spec.frameOuterTopCornerRadius + spec.frameOuterBottomCornerRadius >=
        spec.frameHeight)
  ) {
    throw new Error("Exterior top and bottom radii must fit inside the end-box silhouette");
  }
  if (
    spec.frameEdgeRoundover * 2 >=
    Math.min(
      spec.frameDepth,
      spec.frameSideWidth,
      spec.frameTopRailHeight,
      ...(spec.endFrameStyle === "box" ? [spec.frameBottomRailHeight] : []),
    )
  ) {
    throw new Error("Frame edge round-over must preserve flat material on every member");
  }
  if (spec.topEdgeRoll * 2 >= spec.width) {
    throw new Error("Tabletop edge roll must leave a positive flat top width");
  }
  if (
    spec.topPlanCornerRadius + spec.topEdgeRoll >= spec.width / 2 - EPSILON
  ) {
    throw new Error("Tabletop plan corners must leave a positive flat top width");
  }
  if (
    spec.topPlanCornerRadius + spec.topEndFaceRoundover >
    spec.endOverhang + EPSILON
  ) {
    throw new Error(
      "Tabletop end treatments must finish before the end-box bearing zone",
    );
  }
  if (spec.topEndFaceRoundover * 2 >= spec.topThickness) {
    throw new Error("Tabletop end-face round-over must leave flat end material");
  }
  if (spec.channels.count !== 3 || spec.channels.centerXs.length !== 3) {
    throw new Error("The tabletop must retain exactly three C-channels");
  }
  if (
    Math.abs(spec.channels.centerXs[1]) > EPSILON ||
    Math.abs(spec.channels.centerXs[0] + spec.channels.centerXs[2]) > EPSILON
  ) {
    throw new Error("C-channels must remain centered and mirror-symmetric");
  }
  if (
    spec.channels.centerXs[0] + spec.channels.width / 2 >= -EPSILON ||
    spec.channels.centerXs[2] - spec.channels.width / 2 <= EPSILON
  ) {
    throw new Error("The three C-channels must remain distinct and ordered");
  }
  if (
    spec.channels.sideInset < spec.topEdgeRoll - EPSILON ||
    spec.channels.length + spec.channels.sideInset * 2 > spec.width + EPSILON
  ) {
    throw new Error("C-channels must stop inside both rolled tabletop edges");
  }
  if (
    spec.channels.depth >= spec.topThickness ||
    Math.abs(spec.channels.zBottom - spec.topBottom) > EPSILON ||
    spec.channels.zTop > spec.height + EPSILON
  ) {
    throw new Error("C-channels must fit in flush tabletop-underside mortises");
  }
  if (
    Math.abs(spec.channels.zBottom - spec.upperBrace.zTop) > EPSILON ||
    Math.abs(spec.channels.zBottom - spec.upperStretchers.zTop) > EPSILON
  ) {
    throw new Error(
      "Flush C-channel webs and upper supports must share the tabletop underside contact plane",
    );
  }
  if (upperSupportOakBearingFraction(spec) < 0.5 - EPSILON) {
    throw new Error(
      "C-channels must leave at least half of every upper support bearing directly on oak",
    );
  }
  if (
    spec.channels.wallThickness * 2 >= spec.channels.width ||
    spec.channels.wallThickness >= spec.channels.depth
  ) {
    throw new Error("C-channel web and flanges must retain a positive U-section");
  }
  const channelClearHalfSpan = spec.braceSpanX / 2;
  if (
    Math.abs(spec.channels.centerXs[2]) + spec.channels.width / 2 +
      spec.channels.endClearance >
    channelClearHalfSpan + EPSILON
  ) {
    throw new Error("Outer C-channels must remain clear of both end boxes");
  }
  if (Math.abs(spec.frameBottomZ + spec.frameHeight - spec.topBottom) > EPSILON) {
    throw new Error("Raised end boxes must terminate at the tabletop underside");
  }

  const feet = spec.levelingFeet;
  for (const [label, value] of [
    ["leveling-foot pad diameter", feet.padDiameter],
    ["leveling-foot pad thickness", feet.padThickness],
    ["leveling-foot rod diameter", feet.rodDiameter],
    ["leveling-foot rod length", feet.rodLength],
  ] as const) {
    assertPositive(value, label);
  }
  assertNonNegative(feet.extension, "Leveling-foot installed extension");
  if (feet.enabled) {
    if (feet.extension < feet.padThickness - EPSILON) {
      throw new Error("Leveling-foot extension must include the full pad thickness");
    }
    if (feet.embeddedRodLength <= 0 || feet.embeddedRodLength > spec.frameHeight) {
      throw new Error("Leveling-foot rod must retain a positive embedded length inside each stile");
    }
    if (feet.outerEntryClearance < -EPSILON) {
      throw new Error(
        "Outer bottom radius leaves no solid entry face for the leveling-foot rod",
      );
    }
    if (feet.stileClearance < -EPSILON) {
      throw new Error("Leveling-foot rod is wider than the supporting stile");
    }
    if (feet.depthClearance < -EPSILON) {
      throw new Error("Leveling-foot rod is wider than the end-box depth");
    }
  }

  assertBracePlane(spec.upperBrace, spec, "Upper");
  assertBracePlane(spec.lowerBrace, spec, "Lower");
  assertStraightSupport(spec.upperStretchers, "Upper stretchers");
  assertCornerKneeBraces(spec.cornerKneeBraces);
  assertStraightSupport(spec.lowerCenterBoard, "Floor center board");
  if (Math.abs(spec.upperBrace.zTop - spec.topBottom) > EPSILON) {
    throw new Error("Upper X top envelope must contact the tabletop underside");
  }
  if (spec.upperBrace.zBottom < spec.lowerBrace.zTop + EPSILON) {
    throw new Error("Upper and lower X assemblies must remain vertically separate");
  }
  if (Math.abs(spec.lowerBrace.zBottom - spec.frameBottomZ) > EPSILON) {
    throw new Error("Lower X must share the raised end-box underside plane");
  }
  if (Math.abs(spec.upperStretchers.zTop - spec.topBottom) > EPSILON) {
    throw new Error("Upper stretchers must contact the tabletop underside");
  }
  if (
    spec.cornerKneeBraces.enabled &&
    (spec.endFrameStyle !== "legs" || spec.topSupportStyle !== "stretchers")
  ) {
    throw new Error("Corner braces require open leg frames and lengthwise upper rails");
  }
  if (
    spec.cornerKneeBraces.enabled &&
    Math.abs(spec.cornerKneeBraces.zTop - spec.topBottom) > EPSILON
  ) {
    throw new Error("Corner braces must share the tabletop-underside support plane");
  }
  if (Math.abs(spec.lowerCenterBoard.zBottom - spec.frameBottomZ) > EPSILON) {
    throw new Error("Floor center board must share the raised end-box underside plane");
  }
  if (
    spec.halfLapClearance >=
    Math.min(spec.upperBrace.thickness, spec.lowerBrace.thickness) / 2
  ) {
    throw new Error("Half-lap clearance must leave positive mating material in both Xs");
  }
  for (const [label, brace, isCrossbar] of [
    ["Upper", spec.upperBrace, spec.topSupportStyle === "x"],
    ["Lower", spec.lowerBrace, spec.bottomSupportStyle === "x"],
  ] as const) {
    if (
      isCrossbar &&
      (brace.edgeRadius >= brace.halfLapDepth - spec.halfLapClearance / 2 ||
        brace.topEdgeRadius >=
          brace.halfLapDepth - spec.halfLapClearance / 2)
    ) {
      throw new Error(`${label} brace round-over must leave square half-lap shoulders`);
    }
  }
  const tensions: readonly (readonly [string, number])[] = [
    ["tabletop edge", spec.topEdgeTension],
    ...(spec.frameCornerStyle === "bezier"
      ? [
          ["outer frame rail-side handle", spec.frameOuterRailCurveTension],
          ["outer frame stile-side handle", spec.frameOuterStileCurveTension],
          ["inner frame rail-side handle", spec.frameInnerRailCurveTension],
          ["inner frame stile-side handle", spec.frameInnerStileCurveTension],
        ] as const
      : []),
  ];
  for (const [label, tension] of tensions) {
    if (tension < 0.3 || tension > 0.9) {
      throw new Error(`${label} Bézier tension must stay between 0.3 and 0.9`);
    }
  }
  if (
    spec.matchLengthwiseRailRoundover &&
    (Math.abs(spec.upperStretchers.topEdgeRadius - spec.frameEdgeRoundover) >
        EPSILON ||
      Math.abs(spec.upperStretchers.endRadius - spec.frameEdgeRoundover) >
        EPSILON)
  ) {
    throw new Error(
      "Matched lengthwise rail top and shoulder edges must use the leg face-edge round-over",
    );
  }
}

function scaleBrace(brace: BracePlaneSpec, scale: number): BracePlaneSpec {
  return {
    ...brace,
    width: brace.width / scale,
    thickness: brace.thickness / scale,
    endpointInset: brace.endpointInset / scale,
    edgeRadius: brace.edgeRadius / scale,
    topEdgeRadius: brace.topEdgeRadius / scale,
    spanX: brace.spanX / scale,
    spanY: brace.spanY / scale,
    endpointY: brace.endpointY / scale,
    endpointOuterY: brace.endpointOuterY / scale,
    cornerTangentY: brace.cornerTangentY / scale,
    miterHalfWidth: brace.miterHalfWidth / scale,
    diagonalLength: brace.diagonalLength / scale,
    zBottom: brace.zBottom / scale,
    zTop: brace.zTop / scale,
    halfLapDepth: brace.halfLapDepth / scale,
  };
}

function scaleStraightSupport(
  support: StraightSupportSpec,
  scale: number,
): StraightSupportSpec {
  return {
    ...support,
    width: support.width / scale,
    thickness: support.thickness / scale,
    endpointInset: support.endpointInset / scale,
    edgeRadius: support.edgeRadius / scale,
    topEdgeRadius: support.topEdgeRadius / scale,
    endRadius: support.endRadius / scale,
    shoulderRadius: support.shoulderRadius / scale,
    spanX: support.spanX / scale,
    centerYs: support.centerYs.map((centerY) => centerY / scale),
    placementBoundaryY:
      support.placementBoundaryY === undefined
        ? undefined
        : support.placementBoundaryY / scale,
    zBottom: support.zBottom / scale,
    zTop: support.zTop / scale,
  };
}

function scaleCornerKneeBraces(
  braces: CornerKneeBraceSpec,
  scale: number,
): CornerKneeBraceSpec {
  return {
    ...braces,
    reach: braces.reach / scale,
    width: braces.width / scale,
    thickness: braces.thickness / scale,
    edgeRadius: braces.edgeRadius / scale,
    contactX: braces.contactX / scale,
    contactY: braces.contactY / scale,
    centerlineLength: braces.centerlineLength / scale,
    longPointLength: braces.longPointLength / scale,
    zBottom: braces.zBottom / scale,
    zTop: braces.zTop / scale,
  };
}

function scaleCChannel(channel: CChannelSpec, scale: number): CChannelSpec {
  return {
    ...channel,
    endClearance: channel.endClearance / scale,
    sideInset: channel.sideInset / scale,
    width: channel.width / scale,
    depth: channel.depth / scale,
    wallThickness: channel.wallThickness / scale,
    length: channel.length / scale,
    centerXs: channel.centerXs.map((centerX) => centerX / scale) as [
      number,
      number,
      number,
    ],
    zBottom: channel.zBottom / scale,
    zTop: channel.zTop / scale,
  };
}

function scaleLevelingFeet(
  feet: LevelingFeetSpec,
  scale: number,
): LevelingFeetSpec {
  return {
    ...feet,
    padDiameter: feet.padDiameter / scale,
    padThickness: feet.padThickness / scale,
    rodDiameter: feet.rodDiameter / scale,
    rodLength: feet.rodLength / scale,
    extension: feet.extension / scale,
    exposedRodLength: feet.exposedRodLength / scale,
    embeddedRodLength: feet.embeddedRodLength / scale,
    centerYs: feet.centerYs.map((centerY) => centerY / scale) as [
      number,
      number,
    ],
    outerEntryClearance: feet.outerEntryClearance / scale,
    stileClearance: feet.stileClearance / scale,
    depthClearance: feet.depthClearance / scale,
  };
}

export function getHoverDiningTableSpec(params: ModelParams) {
  const fullSize = rawHoverDiningTableSpec(params);
  assertHoverDiningTableSpec(fullSize);
  const { scale } = fullSize;
  const scaled: HoverDiningTableSpec = {
    ...fullSize,
    length: fullSize.length / scale,
    width: fullSize.width / scale,
    height: fullSize.height / scale,
    topThickness: fullSize.topThickness / scale,
    topBottom: fullSize.topBottom / scale,
    frameBottomZ: fullSize.frameBottomZ / scale,
    topEdgeRoll: fullSize.topEdgeRoll / scale,
    topPlanCornerRadius: fullSize.topPlanCornerRadius / scale,
    topEndFaceRoundover: fullSize.topEndFaceRoundover / scale,
    sideOverhang: fullSize.sideOverhang / scale,
    endOverhang: fullSize.endOverhang / scale,
    frameDepth: fullSize.frameDepth / scale,
    frameSideWidth: fullSize.frameSideWidth / scale,
    frameBottomRailHeight: fullSize.frameBottomRailHeight / scale,
    frameTopRailHeight: fullSize.frameTopRailHeight / scale,
    frameBottomSpread: fullSize.frameBottomSpread / scale,
    frameOuterTopCornerRadius: fullSize.frameOuterTopCornerRadius / scale,
    frameOuterBottomCornerRadius: fullSize.frameOuterBottomCornerRadius / scale,
    frameInnerTopCornerRadius: fullSize.frameInnerTopCornerRadius / scale,
    frameInnerBottomCornerRadius: fullSize.frameInnerBottomCornerRadius / scale,
    frameEdgeRoundover: fullSize.frameEdgeRoundover / scale,
    halfLapClearance: fullSize.halfLapClearance / scale,
    frameHeight: fullSize.frameHeight / scale,
    frameTopWidth: fullSize.frameTopWidth / scale,
    frameBottomWidth: fullSize.frameBottomWidth / scale,
    openingTopWidth: fullSize.openingTopWidth / scale,
    openingBottomWidth: fullSize.openingBottomWidth / scale,
    openingHeight: fullSize.openingHeight / scale,
    openingBottom: fullSize.openingBottom / scale,
    openingTop: fullSize.openingTop / scale,
    frameCenterX: fullSize.frameCenterX / scale,
    braceSpanX: fullSize.braceSpanX / scale,
    upperBrace: scaleBrace(fullSize.upperBrace, scale),
    lowerBrace: scaleBrace(fullSize.lowerBrace, scale),
    upperStretchers: scaleStraightSupport(fullSize.upperStretchers, scale),
    cornerKneeBraces: scaleCornerKneeBraces(
      fullSize.cornerKneeBraces,
      scale,
    ),
    lowerCenterBoard: scaleStraightSupport(fullSize.lowerCenterBoard, scale),
    channels: scaleCChannel(fullSize.channels, scale),
    levelingFeet: scaleLevelingFeet(fullSize.levelingFeet, scale),
  };
  return { fullSize, scaled };
}

function grainTextureSize(spec: HoverDiningTableSpec) {
  return 800 / spec.scale;
}

type CubicProfileSegment = {
  from: THREE.Vector2;
  control1: THREE.Vector2;
  control2: THREE.Vector2;
  to: THREE.Vector2;
};

type ArcProfileSegment = {
  from: THREE.Vector2;
  center: THREE.Vector2;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
  to: THREE.Vector2;
};

type RoundedTrapezoidDefinition = {
  bottomLeftStart: THREE.Vector2;
  bottomRightStart: THREE.Vector2;
  rightLower: THREE.Vector2;
  rightUpper: THREE.Vector2;
  topRightEnd: THREE.Vector2;
  topLeftStart: THREE.Vector2;
  leftUpper: THREE.Vector2;
  leftLower: THREE.Vector2;
  bottomRightCurve: CubicProfileSegment;
  topRightCurve: CubicProfileSegment;
  topLeftCurve: CubicProfileSegment;
  bottomLeftCurve: CubicProfileSegment;
};

type CircularRoundedTrapezoidDefinition = Omit<
  RoundedTrapezoidDefinition,
  | "bottomRightCurve"
  | "topRightCurve"
  | "topLeftCurve"
  | "bottomLeftCurve"
> & {
  bottomRightCurve: ArcProfileSegment;
  topRightCurve: ArcProfileSegment;
  topLeftCurve: ArcProfileSegment;
  bottomLeftCurve: ArcProfileSegment;
};

function circularFillet(
  previous: THREE.Vector2,
  corner: THREE.Vector2,
  next: THREE.Vector2,
  radius: number,
): ArcProfileSegment {
  const towardPrevious = previous.clone().sub(corner).normalize();
  const towardNext = next.clone().sub(corner).normalize();
  const angle = Math.acos(
    THREE.MathUtils.clamp(towardPrevious.dot(towardNext), -1, 1),
  );
  const tangentDistance = radius / Math.tan(angle / 2);
  const from = corner.clone().addScaledVector(towardPrevious, tangentDistance);
  const to = corner.clone().addScaledVector(towardNext, tangentDistance);
  const center = corner
    .clone()
    .addScaledVector(
      towardPrevious.clone().add(towardNext).normalize(),
      radius / Math.sin(angle / 2),
    );
  return {
    from,
    center,
    radius,
    startAngle: Math.atan2(from.y - center.y, from.x - center.x),
    endAngle: Math.atan2(to.y - center.y, to.x - center.x),
    clockwise: false,
    to,
  };
}

function getCircularRoundedTrapezoidDefinition(
  bottomWidth: number,
  topWidth: number,
  bottom: number,
  top: number,
  bottomRadius: number,
  topRadius: number,
): CircularRoundedTrapezoidDefinition {
  const bottomLeft = new THREE.Vector2(-bottomWidth / 2, bottom);
  const bottomRight = new THREE.Vector2(bottomWidth / 2, bottom);
  const topRight = new THREE.Vector2(topWidth / 2, top);
  const topLeft = new THREE.Vector2(-topWidth / 2, top);
  const bottomRightCurve = circularFillet(
    bottomLeft,
    bottomRight,
    topRight,
    bottomRadius,
  );
  const topRightCurve = circularFillet(
    bottomRight,
    topRight,
    topLeft,
    topRadius,
  );
  const topLeftCurve = circularFillet(
    topRight,
    topLeft,
    bottomLeft,
    topRadius,
  );
  const bottomLeftCurve = circularFillet(
    topLeft,
    bottomLeft,
    bottomRight,
    bottomRadius,
  );
  return {
    bottomLeftStart: bottomLeftCurve.to,
    bottomRightStart: bottomRightCurve.from,
    rightLower: bottomRightCurve.to,
    rightUpper: topRightCurve.from,
    topRightEnd: topRightCurve.to,
    topLeftStart: topLeftCurve.from,
    leftUpper: topLeftCurve.to,
    leftLower: bottomLeftCurve.from,
    bottomRightCurve,
    topRightCurve,
    topLeftCurve,
    bottomLeftCurve,
  };
}

function getRoundedTrapezoidDefinition(
  bottomWidth: number,
  topWidth: number,
  bottom: number,
  top: number,
  bottomRadius: number,
  topRadius: number,
  railTension: number,
  stileTension: number,
) {
  const bottomLeft = new THREE.Vector2(-bottomWidth / 2, bottom);
  const bottomRight = new THREE.Vector2(bottomWidth / 2, bottom);
  const topRight = new THREE.Vector2(topWidth / 2, top);
  const topLeft = new THREE.Vector2(-topWidth / 2, top);
  const rightDirection = topRight.clone().sub(bottomRight).normalize();
  const leftDownDirection = bottomLeft.clone().sub(topLeft).normalize();

  const bottomLeftStart = new THREE.Vector2(
    bottomLeft.x + bottomRadius,
    bottom,
  );
  const bottomRightStart = new THREE.Vector2(
    bottomRight.x - bottomRadius,
    bottom,
  );
  const rightLower = bottomRight
    .clone()
    .addScaledVector(rightDirection, bottomRadius);
  const rightUpper = topRight
    .clone()
    .addScaledVector(rightDirection, -topRadius);
  const topRightEnd = new THREE.Vector2(topRight.x - topRadius, top);
  const topLeftStart = new THREE.Vector2(topLeft.x + topRadius, top);
  const leftUpper = topLeft
    .clone()
    .addScaledVector(leftDownDirection, topRadius);
  const leftLower = bottomLeft
    .clone()
    .addScaledVector(leftDownDirection, -bottomRadius);

  return {
    bottomLeftStart,
    bottomRightStart,
    rightLower,
    rightUpper,
    topRightEnd,
    topLeftStart,
    leftUpper,
    leftLower,
    bottomRightCurve: {
      from: bottomRightStart,
      control1: new THREE.Vector2(
        bottomRightStart.x + bottomRadius * railTension,
        bottom,
      ),
      control2: new THREE.Vector2(
        rightLower.x - rightDirection.x * bottomRadius * stileTension,
        rightLower.y - rightDirection.y * bottomRadius * stileTension,
      ),
      to: rightLower,
    },
    topRightCurve: {
      from: rightUpper,
      control1: new THREE.Vector2(
        rightUpper.x + rightDirection.x * topRadius * stileTension,
        rightUpper.y + rightDirection.y * topRadius * stileTension,
      ),
      control2: new THREE.Vector2(
        topRightEnd.x + topRadius * railTension,
        top,
      ),
      to: topRightEnd,
    },
    topLeftCurve: {
      from: topLeftStart,
      control1: new THREE.Vector2(
        topLeftStart.x - topRadius * railTension,
        top,
      ),
      control2: new THREE.Vector2(
        leftUpper.x - leftDownDirection.x * topRadius * stileTension,
        leftUpper.y - leftDownDirection.y * topRadius * stileTension,
      ),
      to: leftUpper,
    },
    bottomLeftCurve: {
      from: leftLower,
      control1: new THREE.Vector2(
        leftLower.x + leftDownDirection.x * bottomRadius * stileTension,
        leftLower.y + leftDownDirection.y * bottomRadius * stileTension,
      ),
      control2: new THREE.Vector2(
        bottomLeftStart.x - bottomRadius * railTension,
        bottom,
      ),
      to: bottomLeftStart,
    },
  };
}

function addRoundedTrapezoid(
  path: THREE.Path | THREE.Shape,
  bottomWidth: number,
  topWidth: number,
  bottom: number,
  top: number,
  bottomRadius: number,
  topRadius: number,
  railTension: number,
  stileTension: number,
) {
  const profile = getRoundedTrapezoidDefinition(
    bottomWidth,
    topWidth,
    bottom,
    top,
    bottomRadius,
    topRadius,
    railTension,
    stileTension,
  );
  const addCubic = (curve: CubicProfileSegment) => {
    path.bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.to.x,
      curve.to.y,
    );
  };

  path.moveTo(profile.bottomLeftStart.x, profile.bottomLeftStart.y);
  path.lineTo(profile.bottomRightStart.x, profile.bottomRightStart.y);
  addCubic(profile.bottomRightCurve);
  path.lineTo(profile.rightUpper.x, profile.rightUpper.y);
  addCubic(profile.topRightCurve);
  path.lineTo(profile.topLeftStart.x, profile.topLeftStart.y);
  addCubic(profile.topLeftCurve);
  path.lineTo(profile.leftLower.x, profile.leftLower.y);
  addCubic(profile.bottomLeftCurve);
  path.closePath();
}

type EndBoxPartPosition = "top" | "bottom" | "left" | "right";

function profilePoint(point: THREE.Vector2): HoverDiningTableProfilePoint {
  return { x: point.x, y: point.y };
}

function moveProfile(point: THREE.Vector2): HoverDiningTableProfileCommand {
  return { kind: "move", to: profilePoint(point) };
}

function lineProfile(
  point: THREE.Vector2,
  edgeTreatment: "roundover" | "square" = "roundover",
): HoverDiningTableProfileCommand {
  return { kind: "line", to: profilePoint(point), edgeTreatment };
}

function cubicProfile(
  curve: CubicProfileSegment,
  reverse = false,
): HoverDiningTableProfileCommand {
  return reverse
    ? {
        kind: "cubic",
        control1: profilePoint(curve.control2),
        control2: profilePoint(curve.control1),
        to: profilePoint(curve.from),
      }
    : {
        kind: "cubic",
        control1: profilePoint(curve.control1),
        control2: profilePoint(curve.control2),
        to: profilePoint(curve.to),
      };
}

function arcProfile(
  curve: ArcProfileSegment,
  reverse = false,
): HoverDiningTableProfileCommand {
  return reverse
    ? {
        kind: "arc",
        center: profilePoint(curve.center),
        radius: curve.radius,
        startAngle: curve.endAngle,
        endAngle: curve.startAngle,
        clockwise: !curve.clockwise,
        to: profilePoint(curve.from),
      }
    : {
        kind: "arc",
        center: profilePoint(curve.center),
        radius: curve.radius,
        startAngle: curve.startAngle,
        endAngle: curve.endAngle,
        clockwise: curve.clockwise,
        to: profilePoint(curve.to),
      };
}

function curvedProfile(
  curve: CubicProfileSegment | ArcProfileSegment,
  reverse = false,
) {
  return "center" in curve
    ? arcProfile(curve, reverse)
    : cubicProfile(curve, reverse);
}

function createShapeFromProfile(
  commands: HoverDiningTableProfileCommand[],
) {
  const shape = new THREE.Shape();
  for (const command of commands) {
    if (command.kind === "move") {
      shape.moveTo(command.to.x, command.to.y);
    } else if (command.kind === "line") {
      shape.lineTo(command.to.x, command.to.y);
    } else if (command.kind === "cubic") {
      shape.bezierCurveTo(
        command.control1.x,
        command.control1.y,
        command.control2.x,
        command.control2.y,
        command.to.x,
        command.to.y,
      );
    } else if (command.kind === "arc") {
      shape.absarc(
        command.center.x,
        command.center.y,
        command.radius,
        command.startAngle,
        command.endAngle,
        command.clockwise,
      );
    } else {
      shape.closePath();
    }
  }
  return shape;
}

function rectangleProfile(
  width: number,
  height: number,
): HoverDiningTableProfileCommand[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [
    { kind: "move", to: { x: -halfWidth, y: -halfHeight } },
    { kind: "line", to: { x: halfWidth, y: -halfHeight } },
    { kind: "line", to: { x: halfWidth, y: halfHeight } },
    { kind: "line", to: { x: -halfWidth, y: halfHeight } },
    { kind: "close" },
  ];
}

function roundedRectangleProfile(
  width: number,
  height: number,
  radius: number,
): HoverDiningTableProfileCommand[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const safeRadius = Math.min(radius, halfWidth, halfHeight);
  const control = safeRadius * 0.5522847498;
  return [
    { kind: "move", to: { x: -halfWidth + safeRadius, y: -halfHeight } },
    { kind: "line", to: { x: halfWidth - safeRadius, y: -halfHeight } },
    {
      kind: "cubic",
      control1: { x: halfWidth - safeRadius + control, y: -halfHeight },
      control2: { x: halfWidth, y: -halfHeight + safeRadius - control },
      to: { x: halfWidth, y: -halfHeight + safeRadius },
    },
    { kind: "line", to: { x: halfWidth, y: halfHeight - safeRadius } },
    {
      kind: "cubic",
      control1: { x: halfWidth, y: halfHeight - safeRadius + control },
      control2: { x: halfWidth - safeRadius + control, y: halfHeight },
      to: { x: halfWidth - safeRadius, y: halfHeight },
    },
    { kind: "line", to: { x: -halfWidth + safeRadius, y: halfHeight } },
    {
      kind: "cubic",
      control1: { x: -halfWidth + safeRadius - control, y: halfHeight },
      control2: { x: -halfWidth, y: halfHeight - safeRadius + control },
      to: { x: -halfWidth, y: halfHeight - safeRadius },
    },
    { kind: "line", to: { x: -halfWidth, y: -halfHeight + safeRadius } },
    {
      kind: "cubic",
      control1: { x: -halfWidth, y: -halfHeight + safeRadius - control },
      control2: { x: -halfWidth + safeRadius - control, y: -halfHeight },
      to: { x: -halfWidth + safeRadius, y: -halfHeight },
    },
    { kind: "close" },
  ];
}

function circularRoundedRectangleProfile(
  width: number,
  height: number,
  radius: number,
): HoverDiningTableProfileCommand[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const safeRadius = Math.min(radius, halfWidth, halfHeight);
  return [
    { kind: "move", to: { x: -halfWidth + safeRadius, y: -halfHeight } },
    { kind: "line", to: { x: halfWidth - safeRadius, y: -halfHeight } },
    {
      kind: "arc",
      center: { x: halfWidth - safeRadius, y: -halfHeight + safeRadius },
      radius: safeRadius,
      startAngle: -Math.PI / 2,
      endAngle: 0,
      clockwise: false,
      to: { x: halfWidth, y: -halfHeight + safeRadius },
    },
    { kind: "line", to: { x: halfWidth, y: halfHeight - safeRadius } },
    {
      kind: "arc",
      center: { x: halfWidth - safeRadius, y: halfHeight - safeRadius },
      radius: safeRadius,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: false,
      to: { x: halfWidth - safeRadius, y: halfHeight },
    },
    { kind: "line", to: { x: -halfWidth + safeRadius, y: halfHeight } },
    {
      kind: "arc",
      center: { x: -halfWidth + safeRadius, y: halfHeight - safeRadius },
      radius: safeRadius,
      startAngle: Math.PI / 2,
      endAngle: Math.PI,
      clockwise: false,
      to: { x: -halfWidth, y: halfHeight - safeRadius },
    },
    { kind: "line", to: { x: -halfWidth, y: -halfHeight + safeRadius } },
    {
      kind: "arc",
      center: { x: -halfWidth + safeRadius, y: -halfHeight + safeRadius },
      radius: safeRadius,
      startAngle: Math.PI,
      endAngle: Math.PI * 1.5,
      clockwise: false,
      to: { x: -halfWidth + safeRadius, y: -halfHeight },
    },
    { kind: "close" },
  ];
}

function supportRoundedRectangleProfile(
  width: number,
  height: number,
  bottomRadius: number,
  topRadius: number,
): HoverDiningTableProfileCommand[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const safeBottomRadius = Math.min(bottomRadius, halfWidth, height);
  const safeTopRadius = Math.min(
    topRadius,
    halfWidth,
    height - safeBottomRadius,
  );
  const bottomControl = safeBottomRadius * 0.5522847498;
  const topControl = safeTopRadius * 0.5522847498;
  const commands: HoverDiningTableProfileCommand[] = [
    {
      kind: "move",
      to: { x: -halfWidth + safeBottomRadius, y: -halfHeight },
    },
    {
      kind: "line",
      to: { x: halfWidth - safeBottomRadius, y: -halfHeight },
    },
  ];
  if (safeBottomRadius > EPSILON) {
    commands.push({
      kind: "cubic",
      control1: {
        x: halfWidth - safeBottomRadius + bottomControl,
        y: -halfHeight,
      },
      control2: {
        x: halfWidth,
        y: -halfHeight + safeBottomRadius - bottomControl,
      },
      to: { x: halfWidth, y: -halfHeight + safeBottomRadius },
    });
  }
  commands.push({
    kind: "line",
    to: { x: halfWidth, y: halfHeight - safeTopRadius },
  });
  if (safeTopRadius > EPSILON) {
    commands.push({
      kind: "cubic",
      control1: {
        x: halfWidth,
        y: halfHeight - safeTopRadius + topControl,
      },
      control2: {
        x: halfWidth - safeTopRadius + topControl,
        y: halfHeight,
      },
      to: { x: halfWidth - safeTopRadius, y: halfHeight },
    });
  }
  commands.push({
    kind: "line",
    to: { x: -halfWidth + safeTopRadius, y: halfHeight },
  });
  if (safeTopRadius > EPSILON) {
    commands.push({
      kind: "cubic",
      control1: {
        x: -halfWidth + safeTopRadius - topControl,
        y: halfHeight,
      },
      control2: {
        x: -halfWidth,
        y: halfHeight - safeTopRadius + topControl,
      },
      to: { x: -halfWidth, y: halfHeight - safeTopRadius },
    });
  }
  commands.push({
    kind: "line",
    to: { x: -halfWidth, y: -halfHeight + safeBottomRadius },
  });
  if (safeBottomRadius > EPSILON) {
    commands.push({
      kind: "cubic",
      control1: {
        x: -halfWidth,
        y: -halfHeight + safeBottomRadius - bottomControl,
      },
      control2: {
        x: -halfWidth + safeBottomRadius - bottomControl,
        y: -halfHeight,
      },
      to: { x: -halfWidth + safeBottomRadius, y: -halfHeight },
    });
  }
  commands.push({ kind: "close" });
  return commands;
}

function straightSupportSideProfile(
  support: StraightSupportSpec,
): HoverDiningTableProfileCommand[] {
  const halfLength = support.spanX / 2;
  const halfHeight = support.thickness / 2;
  const radius = Math.min(support.shoulderRadius, support.thickness);
  if (radius <= EPSILON) {
    return rectangleProfile(support.spanX, support.thickness);
  }
  const bottom = -halfHeight;
  const top = halfHeight;
  const right = halfLength;
  const left = -halfLength;
  const commands: HoverDiningTableProfileCommand[] = [
    { kind: "move", to: { x: left, y: bottom } },
    {
      kind: "line",
      to: { x: right, y: bottom },
      edgeTreatment: "square",
    },
  ];
  if (support.thickness - radius > EPSILON) {
    commands.push({
      kind: "line",
      to: { x: right, y: top - radius },
      edgeTreatment: "square",
    });
  }
  commands.push(
    {
      kind: "arc",
      center: { x: right - radius, y: top - radius },
      radius,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: false,
      to: { x: right - radius, y: top },
    },
    {
      kind: "line",
      to: { x: left + radius, y: top },
    },
    {
      kind: "arc",
      center: { x: left + radius, y: top - radius },
      radius,
      startAngle: Math.PI / 2,
      endAngle: Math.PI,
      clockwise: false,
      to: { x: left, y: top - radius },
    },
  );
  if (support.thickness - radius > EPSILON) {
    commands.push({
      kind: "line",
      to: { x: left, y: bottom },
      edgeTreatment: "square",
    });
  }
  commands.push({ kind: "close", edgeTreatment: "square" });
  return commands;
}

function profileBounds(commands: HoverDiningTableProfileCommand[]) {
  const points = createShapeFromProfile(commands).getPoints(48);
  const bounds = new THREE.Box2().setFromPoints(points);
  return {
    minX: bounds.min.x,
    minY: bounds.min.y,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
  };
}

function sampleClosedProfile(
  commands: HoverDiningTableProfileCommand[],
  curveSegments: number,
) {
  const points: THREE.Vector2[] = [];
  const roundedEdges: boolean[] = [];
  let current: THREE.Vector2 | null = null;
  for (const command of commands) {
    if (command.kind === "move") {
      current = new THREE.Vector2(command.to.x, command.to.y);
      points.push(current.clone());
      continue;
    }
    if (!current) throw new Error("Fabrication profile must begin with move");
    if (command.kind === "line") {
      const next = new THREE.Vector2(command.to.x, command.to.y);
      points.push(next);
      roundedEdges.push(command.edgeTreatment !== "square");
      current = next;
    } else if (command.kind === "cubic") {
      const start = current.clone();
      const control1 = new THREE.Vector2(
        command.control1.x,
        command.control1.y,
      );
      const control2 = new THREE.Vector2(
        command.control2.x,
        command.control2.y,
      );
      const end = new THREE.Vector2(command.to.x, command.to.y);
      for (let index = 1; index <= curveSegments; index += 1) {
        const t = index / curveSegments;
        const inverse = 1 - t;
        points.push(
          start
            .clone()
            .multiplyScalar(inverse ** 3)
            .addScaledVector(control1, 3 * inverse ** 2 * t)
            .addScaledVector(control2, 3 * inverse * t ** 2)
            .addScaledVector(end, t ** 3),
        );
        roundedEdges.push(command.edgeTreatment !== "square");
      }
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
        roundedEdges.push(command.edgeTreatment !== "square");
      }
      current = new THREE.Vector2(command.to.x, command.to.y);
    } else {
      roundedEdges.push(command.edgeTreatment !== "square");
    }
  }
  if (roundedEdges.length !== points.length) {
    throw new Error("Closed fabrication profile must classify every edge");
  }
  if (polygonArea(points) < 0) {
    const count = points.length;
    return {
      points: points.slice().reverse(),
      roundedEdges: points.map(
        (_, index) => roundedEdges[(count - 2 - index + count) % count],
      ),
    };
  }
  return { points, roundedEdges };
}

function cross2(a: THREE.Vector2, b: THREE.Vector2) {
  return a.x * b.y - a.y * b.x;
}

function offsetProfileEdges(
  points: THREE.Vector2[],
  roundedEdges: boolean[],
  inset: number,
) {
  if (inset <= EPSILON) return points.map((point) => point.clone());
  return points.map((point, index) => {
    const previousIndex = (index - 1 + points.length) % points.length;
    const previousDirection = points[index]
      .clone()
      .sub(points[previousIndex])
      .normalize();
    const currentDirection = points[(index + 1) % points.length]
      .clone()
      .sub(points[index])
      .normalize();
    const previousNormal = new THREE.Vector2(
      -previousDirection.y,
      previousDirection.x,
    );
    const currentNormal = new THREE.Vector2(
      -currentDirection.y,
      currentDirection.x,
    );
    const previousOrigin = point
      .clone()
      .addScaledVector(
        previousNormal,
        roundedEdges[previousIndex] ? inset : 0,
      );
    const currentOrigin = point
      .clone()
      .addScaledVector(currentNormal, roundedEdges[index] ? inset : 0);
    const denominator = cross2(previousDirection, currentDirection);
    if (Math.abs(denominator) <= EPSILON) {
      return previousOrigin.add(currentOrigin).multiplyScalar(0.5);
    }
    const t = cross2(
      currentOrigin.clone().sub(previousOrigin),
      currentDirection,
    ) / denominator;
    return previousOrigin.addScaledVector(previousDirection, t);
  });
}

/**
 * Creates a face-edge round-over while leaving rail/stile glue seams square.
 * Per-edge offsets keep every ring vertex aligned, so changing a corner radius,
 * splay, depth, or round-over regenerates a closed fabrication solid
 * rather than a beveled visual stand-in.
 */
function createSelectivelyRoundedExtrusion(
  commands: HoverDiningTableProfileCommand[],
  depth: number,
  radius: number,
  curveSegments: number,
  roundoverSegments: number,
  xCenter: number,
) {
  const sampled = sampleClosedProfile(commands, curveSegments);
  const halfDepth = depth / 2;
  const layers: Array<{ x: number; inset: number }> = [];
  const pushLayer = (x: number, inset: number) => {
    const previous = layers[layers.length - 1];
    if (previous && Math.abs(previous.x - x) <= EPSILON) {
      previous.inset = Math.min(previous.inset, inset);
    } else {
      layers.push({ x, inset });
    }
  };
  for (let index = 0; index <= roundoverSegments; index += 1) {
    const offset = (index / roundoverSegments) * radius;
    const inset =
      radius -
      Math.sqrt(Math.max(0, radius ** 2 - (offset - radius) ** 2));
    pushLayer(xCenter - halfDepth + offset, inset);
  }
  pushLayer(xCenter + halfDepth - radius, 0);
  for (let index = 1; index <= roundoverSegments; index += 1) {
    const offset = (index / roundoverSegments) * radius;
    const inset = radius - Math.sqrt(Math.max(0, radius ** 2 - offset ** 2));
    pushLayer(xCenter + halfDepth - radius + offset, inset);
  }
  const rings = layers.map((layer) => ({
    x: layer.x,
    points: offsetProfileEdges(
      sampled.points,
      sampled.roundedEdges,
      layer.inset,
    ),
  }));
  const positions: number[] = [];
  const addTriangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ) => {
    const areaSquared = b
      .clone()
      .sub(a)
      .cross(c.clone().sub(a))
      .lengthSq();
    if (areaSquared <= EPSILON ** 2) return;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const as3 = (point: THREE.Vector2, x: number) =>
    new THREE.Vector3(x, point.x, point.y);
  const perimeterCount = sampled.points.length;
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const front = rings[ringIndex];
    const back = rings[ringIndex + 1];
    for (let index = 0; index < perimeterCount; index += 1) {
      const next = (index + 1) % perimeterCount;
      const frontCurrent = as3(front.points[index], front.x);
      const frontNext = as3(front.points[next], front.x);
      const backCurrent = as3(back.points[index], back.x);
      const backNext = as3(back.points[next], back.x);
      addTriangle(frontCurrent, frontNext, backNext);
      addTriangle(frontCurrent, backNext, backCurrent);
    }
  }
  const front = rings[0];
  const back = rings[rings.length - 1];
  const capTriangles = THREE.ShapeUtils.triangulateShape(front.points, []);
  for (const [a, b, c] of capTriangles) {
    addTriangle(
      as3(front.points[c], front.x),
      as3(front.points[b], front.x),
      as3(front.points[a], front.x),
    );
    addTriangle(
      as3(back.points[a], back.x),
      as3(back.points[b], back.x),
      as3(back.points[c], back.x),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Splits the finished end-box face profile at the four curve-tangent seams.
 * The two rails own both the inner and outer corner returns; the two stiles
 * retain the exact derived splay between those seams. This is the shared
 * fabrication profile used by exploded geometry and the cut sheet.
 */
function createEndBoxPartProfiles(spec: HoverDiningTableSpec) {
  const outer = spec.frameCornerStyle === "circular"
    ? getCircularRoundedTrapezoidDefinition(
        spec.frameBottomWidth,
        spec.frameTopWidth,
        0,
        spec.frameHeight,
        spec.frameOuterBottomCornerRadius,
        spec.frameOuterTopCornerRadius,
      )
    : getRoundedTrapezoidDefinition(
        spec.frameBottomWidth,
        spec.frameTopWidth,
        0,
        spec.frameHeight,
        spec.frameOuterBottomCornerRadius,
        spec.frameOuterTopCornerRadius,
        spec.frameOuterRailCurveTension,
        spec.frameOuterStileCurveTension,
      );
  const inner = spec.frameCornerStyle === "circular"
    ? getCircularRoundedTrapezoidDefinition(
        spec.openingBottomWidth,
        spec.openingTopWidth,
        spec.openingBottom,
        spec.openingTop,
        spec.frameInnerBottomCornerRadius,
        spec.frameInnerTopCornerRadius,
      )
    : getRoundedTrapezoidDefinition(
        spec.openingBottomWidth,
        spec.openingTopWidth,
        spec.openingBottom,
        spec.openingTop,
        spec.frameInnerBottomCornerRadius,
        spec.frameInnerTopCornerRadius,
        spec.frameInnerRailCurveTension,
        spec.frameInnerStileCurveTension,
      );
  const squareClose = { kind: "close", edgeTreatment: "square" } as const;
  const rightOuterFloor = new THREE.Vector2(spec.frameBottomWidth / 2, 0);
  const rightInnerFloor = new THREE.Vector2(spec.openingBottomWidth / 2, 0);
  const leftOuterFloor = new THREE.Vector2(-spec.frameBottomWidth / 2, 0);
  const leftInnerFloor = new THREE.Vector2(-spec.openingBottomWidth / 2, 0);
  const profiles: Record<EndBoxPartPosition, HoverDiningTableProfileCommand[]> = {
    top: [
      moveProfile(outer.leftUpper),
      curvedProfile(outer.topLeftCurve, true),
      lineProfile(outer.topRightEnd),
      curvedProfile(outer.topRightCurve, true),
      lineProfile(inner.rightUpper, "square"),
      curvedProfile(inner.topRightCurve),
      lineProfile(inner.topLeftStart),
      curvedProfile(inner.topLeftCurve),
      squareClose,
    ],
    bottom: [
      moveProfile(outer.leftLower),
      curvedProfile(outer.bottomLeftCurve),
      lineProfile(outer.bottomRightStart),
      curvedProfile(outer.bottomRightCurve),
      lineProfile(inner.rightLower, "square"),
      curvedProfile(inner.bottomRightCurve, true),
      lineProfile(inner.bottomLeftStart),
      curvedProfile(inner.bottomLeftCurve, true),
      squareClose,
    ],
    right: spec.endFrameStyle === "box"
      ? [
          moveProfile(outer.rightLower),
          lineProfile(outer.rightUpper),
          lineProfile(inner.rightUpper, "square"),
          lineProfile(inner.rightLower),
          squareClose,
        ]
      : [
          moveProfile(rightOuterFloor),
          lineProfile(outer.rightUpper),
          lineProfile(inner.rightUpper, "square"),
          lineProfile(rightInnerFloor),
          { kind: "close" },
        ],
    left: spec.endFrameStyle === "box"
      ? [
          moveProfile(outer.leftUpper),
          lineProfile(outer.leftLower),
          lineProfile(inner.leftLower, "square"),
          lineProfile(inner.leftUpper),
          squareClose,
        ]
      : [
          moveProfile(outer.leftUpper),
          lineProfile(leftOuterFloor),
          lineProfile(leftInnerFloor),
          lineProfile(inner.leftUpper),
          squareClose,
        ],
  };
  return profiles;
}

function createEndBoxPartFabricationProfile(
  spec: HoverDiningTableSpec,
  position: EndBoxPartPosition,
): HoverDiningTableFabricationProfile {
  const outline = createEndBoxPartProfiles(spec)[position];
  const bounds = profileBounds(outline);
  const sectionWidth = position === "top"
    ? spec.frameTopRailHeight
    : position === "bottom"
      ? spec.frameBottomRailHeight
      : spec.frameSideWidth;
  return {
    family: position === "top" || position === "bottom"
      ? "frame-rail"
      : "frame-stile",
    outline,
    bounds,
    section: {
      width: sectionWidth,
      thickness: spec.frameDepth,
      radius: spec.frameEdgeRoundover,
      label: "face-edge round-over",
      outline: roundedRectangleProfile(
        sectionWidth,
        spec.frameDepth,
        spec.frameEdgeRoundover,
      ),
    },
    bezier: (position === "top" || position === "bottom") &&
        spec.frameCornerStyle === "bezier"
      ? {
          outerRadius: position === "top"
            ? spec.frameOuterTopCornerRadius
            : spec.frameOuterBottomCornerRadius,
          innerRadius: position === "top"
            ? spec.frameInnerTopCornerRadius
            : spec.frameInnerBottomCornerRadius,
          outerRailTension: spec.frameOuterRailCurveTension,
          outerStileTension: spec.frameOuterStileCurveTension,
          innerRailTension: spec.frameInnerRailCurveTension,
          innerStileTension: spec.frameInnerStileCurveTension,
        }
      : undefined,
    cornerRadii: (position === "top" || position === "bottom") &&
        spec.frameCornerStyle === "circular"
      ? {
          outerRadius: position === "top"
            ? spec.frameOuterTopCornerRadius
            : spec.frameOuterBottomCornerRadius,
          innerRadius: position === "top"
            ? spec.frameInnerTopCornerRadius
            : spec.frameInnerBottomCornerRadius,
        }
      : undefined,
  };
}

/**
 * Returns the full-size, finished profiles assigned to each glue-up member of
 * an end box. Consumers such as routing templates must use these profiles so
 * the rail-owned corner returns and tangent-to-tangent stiles cannot drift.
 */
export function getHoverDiningTableEndBoxFabricationProfiles(
  params: ModelParams,
) {
  const { fullSize: spec } = getHoverDiningTableSpec(params);
  return {
    top: createEndBoxPartFabricationProfile(spec, "top"),
    bottom: createEndBoxPartFabricationProfile(spec, "bottom"),
    left: createEndBoxPartFabricationProfile(spec, "left"),
    right: createEndBoxPartFabricationProfile(spec, "right"),
  };
}

export type HoverDiningTableStileFabricationLayout = {
  origin: THREE.Vector2;
  lengthAxis: THREE.Vector2;
  widthAxis: THREE.Vector2;
  length: number;
  width: number;
};

/**
 * Places a finished stile in its grain-aligned fabrication frame. Its angled
 * rail seams change the inner-edge length, but they must not inflate the stock
 * width or make the routing template use the table's global vertical axis.
 */
export function getHoverDiningTableStileFabricationLayout(
  profile: HoverDiningTableFabricationProfile,
): HoverDiningTableStileFabricationLayout {
  if (profile.family !== "frame-stile") {
    throw new Error("Stile fabrication layout requires a frame-stile profile");
  }
  const move = profile.outline[0];
  const seamIndex = profile.outline.findIndex(
    (command, index) =>
      index > 0 &&
      (command.kind === "line" || command.kind === "cubic") &&
      command.edgeTreatment === "square",
  );
  const outerEnd = profile.outline[seamIndex - 1];
  if (
    move?.kind !== "move" ||
    seamIndex <= 1 ||
    !outerEnd ||
    outerEnd.kind === "move" ||
    outerEnd.kind === "close"
  ) {
    throw new Error("Stile profile is missing its outer tangent-to-tangent edge");
  }
  const origin = new THREE.Vector2(move.to.x, move.to.y);
  const lengthAxis = new THREE.Vector2(
    outerEnd.to.x - move.to.x,
    outerEnd.to.y - move.to.y,
  ).normalize();
  const widthAxis = new THREE.Vector2(lengthAxis.y, -lengthAxis.x);
  const profilePoints = profile.outline.flatMap((command) => {
    if (command.kind === "close") return [];
    if (command.kind === "cubic") {
      return [command.control1, command.control2, command.to];
    }
    return [command.to];
  });
  const localPoints = profilePoints.map((point) => {
    const relative = new THREE.Vector2(point.x, point.y).sub(origin);
    return new THREE.Vector2(
      relative.dot(lengthAxis),
      relative.dot(widthAxis),
    );
  });
  const bounds = new THREE.Box2().setFromPoints(localPoints);
  const length = bounds.max.x - bounds.min.x;
  const width = bounds.max.y - bounds.min.y;
  if (
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    length <= EPSILON ||
    width <= EPSILON
  ) {
    throw new Error("Stile fabrication layout has invalid local bounds");
  }
  return { origin, lengthAxis, widthAxis, length, width };
}

function createTabletopCrossSectionProfile(
  spec: HoverDiningTableSpec,
): HoverDiningTableProfileCommand[] {
  const halfWidth = spec.width / 2;
  const halfHeight = spec.topThickness / 2;
  const shoulder = halfWidth - spec.topEdgeRoll;
  const tension = spec.topEdgeTension;
  const height = spec.topThickness;
  return [
    { kind: "move", to: { x: -shoulder, y: 0 } },
    { kind: "line", to: { x: shoulder, y: 0 } },
    {
      kind: "cubic",
      control1: { x: shoulder + spec.topEdgeRoll * tension, y: 0 },
      control2: { x: halfWidth, y: halfHeight - halfHeight * tension },
      to: { x: halfWidth, y: halfHeight },
    },
    {
      kind: "cubic",
      control1: { x: halfWidth, y: halfHeight + halfHeight * tension },
      control2: { x: shoulder + spec.topEdgeRoll * tension, y: height },
      to: { x: shoulder, y: height },
    },
    { kind: "line", to: { x: -shoulder, y: height } },
    {
      kind: "cubic",
      control1: { x: -shoulder - spec.topEdgeRoll * tension, y: height },
      control2: { x: -halfWidth, y: halfHeight + halfHeight * tension },
      to: { x: -halfWidth, y: halfHeight },
    },
    {
      kind: "cubic",
      control1: { x: -halfWidth, y: halfHeight - halfHeight * tension },
      control2: { x: -shoulder - spec.topEdgeRoll * tension, y: 0 },
      to: { x: -shoulder, y: 0 },
    },
    { kind: "close" },
  ];
}

function createTabletopEdgeDetailProfile(
  spec: HoverDiningTableSpec,
): HoverDiningTableProfileCommand[] {
  const halfHeight = spec.topThickness / 2;
  const tension = spec.topEdgeTension;
  const flat = spec.topEdgeRoll * 0.55;
  return [
    { kind: "move", to: { x: -flat, y: 0 } },
    { kind: "line", to: { x: 0, y: 0 } },
    {
      kind: "cubic",
      control1: { x: spec.topEdgeRoll * tension, y: 0 },
      control2: {
        x: spec.topEdgeRoll,
        y: halfHeight - halfHeight * tension,
      },
      to: { x: spec.topEdgeRoll, y: halfHeight },
    },
    {
      kind: "cubic",
      control1: {
        x: spec.topEdgeRoll,
        y: halfHeight + halfHeight * tension,
      },
      control2: { x: spec.topEdgeRoll * tension, y: spec.topThickness },
      to: { x: 0, y: spec.topThickness },
    },
    { kind: "line", to: { x: -flat, y: spec.topThickness } },
    { kind: "close" },
  ];
}

function createTabletopFabricationProfile(
  spec: HoverDiningTableSpec,
): HoverDiningTableFabricationProfile {
  const outline = spec.topPlanCornerRadius > EPSILON
    ? roundedRectangleProfile(
        spec.length,
        spec.width,
        spec.topPlanCornerRadius,
      )
    : rectangleProfile(spec.length, spec.width);
  return {
    family: "tabletop",
    outline,
    bounds: profileBounds(outline),
    tabletop: {
      planCornerRadius: spec.topPlanCornerRadius,
      endFaceRoundover: spec.topEndFaceRoundover,
    },
    section: {
      width: spec.topEdgeRoll * 1.55,
      thickness: spec.topThickness,
      radius: spec.topEdgeRoll,
      label: "Bézier long-edge roll",
      outline: createTabletopEdgeDetailProfile(spec),
    },
  };
}

function createCChannelSectionProfile(
  channel: CChannelSpec,
): HoverDiningTableProfileCommand[] {
  const halfWidth = channel.width / 2;
  const innerHalfWidth = halfWidth - channel.wallThickness;
  const webTop = channel.wallThickness;
  return [
    { kind: "move", to: { x: -halfWidth, y: 0 } },
    { kind: "line", to: { x: halfWidth, y: 0 } },
    { kind: "line", to: { x: halfWidth, y: channel.depth } },
    { kind: "line", to: { x: innerHalfWidth, y: channel.depth } },
    { kind: "line", to: { x: innerHalfWidth, y: webTop } },
    { kind: "line", to: { x: -innerHalfWidth, y: webTop } },
    { kind: "line", to: { x: -innerHalfWidth, y: channel.depth } },
    { kind: "line", to: { x: -halfWidth, y: channel.depth } },
    { kind: "close" },
  ];
}

function createCChannelFabricationProfile(
  channel: CChannelSpec,
): HoverDiningTableFabricationProfile {
  const outline = rectangleProfile(channel.length, channel.width);
  return {
    family: "channel",
    outline,
    bounds: profileBounds(outline),
    section: {
      width: channel.width,
      thickness: channel.depth,
      radius: 0,
      label: "U-channel web + flanges",
      outline: createCChannelSectionProfile(channel),
    },
  };
}

function assertFabricationProfile(
  profile: HoverDiningTableFabricationProfile,
  label: string,
) {
  const width = profile.bounds.maxX - profile.bounds.minX;
  const height = profile.bounds.maxY - profile.bounds.minY;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= EPSILON ||
    height <= EPSILON
  ) {
    throw new Error(`${label} fabrication outline must have a positive envelope`);
  }
  if (
    profile.outline[0]?.kind !== "move" ||
    profile.outline[profile.outline.length - 1]?.kind !== "close"
  ) {
    throw new Error(`${label} fabrication outline must be a closed profile`);
  }
  if (
    profile.section.outline[0]?.kind !== "move" ||
    profile.section.outline[profile.section.outline.length - 1]?.kind !== "close"
  ) {
    throw new Error(`${label} must retain a closed section profile`);
  }
  const sectionTopRadius = profile.section.topRadius ?? 0;
  if (!Number.isFinite(sectionTopRadius) || sectionTopRadius < 0) {
    throw new Error(`${label} top edge radius must be finite and non-negative`);
  }
  if (profile.family === "channel") {
    if (
      profile.section.radius !== 0 ||
      profile.section.outline.some((command) => command.kind === "cubic")
    ) {
      throw new Error(`${label} channel must retain its square U-section`);
    }
  } else if (profile.family === "corner-brace") {
    if (
      profile.section.radius !== 0 ||
      sectionTopRadius !== 0 ||
      profile.section.outline.some((command) => command.kind === "cubic")
    ) {
      throw new Error(`${label} corner brace must retain its square housed-joint section`);
    }
  } else if (profile.family === "leveling-foot") {
    if (
      profile.section.radius !== 0 ||
      !profile.section.outline.some((command) => command.kind === "cubic")
    ) {
      throw new Error(`${label} leveling foot must retain its circular pad section`);
    }
  } else if (
    !Number.isFinite(profile.section.radius) ||
    (profile.section.radius <= 0 && sectionTopRadius <= 0) ||
    !profile.section.outline.some((command) => command.kind === "cubic")
  ) {
    throw new Error(`${label} must retain a curved edge-treatment section`);
  }
  const squareEdgeCount = profile.outline.filter(
    (command) =>
      command.kind !== "move" && command.edgeTreatment === "square",
  ).length;
  const cubicCount = profile.outline.filter(
    (command) => command.kind === "cubic",
  ).length;
  const arcCount = profile.outline.filter(
    (command) => command.kind === "arc",
  ).length;
  if (profile.family === "frame-rail") {
    const hasBezierReturns =
      cubicCount === 4 && arcCount === 0 && Boolean(profile.bezier);
    const hasCircularReturns =
      arcCount === 4 && cubicCount === 0 && Boolean(profile.cornerRadii);
    if ((!hasBezierReturns && !hasCircularReturns) || squareEdgeCount !== 2) {
      throw new Error(
        `${label} rail must retain four consistent corner returns and two square tangent seams`,
      );
    }
  } else if (profile.family === "frame-stile") {
    if (
      cubicCount !== 0 ||
      (squareEdgeCount !== 1 && squareEdgeCount !== 2)
    ) {
      throw new Error(
        `${label} stile must retain one or two square rail-tangent seams`,
      );
    }
  } else if (
    profile.family === "support" &&
    (profile.support?.shoulderRadius ?? 0) > EPSILON
  ) {
    if (
      cubicCount !== 0 ||
      arcCount !== 2 ||
      (squareEdgeCount !== 2 && squareEdgeCount !== 4)
    ) {
      throw new Error(
        `${label} must retain two circular upper-end returns and square lower edges`,
      );
    }
  } else if (profile.family !== "channel" && squareEdgeCount !== 0) {
    throw new Error(`${label} contains an unexpected square profile edge`);
  }
}

function createTabletopCrossSection(spec: HoverDiningTableSpec) {
  return createShapeFromProfile(createTabletopCrossSectionProfile(spec));
}

function createMortisedTabletopCrossSectionProfile(
  spec: HoverDiningTableSpec,
): HoverDiningTableProfileCommand[] {
  const base = createTabletopCrossSectionProfile(spec);
  const halfMortiseLength = spec.channels.length / 2;
  const firstCurveIndex = base.findIndex((command) => command.kind === "cubic");
  const shoulder = spec.width / 2 - spec.topEdgeRoll;
  return [
    { kind: "move", to: { x: -shoulder, y: 0 } },
    { kind: "line", to: { x: -halfMortiseLength, y: 0 } },
    {
      kind: "line",
      to: { x: -halfMortiseLength, y: spec.channels.depth },
    },
    {
      kind: "line",
      to: { x: halfMortiseLength, y: spec.channels.depth },
    },
    { kind: "line", to: { x: halfMortiseLength, y: 0 } },
    { kind: "line", to: { x: shoulder, y: 0 } },
    ...base.slice(firstCurveIndex),
  ];
}

function createTabletopSegmentGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
  xStart: number,
  xEnd: number,
  mortised: boolean,
) {
  const profile = mortised
    ? createMortisedTabletopCrossSectionProfile(spec)
    : createTabletopCrossSectionProfile(spec);
  const geometry = new THREE.ExtrudeGeometry(createShapeFromProfile(profile), {
    bevelEnabled: false,
    curveSegments: model.geometry.curveSegments,
    depth: xEnd - xStart,
    steps: 1,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      0, 0, 1, xStart,
      1, 0, 0, 0,
      0, 1, 0, spec.topBottom,
      0, 0, 0, 1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function tabletopEndFaceSetback(
  localZ: number,
  thickness: number,
  radius: number,
) {
  if (radius <= EPSILON) return 0;
  const faceDistance = Math.min(localZ, thickness - localZ);
  if (faceDistance >= radius) return 0;
  const circleOffset = radius - faceDistance;
  return radius - Math.sqrt(Math.max(0, radius ** 2 - circleOffset ** 2));
}

function tabletopPlanCornerSetback(distanceFromEnd: number, radius: number) {
  if (radius <= EPSILON || distanceFromEnd >= radius) return 0;
  const circleOffset = radius - Math.max(0, distanceFromEnd);
  return radius - Math.sqrt(Math.max(0, radius ** 2 - circleOffset ** 2));
}

/**
 * Builds one rounded length end as a shared sweep of the exact long-edge
 * cross-section. The longitudinal endpoint varies by Z for the end-face
 * round-over, while the Y envelope varies by distance from that endpoint for
 * the plan corner. At the inner seam both effects reach zero and match the
 * ordinary mortise-ready tabletop extrusion exactly.
 */
function createRoundedTabletopEndGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
  endSign: -1 | 1,
) {
  const transitionLength =
    spec.topPlanCornerRadius + spec.topEndFaceRoundover;
  const sampled = sampleClosedProfile(
    createTabletopCrossSectionProfile(spec),
    model.geometry.curveSegments,
  );
  const perimeter = sampled.points.slice();
  if (
    perimeter.length > 1 &&
    perimeter[0].distanceTo(perimeter[perimeter.length - 1]) <= EPSILON
  ) {
    perimeter.pop();
  }
  const ringCount = Math.max(6, model.geometry.curveSegments);
  const innerAbsX = spec.length / 2 - transitionLength;
  const rings: THREE.Vector3[][] = [];
  for (let ringIndex = 0; ringIndex <= ringCount; ringIndex += 1) {
    const progress = ringIndex / ringCount;
    rings.push(
      perimeter.map((point) => {
        const endFaceSetback = tabletopEndFaceSetback(
          point.y,
          spec.topThickness,
          spec.topEndFaceRoundover,
        );
        const endAbsX = spec.length / 2 - endFaceSetback;
        const absX = endAbsX + (innerAbsX - endAbsX) * progress;
        const distanceFromEnd = endAbsX - absX;
        const planSetback = tabletopPlanCornerSetback(
          distanceFromEnd,
          spec.topPlanCornerRadius,
        );
        const y = point.x === 0
          ? 0
          : Math.sign(point.x) * (Math.abs(point.x) - planSetback);
        return new THREE.Vector3(
          endSign * absX,
          y,
          spec.topBottom + point.y,
        );
      }),
    );
  }

  const positions: number[] = [];
  const addTriangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const perimeterCount = perimeter.length;
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const outer = rings[ringIndex];
    const inner = rings[ringIndex + 1];
    for (let index = 0; index < perimeterCount; index += 1) {
      const next = (index + 1) % perimeterCount;
      if (endSign > 0) {
        addTriangle(outer[index], inner[next], outer[next]);
        addTriangle(outer[index], inner[index], inner[next]);
      } else {
        addTriangle(outer[index], outer[next], inner[next]);
        addTriangle(outer[index], inner[next], inner[index]);
      }
    }
  }

  const addCap = (ring: THREE.Vector3[], outer: boolean) => {
    const center = new THREE.Vector3(
      outer ? endSign * spec.length / 2 : endSign * innerAbsX,
      0,
      spec.topBottom + spec.topThickness / 2,
    );
    for (let index = 0; index < perimeterCount; index += 1) {
      const next = (index + 1) % perimeterCount;
      const forward = (outer && endSign > 0) || (!outer && endSign < 0);
      if (forward) addTriangle(center, ring[index], ring[next]);
      else addTriangle(center, ring[next], ring[index]);
    }
  };
  addCap(rings[0], true);
  addCap(rings[rings.length - 1], false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTabletopGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
) {
  const segments: THREE.BufferGeometry[] = [];
  const transitionLength =
    spec.topPlanCornerRadius + spec.topEndFaceRoundover;
  let cursor = -spec.length / 2;
  const tableEnd = spec.length / 2;
  if (transitionLength > EPSILON) {
    segments.push(createRoundedTabletopEndGeometry(spec, model, -1));
    cursor += transitionLength;
  }
  for (const centerX of spec.channels.centerXs) {
    const channelStart = centerX - spec.channels.width / 2;
    const channelEnd = centerX + spec.channels.width / 2;
    if (channelStart > cursor + EPSILON) {
      segments.push(
        createTabletopSegmentGeometry(spec, model, cursor, channelStart, false),
      );
    }
    segments.push(
      createTabletopSegmentGeometry(spec, model, channelStart, channelEnd, true),
    );
    cursor = channelEnd;
  }
  const finalFlatEnd = tableEnd - transitionLength;
  if (cursor < finalFlatEnd - EPSILON) {
    segments.push(
      createTabletopSegmentGeometry(spec, model, cursor, finalFlatEnd, false),
    );
  }
  if (transitionLength > EPSILON) {
    segments.push(createRoundedTabletopEndGeometry(spec, model, 1));
  }
  const geometry = mergeGeometryList(
    segments,
    "Unable to merge mortised Hover-table tabletop geometry",
  );
  assignDirectionalWoodUvs(
    geometry,
    new THREE.Vector3(1, 0, 0),
    grainTextureSize(spec),
    "tabletop",
  );
  return geometry;
}

function createCChannelGeometry(channel: CChannelSpec, centerX: number) {
  const geometry = new THREE.ExtrudeGeometry(
    createShapeFromProfile(createCChannelSectionProfile(channel)),
    {
      bevelEnabled: false,
      curveSegments: 1,
      depth: channel.length,
      steps: 1,
    },
  );
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      1, 0, 0, centerX,
      0, 0, 1, -channel.length / 2,
      0, 1, 0, channel.zBottom,
      0, 0, 0, 1,
    ),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLevelingFootFabricationProfile(
  feet: LevelingFeetSpec,
): HoverDiningTableFabricationProfile {
  const totalHeight = feet.padThickness + feet.rodLength;
  const outline = rectangleProfile(feet.padDiameter, totalHeight);
  return {
    family: "leveling-foot",
    outline,
    bounds: profileBounds(outline),
    section: {
      width: feet.padDiameter,
      thickness: feet.padThickness,
      radius: 0,
      label: "pad + threaded rod",
      outline: roundedRectangleProfile(
        feet.padDiameter,
        feet.padDiameter,
        feet.padDiameter / 2,
      ),
    },
  };
}

function createLevelingFootGeometry(
  feet: LevelingFeetSpec,
  centerX: number,
  centerY: number,
) {
  const pad = new THREE.CylinderGeometry(
    feet.padDiameter / 2,
    feet.padDiameter / 2,
    feet.padThickness,
    32,
  );
  pad.rotateX(Math.PI / 2);
  pad.translate(centerX, centerY, feet.padThickness / 2);
  const rod = new THREE.CylinderGeometry(
    feet.rodDiameter / 2,
    feet.rodDiameter / 2,
    feet.rodLength,
    24,
  );
  rod.rotateX(Math.PI / 2);
  rod.translate(
    centerX,
    centerY,
    feet.padThickness + feet.rodLength / 2,
  );
  return mergeGeometryList(
    [pad, rod],
    "Unable to merge leveling-foot geometry",
  );
}

export function createHoverDiningTableHardwareGeometries(params: ModelParams) {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  return {
    channels: spec.channels.centerXs.map((centerX) =>
      createCChannelGeometry(spec.channels, centerX),
    ),
    feet: spec.levelingFeet.enabled
      ? ([-1, 1] as const).flatMap((endSign) =>
          spec.levelingFeet.centerYs.map((centerY) =>
            createLevelingFootGeometry(
              spec.levelingFeet,
              endSign * spec.frameCenterX,
              centerY,
            ),
          ),
        )
      : [],
  };
}

function createEndFrameGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
  x: number,
) {
  const positions: EndBoxPartPosition[] =
    spec.endFrameStyle === "legs"
      ? ["top", "left", "right"]
      : ["top", "bottom", "left", "right"];
  const errorMessage = spec.endFrameStyle === "legs"
    ? "Unable to merge open-leg end-frame geometry"
    : "Unable to merge closed-box end-frame geometry";
  return mergeGeometryList(
    positions.map((position) =>
      createEndBoxFinishedPartGeometry(spec, model, x, position),
    ),
    errorMessage,
  );
}

function polygonArea(points: THREE.Vector2[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function ensureCounterClockwise(points: THREE.Vector2[]) {
  return polygonArea(points) < 0 ? points.slice().reverse() : points;
}

function miteredBraceFootprint(brace: BracePlaneSpec, slopeSign: -1 | 1) {
  const halfX = brace.spanX / 2;
  const leftY = -slopeSign * brace.endpointY;
  const rightY = slopeSign * brace.endpointY;
  return ensureCounterClockwise([
    new THREE.Vector2(-halfX, leftY - brace.miterHalfWidth),
    new THREE.Vector2(halfX, rightY - brace.miterHalfWidth),
    new THREE.Vector2(halfX, rightY + brace.miterHalfWidth),
    new THREE.Vector2(-halfX, leftY + brace.miterHalfWidth),
  ]);
}

function polygonProfile(
  points: THREE.Vector2[],
): HoverDiningTableProfileCommand[] {
  return [
    moveProfile(points[0]),
    ...points.slice(1).map((point) => lineProfile(point)),
    { kind: "close" as const },
  ];
}

function createBraceFabricationProfile(
  brace: BracePlaneSpec,
): HoverDiningTableFabricationProfile {
  const direction = new THREE.Vector2(brace.spanX, brace.spanY).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const localPoints = miteredBraceFootprint(brace, 1).map(
    (point) => new THREE.Vector2(point.dot(direction), point.dot(normal)),
  );
  const outline = polygonProfile(localPoints);
  return {
    family: "brace",
    outline,
    bounds: profileBounds(outline),
    section: {
      width: brace.width,
      thickness: brace.thickness,
      radius: brace.edgeRadius,
      topRadius: brace.topEdgeRadius,
      label:
        brace.topEdgeRadius > EPSILON
          ? "bottom + top long-edge round-overs"
          : "bottom long-edge round-over",
      outline: supportRoundedRectangleProfile(
        brace.width,
        brace.thickness,
        brace.edgeRadius,
        brace.topEdgeRadius,
      ),
    },
  };
}

function createStraightSupportFabricationProfile(
  support: StraightSupportSpec,
): HoverDiningTableFabricationProfile {
  const outline = support.shoulderRadius > EPSILON
    ? straightSupportSideProfile(support)
    : support.endRadius > EPSILON
      ? circularRoundedRectangleProfile(
          support.spanX,
          support.width,
          support.endRadius,
        )
      : rectangleProfile(support.spanX, support.width);
  return {
    family: "support",
    outline,
    bounds: profileBounds(outline),
    support: {
      endRadius: support.endRadius,
      shoulderRadius: support.shoulderRadius,
    },
    section: {
      width: support.width,
      thickness: support.thickness,
      radius: support.edgeRadius,
      topRadius: support.topEdgeRadius,
      label:
        support.edgeRadius > EPSILON && support.topEdgeRadius > EPSILON
          ? "bottom + top long-edge round-overs"
          : support.topEdgeRadius > EPSILON
            ? "top long-edge round-over"
            : support.edgeRadius > EPSILON
              ? "bottom long-edge round-over"
              : "square long edges",
      outline: supportRoundedRectangleProfile(
        support.width,
        support.thickness,
        support.edgeRadius,
        support.topEdgeRadius,
      ),
    },
  };
}

function clipPolygonHalfPlane(
  polygon: THREE.Vector2[],
  normal: THREE.Vector2,
  offset: number,
  keepLess: boolean,
) {
  const result: THREE.Vector2[] = [];
  const signedDistance = (point: THREE.Vector2) => point.dot(normal) - offset;
  const inside = (distance: number) =>
    keepLess ? distance <= EPSILON : distance >= -EPSILON;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = signedDistance(current);
    const nextDistance = signedDistance(next);
    const currentInside = inside(currentDistance);
    const nextInside = inside(nextDistance);
    if (currentInside) result.push(current.clone());
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      if (Math.abs(denominator) > EPSILON) {
        const t = currentDistance / denominator;
        result.push(current.clone().lerp(next, t));
      }
    }
  }
  return result.length >= 3 ? ensureCounterClockwise(result) : [];
}

function insetBraceSides(
  points: THREE.Vector2[],
  brace: BracePlaneSpec,
  slopeSign: -1 | 1,
  inset: number,
) {
  if (inset <= EPSILON) return ensureCounterClockwise(points);
  const normal = braceNormal(brace, slopeSign);
  const limit = brace.width / 2 - inset;
  return clipPolygonHalfPlane(
    clipPolygonHalfPlane(points, normal, limit, true),
    normal,
    -limit,
    false,
  );
}

function alignConvexPolygon(points: THREE.Vector2[]) {
  const polygon = ensureCounterClockwise(points).map((point) => point.clone());
  let startIndex = 0;
  for (let index = 1; index < polygon.length; index += 1) {
    const candidate = polygon[index];
    const current = polygon[startIndex];
    if (
      candidate.x < current.x - EPSILON ||
      (Math.abs(candidate.x - current.x) <= EPSILON &&
        candidate.y < current.y)
    ) {
      startIndex = index;
    }
  }
  return [
    ...polygon.slice(startIndex),
    ...polygon.slice(0, startIndex),
  ];
}

function createRoundedPlanPrism(
  points: THREE.Vector2[],
  zBottom: number,
  zTop: number,
  brace: BracePlaneSpec,
  slopeSign: -1 | 1,
  roundBottom: boolean,
  roundTop: boolean,
  roundoverSegments: number,
) {
  const height = zTop - zBottom;
  if (points.length < 3 || height <= EPSILON) return null;
  const bottomRadius = roundBottom
    ? Math.min(
        brace.edgeRadius,
        brace.width / 2 - EPSILON,
        height - EPSILON,
      )
    : 0;
  const topRadius = roundTop
    ? Math.min(
        brace.topEdgeRadius,
        brace.width / 2 - EPSILON,
        height - bottomRadius - EPSILON,
      )
    : 0;
  const layers: Array<{ z: number; inset: number }> = [];
  const pushLayer = (z: number, inset: number) => {
    const previous = layers[layers.length - 1];
    if (previous && Math.abs(previous.z - z) <= EPSILON) {
      previous.inset = Math.min(previous.inset, inset);
    } else {
      layers.push({ z, inset });
    }
  };
  if (bottomRadius > EPSILON) {
    for (let index = 0; index <= roundoverSegments; index += 1) {
      const offset = (index / roundoverSegments) * bottomRadius;
      const inset =
        bottomRadius -
        Math.sqrt(
          Math.max(0, bottomRadius ** 2 - (offset - bottomRadius) ** 2),
        );
      pushLayer(zBottom + offset, inset);
    }
  } else {
    pushLayer(zBottom, 0);
  }
  if (topRadius > EPSILON) {
    pushLayer(zTop - topRadius, 0);
    for (let index = 1; index <= roundoverSegments; index += 1) {
      const offset = (index / roundoverSegments) * topRadius;
      const inset =
        topRadius -
        Math.sqrt(Math.max(0, topRadius ** 2 - offset ** 2));
      pushLayer(zTop - topRadius + offset, inset);
    }
  } else {
    pushLayer(zTop, 0);
  }

  const rings = layers.map((layer) => {
    const inset = insetBraceSides(points, brace, slopeSign, layer.inset);
    if (inset.length < 3) {
      throw new Error("Brace round-over consumed a half-lap region");
    }
    return {
      z: layer.z,
      points: alignConvexPolygon(inset),
    };
  });
  const perimeterCount = rings[0].points.length;
  if (
    perimeterCount < 3 ||
    rings.some((ring) => ring.points.length !== perimeterCount)
  ) {
    throw new Error("Rounded X-brace layers must preserve aligned cut planes");
  }
  const positions: number[] = [];
  const addTriangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const as3 = (point: THREE.Vector2, z: number) =>
    new THREE.Vector3(point.x, point.y, z);

  for (let layerIndex = 0; layerIndex < rings.length - 1; layerIndex += 1) {
    const lower = rings[layerIndex];
    const upper = rings[layerIndex + 1];
    for (let index = 0; index < perimeterCount; index += 1) {
      const next = (index + 1) % perimeterCount;
      const lowerCurrent = as3(lower.points[index], lower.z);
      const lowerNext = as3(lower.points[next], lower.z);
      const upperCurrent = as3(upper.points[index], upper.z);
      const upperNext = as3(upper.points[next], upper.z);
      addTriangle(lowerCurrent, lowerNext, upperNext);
      addTriangle(lowerCurrent, upperNext, upperCurrent);
    }
  }

  const bottom = rings[0];
  const top = rings[rings.length - 1];
  const bottomCenter = bottom.points
    .reduce((sum, point) => sum.add(as3(point, bottom.z)), new THREE.Vector3())
    .multiplyScalar(1 / perimeterCount);
  const topCenter = top.points
    .reduce((sum, point) => sum.add(as3(point, top.z)), new THREE.Vector3())
    .multiplyScalar(1 / perimeterCount);
  for (let index = 0; index < perimeterCount; index += 1) {
    const next = (index + 1) % perimeterCount;
    addTriangle(
      bottomCenter,
      as3(bottom.points[next], bottom.z),
      as3(bottom.points[index], bottom.z),
    );
    addTriangle(
      topCenter,
      as3(top.points[index], top.z),
      as3(top.points[next], top.z),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function braceNormal(brace: BracePlaneSpec, slopeSign: -1 | 1) {
  const direction = new THREE.Vector2(
    brace.spanX,
    slopeSign * brace.spanY,
  ).normalize();
  return new THREE.Vector2(-direction.y, direction.x);
}

function cornerKneeBraceAsPlane(braces: CornerKneeBraceSpec): BracePlaneSpec {
  return {
    width: braces.width,
    thickness: braces.thickness,
    endpointInset: 0,
    edgeRadius: braces.edgeRadius,
    topEdgeRadius: 0,
    spanX: braces.reach,
    spanY: braces.reach,
    endpointY: braces.reach / 2,
    endpointOuterY: braces.reach / 2,
    cornerTangentY: braces.contactY,
    miterHalfWidth: braces.width / Math.SQRT2,
    diagonalLength: braces.centerlineLength,
    angleRadians: braces.angleRadians,
    zBottom: braces.zBottom,
    zTop: braces.zTop,
    halfLapDepth: braces.thickness / 2,
  };
}

function cornerKneeBraceFootprint(
  braces: CornerKneeBraceSpec,
  endSign: -1 | 1,
  sideSign: -1 | 1,
) {
  const xFace = endSign * braces.contactX;
  const yFace = sideSign * braces.contactY;
  const start = new THREE.Vector2(
    xFace - endSign * braces.reach,
    yFace,
  );
  const end = new THREE.Vector2(
    xFace,
    yFace - sideSign * braces.reach,
  );
  const direction = end.clone().sub(start).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const extension = braces.width * 2;
  const halfWidth = braces.width / 2;
  let footprint = ensureCounterClockwise([
    start.clone().addScaledVector(direction, -extension).addScaledVector(normal, -halfWidth),
    end.clone().addScaledVector(direction, extension).addScaledVector(normal, -halfWidth),
    end.clone().addScaledVector(direction, extension).addScaledVector(normal, halfWidth),
    start.clone().addScaledVector(direction, -extension).addScaledVector(normal, halfWidth),
  ]);
  footprint = clipPolygonHalfPlane(
    footprint,
    new THREE.Vector2(endSign, 0),
    braces.contactX,
    true,
  );
  footprint = clipPolygonHalfPlane(
    footprint,
    new THREE.Vector2(0, sideSign),
    braces.contactY,
    true,
  );
  if (footprint.length !== 4) {
    throw new Error("Corner brace must retain four mitered plan faces");
  }
  return footprint;
}

function createCornerKneeBraceFabricationProfile(
  braces: CornerKneeBraceSpec,
): HoverDiningTableFabricationProfile {
  const footprint = cornerKneeBraceFootprint(braces, 1, 1);
  const direction = new THREE.Vector2(1, -1).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const localPoints = footprint.map(
    (point) => new THREE.Vector2(point.dot(direction), point.dot(normal)),
  );
  const outline = polygonProfile(ensureCounterClockwise(localPoints));
  return {
    family: "corner-brace",
    outline,
    bounds: profileBounds(outline),
    section: {
      width: braces.width,
      thickness: braces.thickness,
      radius: braces.edgeRadius,
      topRadius: 0,
      label: "square housed-joint edges",
      outline: supportRoundedRectangleProfile(
        braces.width,
        braces.thickness,
        braces.edgeRadius,
        0,
      ),
    },
  };
}

function createCornerKneeBraceParts(
  braces: CornerKneeBraceSpec,
  model: HoverDiningTableModelDefinition,
  textureSize: number,
) {
  if (!braces.enabled) return [];
  const plane = cornerKneeBraceAsPlane(braces);
  return ([-1, 1] as const).flatMap((endSign) =>
    ([-1, 1] as const).map((sideSign) => {
      const slopeSign = (-endSign * sideSign) as -1 | 1;
      const geometry = createRoundedPlanPrism(
        cornerKneeBraceFootprint(braces, endSign, sideSign),
        braces.zBottom,
        braces.zTop,
        plane,
        slopeSign,
        false,
        false,
        model.geometry.braceRoundoverSegments,
      );
      if (!geometry) {
        throw new Error("Unable to create top-frame corner-brace geometry");
      }
      assignDirectionalWoodUvs(
        geometry,
        new THREE.Vector3(endSign, -sideSign, 0),
        textureSize,
        `${endSign < 0 ? "left" : "right"}-${sideSign < 0 ? "front" : "back"}-top-frame-knee-brace`,
      );
      return geometry;
    }),
  );
}

function addPlanarWoodUvs(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  if (!bounds || !position) {
    throw new Error("Unable to derive X-Hover wood texture coordinates");
  }

  const extents = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ];
  const axes = [0, 1, 2].sort((a, b) => extents[b] - extents[a]);
  const primaryAxis = axes[0];
  const secondaryAxis = axes[1];
  const primarySpan = Math.max(extents[primaryAxis], EPSILON);
  const secondarySpan = Math.max(extents[secondaryAxis], EPSILON);
  const minima = [bounds.min.x, bounds.min.y, bounds.min.z];
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const coordinates = [
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ];
    uv[index * 2] =
      (coordinates[primaryAxis] - minima[primaryAxis]) / primarySpan;
    uv[index * 2 + 1] =
      (coordinates[secondaryAxis] - minima[secondaryAxis]) / secondarySpan;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Builds one X as two closed, non-overlapping half-lapped braces. The clipped
 * upper/lower footprints follow the other brace's actual angled edges, so the
 * center shoulders are derived from the included angle rather than overcut as
 * perpendicular slots.
 */
function mergeGeometryList(
  geometries: THREE.BufferGeometry[],
  errorMessage: string,
) {
  const nonIndexed = geometries.map((geometry) => {
    if (!geometry.index) return geometry;
    const converted = geometry.toNonIndexed();
    converted.userData = { ...geometry.userData };
    return converted;
  });
  for (const geometry of nonIndexed) {
    if (!geometry.getAttribute("uv")) addPlanarWoodUvs(geometry);
  }
  const merged = mergeGeometries(nonIndexed, false);
  const woodGrainParts = collectWoodGrainParts(nonIndexed);
  for (const geometry of new Set([...geometries, ...nonIndexed])) {
    if (geometry !== merged) geometry.dispose();
  }
  if (!merged) throw new Error(errorMessage);
  if (woodGrainParts.length > 0) {
    merged.userData.woodGrainParts = woodGrainParts;
  }
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createHalfLappedXParts(
  brace: BracePlaneSpec,
  halfLapClearance: number,
  model: HoverDiningTableModelDefinition,
  textureSize: number,
  partPrefix: string,
) {
  const a = miteredBraceFootprint(brace, 1);
  const b = miteredBraceFootprint(brace, -1);
  const normalA = braceNormal(brace, 1);
  const normalB = braceNormal(brace, -1);
  const midpoint = (brace.zBottom + brace.zTop) / 2;
  const lowerMatingZ = midpoint - halfLapClearance / 2;
  const upperMatingZ = midpoint + halfLapClearance / 2;
  const braceAGeometries: THREE.BufferGeometry[] = [];
  const braceBGeometries: THREE.BufferGeometry[] = [];
  const add = (
    target: THREE.BufferGeometry[],
    points: THREE.Vector2[],
    zBottom: number,
    zTop: number,
    slopeSign: -1 | 1,
  ) => {
    const geometry = createRoundedPlanPrism(
      points,
      zBottom,
      zTop,
      brace,
      slopeSign,
      Math.abs(zBottom - brace.zBottom) <= EPSILON,
      Math.abs(zTop - brace.zTop) <= EPSILON,
      model.geometry.braceRoundoverSegments,
    );
    if (geometry) target.push(geometry);
  };

  // Brace A owns the lower half through the crossing.
  add(braceAGeometries, a, brace.zBottom, lowerMatingZ, 1);
  add(
    braceAGeometries,
    clipPolygonHalfPlane(a, normalB, -brace.width / 2, true),
    lowerMatingZ,
    brace.zTop,
    1,
  );
  add(
    braceAGeometries,
    clipPolygonHalfPlane(a, normalB, brace.width / 2, false),
    lowerMatingZ,
    brace.zTop,
    1,
  );

  // Brace B owns the upper half through the crossing.
  add(braceBGeometries, b, upperMatingZ, brace.zTop, -1);
  add(
    braceBGeometries,
    clipPolygonHalfPlane(b, normalA, -brace.width / 2, true),
    brace.zBottom,
    upperMatingZ,
    -1,
  );
  add(
    braceBGeometries,
    clipPolygonHalfPlane(b, normalA, brace.width / 2, false),
    brace.zBottom,
    upperMatingZ,
    -1,
  );
  const members = [
    mergeGeometryList(
      braceAGeometries,
      "Unable to merge lower-half X-brace member",
    ),
    mergeGeometryList(
      braceBGeometries,
      "Unable to merge upper-half X-brace member",
    ),
  ];
  members.forEach((geometry, index) => {
    const slopeSign = index === 0 ? 1 : -1;
    assignDirectionalWoodUvs(
      geometry,
      new THREE.Vector3(brace.spanX, slopeSign * brace.spanY, 0),
      textureSize,
      `${partPrefix}-bar-${index + 1}`,
    );
  });
  return members;
}

function createStraightSupportParts(
  support: StraightSupportSpec,
  model: HoverDiningTableModelDefinition,
  textureSize: number,
  partPrefix: string,
) {
  const halfX = support.spanX / 2;
  const halfWidth = support.width / 2;
  const prismSpec: BracePlaneSpec = {
    width: support.width,
    thickness: support.thickness,
    endpointInset: support.endpointInset,
    edgeRadius: support.edgeRadius,
    topEdgeRadius: support.topEdgeRadius,
    spanX: support.spanX,
    spanY: 0,
    endpointY: 0,
    endpointOuterY: 0,
    cornerTangentY: support.placementBoundaryY ?? 0,
    miterHalfWidth: halfWidth,
    diagonalLength: support.spanX,
    angleRadians: 0,
    zBottom: support.zBottom,
    zTop: support.zTop,
    halfLapDepth: support.thickness / 2,
  };
  return support.centerYs.map((centerY, index) => {
    const geometry = support.shoulderRadius > EPSILON
      ? createSelectivelyRoundedExtrusion(
          straightSupportSideProfile(support),
          support.width,
          support.topEdgeRadius,
          model.geometry.curveSegments,
          model.geometry.braceRoundoverSegments,
          0,
        )
      : support.endRadius > EPSILON
      ? createSelectivelyRoundedExtrusion(
          supportRoundedRectangleProfile(
            support.width,
            support.thickness,
            support.edgeRadius,
            support.topEdgeRadius,
          ),
          support.spanX,
          support.endRadius,
          model.geometry.curveSegments,
          model.geometry.braceRoundoverSegments,
          0,
        )
      : createRoundedPlanPrism(
          ensureCounterClockwise([
            new THREE.Vector2(-halfX, -halfWidth),
            new THREE.Vector2(halfX, -halfWidth),
            new THREE.Vector2(halfX, halfWidth),
            new THREE.Vector2(-halfX, halfWidth),
          ]),
          support.zBottom,
          support.zTop,
          prismSpec,
          1,
          true,
          true,
          model.geometry.braceRoundoverSegments,
        );
    if (!geometry) {
      throw new Error("Unable to create straight support geometry");
    }
    if (support.shoulderRadius > EPSILON) {
      geometry.applyMatrix4(
        new THREE.Matrix4().set(
          0, -1, 0, 0,
          1, 0, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ),
      );
    }
    geometry.translate(
      0,
      centerY,
      support.endRadius > EPSILON || support.shoulderRadius > EPSILON
        ? (support.zBottom + support.zTop) / 2
        : 0,
    );
    assignDirectionalWoodUvs(
      geometry,
      new THREE.Vector3(1, 0, 0),
      textureSize,
      support.centerYs.length === 1
        ? partPrefix
        : `${partPrefix}-${index + 1}`,
    );
    return geometry;
  });
}

export function createHoverDiningTableGeometry(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
) {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const upperSupports =
    spec.topSupportStyle === "x"
      ? createHalfLappedXParts(
          spec.upperBrace,
          spec.halfLapClearance,
          model,
          grainTextureSize(spec),
          "upper-x",
        )
      : createStraightSupportParts(
          spec.upperStretchers,
          model,
          grainTextureSize(spec),
          "upper-stretcher",
        );
  const lowerSupports =
    spec.bottomSupportStyle === "x"
      ? createHalfLappedXParts(
          spec.lowerBrace,
          spec.halfLapClearance,
          model,
          grainTextureSize(spec),
          "floor-x",
        )
      : spec.bottomSupportStyle === "center-board"
        ? createStraightSupportParts(
            spec.lowerCenterBoard,
            model,
            grainTextureSize(spec),
            "floor-center-board",
          )
        : [];
  const cornerKneeBraces = createCornerKneeBraceParts(
    spec.cornerKneeBraces,
    model,
    grainTextureSize(spec),
  );
  const geometries = [
    createTabletopGeometry(spec, model),
    createEndFrameGeometry(spec, model, -spec.frameCenterX),
    createEndFrameGeometry(spec, model, spec.frameCenterX),
    ...upperSupports,
    ...cornerKneeBraces,
    ...lowerSupports,
  ];
  return mergeGeometryList(
    geometries,
    "Unable to merge dining-table support geometry",
  );
}

export type HoverDiningTableExplodedPart = {
  name: string;
  category:
    | "tabletop"
    | "tabletop-hardware"
    | "end-box-horizontal"
    | "end-box-vertical"
    | "upper-x"
    | "upper-corner-brace"
    | "floor-x"
    | "upper-stretcher"
    | "floor-center-board"
    | "leveling-foot";
  material: "Oak" | "Steel";
  geometry: THREE.BufferGeometry;
  offset: THREE.Vector3;
  fabricationProfile: HoverDiningTableFabricationProfile;
};

export type HoverDiningTableCutPart = {
  id: string;
  name: string;
  assembly:
    | "tabletop"
    | "tabletop hardware"
    | "end boxes"
    | "upper X"
    | "upper corner braces"
    | "floor X"
    | "upper stretchers"
    | "floor center board"
    | "leveling feet";
  kind:
    | "tabletop"
    | "rail"
    | "stile"
    | "brace"
    | "support"
    | "channel"
    | "leveling-foot";
  material: "Oak" | "Steel";
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  grainDirection: "length" | "n/a";
  fabricationProfile: HoverDiningTableFabricationProfile;
  cutAngleDegrees?: number;
  lap?: {
    face: "top" | "bottom";
    centerFromEnd: number;
    length: number;
    depth: number;
    fitClearance: number;
    shoulderAngleDegrees: number;
  };
  processDimensions?: Array<{
    label: string;
    value: number;
    format?: "length" | "ratio";
  }>;
  notes: string[];
};

export type HoverDiningTableCutList = {
  material: "White oak + blackened steel";
  dimensionBasis: "full-size finished dimensions";
  totalPieces: number;
  parts: HoverDiningTableCutPart[];
};

function createBraceCutParts(
  prefix: "U" | "F",
  assembly: "upper X" | "floor X",
  brace: BracePlaneSpec,
  halfLapClearance: number,
): HoverDiningTableCutPart[] {
  const includedAngle = Math.abs(brace.angleRadians) * 2;
  const lapLength = brace.width / Math.sin(includedAngle);
  const common = {
    assembly,
    kind: "brace" as const,
    material: "Oak" as const,
    quantity: 1,
    length: brace.diagonalLength,
    width: brace.width,
    thickness: brace.thickness,
    grainDirection: "length" as const,
    fabricationProfile: createBraceFabricationProfile(brace),
    cutAngleDegrees: THREE.MathUtils.radToDeg(Math.abs(brace.angleRadians)),
    notes: [
      "Parallel end cuts bear flush on the end-box inside faces.",
      brace.topEdgeRadius > EPSILON
        ? "Round over the bottom and top long edges to their independently listed radii."
        : "Round over the bottom long edge to the listed radius; leave the top edge square.",
    ],
    processDimensions: [
      { label: "Bottom edge round-over", value: brace.edgeRadius },
      ...(brace.topEdgeRadius > EPSILON
        ? [{ label: "Top edge round-over", value: brace.topEdgeRadius }]
        : []),
    ],
  };
  const lap = {
    centerFromEnd: brace.diagonalLength / 2,
    length: lapLength,
    depth: brace.halfLapDepth + halfLapClearance / 2,
    fitClearance: halfLapClearance,
    shoulderAngleDegrees: THREE.MathUtils.radToDeg(includedAngle),
  };
  return [
    {
      ...common,
      id: `${prefix}1`,
      name: `${assembly === "upper X" ? "Upper" : "Floor"} X — member A`,
      lap: { ...lap, face: "top" },
    },
    {
      ...common,
      id: `${prefix}2`,
      name: `${assembly === "upper X" ? "Upper" : "Floor"} X — member B`,
      lap: { ...lap, face: "bottom" },
    },
  ];
}

function createStraightSupportCutPart(
  id: "S1" | "C1",
  name: "Upper lengthwise stretcher" | "Floor center board",
  assembly: "upper stretchers" | "floor center board",
  support: StraightSupportSpec,
): HoverDiningTableCutPart {
  return {
    id,
    name,
    assembly,
    kind: "support",
    material: "Oak",
    quantity: support.count,
    length: support.spanX,
    width: support.width,
    thickness: support.thickness,
    grainDirection: "length",
    fabricationProfile: createStraightSupportFabricationProfile(support),
    cutAngleDegrees: 0,
    notes: [
      support.shoulderRadius > EPSILON
        ? "Cut mirrored circular upper-end returns into the side profile; the remaining lower end faces bear against the transverse rails."
        : support.endRadius > EPSILON
        ? "Round over each end-face perimeter to the listed radius while preserving a flat central bearing face against the transverse rail."
        : "Square end faces bear flush on the parallel end-box inside faces.",
      support.edgeRadius > EPSILON && support.topEdgeRadius > EPSILON
        ? "Round over the bottom and top long edges to their independently listed radii."
        : support.topEdgeRadius > EPSILON
          ? "Round over both tabletop-facing top long edges to the listed radius; leave the bottom edges square."
          : support.edgeRadius > EPSILON
            ? "Round over the bottom long edges to the listed radius; leave the top edges square."
            : "Leave the long edges square.",
    ],
    processDimensions: [
      ...(support.shoulderRadius > EPSILON
        ? [{ label: "Upper-end shoulder radius", value: support.shoulderRadius }]
        : []),
      ...(support.edgeRadius > EPSILON
        ? [{ label: "Bottom edge round-over", value: support.edgeRadius }]
        : []),
      ...(support.endRadius > EPSILON && support.shoulderRadius <= EPSILON
        ? [{ label: "End-face round-over", value: support.endRadius }]
        : []),
      ...(support.topEdgeRadius > EPSILON
        ? [{ label: "Top edge round-over", value: support.topEdgeRadius }]
        : []),
    ],
  };
}

function createCornerKneeBraceCutPart(
  braces: CornerKneeBraceSpec,
): HoverDiningTableCutPart {
  return {
    id: "K1",
    name: "Top-frame diagonal knee brace",
    assembly: "upper corner braces",
    kind: "brace",
    material: "Oak",
    quantity: braces.count,
    length: braces.longPointLength,
    width: braces.width,
    thickness: braces.thickness,
    grainDirection: "length",
    fabricationProfile: createCornerKneeBraceFabricationProfile(braces),
    cutAngleDegrees: THREE.MathUtils.radToDeg(braces.angleRadians),
    notes: [
      "Install one mirrored brace at each corner between a lengthwise upper rail and a transverse Wave top rail.",
      "The two 45° end faces bear on the rails' inside faces; use positive housed loose-tenon or equivalent joinery at both ends rather than relying on fasteners into end grain.",
      "The structural screen credits the resulting top-plane triangles only when both end joints can transfer load.",
    ],
    processDimensions: [
      { label: "Rail-face reach", value: braces.reach },
      { label: "Centerline length", value: braces.centerlineLength },
    ],
  };
}

export function getHoverDiningTablePieceCount(params: ModelParams) {
  const bottomStyle = bottomSupportStyle(getParam(params, "bottomSupportStyle"));
  const frameStyle = endFrameStyle(getParam(params, "endFrameStyle"));
  const footCount = getParam(params, "levelingFeetEnabled") >= 0.5 ? 4 : 0;
  const cornerBraceCount = Number.isFinite(params.cornerBraceReach) &&
      params.cornerBraceReach > EPSILON &&
      frameStyle === "legs" &&
      topSupportStyle(getParam(params, "topSupportStyle")) === "stretchers"
    ? 4
    : 0;
  const basePieceCount = frameStyle === "box" ? 14 : 12;
  return basePieceCount + footCount + cornerBraceCount +
    (bottomStyle === "x" ? 2 : bottomStyle === "center-board" ? 1 : 0);
}

/**
 * Creates the full-size fabrication schedule. These are finished nominal
 * dimensions rather than rough-milling allowances; the 1:mockScale display
 * model never changes the values shown on the cut sheet.
 */
export function getHoverDiningTableCutList(
  params: ModelParams,
): HoverDiningTableCutList {
  const { fullSize: spec } = getHoverDiningTableSpec(params);
  const frameProfiles = {
    top: createEndBoxPartFabricationProfile(spec, "top"),
    bottom: createEndBoxPartFabricationProfile(spec, "bottom"),
    left: createEndBoxPartFabricationProfile(spec, "left"),
    right: createEndBoxPartFabricationProfile(spec, "right"),
  };
  const stileLayout = getHoverDiningTableStileFabricationLayout(
    frameProfiles.right,
  );
  const stileLength = stileLayout.length;
  const stileWidth = stileLayout.width;
  const stileCutAngle = THREE.MathUtils.radToDeg(
    Math.atan2(
      Math.abs(stileLayout.lengthAxis.x),
      Math.abs(stileLayout.lengthAxis.y),
    ),
  );
  const topRailLength = frameProfiles.top.bounds.maxX - frameProfiles.top.bounds.minX;
  const topRailWidth = frameProfiles.top.bounds.maxY - frameProfiles.top.bounds.minY;
  const bottomRailLength =
    frameProfiles.bottom.bounds.maxX - frameProfiles.bottom.bounds.minX;
  const bottomRailWidth =
    frameProfiles.bottom.bounds.maxY - frameProfiles.bottom.bounds.minY;
  const parts: HoverDiningTableCutPart[] = [
    {
      id: "T1",
      name: "Tabletop",
      assembly: "tabletop",
      kind: "tabletop",
      material: "Oak",
      quantity: 1,
      length: spec.length,
      width: spec.width,
      thickness: spec.topThickness,
      grainDirection: "length",
      fabricationProfile: createTabletopFabricationProfile(spec),
      notes: [
        "Shape the plan corners and both length-end faces to the listed radii, independently from the Bézier-rolled long edges.",
        "Route all three channel mortises upward from the underside so their installed webs finish exactly flush; the upper supports stay at the original underside plane.",
      ],
      processDimensions: [
        { label: "Long-edge roll", value: spec.topEdgeRoll },
        { label: "Plan corner radius", value: spec.topPlanCornerRadius },
        {
          label: "Length-end face round-over",
          value: spec.topEndFaceRoundover,
        },
        {
          label: "Edge-curve tension",
          value: spec.topEdgeTension,
          format: "ratio",
        },
      ],
    },
    {
      id: "H1",
      name: "Widthwise C-channel",
      assembly: "tabletop hardware",
      kind: "channel",
      material: "Steel",
      quantity: spec.channels.count,
      length: spec.channels.length,
      width: spec.channels.width,
      thickness: spec.channels.depth,
      grainDirection: "n/a",
      fabricationProfile: createCChannelFabricationProfile(spec.channels),
      notes: [
        "Blackened-steel U-channel seats in a full-width rectangular mortise with its web flush to the tabletop underside.",
        "Install one at table center and the outer pair symmetrically at the model-derived locations; the upper supports pass beneath this common plane and retain direct oak bearing between channels.",
        "Field-drill slotted screw holes for seasonal wood movement and place upper-support fasteners in the uninterrupted oak bearing runs.",
      ],
      processDimensions: [
        { label: "Steel wall", value: spec.channels.wallThickness },
        { label: "Long-edge inset", value: spec.channels.sideInset },
        { label: "End-box clearance", value: spec.channels.endClearance },
      ],
    },
    {
      id: "B1",
      name: spec.endFrameStyle === "box" ? "End-box top rail" : "Wave-curve top rail",
      assembly: "end boxes",
      kind: "rail",
      material: "Oak",
      quantity: 2,
      length: topRailLength,
      width: topRailWidth,
      thickness: spec.frameDepth,
      grainDirection: "length",
      fabricationProfile: frameProfiles.top,
      notes: [
        spec.endFrameStyle === "box"
          ? "One finished top rail per end box; profile includes both routed inner and outer corner curves."
          : "One finished top rail per open leg frame; its paired inner and outer circular fillets form the distinctive wave-shaped shoulder.",
        "Tangent seams remain square for the leg glue joints.",
      ],
      processDimensions: [
        { label: "Straight rail height", value: spec.frameTopRailHeight },
        { label: "Routed profile envelope", value: topRailWidth },
        { label: "Outer top radius", value: spec.frameOuterTopCornerRadius },
        { label: "Inner top radius", value: spec.frameInnerTopCornerRadius },
        { label: "Face-edge round-over", value: spec.frameEdgeRoundover },
        ...(spec.frameCornerStyle === "bezier"
          ? [
              {
                label: "Outer rail-side sweep",
                value: spec.frameOuterRailCurveTension,
                format: "ratio" as const,
              },
              {
                label: "Outer stile-side sweep",
                value: spec.frameOuterStileCurveTension,
                format: "ratio" as const,
              },
              {
                label: "Inner rail-side sweep",
                value: spec.frameInnerRailCurveTension,
                format: "ratio" as const,
              },
              {
                label: "Inner stile-side sweep",
                value: spec.frameInnerStileCurveTension,
                format: "ratio" as const,
              },
            ]
          : []),
      ],
    },
    {
      id: "B3",
      name: spec.endFrameStyle === "box" ? "End-box stile" : "Full-height leg",
      assembly: "end boxes",
      kind: "stile",
      material: "Oak",
      quantity: 4,
      length: stileLength,
      width: stileWidth,
      thickness: spec.frameDepth,
      grainDirection: "length",
      fabricationProfile: frameProfiles.right,
      cutAngleDegrees: stileCutAngle,
      notes: [
        spec.endFrameStyle === "box"
          ? "Two mirrored stiles per end box."
          : "Two mirrored full-height legs per end frame; the floor edge remains open between them.",
        spec.endFrameStyle === "box"
          ? "The profile runs exactly between the rail curve-tangent seams and follows the derived box splay."
          : "Each leg runs from its square top-rail tangent seam to the floor and follows the derived frame splay.",
      ],
      processDimensions: [
        { label: "Face-edge round-over", value: spec.frameEdgeRoundover },
      ],
    },
  ];

  if (spec.endFrameStyle === "box") {
    parts.splice(3, 0, {
      id: "B2",
      name: "End-box bottom rail",
      assembly: "end boxes",
      kind: "rail",
      material: "Oak",
      quantity: 2,
      length: bottomRailLength,
      width: bottomRailWidth,
      thickness: spec.frameDepth,
      grainDirection: "length",
      fabricationProfile: frameProfiles.bottom,
      notes: [
        "One finished bottom rail per end box; profile includes both routed inner and outer corner curves.",
        "The floor edge remains flat while the curved returns terminate at the stile seams.",
      ],
      processDimensions: [
        { label: "Straight rail height", value: spec.frameBottomRailHeight },
        { label: "Routed profile envelope", value: bottomRailWidth },
        { label: "Outer bottom radius", value: spec.frameOuterBottomCornerRadius },
        { label: "Inner bottom radius", value: spec.frameInnerBottomCornerRadius },
        { label: "Face-edge round-over", value: spec.frameEdgeRoundover },
        {
          label: "Outer rail-side sweep",
          value: spec.frameOuterRailCurveTension,
          format: "ratio",
        },
        {
          label: "Outer stile-side sweep",
          value: spec.frameOuterStileCurveTension,
          format: "ratio",
        },
        {
          label: "Inner rail-side sweep",
          value: spec.frameInnerRailCurveTension,
          format: "ratio",
        },
        {
          label: "Inner stile-side sweep",
          value: spec.frameInnerStileCurveTension,
          format: "ratio",
        },
      ],
    });
  }

  if (spec.levelingFeet.enabled) {
    parts.splice(2, 0, {
      id: "L1",
      name: "Adjustable leveling foot",
      assembly: "leveling feet",
      kind: "leveling-foot",
      material: "Steel",
      quantity: spec.levelingFeet.count,
      length: spec.levelingFeet.rodLength + spec.levelingFeet.padThickness,
      width: spec.levelingFeet.padDiameter,
      thickness: spec.levelingFeet.padThickness,
      grainDirection: "n/a",
      fabricationProfile: createLevelingFootFabricationProfile(
        spec.levelingFeet,
      ),
      notes: [
        "One threaded leveling foot mounts beneath each stile or full-height leg.",
        "Installed extension is measured from the floor to the wood underside; the remaining rod length embeds vertically in solid stile material.",
      ],
      processDimensions: [
        { label: "Pad diameter", value: spec.levelingFeet.padDiameter },
        { label: "Pad thickness", value: spec.levelingFeet.padThickness },
        { label: "Threaded rod diameter", value: spec.levelingFeet.rodDiameter },
        { label: "Threaded rod length", value: spec.levelingFeet.rodLength },
        { label: "Installed extension", value: spec.levelingFeet.extension },
        { label: "Embedded rod", value: spec.levelingFeet.embeddedRodLength },
        { label: "Outer-radius entry clearance", value: spec.levelingFeet.outerEntryClearance },
      ],
    });
  }

  if (spec.topSupportStyle === "x") {
    parts.push(
      ...createBraceCutParts(
        "U",
        "upper X",
        spec.upperBrace,
        spec.halfLapClearance,
      ),
    );
  } else {
    parts.push(
      createStraightSupportCutPart(
        "S1",
        "Upper lengthwise stretcher",
        "upper stretchers",
        spec.upperStretchers,
      ),
    );
  }
  if (spec.cornerKneeBraces.enabled) {
    parts.push(createCornerKneeBraceCutPart(spec.cornerKneeBraces));
  }
  if (spec.bottomSupportStyle === "x") {
    parts.push(
      ...createBraceCutParts(
        "F",
        "floor X",
        spec.lowerBrace,
        spec.halfLapClearance,
      ),
    );
  } else if (spec.bottomSupportStyle === "center-board") {
    parts.push(
      createStraightSupportCutPart(
        "C1",
        "Floor center board",
        "floor center board",
        spec.lowerCenterBoard,
      ),
    );
  }

  const totalPieces = parts.reduce((sum, part) => sum + part.quantity, 0);
  const expectedPieces = getHoverDiningTablePieceCount(params);
  if (totalPieces !== expectedPieces) {
    throw new Error(
      `Hover-table cut list must account for ${expectedPieces} pieces; received ${totalPieces}`,
    );
  }
  for (const part of parts) {
    assertFabricationProfile(part.fabricationProfile, part.id);
    for (const [label, value] of [
      ["length", part.length],
      ["width", part.width],
      ["thickness", part.thickness],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${part.id} ${label} must be finite and positive`);
      }
    }
    if (
      part.lap &&
      (!Number.isFinite(part.lap.length) ||
        part.lap.length <= 0 ||
        part.lap.depth <= 0 ||
        part.lap.depth >= part.thickness ||
        part.lap.shoulderAngleDegrees <= 0 ||
        part.lap.shoulderAngleDegrees >= 90)
    ) {
      throw new Error(`${part.id} half-lap dimensions are invalid`);
    }
  }

  return {
    material: "White oak + blackened steel",
    dimensionBasis: "full-size finished dimensions",
    totalPieces,
    parts,
  };
}

function createEndBoxFinishedPartGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
  x: number,
  position: EndBoxPartPosition,
) {
  const commands = createEndBoxPartProfiles(spec)[position];
  const geometry = createSelectivelyRoundedExtrusion(
    commands,
    spec.frameDepth,
    spec.frameEdgeRoundover,
    model.geometry.curveSegments,
    model.geometry.bevelSegments,
    x,
  );
  geometry.translate(0, 0, spec.frameBottomZ);
  const splay = (spec.frameBottomWidth - spec.frameTopWidth) / 2;
  const grainDirection = position === "top" || position === "bottom"
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, position === "left" ? splay : -splay, spec.frameHeight);
  const endLabel = x < 0 ? "left" : "right";
  const memberLabel = position === "top"
    ? "top-rail"
    : position === "bottom"
      ? "bottom-rail"
      : `${position}-${spec.endFrameStyle === "legs" ? "leg" : "stile"}`;
  assignDirectionalWoodUvs(
    geometry,
    grainDirection,
    grainTextureSize(spec),
    `${endLabel}-end-frame-${memberLabel}`,
  );
  return geometry;
}

/**
 * Builds the exact finished solid represented by one cut-list schedule line.
 * Repeated and mirrored pieces intentionally share one representative solid;
 * every surface treatment and joinery cut comes from the assembled-model
 * constructors rather than from a simplified preview mesh.
 */
export function createHoverDiningTableCutPartGeometry(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
  partId: string,
) {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  let geometry: THREE.BufferGeometry;

  if (partId === "T1") {
    geometry = createTabletopGeometry(spec, model);
  } else if (partId === "H1") {
    geometry = createCChannelGeometry(spec.channels, 0);
  } else if (partId === "L1") {
    if (!spec.levelingFeet.enabled) {
      throw new Error("L1 requires adjustable leveling feet");
    }
    geometry = createLevelingFootGeometry(spec.levelingFeet, 0, 0);
  } else if (partId === "B1") {
    geometry = createEndBoxFinishedPartGeometry(
      spec,
      model,
      -spec.frameCenterX,
      "top",
    );
  } else if (partId === "B2") {
    if (spec.endFrameStyle !== "box") {
      throw new Error("B2 requires the closed end-box style");
    }
    geometry = createEndBoxFinishedPartGeometry(
      spec,
      model,
      -spec.frameCenterX,
      "bottom",
    );
  } else if (partId === "B3") {
    geometry = createEndBoxFinishedPartGeometry(
      spec,
      model,
      -spec.frameCenterX,
      "left",
    );
  } else if (partId === "U1" || partId === "U2") {
    if (spec.topSupportStyle !== "x") {
      throw new Error(`${partId} requires the upper X support layout`);
    }
    const geometries = createHalfLappedXParts(
      spec.upperBrace,
      spec.halfLapClearance,
      model,
      grainTextureSize(spec),
      "upper-x",
    );
    const selectedIndex = partId === "U1" ? 0 : 1;
    geometry = geometries[selectedIndex];
    geometries.forEach((candidate, index) => {
      if (index !== selectedIndex) candidate.dispose();
    });
  } else if (partId === "F1" || partId === "F2") {
    if (spec.bottomSupportStyle !== "x") {
      throw new Error(`${partId} requires the floor X support layout`);
    }
    const geometries = createHalfLappedXParts(
      spec.lowerBrace,
      spec.halfLapClearance,
      model,
      grainTextureSize(spec),
      "floor-x",
    );
    const selectedIndex = partId === "F1" ? 0 : 1;
    geometry = geometries[selectedIndex];
    geometries.forEach((candidate, index) => {
      if (index !== selectedIndex) candidate.dispose();
    });
  } else if (partId === "S1") {
    if (spec.topSupportStyle !== "stretchers") {
      throw new Error("S1 requires the upper-stretcher support layout");
    }
    const geometries = createStraightSupportParts(
      spec.upperStretchers,
      model,
      grainTextureSize(spec),
      "upper-stretcher",
    );
    geometry = geometries[0];
    geometries.slice(1).forEach((candidate) => candidate.dispose());
  } else if (partId === "K1") {
    if (!spec.cornerKneeBraces.enabled) {
      throw new Error("K1 requires open leg frames with lengthwise upper rails");
    }
    const geometries = createCornerKneeBraceParts(
      spec.cornerKneeBraces,
      model,
      grainTextureSize(spec),
    );
    geometry = geometries[0];
    geometries.slice(1).forEach((candidate) => candidate.dispose());
  } else if (partId === "C1") {
    if (spec.bottomSupportStyle !== "center-board") {
      throw new Error("C1 requires the floor-center-board support layout");
    }
    const geometries = createStraightSupportParts(
      spec.lowerCenterBoard,
      model,
      grainTextureSize(spec),
      "floor-center-board",
    );
    geometry = geometries[0];
    geometries.slice(1).forEach((candidate) => candidate.dispose());
  } else {
    throw new Error(`Unknown Hover-table cut-list item: ${partId}`);
  }

  if (
    partId !== "H1" &&
    partId !== "L1" &&
    !geometry.getAttribute("uv")
  ) {
    addPlanarWoodUvs(geometry);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Returns independently movable, fabrication-complete glue-up pieces for the
 * selected support layout. The four bars of each end box share the assembled
 * shared curve/tangent constraints, while selective face round-overs leave every
 * glue seam square.
 */
export function createHoverDiningTableExplodedParts(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
): HoverDiningTableExplodedPart[] {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const gap = Math.min(spec.length, spec.width) * 0.035;
  const baseLift = gap;
  const parts: HoverDiningTableExplodedPart[] = [
    {
      name: "tabletop",
      category: "tabletop",
      material: "Oak",
      geometry: createTabletopGeometry(spec, model),
      offset: new THREE.Vector3(0, 0, baseLift + gap * 3),
      fabricationProfile: createTabletopFabricationProfile(spec),
    },
  ];

  spec.channels.centerXs.forEach((centerX, index) => {
    parts.push({
      name: `tabletop-c-channel-${index + 1}`,
      category: "tabletop-hardware",
      material: "Steel",
      geometry: createCChannelGeometry(spec.channels, centerX),
      offset: new THREE.Vector3(0, 0, baseLift + gap * 1.8),
      fabricationProfile: createCChannelFabricationProfile(spec.channels),
    });
  });

  if (spec.levelingFeet.enabled) {
    for (const endSign of [-1, 1] as const) {
      spec.levelingFeet.centerYs.forEach((centerY, sideIndex) => {
        parts.push({
          name: `${endSign < 0 ? "left" : "right"}-box-leveling-foot-${sideIndex + 1}`,
          category: "leveling-foot",
          material: "Steel",
          geometry: createLevelingFootGeometry(
            spec.levelingFeet,
            endSign * spec.frameCenterX,
            centerY,
          ),
          offset: new THREE.Vector3(
            endSign * gap * 1.5,
            sideIndex === 0 ? -gap * 1.4 : gap * 1.4,
            -gap,
          ),
          fabricationProfile: createLevelingFootFabricationProfile(
            spec.levelingFeet,
          ),
        });
      });
    }
  }

  for (const endSign of [-1, 1] as const) {
    const x = endSign * spec.frameCenterX;
    const xOffset = endSign * gap * 1.5;
    const endLabel = endSign < 0 ? "left" : "right";
    parts.push(
      {
        name: `${endLabel}-${spec.endFrameStyle === "box" ? "box" : "leg-frame"}-top-rail`,
        category: "end-box-horizontal",
        material: "Oak",
        geometry: createEndBoxFinishedPartGeometry(spec, model, x, "top"),
        offset: new THREE.Vector3(xOffset, 0, baseLift + gap),
        fabricationProfile: createEndBoxPartFabricationProfile(spec, "top"),
      },
      {
        name: `${endLabel}-${spec.endFrameStyle === "box" ? "box-left-vertical" : "left-leg"}`,
        category: "end-box-vertical",
        material: "Oak",
        geometry: createEndBoxFinishedPartGeometry(spec, model, x, "left"),
        offset: new THREE.Vector3(xOffset, -gap, baseLift),
        fabricationProfile: createEndBoxPartFabricationProfile(spec, "left"),
      },
      {
        name: `${endLabel}-${spec.endFrameStyle === "box" ? "box-right-vertical" : "right-leg"}`,
        category: "end-box-vertical",
        material: "Oak",
        geometry: createEndBoxFinishedPartGeometry(spec, model, x, "right"),
        offset: new THREE.Vector3(xOffset, gap, baseLift),
        fabricationProfile: createEndBoxPartFabricationProfile(spec, "right"),
      },
    );
    if (spec.endFrameStyle === "box") {
      parts.splice(parts.length - 2, 0, {
        name: `${endLabel}-box-bottom-rail`,
        category: "end-box-horizontal",
        material: "Oak",
        geometry: createEndBoxFinishedPartGeometry(spec, model, x, "bottom"),
        offset: new THREE.Vector3(xOffset, 0, 0),
        fabricationProfile: createEndBoxPartFabricationProfile(spec, "bottom"),
      });
    }
  }

  const addXParts = (
    brace: BracePlaneSpec,
    category: "upper-x" | "floor-x",
  ) => {
    const geometries = createHalfLappedXParts(
      brace,
      spec.halfLapClearance,
      model,
      grainTextureSize(spec),
      category,
    );
    geometries.forEach((geometry, index) => {
      const direction = index === 0 ? -1 : 1;
      const pocketSeparationZ =
        category === "upper-x"
          ? (index === 0 ? 0 : -gap * 1.25)
          : (index === 0 ? 0 : gap * 1.25);
      parts.push({
        name: `${category}-bar-${index + 1}`,
        category,
        material: "Oak",
        geometry,
        offset: new THREE.Vector3(
          0,
          direction * gap * 2.35,
          baseLift + pocketSeparationZ,
        ),
        fabricationProfile: createBraceFabricationProfile(brace),
      });
    });
  };
  const addStraightParts = (
    support: StraightSupportSpec,
    category: "upper-stretcher" | "floor-center-board",
  ) => {
    const geometries = createStraightSupportParts(
      support,
      model,
      grainTextureSize(spec),
      category,
    );
    geometries.forEach((geometry, index) => {
      const separation =
        category === "upper-stretcher"
          ? (index === 0 ? -1 : 1) * gap * 1.4
          : 0;
      parts.push({
        name:
          category === "upper-stretcher"
            ? `upper-stretcher-${index + 1}`
            : "floor-center-board",
        category,
        material: "Oak",
        geometry,
        offset: new THREE.Vector3(0, separation, baseLift),
        fabricationProfile: createStraightSupportFabricationProfile(support),
      });
    });
  };
  if (spec.topSupportStyle === "x") {
    addXParts(spec.upperBrace, "upper-x");
  } else {
    addStraightParts(spec.upperStretchers, "upper-stretcher");
  }
  if (spec.cornerKneeBraces.enabled) {
    const braceGeometries = createCornerKneeBraceParts(
      spec.cornerKneeBraces,
      model,
      grainTextureSize(spec),
    );
    braceGeometries.forEach((geometry, index) => {
      const endSign = index < 2 ? -1 : 1;
      const sideSign = index % 2 === 0 ? -1 : 1;
      parts.push({
        name: `${endSign < 0 ? "left" : "right"}-${sideSign < 0 ? "front" : "back"}-top-frame-knee-brace`,
        category: "upper-corner-brace",
        material: "Oak",
        geometry,
        offset: new THREE.Vector3(
          endSign * gap * 1.1,
          sideSign * gap * 1.8,
          baseLift + gap * 0.5,
        ),
        fabricationProfile: createCornerKneeBraceFabricationProfile(
          spec.cornerKneeBraces,
        ),
      });
    });
  }
  if (spec.bottomSupportStyle === "x") {
    addXParts(spec.lowerBrace, "floor-x");
  } else if (spec.bottomSupportStyle === "center-board") {
    addStraightParts(spec.lowerCenterBoard, "floor-center-board");
  }

  parts.forEach((part) => {
    if (part.material === "Oak" && !part.geometry.getAttribute("uv")) {
      addPlanarWoodUvs(part.geometry);
    }
  });

  parts.forEach((part) =>
    assertFabricationProfile(part.fabricationProfile, part.name),
  );

  const expectedPieces = getHoverDiningTablePieceCount(params);
  if (parts.length !== expectedPieces) {
    parts.forEach((part) => part.geometry.dispose());
    throw new Error(
      `Exploded Hover-table assembly must contain ${expectedPieces} pieces; received ${parts.length}`,
    );
  }
  return parts;
}

export function getHoverDiningTableDimensions(params: ModelParams): ModelDimensions {
  const { scaled } = getHoverDiningTableSpec(params);
  return { length: scaled.length, width: scaled.width, height: scaled.height };
}

export function updateHoverDiningTableGuide(mesh: THREE.Mesh, params: ModelParams) {
  const dimensions = getHoverDiningTableDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

export function getHoverDiningTableParameterLimits(
  model: HoverDiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const spec = rawHoverDiningTableSpec(params);
  const safeMax = (value: number) => Math.max(limits.min, value);
  const requiredTopOpeningHalfWidth =
    spec.frameInnerTopCornerRadius +
    spec.upperBrace.endpointInset +
    spec.upperBrace.miterHalfWidth +
    spec.upperBrace.width / 2 +
    MIN_FRAME_FACE_FLAT / 2;
  const requiredBottomOpeningHalfWidth =
    spec.frameInnerBottomCornerRadius +
    spec.lowerBrace.endpointInset +
    spec.lowerBrace.miterHalfWidth +
    spec.lowerBrace.width / 2 +
    MIN_FRAME_FACE_FLAT / 2;

  if (key === "tableLength") {
    limits.min = Math.max(
      limits.min,
      2 * (spec.endOverhang + spec.frameDepth) + MIN_BRACE_SPAN,
      2 * (spec.endOverhang + spec.frameDepth) +
        2 * spec.channels.endClearance +
        3 * spec.channels.width +
        limits.step,
      2 * (spec.endOverhang + spec.frameDepth) +
        6 * spec.channels.width +
        limits.step,
    );
  } else if (key === "tableWidth") {
    limits.min = Math.max(
      limits.min,
      2 * spec.sideOverhang +
        2 * spec.frameSideWidth +
        2 * requiredTopOpeningHalfWidth,
      2 * spec.sideOverhang -
        spec.frameBottomSpread +
        2 * spec.frameSideWidth +
        2 * requiredBottomOpeningHalfWidth,
      spec.channels.sideInset * 2 +
        spec.channels.wallThickness * 2 +
        limits.step,
      2 * (spec.topPlanCornerRadius + spec.topEdgeRoll + limits.step),
    );
  } else if (key === "overallHeight") {
    limits.min = Math.max(
      limits.min,
      spec.topThickness + spec.frameTopRailHeight +
        spec.frameInnerTopCornerRadius + limits.step +
        (spec.endFrameStyle === "box"
          ? spec.frameBottomRailHeight + spec.frameInnerBottomCornerRadius
          : 0),
      spec.topThickness + spec.lowerBrace.thickness + spec.upperBrace.thickness,
      spec.topThickness +
        spec.levelingFeet.extension +
        spec.frameTopRailHeight + spec.frameInnerTopCornerRadius + limits.step +
        (spec.endFrameStyle === "box"
          ? spec.frameBottomRailHeight + spec.frameInnerBottomCornerRadius
          : 0),
    );
  } else if (key === "topThickness") {
    limits.min = Math.max(
      limits.min,
      spec.channels.depth + limits.step,
      spec.topEndFaceRoundover * 2 + limits.step,
    );
    limits.max = Math.min(limits.max, spec.height / 5);
  } else if (key === "topEdgeRoll") {
    limits.max = Math.min(
      limits.max,
      spec.width / 3,
      spec.channels.sideInset,
      spec.width / 2 - spec.topPlanCornerRadius - limits.step,
    );
  } else if (key === "topPlanCornerRadius") {
    limits.max = Math.min(
      limits.max,
      spec.width / 2 - spec.topEdgeRoll - limits.step,
      spec.endOverhang - spec.topEndFaceRoundover,
    );
  } else if (key === "topEndFaceRoundover") {
    limits.max = Math.min(
      limits.max,
      spec.topThickness / 2 - limits.step,
      spec.endOverhang - spec.topPlanCornerRadius,
    );
  } else if (key === "sideOverhang") {
    limits.min = Math.max(
      limits.min,
      Math.max(spec.frameBottomSpread, 0) / 2 + limits.step,
    );
    limits.max = Math.min(
      limits.max,
      spec.width / 2 -
        spec.frameSideWidth -
        requiredTopOpeningHalfWidth,
      (spec.width + spec.frameBottomSpread) / 2 -
        spec.frameSideWidth -
        requiredBottomOpeningHalfWidth,
    );
  } else if (key === "endOverhang") {
    limits.min = Math.max(
      limits.min,
      spec.topPlanCornerRadius + spec.topEndFaceRoundover,
    );
    limits.max = Math.min(
      limits.max,
      (spec.length - 2 * spec.frameDepth - MIN_BRACE_SPAN) / 2,
      (spec.length -
        2 * spec.frameDepth -
        2 * spec.channels.endClearance -
        3 * spec.channels.width -
        limits.step) /
        2,
      (spec.length -
        2 * spec.frameDepth -
        6 * spec.channels.width -
        limits.step) /
        2,
    );
  } else if (key === "frameDepth") {
    limits.min = Math.max(
      limits.min,
      spec.frameEdgeRoundover * 2 + limits.step,
      ...(spec.levelingFeet.enabled ? [spec.levelingFeet.rodDiameter] : []),
    );
    limits.max = Math.min(
      limits.max,
      (spec.length - 2 * spec.endOverhang - MIN_BRACE_SPAN) / 2,
      (spec.length -
        2 * spec.endOverhang -
        2 * spec.channels.endClearance -
        3 * spec.channels.width -
        limits.step) /
        2,
      (spec.length -
        2 * spec.endOverhang -
        6 * spec.channels.width -
        limits.step) /
        2,
    );
  } else if (key === "channelEndClearance") {
    limits.max = Math.min(
      limits.max,
      (spec.braceSpanX - 3 * spec.channels.width - limits.step) / 2,
    );
  } else if (key === "channelSideInset") {
    limits.min = Math.max(limits.min, spec.topEdgeRoll);
    limits.max = Math.min(
      limits.max,
      spec.width / 2 - spec.channels.wallThickness - limits.step,
    );
  } else if (key === "channelWidth") {
    limits.min = Math.max(
      limits.min,
      spec.channels.wallThickness * 2 + limits.step,
    );
    limits.max = Math.min(
      limits.max,
      (spec.braceSpanX - 2 * spec.channels.endClearance - limits.step) / 3,
      spec.braceSpanX / 6 - limits.step,
    );
  } else if (key === "channelDepth") {
    limits.min = Math.max(
      limits.min,
      spec.channels.wallThickness + limits.step,
    );
    limits.max = Math.min(
      limits.max,
      spec.topThickness - limits.step,
    );
  } else if (key === "channelWallThickness") {
    limits.max = Math.min(
      limits.max,
      spec.channels.depth - limits.step,
      spec.channels.width / 2 - limits.step,
    );
  } else if (key === "frameSideWidth") {
    if (spec.levelingFeet.enabled) {
      limits.min = Math.max(
        limits.min,
        2 *
          ((spec.endFrameStyle === "box"
            ? spec.frameOuterBottomCornerRadius
            : 0) +
            spec.levelingFeet.rodDiameter / 2) +
          MIN_FRAME_FACE_FLAT,
      );
    }
    limits.max = Math.min(
      limits.max,
      spec.frameTopWidth / 2 - requiredTopOpeningHalfWidth,
      spec.frameBottomWidth / 2 - requiredBottomOpeningHalfWidth,
    );
  } else if (key === "frameBottomRailHeight" || key === "frameTopRailHeight") {
    limits.min = Math.max(
      limits.min,
      spec.frameEdgeRoundover * 2 + limits.step,
    );
    const other =
      key === "frameBottomRailHeight"
        ? spec.frameTopRailHeight
        : spec.frameBottomRailHeight;
    limits.max = Math.min(
      limits.max,
      spec.frameHeight -
        other -
        spec.frameInnerTopCornerRadius -
        spec.frameInnerBottomCornerRadius -
        limits.step,
    );
  } else if (key === "frameBottomSpread") {
    limits.min = Math.max(
      limits.min,
      -spec.frameTopWidth +
        2 * spec.frameSideWidth +
        2 * requiredBottomOpeningHalfWidth,
    );
    limits.max = Math.min(limits.max, spec.sideOverhang * 2);
  } else if (key === "frameOuterTopCornerRadius") {
    limits.max = Math.min(
      limits.max,
      spec.frameTopWidth / 2 - limits.step,
      spec.frameHeight - spec.frameOuterBottomCornerRadius - limits.step,
    );
  } else if (key === "frameOuterBottomCornerRadius") {
    limits.max = Math.min(
      limits.max,
      spec.frameBottomWidth / 2 - limits.step,
      spec.frameHeight - spec.frameOuterTopCornerRadius - limits.step,
      ...(spec.levelingFeet.enabled
        ? [
            spec.frameSideWidth / 2 -
              spec.levelingFeet.rodDiameter / 2,
          ]
        : []),
    );
  } else if (key === "frameInnerTopCornerRadius") {
    limits.max = Math.min(
      limits.max,
      spec.openingHeight - spec.frameInnerBottomCornerRadius - limits.step,
      spec.openingTopWidth / 2 -
        spec.upperBrace.endpointInset -
        spec.upperBrace.miterHalfWidth -
        spec.upperBrace.width / 2 -
        limits.step,
    );
  } else if (key === "frameInnerBottomCornerRadius") {
    limits.max = Math.min(
      limits.max,
      spec.openingHeight - spec.frameInnerTopCornerRadius - limits.step,
      spec.openingBottomWidth / 2 -
        spec.lowerBrace.endpointInset -
        spec.lowerBrace.miterHalfWidth -
        spec.lowerBrace.width / 2 -
        limits.step,
    );
  } else if (key === "frameEdgeRoundover") {
    limits.max = Math.min(
      limits.max,
      Math.min(
        spec.frameDepth,
        spec.frameSideWidth,
        spec.frameTopRailHeight,
        ...(spec.matchLengthwiseRailRoundover
          ? [spec.upperStretchers.width, spec.upperStretchers.thickness]
          : []),
        ...(spec.endFrameStyle === "box" ? [spec.frameBottomRailHeight] : []),
      ) /
        2 -
        limits.step,
    );
  } else if (key === "topSupportWidth" || key === "bottomSupportWidth") {
    const brace = key === "topSupportWidth" ? spec.upperBrace : spec.lowerBrace;
    limits.min = Math.max(
      limits.min,
      Math.max(brace.edgeRadius, brace.topEdgeRadius) * 2 + limits.step,
    );
    limits.max = Math.min(
      limits.max,
      key === "topSupportWidth"
        ? (spec.frameTopWidth - 2 * spec.frameInnerTopCornerRadius) / 2
        : (spec.frameBottomWidth - 2 * spec.frameInnerBottomCornerRadius) / 2,
      brace.cornerTangentY - brace.endpointInset,
    );
  } else if (key === "topSupportThickness" || key === "bottomSupportThickness") {
    const brace = key === "topSupportThickness" ? spec.upperBrace : spec.lowerBrace;
    const isCrossbar =
      key === "topSupportThickness"
        ? spec.topSupportStyle === "x"
        : spec.bottomSupportStyle === "x";
    limits.min = Math.max(
      limits.min,
      (isCrossbar
        ? Math.max(brace.edgeRadius, brace.topEdgeRadius) * 2
        : Math.max(
            brace.edgeRadius * 2,
            brace.edgeRadius + brace.topEdgeRadius,
          )) + limits.step,
    );
    limits.max = Math.min(
      limits.max,
      key === "topSupportThickness"
        ? getParameter(model, "frameTopRailHeight").limits.max
        : getParameter(model, "frameBottomRailHeight").limits.max,
      spec.frameHeight -
        (key === "topSupportThickness"
          ? spec.frameBottomRailHeight
          : spec.frameTopRailHeight) -
        spec.frameInnerTopCornerRadius -
        spec.frameInnerBottomCornerRadius -
        limits.step,
    );
  } else if (key === "topSupportEndpointInset" || key === "bottomSupportEndpointInset") {
    const brace = key === "topSupportEndpointInset" ? spec.upperBrace : spec.lowerBrace;
    limits.max = Math.min(
      limits.max,
      brace.cornerTangentY - brace.miterHalfWidth - brace.width / 2,
    );
  } else if (key === "cornerBraceReach") {
    limits.min = Math.max(limits.min, spec.cornerKneeBraces.width * 2);
    limits.max = Math.min(
      limits.max,
      spec.cornerKneeBraces.contactX - spec.cornerKneeBraces.width,
      spec.cornerKneeBraces.contactY - spec.cornerKneeBraces.width,
    );
  } else if (key === "topSupportShoulderRadius") {
    limits.max = Math.min(
      limits.max,
      spec.upperStretchers.thickness,
      spec.upperStretchers.spanX / 2 - limits.step,
    );
  } else if (key === "topSupportEdgeRadius" || key === "bottomSupportEdgeRadius") {
    const brace = key === "topSupportEdgeRadius" ? spec.upperBrace : spec.lowerBrace;
    const isCrossbar =
      key === "topSupportEdgeRadius"
        ? spec.topSupportStyle === "x"
        : spec.bottomSupportStyle === "x";
    limits.max = Math.min(
      limits.max,
      brace.width / 2 - limits.step,
      isCrossbar
        ? brace.halfLapDepth -
            spec.halfLapClearance / 2 -
            limits.step
        : brace.halfLapDepth - limits.step,
      brace.thickness - brace.topEdgeRadius - limits.step,
    );
  } else if (key === "bottomSupportTopEdgeRadius") {
    const brace = spec.lowerBrace;
    limits.max = Math.min(
      limits.max,
      brace.width / 2 - limits.step,
      spec.bottomSupportStyle === "x"
        ? brace.halfLapDepth -
            spec.halfLapClearance / 2 -
            limits.step
        : brace.thickness - brace.edgeRadius - limits.step,
    );
  } else if (key === "halfLapClearance") {
    limits.max = Math.min(
      limits.max,
      spec.upperBrace.thickness / 4,
      spec.lowerBrace.thickness / 4,
    );
  } else if (key === "levelingFootPadThickness") {
    if (spec.levelingFeet.enabled) {
      limits.max = Math.min(limits.max, spec.levelingFeet.extension);
    }
  } else if (key === "levelingFootRodDiameter") {
    if (spec.levelingFeet.enabled) {
      limits.max = Math.min(
        limits.max,
        spec.frameSideWidth -
          (spec.endFrameStyle === "box"
            ? 2 * spec.frameOuterBottomCornerRadius
            : 0),
        spec.frameDepth,
      );
    }
  } else if (key === "levelingFootRodLength") {
    if (spec.levelingFeet.enabled) {
      limits.min = Math.max(
        limits.min,
        spec.levelingFeet.exposedRodLength + limits.step,
      );
      limits.max = Math.min(
        limits.max,
        spec.frameHeight + spec.levelingFeet.exposedRodLength,
      );
    }
  } else if (key === "levelingFootExtension") {
    if (spec.levelingFeet.enabled) {
      limits.min = Math.max(limits.min, spec.levelingFeet.padThickness);
      limits.max = Math.min(
        limits.max,
        spec.levelingFeet.padThickness +
          spec.levelingFeet.rodLength -
          limits.step,
        spec.topBottom -
          spec.frameTopRailHeight -
          spec.frameInnerTopCornerRadius -
          limits.step -
          (spec.endFrameStyle === "box"
            ? spec.frameBottomRailHeight + spec.frameInnerBottomCornerRadius
            : 0),
      );
    }
  } else if (key === "templatePlateLength") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "templateDovetailDepth") * 4 +
        getParam(params, "templateJointClearance") +
        limits.step,
    );
  } else if (key === "templateDovetailDepth") {
    limits.max = Math.min(
      limits.max,
      (getParam(params, "templatePlateLength") -
        getParam(params, "templateJointClearance")) /
        4 -
        limits.step,
    );
  } else if (key === "templateJointClearance") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "templateDovetailDepth") / 3 - limits.step,
    );
  }

  limits.max = safeMax(limits.max);
  return limits;
}

function item(
  label: string,
  value: string,
  status: "pass" | "warn" = "pass",
): AuditItem {
  return { label, value, status };
}

const STRUCTURAL_REFERENCE = {
  height: 29.5 * 25.4,
  frameSideWidth: 2.25 * 25.4,
  frameDepth: 2.5 * 25.4,
  averageRailHeight: 1.5 * 25.4,
  supportArea: 2 * 1.25 * 25.4 * 25.4,
} as const;

const STRUCTURAL_MATERIAL = {
  whiteOakModulusGPa: 12.27,
  steelModulusGPa: 200,
} as const;

const STRUCTURAL_WEIGHTS: Record<
  HoverDiningTableStructuralMetric["key"],
  number
> = {
  "longitudinal-racking": 0.23,
  "end-box-racking": 0.2,
  torsion: 0.18,
  tipping: 0.14,
  "floor-rocking": 0.12,
  "member-stiffness": 0.13,
};

function structuralScore(value: number) {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function structuralGrade(score: number): HoverDiningTableStructuralGrade {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function structuralMetric(
  key: HoverDiningTableStructuralMetric["key"],
  label: string,
  rawScore: number,
  detail: string,
  calculation: Pick<
    HoverDiningTableStructuralMetric["calculation"],
    "rationale" | "formula" | "inputs"
  >,
): HoverDiningTableStructuralMetric {
  const score = structuralScore(rawScore);
  const weight = STRUCTURAL_WEIGHTS[key];
  return {
    key,
    label,
    score,
    grade: structuralGrade(score),
    detail,
    calculation: {
      ...calculation,
      rawScore: Number(rawScore.toFixed(1)),
      weight,
      scoringNote: `Raw result ${rawScore.toFixed(1)} is clamped to 0–100, then contributes ${(weight * 100).toFixed(0)}% of the overall score (${(score * weight).toFixed(1)} weighted points). Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50.`,
    },
  };
}

function getCChannelTopStiffness(spec: HoverDiningTableSpec) {
  const channel = spec.channels;
  const modularRatio =
    STRUCTURAL_MATERIAL.steelModulusGPa /
    STRUCTURAL_MATERIAL.whiteOakModulusGPa;
  const remainingOakHeight = spec.topThickness - channel.depth;
  const flangeHeight = channel.depth - channel.wallThickness;
  const transformedSections = [
    {
      area: channel.width * remainingOakHeight,
      centroid: channel.depth + remainingOakHeight / 2,
      localSecondMoment:
        (channel.width * remainingOakHeight ** 3) / 12,
    },
    {
      area: modularRatio * channel.width * channel.wallThickness,
      centroid: channel.wallThickness / 2,
      localSecondMoment:
        (modularRatio * channel.width * channel.wallThickness ** 3) / 12,
    },
    {
      area:
        modularRatio * 2 * channel.wallThickness * flangeHeight,
      centroid: channel.wallThickness + flangeHeight / 2,
      localSecondMoment:
        (modularRatio * 2 * channel.wallThickness * flangeHeight ** 3) / 12,
    },
  ];
  const transformedArea = transformedSections.reduce(
    (total, section) => total + section.area,
    0,
  );
  const neutralAxis =
    transformedSections.reduce(
      (total, section) => total + section.area * section.centroid,
      0,
    ) / transformedArea;
  const transformedSecondMoment = transformedSections.reduce(
    (total, section) =>
      total +
      section.localSecondMoment +
      section.area * (section.centroid - neutralAxis) ** 2,
    0,
  );
  const bareOakSecondMoment =
    (channel.width * spec.topThickness ** 3) / 12;
  const transformedSectionRatio =
    transformedSecondMoment / bareOakSecondMoment;
  const channelStripFraction = Math.min(
    1,
    (channel.count * channel.width) / spec.length,
  );
  const channelLengthCoverage = Math.min(1, channel.length / spec.width);
  const topPlaneStiffnessFactor =
    1 +
    channelStripFraction *
      channelLengthCoverage *
      (transformedSectionRatio - 1);
  const availableChannelCenterSpread = Math.max(
    channel.width,
    spec.braceSpanX - channel.width,
  );
  const channelCenterSpread =
    channel.centerXs[channel.centerXs.length - 1] - channel.centerXs[0];
  const channelDistributionFactor = Math.max(
    0,
    Math.min(1, channelCenterSpread / availableChannelCenterSpread),
  );
  const channelTorsionFactor =
    1 +
    (topPlaneStiffnessFactor - 1) *
      (0.5 + 0.5 * channelDistributionFactor);
  const effectiveTopThickness =
    spec.topThickness * Math.cbrt(topPlaneStiffnessFactor);

  return {
    modularRatio,
    transformedSectionRatio,
    channelStripFraction,
    channelLengthCoverage,
    channelDistributionFactor,
    channelTorsionFactor,
    topPlaneStiffnessFactor,
    effectiveTopThickness,
    tabletopSlenderness: spec.width / effectiveTopThickness,
  };
}

function evaluateHoverDiningTableStructure(
  spec: HoverDiningTableSpec,
): Omit<HoverDiningTableStructuralAssessment, "heightSensitivity"> {
  const heightFactor = STRUCTURAL_REFERENCE.height / spec.height;
  const topAreaFactor = Math.sqrt(
    (spec.upperBrace.width * spec.upperBrace.thickness) /
      STRUCTURAL_REFERENCE.supportArea,
  );
  const bottomAreaFactor = Math.sqrt(
    (spec.lowerBrace.width * spec.lowerBrace.thickness) /
      STRUCTURAL_REFERENCE.supportArea,
  );
  const cornerBraceEngagement = spec.cornerKneeBraces.enabled
    ? Math.min(
        1,
        (spec.cornerKneeBraces.reach / spec.cornerKneeBraces.contactY) *
          Math.sqrt(
            (spec.cornerKneeBraces.width * spec.cornerKneeBraces.thickness) /
              (1.5 * 1.25 * 25.4 * 25.4),
          ),
      )
    : 0;
  const topRackingTopology = spec.topSupportStyle === "x"
    ? 1
    : 0.72 + 0.22 * cornerBraceEngagement;
  const bottomRackingTopology =
    spec.bottomSupportStyle === "x"
      ? 1
      : spec.bottomSupportStyle === "center-board"
        ? 0.55
        : 0.12;
  const longitudinalRacking =
    30 +
    35 * topRackingTopology * topAreaFactor * heightFactor ** 1.4 +
    25 * bottomRackingTopology * bottomAreaFactor * heightFactor ** 1.4;

  const effectiveRailHeight = spec.endFrameStyle === "box"
    ? (spec.frameTopRailHeight + spec.frameBottomRailHeight) / 2
    : spec.frameTopRailHeight;
  const endFrameClosureFactor = spec.endFrameStyle === "box" ? 1 : 0.58;
  const endBoxRacking =
    78 *
    (spec.frameSideWidth / STRUCTURAL_REFERENCE.frameSideWidth) ** 1.2 *
    (spec.frameDepth / STRUCTURAL_REFERENCE.frameDepth) ** 0.8 *
    (effectiveRailHeight / STRUCTURAL_REFERENCE.averageRailHeight) ** 0.4 *
    heightFactor ** 2 *
    endFrameClosureFactor;

  const topTorsionTopology = spec.topSupportStyle === "x"
    ? 1
    : 0.65 + 0.3 * cornerBraceEngagement;
  const bottomTorsionTopology =
    spec.bottomSupportStyle === "x"
      ? 1
      : spec.bottomSupportStyle === "center-board"
        ? 0.55
        : 0.15;
  const supportPlaneSeparation =
    spec.bottomSupportStyle === "none"
      ? 0.35
      : Math.max(
          0.2,
          Math.min(
            1,
            (spec.topBottom - spec.upperBrace.thickness / 2 -
              (spec.lowerBrace.zBottom + spec.lowerBrace.thickness / 2)) /
              spec.height,
          ),
        );
  const widthEngagement = Math.max(
    0.5,
    Math.min(1.1, spec.frameBottomWidth / spec.width / 0.9),
  );
  const channelTopStiffness = getCChannelTopStiffness(spec);
  const torsion =
    15 +
    75 *
      Math.sqrt(topTorsionTopology * bottomTorsionTopology) *
      supportPlaneSeparation ** 0.6 *
      Math.sqrt(widthEngagement) *
      Math.sqrt(channelTopStiffness.channelTorsionFactor);

  const footprintLength = spec.levelingFeet.enabled
    ? spec.frameCenterX * 2 + spec.levelingFeet.padDiameter
    : spec.length - 2 * spec.endOverhang;
  const footprintWidth = spec.levelingFeet.enabled
    ? Math.abs(spec.levelingFeet.centerYs[1]) * 2 +
      spec.levelingFeet.padDiameter
    : spec.frameBottomWidth;
  const lateralTippingRatio = footprintWidth / (2 * spec.height);
  const longitudinalTippingRatio = footprintLength / (2 * spec.height);
  const controllingTippingRatio = Math.min(
    lateralTippingRatio,
    longitudinalTippingRatio,
  );
  const tipping = 20 + 80 * Math.min(1, controllingTippingRatio / 0.65);

  const flatBottomRun = spec.endFrameStyle === "legs"
    ? 1
    : Math.max(
        0,
        (spec.frameBottomWidth - 2 * spec.frameOuterBottomCornerRadius) /
          spec.frameBottomWidth,
      );
  const rockingBase =
    spec.endFrameStyle === "legs"
      ? spec.bottomSupportStyle === "x"
        ? 45
        : spec.bottomSupportStyle === "center-board"
          ? 52
          : 62
      : spec.bottomSupportStyle === "x"
        ? 52
        : spec.bottomSupportStyle === "center-board"
          ? 62
          : 84;
  const levelingClearanceFactor = Math.max(
    0,
    Math.min(
      1,
      spec.levelingFeet.outerEntryClearance /
        Math.max(spec.levelingFeet.rodDiameter, EPSILON),
    ),
  );
  const floorRocking = spec.levelingFeet.enabled
    ? 96 + 2 * levelingClearanceFactor
    : rockingBase + 10 * Math.min(1, flatBottomRun);

  const stileSlenderness =
    spec.openingHeight /
    Math.sqrt(spec.frameSideWidth * spec.frameDepth);
  const activeSupportSlenderness = [
    spec.topSupportStyle === "x"
      ? spec.upperBrace.diagonalLength /
        Math.sqrt(spec.upperBrace.width * spec.upperBrace.thickness)
      : spec.upperStretchers.spanX /
        Math.sqrt(
          spec.upperStretchers.width * spec.upperStretchers.thickness,
        ),
    spec.bottomSupportStyle === "x"
      ? spec.lowerBrace.diagonalLength /
        Math.sqrt(spec.lowerBrace.width * spec.lowerBrace.thickness)
      : spec.bottomSupportStyle === "center-board"
        ? spec.lowerCenterBoard.spanX /
          Math.sqrt(
            spec.lowerCenterBoard.width * spec.lowerCenterBoard.thickness,
          )
        : 0,
  ];
  const supportSlenderness = Math.max(...activeSupportSlenderness);
  const memberStiffness =
    100 -
    Math.max(0, stileSlenderness - 8) * 2 -
    Math.max(0, supportSlenderness - 25) * 0.9 -
    Math.max(0, channelTopStiffness.tabletopSlenderness - 24) * 0.8;

  const metrics = [
    structuralMetric(
      "longitudinal-racking",
      "Lengthwise racking",
      longitudinalRacking,
      `${spec.topSupportStyle === "x" ? "upper X" : spec.cornerKneeBraces.enabled ? "upper stretchers + 4 corner triangles" : "upper stretchers"} + ${spec.bottomSupportStyle === "x" ? "floor X" : spec.bottomSupportStyle === "center-board" ? "center board" : "no floor connector"}`,
      {
        rationale:
          "Lengthwise sway grows with tabletop height and falls as the top and floor support paths become more triangulated and gain cross-sectional area. Four positively joined plan-view corner braces raise the stretcher topology according to their reach and section, but do not replace vertical leg bracing. The base 30 represents the two end frames before the connecting members contribute.",
        formula:
          "30 + 35 × (baseTopTopology + 0.22 × cornerBraceEngagement) × topAreaFactor × heightFactor^1.4 + 25 × bottomTopology × bottomAreaFactor × heightFactor^1.4",
        inputs: [
          {
            key: "overallHeight",
            label: "Overall height",
            value: spec.height,
            format: "length",
          },
          {
            key: "topSupportStyle",
            label: "Top support topology",
            value: `${spec.topSupportStyle} (${topRackingTopology.toFixed(2)})`,
            format: "choice",
          },
          {
            key: "topSupportWidth",
            label: "Top support width",
            value: spec.upperBrace.width,
            format: "length",
          },
          {
            key: "topSupportThickness",
            label: "Top support thickness",
            value: spec.upperBrace.thickness,
            format: "length",
          },
          {
            key: "bottomSupportStyle",
            label: "Bottom support topology",
            value: `${spec.bottomSupportStyle} (${bottomRackingTopology.toFixed(2)})`,
            format: "choice",
          },
          {
            key: "bottomSupportWidth",
            label: "Bottom support width",
            value: spec.lowerBrace.width,
            format: "length",
          },
          {
            key: "bottomSupportThickness",
            label: "Bottom support thickness",
            value: spec.lowerBrace.thickness,
            format: "length",
          },
          {
            key: "heightFactor",
            label: "Reference height ÷ current height",
            value: heightFactor,
            format: "number",
            precision: 3,
          },
          {
            key: "topAreaFactor",
            label: "Top cross-section factor",
            value: topAreaFactor,
            format: "number",
            precision: 3,
          },
          {
            key: "cornerBraceReach",
            label: "Corner-triangle engagement",
            value: cornerBraceEngagement,
            format: "number",
            precision: 3,
          },
          {
            key: "bottomAreaFactor",
            label: "Bottom cross-section factor",
            value: bottomAreaFactor,
            format: "number",
            precision: 3,
          },
        ],
      },
    ),
    structuralMetric(
      "end-box-racking",
      spec.endFrameStyle === "box" ? "End-box racking" : "Open-frame racking",
      endBoxRacking,
      `stile slenderness ${stileSlenderness.toFixed(1)}:1 · depth/height ${(spec.frameDepth / spec.height).toFixed(3)}`,
      {
        rationale:
          spec.endFrameStyle === "box"
            ? "Each end box behaves like a portal frame. Wider stiles, deeper members, and taller rails increase its resistance; increasing overall height increases the lever arm and is penalized quadratically."
            : "Each open leg frame behaves like a top-connected portal. Wider and deeper legs plus a taller wave-curve rail increase resistance, while the missing bottom rail receives an explicit closure penalty and increasing height is penalized quadratically.",
        formula:
          "78 × (sideWidth ÷ 2.25 in)^1.2 × (frameDepth ÷ 2.5 in)^0.8 × (effectiveRailHeight ÷ 1.5 in)^0.4 × heightFactor^2 × closureFactor",
        inputs: [
          {
            key: "endFrameStyle",
            label: "End-frame topology",
            value: `${spec.endFrameStyle} (${endFrameClosureFactor.toFixed(2)} closure factor)`,
            format: "choice",
          },
          {
            key: "frameSideWidth",
            label: spec.endFrameStyle === "box" ? "End-box side width" : "Leg width",
            value: spec.frameSideWidth,
            format: "length",
          },
          {
            key: "frameDepth",
            label: "End-frame member depth",
            value: spec.frameDepth,
            format: "length",
          },
          {
            key: "frameTopRailHeight",
            label: "Top rail height",
            value: spec.frameTopRailHeight,
            format: "length",
          },
          ...(spec.endFrameStyle === "box"
            ? [{
                key: "frameBottomRailHeight",
                label: "Bottom rail height",
                value: spec.frameBottomRailHeight,
                format: "length" as const,
              }]
            : []),
          {
            key: "endFrameClosureFactor",
            label: "Derived closure factor",
            value: endFrameClosureFactor,
            format: "number",
            precision: 2,
          },
          {
            key: "overallHeight",
            label: "Overall height",
            value: spec.height,
            format: "length",
          },
          {
            key: "stileSlenderness",
            label: "Derived stile slenderness",
            value: stileSlenderness,
            format: "number",
            precision: 2,
            suffix: ":1",
          },
        ],
      },
    ),
    structuralMetric(
      "torsion",
      "Torsional rigidity",
      torsion,
      `${spec.topSupportStyle === "x" ? "triangulated" : spec.cornerKneeBraces.enabled ? "four corner-triangulated" : "parallel"} top · ${spec.bottomSupportStyle === "x" ? "triangulated" : spec.bottomSupportStyle === "center-board" ? "single-axis" : "open"} floor plane · ${channelTopStiffness.channelTorsionFactor.toFixed(2)}× channel factor`,
      {
        rationale:
          "Twist resistance depends on closed or triangulated support paths at both elevations. The four corner braces triangulate the top rail-to-stretcher joints in plan when both ends use positive joinery; their credit scales with reach and section. Greater vertical separation and broader end-frame engagement improve the torsional couple. The three widthwise C-channels add a bounded top-plane factor; neither system counts as vertical leg bracing.",
        formula:
          "15 + 75 × √((baseTopTopology + 0.30 × cornerBraceEngagement) × bottomTopology) × planeSeparation^0.6 × √(widthEngagement) × √(channelTorsionFactor)",
        inputs: [
          {
            key: "topSupportStyle",
            label: "Top torsion topology",
            value: `${spec.topSupportStyle} (${topTorsionTopology.toFixed(2)})`,
            format: "choice",
          },
          {
            key: "bottomSupportStyle",
            label: "Bottom torsion topology",
            value: `${spec.bottomSupportStyle} (${bottomTorsionTopology.toFixed(2)})`,
            format: "choice",
          },
          {
            key: "cornerBraceReach",
            label: "Corner-triangle engagement",
            value: cornerBraceEngagement,
            format: "number",
            precision: 3,
          },
          {
            key: "supportPlaneSeparation",
            label: "Support-plane separation ÷ height",
            value: supportPlaneSeparation,
            format: "number",
            precision: 3,
          },
          {
            key: "frameBottomWidth",
            label: "End-frame bottom width",
            value: spec.frameBottomWidth,
            format: "length",
          },
          {
            key: "tableWidth",
            label: "Table width",
            value: spec.width,
            format: "length",
          },
          {
            key: "widthEngagement",
            label: "Normalized width engagement",
            value: widthEngagement,
            format: "number",
            precision: 3,
          },
          {
            key: "channelWidth",
            label: "C-channel outside width",
            value: spec.channels.width,
            format: "length",
          },
          {
            key: "channelDepth",
            label: "C-channel depth",
            value: spec.channels.depth,
            format: "length",
          },
          {
            key: "channelWallThickness",
            label: "C-channel steel wall",
            value: spec.channels.wallThickness,
            format: "length",
          },
          {
            key: "channelLengthCoverage",
            label: "Channel length ÷ tabletop width",
            value: channelTopStiffness.channelLengthCoverage,
            format: "number",
            precision: 3,
          },
          {
            key: "channelDistributionFactor",
            label: "Outer-channel distribution",
            value: channelTopStiffness.channelDistributionFactor,
            format: "number",
            precision: 3,
          },
          {
            key: "channelTorsionFactor",
            label: "Derived channel torsion factor",
            value: channelTopStiffness.channelTorsionFactor,
            format: "number",
            precision: 3,
            suffix: "×",
          },
        ],
      },
    ),
    structuralMetric(
      "tipping",
      "Tipping margin",
      tipping,
      `controlling half-footprint / height ${controllingTippingRatio.toFixed(2)}`,
      {
        rationale:
          "The smaller of the lateral and longitudinal half-footprints controls how far the center of mass can move before passing the support polygon. When leveling feet are enabled, their pad edges define that polygon instead of the full wood-box edges. A taller table reduces the geometric margin.",
        formula:
          "20 + 80 × min(1, min(contactWidth ÷ 2 ÷ height, contactLength ÷ 2 ÷ height) ÷ 0.65)",
        inputs: [
          {
            key: "overallHeight",
            label: "Overall height",
            value: spec.height,
            format: "length",
          },
          {
            key: "tableLength",
            label: "Table length",
            value: spec.length,
            format: "length",
          },
          {
            key: "endOverhang",
            label: "End overhang",
            value: spec.endOverhang,
            format: "length",
          },
          {
            key: "footprintWidth",
            label: "Derived lateral contact footprint",
            value: footprintWidth,
            format: "length",
          },
          {
            key: "footprintLength",
            label: "Derived longitudinal footprint",
            value: footprintLength,
            format: "length",
          },
          {
            key: "controllingTippingRatio",
            label: "Controlling half-footprint ÷ height",
            value: controllingTippingRatio,
            format: "number",
            precision: 3,
          },
        ],
      },
    ),
    structuralMetric(
      "floor-rocking",
      "Floor rocking tolerance",
      floorRocking,
      spec.levelingFeet.enabled
        ? "four independently adjustable corner contacts"
        : spec.bottomSupportStyle === "none"
        ? spec.endFrameStyle === "box"
          ? "two end-box floor contacts"
          : "four fixed wood-leg contacts"
        : spec.bottomSupportStyle === "center-board"
          ? `${spec.endFrameStyle === "box" ? "end boxes" : "legs"} + one center floor contact`
          : `${spec.endFrameStyle === "box" ? "end boxes" : "legs"} + crossing floor-contact network`,
      {
        rationale:
          spec.endFrameStyle === "box"
            ? "With leveling feet enabled, four independently adjustable corner contacts replace the long wood and lower-support floor contacts; solid rod-entry clearance adds a small confidence margin. Without feet, rocking tolerance rewards long flat end-box bearing runs and fewer over-constrained contacts."
            : "With leveling feet enabled, four independently adjustable contacts can be leveled to an uneven floor. Without them, the four fixed wood legs are over-constrained and receive a lower base score even though each leg has a full flat foot.",
        formula:
          spec.levelingFeet.enabled
            ? "96 + 2 × clamp(outerEntryClearance ÷ rodDiameter, 0, 1)"
            : "contactBase + 10 × min(1, (bottomWidth − 2 × outerBottomRadius) ÷ bottomWidth), where contactBase = X 52, center board 62, none 84",
        inputs: [
          {
            key: "levelingFeetEnabled",
            label: "Adjustable feet",
            value: spec.levelingFeet.enabled ? "four enabled" : "disabled",
            format: "choice",
          },
          {
            key: "bottomSupportStyle",
            label: "Floor contact topology",
            value: spec.bottomSupportStyle,
            format: "choice",
          },
          {
            key: "rockingBase",
            label: "Topology base score",
            value: rockingBase,
            format: "number",
            precision: 0,
          },
          {
            key: "frameBottomWidth",
            label: "End-frame bottom width",
            value: spec.frameBottomWidth,
            format: "length",
          },
          {
            key: "frameOuterBottomCornerRadius",
            label: "Outer bottom radius",
            value: spec.frameOuterBottomCornerRadius,
            format: "length",
          },
          {
            key: "levelingFootExtension",
            label: "Floor-to-box extension",
            value: spec.levelingFeet.extension,
            format: "length",
          },
          {
            key: "levelingFootOuterEntryClearance",
            label: "Rod clearance at rounded entry",
            value: spec.levelingFeet.outerEntryClearance,
            format: "length",
          },
          {
            key: "flatBottomRun",
            label: "Flat bottom fraction",
            value: flatBottomRun,
            format: "number",
            precision: 3,
          },
        ],
      },
    ),
    structuralMetric(
      "member-stiffness",
      "Member stiffness",
      memberStiffness,
      `support slenderness ${supportSlenderness.toFixed(1)}:1 · channel-reinforced top ${channelTopStiffness.tabletopSlenderness.toFixed(1)}:1`,
      {
        rationale:
          "This relative stiffness screen penalizes frame stiles or legs above 8:1, the most slender active support above 25:1, and the channel-reinforced tabletop above 24:1. The tabletop term uses the remaining oak plus the steel U-channel web and flanges about their shared transformed-section neutral axis, with fixed white-oak and steel modulus assumptions.",
        formula:
          "100 − max(0, stileSlenderness − 8) × 2 − max(0, supportSlenderness − 25) × 0.9 − max(0, tabletopWidth ÷ (topThickness × ∛topPlaneStiffnessFactor) − 24) × 0.8",
        inputs: [
          {
            key: "openingHeight",
            label: spec.endFrameStyle === "box" ? "End-box opening height" : "Open leg height",
            value: spec.openingHeight,
            format: "length",
          },
          {
            key: "frameSideWidth",
            label: spec.endFrameStyle === "box" ? "End-box side width" : "Leg width",
            value: spec.frameSideWidth,
            format: "length",
          },
          {
            key: "frameDepth",
            label: "Member depth",
            value: spec.frameDepth,
            format: "length",
          },
          {
            key: "stileSlenderness",
            label: "Derived stile slenderness",
            value: stileSlenderness,
            format: "number",
            precision: 2,
            suffix: ":1",
          },
          {
            key: "supportSlenderness",
            label: "Controlling support slenderness",
            value: supportSlenderness,
            format: "number",
            precision: 2,
            suffix: ":1",
          },
          {
            key: "topThickness",
            label: "Tabletop thickness",
            value: spec.topThickness,
            format: "length",
          },
          {
            key: "channelStripFraction",
            label: "Three channel strips ÷ tabletop length",
            value: channelTopStiffness.channelStripFraction,
            format: "number",
            precision: 3,
          },
          {
            key: "channelTransformedSectionRatio",
            label: "Mortised oak/steel section ÷ bare oak",
            value: channelTopStiffness.transformedSectionRatio,
            format: "number",
            precision: 3,
            suffix: "×",
          },
          {
            key: "topPlaneStiffnessFactor",
            label: "Derived tabletop stiffness factor",
            value: channelTopStiffness.topPlaneStiffnessFactor,
            format: "number",
            precision: 3,
            suffix: "×",
          },
          {
            key: "effectiveTopThickness",
            label: "Equivalent tabletop thickness",
            value: channelTopStiffness.effectiveTopThickness,
            format: "length",
          },
          {
            key: "tabletopSlenderness",
            label: "Channel-reinforced tabletop slenderness",
            value: channelTopStiffness.tabletopSlenderness,
            format: "number",
            precision: 2,
            suffix: ":1",
          },
          {
            key: "materialAssumption",
            label: "Fixed material assumption",
            value: `White oak ${STRUCTURAL_MATERIAL.whiteOakModulusGPa.toFixed(2)} GPa; steel ${STRUCTURAL_MATERIAL.steelModulusGPa.toFixed(0)} GPa (${channelTopStiffness.modularRatio.toFixed(1)}:1)`,
            format: "choice",
          },
        ],
      },
    ),
  ];
  const overallScore = structuralScore(
    metrics.reduce(
      (total, metric) =>
        total + metric.score * STRUCTURAL_WEIGHTS[metric.key],
      0,
    ),
  );
  return {
    overallScore,
    overallGrade: structuralGrade(overallScore),
    overallCalculation: {
      rationale:
        "The composite emphasizes the failure modes most likely to feel like table wobble: lengthwise racking, end-box racking, and torsion. Tipping, floor rocking, and member stiffness remain material contributors without overwhelming the connection topology.",
      formula: metrics
        .map(
          (metric) =>
            `${(STRUCTURAL_WEIGHTS[metric.key] * 100).toFixed(0)}% × ${metric.label}`,
        )
        .join(" + "),
      scoringNote: `The weighted sum is ${overallScore.toFixed(1)}. Grade bands: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, F < 50. This remains a geometry-only comparison, not a load certification.`,
    },
    metrics,
    basis: "geometry-only screening",
  };
}

export function getHoverDiningTableStructuralAssessment(
  params: ModelParams,
): HoverDiningTableStructuralAssessment {
  const { fullSize: spec } = getHoverDiningTableSpec(params);
  const current = evaluateHoverDiningTableStructure(spec);
  const stepMm = 25.4;
  const assessHeight = (heightMm: number) => {
    try {
      const candidate = getHoverDiningTableSpec({
        ...params,
        overallHeight: heightMm,
      }).fullSize;
      const score = evaluateHoverDiningTableStructure(candidate).overallScore;
      return {
        heightMm,
        score,
        delta: Number((score - current.overallScore).toFixed(1)),
      };
    } catch {
      return null;
    }
  };
  return {
    ...current,
    heightSensitivity: {
      stepMm,
      lower: assessHeight(spec.height - stepMm),
      higher: assessHeight(spec.height + stepMm),
    },
  };
}

function formatBraceAngle(brace: BracePlaneSpec) {
  return `${THREE.MathUtils.radToDeg(brace.angleRadians).toFixed(1)}°`;
}

function topSupportAuditLabel(spec: HoverDiningTableSpec, unit: LengthUnit) {
  return spec.topSupportStyle === "x"
    ? `X · 2 × ${formatLength(spec.upperBrace.diagonalLength, unit)} at ±${formatBraceAngle(spec.upperBrace)}`
    : `2 original lengthwise stretchers · ${formatLength(spec.upperStretchers.spanX, unit)} long × ${formatLength(spec.upperStretchers.width, unit)} wide × ${formatLength(spec.upperStretchers.thickness, unit)} high${spec.upperStretchers.shoulderRadius > EPSILON ? ` · mirrored upper-end R ${formatLength(spec.upperStretchers.shoulderRadius, unit)}` : ""} · centers at ±${formatLength(Math.abs(spec.upperStretchers.centerYs[0]), unit)}${spec.cornerKneeBraces.enabled ? " · 4 corner triangles" : ""}`;
}

function bottomSupportAuditLabel(spec: HoverDiningTableSpec, unit: LengthUnit) {
  if (spec.bottomSupportStyle === "x") {
    return `X · 2 × ${formatLength(spec.lowerBrace.diagonalLength, unit)} at ±${formatBraceAngle(spec.lowerBrace)}`;
  }
  if (spec.bottomSupportStyle === "center-board") {
    return `1 centered lengthwise board · ${formatLength(spec.lowerCenterBoard.spanX, unit)} long`;
  }
  return spec.endFrameStyle === "box"
    ? "None · end boxes remain unconnected at floor level"
    : "None · four legs remain independent at floor level";
}

export function getHoverDiningTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const { fullSize: spec, scaled } = getHoverDiningTableSpec(params);
  switch (check.key) {
    case "hoverTableEnvelope":
      return item(
        check.label,
        `${formatLength(spec.length, unit)} × ${formatLength(spec.width, unit)} × ${formatLength(spec.height, unit)}`,
      );
    case "hoverTabletopProfile":
      return item(
        check.label,
        `${formatLength(spec.topThickness, unit)} top · ${formatLength(spec.topEdgeRoll, unit)} long-edge roll · ${formatLength(spec.topPlanCornerRadius, unit)} plan corners · ${formatLength(spec.topEndFaceRoundover, unit)} length-end round-over`,
      );
    case "hoverChannels":
      {
        const positions = spec.channels.centerXs
          .map((centerX) => formatLength(centerX + spec.length / 2, unit))
          .join(" / ");
        return item(
          check.label,
          `3 × widthwise blackened-steel U-channels · centers ${positions} from left end · ${formatLength(spec.channels.length, unit)} long × ${formatLength(spec.channels.depth, unit)} deep · webs flush underside · ${(upperSupportOakBearingFraction(spec) * 100).toFixed(0)}% upper-support length remains direct-to-oak`,
        );
      }
    case "hoverEndBoxes":
      return item(
        check.label,
        spec.endFrameStyle === "box"
          ? `2 × ${formatLength(spec.frameTopWidth, unit)} wide closed boxes`
          : `2 open frames · 4 full-height legs · ${formatLength(spec.frameTopWidth, unit)} wide wave-curve top rails`,
      );
    case "hoverBoxOpening":
      return item(
        check.label,
        `${formatLength(spec.openingTopWidth, unit)} clear at top × ${formatLength(spec.openingHeight, unit)} high${spec.endFrameStyle === "legs" ? " · open to floor" : ""}`,
      );
    case "hoverCornerCurves":
      return item(
        check.label,
        spec.frameCornerStyle === "circular"
          ? `Circular Wave shoulders · outer R ${formatLength(spec.frameOuterTopCornerRadius, unit)} / inner R ${formatLength(spec.frameInnerTopCornerRadius, unit)} · tangent to rail + legs`
          : spec.endFrameStyle === "box"
          ? `outer top/bottom ${formatLength(spec.frameOuterTopCornerRadius, unit)} / ${formatLength(spec.frameOuterBottomCornerRadius, unit)} κ rail ${spec.frameOuterRailCurveTension.toFixed(3)} / stile ${spec.frameOuterStileCurveTension.toFixed(3)} · inner top/bottom ${formatLength(spec.frameInnerTopCornerRadius, unit)} / ${formatLength(spec.frameInnerBottomCornerRadius, unit)} κ rail ${spec.frameInnerRailCurveTension.toFixed(3)} / stile ${spec.frameInnerStileCurveTension.toFixed(3)}`
          : `Wave-curve top shoulders · outer ${formatLength(spec.frameOuterTopCornerRadius, unit)} / inner ${formatLength(spec.frameInnerTopCornerRadius, unit)} · κ rail ${spec.frameOuterRailCurveTension.toFixed(3)} / ${spec.frameInnerRailCurveTension.toFixed(3)} · κ leg ${spec.frameOuterStileCurveTension.toFixed(3)} / ${spec.frameInnerStileCurveTension.toFixed(3)}`,
      );
    case "hoverBoxSplay":
      return item(
        check.label,
        `${formatSignedLength(spec.frameBottomSpread, unit)} bottom spread`,
      );
    case "hoverUpperX":
      return item(
        check.label,
        topSupportAuditLabel(spec, unit),
      );
    case "hoverLowerX":
      return item(
        check.label,
        bottomSupportAuditLabel(spec, unit),
      );
    case "hoverBraceEndCuts":
      {
        const bottomFaceCount =
          spec.bottomSupportStyle === "x"
            ? 4
            : spec.bottomSupportStyle === "center-board"
              ? 2
              : 0;
        return item(
          check.label,
          `${spec.upperStretchers.shoulderRadius > EPSILON ? `2 rails with mirrored circular upper-end R ${formatLength(spec.upperStretchers.shoulderRadius, unit)} · positive rail/frame joinery required` : `${4 + bottomFaceCount} ${spec.endFrameStyle === "box" ? "box" : "frame"}-parallel support end faces · selected members stop on straight contact zones`} · ${spec.cornerKneeBraces.enabled ? "8 knee-brace contact faces · " : ""}${formatLength(spec.upperStretchers.topEdgeRadius > EPSILON ? spec.upperStretchers.topEdgeRadius : spec.upperStretchers.edgeRadius, unit)} ${spec.upperStretchers.endRadius > EPSILON ? `${spec.upperStretchers.topEdgeRadius > EPSILON ? "top-edge" : "bottom-edge"} + shoulder face-edge round-over` : `${spec.upperStretchers.topEdgeRadius > EPSILON ? "top-edge" : "bottom-edge"} round-over`}${spec.matchLengthwiseRailRoundover ? " matching legs" : ""}`,
        );
      }
    case "hoverHalfLaps":
      {
        const xCount =
          (spec.topSupportStyle === "x" ? 1 : 0) +
          (spec.bottomSupportStyle === "x" ? 1 : 0);
        return item(
          check.label,
          xCount === 0
            ? "Not required by the selected straight-support layouts"
            : `${xCount} centered · full width · complementary 50% depth · ${formatLength(spec.halfLapClearance, unit)} fit clearance`,
        );
      }
    case "hoverDirectContact":
      return item(
        check.label,
        `top supports + recessed channel webs Z ${formatLength(spec.topBottom, unit)} · ${(upperSupportOakBearingFraction(spec) * 100).toFixed(0)}% direct oak bearing · ${spec.bottomSupportStyle === "none" ? "no lower support selected" : `lower supports Z ${formatLength(spec.frameBottomZ, unit)}`} · ${spec.levelingFeet.enabled ? "feet alone contact floor" : "wood base contacts floor"}`,
      );
    case "hoverLevelingFeet":
      return item(
        check.label,
        spec.levelingFeet.enabled
          ? `4 × ${formatLength(spec.levelingFeet.padDiameter, unit)} pads · ${formatLength(spec.levelingFeet.rodLength, unit)} × ${formatLength(spec.levelingFeet.rodDiameter, unit)} rods · ${formatLength(spec.levelingFeet.extension, unit)} floor-to-frame · ${formatLength(spec.levelingFeet.embeddedRodLength, unit)} embedded · ${formatLength(spec.levelingFeet.outerEntryClearance, unit)} entry clearance · ${formatLength(spec.frameHeight, unit)} high legs`
          : `Disabled · ${formatLength(spec.frameHeight, unit)} ${spec.endFrameStyle === "box" ? "end boxes" : "full-height legs"} bear directly at floor level`,
      );
    case "hoverExplodedAssembly":
      return item(
        check.label,
        `${getHoverDiningTablePieceCount(params)} constrained solids · mortised profiled top · 3 steel C-channels · ${spec.endFrameStyle === "box" ? "4 Bézier rails · 4 tangent-seam stiles" : "2 circular-radius wave rails · 4 full-height legs"} · selected finished supports${spec.cornerKneeBraces.enabled ? " · 4 top-frame knee braces" : ""}${spec.levelingFeet.enabled ? " · 4 leveling feet" : ""}`,
      );
    case "hoverCutList":
      {
        const scheduleLines =
          (spec.endFrameStyle === "box" ? 5 : 4) +
          (spec.levelingFeet.enabled ? 1 : 0) +
          (spec.topSupportStyle === "x" ? 2 : 1) +
          (spec.cornerKneeBraces.enabled ? 1 : 0) +
          (spec.bottomSupportStyle === "x"
            ? 2
            : spec.bottomSupportStyle === "center-board"
              ? 1
              : 0);
        return item(
          check.label,
          `${scheduleLines} schedule lines · ${getHoverDiningTablePieceCount(params)} oak + steel pieces · exact profiles + edge or U-channel sections · full-size finished dimensions`,
        );
      }
    case "hoverRoutingTemplates":
      return item(
        check.label,
        `${spec.endFrameStyle === "box" ? 3 : 2} profiles · ${formatLength(getParam(params, "templateThickness"), unit)} thick · ${formatLength(getParam(params, "templatePlateLength"), unit)} plate · keyed dovetails`,
      );
    case "hoverPrintEnvelope":
      return item(
        check.label,
        `1:${spec.scale.toFixed(0)} · ${scaled.length.toFixed(1)} × ${scaled.width.toFixed(1)} × ${scaled.height.toFixed(1)} mm`,
      );
    default:
      return item(check.label, "Not configured", "warn");
  }
}

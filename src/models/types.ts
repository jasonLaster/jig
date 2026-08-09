export type ModelParams = Record<string, number>;

export type LengthUnit = "mm" | "cm" | "in";

export type AuditStatus = "pass" | "warn";

export type AuditItem = {
  label: string;
  value: string;
  status: AuditStatus;
};

export type NumberLimits = {
  min: number;
  max: number;
  step: number;
};

export type ModelParameter = {
  key: string;
  label: string;
  group?: string;
  statusLabel?: string;
  default: number;
  limits: NumberLimits;
};

export type AuditCheckDefinition = {
  key: string;
  label: string;
  minMiddleHeightMm?: number;
  minSandMassKg?: number;
  minSandVolumeCc?: number;
};

export type ModelScript = {
  name: string;
  path: string;
  command: string;
  description?: string;
};

export type HolderGeometry = {
  originalHeight: number;
  originalDiameter: number;
  mainAxis: {
    x: number;
    y: number;
    z?: number;
  };
  fixedCoreRadius: number;
  outerMoveStartRadius: number;
  bottomLockedHeight: number;
  topLockedHeight: number;
  centerTubeOuterDiameter: number;
  centerTubeInnerDiameter: number;
  tubeToHolderDiameterClearance: number;
  centerTubeOriginalTop: number;
  centerTubeTopClearance: number;
  sandBottomHeight: number;
  sandHeadspace: number;
  sandDensityGramsPerCc: number;
};

export type TrayGeometry = {
  originalLength: number;
  originalWidth: number;
  originalHeight: number;
  footprintRotationDegrees: number;
  mainAxis: {
    x: number;
    y: number;
    z: number;
  };
  originalFloorThickness: number;
  originalRibRelief: number;
  minimumWallHeight: number;
  minimumFloorThickness: number;
  minimumRibRelief: number;
  maximumRibRelief: number;
};

export type SimpleBoxGeometry = TrayGeometry & {
  stackingLipThickness: number;
  stackingLipWallInset: number;
  stackingLipCornerRadius: number;
  stackingLipFloorOverlap: number;
  stackingLipChamferHeight: number;
  dividerThickness: number;
  dividerWallInset: number;
  dividerTopClearance: number;
  dividerFloorOverlap: number;
  gridfinityGridSize: number;
  gridfinityFootTopSize: number;
  gridfinityFootCornerRadius: number;
  gridfinityBottomChamfer: number;
  gridfinityStraightHeight: number;
  gridfinityTopChamfer: number;
  gridfinityFootOverlap: number;
  gridfinityLipInnerChamfer: number;
  gridfinityLipStraightHeight: number;
  gridfinityLipOuterChamfer: number;
  gridfinityLipSupportHeight: number;
};

export type DoorLockAdapterGeometry = {
  mainAxis: {
    x: number;
    y: number;
    z: number;
  };
  radialSegments: number;
  minimumWallThickness: number;
};

export type DiningTableGeometry = {
  mainAxis: { x: number; y: number; z: number };
  cornerSegments: number;
  edgeProfileSegments: number;
  channelCount: 0 | 3;
  legSplayDegrees?: number;
  longApronEndAngleDegrees?: number;
  sideApronEdgeAngleDegrees?: number;
  sideApronBottomChamferDegrees?: number;
};

export type HoverDiningTableGeometry = {
  mainAxis: { x: number; y: number; z: number };
  curveSegments: number;
  bevelSegments: number;
  braceRoundoverSegments: number;
  channelCount: 3;
};

export type SupportedViewer =
  | "weighted-paper-towel-holder-v1"
  | "japandi-tray-v1"
  | "simple-box-v1"
  | "door-lock-adapter-v1"
  | "dining-table-v1"
  | "hover-dining-table-v1";

export type BaseModelDefinition = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  viewer: SupportedViewer;
  stl: {
    fileName: string;
    sourceName: string;
    units: "mm";
    url: string;
  };
  export: {
    filePrefix: string;
  };
  parameters: ModelParameter[];
  audit: {
    toleranceMm: number;
    dimensionTargets: string[];
    invariants: string[];
    checks: AuditCheckDefinition[];
  };
  scripts: ModelScript[];
};

export type HolderModelDefinition = BaseModelDefinition & {
  viewer: "weighted-paper-towel-holder-v1";
  geometry: HolderGeometry;
};

export type TrayModelDefinition = BaseModelDefinition & {
  viewer: "japandi-tray-v1";
  geometry: TrayGeometry;
};

export type SimpleBoxModelDefinition = BaseModelDefinition & {
  viewer: "simple-box-v1";
  geometry: SimpleBoxGeometry;
};

export type DoorLockAdapterModelDefinition = BaseModelDefinition & {
  viewer: "door-lock-adapter-v1";
  geometry: DoorLockAdapterGeometry;
};

export type DiningTableModelDefinition = BaseModelDefinition & {
  viewer: "dining-table-v1";
  geometry: DiningTableGeometry;
};

export type HoverDiningTableModelDefinition = BaseModelDefinition & {
  viewer: "hover-dining-table-v1";
  geometry: HoverDiningTableGeometry;
};

export type ModelDefinition =
  | HolderModelDefinition
  | TrayModelDefinition
  | SimpleBoxModelDefinition
  | DoorLockAdapterModelDefinition
  | DiningTableModelDefinition
  | HoverDiningTableModelDefinition;

export type ModelDimensions = {
  length: number;
  width: number;
  height: number;
};

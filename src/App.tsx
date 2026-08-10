import {
  Box,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Focus,
  GitFork,
  Hand,
  Info,
  Images,
  Layers3,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useConvexConnectionState, useQuery } from "convex/react";
import {
  Component,
  forwardRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { WebGLPathTracer } from "three-gpu-pathtracer";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { api } from "../convex/_generated/api";
import {
  filterLibraryModels,
  LibraryUnavailableMessage,
  SaveForkControls,
  type CatalogSeedModel,
  type SavedLibraryVersion,
} from "./LibraryPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { HoverDiningTableCutList } from "./components/HoverDiningTableCutList";
import {
  HoverBrochurePanel,
  type BrochureGenerationState,
} from "./components/HoverBrochurePanel";
import { MiniModelViewer } from "./components/MiniModelViewer";
import {
  applyHolderMorph,
  applyTrayMorph,
  buildAuditItems,
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDiningTableStructuralAssessment,
  createDoorLockAdapterGeometry,
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  createHoverDiningTableHardwareGeometries,
  createHoverDiningTableTemplateSegments,
  getHoverDiningTableTemplateSummary,
  getHoverDiningTablePieceCount,
  getHoverDiningTableStructuralAssessment,
  createRoundedTopGeometry,
  createSandChamberFloorGeometry,
  createSandPreviewGeometry,
  createSimpleBoxLidGeometries,
  createSimpleBoxLidPrintGeometries,
  createTrayDividerGeometries,
  createTrayStackingLipGeometry,
  getDefaultParams,
  getGridfinityUnitCount,
  getModelDimensions,
  getParam,
  getParameterLimits,
  getStatusItems,
  snapGridfinityDimension,
  updateDoorLockAdapterGuide,
  updateDiningTableGuide,
  updateHoverDiningTableGuide,
  updateHolderGuide,
  updateTrayGuide,
  updateWeightedCore,
  type AuditItem,
  type LengthUnit,
  type HoverDiningTableStructuralMetric,
  type ModelDefinition,
  type ModelParameter,
  type ModelParams,
  type NumberLimits,
} from "./models";
import {
  UNIT_OPTIONS,
  formatLengthInput,
  formatLength,
  fromUnit,
  isLengthUnit,
  parseLengthInput,
  stepLengthInput,
  toUnit,
} from "./units";
import { createWoodTexture, getWoodSpeciesForModel } from "./woodTexture";
import {
  loadOakRenderingAssets,
  type OakRenderingAssets,
} from "./oakPbr";
import type { Id } from "../convex/_generated/dataModel";

type CoreViewMode = "surface" | "fill" | "section";
type RenderMode = "solid" | "xray" | "wire";
type RenderQuality = "standard" | "high" | "photo";
type ThemeMode = "light" | "dark";
type ViewPreset = "iso" | "top" | "bottom" | "xEdge" | "yEdge";
type AssemblyMode =
  | "box"
  | "stacked"
  | "lid"
  | "print-layout"
  | "assembled"
  | "exploded"
  | "cut-list"
  | "templates"
  | "brochure";
type ViewerInteractionMode = "orbit" | "pan";
type MobileInspectorSection = "assembly" | "parameters" | "checks";

type ViewerHandle = {
  captureBrochureViews: () => Promise<string[]>;
  exportStl: () => void;
  exportLidStl: () => void;
  exportBoxAndLidStl: () => void;
  exportHoverTemplateStls: () => void;
  getStlBlob: () => Blob | null;
  resetCamera: () => void;
  setView: (preset: ViewPreset) => void;
};

type ModelCatalogEntry = {
  id: string;
  name: string;
  configUrl: string;
};

type ModelCatalog = {
  version: number;
  models: ModelCatalogEntry[];
};

export type BrochureDimensions = {
  height: number;
  length: number;
  topThickness: number;
  width: number;
};

export const BROCHURE_ASSET_KINDS = [
  "room-hero",
  "room-alternate",
  "table-three-quarter",
  "table-profile",
] as const;
export type BrochureAssetKind = (typeof BROCHURE_ASSET_KINDS)[number];

export type BrochureAsset = {
  kind: BrochureAssetKind;
  imageUrl: string;
  mediaType: string;
};

export type StoredBrochureAsset = {
  kind: BrochureAssetKind;
  storageId: string;
  mediaType: string;
};

export type SavedBrochure = {
  assets: BrochureAsset[];
  generationId: string;
  imageUrl: string;
  modelKey: string;
  modelName: string;
  dimensions: BrochureDimensions;
  createdAt: number;
  updatedAt: number;
};

type BrochureRecordInput = {
  clientId: string;
  dimensions: BrochureDimensions;
  generationId: string;
  imageModel: string;
  modelKey: string;
  modelName: string;
  params: ModelParams;
  promptVersion: string;
  referenceCount: number;
  outputCount: number;
};

export type BrochurePersistence = {
  create: (input: BrochureRecordInput) => Promise<void>;
  createUploadUrls: (
    kinds: BrochureAssetKind[],
  ) => Promise<Array<{ kind: BrochureAssetKind; url: string }>>;
  complete: (input: {
    assets: StoredBrochureAsset[];
    clientId: string;
    generationId: string;
    warnings: string[];
  }) => Promise<{ assets: BrochureAsset[]; imageUrl: string }>;
  fail: (input: {
    clientId: string;
    errorMessage: string;
    generationId: string;
  }) => Promise<void>;
};

type PendingBrochureSave = {
  assets: StoredBrochureAsset[];
  record: BrochureRecordInput;
  warnings: string[];
};

const CATALOG_URL = "/models/index.json";
const DEFAULT_MODEL_ID = "japandi-tray";
const DEFAULT_LENGTH_UNIT: LengthUnit = "in";
const PARAM_QUERY_KEYS = [
  "height",
  "diameter",
  "tubeDiameter",
  "tubeLength",
  "boxWidth",
  "boxLength",
  "notchHeight",
  "notchWidth",
  "notchLength",
  "cutoutWidth",
  "cutoutLength",
  "cutoutRotation",
  "firstDiameter",
  "increment",
  "tubeHeight",
  "boreDiameter",
  "mockScale",
  "tableLength",
  "tableWidth",
  "overallHeight",
  "topThickness",
  "topEdgeThickness",
  "undersideBevelInset",
  "legTopWidth",
  "legFootWidth",
  "legThickness",
  "legFootChamfer",
  "longApronLength",
  "longApronHeight",
  "sideApronLength",
  "sideApronHeight",
  "apronThickness",
  "apronSetback",
  "tabletopCornerRadius",
  "topRoundoverRadius",
  "bottomRoundoverRadius",
  "legSize",
  "legCornerRadius",
  "legOuterCornerRadius",
  "legEdgeInset",
  "legGrooveEnabled",
  "legGrooveHeight",
  "legGrooveDepth",
  "revealOffset",
  "revealHeight",
  "revealDepth",
  "legTopRoundoverRadius",
  "legBottomRoundoverRadius",
  "plateSize",
  "plateThickness",
  "plateEdgeInset",
  "channelPosition1",
  "channelPosition2",
  "channelPosition3",
  "channelLength",
  "channelWidth",
  "channelDepth",
  "topEdgeRoll",
  "topEdgeTension",
  "topPlanCornerRadius",
  "topEndFaceRoundover",
  "sideOverhang",
  "endOverhang",
  "endFrameStyle",
  "frameDepth",
  "frameSideWidth",
  "frameBottomRailHeight",
  "frameTopRailHeight",
  "frameBottomSpread",
  "frameOuterTopCornerRadius",
  "frameOuterBottomCornerRadius",
  "frameInnerTopCornerRadius",
  "frameInnerBottomCornerRadius",
  "frameOuterRailCurveTension",
  "frameOuterStileCurveTension",
  "frameInnerRailCurveTension",
  "frameInnerStileCurveTension",
  "levelingFeetEnabled",
  "levelingFootPadDiameter",
  "levelingFootPadThickness",
  "levelingFootRodDiameter",
  "levelingFootRodLength",
  "levelingFootExtension",
  "levelingFootExtensionLeftFront",
  "levelingFootExtensionLeftRear",
  "levelingFootExtensionRightFront",
  "levelingFootExtensionRightRear",
  "topSupportStyle",
  "bottomSupportStyle",
  "syncCrossbarDimensions",
  "topSupportWidth",
  "topSupportThickness",
  "topSupportEndpointInset",
  "topSupportEdgeRadius",
  "matchLengthwiseRailRoundover",
  "bottomSupportWidth",
  "bottomSupportThickness",
  "bottomSupportEndpointInset",
  "bottomSupportEdgeRadius",
  "bottomSupportTopEdgeRadius",
  // Legacy shared/split support keys are retained only for URL migration.
  "xBraceWidth",
  "xBraceThickness",
  "xBraceEndpointInset",
  "xBraceEdgeRadius",
  // Retain the former shared-radius and split-brace keys so old links migrate
  // once and are then removed when the canonical state is written.
  "frameOuterCornerRadius",
  "frameInnerCornerRadius",
  "frameOuterCurveTension",
  "frameInnerCurveTension",
  "frameEdgeRoundover",
  "upperBraceWidth",
  "upperBraceThickness",
  "upperBraceEndpointInset",
  "upperBraceEdgeRadius",
  "lowerBraceWidth",
  "lowerBraceThickness",
  "lowerBraceEndpointInset",
  "lowerBraceEdgeRadius",
  "halfLapClearance",
  "templateThickness",
  "templatePlateLength",
  "templateDovetailDepth",
  "templateJointClearance",
  // Retain superseded base keys so older shared URLs are cleaned on load.
  "hoverGap",
  "stretcherHeight",
  "stretcherThickness",
  "stretcherEdgeRadius",
  "supportPadLength",
  "supportPadWidth",
  "length",
  "width",
  "floorThickness",
  "ribRelief",
  "rotation",
];
const ANGLE_PARAM_KEYS = new Set(["rotation", "cutoutRotation"]);
const SCALAR_PARAM_KEYS = new Set([
  "dividerCount",
  "gridfinityCompatible",
  "legGrooveEnabled",
  "mockScale",
  "topEdgeTension",
  "frameOuterRailCurveTension",
  "frameOuterStileCurveTension",
  "frameInnerRailCurveTension",
  "frameInnerStileCurveTension",
  "endFrameStyle",
  "topSupportStyle",
  "bottomSupportStyle",
  "syncCrossbarDimensions",
  "levelingFeetEnabled",
  "matchLengthwiseRailRoundover",
]);
const CURVE_PARAM_KEYS = new Set([
  "topEdgeTension",
  "frameOuterRailCurveTension",
  "frameOuterStileCurveTension",
  "frameInnerRailCurveTension",
  "frameInnerStileCurveTension",
]);
const OPTION_PARAM_KEYS = new Set([
  "gridfinityCompatible",
  "legGrooveEnabled",
  "endFrameStyle",
  "syncCrossbarDimensions",
  "levelingFeetEnabled",
  "matchLengthwiseRailRoundover",
]);
const LEG_GROOVE_PARAM_KEYS = new Set([
  "legGrooveHeight",
  "legGrooveDepth",
]);
const PLATE_LEVELING_FOOT_PARAM_KEYS = new Set([
  "levelingFootPadDiameter",
  "levelingFootPadThickness",
  "levelingFootRodDiameter",
  "levelingFootRodLength",
  "levelingFootExtensionLeftFront",
  "levelingFootExtensionLeftRear",
  "levelingFootExtensionRightFront",
  "levelingFootExtensionRightRear",
]);
const DIVIDER_PARAM_KEYS = new Set([
  "dividerCount",
  "dividerPosition1",
  "dividerPosition2",
  "dividerPosition3",
  "dividerPosition4",
]);
const HOVER_SUPPORT_SYNC_PAIRS = [
  ["topSupportWidth", "bottomSupportWidth"],
  ["topSupportThickness", "bottomSupportThickness"],
  ["topSupportEndpointInset", "bottomSupportEndpointInset"],
  ["topSupportEdgeRadius", "bottomSupportEdgeRadius"],
] as const;

function getHoverSupportSyncPair(key: string) {
  return HOVER_SUPPORT_SYNC_PAIRS.find(
    ([topKey, bottomKey]) => topKey === key || bottomKey === key,
  );
}

function isHoverCrossbarSyncActive(params: ModelParams) {
  return (
    getParam(params, "syncCrossbarDimensions") >= 0.5 &&
    getParam(params, "topSupportStyle") < 0.5 &&
    getParam(params, "bottomSupportStyle") < 0.5
  );
}

function getHoverSyncedParameterLimits(
  model: ModelDefinition,
  params: ModelParams,
  key: string,
) {
  const limits = getParameterLimits(model, params, key);
  const pair = getHoverSupportSyncPair(key);
  if (!pair || !isHoverCrossbarSyncActive(params)) return limits;
  const partnerKey = pair[0] === key ? pair[1] : pair[0];
  const partnerLimits = getParameterLimits(model, params, partnerKey);
  const min = Math.max(limits.min, partnerLimits.min);
  return {
    ...limits,
    min,
    max: Math.max(min, Math.min(limits.max, partnerLimits.max)),
  };
}

function synchronizeHoverCrossbarDimensions(
  model: ModelDefinition,
  params: ModelParams,
) {
  if (!isHoverCrossbarSyncActive(params)) return params;
  const next = { ...params };
  for (const [topKey, bottomKey] of HOVER_SUPPORT_SYNC_PAIRS) {
    const limits = getHoverSyncedParameterLimits(model, next, topKey);
    const value = Number(
      clamp(getParam(next, topKey), limits.min, limits.max).toFixed(1),
    );
    next[topKey] = value;
    next[bottomKey] = value;
  }
  return next;
}
const SIDEBAR_WIDTH_KEY = "jig:sidebar-width";
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 620;
const SIDEBAR_DEFAULT_WIDTH = 390;
const INSPECTOR_COLLAPSED_WIDTH = 52;
const LIBRARY_SIDEBAR_WIDTH_KEY = "jig:library-sidebar-width";
const THEME_STORAGE_KEY = "jig:theme";
const BROCHURE_CLIENT_ID_KEY = "jig:brochure-client-id";
const ENABLE_TRAY_ORIENTATION_CONTROLS =
  import.meta.env.VITE_ENABLE_TRAY_ORIENTATION_CONTROLS === "true";
const LIBRARY_SIDEBAR_MIN_WIDTH = 280;
const LIBRARY_SIDEBAR_MAX_WIDTH = 460;
const LIBRARY_SIDEBAR_DEFAULT_WIDTH = 304;
const LIBRARY_SIDEBAR_COLLAPSED_WIDTH = 52;
const PLAYWRIGHT_TEST_VERSION_TITLE_PREFIX = "Playwright ";
const SCENE_BACKGROUND = {
  light: "#f7f8fb",
  dark: "#090c11",
} satisfies Record<ThemeMode, string>;
const SCENE_GRID_COLORS = {
  light: { center: "#c7ced8", grid: "#e2e6ec" },
  dark: { center: "#526073", grid: "#222a36" },
} satisfies Record<ThemeMode, { center: string; grid: string }>;
const STL_EXPORT_MIN_AREA_SQUARED = 1e-12;

const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  solid: "Solid",
  xray: "X-Ray",
  wire: "Wire",
};

const RENDER_QUALITY_LABELS: Record<RenderQuality, string> = {
  standard: "Standard",
  high: "High",
  photo: "Photo",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isRenderQuality(value: string | null): value is RenderQuality {
  return value === "standard" || value === "high" || value === "photo";
}

function getRequestedRenderQuality(): RenderQuality {
  const value = new URLSearchParams(window.location.search).get("quality");
  return isRenderQuality(value) ? value : "high";
}

function disposePathTracer(pathTracer: WebGLPathTracer) {
  // three-gpu-pathtracer 0.0.23 references a renamed private quad in dispose().
  // Dispose the same owned resources directly until Jig can move to its next
  // release together with a compatible Three.js upgrade.
  const internals = pathTracer as unknown as {
    _quad?: { dispose: () => void; material?: THREE.Material };
    _pathTracer?: { dispose: () => void };
    _lowResPathTracer?: { dispose: () => void };
    _internalBackground?: THREE.Texture;
    _colorBackground?: THREE.Texture;
  };
  internals._quad?.material?.dispose();
  internals._quad?.dispose();
  internals._pathTracer?.dispose();
  internals._lowResPathTracer?.dispose();
  internals._internalBackground?.dispose();
  internals._colorBackground?.dispose();
}

function getInitialUnit(): LengthUnit {
  const unit = new URLSearchParams(window.location.search).get("unit");
  return isLengthUnit(unit) ? unit : DEFAULT_LENGTH_UNIT;
}

function getInitialTheme(): ThemeMode {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeMode(storedTheme)) {
    return storedTheme;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getBrochureClientId() {
  const storedId = window.localStorage.getItem(BROCHURE_CLIENT_ID_KEY);
  if (storedId && /^[a-zA-Z0-9-]{8,64}$/.test(storedId)) {
    return storedId;
  }
  const nextId = globalThis.crypto?.randomUUID?.() ??
    `brochure-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(BROCHURE_CLIENT_ID_KEY, nextId);
  return nextId;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(query).matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);
    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}

function getStoredSidebarWidth() {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(storedWidth)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return clamp(storedWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
}

function getStoredLibrarySidebarWidth() {
  const storedValue = window.localStorage.getItem(LIBRARY_SIDEBAR_WIDTH_KEY);
  if (storedValue === null || storedValue.trim() === "") {
    return LIBRARY_SIDEBAR_DEFAULT_WIDTH;
  }
  const storedWidth = Number(storedValue);
  if (!Number.isFinite(storedWidth)) {
    return LIBRARY_SIDEBAR_DEFAULT_WIDTH;
  }
  return clamp(
    storedWidth,
    LIBRARY_SIDEBAR_MIN_WIDTH,
    LIBRARY_SIDEBAR_MAX_WIDTH,
  );
}

function parseUrlParam(
  rawValue: string,
  unit: LengthUnit,
  parameter: ModelParameter,
) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (ANGLE_PARAM_KEYS.has(parameter.key) || SCALAR_PARAM_KEYS.has(parameter.key)) {
    return parsed;
  }

  if (unit === "mm") {
    return parsed;
  }

  const displayMax = toUnit(parameter.limits.max, unit);
  const looksLikeLegacyMillimeters =
    parsed > displayMax && parsed <= parameter.limits.max;

  return looksLikeLegacyMillimeters ? parsed : fromUnit(parsed, unit);
}

function getParamsFromUrl(model: ModelDefinition) {
  const searchParams = new URLSearchParams(window.location.search);
  const params = getDefaultParams(model);
  const requestedUnit = searchParams.get("unit");
  const unit = isLengthUnit(requestedUnit)
    ? requestedUnit
    : DEFAULT_LENGTH_UNIT;

  if (searchParams.get("model") !== model.id) {
    return params;
  }

  if (model.viewer === "hover-dining-table-v1") {
    const legacyAliases: Record<string, string[]> = {
      frameOuterTopCornerRadius: ["frameOuterCornerRadius"],
      frameOuterBottomCornerRadius: ["frameOuterCornerRadius"],
      frameInnerTopCornerRadius: ["frameInnerCornerRadius"],
      frameInnerBottomCornerRadius: ["frameInnerCornerRadius"],
      frameOuterRailCurveTension: ["frameOuterCurveTension"],
      frameOuterStileCurveTension: ["frameOuterCurveTension"],
      frameInnerRailCurveTension: ["frameInnerCurveTension"],
      frameInnerStileCurveTension: ["frameInnerCurveTension"],
      topSupportWidth: ["upperBraceWidth", "xBraceWidth", "lowerBraceWidth"],
      bottomSupportWidth: ["lowerBraceWidth", "xBraceWidth", "upperBraceWidth"],
      topSupportThickness: [
        "upperBraceThickness",
        "xBraceThickness",
        "lowerBraceThickness",
      ],
      bottomSupportThickness: [
        "lowerBraceThickness",
        "xBraceThickness",
        "upperBraceThickness",
      ],
      topSupportEndpointInset: [
        "upperBraceEndpointInset",
        "xBraceEndpointInset",
        "lowerBraceEndpointInset",
      ],
      bottomSupportEndpointInset: [
        "lowerBraceEndpointInset",
        "xBraceEndpointInset",
        "upperBraceEndpointInset",
      ],
      topSupportEdgeRadius: [
        "upperBraceEdgeRadius",
        "xBraceEdgeRadius",
        "lowerBraceEdgeRadius",
      ],
      bottomSupportEdgeRadius: [
        "lowerBraceEdgeRadius",
        "xBraceEdgeRadius",
        "upperBraceEdgeRadius",
      ],
    };
    for (const [canonicalKey, aliases] of Object.entries(legacyAliases)) {
      if (searchParams.has(canonicalKey)) continue;
      const parameter = model.parameters.find(
        (candidate) => candidate.key === canonicalKey,
      );
      if (!parameter) continue;
      const legacyValue = aliases
        .map((alias) => searchParams.get(alias))
        .find((value): value is string => value !== null);
      if (legacyValue === undefined) continue;
      const parsed = parseUrlParam(legacyValue, unit, parameter);
      if (parsed !== null) {
        params[canonicalKey] = clamp(
          parsed,
          parameter.limits.min,
          parameter.limits.max,
        );
      }
    }
  }

  for (const parameter of model.parameters) {
    const value = searchParams.get(parameter.key);
    if (value === null) {
      continue;
    }
    const parsed = parseUrlParam(value, unit, parameter);
    if (parsed !== null) {
      params[parameter.key] = clamp(
        parsed,
        parameter.limits.min,
        parameter.limits.max,
      );
    }
  }

  if (
    model.viewer === "simple-box-v1" &&
    params.gridfinityCompatible >= 0.5
  ) {
    for (const key of ["length", "width"] as const) {
      const limits = getParameterLimits(model, params, key);
      params[key] = snapGridfinityDimension(
        params[key],
        limits.min,
        limits.max,
        model.geometry.gridfinityGridSize,
      );
    }
  }

  if (model.viewer === "door-lock-adapter-v1") {
    for (const parameter of model.parameters) {
      const limits = getParameterLimits(model, params, parameter.key);
      params[parameter.key] = clamp(
        params[parameter.key],
        limits.min,
        limits.max,
      );
    }
  }

  if (model.viewer === "hover-dining-table-v1") {
    if (model.id === "wave-dining-table") {
      params.bottomSupportStyle = 2;
    }
    // Two passes settle limits whose valid ranges depend on other image-derived
    // dimensions (opening size, member width, radii, and reveal height).
    for (let pass = 0; pass < 2; pass += 1) {
      for (const parameter of model.parameters) {
        const limits = getParameterLimits(model, params, parameter.key);
        params[parameter.key] = clamp(
          params[parameter.key],
          limits.min,
          limits.max,
        );
      }
    }
    return synchronizeHoverCrossbarDimensions(model, params);
  }

  return params;
}

function serializeUrlParam(key: string, valueMm: number, unit: LengthUnit) {
  if (CURVE_PARAM_KEYS.has(key)) {
    return Number(valueMm.toFixed(4)).toString();
  }
  if (ANGLE_PARAM_KEYS.has(key) || SCALAR_PARAM_KEYS.has(key)) {
    return Number(valueMm.toFixed(1)).toString();
  }

  const value = unit === "mm" ? valueMm : toUnit(valueMm, unit);
  return Number(value.toFixed(4)).toString();
}

function writeUrlState({
  modelId,
  params,
  renderQuality,
  unit,
}: {
  modelId: string;
  params: ModelParams;
  renderQuality: RenderQuality;
  unit: LengthUnit;
}) {
  const url = new URL(window.location.href);
  url.searchParams.set("model", modelId);
  url.searchParams.set("unit", unit);
  url.searchParams.delete("theme");
  url.searchParams.delete("quality");
  if (getWoodSpeciesForModel(modelId)) {
    url.searchParams.set("quality", renderQuality);
  }

  for (const key of PARAM_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  for (const [key, value] of Object.entries(params)) {
    if (Number.isFinite(value)) {
      url.searchParams.set(key, serializeUrlParam(key, value, unit));
    }
  }

  window.history.replaceState(null, "", url);
}

function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  axis: { x: number; y: number; z?: number },
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute("position");
  const normalized = new Float32Array(sourcePosition.count * 3);

  for (let index = 0; index < sourcePosition.count; index += 1) {
    normalized[index * 3] = sourcePosition.getX(index) - axis.x;
    normalized[index * 3 + 1] = sourcePosition.getY(index) - axis.y;
    normalized[index * 3 + 2] = sourcePosition.getZ(index) - (axis.z ?? 0);
  }

  source.setAttribute("position", new THREE.BufferAttribute(normalized.slice(), 3));
  source.computeVertexNormals();
  source.computeBoundingBox();
  source.computeBoundingSphere();

  return {
    geometry: source,
    basePositions: normalized,
  };
}

function applyRenderOptions(
  mainMaterial: THREE.MeshStandardMaterial,
  secondaryMaterial: THREE.MeshStandardMaterial | null,
  sandMesh: THREE.Mesh | null,
  guideMesh: THREE.Mesh,
  coreMode: CoreViewMode,
  renderMode: RenderMode,
  model: ModelDefinition,
) {
  const isWeightedHolder = model.viewer === "weighted-paper-towel-holder-v1";
  const isCoreSection = isWeightedHolder && coreMode === "section";
  const isCoreFill = isWeightedHolder && coreMode === "fill";
  const isWireframe = renderMode === "wire" || isCoreSection;
  const isTransparent = renderMode !== "solid" || isCoreFill || isCoreSection;
  const opacity = (() => {
    if (isWireframe) {
      return 0.32;
    }
    if (renderMode === "xray") {
      return isCoreFill ? 0.42 : 0.55;
    }
    if (isCoreFill) {
      return 0.62;
    }
    return 1;
  })();

  const materials = secondaryMaterial
    ? [mainMaterial, secondaryMaterial]
    : [mainMaterial];
  materials.forEach((material) => {
    material.transparent = isTransparent;
    material.opacity = opacity;
    material.wireframe = isWireframe;
    material.depthWrite = !isTransparent;
    material.needsUpdate = true;
  });
  if (sandMesh) {
    sandMesh.visible = isWeightedHolder && coreMode !== "surface";
  }
  guideMesh.visible = renderMode !== "solid" || isCoreSection;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function requestDiningTableBrochure({
  clientId,
  generationId,
  images,
  model,
  params,
  signal,
  uploads,
}: {
  clientId: string;
  generationId: string;
  images: string[];
  model: ModelDefinition;
  params: ModelParams;
  signal: AbortSignal;
  uploads?: Array<{ kind: BrochureAssetKind; url: string }>;
}) {
  const response = await fetch("/api/brochure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      assetSet: true,
      clientId,
      generationId,
      dimensions: {
        height: getParam(params, "overallHeight"),
        length: getParam(params, "tableLength"),
        topThickness: getParam(params, "topThickness"),
        width: getParam(params, "tableWidth"),
      },
      images,
      modelId: model.id,
      modelName: model.name,
      uploads,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        assets?: Array<{
          imageDataUrl?: string;
          kind?: string;
          mediaType?: string;
          storageId?: string;
        }>;
        error?: string;
        generationId?: string;
        imageDataUrl?: string;
        model?: string;
        warnings?: string[];
      }
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.error ?? `Brochure generation failed (${response.status}).`,
    );
  }
  const responseAssets = payload?.assets;
  const hasCompleteAssetSet =
    Array.isArray(responseAssets) &&
    responseAssets.length === BROCHURE_ASSET_KINDS.length &&
    BROCHURE_ASSET_KINDS.every((kind, index) => {
      const asset = responseAssets[index];
      if (
        asset?.kind !== kind ||
        typeof asset.mediaType !== "string" ||
        !asset.mediaType.startsWith("image/")
      ) {
        return false;
      }
      return uploads
        ? typeof asset.storageId === "string" && asset.storageId.length >= 8
        : typeof asset.imageDataUrl === "string" &&
            asset.imageDataUrl.startsWith("data:image/");
    });
  const legacyAsset = !uploads && payload?.imageDataUrl?.startsWith("data:image/")
    ? [
        {
          kind: "room-hero" as const,
          imageDataUrl: payload.imageDataUrl,
          mediaType: payload.imageDataUrl.slice(
            5,
            payload.imageDataUrl.indexOf(";"),
          ),
        },
      ]
    : null;
  if (
    payload?.generationId !== generationId ||
    (!hasCompleteAssetSet && !legacyAsset) ||
    typeof payload.model !== "string" ||
    !Array.isArray(payload.warnings)
  ) {
    throw new Error("The brochure service returned an invalid image.");
  }
  return {
    assets: hasCompleteAssetSet ? responseAssets! : legacyAsset!,
    model: payload.model,
    warnings: payload.warnings,
  };
}

function orientDiningTableForSupportFreePrint(
  object: THREE.Object3D,
  height: number,
) {
  object.rotation.x = Math.PI;
  object.position.z = height;
}

function getExportFileName(model: ModelDefinition, params: ModelParams) {
  if (model.viewer === "dining-table-v1") {
    return `${model.export.filePrefix}-scale-1-${getParam(params, "mockScale").toFixed(0)}-length-${getParam(params, "tableLength").toFixed(1)}-width-${getParam(params, "tableWidth").toFixed(1)}.stl`;
  }
  if (model.viewer === "hover-dining-table-v1") {
    return `${model.export.filePrefix}-scale-1-${getParam(params, "mockScale").toFixed(0)}-length-${getParam(params, "tableLength").toFixed(1)}-width-${getParam(params, "tableWidth").toFixed(1)}.stl`;
  }
  const suffix = model.parameters
    .map(
      (parameter) => {
        const value = getParam(params, parameter.key);
        const formatted = value.toFixed(1);
        return `${parameter.key}-${formatted}`;
      },
    )
    .join("-");

  return `${model.export.filePrefix}-${suffix}.stl`;
}

function createCleanExportGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position") as THREE.BufferAttribute;
  const cleanPositions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);

    const areaSquared = ab
      .subVectors(b, a)
      .cross(ac.subVectors(c, a))
      .lengthSq();
    if (areaSquared <= STL_EXPORT_MIN_AREA_SQUARED) {
      continue;
    }

    cleanPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  source.dispose();

  const cleanGeometry = new THREE.BufferGeometry();
  cleanGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(cleanPositions, 3),
  );
  cleanGeometry.computeVertexNormals();
  cleanGeometry.computeBoundingBox();
  cleanGeometry.computeBoundingSphere();

  return cleanGeometry;
}

const HolderViewer = forwardRef<
  ViewerHandle,
  {
    model: ModelDefinition;
    params: ModelParams;
    coreViewMode: CoreViewMode;
    renderMode: RenderMode;
    renderQuality: RenderQuality;
    showOriginal: boolean;
    theme: ThemeMode;
    unit: LengthUnit;
    assemblyMode: AssemblyMode;
    onResetParams: () => void;
    onTrayRotationChange: (value: number) => void;
  }
>(function HolderViewer(
  {
    model,
    assemblyMode,
    onTrayRotationChange,
    onResetParams,
    params,
    coreViewMode,
    renderMode,
    renderQuality,
    showOriginal,
    theme,
    unit,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const pathTracerRef = useRef<WebGLPathTracer | null>(null);
  const pathTracerRefreshRef = useRef<number | null>(null);
  const mainMeshRef = useRef<THREE.Mesh | null>(null);
  const domeMeshRef = useRef<THREE.Mesh | null>(null);
  const sandMeshRef = useRef<THREE.Mesh | null>(null);
  const sandFloorMeshRef = useRef<THREE.Mesh | null>(null);
  const trayLipMeshRef = useRef<THREE.Mesh | null>(null);
  const trayDividerGroupRef = useRef<THREE.Group | null>(null);
  const assemblyPreviewGroupRef = useRef<THREE.Group | null>(null);
  const diningHardwareGroupRef = useRef<THREE.Group | null>(null);
  const hoverHardwareGroupRef = useRef<THREE.Group | null>(null);
  const hoverExplodedGroupRef = useRef<THREE.Group | null>(null);
  const ghostMeshRef = useRef<THREE.Mesh | null>(null);
  const guideMeshRef = useRef<THREE.Mesh | null>(null);
  const mainMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const domeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const diningMetalMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const mainBaseRef = useRef<Float32Array | null>(null);
  const animationRef = useRef<number | null>(null);
  const latestParamsRef = useRef(params);
  const latestCoreViewModeRef = useRef(coreViewMode);
  const latestRenderModeRef = useRef(renderMode);
  const latestShowOriginalRef = useRef(showOriginal);
  const latestAssemblyModeRef = useRef(assemblyMode);
  const latestInteractionModeRef = useRef<ViewerInteractionMode>("orbit");
  const [interactionMode, setInteractionMode] = useState<ViewerInteractionMode>(
    "orbit",
  );
  const hoverTemplateSummary = useMemo(
    () =>
      model.viewer === "hover-dining-table-v1"
        ? getHoverDiningTableTemplateSummary(params, model)
        : null,
    [model, params],
  );
  const [cubeTransform, setCubeTransform] = useState(
    "rotateX(-28deg) rotateY(34deg)",
  );

  const updateCubeOrientation = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const horizontalDistance = Math.hypot(offset.x, offset.y);
    const pitch = clamp(
      -THREE.MathUtils.radToDeg(Math.atan2(offset.z, horizontalDistance)),
      -82,
      82,
    );
    const yaw =
      horizontalDistance < 0.001
        ? 0
        : -THREE.MathUtils.radToDeg(Math.atan2(offset.x, -offset.y));
    setCubeTransform(`rotateX(${pitch.toFixed(1)}deg) rotateY(${yaw.toFixed(1)}deg)`);
  }, []);

  const setCameraView = useCallback((preset: ViewPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const currentParams = latestParamsRef.current;
    const dimensions = getModelDimensions(model, currentParams);
    const distance = Math.max(
      dimensions.height * 2.2,
      dimensions.length * 1.55,
      dimensions.width * 2.25,
    );
    const target = new THREE.Vector3(
      0,
      0,
      model.viewer !== "weighted-paper-towel-holder-v1"
        ? dimensions.height * 0.25
        : dimensions.height * 0.42,
    );
    const edgeViewZ = target.z + dimensions.height * 0.2;

    camera.up.set(0, 0, 1);
    if (preset === "top") {
      camera.up.set(0, 1, 0);
      const topDistance =
        model.viewer === "door-lock-adapter-v1"
          ? distance
          : model.viewer === "dining-table-v1"
            ? distance * 1.05
          : Math.max(distance, dimensions.height * 10);
      camera.position.set(0, 0, target.z + topDistance);
    } else if (preset === "bottom") {
      camera.up.set(0, -1, 0);
      const bottomDistance =
        model.viewer === "dining-table-v1"
          ? distance * 1.05
          : Math.max(distance, dimensions.height * 10);
      camera.position.set(0, 0, target.z - bottomDistance);
    } else if (preset === "xEdge") {
      camera.position.set(0, -distance, edgeViewZ);
    } else if (preset === "yEdge") {
      camera.position.set(distance, 0, edgeViewZ);
    } else if (model.viewer !== "weighted-paper-towel-holder-v1") {
      camera.position.set(distance * 0.7, -distance * 0.78, distance * 0.52);
    } else {
      camera.position.set(distance * 0.72, -distance, dimensions.height * 1.25);
    }

    camera.near = 0.5;
    camera.far = 2000;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.update();
    updateCubeOrientation();
  }, [model, updateCubeOrientation]);

  const resetCamera = useCallback(() => {
    setCameraView("iso");
  }, [setCameraView]);

  const zoomBy = useCallback((scale: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = Math.min(
      controls.maxDistance,
      Math.max(controls.minDistance, offset.length() * scale),
    );
    offset.setLength(nextDistance);
    camera.position.copy(controls.target).add(offset);
    camera.updateProjectionMatrix();
    controls.update();
  }, []);

  const schedulePathTracerRefresh = useCallback(() => {
    if (!pathTracerRef.current || !sceneRef.current || !cameraRef.current) {
      return;
    }
    if (pathTracerRefreshRef.current !== null) {
      window.clearTimeout(pathTracerRefreshRef.current);
    }
    pathTracerRefreshRef.current = window.setTimeout(() => {
      pathTracerRefreshRef.current = null;
      const pathTracer = pathTracerRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!pathTracer || !scene || !camera) return;
      pathTracer.setScene(scene, camera);
    }, 140);
  }, []);

  const updateMeshes = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    const sandMesh = sandMeshRef.current;
    const sandFloorMesh = sandFloorMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    const assemblyPreviewGroup = assemblyPreviewGroupRef.current;
    const diningHardwareGroup = diningHardwareGroupRef.current;
    const hoverHardwareGroup = hoverHardwareGroupRef.current;
    const hoverExplodedGroup = hoverExplodedGroupRef.current;
    const ghostMesh = ghostMeshRef.current;
    const guideMesh = guideMeshRef.current;
    const holderMaterial = mainMaterialRef.current;
    const domeMaterial = domeMaterialRef.current;
    const diningMetalMaterial = diningMetalMaterialRef.current;
    const base = mainBaseRef.current;
    if (
      !mainMesh ||
      !ghostMesh ||
      !guideMesh ||
      !holderMaterial ||
      !base
    ) {
      return;
    }

    if (model.viewer === "weighted-paper-towel-holder-v1") {
      if (!domeMesh || !sandMesh || !sandFloorMesh || !domeMaterial) {
        return;
      }
      applyHolderMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateHolderGuide(guideMesh, latestParamsRef.current);
      updateWeightedCore(
        domeMesh,
        sandMesh,
        sandFloorMesh,
        latestParamsRef.current,
        model,
      );
    } else if (model.viewer === "door-lock-adapter-v1") {
      mainMesh.geometry.dispose();
      mainMesh.geometry = createDoorLockAdapterGeometry(
        latestParamsRef.current,
        model,
      );
      updateDoorLockAdapterGuide(guideMesh, latestParamsRef.current);
    } else if (model.viewer === "dining-table-v1") {
      if (!diningHardwareGroup || !diningMetalMaterial) return;
      mainMesh.geometry.dispose();
      mainMesh.geometry = createDiningTableWoodGeometry(
        latestParamsRef.current,
        model,
      );
      diningHardwareGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      diningHardwareGroup.clear();
      const hardware = createDiningTableHardwareGeometries(
        latestParamsRef.current,
      );
      hardware.plates.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-plate-${index + 1}`;
        diningHardwareGroup.add(mesh);
      });
      hardware.channels.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-channel-${index + 1}`;
        diningHardwareGroup.add(mesh);
      });
      hardware.feet.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-leveling-foot-${index + 1}`;
        diningHardwareGroup.add(mesh);
      });
      updateDiningTableGuide(guideMesh, latestParamsRef.current);
    } else if (model.viewer === "hover-dining-table-v1") {
      if (!hoverHardwareGroup || !hoverExplodedGroup || !diningMetalMaterial) {
        return;
      }
      mainMesh.geometry.dispose();
      mainMesh.geometry = createHoverDiningTableGeometry(
        latestParamsRef.current,
        model,
      );
      hoverExplodedGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.userData.ownsTemplateMaterial) {
            const material = child.material;
            if (Array.isArray(material)) {
              material.forEach((entry) => entry.dispose());
            } else {
              material.dispose();
            }
          }
        }
      });
      hoverExplodedGroup.clear();
      const exploded = latestAssemblyModeRef.current === "exploded";
      const cutList = latestAssemblyModeRef.current === "cut-list";
      const templates = latestAssemblyModeRef.current === "templates";
      mainMesh.visible = !exploded && !cutList && !templates;
      hoverHardwareGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      hoverHardwareGroup.clear();
      const hardware = createHoverDiningTableHardwareGeometries(
        latestParamsRef.current,
      );
      hardware.channels.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-c-channel-${index + 1}`;
        hoverHardwareGroup.add(mesh);
      });
      hardware.feet.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-leveling-foot-${index + 1}`;
        hoverHardwareGroup.add(mesh);
      });
      hoverHardwareGroup.visible = !exploded && !cutList && !templates;
      hoverExplodedGroup.visible = exploded || templates;
      if (exploded) {
        for (const part of createHoverDiningTableExplodedParts(
          latestParamsRef.current,
          model,
        )) {
          const mesh = new THREE.Mesh(
            part.geometry,
            part.material === "Steel" ? diningMetalMaterial : holderMaterial,
          );
          mesh.name = `${model.id}-${part.name}`;
          mesh.position.copy(part.offset);
          mesh.userData.assemblyCategory = part.category;
          hoverExplodedGroup.add(mesh);
        }
      } else if (templates) {
        const previewScale = getParam(latestParamsRef.current, "mockScale");
        const segments = createHoverDiningTableTemplateSegments(
          latestParamsRef.current,
          model,
          previewScale,
        );
        const families = (["top-rail", "bottom-rail", "vertical-stile"] as const)
          .filter((family) =>
            segments.some((segment) => segment.template === family),
          );
        const familyRows = families.map((family) => {
          const familySegments = segments.filter((segment) => segment.template === family);
          const bounds = familySegments.reduce(
            (bounds, segment) => {
              segment.geometry.computeBoundingBox();
              const geometryBounds = segment.geometry.boundingBox;
              if (!geometryBounds) return bounds;
              return {
                minX: Math.min(bounds.minX, segment.assemblyOffset.x),
                maxX: Math.max(
                  bounds.maxX,
                  segment.assemblyOffset.x + geometryBounds.max.x,
                ),
                minY: Math.min(bounds.minY, segment.assemblyOffset.y),
                maxY: Math.max(
                  bounds.maxY,
                  segment.assemblyOffset.y + geometryBounds.max.y,
                ),
              };
            },
            {
              minX: Number.POSITIVE_INFINITY,
              maxX: Number.NEGATIVE_INFINITY,
              minY: Number.POSITIVE_INFINITY,
              maxY: Number.NEGATIVE_INFINITY,
            },
          );
          return {
            family,
            segments: familySegments,
            bounds,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
          };
        });
        const rowGap = 8;
        const totalRowsHeight =
          familyRows.reduce((total, row) => total + row.height, 0) +
          rowGap * (familyRows.length - 1);
        let nextRowTop = totalRowsHeight / 2;
        familyRows.forEach((row, familyIndex) => {
          const rowY = nextRowTop - row.height;
          nextRowTop = rowY - rowGap;
          const seamReveal = Math.max(
            0.8,
            (getParam(latestParamsRef.current, "templateThickness") /
              previewScale) *
              2.5,
          );
          row.segments.forEach((segment) => {
            const palette =
              row.family === "top-rail"
                ? ["#e4a457", "#f1c77e"]
                : row.family === "bottom-rail"
                  ? ["#9db27d", "#c5d5a9"]
                  : ["#86a9c4", "#b8cfdf"];
            const templateMaterial = new THREE.MeshStandardMaterial({
              color: palette[segment.index % palette.length],
              metalness: 0,
              roughness: 0.7,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(segment.geometry, templateMaterial);
            mesh.name = `${model.id}-${segment.template}-template-${segment.index + 1}`;
            mesh.position.set(
              segment.assemblyOffset.x -
                (row.bounds.minX + row.width / 2) +
                (segment.index - (segment.count - 1) / 2) * seamReveal,
              segment.assemblyOffset.y - row.bounds.minY + rowY,
              familyIndex * Math.max(0.3, segment.thickness * 1.5),
            );
            mesh.userData.template = segment.template;
            mesh.userData.templatePart = segment.index + 1;
            mesh.userData.ownsTemplateMaterial = true;
            hoverExplodedGroup.add(mesh);
          });
        });
      }
      updateHoverDiningTableGuide(guideMesh, latestParamsRef.current);
    } else {
      applyTrayMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateTrayGuide(guideMesh, latestParamsRef.current);
      if (model.viewer === "simple-box-v1" && trayLipMesh) {
        trayLipMesh.geometry.dispose();
        trayLipMesh.geometry = createTrayStackingLipGeometry(
          latestParamsRef.current,
          model,
        );
      }
      if (model.viewer === "simple-box-v1" && trayDividerGroup) {
        trayDividerGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        trayDividerGroup.clear();
        for (const geometry of createTrayDividerGeometries(latestParamsRef.current, model)) {
          trayDividerGroup.add(new THREE.Mesh(geometry, holderMaterial));
        }
      }
      if (model.viewer === "simple-box-v1") {
        const printBedOffset =
          latestAssemblyModeRef.current === "print-layout"
            ? getParam(latestParamsRef.current, "lipHeight") -
              model.geometry.stackingLipFloorOverlap
            : 0;
        mainMesh.position.z = printBedOffset;
        if (trayLipMesh) trayLipMesh.position.z = printBedOffset;
        if (trayDividerGroup) trayDividerGroup.position.z = printBedOffset;
      }
      if (model.viewer === "simple-box-v1" && assemblyPreviewGroup) {
        assemblyPreviewGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        assemblyPreviewGroup.clear();
        const previewMaterial = holderMaterial;
        if (latestAssemblyModeRef.current === "stacked") {
          const offsetZ =
            getParam(latestParamsRef.current, "height") +
            (getParam(latestParamsRef.current, "gridfinityCompatible") >= 0.5
              ? model.geometry.gridfinityBottomChamfer +
                model.geometry.gridfinityStraightHeight +
                model.geometry.gridfinityTopChamfer
              : 0);
          const upperBody = new THREE.Mesh(mainMesh.geometry.clone(), previewMaterial);
          upperBody.position.z = offsetZ;
          assemblyPreviewGroup.add(upperBody);
          if (trayLipMesh) {
            const upperLip = new THREE.Mesh(trayLipMesh.geometry.clone(), previewMaterial);
            upperLip.position.z = offsetZ;
            assemblyPreviewGroup.add(upperLip);
          }
          trayDividerGroup?.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              const divider = new THREE.Mesh(child.geometry.clone(), previewMaterial);
              divider.position.z = offsetZ;
              assemblyPreviewGroup.add(divider);
            }
          });
        } else if (latestAssemblyModeRef.current === "lid") {
          const offsetZ = getParam(latestParamsRef.current, "height");
          for (const geometry of createSimpleBoxLidGeometries(
            latestParamsRef.current,
            model,
          )) {
            const lidPart = new THREE.Mesh(geometry, previewMaterial);
            lidPart.position.z = offsetZ;
            assemblyPreviewGroup.add(lidPart);
          }
        } else if (latestAssemblyModeRef.current === "print-layout") {
          const offsetY = -(getParam(latestParamsRef.current, "width") + 10);
          for (const geometry of createSimpleBoxLidPrintGeometries(
            latestParamsRef.current,
            model,
          )) {
            const lidPart = new THREE.Mesh(geometry, previewMaterial);
            lidPart.position.y = offsetY;
            assemblyPreviewGroup.add(lidPart);
          }
        }
      }
    }

    applyRenderOptions(
      holderMaterial,
      model.viewer === "dining-table-v1" ||
        model.viewer === "hover-dining-table-v1"
        ? diningMetalMaterial
        : domeMaterial,
      sandMesh,
      guideMesh,
      latestCoreViewModeRef.current,
      latestRenderModeRef.current,
      model,
    );

    ghostMesh.visible =
      model.viewer !== "dining-table-v1" &&
      model.viewer !== "hover-dining-table-v1" &&
      latestShowOriginalRef.current;
    if (renderQuality !== "standard") {
      for (const object of [mainMesh, diningHardwareGroup, hoverHardwareGroup]) {
        object?.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }
    }
    schedulePathTracerRefresh();
  }, [model, renderQuality, schedulePathTracerRefresh]);

  const createStlBlob = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    const sandFloorMesh = sandFloorMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    const hoverHardwareGroup = hoverHardwareGroupRef.current;
    if (!mainMesh) {
      return null;
    }

    const group = new THREE.Group();
    const holder = new THREE.Mesh(createCleanExportGeometry(mainMesh.geometry));
    holder.name = `${model.id}-body`;
    if (model.viewer === "dining-table-v1") {
      orientDiningTableForSupportFreePrint(
        holder,
        getModelDimensions(model, latestParamsRef.current).height,
      );
    }
    group.add(holder);

    let roundedTop: THREE.Mesh | null = null;
    let sandFloor: THREE.Mesh | null = null;
    if (model.viewer === "weighted-paper-towel-holder-v1" && domeMesh) {
      roundedTop = new THREE.Mesh(createCleanExportGeometry(domeMesh.geometry));
      roundedTop.name = `${model.id}-rounded-weighted-center-tube-top`;
      group.add(roundedTop);
    }
    if (model.viewer === "weighted-paper-towel-holder-v1" && sandFloorMesh) {
      sandFloor = new THREE.Mesh(createCleanExportGeometry(sandFloorMesh.geometry));
      sandFloor.name = `${model.id}-flush-sand-chamber-floor`;
      group.add(sandFloor);
    }
    let trayLip: THREE.Mesh | null = null;
    if (model.viewer === "simple-box-v1" && trayLipMesh) {
      trayLip = new THREE.Mesh(createCleanExportGeometry(trayLipMesh.geometry));
      trayLip.name = `${model.id}-stacking-lip`;
      group.add(trayLip);
    }
    const exportDividers: THREE.Mesh[] = [];
    if (model.viewer === "simple-box-v1" && trayDividerGroup) {
      trayDividerGroup.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          const divider = new THREE.Mesh(createCleanExportGeometry(child.geometry));
          divider.name = `${model.id}-divider-${index + 1}`;
          exportDividers.push(divider);
          group.add(divider);
        }
      });
    }
    const exportHoverHardware: THREE.Mesh[] = [];
    if (model.viewer === "hover-dining-table-v1" && hoverHardwareGroup) {
      hoverHardwareGroup.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          const hardwareMesh = new THREE.Mesh(
            createCleanExportGeometry(child.geometry),
          );
          hardwareMesh.name =
            index < 3
              ? `${model.id}-c-channel-${index + 1}`
              : `${model.id}-leveling-foot-${index - 2}`;
          exportHoverHardware.push(hardwareMesh);
          group.add(hardwareMesh);
        }
      });
    }
    group.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    const blob = new Blob([result], { type: "model/stl" });

    holder.geometry.dispose();
    roundedTop?.geometry.dispose();
    sandFloor?.geometry.dispose();
    trayLip?.geometry.dispose();
    exportDividers.forEach((divider) => divider.geometry.dispose());
    exportHoverHardware.forEach((hardwareMesh) =>
      hardwareMesh.geometry.dispose(),
    );

    return blob;
  }, [model]);

  const createDiningTableHardwareStlBlob = useCallback(() => {
    if (model.viewer !== "dining-table-v1") {
      return null;
    }
    const hardware = createDiningTableHardwareGeometries(
      latestParamsRef.current,
    );
    const sources = [
      ...hardware.plates.map((geometry, index) => ({
        geometry,
        name: `${model.id}-plate-${index + 1}`,
      })),
      ...hardware.channels.map((geometry, index) => ({
        geometry,
        name: `${model.id}-c-channel-${index + 1}`,
      })),
      ...hardware.feet.map((geometry, index) => ({
        geometry,
        name: `${model.id}-leveling-foot-${index + 1}`,
      })),
    ];
    const group = new THREE.Group();
    const printHeight = getModelDimensions(
      model,
      latestParamsRef.current,
    ).height;
    const meshes = sources.map(({ geometry, name }) => {
      const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
      mesh.name = name;
      orientDiningTableForSupportFreePrint(mesh, printHeight);
      group.add(mesh);
      return mesh;
    });
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    sources.forEach(({ geometry }) => geometry.dispose());
    meshes.forEach((mesh) => mesh.geometry.dispose());
    return new Blob([result], { type: "model/stl" });
  }, [model]);

  const exportStl = useCallback(() => {
    const blob = createStlBlob();
    if (!blob) {
      return;
    }
    const fileName = getExportFileName(model, latestParamsRef.current);
    if (
      model.viewer === "dining-table-v1" &&
      (model.id !== "whisperer" ||
        getParam(latestParamsRef.current, "levelingFeetEnabled") >= 0.5)
    ) {
      const hardwareBlob = createDiningTableHardwareStlBlob();
      downloadBlob(
        blob,
        fileName.replace(/\.stl$/, "-support-free-wood-color-1.stl"),
      );
      if (hardwareBlob) {
        downloadBlob(
          hardwareBlob,
          fileName.replace(/\.stl$/, "-support-free-hardware-color-2.stl"),
        );
      }
      return;
    }
    downloadBlob(blob, fileName);
  }, [createDiningTableHardwareStlBlob, createStlBlob, model]);

  const exportLidStl = useCallback(() => {
    if (model.viewer !== "simple-box-v1") return;
    const group = new THREE.Group();
    const meshes = createSimpleBoxLidPrintGeometries(latestParamsRef.current, model).map(
      (geometry, index) => {
        const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
        mesh.name = `${model.id}-lid-${index === 0 ? "plate" : "registration-skirt"}`;
        geometry.dispose();
        group.add(mesh);
        return mesh;
      },
    );
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    downloadBlob(
      new Blob([result], { type: "model/stl" }),
      `${model.id}-lid-length-${getParam(latestParamsRef.current, "length").toFixed(1)}-width-${getParam(latestParamsRef.current, "width").toFixed(1)}.stl`,
    );
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }, [model]);

  const exportBoxAndLidStl = useCallback(() => {
    if (model.viewer !== "simple-box-v1") return;
    const mainMesh = mainMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    if (!mainMesh || !trayLipMesh || !trayDividerGroup) return;
    const group = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    const addMesh = (geometry: THREE.BufferGeometry, name: string) => {
      const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
      mesh.name = name;
      meshes.push(mesh);
      group.add(mesh);
      return mesh;
    };
    const boxPrintBedOffset =
      getParam(latestParamsRef.current, "lipHeight") -
      model.geometry.stackingLipFloorOverlap;
    addMesh(mainMesh.geometry, `${model.id}-body`).position.z = boxPrintBedOffset;
    addMesh(trayLipMesh.geometry, `${model.id}-stacking-lip`).position.z =
      boxPrintBedOffset;
    trayDividerGroup.children.forEach((child, index) => {
      if (child instanceof THREE.Mesh) {
        addMesh(child.geometry, `${model.id}-divider-${index + 1}`).position.z =
          boxPrintBedOffset;
      }
    });
    const offsetY = -(getParam(latestParamsRef.current, "width") + 10);
    createSimpleBoxLidPrintGeometries(latestParamsRef.current, model).forEach(
      (geometry, index) => {
        const mesh = addMesh(
          geometry,
          `${model.id}-lid-${index === 0 ? "plate" : "registration-skirt"}`,
        );
        mesh.position.y = offsetY;
        geometry.dispose();
      },
    );
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    downloadBlob(
      new Blob([result], { type: "model/stl" }),
      `${model.id}-box-and-lid-length-${getParam(latestParamsRef.current, "length").toFixed(1)}-width-${getParam(latestParamsRef.current, "width").toFixed(1)}.stl`,
    );
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }, [model]);

  const exportHoverTemplateStls = useCallback(() => {
    if (model.viewer !== "hover-dining-table-v1") return;
    const segments = createHoverDiningTableTemplateSegments(
      latestParamsRef.current,
      model,
      1,
    );
    const files = segments.map((segment) => {
      const mesh = new THREE.Mesh(createCleanExportGeometry(segment.geometry));
      mesh.name = `${model.id}-${segment.template}-template-part-${segment.index + 1}`;
      mesh.updateMatrixWorld(true);
      const result = new STLExporter().parse(mesh, { binary: true });
      mesh.geometry.dispose();
      segment.geometry.dispose();
      return {
        blob: new Blob([result], { type: "model/stl" }),
        fileName: segment.fileName,
      };
    });
    const downloadNext = (index: number) => {
      const file = files[index];
      if (!file) return;
      downloadBlob(file.blob, file.fileName);
      if (index + 1 < files.length) {
        window.setTimeout(() => downloadNext(index + 1), 100);
      }
    };
    downloadNext(0);
  }, [model]);

  const captureBrochureViews = useCallback(async () => {
    if (
      model.viewer !== "hover-dining-table-v1" &&
      model.viewer !== "dining-table-v1"
    ) {
      throw new Error("Brochure capture is only available for dining tables.");
    }
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!camera || !controls || !renderer || !scene) {
      throw new Error("The 3D model is not ready for brochure capture.");
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const savedPosition = camera.position.clone();
    const savedUp = camera.up.clone();
    const savedTarget = controls.target.clone();
    const savedDamping = controls.enableDamping;
    const dimensions = getModelDimensions(model, latestParamsRef.current);
    const distance = Math.max(
      dimensions.height * 2.2,
      dimensions.length * 1.55,
      dimensions.width * 2.25,
    );
    const target = new THREE.Vector3(0, 0, dimensions.height * 0.25);
    const captures: string[] = [];
    const cameraPositions = [
      new THREE.Vector3(distance * 0.7, -distance * 0.78, distance * 0.52),
      new THREE.Vector3(-distance * 0.7, distance * 0.78, distance * 0.52),
      new THREE.Vector3(0, -distance, target.z + dimensions.height * 0.2),
      new THREE.Vector3(distance * 0.45, -distance * 0.55, target.z + distance * 0.82),
    ];

    controls.enableDamping = false;
    try {
      for (const position of cameraPositions) {
        camera.up.set(0, 0, 1);
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        controls.target.copy(target);
        controls.update();
        renderer.render(scene, camera);
        captures.push(renderer.domElement.toDataURL("image/jpeg", 0.86));
      }
    } finally {
      camera.up.copy(savedUp);
      camera.position.copy(savedPosition);
      controls.target.copy(savedTarget);
      controls.enableDamping = savedDamping;
      controls.update();
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      updateCubeOrientation();
    }

    if (captures.length !== 4 || captures.some((image) => image.length < 1_000)) {
      throw new Error("The multi-angle CAD references could not be captured.");
    }
    return captures;
  }, [model, updateCubeOrientation]);

  useImperativeHandle(
    ref,
    () => ({
      captureBrochureViews,
      exportStl,
      exportLidStl,
      exportBoxAndLidStl,
      exportHoverTemplateStls,
      getStlBlob: createStlBlob,
      resetCamera,
      setView: setCameraView,
    }),
    [captureBrochureViews, createStlBlob, exportBoxAndLidStl, exportHoverTemplateStls, exportLidStl, exportStl, resetCamera, setCameraView],
  );

  useEffect(() => {
    latestParamsRef.current = params;
    latestCoreViewModeRef.current = coreViewMode;
    latestRenderModeRef.current = renderMode;
    latestShowOriginalRef.current = showOriginal;
    latestAssemblyModeRef.current = assemblyMode;
    updateMeshes();
  }, [params, coreViewMode, renderMode, showOriginal, assemblyMode, updateMeshes]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background =
        theme === "dark" ? null : new THREE.Color(SCENE_BACKGROUND[theme]);
    }
    if (rendererRef.current) {
      rendererRef.current.setClearAlpha(theme === "dark" ? 0 : 1);
    }
    const mainMaterial = mainMaterialRef.current;
    if (mainMaterial && model.viewer === "weighted-paper-towel-holder-v1") {
      mainMaterial.color.set(theme === "dark" ? "#202734" : "#111318");
      mainMaterial.needsUpdate = true;
    }
  }, [model.viewer, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background =
      theme === "dark" ? null : new THREE.Color(SCENE_BACKGROUND[theme]);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(theme === "dark" ? 0 : 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const useDetailedLighting =
      getWoodSpeciesForModel(model.id) !== null &&
      renderQuality !== "standard";
    renderer.toneMapping = useDetailedLighting
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    renderer.toneMappingExposure = useDetailedLighting ? 0.86 : 1;
    renderer.shadowMap.enabled = renderQuality !== "standard";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.append(renderer.domElement);

    let oakAssets: OakRenderingAssets | null = null;
    let pathTracer: WebGLPathTracer | null = null;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT =
      latestInteractionModeRef.current === "pan"
        ? THREE.MOUSE.PAN
        : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      latestInteractionModeRef.current === "pan"
        ? THREE.TOUCH.PAN
        : THREE.TOUCH.ROTATE;
    controls.minDistance = model.viewer === "door-lock-adapter-v1" ? 18 : 80;
    controls.maxDistance = 1400;
    controlsRef.current = controls;
    const handleControlChange = () => {
      updateCubeOrientation();
      pathTracer?.updateCamera();
    };
    let trackpadGestureUntil = 0;
    const handleTrackpadPan = (event: WheelEvent) => {
      if (event.ctrlKey) {
        trackpadGestureUntil = 0;
        return;
      }

      const now = performance.now();
      const isContinuingTrackpadGesture = now < trackpadGestureUntil;
      const isTrackpadGesture =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (isContinuingTrackpadGesture ||
          Math.abs(event.deltaX) > 0 ||
          Math.abs(event.deltaY) <= 12);
      if (!isTrackpadGesture) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      trackpadGestureUntil = now + 160;

      const cameraOffset = camera.position.clone().sub(controls.target);
      const worldUnitsPerPixel =
        (2 *
          cameraOffset.length() *
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
        Math.max(renderer.domElement.clientHeight, 1);
      const movement = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrix, 0)
        .multiplyScalar(-event.deltaX * worldUnitsPerPixel);
      movement.add(
        new THREE.Vector3()
          .setFromMatrixColumn(camera.matrix, 1)
          .multiplyScalar(event.deltaY * worldUnitsPerPixel),
      );
      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
    };
    renderer.domElement.addEventListener("wheel", handleTrackpadPan, {
      capture: true,
      passive: false,
    });
    controls.addEventListener("change", handleControlChange);

    scene.add(
      new THREE.HemisphereLight(
        "#ffffff",
        "#aeb7c4",
        useDetailedLighting ? 0.82 : 2.1,
      ),
    );
    const keyLight = new THREE.DirectionalLight(
      "#ffffff",
      useDetailedLighting ? 1.45 : 2.4,
    );
    keyLight.position.set(180, -160, 260);
    keyLight.castShadow = renderQuality !== "standard";
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 900;
    keyLight.shadow.camera.left = -320;
    keyLight.shadow.camera.right = 320;
    keyLight.shadow.camera.top = 320;
    keyLight.shadow.camera.bottom = -320;
    keyLight.shadow.bias = -0.0002;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(
      "#dbeafe",
      useDetailedLighting ? 0.34 : 0.78,
    );
    fillLight.position.set(-220, 140, 120);
    scene.add(fillLight);

    const initialDimensions = getModelDimensions(model, latestParamsRef.current);
    const gridSize = Math.max(
      initialDimensions.length * 1.8,
      initialDimensions.width * 1.8,
      260,
    );
    const gridColors = SCENE_GRID_COLORS[theme];
    const grid = new THREE.GridHelper(
      gridSize,
      26,
      gridColors.center,
      gridColors.grid,
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.2;
    scene.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshStandardMaterial({
        color: theme === "dark" ? "#15191f" : "#ece9e2",
        roughness: 0.92,
        metalness: 0,
      }),
    );
    floor.name = "studio-floor";
    floor.position.z = -0.24;
    floor.receiveShadow = true;
    floor.visible = renderQuality !== "standard";
    scene.add(floor);

    const initialParams = latestParamsRef.current;
    const guideGeometry =
      model.viewer === "weighted-paper-towel-holder-v1"
        ? new THREE.CylinderGeometry(
            getParam(initialParams, "diameter") / 2,
            getParam(initialParams, "diameter") / 2,
            getParam(initialParams, "height"),
            128,
            1,
            true,
          )
        : new THREE.BoxGeometry(
            initialDimensions.length,
            initialDimensions.width,
            initialDimensions.height,
          );
    const guide = new THREE.Mesh(
      guideGeometry,
      new THREE.MeshBasicMaterial({
        color: "#2563eb",
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      }),
    );
    if (model.viewer === "weighted-paper-towel-holder-v1") {
      guide.rotation.x = Math.PI / 2;
    }
    guideMeshRef.current = guide;
    scene.add(guide);

    let disposed = false;
    const loader = new STLLoader();

    loader
      .loadAsync(model.stl.url)
      .then(async (mainGeometry) => {
        if (disposed) {
          mainGeometry.dispose();
          return;
        }

        const normalizedMain = normalizeGeometry(
          mainGeometry,
          model.geometry.mainAxis,
        );
        mainBaseRef.current = normalizedMain.basePositions;

        const woodSpecies = getWoodSpeciesForModel(model.id);
        const useDetailedOak =
          woodSpecies === "oak" && renderQuality !== "standard";
        if (useDetailedOak) {
          try {
            oakAssets = await loadOakRenderingAssets(renderer);
            if (disposed) {
              oakAssets.dispose();
              oakAssets = null;
              mainGeometry.dispose();
              normalizedMain.geometry.dispose();
              return;
            }
            scene.environment = oakAssets.environment;
            scene.environmentIntensity = 0.78;
          } catch (error) {
            console.warn("Unable to load detailed oak rendering assets", error);
          }
        }
        const woodTexture = woodSpecies
          ? oakAssets
            ? null
            : createWoodTexture(renderer, woodSpecies)
          : null;
        const isWoodFurniture = woodSpecies !== null;
        const mainMaterial = oakAssets?.material ??
          new THREE.MeshStandardMaterial({
            color:
              isWoodFurniture
                ? "#ffffff"
                : model.viewer !== "weighted-paper-towel-holder-v1"
                  ? "#d8dee9"
                  : theme === "dark"
                    ? "#202734"
                    : "#111318",
            map: woodTexture,
            roughness:
              model.viewer === "hover-dining-table-v1"
                ? 0.62
                : model.viewer === "dining-table-v1"
                  ? 0.72
                  : 0.78,
            metalness: isWoodFurniture ? 0 : 0.08,
            side: THREE.DoubleSide,
          });
        mainMaterialRef.current = mainMaterial;
        const domeMaterial = new THREE.MeshStandardMaterial({
          color: "#111318",
          roughness: 0.72,
          metalness: 0.06,
          side: THREE.DoubleSide,
        });
        domeMaterialRef.current = domeMaterial;
        const diningMetalMaterial = new THREE.MeshStandardMaterial({
          color: "#16191d",
          roughness: 0.48,
          metalness: 0.82,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        diningMetalMaterialRef.current = diningMetalMaterial;
        const sandMaterial = new THREE.MeshStandardMaterial({
          color: "#c7a45d",
          roughness: 0.86,
          metalness: 0,
          transparent: true,
          opacity: 0.9,
        });
        const ghostMaterial = new THREE.MeshBasicMaterial({
          color: "#7f8794",
          transparent: true,
          opacity: 0.22,
          wireframe: true,
        });

        const displayedGeometry = model.viewer === "door-lock-adapter-v1"
          ? createDoorLockAdapterGeometry(latestParamsRef.current, model)
          : model.viewer === "dining-table-v1"
            ? createDiningTableWoodGeometry(latestParamsRef.current, model)
            : model.viewer === "hover-dining-table-v1"
              ? createHoverDiningTableGeometry(latestParamsRef.current, model)
            : normalizedMain.geometry;
        const mainMesh = new THREE.Mesh(displayedGeometry, mainMaterial);
        mainMesh.name = `${model.id}-adjustable-body`;
        mainMesh.castShadow = renderQuality !== "standard";
        mainMesh.receiveShadow = renderQuality !== "standard";
        scene.add(mainMesh);
        mainMeshRef.current = mainMesh;

        if (model.viewer === "weighted-paper-towel-holder-v1") {
          const domeMesh = new THREE.Mesh(
            createRoundedTopGeometry(latestParamsRef.current, model),
            domeMaterial,
          );
          domeMesh.name = `${model.id}-rounded-weighted-center-tube-top`;
          scene.add(domeMesh);
          domeMeshRef.current = domeMesh;

          const sandFloorMesh = new THREE.Mesh(
            createSandChamberFloorGeometry(latestParamsRef.current, model),
            mainMaterial,
          );
          sandFloorMesh.name = `${model.id}-flush-sand-chamber-floor`;
          scene.add(sandFloorMesh);
          sandFloorMeshRef.current = sandFloorMesh;

          const sandMesh = new THREE.Mesh(
            createSandPreviewGeometry(latestParamsRef.current, model),
            sandMaterial,
          );
          sandMesh.name = `${model.id}-sand-fill-preview`;
          sandMesh.visible = latestCoreViewModeRef.current !== "surface";
          scene.add(sandMesh);
          sandMeshRef.current = sandMesh;
        } else if (model.viewer === "simple-box-v1") {
          const trayLipMesh = new THREE.Mesh(
            createTrayStackingLipGeometry(latestParamsRef.current, model),
            mainMaterial,
          );
          trayLipMesh.name = `${model.id}-stacking-lip`;
          scene.add(trayLipMesh);
          trayLipMeshRef.current = trayLipMesh;

          const dividerGroup = new THREE.Group();
          dividerGroup.name = `${model.id}-dividers`;
          for (const geometry of createTrayDividerGeometries(latestParamsRef.current, model)) {
            dividerGroup.add(new THREE.Mesh(geometry, mainMaterial));
          }
          scene.add(dividerGroup);
          trayDividerGroupRef.current = dividerGroup;

          const assemblyPreviewGroup = new THREE.Group();
          assemblyPreviewGroup.name = `${model.id}-assembly-preview`;
          scene.add(assemblyPreviewGroup);
          assemblyPreviewGroupRef.current = assemblyPreviewGroup;
        } else if (model.viewer === "dining-table-v1") {
          const hardwareGroup = new THREE.Group();
          hardwareGroup.name = `${model.id}-hardware`;
          const hardware = createDiningTableHardwareGeometries(
            latestParamsRef.current,
          );
          hardware.plates.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-plate-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          hardware.channels.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-channel-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          hardware.feet.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-leveling-foot-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          scene.add(hardwareGroup);
          diningHardwareGroupRef.current = hardwareGroup;
        } else if (model.viewer === "hover-dining-table-v1") {
          const hardwareGroup = new THREE.Group();
          hardwareGroup.name = `${model.id}-hardware`;
          const hardware = createHoverDiningTableHardwareGeometries(
            latestParamsRef.current,
          );
          hardware.channels.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-c-channel-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          hardware.feet.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-leveling-foot-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          scene.add(hardwareGroup);
          hoverHardwareGroupRef.current = hardwareGroup;

          const explodedGroup = new THREE.Group();
          explodedGroup.name = `${model.id}-exploded-assembly`;
          explodedGroup.visible = latestAssemblyModeRef.current === "exploded";
          scene.add(explodedGroup);
          hoverExplodedGroupRef.current = explodedGroup;
        }

        for (const group of [
          diningHardwareGroupRef.current,
          hoverHardwareGroupRef.current,
        ]) {
          group?.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.castShadow = renderQuality !== "standard";
              object.receiveShadow = renderQuality !== "standard";
            }
          });
        }

        const ghostMesh = new THREE.Mesh(
          normalizedMain.geometry.clone(),
          ghostMaterial,
        );
        ghostMesh.name = `${model.id}-original-overlay`;
        ghostMesh.visible = latestShowOriginalRef.current;
        scene.add(ghostMesh);
        ghostMeshRef.current = ghostMesh;

        if (
          model.viewer === "door-lock-adapter-v1" ||
          model.viewer === "dining-table-v1" ||
          model.viewer === "hover-dining-table-v1"
        ) {
          normalizedMain.geometry.dispose();
        }

        updateMeshes();
        resetCamera();

        if (renderQuality === "photo" && oakAssets) {
          const { WebGLPathTracer: PathTracer } = await import(
            "three-gpu-pathtracer"
          );
          if (disposed) {
            mainGeometry.dispose();
            return;
          }
          pathTracer = new PathTracer(renderer);
          pathTracerRef.current = pathTracer;
          pathTracer.bounces = 4;
          pathTracer.minSamples = 16;
          pathTracer.renderDelay = 160;
          pathTracer.fadeDuration = 900;
          pathTracer.dynamicLowRes = false;
          pathTracer.renderScale = 0.5;
          pathTracer.tiles.set(1, 1);
          pathTracer.setScene(scene, camera);
        }

        mainGeometry.dispose();
      })
      .catch((error) => {
        console.error(`Unable to load STL for ${model.name}`, error);
      });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      if (pathTracer) {
        pathTracer.renderSample();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    return () => {
      disposed = true;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      if (pathTracerRefreshRef.current !== null) {
        window.clearTimeout(pathTracerRefreshRef.current);
        pathTracerRefreshRef.current = null;
      }
      pathTracerRef.current = null;
      if (pathTracer) {
        disposePathTracer(pathTracer);
        pathTracer = null;
      }
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("wheel", handleTrackpadPan, true);
      controls.removeEventListener("change", handleControlChange);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
      });
      oakAssets?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model, renderQuality, resetCamera, theme, updateCubeOrientation, updateMeshes]);

  useEffect(() => {
    latestInteractionModeRef.current = interactionMode;
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.mouseButtons.LEFT =
      interactionMode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      interactionMode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }, [interactionMode]);

  return (
    <div
      className="viewer"
      data-assembly-mode={assemblyMode}
      data-interaction-mode={interactionMode}
      ref={containerRef}
    >
      <div className="viewer-backdrop" aria-hidden="true" />
      {model.viewer === "hover-dining-table-v1" &&
      assemblyMode === "cut-list" ? (
        <HoverDiningTableCutList model={model} params={params} unit={unit} />
      ) : null}
      {model.viewer === "hover-dining-table-v1" &&
      assemblyMode === "templates" &&
      hoverTemplateSummary ? (
        <aside className="hover-template-legend" aria-label="Routing template summary">
          {hoverTemplateSummary.templates.map((template) => {
            const isTop = template.kind === "top-rail";
            const isBottom = template.kind === "bottom-rail";
            return (
              <div key={template.kind}>
                <span
                  className={`template-swatch ${isTop ? "rail" : isBottom ? "bottom-rail" : "stile"}`}
                  aria-hidden="true"
                />
                <strong>
                  {isTop
                    ? "Top rail · B1"
                    : isBottom
                      ? "Bottom rail · B2"
                      : `${getParam(params, "endFrameStyle") >= 0.5 ? "Full-height leg" : "Vertical stile"} · B3`}
                </strong>
                <span>
                  {template.segmentCount} plates · {isTop || isBottom ? "mirror by end" : "mirror left/right"}
                </span>
              </div>
            );
          })}
          <p>
            {formatLength(hoverTemplateSummary.thickness, unit)} thick · {formatLength(hoverTemplateSummary.plateLength, unit)} usable plate · full-size STL export
          </p>
        </aside>
      ) : null}
      <div className="viewer-status" data-testid="viewer-status">
        {getStatusItems(model, params, unit).map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{RENDER_MODE_LABELS[renderMode]}</span>
        {getWoodSpeciesForModel(model.id) ? (
          <span>{RENDER_QUALITY_LABELS[renderQuality]} render</span>
        ) : null}
        {model.viewer === "hover-dining-table-v1" &&
        assemblyMode === "exploded" ? (
          <span>Exploded · {getHoverDiningTablePieceCount(params)} pieces</span>
        ) : null}
        {model.viewer === "hover-dining-table-v1" &&
        assemblyMode === "cut-list" ? (
          <span>
            Cut list · full-size · {getHoverDiningTablePieceCount(params)} pieces
          </span>
        ) : null}
        {model.viewer === "hover-dining-table-v1" &&
        assemblyMode === "templates" ? (
          <span>
            Routing templates · exact {hoverTemplateSummary?.templates
              .map((template) =>
                template.kind === "top-rail"
                  ? "B1"
                  : template.kind === "bottom-rail"
                    ? "B2"
                    : "B3",
              )
              .join(" + ")} profiles · segmented STLs
          </span>
        ) : null}
      </div>
      <div className="viewer-nav" aria-label="3D view controls">
        <div className="viewer-tool-rail" role="group" aria-label="View tools">
          <button
            aria-label="Zoom in"
            onClick={() => zoomBy(0.82)}
            title="Zoom in"
            type="button"
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => zoomBy(1.22)}
            title="Zoom out"
            type="button"
          >
            <ZoomOut aria-hidden="true" />
          </button>
          <button
            aria-label="Pan view"
            aria-pressed={interactionMode === "pan"}
            className={interactionMode === "pan" ? "active" : undefined}
            onClick={() =>
              setInteractionMode((current) =>
                current === "pan" ? "orbit" : "pan",
              )
            }
            title="Pan view with a mouse or one finger"
            type="button"
          >
            <Hand aria-hidden="true" />
          </button>
          <button
            aria-label="Center view"
            onClick={resetCamera}
            title="Center view"
            type="button"
          >
            <Focus aria-hidden="true" />
          </button>
          <button
            aria-label="Reset parameters"
            onClick={onResetParams}
            title="Reset parameters"
            type="button"
          >
            <RotateCcw aria-hidden="true" />
          </button>
          {ENABLE_TRAY_ORIENTATION_CONTROLS &&
          model.viewer === "japandi-tray-v1" ? (
            <TrayOrientationSnapControl
              maxRotation={model.geometry.footprintRotationDegrees}
              onChange={onTrayRotationChange}
              value={getParam(params, "rotation")}
            />
          ) : null}
        </div>
      </div>
      <div
        aria-label="Current camera orientation"
        className="orientation-cube-control"
        role="img"
      >
        <span aria-hidden="true" className="orientation-cube-scene">
          <span
            className="orientation-cube"
            style={{ transform: cubeTransform }}
          >
            <span className="orientation-cube-face orientation-cube-face-top">
              Top
            </span>
            <span className="orientation-cube-face orientation-cube-face-front">
              Front
            </span>
            <span className="orientation-cube-face orientation-cube-face-right">
              Right
            </span>
            <span className="orientation-cube-face orientation-cube-face-bottom">
              Bottom
            </span>
            <span className="orientation-cube-face orientation-cube-face-back">
              Back
            </span>
            <span className="orientation-cube-face orientation-cube-face-left">
              Left
            </span>
          </span>
        </span>
      </div>
    </div>
  );
});

function NumberControl({
  label,
  valueMm,
  limits,
  unit,
  onChange,
  onUnitChange,
  preferFineStep = false,
}: {
  label: string;
  valueMm: number;
  limits: NumberLimits;
  unit: LengthUnit;
  onChange: (valueMm: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
  preferFineStep?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const unitId = `${id}-unit`;
  const unitOption = UNIT_OPTIONS[unit];
  const [draftValue, setDraftValue] = useState(() =>
    formatLengthInput(valueMm, unit),
  );
  const displayValue = Number(toUnit(valueMm, unit).toFixed(4));
  const displayMin = Number(toUnit(limits.min, unit).toFixed(4));
  const displayMax = Number(toUnit(limits.max, unit).toFixed(4));
  const displayStep = Number(toUnit(limits.step, unit).toFixed(4));
  const clampValue = (nextMm: number) =>
    Math.min(limits.max, Math.max(limits.min, nextMm));
  const updateValue = (rawValue: string) => {
    const nextMm = parseLengthInput(rawValue, unit);
    if (nextMm === null) {
      return;
    }
    onChange(clampValue(nextMm));
  };
  const stepValue = (direction: -1 | 1) => {
    const parsedMm = parseLengthInput(draftValue, unit);
    const sourceMm = clampValue(parsedMm ?? valueMm);
    const nextMm = clampValue(
      stepLengthInput(sourceMm, unit, limits.step, direction, preferFineStep),
    );
    setDraftValue(formatLengthInput(nextMm, unit));
    onChange(nextMm);
  };

  useEffect(() => {
    setDraftValue(formatLengthInput(valueMm, unit));
  }, [unit, valueMm]);

  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row">
        <input
          id={id}
          type="range"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(event) => updateValue(event.currentTarget.value)}
        />
        <input
          aria-label={`${label} in ${unitOption.name}`}
          inputMode={unit === "in" ? "text" : "decimal"}
          type="text"
          value={draftValue}
          onBlur={() => setDraftValue(formatLengthInput(valueMm, unit))}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            updateValue(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
              return;
            }
            event.preventDefault();
            stepValue(event.key === "ArrowUp" ? 1 : -1);
          }}
        />
        <Select
          onValueChange={(value) => onUnitChange(value as LengthUnit)}
          value={unit}
        >
          <SelectTrigger
            aria-label={`${label} units`}
            className="unit-select-trigger"
            id={unitId}
            title={`${label} units`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(UNIT_OPTIONS).map(([value, option]) => (
              <SelectItem key={value} value={value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ScaleControl({
  limits,
  onChange,
  value,
}: {
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const update = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.round(clamp(parsed, limits.min, limits.max)));
  };
  return (
    <div className="number-control">
      <label htmlFor="mock-scale-denominator">Mock scale</label>
      <div className="number-row angle-number-row">
        <input
          id="mock-scale-denominator"
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label="Mock scale denominator"
          inputMode="numeric"
          onChange={(event) => update(event.currentTarget.value)}
          type="number"
          value={value}
        />
        <span aria-label={`Scale 1 to ${value}`}>1:{value}</span>
      </div>
    </div>
  );
}

function BezierCurveControl({
  label,
  limits,
  onChange,
  value,
}: {
  label: string;
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const update = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed, limits.min, limits.max));
  };
  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row angle-number-row">
        <input
          id={id}
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label={`${label} Bézier tension`}
          inputMode="decimal"
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="number"
          value={value.toFixed(3)}
        />
        <span aria-label={`${label} kappa ${value.toFixed(3)}`}>κ</span>
      </div>
    </div>
  );
}

function HoverSupportLayoutControl({
  model,
  params,
  onChange,
}: {
  model: ModelDefinition;
  params: ModelParams;
  onChange: (key: string, value: number) => void;
}) {
  const bothSupportsAreCrossbars =
    getParam(params, "topSupportStyle") < 0.5 &&
    getParam(params, "bottomSupportStyle") < 0.5;
  const topSupportOptions = [
    {
      value: "0",
      label: "Cross bars (X)",
      description: "Diagonal X-brace layout",
      symbol: "X",
    },
    {
      value: "1",
      label: "Original stretchers",
      description: "Two lengthwise members",
      symbol: "Ⅱ",
    },
  ];
  const bottomSupportOptions = [
    {
      value: "0",
      label: "Cross bars (X)",
      description: "Diagonal X-brace layout",
      symbol: "X",
    },
    {
      value: "1",
      label: "Single center board",
      description: "One lengthwise member",
      symbol: "Ⅰ",
    },
    {
      value: "2",
      label: "None",
      description: "No floor-level support",
      symbol: "—",
    },
  ];
  const bottomSupportParameter = model.parameters.find(
    (parameter) => parameter.key === "bottomSupportStyle",
  );
  const availableBottomSupportOptions = bottomSupportParameter
    ? bottomSupportOptions.filter((option) => {
        if (model.id === "wave-dining-table") {
          return option.value === "2";
        }
        const value = Number(option.value);
        return (
          value >= bottomSupportParameter.limits.min &&
          value <= bottomSupportParameter.limits.max
        );
      })
    : bottomSupportOptions;

  const supportSelect = (
    label: string,
    parameterKey: "topSupportStyle" | "bottomSupportStyle",
    options: typeof topSupportOptions,
  ) => {
    const id = `${parameterKey === "topSupportStyle" ? "top" : "bottom"}-support-style`;
    const value = String(Math.round(getParam(params, parameterKey)));
    const selected = options.find((option) => option.value === value) ?? options[0];

    return (
      <div className="select-control">
        <label htmlFor={id}>{label}</label>
        <Select
          onValueChange={(nextValue) => onChange(parameterKey, Number(nextValue))}
          value={value}
        >
          <SelectTrigger
            aria-label={`${label} style`}
            className="support-style-select-trigger"
            id={id}
          >
            <span className="support-style-select-value">
              <span aria-hidden="true" className="support-style-symbol">
                {selected.symbol}
              </span>
              <span className="support-style-copy">
                <strong>{selected.label}</strong>
                <small>{selected.description}</small>
              </span>
            </span>
          </SelectTrigger>
          <SelectContent
            align="start"
            className="support-style-select-content"
            sideOffset={6}
          >
            {options.map((option) => (
              <SelectItem
                className="support-style-select-item"
                key={option.value}
                value={option.value}
              >
                <span aria-hidden="true" className="support-style-symbol">
                  {option.symbol}
                </span>
                <span className="support-style-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="hover-support-layout-controls">
      {supportSelect("Top support", "topSupportStyle", topSupportOptions)}
      {supportSelect(
        "Bottom support",
        "bottomSupportStyle",
        availableBottomSupportOptions,
      )}
      {bothSupportsAreCrossbars ? (
        <div className="crossbar-sync-option">
          <OriginalOverlayToggle
            checked={getParam(params, "syncCrossbarDimensions") >= 0.5}
            label="Keep top and bottom crossbars in sync"
            onChange={(checked) =>
              onChange("syncCrossbarDimensions", checked ? 1 : 0)
            }
          />
          <small>Enabling uses the current top crossbar dimensions.</small>
        </div>
      ) : null}
    </div>
  );
}

const HOVER_PARAMETER_GROUPS = [
  "Overall",
  "Tabletop",
  "End boxes",
  "Adjustable feet",
  "Support layout",
  "Top support members",
  "Corner braces",
  "Bottom support members",
  "Support joinery",
  "Routing templates",
] as const;

const OPEN_LEG_HIDDEN_PARAMETER_KEYS = new Set([
  "frameBottomRailHeight",
  "frameOuterBottomCornerRadius",
  "frameInnerBottomCornerRadius",
]);

function HoverParameterGroupIcon({
  group,
}: {
  group: (typeof HOVER_PARAMETER_GROUPS)[number];
}) {
  if (group === "Overall") return <SlidersHorizontal aria-hidden="true" />;
  if (group === "Tabletop") return <Layers3 aria-hidden="true" />;
  if (group === "End boxes") return <Box aria-hidden="true" />;
  if (group === "Adjustable feet") return <SlidersHorizontal aria-hidden="true" />;
  if (group === "Support layout") return <GitFork aria-hidden="true" />;
  if (group === "Support joinery") return <Focus aria-hidden="true" />;
  if (group === "Routing templates") return <Ruler aria-hidden="true" />;
  return <Layers3 aria-hidden="true" />;
}

function HoverDiningTableParameterControls({
  model,
  params,
  unit,
  onChange,
  onUnitChange,
}: {
  model: ModelDefinition;
  params: ModelParams;
  unit: LengthUnit;
  onChange: (key: string, value: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const openLegFrames = getParam(params, "endFrameStyle") >= 0.5;
  const floorMustRemainOpen = model.id === "wave-dining-table";

  return (
    <div className="parameter-groups">
      {HOVER_PARAMETER_GROUPS.map((group) => {
        if (floorMustRemainOpen && group === "Bottom support members") {
          return null;
        }
        const parameters = model.parameters.filter(
          (parameter) => parameter.group === group,
        );
        if (parameters.length === 0) return null;
        const groupSlug = group.toLowerCase().replace(/\s+/g, "-");
        const headingId = `parameter-group-${groupSlug}`;
        const contentId = `${headingId}-content`;
        const expanded = expandedGroups.has(group);
        return (
          <section
            aria-labelledby={headingId}
            className="nested-parameter-section parameter-group"
            data-expanded={expanded}
            key={group}
          >
            <div className="divider-controls-heading">
              <button
                aria-controls={contentId}
                aria-expanded={expanded}
                className="parameter-group-toggle"
                onClick={() => {
                  setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  });
                }}
                type="button"
              >
                <span className="parameter-group-icon">
                  <HoverParameterGroupIcon group={group} />
                </span>
                <h3 id={headingId}>
                  {group === "End boxes" && openLegFrames ? "Leg frames" : group}
                </h3>
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
            <div
              className="parameter-group-content"
              hidden={!expanded}
              id={contentId}
            >
              {group === "Support layout" ? (
                <p className="parameter-group-description">
                  {floorMustRemainOpen
                    ? "Choose the top architecture; The Wave keeps the floor open with no lower support."
                    : "Choose the top and floor architecture independently."}
                </p>
              ) : group === "Top support members" ? (
                <p className="parameter-group-description">
                  {floorMustRemainOpen
                    ? "Dimensions for the two lengthwise rails. Their tabletop-facing top edges and end-face perimeters match the leg round-over by default."
                    : "Dimensions for the selected top X or stretcher members."}
                </p>
              ) : group === "Corner braces" ? (
                <p className="parameter-group-description">
                  Four mirrored 45° braces close the top frame into plan-view
                  triangles. Reach is measured along both joined rail faces.
                </p>
              ) : group === "Bottom support members" ? (
                <p className="parameter-group-description">
                  Dimensions for the selected bottom X, board, or no support.
                </p>
              ) : group === "Support joinery" ? (
                <p className="parameter-group-description">
                  Half-lap clearance applies only to selected X supports.
                </p>
              ) : group === "End boxes" ? (
                <p className="parameter-group-description">
                  {openLegFrames
                    ? "Each end uses one sculpted wave-curve top rail and two full-height legs; no bottom rail closes the frame."
                    : "Top and bottom radii are independent. Inner and outer rail-side sweeps shape the horizontal returns; their stile-side sweeps control how long the sides stay straight."}
                </p>
              ) : group === "Adjustable feet" ? (
                <p className="parameter-group-description">
                  Four feet align beneath the stiles. Extension raises the
                  complete wood base while overall tabletop height stays fixed.
                </p>
              ) : null}
              {group === "Support layout" ? (
                <HoverSupportLayoutControl
                  model={model}
                  params={params}
                  onChange={onChange}
                />
              ) : parameters.map((parameter) => {
                if (
                  openLegFrames &&
                  OPEN_LEG_HIDDEN_PARAMETER_KEYS.has(parameter.key)
                ) {
                  return null;
                }
                if (parameter.key === "endFrameStyle") {
                  return (
                    <OriginalOverlayToggle
                      checked={openLegFrames}
                      key={parameter.key}
                      label={parameter.label}
                      onChange={(checked) =>
                        onChange(parameter.key, checked ? 1 : 0)
                      }
                    />
                  );
                }
                if (
                  parameter.key === "halfLapClearance" &&
                  getParam(params, "topSupportStyle") >= 0.5 &&
                  getParam(params, "bottomSupportStyle") >= 0.5
                ) {
                  return null;
                }
                if (parameter.key === "mockScale") {
                  return (
                    <ScaleControl
                      key={parameter.key}
                      limits={getHoverSyncedParameterLimits(
                        model,
                        params,
                        parameter.key,
                      )}
                      onChange={(value) => onChange(parameter.key, value)}
                      value={getParam(params, parameter.key)}
                    />
                  );
                }
                if (parameter.key === "levelingFeetEnabled") {
                  return (
                    <OriginalOverlayToggle
                      checked={getParam(params, parameter.key) >= 0.5}
                      key={parameter.key}
                      label={parameter.label}
                      onChange={(checked) =>
                        onChange(parameter.key, checked ? 1 : 0)
                      }
                    />
                  );
                }
                if (parameter.key === "matchLengthwiseRailRoundover") {
                  return (
                    <OriginalOverlayToggle
                      checked={getParam(params, parameter.key) >= 0.5}
                      key={parameter.key}
                      label={parameter.label}
                      onChange={(checked) =>
                        onChange(parameter.key, checked ? 1 : 0)
                      }
                    />
                  );
                }
                if (
                  parameter.key === "topSupportEdgeRadius" &&
                  floorMustRemainOpen &&
                  getParam(params, "matchLengthwiseRailRoundover") >= 0.5
                ) {
                  return null;
                }
                if (CURVE_PARAM_KEYS.has(parameter.key)) {
                  return (
                    <BezierCurveControl
                      key={parameter.key}
                      label={parameter.label}
                      limits={getHoverSyncedParameterLimits(
                        model,
                        params,
                        parameter.key,
                      )}
                      onChange={(value) => onChange(parameter.key, value)}
                      value={getParam(params, parameter.key)}
                    />
                  );
                }
                return (
                  <NumberControl
                    key={parameter.key}
                    label={parameter.label}
                    limits={getHoverSyncedParameterLimits(
                      model,
                      params,
                      parameter.key,
                    )}
                    onChange={(value) => onChange(parameter.key, value)}
                    onUnitChange={onUnitChange}
                    preferFineStep={parameter.key.endsWith("Clearance")}
                    unit={unit}
                    valueMm={params[parameter.key]}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AngleControl({
  label,
  limits,
  onChange,
  value,
}: {
  label: string;
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const [draftValue, setDraftValue] = useState(() => value.toFixed(0));
  const clampAngle = (nextValue: number) =>
    Math.min(limits.max, Math.max(limits.min, nextValue));
  const updateValue = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) onChange(clampAngle(parsed));
  };

  useEffect(() => {
    setDraftValue(value.toFixed(0));
  }, [value]);

  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row angle-number-row">
        <input
          id={id}
          max={limits.max}
          min={limits.min}
          onChange={(event) => updateValue(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label={`${label} in degrees`}
          inputMode="decimal"
          onBlur={() => setDraftValue(value.toFixed(0))}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            updateValue(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const direction = event.key === "ArrowUp" ? 1 : -1;
            const nextValue = clampAngle(value + direction * limits.step);
            setDraftValue(nextValue.toFixed(0));
            onChange(nextValue);
          }}
          type="text"
          value={draftValue}
        />
        <span aria-hidden="true" className="angle-unit">
          °
        </span>
      </div>
    </div>
  );
}

function DividerControls({
  model,
  params,
  unit,
  onAdd,
  onRemove,
  onPositionChange,
  onUnitChange,
}: {
  model: ModelDefinition;
  params: ModelParams;
  unit: LengthUnit;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPositionChange: (index: number, value: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
}) {
  const count = Math.round(getParam(params, "dividerCount"));
  return (
    <div className="divider-controls">
      <div className="divider-controls-heading">
        <p>{count === 0 ? "No dividers" : `${count} divider${count === 1 ? "" : "s"}`}</p>
        <button disabled={count >= 4} onClick={onAdd} type="button">
          <Plus aria-hidden="true" /> Add divider
        </button>
      </div>
      {Array.from({ length: count }, (_, index) => (
        <div className="divider-control" key={index}>
          <NumberControl
            label={`Divider ${index + 1} position`}
            limits={getParameterLimits(model, params, `dividerPosition${index + 1}`)}
            onChange={(value) => onPositionChange(index, value)}
            onUnitChange={onUnitChange}
            unit={unit}
            valueMm={getParam(params, `dividerPosition${index + 1}`)}
          />
          <button
            aria-label={`Remove divider ${index + 1}`}
            className="divider-remove-button"
            onClick={() => onRemove(index)}
            title={`Remove divider ${index + 1}`}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      ))}
      <small>Positions are measured from the left end of the box.</small>
    </div>
  );
}

function AssemblyPreviewControl({
  value,
  onChange,
}: {
  value: AssemblyMode;
  onChange: (value: AssemblyMode) => void;
}) {
  return (
    <div className="segmented-control assembly-preview-control" aria-label="Assembly preview">
      {([
        ["box", "Box"],
        ["stacked", "Stacked pair"],
        ["lid", "Fitted lid"],
        ["print-layout", "Print layout"],
      ] as const).map(([mode, label]) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function HoverAssemblyControl({
  value,
  onChange,
}: {
  value: AssemblyMode;
  onChange: (value: AssemblyMode) => void;
}) {
  return (
    <div className="segmented-control" aria-label="X-Hover assembly view">
      {([
        ["assembled", "Assembled", <Box aria-hidden="true" />],
        ["exploded", "Exploded", <Layers3 aria-hidden="true" />],
        ["cut-list", "Cut list", <Ruler aria-hidden="true" />],
        ["templates", "Templates", <Focus aria-hidden="true" />],
      ] as const).map(([mode, label, icon]) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          data-mode={mode}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function CoreViewControl({
  value,
  onChange,
}: {
  value: CoreViewMode;
  onChange: (value: CoreViewMode) => void;
}) {
  const options: { value: CoreViewMode; label: string }[] = [
    { value: "surface", label: "Surface" },
    { value: "fill", label: "Fill" },
    { value: "section", label: "Section" },
  ];

  return (
    <div className="segmented-control" aria-label="Weighted center view">
      {options.map((option) => (
        <button
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RenderModeControl({
  value,
  onChange,
}: {
  value: RenderMode;
  onChange: (value: RenderMode) => void;
}) {
  const options: { value: RenderMode; label: string }[] = [
    { value: "solid", label: RENDER_MODE_LABELS.solid },
    { value: "xray", label: RENDER_MODE_LABELS.xray },
    { value: "wire", label: RENDER_MODE_LABELS.wire },
  ];

  return (
    <div className="segmented-control" aria-label="Rendering mode">
      {options.map((option) => (
        <button
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RenderQualityControl({
  value,
  onChange,
}: {
  value: RenderQuality;
  onChange: (value: RenderQuality) => void;
}) {
  const options = Object.entries(RENDER_QUALITY_LABELS) as Array<
    [RenderQuality, string]
  >;

  return (
    <div className="render-quality-control">
      <span className="workspace-menu-label">Quality</span>
      <div className="segmented-control" aria-label="Rendering quality">
        {options.map(([option, label]) => (
          <button
            className={value === option ? "active" : ""}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <small>
        {value === "standard"
          ? "Fast procedural oak"
          : value === "high"
            ? "2K oak PBR and studio lighting"
            : "Progressive path-traced oak"}
      </small>
    </div>
  );
}

function OriginalOverlayToggle({
  checked,
  label = "Original STL",
  onChange,
}: {
  checked: boolean;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function GridfinityToggle({
  checked,
  lengthUnits,
  onChange,
  widthUnits,
}: {
  checked: boolean;
  lengthUnits: number;
  onChange: (checked: boolean) => void;
  widthUnits: number;
}) {
  return (
    <div className="gridfinity-option">
      <OriginalOverlayToggle
        checked={checked}
        label="Gridfinity compatibility"
        onChange={onChange}
      />
      <small>
        {checked
          ? `${lengthUnits} × ${widthUnits} units · 42 mm pitch · standard base + stacking rim`
          : "Snap the footprint to whole grid units and add standard mating feet and rim."}
      </small>
    </div>
  );
}

function PostGrooveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="gridfinity-option">
      <OriginalOverlayToggle
        checked={checked}
        label="Post-top groove / rabbet"
        onChange={onChange}
      />
      <small>
        {checked
          ? "The recessed band meets a rounded lower shoulder below the tabletop."
          : "The top roundover returns to the post edge with no recessed band."}
      </small>
    </div>
  );
}

function PlateLevelingFeetToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="gridfinity-option">
      <OriginalOverlayToggle
        checked={checked}
        label="Independent leg leveling"
        onChange={onChange}
      />
      <small>
        {checked
          ? "Four threaded feet adjust independently while the tabletop height stays fixed."
          : "Wood posts contact the floor directly."}
      </small>
    </div>
  );
}

function TrayOrientationSnapControl({
  maxRotation,
  onChange,
  value,
}: {
  maxRotation: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const clampedValue = clamp(value, 0, maxRotation);
  const displayValue = Number(clampedValue.toFixed(1));
  const sourceLabel = `${Number(maxRotation.toFixed(1))}\u00b0`;

  return (
    <div className="tray-orientation-snap-control" aria-label="Tray orientation">
      <button
        aria-label="Align tray to X axis"
        aria-pressed={displayValue === 0}
        className={displayValue === 0 ? "active" : ""}
        onClick={() => onChange(0)}
        title="Align tray to X axis"
        type="button"
      >
        X
      </button>
      <button
        aria-label="Use tray source angle"
        aria-pressed={displayValue === maxRotation}
        className={displayValue === maxRotation ? "active" : ""}
        onClick={() => onChange(maxRotation)}
        title="Use tray source angle"
        type="button"
      >
        {sourceLabel}
      </button>
    </div>
  );
}

function AuditList({ items }: { items: AuditItem[] }) {
  return (
    <div className="audit-list">
      {items.map((item) => (
        <div className="audit-row" key={item.label}>
          <span className={`status-dot ${item.status}`} />
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function CollapsiblePanelSection({
  children,
  expanded,
  id,
  onToggle,
  title,
}: {
  children: ReactNode;
  expanded: boolean;
  id: string;
  onToggle: () => void;
  title: string;
}) {
  const contentId = `${id}-content`;
  return (
    <section
      className="panel-section collapsible-panel-section"
      data-expanded={expanded}
    >
      <h2>
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          className="panel-section-toggle"
          onClick={onToggle}
          type="button"
        >
          <span>{title}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </h2>
      <div
        className="collapsible-panel-content"
        hidden={!expanded}
        id={contentId}
      >
        {children}
      </div>
    </section>
  );
}

type StructuralCalculationInput =
  HoverDiningTableStructuralMetric["calculation"]["inputs"][number];

type StructuralReferenceKey =
  | HoverDiningTableStructuralMetric["key"]
  | "overall";

type StructuralAssessmentModel =
  | "dining-table"
  | "hover-dining-table"
  | "whisperer";

const STRUCTURAL_SOURCE_URLS: Record<
  StructuralAssessmentModel,
  { source: string; spec: string }
> = {
  "dining-table": {
    source:
      "https://github.com/jasonLaster/jig/blob/main/src/models/diningTable.ts",
    spec:
      "https://github.com/jasonLaster/jig/blob/main/docs/dining-table-audit-specifications.md",
  },
  "hover-dining-table": {
    source:
      "https://github.com/jasonLaster/jig/blob/main/src/models/hoverDiningTable.ts",
    spec:
      "https://github.com/jasonLaster/jig/blob/main/docs/hover-dining-table-audit-specifications.md",
  },
  whisperer: {
    source:
      "https://github.com/jasonLaster/jig/blob/main/src/models/whispererTable.ts",
    spec:
      "https://github.com/jasonLaster/jig/blob/main/docs/whisperer-table-audit-specifications.md",
  },
};

const HOVER_STRUCTURAL_REFERENCES: Record<
  StructuralReferenceKey,
  { label: string; specAnchor: string; sourceLines: string }
> = {
  overall: {
    label: "Overall structural score",
    specAnchor: "overall-weighting-and-grades",
    sourceLines: "L4843-L4866",
  },
  "longitudinal-racking": {
    label: "Lengthwise racking",
    specAnchor: "lengthwise-racking",
    sourceLines: "L4272-L4291",
  },
  "end-box-racking": {
    label: "End-box racking",
    specAnchor: "end-box-racking",
    sourceLines: "L4293-L4300",
  },
  torsion: {
    label: "Torsional rigidity",
    specAnchor: "torsional-rigidity",
    sourceLines: "L4302-L4332",
  },
  tipping: {
    label: "Tipping margin",
    specAnchor: "tipping-margin",
    sourceLines: "L4334-L4347",
  },
  "floor-rocking": {
    label: "Floor rocking tolerance",
    specAnchor: "floor-rocking-tolerance",
    sourceLines: "L4349-L4370",
  },
  "member-stiffness": {
    label: "Member stiffness",
    specAnchor: "member-stiffness",
    sourceLines: "L4372-L4398",
  },
};

const PLATE_STRUCTURAL_REFERENCES: Record<
  StructuralReferenceKey,
  { label: string; specAnchor: string; sourceLines: string }
> = {
  overall: {
    label: "Overall structural score",
    specAnchor: "overall-weighting-and-grades",
    sourceLines: "L883-L904",
  },
  "longitudinal-racking": {
    label: "Apronless post racking",
    specAnchor: "apronless-post-racking",
    sourceLines: "L724-L754",
  },
  "end-box-racking": {
    label: "Plate-joint leverage",
    specAnchor: "plate-joint-leverage",
    sourceLines: "L756-L783",
  },
  torsion: {
    label: "Tabletop torsional rigidity",
    specAnchor: "tabletop-torsional-rigidity",
    sourceLines: "L785-L815",
  },
  tipping: {
    label: "Tipping margin",
    specAnchor: "tipping-margin",
    sourceLines: "L817-L837",
  },
  "floor-rocking": {
    label: "Floor rocking tolerance",
    specAnchor: "floor-rocking-tolerance",
    sourceLines: "L839-L854",
  },
  "member-stiffness": {
    label: "Member stiffness",
    specAnchor: "member-stiffness",
    sourceLines: "L856-L881",
  },
};

const WHISPERER_STRUCTURAL_REFERENCES: Record<
  StructuralReferenceKey,
  { label: string; specAnchor: string; sourceLines: string }
> = {
  overall: {
    label: "Overall structural score",
    specAnchor: "overall-weighting-and-grades",
    sourceLines: "L749-L801",
  },
  "longitudinal-racking": {
    label: "Long-apron racking",
    specAnchor: "long-apron-racking",
    sourceLines: "L527-L634",
  },
  "end-box-racking": {
    label: "Side-frame racking",
    specAnchor: "side-frame-racking",
    sourceLines: "L531-L654",
  },
  torsion: {
    label: "Apron-frame torsion",
    specAnchor: "apron-frame-torsion",
    sourceLines: "L545-L674",
  },
  tipping: {
    label: "Splayed-foot tipping margin",
    specAnchor: "splayed-foot-tipping-margin",
    sourceLines: "L565-L695",
  },
  "floor-rocking": {
    label: "Floor rocking tolerance",
    specAnchor: "floor-rocking-tolerance",
    sourceLines: "L583-L727",
  },
  "member-stiffness": {
    label: "Member stiffness",
    specAnchor: "member-stiffness",
    sourceLines: "L599-L748",
  },
};

function StructuralReferenceLinks({
  assessmentModel,
  referenceKey,
}: {
  assessmentModel: StructuralAssessmentModel;
  referenceKey: StructuralReferenceKey;
}) {
  const references =
    assessmentModel === "dining-table"
      ? PLATE_STRUCTURAL_REFERENCES
      : assessmentModel === "whisperer"
        ? WHISPERER_STRUCTURAL_REFERENCES
        : HOVER_STRUCTURAL_REFERENCES;
  const reference = references[referenceKey];
  const urls = STRUCTURAL_SOURCE_URLS[assessmentModel];
  return (
    <p className="structural-reference-links">
      <a
        aria-label={`${reference.label} detailed specification`}
        href={`${urls.spec}#${reference.specAnchor}`}
        rel="noreferrer"
        target="_blank"
      >
        Detailed specification
      </a>
      <span aria-hidden="true">·</span>
      <a
        aria-label={`${reference.label} formula source code`}
        href={`${urls.source}#${reference.sourceLines}`}
        rel="noreferrer"
        target="_blank"
      >
        Formula source
      </a>
    </p>
  );
}

function formatStructuralCalculationInput(
  input: StructuralCalculationInput,
  unit: LengthUnit,
) {
  if (input.format === "length" && typeof input.value === "number") {
    return formatLength(input.value, unit);
  }
  if (input.format === "number" && typeof input.value === "number") {
    return `${input.value.toFixed(input.precision ?? 2)}${input.suffix ?? ""}`;
  }
  return String(input.value);
}

function HoverStructuralMetric({
  assessmentModel,
  metric,
  unit,
}: {
  assessmentModel: StructuralAssessmentModel;
  metric: HoverDiningTableStructuralMetric;
  unit: LengthUnit;
}) {
  const [isCalculationExpanded, setIsCalculationExpanded] = useState(false);
  const calculationId = useId();
  return (
    <div
      className="structural-metric"
      data-calculation-expanded={isCalculationExpanded}
      data-metric={metric.key}
      data-score={metric.score}
      role="listitem"
    >
      <div className="structural-metric-heading">
        <div className="structural-metric-title">
          <span>{metric.label}</span>
          <button
            aria-controls={calculationId}
            aria-expanded={isCalculationExpanded}
            aria-label={`Explain ${metric.label} calculation`}
            className="structural-info-button"
            onClick={() => setIsCalculationExpanded((current) => !current)}
            title={`Show the ${metric.label.toLowerCase()} formula and inputs`}
            type="button"
          >
            <Info aria-hidden="true" />
          </button>
        </div>
        <strong>
          {metric.grade} · {metric.score}
        </strong>
      </div>
      <div
        aria-label={`${metric.label}: ${metric.score} out of 100`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={metric.score}
        className="structural-score-track"
        role="meter"
      >
        <span style={{ width: `${metric.score}%` }} />
      </div>
      <small>{metric.detail}</small>
      <div
        aria-label={`${metric.label} calculation details`}
        className="structural-calculation-panel"
        hidden={!isCalculationExpanded}
        id={calculationId}
        role="note"
      >
        <div className="structural-calculation-section">
          <h4>Rationale</h4>
          <p>{metric.calculation.rationale}</p>
          <StructuralReferenceLinks
            assessmentModel={assessmentModel}
            referenceKey={metric.key}
          />
        </div>
        <div className="structural-calculation-section">
          <h4>Formula</h4>
          <code className="structural-formula">
            {metric.calculation.formula}
          </code>
        </div>
        <div className="structural-calculation-section">
          <h4>Current inputs</h4>
          <dl className="structural-calculation-inputs">
            {metric.calculation.inputs.map((input) => (
              <div key={input.key}>
                <dt>
                  <span>{input.label}</span>
                  <code>{input.key}</code>
                </dt>
                <dd>{formatStructuralCalculationInput(input, unit)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="structural-scoring-note">
          {metric.calculation.scoringNote}
        </p>
      </div>
    </div>
  );
}

function HoverStructuralAssessment({
  modelId,
  modelViewer,
  params,
  unit,
}: {
  modelId: string;
  modelViewer: "dining-table-v1" | "hover-dining-table-v1";
  params: ModelParams;
  unit: LengthUnit;
}) {
  const assessmentModel: StructuralAssessmentModel =
    modelId === "whisperer"
      ? "whisperer"
      : modelViewer === "dining-table-v1"
      ? "dining-table"
      : "hover-dining-table";
  const assessment =
    modelViewer === "dining-table-v1"
      ? getDiningTableStructuralAssessment(params)
      : getHoverDiningTableStructuralAssessment(params);
  const [isOverallCalculationExpanded, setIsOverallCalculationExpanded] =
    useState(false);
  const overallCalculationId = useId();
  const formatDelta = (delta: number) =>
    `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return (
    <section
      aria-label="Structural wobble assessment"
      className="structural-assessment"
      data-overall-score={assessment.overallScore}
    >
      <div className="structural-score-header">
        <div className="structural-assessment-title">
          <div>
            <p>Geometry-only screening</p>
            <h3>Wobble resistance</h3>
          </div>
          <button
            aria-controls={overallCalculationId}
            aria-expanded={isOverallCalculationExpanded}
            aria-label="Explain overall structural score calculation"
            className="structural-info-button"
            onClick={() =>
              setIsOverallCalculationExpanded((current) => !current)
            }
            title="Show the overall weighting and grade calculation"
            type="button"
          >
            <Info aria-hidden="true" />
          </button>
        </div>
        <div
          aria-label={`Overall structural grade ${assessment.overallGrade}, ${assessment.overallScore} out of 100`}
          className={`structural-grade grade-${assessment.overallGrade.toLowerCase()}`}
        >
          <span>Grade {assessment.overallGrade}</span>
          <strong>{assessment.overallScore}</strong>
        </div>
      </div>
      <p className="structural-disclaimer">
        Higher is better. This compares CAD proportions and support topology;
        it does not certify joints, glue, grain, floor flatness, or durability.
      </p>
      <div
        aria-label="Overall structural score calculation details"
        className="structural-calculation-panel structural-overall-calculation"
        hidden={!isOverallCalculationExpanded}
        id={overallCalculationId}
        role="note"
      >
        <div className="structural-calculation-section">
          <h4>Rationale</h4>
          <p>{assessment.overallCalculation.rationale}</p>
          <StructuralReferenceLinks
            assessmentModel={assessmentModel}
            referenceKey="overall"
          />
        </div>
        <div className="structural-calculation-section">
          <h4>Formula</h4>
          <code className="structural-formula">
            {assessment.overallCalculation.formula}
          </code>
        </div>
        <div className="structural-calculation-section">
          <h4>Current weighted inputs</h4>
          <dl className="structural-calculation-inputs">
            {assessment.metrics.map((metric) => (
              <div key={metric.key}>
                <dt>
                  <span>{metric.label}</span>
                  <code>
                    {(metric.calculation.weight * 100).toFixed(0)}% weight
                  </code>
                </dt>
                <dd>
                  {metric.score} × {metric.calculation.weight.toFixed(2)} ={" "}
                  {(metric.score * metric.calculation.weight).toFixed(1)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="structural-scoring-note">
          {assessment.overallCalculation.scoringNote}
        </p>
      </div>
      <div className="structural-metrics" role="list">
        {assessment.metrics.map((metric) => (
          <HoverStructuralMetric
            assessmentModel={assessmentModel}
            key={metric.key}
            metric={metric}
            unit={unit}
          />
        ))}
      </div>
      <div className="structural-sensitivity">
        <div>
          <h4>Overall-height sensitivity</h4>
          <p>One parameter at a time; all other dimensions stay fixed.</p>
        </div>
        <div className="structural-sensitivity-values">
          {assessment.heightSensitivity.lower ? (
            <span>
              {formatLength(
                assessment.heightSensitivity.lower.heightMm,
                unit,
              )}{" "}
              <strong>
                {assessment.heightSensitivity.lower.score} ({formatDelta(
                  assessment.heightSensitivity.lower.delta,
                )})
              </strong>
            </span>
          ) : null}
          {assessment.heightSensitivity.higher ? (
            <span>
              {formatLength(
                assessment.heightSensitivity.higher.heightMm,
                unit,
              )}{" "}
              <strong>
                {assessment.heightSensitivity.higher.score} ({formatDelta(
                  assessment.heightSensitivity.higher.delta,
                )})
              </strong>
            </span>
          ) : null}
        </div>
      </div>
      <p className="structural-validation-note">
        Build validation: shim-free corner-rock test, measured lateral push at
        tabletop height, loaded deflection, and repeated-load joint inspection.
      </p>
    </section>
  );
}

function HoverDesignChecks({
  auditExpanded,
  auditItems,
  idPrefix,
  modelId,
  modelViewer,
  onAuditToggle,
  onStructureToggle,
  params,
  structureExpanded,
  unit,
}: {
  auditExpanded: boolean;
  auditItems: AuditItem[];
  idPrefix: string;
  modelId: string;
  modelViewer: "dining-table-v1" | "hover-dining-table-v1";
  onAuditToggle: () => void;
  onStructureToggle: () => void;
  params: ModelParams;
  structureExpanded: boolean;
  unit: LengthUnit;
}) {
  return (
    <>
      <CollapsiblePanelSection
        expanded={structureExpanded}
        id={`${idPrefix}-structure`}
        onToggle={onStructureToggle}
        title="Structure"
      >
        <HoverStructuralAssessment
          modelId={modelId}
          modelViewer={modelViewer}
          params={params}
          unit={unit}
        />
      </CollapsiblePanelSection>
      <CollapsiblePanelSection
        expanded={auditExpanded}
        id={`${idPrefix}-audit`}
        onToggle={onAuditToggle}
        title="Audit"
      >
        <AuditList items={auditItems} />
      </CollapsiblePanelSection>
    </>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section className="scene-panel loading-panel" aria-live="polite">
        <div>{message}</div>
      </section>
    </main>
  );
}

function formatWorkspaceVersionDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function isVisibleSavedVersion(version: SavedLibraryVersion) {
  return !version.title.startsWith(PLAYWRIGHT_TEST_VERSION_TITLE_PREFIX);
}

type WorkspaceLibrarySidebarProps = {
  activeSection: WorkspaceLibrarySection;
  activeVersionId: Id<"versions"> | null;
  brochures?: SavedBrochure[];
  catalogModels: CatalogSeedModel[];
  convexEnabled: boolean;
  designChecks: ReactNode | null;
  isBrochureOpen: boolean;
  isCollapsed: boolean;
  isCompactOpen: boolean;
  selectedModelId: string;
  theme: ThemeMode;
  onGenerateBrochure?: () => void;
  onOpenModel: (modelId: string) => void;
  onOpenBrochure: (brochure: SavedBrochure) => void;
  onOpenVersion: (version: SavedLibraryVersion) => void;
  onSectionChange: (section: WorkspaceLibrarySection) => void;
  onToggleCollapsed: () => void;
};

type WorkspaceLibrarySection =
  | "models"
  | "versions"
  | "brochures"
  | "checks";

function WorkspaceLibrarySidebar({
  activeSection,
  activeVersionId,
  brochures,
  catalogModels,
  convexEnabled,
  designChecks,
  isBrochureOpen,
  isCollapsed,
  isCompactOpen,
  selectedModelId,
  theme,
  onGenerateBrochure,
  onOpenModel,
  onOpenBrochure,
  onOpenVersion,
  onSectionChange,
  onToggleCollapsed,
}: WorkspaceLibrarySidebarProps) {
  const [query, setQuery] = useState("");
  const hasDesignChecks = designChecks !== null;
  const filteredModels = useMemo(
    () => filterLibraryModels(catalogModels, query),
    [catalogModels, query],
  );
  const selectedModelName =
    catalogModels.find((modelEntry) => modelEntry.key === selectedModelId)?.name ??
    "Selected model";

  useEffect(() => {
    if (!hasDesignChecks && activeSection === "checks") {
      onSectionChange("models");
    }
  }, [activeSection, hasDesignChecks, onSectionChange]);

  useEffect(() => {
    if (isBrochureOpen) {
      onSectionChange("brochures");
    }
  }, [isBrochureOpen, onSectionChange]);

  if (isCollapsed) {
    return (
      <aside
        className="workspace-library-sidebar collapsed"
        aria-label="Workspace model library"
      >
        <button
          aria-label="Expand model library"
          className="library-collapse-button"
          onClick={onToggleCollapsed}
          title="Expand model library"
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" />
        </button>
        <button
          aria-label="Show models"
          className={activeSection === "models" ? "active" : ""}
          onClick={() => {
            onSectionChange("models");
            onToggleCollapsed();
          }}
          title="Jig Library"
          type="button"
        >
          <Layers3 aria-hidden="true" />
        </button>
        <button
          aria-label="Show saved versions"
          className={activeSection === "versions" ? "active" : ""}
          onClick={() => {
            onSectionChange("versions");
            onToggleCollapsed();
          }}
          title="Saved Versions"
          type="button"
        >
          <Clock3 aria-hidden="true" />
        </button>
        <button
          aria-label="Show brochures"
          className={activeSection === "brochures" ? "active" : ""}
          onClick={() => {
            onSectionChange("brochures");
            onToggleCollapsed();
          }}
          title="Brochures"
          type="button"
        >
          <Images aria-hidden="true" />
        </button>
        {hasDesignChecks ? (
          <button
            aria-label="Show design checks"
            className={activeSection === "checks" ? "active" : ""}
            onClick={() => {
              onSectionChange("checks");
              onToggleCollapsed();
            }}
            title="Design checks"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
        ) : null}
      </aside>
    );
  }

  return (
    <aside
      className={`workspace-library-sidebar${isCompactOpen ? " compact-open" : ""}`}
      aria-label="Workspace model library"
    >
      <div className="workspace-library-topbar">
        <button
          aria-label="Collapse model library"
          className="library-collapse-button"
          onClick={onToggleCollapsed}
          title="Collapse model library"
          type="button"
        >
          <PanelLeftClose aria-hidden="true" />
        </button>
      </div>

      <nav className="workspace-library-nav" aria-label="Workspace library sections">
        <button
          className={activeSection === "models" ? "active" : ""}
          onClick={() => onSectionChange("models")}
          type="button"
        >
          <Layers3 aria-hidden="true" />
          Jig Library
        </button>
        <button
          className={activeSection === "versions" ? "active" : ""}
          onClick={() => onSectionChange("versions")}
          type="button"
        >
          <Clock3 aria-hidden="true" />
          Saved Versions
        </button>
        <button
          className={activeSection === "brochures" ? "active" : ""}
          onClick={() => onSectionChange("brochures")}
          type="button"
        >
          <Images aria-hidden="true" />
          Brochures
        </button>
        {hasDesignChecks ? (
          <button
            className={activeSection === "checks" ? "active" : ""}
            onClick={() => onSectionChange("checks")}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" />
            Design checks
          </button>
        ) : null}
      </nav>

      {activeSection === "models" ? (
        <div className="workspace-sidebar-section workspace-models-section">
          <div className="workspace-sidebar-section-heading">
            <span>Models</span>
          </div>
          <label className="workspace-library-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search workspace models"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search models..."
              type="search"
              value={query}
            />
            <SlidersHorizontal aria-hidden="true" />
          </label>
          <div className="workspace-model-list">
            {filteredModels.map((modelEntry) => {
              const isActive = modelEntry.key === selectedModelId;
              return (
                <article
                  className={`workspace-model-card${isActive ? " active" : ""}`}
                  key={modelEntry.key}
                >
                  <MiniModelViewer
                    configUrl={modelEntry.configUrl}
                    modelKey={modelEntry.key}
                    modelName={modelEntry.name}
                    theme={theme}
                  />
                  <button
                    aria-current={isActive ? "page" : undefined}
                    aria-label={`Open ${modelEntry.name}`}
                    className="workspace-model-card-open"
                    onClick={() => onOpenModel(modelEntry.key)}
                    type="button"
                  >
                    <span className="workspace-model-card-copy">
                      <strong>{modelEntry.name}</strong>
                      <span>
                        {modelEntry.description ?? "Parametric STL model"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : activeSection === "versions" ? (
        <WorkspaceSavedVersions
          activeVersionId={activeVersionId}
          convexEnabled={convexEnabled}
          selectedModelId={selectedModelId}
          selectedModelName={selectedModelName}
          onOpenVersion={onOpenVersion}
        />
      ) : activeSection === "brochures" ? (
        <WorkspaceSavedBrochures
          brochures={brochures}
          convexEnabled={convexEnabled}
          onGenerateBrochure={onGenerateBrochure}
          onOpenBrochure={onOpenBrochure}
          selectedModelId={selectedModelId}
          selectedModelName={selectedModelName}
        />
      ) : (
        <div
          aria-label="Hover-table design checks"
          className="workspace-design-checks"
        >
          {designChecks}
        </div>
      )}
    </aside>
  );
}

function WorkspaceSavedBrochures({
  brochures,
  convexEnabled,
  onGenerateBrochure,
  onOpenBrochure,
  selectedModelId,
  selectedModelName,
}: {
  brochures?: SavedBrochure[];
  convexEnabled: boolean;
  onGenerateBrochure?: () => void;
  onOpenBrochure: (brochure: SavedBrochure) => void;
  selectedModelId: string;
  selectedModelName: string;
}) {
  const visibleBrochures = (brochures ?? []).filter(
    (brochure) => brochure.modelKey === selectedModelId,
  );
  return (
    <div className="workspace-sidebar-section workspace-brochures-section">
      <div className="workspace-sidebar-section-heading">
        <span>Brochures</span>
        <strong title={selectedModelName}>{selectedModelName}</strong>
      </div>
      {onGenerateBrochure ? (
        <button
          className="workspace-brochure-generate"
          onClick={onGenerateBrochure}
          type="button"
        >
          <Sparkles aria-hidden="true" />
          Generate brochure
        </button>
      ) : null}
      <div className="workspace-brochure-content">
        {!convexEnabled ? (
          <LibraryUnavailableMessage>
            Connect Convex to save and browse generated brochures.
          </LibraryUnavailableMessage>
        ) : brochures === undefined ? (
          <p className="library-empty">Loading brochures...</p>
        ) : visibleBrochures.length === 0 ? (
          <p className="library-empty">
            No brochures yet. Generate the first one above.
          </p>
        ) : (
          <div className="workspace-brochure-grid">
            {visibleBrochures.map((brochure) => (
              <button
                aria-label={`Open brochure from ${formatWorkspaceVersionDate(brochure.createdAt)}`}
                className="workspace-brochure-card"
                key={brochure.generationId}
                onClick={() => onOpenBrochure(brochure)}
                type="button"
              >
                <img
                  alt=""
                  decoding="async"
                  loading="lazy"
                  src={brochure.imageUrl}
                />
                <span>
                  <strong>{formatWorkspaceVersionDate(brochure.createdAt)}</strong>
                  <small>
                    {(brochure.dimensions.length / 25.4).toFixed(0)} ×{" "}
                    {(brochure.dimensions.width / 25.4).toFixed(1)} in ·{" "}
                    {brochure.assets.length} {brochure.assets.length === 1 ? "view" : "views"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

class WorkspaceVersionsErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unable to render workspace saved versions.", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function WorkspaceSavedVersions({
  activeVersionId,
  convexEnabled,
  selectedModelId,
  selectedModelName,
  onOpenVersion,
}: {
  activeVersionId: Id<"versions"> | null;
  convexEnabled: boolean;
  selectedModelId: string;
  selectedModelName: string;
  onOpenVersion: (version: SavedLibraryVersion) => void;
}) {
  if (!convexEnabled) {
    return (
      <div className="workspace-sidebar-section">
        <div className="workspace-sidebar-section-heading">
          <span>Saved versions</span>
          <strong title={selectedModelName}>{selectedModelName}</strong>
        </div>
        <div className="workspace-version-content">
          <LibraryUnavailableMessage>
            Connect Convex to browse saved versions for this model.
          </LibraryUnavailableMessage>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceVersionsErrorBoundary
      fallback={
        <div className="workspace-sidebar-section">
          <div className="workspace-sidebar-section-heading">
            <span>Saved versions</span>
            <strong title={selectedModelName}>{selectedModelName}</strong>
          </div>
          <div className="workspace-version-content">
            <LibraryUnavailableMessage>
              Saved versions could not load. The model is still editable and exportable.
            </LibraryUnavailableMessage>
          </div>
        </div>
      }
    >
      <ConnectedWorkspaceSavedVersions
        activeVersionId={activeVersionId}
        selectedModelId={selectedModelId}
        selectedModelName={selectedModelName}
        onOpenVersion={onOpenVersion}
      />
    </WorkspaceVersionsErrorBoundary>
  );
}

function ConnectedWorkspaceSavedVersions({
  activeVersionId,
  selectedModelId,
  selectedModelName,
  onOpenVersion,
}: {
  activeVersionId: Id<"versions"> | null;
  selectedModelId: string;
  selectedModelName: string;
  onOpenVersion: (version: SavedLibraryVersion) => void;
}) {
  const connectionState = useConvexConnectionState();
  const library = useQuery(api.library.listLibrary);
  const versions = useMemo(
    () =>
      ((library?.versions ?? []) as SavedLibraryVersion[]).filter(
        (version) =>
          version.modelKey === selectedModelId && isVisibleSavedVersion(version),
      ),
    [library, selectedModelId],
  );
  const hasConnectionIssue =
    !connectionState.isWebSocketConnected &&
    (connectionState.hasEverConnected || connectionState.connectionRetries > 0);

  return (
    <div className="workspace-sidebar-section">
      <div className="workspace-sidebar-section-heading">
        <span>Saved versions</span>
        <strong title={selectedModelName}>{selectedModelName}</strong>
      </div>
      <div className="workspace-version-content">
        {hasConnectionIssue ? (
          <LibraryUnavailableMessage>
            Saved versions are reconnecting. You can keep editing the model.
          </LibraryUnavailableMessage>
        ) : null}
        {library === undefined ? (
          <p className="library-empty">Loading saved versions...</p>
        ) : versions.length === 0 ? (
          <p className="library-empty">No saved versions for this model yet.</p>
        ) : (
          <div className="workspace-version-list">
            {versions.map((version) => {
              const isActive = activeVersionId === version._id;
              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${version.title}`}
                  className={`workspace-version-row${isActive ? " active" : ""}`}
                  key={version._id}
                  onClick={() => onOpenVersion(version)}
                  type="button"
                >
                  <span className="workspace-version-icon" aria-hidden="true">
                    {version.source === "fork" ? <GitFork /> : <Clock3 />}
                  </span>
                  <span className="workspace-version-copy">
                    <strong>{version.title}</strong>
                    <span>
                      {version.source === "fork" ? "Fork" : "Saved"} ·{" "}
                      {formatWorkspaceVersionDate(version.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkspaceActionsMenu({
  activeVersionId,
  convexEnabled,
  exportFileName,
  model,
  params,
  renderMode,
  renderQuality,
  showOriginal,
  theme,
  unit,
  onCreateStlBlob,
  onExport,
  onExportLid,
  onExportBoxAndLid,
  onExportHoverTemplates,
  onRenderModeChange,
  onRenderQualityChange,
  onSavedVersion,
  onShowOriginalChange,
  onThemeChange,
}: {
  activeVersionId: Id<"versions"> | null;
  convexEnabled: boolean;
  exportFileName: string;
  model: ModelDefinition;
  params: ModelParams;
  renderMode: RenderMode;
  renderQuality: RenderQuality;
  showOriginal: boolean;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onExport: () => void;
  onExportLid: () => void;
  onExportBoxAndLid: () => void;
  onExportHoverTemplates: () => void;
  onRenderModeChange: (renderMode: RenderMode) => void;
  onRenderQualityChange: (renderQuality: RenderQuality) => void;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
  onShowOriginalChange: (checked: boolean) => void;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isDark = theme === "dark";

  return (
    <div
      className="workspace-actions-menu-shell"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      }}
    >
      <button
        aria-expanded={isOpen}
        aria-label="Workspace actions"
        className="workspace-actions-trigger"
        onClick={() => setIsOpen((current) => !current)}
        title="Workspace actions"
        type="button"
      >
        <MoreHorizontal aria-hidden="true" />
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen ? (
        <>
          <div
            aria-hidden="true"
            className="workspace-actions-mask"
            onMouseDown={() => setIsOpen(false)}
          />
          <div
            aria-label="Workspace actions"
            className="workspace-actions-menu"
            role="dialog"
          >
            <div className="workspace-menu-group">
              {convexEnabled ? (
                <SaveForkControls
                  activeVersionId={activeVersionId}
                  currentModel={{ id: model.id, name: model.name }}
                  exportFileName={exportFileName}
                  onCreateStlBlob={onCreateStlBlob}
                  onSavedVersion={onSavedVersion}
                  params={params}
                  theme={theme}
                  unit={unit}
                />
              ) : (
                <LibraryUnavailableMessage>
                  Library sync is unavailable here. You can still edit and export;
                  Save/Fork return when Convex reconnects.
                </LibraryUnavailableMessage>
              )}
            </div>
            <div className="workspace-menu-group">
              <button
                aria-label={isDark ? "Use light theme" : "Use dark theme"}
                onClick={() => onThemeChange(isDark ? "light" : "dark")}
                type="button"
              >
                {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                {isDark ? "Light theme" : "Dark theme"}
              </button>
            </div>
            <div
              aria-label="Rendering settings"
              className="workspace-menu-group workspace-rendering-settings"
            >
              <span className="workspace-menu-label">Rendering</span>
              <RenderModeControl
                onChange={onRenderModeChange}
                value={renderMode}
              />
              {getWoodSpeciesForModel(model.id) ? (
                <RenderQualityControl
                  onChange={onRenderQualityChange}
                  value={renderQuality}
                />
              ) : null}
              {model.viewer !== "dining-table-v1" &&
              model.viewer !== "hover-dining-table-v1" ? (
                <OriginalOverlayToggle
                  checked={showOriginal}
                  label={
                    model.viewer === "weighted-paper-towel-holder-v1"
                      ? "Original inlay"
                      : "Original STL"
                  }
                  onChange={onShowOriginalChange}
                />
              ) : null}
            </div>
            <div className="workspace-menu-group">
              <button className="primary-action" onClick={onExport} type="button">
                <Download aria-hidden="true" />
                {model.viewer === "dining-table-v1" &&
                (model.id !== "whisperer" ||
                  getParam(params, "levelingFeetEnabled") >= 0.5)
                  ? "Export two-color STLs"
                  : "Export"}
              </button>
              {model.viewer === "simple-box-v1" ? (
                <>
                  <button onClick={onExportLid} type="button">
                    <Download aria-hidden="true" />
                    Export lid
                  </button>
                  <button onClick={onExportBoxAndLid} type="button">
                    <Download aria-hidden="true" />
                    Export box + lid
                  </button>
                </>
              ) : null}
              {model.viewer === "hover-dining-table-v1" ? (
                <button onClick={onExportHoverTemplates} type="button">
                  <Download aria-hidden="true" />
                  Export routing-template STL set
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function WorkspaceHeader({
  activeVersionId,
  activeVersionTitle,
  convexEnabled,
  exportFileName,
  model,
  params,
  renderMode,
  renderQuality,
  showOriginal,
  theme,
  unit,
  onCreateStlBlob,
  onExport,
  onExportLid,
  onExportBoxAndLid,
  onExportHoverTemplates,
  onRenderModeChange,
  onRenderQualityChange,
  onSavedVersion,
  onShowOriginalChange,
  onThemeChange,
  onOpenNavigation,
  showNavigationTrigger,
}: {
  activeVersionId: Id<"versions"> | null;
  activeVersionTitle: string | null;
  convexEnabled: boolean;
  exportFileName: string;
  model: ModelDefinition;
  params: ModelParams;
  renderMode: RenderMode;
  renderQuality: RenderQuality;
  showOriginal: boolean;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onExport: () => void;
  onExportLid: () => void;
  onExportBoxAndLid: () => void;
  onExportHoverTemplates: () => void;
  onRenderModeChange: (renderMode: RenderMode) => void;
  onRenderQualityChange: (renderQuality: RenderQuality) => void;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
  onShowOriginalChange: (checked: boolean) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onOpenNavigation: () => void;
  showNavigationTrigger: boolean;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <div>
          <p>{model.subtitle}</p>
          <h1>{activeVersionTitle ?? model.name}</h1>
        </div>
      </div>
      <div className="workspace-actions">
        {showNavigationTrigger ? (
          <button
            aria-label="Open workspace navigation"
            className="workspace-quick-action workspace-navigation-trigger"
            onClick={onOpenNavigation}
            title="Open model library and design checks"
            type="button"
          >
            <PanelLeftOpen aria-hidden="true" />
          </button>
        ) : null}
        <WorkspaceActionsMenu
          activeVersionId={activeVersionId}
          convexEnabled={convexEnabled}
          exportFileName={exportFileName}
          model={model}
          onCreateStlBlob={onCreateStlBlob}
          onExport={onExport}
          onExportLid={onExportLid}
          onExportBoxAndLid={onExportBoxAndLid}
          onExportHoverTemplates={onExportHoverTemplates}
          onRenderModeChange={onRenderModeChange}
          onRenderQualityChange={onRenderQualityChange}
          onSavedVersion={onSavedVersion}
          onShowOriginalChange={onShowOriginalChange}
          onThemeChange={onThemeChange}
          params={params}
          renderMode={renderMode}
          renderQuality={renderQuality}
          showOriginal={showOriginal}
          theme={theme}
          unit={unit}
        />
      </div>
    </header>
  );
}

function getRequestedModelId() {
  return new URLSearchParams(window.location.search).get("model") ?? "";
}

export default function App({
  brochureClientId = getBrochureClientId(),
  brochurePersistence,
  convexEnabled = false,
  savedBrochures,
}: {
  brochureClientId?: string;
  brochurePersistence?: BrochurePersistence;
  convexEnabled?: boolean;
  savedBrochures?: SavedBrochure[];
}) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [model, setModel] = useState<ModelDefinition | null>(null);
  const [params, setParams] = useState<ModelParams | null>(null);
  const [loadError, setLoadError] = useState("");
  const [unit, setUnit] = useState<LengthUnit>(() => getInitialUnit());
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [assemblyMode, setAssemblyMode] = useState<AssemblyMode>("box");
  const [inspectorWidth, setInspectorWidth] = useState(() => getStoredSidebarWidth());
  const [librarySidebarWidth, setLibrarySidebarWidth] = useState(() =>
    getStoredLibrarySidebarWidth(),
  );
  const [isLibrarySidebarCollapsed, setIsLibrarySidebarCollapsed] =
    useState(false);
  const [activeLibrarySection, setActiveLibrarySection] =
    useState<WorkspaceLibrarySection>("checks");
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  const [isStructureExpanded, setIsStructureExpanded] = useState(true);
  const isCompactWorkspace = useMediaQuery("(max-width: 1240px)");
  const isMobileWorkspace = useMediaQuery("(max-width: 840px)");
  const [isCompactLibraryOpen, setIsCompactLibraryOpen] = useState(false);
  const [mobileInspectorSection, setMobileInspectorSection] =
    useState<MobileInspectorSection>("assembly");
  const [coreViewMode, setCoreViewMode] = useState<CoreViewMode>("surface");
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [renderQuality, setRenderQuality] =
    useState<RenderQuality>("standard");
  const [showOriginal, setShowOriginal] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<Id<"versions"> | null>(
    null,
  );
  const [activeVersionTitle, setActiveVersionTitle] = useState<string | null>(
    null,
  );
  const viewerRef = useRef<ViewerHandle | null>(null);
  const brochureAbortRef = useRef<AbortController | null>(null);
  const brochureRequestRef = useRef(0);
  const brochurePendingSaveRef = useRef<PendingBrochureSave | null>(null);
  const [brochureState, setBrochureState] =
    useState<BrochureGenerationState>({ status: "idle" });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      LIBRARY_SIDEBAR_WIDTH_KEY,
      String(librarySidebarWidth),
    );
  }, [librarySidebarWidth]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const response = await fetch(CATALOG_URL);
        if (!response.ok) {
          throw new Error(`Unable to load ${CATALOG_URL}`);
        }
        const nextCatalog = (await response.json()) as ModelCatalog;
        if (cancelled) {
          return;
        }
        setCatalog(nextCatalog);
        setSelectedModelId((current) => {
          if (current) {
            return current;
          }
          const requestedModelId = getRequestedModelId();
          if (!requestedModelId) {
            const defaultModel =
              nextCatalog.models.find((entry) => entry.id === DEFAULT_MODEL_ID) ??
              nextCatalog.models[0];
            if (!defaultModel) {
              setLoadError("No models are available.");
              return "";
            }
            const url = new URL(window.location.href);
            url.searchParams.set("model", defaultModel.id);
            url.searchParams.delete("theme");
            for (const key of PARAM_QUERY_KEYS) {
              url.searchParams.delete(key);
            }
            window.history.replaceState(null, "", url);
            return defaultModel.id;
          }
          const requestedModel = nextCatalog.models.find(
            (entry) => entry.id === requestedModelId,
          );
          if (!requestedModel) {
            setLoadError(`Unknown model "${requestedModelId}"`);
            return "";
          }
          return requestedModel.id;
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalog) {
      return undefined;
    }

    if (!selectedModelId) {
      setModel(null);
      setParams(null);
      if (!getRequestedModelId()) {
        setLoadError("");
      }
      return undefined;
    }

    const entry = catalog.models.find((candidate) => candidate.id === selectedModelId);
    if (!entry) {
      setLoadError(`Unknown model "${selectedModelId}"`);
      return undefined;
    }

    const configUrl = entry.configUrl;
    let cancelled = false;
    async function loadModel() {
      try {
        setLoadError("");
        const response = await fetch(configUrl);
        if (!response.ok) {
          throw new Error(`Unable to load ${configUrl}`);
        }
        const nextModel = (await response.json()) as ModelDefinition;
        if (cancelled) {
          return;
        }
        setModel(nextModel);
        setParams(getParamsFromUrl(nextModel));
        setShowOriginal(false);
        setCoreViewMode("surface");
        setRenderMode("solid");
        setRenderQuality(
          getWoodSpeciesForModel(nextModel.id)
            ? getRequestedRenderQuality()
            : "standard",
        );
        brochureAbortRef.current?.abort();
        setBrochureState({ status: "idle" });
        setAssemblyMode(
          nextModel.viewer === "hover-dining-table-v1" ? "assembled" : "box",
        );
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [catalog, selectedModelId]);

  const auditItems = useMemo(() => {
    if (!model || !params) {
      return [];
    }
    return buildAuditItems(params, unit, model);
  }, [model, params, unit]);

  const catalogSeedModels = useMemo<CatalogSeedModel[]>(() => {
    if (!catalog) {
      return [];
    }

    return catalog.models.map((entry) => {
      const isCurrentModel = model?.id === entry.id;
      const seedModel: CatalogSeedModel = {
        key: entry.id,
        name: entry.name,
        configUrl: entry.configUrl,
      };
      if (isCurrentModel) {
        seedModel.description = model.description;
        seedModel.publicStlUrl = model.stl.url;
        seedModel.fileName = model.stl.fileName;
      }
      return seedModel;
    });
  }, [catalog, model]);

  useEffect(() => {
    if (!model || !params || !selectedModelId || model.id !== selectedModelId) {
      return;
    }

    writeUrlState({
      modelId: selectedModelId,
      params,
      renderQuality,
      unit,
    });
  }, [model, params, renderQuality, selectedModelId, unit]);

  useEffect(() => {
    const generationId = new URLSearchParams(window.location.search).get(
      "brochure",
    );
    if (!generationId || !model || !savedBrochures) return;
    const brochure = savedBrochures.find(
      (candidate) => candidate.generationId === generationId,
    );
    if (!brochure) return;
    if (model.id !== brochure.modelKey) {
      setSelectedModelId(brochure.modelKey);
      return;
    }
    setAssemblyMode("brochure");
    setBrochureState({
      status: "success",
      assets: brochure.assets,
      dimensions: brochure.dimensions,
      generationId: brochure.generationId,
      saved: true,
    });
  }, [model, savedBrochures]);

  const startBrochureGeneration = () => {
    if (
      !model ||
      !params ||
      (model.viewer !== "hover-dining-table-v1" &&
        model.viewer !== "dining-table-v1")
    ) {
      return;
    }
    const viewer = viewerRef.current;
    if (!viewer) {
      setBrochureState({
        status: "error",
        message: "The 3D viewer is not ready yet. Try again in a moment.",
      });
      return;
    }

    setAssemblyMode("brochure");
    const brochureUrl = new URL(window.location.href);
    brochureUrl.searchParams.delete("brochure");
    window.history.replaceState(null, "", brochureUrl);
    const requestId = brochureRequestRef.current + 1;
    brochureRequestRef.current = requestId;
    brochureAbortRef.current?.abort();
    const controller = new AbortController();
    brochureAbortRef.current = controller;
    brochurePendingSaveRef.current = null;
    setBrochureState({ status: "generating" });

    void (async () => {
      const generationId = globalThis.crypto.randomUUID();
      const dimensions = {
        height: getParam(params, "overallHeight"),
        length: getParam(params, "tableLength"),
        topThickness: getParam(params, "topThickness"),
        width: getParam(params, "tableWidth"),
      };
      const record: BrochureRecordInput = {
        clientId: brochureClientId,
        dimensions,
        generationId,
        imageModel: "openai/gpt-image-2",
        modelKey: model.id,
        modelName: model.name,
        params,
        promptVersion: "v4",
        referenceCount: 4,
        outputCount: BROCHURE_ASSET_KINDS.length,
      };
      try {
        await brochurePersistence?.create(record);
        const uploads = await brochurePersistence?.createUploadUrls([
          ...BROCHURE_ASSET_KINDS,
        ]);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const images = await viewer.captureBrochureViews();
        const result = await requestDiningTableBrochure({
          clientId: brochureClientId,
          generationId,
          images,
          model,
          params,
          signal: controller.signal,
          uploads,
        });
        if (brochureRequestRef.current !== requestId) return;

        if (!brochurePersistence) {
          const assets: BrochureAsset[] = result.assets.map((asset) => ({
            kind: asset.kind as BrochureAssetKind,
            imageUrl: asset.imageDataUrl!,
            mediaType: asset.mediaType!,
          }));
          setBrochureState({
            status: "success",
            assets,
            dimensions,
            generationId,
            saved: false,
            saveError: "brochure storage is unavailable",
          });
          return;
        }
        const storedAssets: StoredBrochureAsset[] = result.assets.map(
          (asset) => ({
            kind: asset.kind as BrochureAssetKind,
            storageId: "storageId" in asset ? asset.storageId! : "",
            mediaType: asset.mediaType!,
          }),
        );
        const pendingSave: PendingBrochureSave = {
          assets: storedAssets,
          record: { ...record, imageModel: result.model },
          warnings: result.warnings,
        };
        brochurePendingSaveRef.current = pendingSave;
        setBrochureState({ status: "saving" });
        const saved = await brochurePersistence.complete({
          assets: storedAssets,
          clientId: brochureClientId,
          generationId,
          warnings: result.warnings,
        });
        if (brochureRequestRef.current !== requestId) return;
        const url = new URL(window.location.href);
        url.searchParams.set("brochure", generationId);
        window.history.replaceState(null, "", url);
        brochurePendingSaveRef.current = null;
        setBrochureState({
          status: "success",
          assets: saved.assets,
          dimensions,
          generationId,
          saved: true,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (brochureRequestRef.current === requestId) {
          const message =
            error instanceof Error
              ? error.message
              : "Brochure generation failed. Please try again.";
          const pendingSave = brochurePendingSaveRef.current;
          if (pendingSave?.record.generationId === generationId) {
            setBrochureState({
              status: "error",
              message: `The images were created but could not be added to Brochures: ${message}`,
              retrySave: true,
            });
          } else {
            setBrochureState({ status: "error", message });
            void brochurePersistence?.fail({
              clientId: brochureClientId,
              errorMessage: message,
              generationId,
            });
          }
        }
      }
    })();
  };

  const retryBrochureSave = () => {
    const pendingSave = brochurePendingSaveRef.current;
    if (!pendingSave || !brochurePersistence) return;
    const requestId = brochureRequestRef.current;
    setBrochureState({ status: "saving" });
    void (async () => {
      try {
        await brochurePersistence.create(pendingSave.record);
        const saved = await brochurePersistence.complete({
          assets: pendingSave.assets,
          clientId: brochureClientId,
          generationId: pendingSave.record.generationId,
          warnings: pendingSave.warnings,
        });
        if (brochureRequestRef.current !== requestId) return;
        const url = new URL(window.location.href);
        url.searchParams.set("brochure", pendingSave.record.generationId);
        window.history.replaceState(null, "", url);
        brochurePendingSaveRef.current = null;
        setBrochureState({
          status: "success",
          assets: saved.assets,
          dimensions: pendingSave.record.dimensions,
          generationId: pendingSave.record.generationId,
          saved: true,
        });
      } catch (error) {
        if (brochureRequestRef.current !== requestId) return;
        setBrochureState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Unable to save brochure.",
          retrySave: true,
        });
      }
    })();
  };

  useEffect(() => {
    if (assemblyMode !== "brochure") {
      brochureAbortRef.current?.abort();
      brochureRequestRef.current += 1;
    }
  }, [assemblyMode]);

  useEffect(
    () => () => {
      brochureAbortRef.current?.abort();
    },
    [],
  );

  const changeHoverAssemblyMode = (nextMode: AssemblyMode) => {
    if (nextMode === "brochure") {
      startBrochureGeneration();
      return;
    }
    setAssemblyMode(nextMode);
  };

  const leaveBrochure = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("brochure");
    window.history.replaceState(null, "", url);
    setAssemblyMode(
      model?.viewer === "hover-dining-table-v1" ? "assembled" : "box",
    );
  };

  const updateParam = (key: string, value: number) => {
    if (!model) {
      return;
    }
    setParams((current) => {
      if (!current) {
        return current;
      }
      const limits =
        model.viewer === "hover-dining-table-v1"
          ? getHoverSyncedParameterLimits(model, current, key)
          : getParameterLimits(model, current, key);
      let nextValue = Math.min(limits.max, Math.max(limits.min, value));
      if (model.id === "wave-dining-table" && key === "bottomSupportStyle") {
        nextValue = 2;
      }
      if (
        model.viewer === "simple-box-v1" &&
        current.gridfinityCompatible >= 0.5 &&
        (key === "length" || key === "width")
      ) {
        nextValue = snapGridfinityDimension(
          nextValue,
          limits.min,
          limits.max,
          model.geometry.gridfinityGridSize,
        );
      }
      const next = {
        ...current,
        [key]: Number(
          nextValue.toFixed(
            CURVE_PARAM_KEYS.has(key) ? 3 : 1,
          ),
        ),
      };
      if (
        model.id === "whisperer" &&
        key === "levelingFeetEnabled" &&
        next.levelingFeetEnabled >= 0.5
      ) {
        for (const footKey of [
          "levelingFootPadThickness",
          "levelingFootRodDiameter",
          "levelingFootExtension",
          "levelingFootRodLength",
          "levelingFootExtension",
        ]) {
          const footLimits = getParameterLimits(model, next, footKey);
          next[footKey] = clamp(
            next[footKey],
            footLimits.min,
            footLimits.max,
          );
        }
      }
      if (model.viewer === "hover-dining-table-v1") {
        if (key === "levelingFeetEnabled" && next.levelingFeetEnabled >= 0.5) {
          const radiusLimits = getParameterLimits(
            model,
            next,
            "frameOuterBottomCornerRadius",
          );
          next.frameOuterBottomCornerRadius = clamp(
            next.frameOuterBottomCornerRadius,
            radiusLimits.min,
            radiusLimits.max,
          );
          const extensionLimits = getParameterLimits(
            model,
            next,
            "levelingFootExtension",
          );
          next.levelingFootExtension = clamp(
            next.levelingFootExtension,
            extensionLimits.min,
            extensionLimits.max,
          );
        }
        const syncPair = getHoverSupportSyncPair(key);
        if (syncPair && isHoverCrossbarSyncActive(next)) {
          const partnerKey = syncPair[0] === key ? syncPair[1] : syncPair[0];
          next[partnerKey] = next[key];
        }
        if (key === "frameSideWidth") {
          const roundoverLimits = getParameterLimits(
            model,
            next,
            "frameEdgeRoundover",
          );
          next.frameEdgeRoundover = clamp(
            current.frameEdgeRoundover,
            roundoverLimits.min,
            roundoverLimits.max,
          );
        } else if (
          key === "topSupportThickness" ||
          (syncPair?.[0] === "topSupportThickness" &&
            isHoverCrossbarSyncActive(next))
        ) {
          next.frameTopRailHeight = Math.max(
            current.frameTopRailHeight,
            next.topSupportThickness,
          );
        }
        if (
          key === "bottomSupportThickness" ||
          (syncPair?.[1] === "bottomSupportThickness" &&
            isHoverCrossbarSyncActive(next))
        ) {
          next.frameBottomRailHeight = Math.max(
            current.frameBottomRailHeight,
            next.bottomSupportThickness,
          );
        }
        if (
          key === "syncCrossbarDimensions" ||
          key === "topSupportStyle" ||
          key === "bottomSupportStyle"
        ) {
          if (key === "topSupportStyle" || key === "bottomSupportStyle") {
            const radiusKeys =
              key === "topSupportStyle"
                ? ["topSupportEdgeRadius"]
                : ["bottomSupportEdgeRadius", "bottomSupportTopEdgeRadius"];
            for (const radiusKey of radiusKeys) {
              const radiusLimits = getParameterLimits(model, next, radiusKey);
              next[radiusKey] = clamp(
                next[radiusKey],
                radiusLimits.min,
                radiusLimits.max,
              );
            }
          }
          return synchronizeHoverCrossbarDimensions(model, next);
        }
      }
      return next;
    });
  };

  const setGridfinityCompatible = (checked: boolean) => {
    if (!model || model.viewer !== "simple-box-v1") return;
    setParams((current) => {
      if (!current) return current;
      if (!checked) {
        return { ...current, gridfinityCompatible: 0 };
      }
      const lengthLimits = getParameterLimits(model, current, "length");
      const widthLimits = getParameterLimits(model, current, "width");
      return {
        ...current,
        gridfinityCompatible: 1,
        length: snapGridfinityDimension(
          current.length,
          lengthLimits.min,
          lengthLimits.max,
          model.geometry.gridfinityGridSize,
        ),
        width: snapGridfinityDimension(
          current.width,
          widthLimits.min,
          widthLimits.max,
          model.geometry.gridfinityGridSize,
        ),
      };
    });
  };

  const addDivider = () => {
    setParams((current) => {
      if (!current) return current;
      const count = Math.min(4, Math.round(current.dividerCount ?? 0));
      if (count >= 4) return current;
      const previousPosition = count > 0 ? current[`dividerPosition${count}`] : 0;
      const suggestedPosition = Math.min(
        current.length - 5,
        Math.max(5, previousPosition + (count > 0 ? 25.4 : current.length / 2)),
      );
      return {
        ...current,
        dividerCount: count + 1,
        [`dividerPosition${count + 1}`]: Number(suggestedPosition.toFixed(1)),
      };
    });
  };

  const removeDivider = (index: number) => {
    setParams((current) => {
      if (!current) return current;
      const count = Math.round(current.dividerCount ?? 0);
      const next: ModelParams = {
        ...current,
        dividerCount: Math.max(0, count - 1),
      };
      for (let slot = index + 1; slot < count; slot += 1) {
        next[`dividerPosition${slot}`] = current[`dividerPosition${slot + 1}`];
      }
      return next;
    });
  };

  const resetParams = () => {
    if (model) {
      setParams(getDefaultParams(model));
    }
  };

  const openModel = (modelId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", modelId);
    url.searchParams.set("unit", unit);
    url.searchParams.delete("theme");
    url.searchParams.delete("brochure");
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);

    setActiveVersionId(null);
    setActiveVersionTitle(null);
    setLoadError("");
    setModel(null);
    setParams(null);
    setSelectedModelId(modelId);
  };

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  const openLibraryVersion = (version: SavedLibraryVersion) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", version.modelKey);
    url.searchParams.set("unit", version.unit);
    url.searchParams.delete("theme");
    url.searchParams.delete("brochure");
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    for (const [key, value] of Object.entries(version.params)) {
      if (Number.isFinite(value)) {
        url.searchParams.set(key, serializeUrlParam(key, value, version.unit));
      }
    }
    window.history.replaceState(null, "", url);

    setUnit(version.unit);
    setActiveVersionId(version._id);
    setActiveVersionTitle(version.title);

    if (model?.id === version.modelKey) {
      const nextParams = getDefaultParams(model);
      for (const parameter of model.parameters) {
        const value = version.params[parameter.key];
        if (Number.isFinite(value)) {
          nextParams[parameter.key] = clamp(
            value,
            parameter.limits.min,
            parameter.limits.max,
          );
        }
      }
      setParams(nextParams);
    }

    setSelectedModelId(version.modelKey);
  };

  const openSavedBrochure = (brochure: SavedBrochure) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", brochure.modelKey);
    url.searchParams.set("brochure", brochure.generationId);
    window.history.replaceState(null, "", url);
    brochurePendingSaveRef.current = null;
    setAssemblyMode("brochure");
    setBrochureState({
      status: "success",
      assets: brochure.assets,
      dimensions: brochure.dimensions,
      generationId: brochure.generationId,
      saved: true,
    });
    setIsCompactLibraryOpen(false);
  };

  const handleSavedVersion = (versionId: Id<"versions">, title: string) => {
    setActiveVersionId(versionId);
    setActiveVersionTitle(title);
  };

  const resizeSidebarBy = (delta: number) => {
    setInspectorWidth((currentWidth) =>
      clamp(
        currentWidth + delta,
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
      ),
    );
  };

  const resizeLibrarySidebarBy = (delta: number) => {
    setLibrarySidebarWidth((currentWidth) =>
      clamp(
        currentWidth + delta,
        LIBRARY_SIDEBAR_MIN_WIDTH,
        LIBRARY_SIDEBAR_MAX_WIDTH,
      ),
    );
  };

  const startLibrarySidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const resize = (pointerEvent: PointerEvent) => {
      setLibrarySidebarWidth(
        clamp(
          pointerEvent.clientX,
          LIBRARY_SIDEBAR_MIN_WIDTH,
          LIBRARY_SIDEBAR_MAX_WIDTH,
        ),
      );
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("is-resizing-sidebar");
    };

    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const resize = (pointerEvent: PointerEvent) => {
      setInspectorWidth(
        clamp(
          window.innerWidth - pointerEvent.clientX,
          SIDEBAR_MIN_WIDTH,
          SIDEBAR_MAX_WIDTH,
        ),
      );
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("is-resizing-sidebar");
    };

    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  };

  if (loadError) {
    return <LoadingShell message={loadError} />;
  }

  if (!catalog) {
    return <LoadingShell message="Loading woodworking library" />;
  }

  if (!model || !params) {
    return <LoadingShell message="Loading model" />;
  }

  return (
    <main
      className="workspace-shell"
      style={
        {
          "--inspector-width": `${inspectorWidth}px`,
          "--inspector-panel-width": `${
            isInspectorCollapsed ? INSPECTOR_COLLAPSED_WIDTH : inspectorWidth
          }px`,
          "--library-sidebar-width": `${
            isLibrarySidebarCollapsed
              ? LIBRARY_SIDEBAR_COLLAPSED_WIDTH
              : librarySidebarWidth
          }px`,
        } as CSSProperties
      }
    >
      <WorkspaceHeader
        activeVersionId={activeVersionId}
        activeVersionTitle={activeVersionTitle}
        convexEnabled={convexEnabled}
        exportFileName={getExportFileName(model, params)}
        model={model}
        onCreateStlBlob={() => viewerRef.current?.getStlBlob() ?? null}
        onExport={() => viewerRef.current?.exportStl()}
        onExportLid={() => viewerRef.current?.exportLidStl()}
        onExportBoxAndLid={() => viewerRef.current?.exportBoxAndLidStl()}
        onExportHoverTemplates={() =>
          viewerRef.current?.exportHoverTemplateStls()
        }
        onRenderModeChange={setRenderMode}
        onRenderQualityChange={setRenderQuality}
        onSavedVersion={handleSavedVersion}
        onShowOriginalChange={setShowOriginal}
        onThemeChange={updateTheme}
        onOpenNavigation={() => setIsCompactLibraryOpen(true)}
        params={params}
        renderMode={renderMode}
        renderQuality={renderQuality}
        showNavigationTrigger={isCompactWorkspace}
        showOriginal={showOriginal}
        theme={theme}
        unit={unit}
      />

      <div className="app-shell">
        {isCompactWorkspace && isCompactLibraryOpen ? (
          <button
            aria-label="Close workspace navigation"
            className="workspace-library-drawer-mask"
            onClick={() => setIsCompactLibraryOpen(false)}
            type="button"
          />
        ) : null}
        <WorkspaceLibrarySidebar
          activeSection={activeLibrarySection}
          activeVersionId={activeVersionId}
          brochures={savedBrochures}
          catalogModels={catalogSeedModels}
          convexEnabled={convexEnabled}
          designChecks={
            (model.viewer === "dining-table-v1" ||
              model.viewer === "hover-dining-table-v1") ? (
              <HoverDesignChecks
                auditExpanded={isAuditExpanded}
                auditItems={auditItems}
                idPrefix="sidebar-design-checks"
                modelId={model.id}
                modelViewer={model.viewer}
                onAuditToggle={() =>
                  setIsAuditExpanded((current) => !current)
                }
                onStructureToggle={() =>
                  setIsStructureExpanded((current) => !current)
                }
                params={params}
                structureExpanded={isStructureExpanded}
                unit={unit}
              />
            ) : null
          }
          isBrochureOpen={assemblyMode === "brochure"}
          isCollapsed={isCompactWorkspace ? false : isLibrarySidebarCollapsed}
          isCompactOpen={isCompactWorkspace && isCompactLibraryOpen}
          selectedModelId={selectedModelId}
          theme={theme}
          onGenerateBrochure={
            model.viewer === "hover-dining-table-v1" ||
            model.viewer === "dining-table-v1"
              ? () => {
                  setIsCompactLibraryOpen(false);
                  startBrochureGeneration();
                }
              : undefined
          }
          onOpenModel={openModel}
          onOpenBrochure={openSavedBrochure}
          onOpenVersion={openLibraryVersion}
          onSectionChange={setActiveLibrarySection}
          onToggleCollapsed={() =>
            isCompactWorkspace
              ? setIsCompactLibraryOpen(false)
              : setIsLibrarySidebarCollapsed((current) => !current)
          }
        />

        {!isLibrarySidebarCollapsed && !isCompactWorkspace ? (
          <div
            aria-label="Resize model library"
            aria-orientation="vertical"
            aria-valuemax={LIBRARY_SIDEBAR_MAX_WIDTH}
            aria-valuemin={LIBRARY_SIDEBAR_MIN_WIDTH}
            aria-valuenow={librarySidebarWidth}
            className="sidebar-resizer library-resizer"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                resizeLibrarySidebarBy(-20);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                resizeLibrarySidebarBy(20);
              } else if (event.key === "Home") {
                event.preventDefault();
                setLibrarySidebarWidth(LIBRARY_SIDEBAR_MIN_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setLibrarySidebarWidth(LIBRARY_SIDEBAR_MAX_WIDTH);
              }
            }}
            onPointerDown={startLibrarySidebarResize}
            role="separator"
            tabIndex={0}
          />
        ) : null}

        <section
          className="scene-panel"
          aria-label={`${model.name} model viewer`}
        >
          <HolderViewer
            assemblyMode={assemblyMode}
            coreViewMode={coreViewMode}
            key={model.id}
            model={model}
            onResetParams={resetParams}
            onTrayRotationChange={(value) => updateParam("rotation", value)}
            params={params}
            ref={viewerRef}
            renderMode={renderMode}
            renderQuality={renderQuality}
            showOriginal={showOriginal}
            theme={theme}
            unit={unit}
          />
          {(model.viewer === "hover-dining-table-v1" ||
            model.viewer === "dining-table-v1") &&
          assemblyMode === "brochure" ? (
            <HoverBrochurePanel
              modelName={model.name}
              onBack={leaveBrochure}
              onRegenerate={startBrochureGeneration}
              onRetrySave={retryBrochureSave}
              state={brochureState}
            />
          ) : null}
        </section>

        {!isInspectorCollapsed ? (
          <div
            aria-label="Resize inspector"
            aria-orientation="vertical"
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuenow={inspectorWidth}
            className="sidebar-resizer inspector-resizer"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                resizeSidebarBy(20);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                resizeSidebarBy(-20);
              } else if (event.key === "Home") {
                event.preventDefault();
                setInspectorWidth(SIDEBAR_MAX_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setInspectorWidth(SIDEBAR_MIN_WIDTH);
              }
            }}
            onPointerDown={startSidebarResize}
            role="separator"
            tabIndex={0}
          />
        ) : null}

        <aside
          className={`inspector${isInspectorCollapsed ? " collapsed" : ""}`}
          aria-label="Parameters and audit"
          data-mobile-section={
            model.viewer === "hover-dining-table-v1"
              ? mobileInspectorSection
              : undefined
          }
        >
          {isInspectorCollapsed ? (
            <button
              aria-label="Expand inspector"
              className="inspector-collapse-button"
              onClick={() => setIsInspectorCollapsed(false)}
              title="Expand inspector"
              type="button"
            >
              <PanelRightOpen aria-hidden="true" />
            </button>
          ) : (
            <>
              <header className="inspector-header">
                <div>
                  {model.viewer === "hover-dining-table-v1" ? null : (
                    <p>Model controls</p>
                  )}
                  <h2>Inspector</h2>
                </div>
                <button
                  aria-label="Collapse inspector"
                  className="inspector-collapse-button"
                  onClick={() => setIsInspectorCollapsed(true)}
                  title="Collapse inspector"
                  type="button"
                >
                  <PanelRightClose aria-hidden="true" />
                </button>
              </header>

              {model.viewer === "hover-dining-table-v1" &&
              isMobileWorkspace ? (
                <nav
                  aria-label="Mobile inspector section"
                  className="mobile-workspace-tabs"
                >
                  {(
                    [
                      ["assembly", "Assembly"],
                      ["parameters", "Parameters"],
                      ["checks", "Checks"],
                    ] as const
                  ).map(([section, label]) => (
                    <button
                      aria-pressed={mobileInspectorSection === section}
                      className={
                        mobileInspectorSection === section ? "active" : ""
                      }
                      key={section}
                      onClick={() => setMobileInspectorSection(section)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              ) : null}

              <div className="inspector-body">
                {model.viewer === "hover-dining-table-v1" ? (
                  <section className="panel-section assembly-panel-section">
                    <h2>Assembly</h2>
                    <HoverAssemblyControl
                      onChange={changeHoverAssemblyMode}
                      value={assemblyMode}
                    />
                    <p className="assembly-mode-note">
                      Switch between the assembled model, all{" "}
                      {getHoverDiningTablePieceCount(params)} pieces, the
                      full-size cut sheet, and routing templates.
                    </p>
                  </section>
                ) : null}

                <section className="panel-section model-controls-panel-section">
                  <h2>
                    {model.viewer === "hover-dining-table-v1"
                      ? "Model controls"
                      : "Parameters"}
                  </h2>
                  {model.viewer === "dining-table-v1" ? (
                    <>
                      <ScaleControl
                        limits={getParameterLimits(model, params, "mockScale")}
                        onChange={(value) => updateParam("mockScale", value)}
                        value={getParam(params, "mockScale")}
                      />
                      {model.id === "whisperer" ? (
                        <OriginalOverlayToggle
                          checked={getParam(params, "levelingFeetEnabled") >= 0.5}
                          label="Use independent leveling feet"
                          onChange={(checked) =>
                            updateParam("levelingFeetEnabled", checked ? 1 : 0)
                          }
                        />
                      ) : null}
                      {Number.isFinite(params.legGrooveEnabled) ? (
                        <PostGrooveToggle
                          checked={params.legGrooveEnabled >= 0.5}
                          onChange={(checked) =>
                            updateParam("legGrooveEnabled", checked ? 1 : 0)
                          }
                        />
                      ) : null}
                      {Number.isFinite(params.levelingFeetEnabled) ? (
                        <PlateLevelingFeetToggle
                          checked={params.levelingFeetEnabled >= 0.5}
                          onChange={(checked) =>
                            updateParam("levelingFeetEnabled", checked ? 1 : 0)
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                  {model.viewer === "hover-dining-table-v1" ? (
                    <HoverDiningTableParameterControls
                      model={model}
                      onChange={updateParam}
                      onUnitChange={setUnit}
                      params={params}
                      unit={unit}
                    />
                  ) : model.parameters
                    .filter((parameter) => {
                      if (
                        model.viewer === "dining-table-v1" &&
                        Number.isFinite(params.legGrooveEnabled) &&
                        params.legGrooveEnabled < 0.5 &&
                        LEG_GROOVE_PARAM_KEYS.has(parameter.key)
                      ) {
                        return false;
                      }
                      if (
                        model.viewer === "dining-table-v1" &&
                        Number.isFinite(params.levelingFeetEnabled) &&
                        params.levelingFeetEnabled < 0.5 &&
                        PLATE_LEVELING_FOOT_PARAM_KEYS.has(parameter.key)
                      ) {
                        return false;
                      }
                      return (
                        parameter.key !== "mockScale" &&
                        !ANGLE_PARAM_KEYS.has(parameter.key) &&
                        !CURVE_PARAM_KEYS.has(parameter.key) &&
                        !DIVIDER_PARAM_KEYS.has(parameter.key) &&
                        !OPTION_PARAM_KEYS.has(parameter.key)
                      );
                    })
                    .map((parameter) => (
                      <NumberControl
                        key={parameter.key}
                        label={parameter.label}
                        limits={getParameterLimits(model, params, parameter.key)}
                        onChange={(value) => updateParam(parameter.key, value)}
                        onUnitChange={setUnit}
                        preferFineStep={parameter.key.endsWith("Clearance")}
                        unit={unit}
                        valueMm={params[parameter.key]}
                      />
                    ))}
                  {model.viewer === "simple-box-v1" ? (
                    <GridfinityToggle
                      checked={params.gridfinityCompatible >= 0.5}
                      lengthUnits={getGridfinityUnitCount(
                        params.length,
                        getParameterLimits(model, params, "length").min,
                        getParameterLimits(model, params, "length").max,
                        model.geometry.gridfinityGridSize,
                      )}
                      onChange={setGridfinityCompatible}
                      widthUnits={getGridfinityUnitCount(
                        params.width,
                        getParameterLimits(model, params, "width").min,
                        getParameterLimits(model, params, "width").max,
                        model.geometry.gridfinityGridSize,
                      )}
                    />
                  ) : null}
                  {model.viewer === "door-lock-adapter-v1" ? (
                    <AngleControl
                      label="Inner cutout rotation"
                      limits={getParameterLimits(
                        model,
                        params,
                        "cutoutRotation",
                      )}
                      onChange={(value) => updateParam("cutoutRotation", value)}
                      value={getParam(params, "cutoutRotation")}
                    />
                  ) : null}
                </section>

                {model.viewer === "simple-box-v1" ? (
                  <section className="panel-section">
                    <h2>Assembly proof</h2>
                    <AssemblyPreviewControl
                      onChange={setAssemblyMode}
                      value={assemblyMode}
                    />
                  </section>
                ) : null}

                {model.viewer === "simple-box-v1" ? (
                  <section className="panel-section">
                    <h2>Dividers</h2>
                    <DividerControls
                      model={model}
                      onAdd={addDivider}
                      onPositionChange={(index, value) =>
                        updateParam(`dividerPosition${index + 1}`, value)
                      }
                      onRemove={removeDivider}
                      onUnitChange={setUnit}
                      params={params}
                      unit={unit}
                    />
                  </section>
                ) : null}

                {model.viewer === "weighted-paper-towel-holder-v1" ? (
                  <section className="panel-section">
                    <h2>Weighted Center</h2>
                    <CoreViewControl
                      onChange={setCoreViewMode}
                      value={coreViewMode}
                    />
                  </section>
                ) : null}

                {(model.viewer === "dining-table-v1" ||
                  model.viewer === "hover-dining-table-v1") ? (
                  isCompactWorkspace ? (
                    <div className="inspector-design-checks">
                      <HoverDesignChecks
                        auditExpanded={isAuditExpanded}
                        auditItems={auditItems}
                        idPrefix="inspector-design-checks"
                        modelId={model.id}
                        modelViewer={model.viewer}
                        onAuditToggle={() =>
                          setIsAuditExpanded((current) => !current)
                        }
                        onStructureToggle={() =>
                          setIsStructureExpanded((current) => !current)
                        }
                        params={params}
                        structureExpanded={isStructureExpanded}
                        unit={unit}
                      />
                    </div>
                  ) : null
                ) : (
                  <CollapsiblePanelSection
                    expanded={isAuditExpanded}
                    id="inspector-audit"
                    onToggle={() => setIsAuditExpanded((current) => !current)}
                    title="Audit"
                  >
                    <AuditList items={auditItems} />
                  </CollapsiblePanelSection>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

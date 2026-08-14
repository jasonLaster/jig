import { formatLength } from "../units";
import {
  getHolderAuditValue,
  getHolderDimensions,
  getHolderParameterLimits,
} from "./paperTowelHolder";
import { getParam } from "./shared";
import {
  getTrayAuditValue,
  getTrayDimensions,
  getTrayParameterLimits,
} from "./japandiTray";
import {
  getDoorLockAdapterAuditValue,
  getDoorLockAdapterDimensions,
  getDoorLockAdapterParameterLimits,
} from "./doorLockAdapter";
import {
  getDiningTableAuditValue,
  getDiningTableDimensions,
  getDiningTableParameterLimits,
} from "./diningTable";
import {
  getHoverDiningTableAuditValue,
  getHoverDiningTableDimensions,
  getHoverDiningTableParameterLimits,
} from "./hoverDiningTable";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDefinition,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

export {
  applyHolderMorph,
  createRoundedTopGeometry,
  createSandChamberFloorGeometry,
  createSandPreviewGeometry,
  updateHolderGuide,
  updateWeightedCore,
} from "./paperTowelHolder";
export {
  applyTrayMorph,
  createGridfinityBaseGeometry,
  createTrayDividerGeometries,
  createTrayStackingLipGeometry,
  createSimpleBoxLidGeometries,
  createSimpleBoxLidPrintGeometries,
  updateTrayGuide,
  getGridfinityUnitCount,
  snapGridfinityDimension,
} from "./japandiTray";
export {
  createDoorLockAdapterGeometry,
  updateDoorLockAdapterGuide,
} from "./doorLockAdapter";
export {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDiningTableStructuralAssessment,
  updateDiningTableGuide,
} from "./diningTable";
export {
  assertHoverDiningTableSpec,
  createHoverDiningTableCutPartGeometry,
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  createHoverDiningTableHardwareGeometries,
  getHoverDiningTableEndBoxFabricationProfiles,
  getHoverDiningTableSpec,
  getHoverDiningTableStileFabricationLayout,
  getHoverDiningTableCutList,
  getHoverDiningTablePieceCount,
  getHoverDiningTableStructuralAssessment,
  updateHoverDiningTableGuide,
} from "./hoverDiningTable";
export type {
  HoverDiningTableStructuralAssessment,
  HoverDiningTableStructuralGrade,
  HoverDiningTableStructuralMetric,
} from "./hoverDiningTable";
export {
  createHoverDiningTableTemplateSegments,
  getHoverDiningTableTemplateSummary,
} from "./hoverDiningTableTemplates";
export {
  createVinnyTableHardwareGeometries,
  createVinnyTableWoodGeometry,
  getVinnyTableCutList,
  getVinnyTableFabricationSpec,
  getVinnyTableStructuralAssessment,
} from "./vinnyTable";
export type { VinnyCutPart } from "./vinnyTable";
export { getDefaultParams, getParam, getParameter } from "./shared";
export type {
  AuditItem,
  LengthUnit,
  ModelDefinition,
  ModelParameter,
  ModelParams,
  NumberLimits,
} from "./types";

function getAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: ModelDefinition,
): AuditItem {
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterAuditValue(check, params, unit, model);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableAuditValue(check, params, unit);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableAuditValue(check, params, unit);
  }

  if (model.viewer !== "weighted-paper-towel-holder-v1") {
    return getTrayAuditValue(check, params, unit, model);
  }

  return getHolderAuditValue(check, params, unit, model);
}

export function buildAuditItems(
  params: ModelParams,
  unit: LengthUnit,
  model: ModelDefinition,
): AuditItem[] {
  return model.audit.checks.map((check) =>
    getAuditValue(check, params, unit, model),
  );
}

export function getParameterLimits(
  model: ModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterParameterLimits(model, params, key);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableParameterLimits(model, params, key);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableParameterLimits(model, params, key);
  }

  if (model.viewer === "weighted-paper-towel-holder-v1") {
    return getHolderParameterLimits(model, params, key);
  }

  return getTrayParameterLimits(model, params, key);
}

export function getModelDimensions(
  model: ModelDefinition,
  params: ModelParams,
): ModelDimensions {
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterDimensions(params);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableDimensions(params);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableDimensions(params);
  }

  if (model.viewer === "weighted-paper-towel-holder-v1") {
    return getHolderDimensions(params);
  }

  return getTrayDimensions(params);
}

export function getStatusItems(
  model: ModelDefinition,
  params: ModelParams,
  unit: LengthUnit,
) {
  if (
    model.viewer === "dining-table-v1" ||
    model.viewer === "hover-dining-table-v1"
  ) {
    return [
      `Scale 1:${getParam(params, "mockScale").toFixed(0)}`,
      `Length ${formatLength(getParam(params, "tableLength"), unit)}`,
      `Width ${formatLength(getParam(params, "tableWidth"), unit)}`,
      `Height ${formatLength(getParam(params, "overallHeight"), unit)}`,
    ];
  }
  return model.parameters.slice(0, 4).map((parameter) => {
    const label = parameter.statusLabel ?? parameter.label;
    return `${label} ${formatLength(getParam(params, parameter.key), unit)}`;
  });
}

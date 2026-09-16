import { WOOD_FINISHES } from "../woodTexture";
import type { ModelParams } from "./types";

// Numeric choices are part of saved model/URL state; keep their order stable.
export function getVinnyFinishes(params: ModelParams) {
  const table = WOOD_FINISHES[params.tableWood] ?? WOOD_FINISHES[0];
  const groove = WOOD_FINISHES[params.grooveWood - 1] ?? table;
  return { table, groove };
}

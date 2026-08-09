import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";

export type BrochurePanelAssetKind =
  | "room-hero"
  | "room-alternate"
  | "table-three-quarter"
  | "table-profile";

export type BrochurePanelAsset = {
  kind: BrochurePanelAssetKind;
  imageUrl: string;
  mediaType: string;
};

export type BrochurePanelDimensions = {
  height: number;
  length: number;
  topThickness: number;
  width: number;
};

export type BrochureGenerationState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "saving" }
  | {
      status: "success";
      assets: BrochurePanelAsset[];
      dimensions: BrochurePanelDimensions;
      generationId: string;
      saved: boolean;
      saveError?: string;
    }
  | { status: "error"; message: string; retrySave?: boolean };

type HoverBrochurePanelProps = {
  modelName: string;
  onBack: () => void;
  onRegenerate: () => void;
  onRetrySave: () => void;
  state: BrochureGenerationState;
};

const ASSET_LABELS: Record<BrochurePanelAssetKind, string> = {
  "room-hero": "Room scene · hero",
  "room-alternate": "Room scene · alternate",
  "table-three-quarter": "Table only · three-quarter",
  "table-profile": "Table only · profile",
};

function formatInches(millimeters: number, precision = 1) {
  return `${Number((millimeters / 25.4).toFixed(precision))} in`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function HoverBrochurePanel({
  modelName,
  onBack,
  onRegenerate,
  onRetrySave,
  state,
}: HoverBrochurePanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const isGenerating =
    state.status === "generating" || state.status === "saving";
  const activeAsset =
    state.status === "success" ? state.assets[activeIndex] : undefined;

  useEffect(() => {
    setActiveIndex(0);
  }, [state.status === "success" ? state.generationId : state.status]);

  return (
    <section
      aria-busy={isGenerating}
      aria-label="AI brochure render"
      aria-live="polite"
      className="hover-brochure-panel"
      data-status={state.status}
      data-testid="hover-brochure-panel"
    >
      {state.status === "success" && activeAsset ? (
        <div className="hover-brochure-stage">
          <img
            alt={`${modelName} ${ASSET_LABELS[activeAsset.kind].toLowerCase()}`}
            className="hover-brochure-image"
            src={activeAsset.imageUrl}
          />
          <div className="hover-brochure-specification">
            <p>{ASSET_LABELS[activeAsset.kind]}</p>
            <h2>{modelName}</h2>
            <div aria-label="CAD dimensions" className="hover-brochure-dimensions">
              <span>
                <small>Length</small>
                <strong>{formatInches(state.dimensions.length)}</strong>
              </span>
              <span>
                <small>Width</small>
                <strong>{formatInches(state.dimensions.width)}</strong>
              </span>
              <span>
                <small>Height</small>
                <strong>{formatInches(state.dimensions.height)}</strong>
              </span>
              <span>
                <small>Top</small>
                <strong>{formatInches(state.dimensions.topThickness, 2)}</strong>
              </span>
            </div>
          </div>
          <div aria-label="Brochure views" className="hover-brochure-filmstrip">
            {state.assets.map((asset, index) => (
              <button
                aria-label={`Show ${ASSET_LABELS[asset.kind]}`}
                aria-pressed={index === activeIndex}
                key={asset.kind}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <img alt="" decoding="async" src={asset.imageUrl} />
                <span>{ASSET_LABELS[asset.kind]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="hover-brochure-backdrop" aria-hidden="true" />
      )}

      <div className="hover-brochure-toolbar">
        <button onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" />
          Back to model
        </button>
        {state.status === "success" && activeAsset ? (
          <>
            <span
              className={`hover-brochure-save-status${state.saved ? " saved" : " unsaved"}`}
            >
              {state.saved ? (
                <Check aria-hidden="true" />
              ) : (
                <CloudOff aria-hidden="true" />
              )}
              {state.saved ? "Saved" : "Not saved"}
            </span>
            {!state.saved ? (
              <button onClick={onRetrySave} type="button">
                <Save aria-hidden="true" />
                Save again
              </button>
            ) : null}
            <button onClick={onRegenerate} type="button">
              <RefreshCw aria-hidden="true" />
              Regenerate
            </button>
            <a
              download={`${slugify(modelName)}-${activeAsset.kind}.png`}
              href={activeAsset.imageUrl}
            >
              <Download aria-hidden="true" />
              Download view
            </a>
          </>
        ) : null}
      </div>

      {state.status === "idle" || state.status === "generating" ? (
        <div className="hover-brochure-message">
          <span className="hover-brochure-spark" aria-hidden="true">
            <Sparkles />
          </span>
          <p>Brochure mode</p>
          <h2>Creating four coordinated views</h2>
          <span>
            Using four CAD reference angles to generate two furnished room
            scenes and two table-only product photographs.
          </span>
          <div className="hover-brochure-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : null}

      {state.status === "saving" ? (
        <div className="hover-brochure-message saving">
          <span className="hover-brochure-spark" aria-hidden="true">
            <Save />
          </span>
          <p>Brochure ready</p>
          <h2>Saving four full-resolution views</h2>
          <span>
            Adding the room scenes, table-only photographs, and exact CAD
            dimensions to the brochure library.
          </span>
          <div className="hover-brochure-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="hover-brochure-message error" role="alert">
          <p>Brochure generation stopped</p>
          <h2>Unable to create the image set</h2>
          <span>{state.message}</span>
          <button
            onClick={state.retrySave ? onRetrySave : onRegenerate}
            type="button"
          >
            {state.retrySave ? <Save aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {state.retrySave ? "Save again" : "Try again"}
          </button>
        </div>
      ) : null}

      {state.status === "success" ? (
        <p className="hover-brochure-disclaimer">
          {state.saved
            ? "Saved to Brochures · "
            : `Not saved yet${state.saveError ? `: ${state.saveError}` : ""} · `}
          {state.assets.length} views · dimensions come from the authoritative
          CAD model.
        </p>
      ) : null}
    </section>
  );
}

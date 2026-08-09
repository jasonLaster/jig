import { useMutation } from "convex/react";
import {
  CloudOff,
  CopyPlus,
  Save,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type LengthUnit = "mm" | "cm" | "in";
type ThemeMode = "light" | "dark";
type ModelParams = Record<string, number>;

export type CatalogSeedModel = {
  key: string;
  name: string;
  configUrl: string;
  description?: string;
  publicStlUrl?: string;
  fileName?: string;
};

export type SavedLibraryVersion = {
  _id: Id<"versions">;
  modelKey: string;
  modelName: string;
  title: string;
  source: "save" | "fork";
  params: ModelParams;
  unit: LengthUnit;
  theme: ThemeMode;
  parentVersionId?: Id<"versions">;
  stlUrl?: string | null;
  fileName?: string;
  updatedAt: number;
};

type CurrentModel = {
  id: string;
  name: string;
};

type ModelSummary = {
  key: string;
  name: string;
  description?: string;
};

type SaveForkControlsProps = {
  activeVersionId: Id<"versions"> | null;
  currentModel: CurrentModel;
  exportFileName: string;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
};

const PERSISTENCE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. You can still open models and export STLs; saved versions will return when sync is healthy.";
const SAVE_OFFLINE_MESSAGE =
  "Library sync is temporarily unavailable. Your model is still editable; export an STL or try saving again shortly.";

function defaultTitle(modelName: string) {
  return `${modelName} ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(Date.now())}`;
}

function getModelTypeLabel(modelKey: string) {
  if (modelKey.includes("table") || modelKey === "whisperer") {
    return "Table";
  }
  return "Jig";
}

export function filterLibraryModels<T extends ModelSummary>(
  models: T[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return models;
  }
  return models.filter((model) =>
    [model.name, model.description ?? "", getModelTypeLabel(model.key)]
      .filter((value) => value.length > 0)
      .some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}

async function uploadBlob(
  generateUploadUrl: () => Promise<string>,
  blob: Blob,
) {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": blob.type || "model/stl" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Upload failed with ${response.status}`);
  }
  const result = (await response.json()) as { storageId: Id<"_storage"> };
  return result.storageId;
}

export function LibraryUnavailableMessage({
  children = PERSISTENCE_OFFLINE_MESSAGE,
}: {
  children?: ReactNode;
}) {
  return (
    <p className="library-note">
      <CloudOff aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function SaveForkControls({
  activeVersionId,
  currentModel,
  exportFileName,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onSavedVersion,
}: SaveForkControlsProps) {
  const generateUploadUrl = useMutation(api.library.generateUploadUrl);
  const saveVersion = useMutation(api.library.saveVersion);
  const forkVersion = useMutation(api.library.forkVersion);
  const [title, setTitle] = useState("");
  const [pendingSource, setPendingSource] = useState<"save" | "fork" | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "error">("neutral");
  const [isSaving, setIsSaving] = useState(false);

  const saveCurrent = async (source: "save" | "fork") => {
    const blob = onCreateStlBlob();
    if (!blob) {
      setStatus("Model is still loading.");
      setStatusTone("neutral");
      return;
    }

    const versionTitle = title.trim() || defaultTitle(currentModel.name);
    setIsSaving(true);
    setStatusTone("neutral");
    setStatus(source === "fork" ? "Forking..." : "Saving...");
    try {
      const stlStorageId = await uploadBlob(generateUploadUrl, blob);
      const versionId =
        source === "fork" && activeVersionId
          ? await forkVersion({
              versionId: activeVersionId,
              title: versionTitle,
              params,
              unit,
              theme,
              stlStorageId,
              fileName: exportFileName,
            })
          : await saveVersion({
              modelKey: currentModel.id,
              modelName: currentModel.name,
              title: versionTitle,
              params,
              unit,
              theme,
              stlStorageId,
              fileName: exportFileName,
              source,
            });
      onSavedVersion(versionId, versionTitle);
      setTitle("");
      setPendingSource(null);
      setStatus(source === "fork" ? "Fork saved." : "Version saved.");
      setStatusTone("neutral");
    } catch (error) {
      console.error(`Unable to ${source} library version.`, error);
      setStatus(SAVE_OFFLINE_MESSAGE);
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = pendingSource === "fork" ? "Fork version" : "Save version";

  return (
    <div className="save-fork-controls">
      <div className="version-command-group">
        {activeVersionId ? (
          <button
            aria-label="Save current version"
            disabled={isSaving}
            onClick={() => {
              setStatus("");
              setStatusTone("neutral");
              setTitle("");
              setPendingSource("save");
            }}
            type="button"
          >
            <Save aria-hidden="true" />
            Save
          </button>
        ) : null}
        <button
          aria-label="Fork current version"
          disabled={isSaving}
          onClick={() => {
            setStatus("");
            setStatusTone("neutral");
            setTitle("");
            setPendingSource("fork");
          }}
          type="button"
        >
          <CopyPlus aria-hidden="true" />
          Fork
        </button>
      </div>
      {status && !pendingSource ? (
        <span
          className={`save-status${statusTone === "error" ? " error" : ""}`}
          role="status"
        >
          {status}
        </span>
      ) : null}
      {pendingSource ? (
        <>
          <div
            aria-hidden="true"
            className="version-modal-backdrop"
            onMouseDown={() => {
              if (!isSaving) {
                setPendingSource(null);
              }
            }}
          />
          <form
            aria-label={modalTitle}
            aria-modal="true"
            className="version-modal"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !isSaving) {
                setPendingSource(null);
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCurrent(pendingSource);
            }}
            role="dialog"
          >
            <div className="version-modal-heading">
              <strong>{modalTitle}</strong>
              <span>{currentModel.name}</span>
            </div>
            <label className="version-field">
              <span>Name</span>
              <input
                aria-label="Version name"
                autoFocus
                className="version-name-input"
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder={defaultTitle(currentModel.name)}
                type="text"
                value={title}
              />
            </label>
            {status && (isSaving || statusTone === "error") ? (
              <span
                className={`save-status${statusTone === "error" ? " error" : ""}`}
                role="status"
              >
                {status}
              </span>
            ) : null}
            <div className="version-modal-actions">
              <button
                disabled={isSaving}
                onClick={() => setPendingSource(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={isSaving}
                type="submit"
              >
                {pendingSource === "fork" ? "Fork version" : "Save version"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}

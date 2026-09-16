import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function useFlyoverVideo(
  version: string,
  record: (signal: AbortSignal) => Promise<Blob>,
) {
  const [video, setVideo] = useState<{ url: string; blob: Blob } | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const revision = useRef(0);
  const active = useRef<AbortController | null>(null);
  const cached = useRef<typeof video>(null);

  useEffect(() => {
    setVideo(null);
    setState("idle");
    setError("");
    setPreviewOpen(false);
    return () => {
      revision.current++;
      active.current?.abort();
      active.current = null;
      if (cached.current) URL.revokeObjectURL(cached.current.url);
      cached.current = null;
    };
  }, [version]);

  const create = async (action: "preview" | "download", download: (blob: Blob) => void) => {
    if (active.current) return;
    const current = revision.current;
    setError("");
    try {
      let result = cached.current;
      if (!result) {
        const controller = new AbortController();
        active.current = controller;
        setState("recording");
        const blob = await record(controller.signal);
        if (revision.current !== current) return;
        result = { blob, url: URL.createObjectURL(blob) };
        cached.current = result;
        setVideo(result);
      }
      setState("done");
      if (action === "preview") setPreviewOpen(true);
      else download(result.blob);
    } catch (error) {
      if (revision.current !== current) return;
      setError(error instanceof Error ? error.message : String(error));
      setState("error");
    } finally {
      if (revision.current === current) active.current = null;
    }
  };
  return { video, state, error, previewOpen, setPreviewOpen, create };
}

export function FlyoverVideoDialog({
  url, modelName, onClose, onDownload,
}: {
  url: string;
  modelName: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="flyover-video-dialog"
      aria-label={`${modelName} flyover preview`}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flyover-video-heading">
        <h2>{modelName} flyover</h2>
        <button type="button" onClick={onClose} aria-label="Close preview">Close</button>
      </div>
      <video src={url} aria-label="Flyover video" controls autoPlay muted loop playsInline />
      <div className="flyover-video-actions">
        <span>8 seconds · 720p · 360° view</span>
        <button type="button" onClick={onDownload}>Download video</button>
      </div>
    </dialog>,
    document.body,
  );
}

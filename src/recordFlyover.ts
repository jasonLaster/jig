import * as THREE from "three";

const DURATION_MS = 8_000;
const FPS = 30;

/** Record an independent scene snapshot without moving the interactive camera. */
export async function recordFlyover(
  sourceScene: THREE.Scene,
  sourceRenderer: THREE.WebGLRenderer,
  dimensions: { length: number; width: number; height: number },
  modelId: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("Video downloads are not supported by this browser. Try Chrome or Edge.");
  }
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser cannot record a supported video format.");
  signal.throwIfAborted();

  const scene = sourceScene.clone();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  // Own the geometry and material state while retaining read-only texture images.
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry = object.geometry.clone();
      geometries.push(object.geometry);
      const cloneMaterial = (material: THREE.Material) => {
        const clone = material.clone();
        materials.push(clone);
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
    }
  });
  // A fabrication sheet can hide the assembled table in the interactive scene.
  scene.getObjectByName(`${modelId}-adjustable-body`)!.visible = true;
  const hardware = scene.getObjectByName(`${modelId}-hardware`);
  if (hardware) hardware.visible = true;
  scene.background ??= new THREE.Color("#15191f");

  let renderer: THREE.WebGLRenderer | undefined;
  let stream: MediaStream | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1280, 720);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = sourceRenderer.outputColorSpace;
    renderer.toneMapping = sourceRenderer.toneMapping;
    renderer.toneMappingExposure = sourceRenderer.toneMappingExposure;
    renderer.shadowMap.enabled = sourceRenderer.shadowMap.enabled;
    renderer.shadowMap.type = sourceRenderer.shadowMap.type;

    const target = new THREE.Vector3(0, 0, dimensions.height / 2);
    const radius = Math.hypot(dimensions.length, dimensions.width, dimensions.height) / 2;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(21)) * 1.12;
    const camera = new THREE.PerspectiveCamera(42, 1280 / 720, distance / 100, distance * 8);
    camera.up.set(0, 0, 1);
    const renderFrame = (progress: number) => {
      const angle = -Math.PI / 4 + progress * Math.PI * 2;
      const elevation = THREE.MathUtils.degToRad(28 + 12 * Math.sin(progress * Math.PI * 2));
      camera.position.set(
        target.x + Math.cos(angle) * Math.cos(elevation) * distance,
        target.y + Math.sin(angle) * Math.cos(elevation) * distance,
        target.z + Math.sin(elevation) * distance,
      );
      camera.lookAt(target);
      renderer!.render(scene, camera);
    };
    renderFrame(0);
    stream = renderer.domElement.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = [];
      let timer: ReturnType<typeof setTimeout>;
      let failure: Error | undefined;
      const stop = () => {
        clearTimeout(timer);
        if (recorder.state !== "inactive") recorder.stop();
      };
      const abort = () => {
        failure = new Error("Flyover cancelled because the model view changed. Try again.");
        stop();
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failure = new Error("The video could not be recorded. Please try again.");
        stop();
      };
      recorder.onstop = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        if (failure) reject(failure);
        else if (!blob.size) reject(new Error("The recording was empty. Please try again."));
        else resolve(blob);
      };
      recorder.start();
      signal.addEventListener("abort", abort, { once: true });
      const start = performance.now();
      const frame = () => {
        try {
          const progress = Math.min((performance.now() - start) / DURATION_MS, 1);
          renderFrame(progress);
          if (progress >= 1) stop();
          else timer = setTimeout(frame, 1_000 / FPS);
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          stop();
        }
      };
      frame();
    });
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight) {
        object.shadow.dispose();
      }
    });
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

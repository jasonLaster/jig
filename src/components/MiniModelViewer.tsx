import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  applyHolderMorph,
  applyTrayMorph,
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  createDoorLockAdapterGeometry,
  createHoverDiningTableGeometry,
  createHoverDiningTableHardwareGeometries,
  createRoundedTopGeometry,
  createSandChamberFloorGeometry,
  createTrayDividerGeometries,
  createTrayStackingLipGeometry,
  getDefaultParams,
  type ModelDefinition,
} from "../models";
import { getWoodSpeciesForModel } from "../woodTexture";

type ThemeMode = "light" | "dark";

type MiniModelViewerProps = {
  configUrl: string;
  modelKey: string;
  modelName: string;
  theme: ThemeMode;
};

const modelDefinitionRequests = new Map<
  string,
  Promise<ModelDefinition>
>();

function loadModelDefinition(configUrl: string) {
  const cached = modelDefinitionRequests.get(configUrl);
  if (cached) {
    return cached;
  }

  const request = fetch(configUrl).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Unable to load ${configUrl}`);
    }
    return (await response.json()) as ModelDefinition;
  });
  modelDefinitionRequests.set(configUrl, request);
  return request;
}

function materialColor(modelKey: string, theme: ThemeMode) {
  if (getWoodSpeciesForModel(modelKey) === "oak") {
    return "#b9824f";
  }
  if (modelKey === "paper-towel-holder") {
    return theme === "dark" ? "#8d97a8" : "#596273";
  }
  return theme === "dark" ? "#d7dde7" : "#aeb8c7";
}

function normalizeSourceGeometry(
  geometry: THREE.BufferGeometry,
  axis: { x: number; y: number; z?: number },
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute("position");
  const basePositions = new Float32Array(sourcePosition.count * 3);
  for (let index = 0; index < sourcePosition.count; index += 1) {
    basePositions[index * 3] = sourcePosition.getX(index) - axis.x;
    basePositions[index * 3 + 1] = sourcePosition.getY(index) - axis.y;
    basePositions[index * 3 + 2] =
      sourcePosition.getZ(index) - (axis.z ?? 0);
  }
  source.setAttribute(
    "position",
    new THREE.BufferAttribute(basePositions.slice(), 3),
  );
  source.computeVertexNormals();
  geometry.dispose();
  return { geometry: source, basePositions };
}

function createPreviewObject(
  definition: ModelDefinition,
  sourceGeometry: THREE.BufferGeometry,
  theme: ThemeMode,
) {
  const group = new THREE.Group();
  const params = getDefaultParams(definition);
  const isWoodFurniture = getWoodSpeciesForModel(definition.id) !== null;
  const mainMaterial = new THREE.MeshStandardMaterial({
    color: materialColor(definition.id, theme),
    metalness: isWoodFurniture ? 0 : 0.08,
    roughness: isWoodFurniture ? 0.72 : 0.64,
    side: THREE.DoubleSide,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: theme === "dark" ? "#343b47" : "#4a5361",
    metalness: 0.72,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });

  if (definition.viewer === "weighted-paper-towel-holder-v1") {
    const normalized = normalizeSourceGeometry(
      sourceGeometry,
      definition.geometry.mainAxis,
    );
    applyHolderMorph(
      normalized.geometry,
      normalized.basePositions,
      params,
      definition,
    );
    group.add(new THREE.Mesh(normalized.geometry, mainMaterial));
    group.add(
      new THREE.Mesh(
        createRoundedTopGeometry(params, definition),
        mainMaterial,
      ),
    );
    group.add(
      new THREE.Mesh(
        createSandChamberFloorGeometry(params, definition),
        mainMaterial,
      ),
    );
  } else if (
    definition.viewer === "japandi-tray-v1" ||
    definition.viewer === "simple-box-v1"
  ) {
    const normalized = normalizeSourceGeometry(
      sourceGeometry,
      definition.geometry.mainAxis,
    );
    applyTrayMorph(
      normalized.geometry,
      normalized.basePositions,
      params,
      definition,
    );
    group.add(new THREE.Mesh(normalized.geometry, mainMaterial));
    if (definition.viewer === "simple-box-v1") {
      group.add(
        new THREE.Mesh(
          createTrayStackingLipGeometry(params, definition),
          mainMaterial,
        ),
      );
      createTrayDividerGeometries(params, definition).forEach((geometry) => {
        group.add(new THREE.Mesh(geometry, mainMaterial));
      });
    }
  } else if (definition.viewer === "door-lock-adapter-v1") {
    sourceGeometry.dispose();
    group.add(
      new THREE.Mesh(
        createDoorLockAdapterGeometry(params, definition),
        mainMaterial,
      ),
    );
  } else if (definition.viewer === "dining-table-v1") {
    sourceGeometry.dispose();
    group.add(
      new THREE.Mesh(
        createDiningTableWoodGeometry(params, definition),
        mainMaterial,
      ),
    );
    const hardware = createDiningTableHardwareGeometries(params);
    [...hardware.plates, ...hardware.channels, ...hardware.feet].forEach((geometry) => {
      group.add(new THREE.Mesh(geometry, metalMaterial));
    });
  } else {
    sourceGeometry.dispose();
    group.add(
      new THREE.Mesh(
        createHoverDiningTableGeometry(params, definition),
        mainMaterial,
      ),
    );
    const hardware = createHoverDiningTableHardwareGeometries(params);
    [...hardware.channels, ...hardware.feet].forEach((geometry) => {
      group.add(new THREE.Mesh(geometry, metalMaterial));
    });
  }

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.sub(center);
  group.updateMatrixWorld(true);
  return group;
}

export function MiniModelViewer({
  configUrl,
  modelKey,
  modelName,
  theme,
}: MiniModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const initialViewRef = useRef<
    { position: THREE.Vector3; target: THREE.Vector3 } | null
  >(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "96px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isVisible) {
      return undefined;
    }

    setLoadState("loading");
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.tabIndex = -1;
    container.append(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 10000;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#ffffff", "#667085", 2.3));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.8);
    keyLight.position.set(2, -3, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(
      theme === "dark" ? "#8eb9ff" : "#dbeafe",
      1.1,
    );
    rimLight.position.set(-3, 2, 2);
    scene.add(rimLight);

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    controls.addEventListener("change", render);

    let disposed = false;
    const loader = new STLLoader();
    void loadModelDefinition(configUrl)
      .then(async (definition) => ({
        definition,
        geometry: await loader.loadAsync(definition.stl.url),
      }))
      .then(({ definition, geometry }) => {
        if (disposed) {
          geometry.dispose();
          return;
        }

        const previewObject = createPreviewObject(definition, geometry, theme);
        scene.add(previewObject);
        const bounds = new THREE.Box3().setFromObject(previewObject);
        const boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
        if (boundingSphere.isEmpty()) {
          throw new Error(`No geometry bounds for ${modelName}`);
        }

        const radius = Math.max(boundingSphere.radius, 0.01);
        const target = new THREE.Vector3(0, 0, 0);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
        const direction = new THREE.Vector3(1.15, -1.35, 0.92).normalize();
        camera.near = Math.max(radius / 100, 0.01);
        camera.far = distance * 8;
        camera.position.copy(direction.multiplyScalar(distance * 1.18));
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        controls.target.copy(target);
        controls.minDistance = radius * 1.15;
        controls.maxDistance = radius * 8;
        controls.update();
        initialViewRef.current = {
          position: camera.position.clone(),
          target: target.clone(),
        };
        setLoadState("ready");
        render();
      })
      .catch((error) => {
        if (!disposed) {
          console.error(`Unable to load mini viewer for ${modelName}.`, error);
          setLoadState("error");
        }
      });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      cameraRef.current = null;
      controlsRef.current = null;
      renderRef.current = null;
      initialViewRef.current = null;
    };
  }, [configUrl, isVisible, modelKey, modelName, theme]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const rotationStep = Math.PI / 18;
    const offset = camera.position.clone().sub(controls.target);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      offset.applyAxisAngle(
        new THREE.Vector3(0, 0, 1),
        event.key === "ArrowLeft" ? rotationStep : -rotationStep,
      );
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      offset.multiplyScalar(0.88);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      offset.multiplyScalar(1.14);
    } else if (event.key === "Home") {
      event.preventDefault();
      const initialView = initialViewRef.current;
      if (initialView) {
        camera.position.copy(initialView.position);
        controls.target.copy(initialView.target);
      }
    } else {
      return;
    }

    camera.position.copy(controls.target).add(offset);
    controls.update();
    renderRef.current?.();
  };

  return (
    <div
      aria-label={`3D preview of ${modelName}. Drag to rotate, scroll to zoom, or use left and right arrow keys.`}
      className="mini-model-viewer"
      data-load-state={loadState}
      data-testid={`model-preview-${modelKey}`}
      onKeyDown={handleKeyDown}
      ref={containerRef}
      role="group"
      tabIndex={0}
      title="Drag to rotate · Scroll to zoom"
    >
      {loadState === "loading" ? (
        <span className="mini-model-viewer-status">Loading 3D</span>
      ) : loadState === "error" ? (
        <span className="mini-model-viewer-status">3D unavailable</span>
      ) : null}
    </div>
  );
}

import * as THREE from "three";

const GRAIN_EPSILON = 1e-6;

export type WoodGrainPart = {
  direction: [number, number, number];
  name: string;
  vertexCount: number;
  vertexStart: number;
};

function fallbackFaceAxis(normal: THREE.Vector3) {
  const reference =
    Math.abs(normal.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  return reference.cross(normal).normalize();
}

/**
 * Maps the texture's horizontal axis onto the board's longitudinal grain.
 * Each triangle gets a face-local projection so grain continues correctly
 * around the top, side, bevel, and end faces of a solid wood member.
 */
export function assignDirectionalWoodUvs(
  geometry: THREE.BufferGeometry,
  grainDirection: THREE.Vector3,
  textureSize: number,
  partName?: string,
) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const grain = grainDirection.clone().normalize();
  const resolvedTextureSize = Math.max(textureSize, GRAIN_EPSILON);
  const uvs = new Float32Array(position.count * 2);
  const point = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const grainOnFace = new THREE.Vector3();
  const acrossGrain = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    faceNormal.fromBufferAttribute(normal, index).normalize();
    grainOnFace
      .copy(grain)
      .addScaledVector(faceNormal, -grain.dot(faceNormal));
    if (grainOnFace.lengthSq() <= GRAIN_EPSILON) {
      grainOnFace.copy(fallbackFaceAxis(faceNormal));
    } else {
      grainOnFace.normalize();
    }
    acrossGrain.crossVectors(faceNormal, grainOnFace).normalize();

    uvs[index * 2] = point.dot(grainOnFace) / resolvedTextureSize;
    uvs[index * 2 + 1] = point.dot(acrossGrain) / resolvedTextureSize;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const direction = grain.toArray() as [number, number, number];
  geometry.userData.woodGrainDirection = direction;
  if (partName) {
    geometry.userData.woodGrainParts = [
      {
        direction,
        name: partName,
        vertexCount: position.count,
        vertexStart: 0,
      } satisfies WoodGrainPart,
    ];
  }
}

/** Carries member-level grain metadata through a non-indexed geometry merge. */
export function collectWoodGrainParts(
  geometries: THREE.BufferGeometry[],
): WoodGrainPart[] {
  const parts: WoodGrainPart[] = [];
  let vertexOffset = 0;

  for (const geometry of geometries) {
    const vertexCount = geometry.getAttribute("position").count;
    const sourceParts = geometry.userData.woodGrainParts as
      | WoodGrainPart[]
      | undefined;
    if (sourceParts) {
      parts.push(
        ...sourceParts.map((part) => ({
          ...part,
          direction: [...part.direction] as [number, number, number],
          vertexStart: vertexOffset + part.vertexStart,
        })),
      );
    }
    vertexOffset += vertexCount;
  }

  return parts;
}

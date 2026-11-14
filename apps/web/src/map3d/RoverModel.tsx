/**
 * RoverModel.tsx - Lazily loaded 3D NASA Curiosity rover model aligned to terrain normal.
 * 
 * - Model: Official NASA MSL Curiosity model (/models/curiosity.glb, 51,305 triangles).
 * - Alignment: Aligned to local terrain surface normal.
 * - Centering: Automatically centered on bounding box and bottom-grounded.
 * - Fallback: Elegant Mars ochre beacon pin & ground ring if model is loading or unavailable.
 * - Disposal: Traverses and disposes all geometries and materials on unmount.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Vector3,
  Quaternion,
  Box3,
  Group,
  Mesh,
  CylinderGeometry,
  RingGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface RoverModelProps {
  /** 3D scene position (metres) on terrain surface */
  position: Vector3;
  /** Terrain surface normal vector */
  normal?: Vector3;
  /** Fallback beacon color (defaults to Mars ochre #E06A3B) */
  color?: string;
  /** Custom model URL (defaults to /models/curiosity.glb) */
  modelUrl?: string;
  /** Scale factor (model is in metres, default 1.0) */
  scale?: number;
}

export function RoverModel({
  position,
  normal,
  color = "#E06A3B",
  modelUrl = "/models/curiosity.glb",
  scale = 1.0,
}: RoverModelProps) {
  const [modelGroup, setModelGroup] = useState<Group | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const rootRef = useRef<Group>(null);

  // Compute quaternion from Up [0, 1, 0] to local terrain normal
  const rotationQuaternion = useMemo(() => {
    if (!normal) return undefined;
    const up = new Vector3(0, 1, 0);
    const n = normal.clone().normalize();
    return new Quaternion().setFromUnitVectors(up, n);
  }, [normal]);

  // Geometries and materials for fallback beacon
  const pinGeo = useMemo(() => new CylinderGeometry(1.5, 1.5, 30, 16), []);
  const pinMat = useMemo(() => new MeshBasicMaterial({ color }), [color]);
  const ringGeo = useMemo(() => new RingGeometry(4, 8, 32), []);
  const ringMat = useMemo(
    () => new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.85 }),
    [color]
  );

  // Cleanup fallback resources on unmount
  useEffect(() => {
    return () => {
      pinGeo.dispose();
      pinMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    };
  }, [pinGeo, pinMat, ringGeo, ringMat]);

  // Lazy load GLTF model
  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();

    try {
      loader.load(
        modelUrl,
        (gltf) => {
          if (!isMounted) {
            // Dispose immediately if unmounted before load completed
            disposeGLTF(gltf.scene);
            return;
          }

          const scene = gltf.scene;

          // Auto-center and ground wheels based on bounding box
          // Official Curiosity bbox: x -2.45..0.33, y -0.24..1.97, z -2.75..1.19
          const bbox = new Box3().setFromObject(scene);
          const dx = -(bbox.min.x + bbox.max.x) / 2;
          const dy = -bbox.min.y; // Ground bottom of wheels at y = 0
          const dz = -(bbox.min.z + bbox.max.z) / 2;

          scene.position.set(dx, dy, dz);

          const container = new Group();
          container.add(scene);
          container.scale.set(scale, scale, scale);

          setModelGroup(container);
          setLoadFailed(false);
        },
        undefined,
        () => {
          if (isMounted) {
            setLoadFailed(true);
          }
        }
      );
    } catch {
      if (isMounted) {
        setLoadFailed(true);
      }
    }

    return () => {
      isMounted = false;
      if (modelGroup) {
        disposeGLTF(modelGroup);
      }
    };
  }, [modelUrl, scale]);

  return (
    <group
      ref={rootRef}
      position={[position.x, position.y, position.z]}
      quaternion={rotationQuaternion}
      data-testid="curiosity-rover-marker"
    >
      {modelGroup && !loadFailed ? (
        <primitive object={modelGroup} />
      ) : loadFailed ? (
        /* Fallback beacon only when the model could not be loaded: while it loads nothing is drawn,
           so the old marker never flashes before the rover appears */
        <group data-testid="rover-fallback-beacon">
          {/* Ground ring */}
          <mesh
            geometry={ringGeo}
            material={ringMat}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.5, 0]}
          />
          {/* Pin cylinder */}
          <mesh geometry={pinGeo} material={pinMat} position={[0, 15, 0]} />
          {/* Beacon top sphere */}
          <mesh position={[0, 30, 0]}>
            <sphereGeometry args={[4, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

/**
 * Traverses and cleanly disposes all GPU geometries, textures, and materials in a group.
 */
export function disposeGLTF(root: Group): void {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
}

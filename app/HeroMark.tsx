"use client";

/**
 * HeroMark — 3D Tokamak striped-torus mark rendered behind the hero headline.
 *
 * Design decisions (review points):
 *  - Model: /tonnel-torus.obj is the "cylinder-cut, inner white wall" variant
 *    (model B). Swap the file in /public to change it.
 *  - Material: flat MeshBasicMaterial + a PROCEDURAL diagonal stripe texture.
 *    The original .mtl references `tonnel-torus-symbol-stripe-texture.png`,
 *    which was not provided — so stripes are generated in-code (makeStripeTexture).
 *    If you have the real PNG, drop it in /public and load it instead.
 *  - Motion: slow auto-rotation around the torus axis; disabled when the user
 *    has `prefers-reduced-motion: reduce`.
 *  - Purely decorative: aria-hidden + pointer-events:none, sits behind the text.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const ACCENT = "#3b9bff";          // brand blue used in the stripe
const STRIPE_BANDS = 10;           // diagonal stripe repeat count across UV tile
const ROTATION_SPEED = 0.12;       // radians / second (slow)
const BASE_TILT_X = -1.25;         // lean the ring toward face-on view
const BASE_TILT_Z = -0.15;         // slight roll

function makeStripeTexture(): THREE.Texture {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // 45° diagonal bands (x+y): stripes that spiral around the torus ring.
  // Blue is ~1/3 of the period so stripes appear thin against wide white gaps.
  const period = (size * 2) / STRIPE_BANDS;
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  const [br, bg, bb] = [0x3b, 0x9b, 0xff];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const phase = (((x + y) % period) + period) % period;
      const blue = phase < period / 3;
      const i = (y * size + x) * 4;
      data[i] = blue ? br : 255;
      data[i + 1] = blue ? bg : 255;
      data[i + 2] = blue ? bb : 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function HeroMark() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 8.6);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const stripeTex = makeStripeTexture();
    const stripeMat = new THREE.MeshBasicMaterial({ map: stripeTex });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const group = new THREE.Group();
    group.rotation.x = BASE_TILT_X;
    group.rotation.z = BASE_TILT_Z;
    scene.add(group);

    let raf = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let spinner: THREE.Object3D | null = null;

    function resize() {
      const w = mount!.clientWidth;
      const h = mount!.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function renderFrame() {
      if (spinner && !reduceMotion) {
        spinner.rotation.y += ROTATION_SPEED * clock.getDelta();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderFrame);
    }

    const loader = new OBJLoader();
    loader.load(
      "/tonnel-torus.obj",
      (obj) => {
        if (disposed) return;

        // Apply materials: white for the inner cut wall, stripes for the outer.
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = Array.isArray(child.material)
              ? child.material[0]
              : child.material;
            const name = (mat?.name ?? "").toLowerCase();
            child.material = name.includes("inner") ? innerMat : stripeMat;
          }
        });

        // Center and normalize scale so it fits the viewport regardless of
        // the model's native units.
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        obj.position.sub(center);
        const target = 2.0; // world radius — sized so the ring fits fully in viewport
        obj.scale.setScalar(target / sphere.radius);

        spinner = obj;
        group.add(obj);
      },
      undefined,
      (err) => console.error("[HeroMark] OBJ load failed:", err)
    );

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    renderFrame();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stripeTex.dispose();
      stripeMat.dispose();
      innerMat.dispose();
      spinner?.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="hero-mark" aria-hidden="true" />;
}

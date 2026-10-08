'use client';

import { useEffect, useRef, useState } from 'react';

const MAX = 150000;
const KEY = 'chennaiPunjabShangar.v2';
const G = 30;          // gravity
const HMAX = 1.7;      // jump peak height (world units)
const fmt = (n) => n.toLocaleString('en-US');

export default function JumpGame() {
  const sceneRef = useRef(null);
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(0);
  const [pluses, setPluses] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [flat, setFlat] = useState(false);

  const countRef = useRef(0);
  const confirmingRef = useRef(false);
  const kickRef = useRef(() => {});
  const loadedRef = useRef(false);
  const soundRef = useRef(null);

  // jump sound: put your voice in public/jump.mp3 (silently skipped if the file is missing)
  useEffect(() => {
    const a = new Audio('/jump.mp3');
    a.preload = 'auto';
    soundRef.current = a;
  }, []);

  function playJumpSound() {
    const a = soundRef.current;
    if (!a) return;
    try {
      a.currentTime = 0; // restart on every jump (clip is long, so no overlapping)
      a.play().catch(() => {});
    } catch (e) {}
  }

  // load saved count
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && typeof v.jumpCount === 'number') {
        const n = Math.min(MAX, Math.max(0, Math.floor(v.jumpCount)));
        countRef.current = n;
        setCount(n);
      }
    } catch (e) {}
    loadedRef.current = true;
  }, []);

  useEffect(() => { confirmingRef.current = confirming; }, [confirming]);

  function save(n) {
    try { localStorage.setItem(KEY, JSON.stringify({ jumpCount: n })); } catch (e) {}
  }

  function doJump() {
    if (countRef.current >= MAX) return;
    countRef.current += 1;
    setCount(countRef.current);
    setBump((b) => b + 1);
    const id = Math.random();
    setPluses((p) => [...p, { id, left: 46 + Math.random() * 8 }]);
    setTimeout(() => setPluses((p) => p.filter((x) => x.id !== id)), 650);
    kickRef.current();
    playJumpSound();
    save(countRef.current);
  }
  const doJumpRef = useRef(doJump);
  doJumpRef.current = doJump;

  // tap / click / space = one jump
  useEffect(() => {
    const onPointer = (e) => {
      if (e.target.closest && (e.target.closest('button') || e.target.closest('.overlay'))) return;
      if (e.button && e.button !== 0) return;
      e.preventDefault();
      doJumpRef.current();
    };
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      if (confirmingRef.current) return;
      e.preventDefault();
      doJumpRef.current();
    };
    document.addEventListener('pointerdown', onPointer, { passive: false });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // 3D scene + physics
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    // jump physics (shared by 3D and flat fallback)
    let hy = 0, vy = 0, landSq = 0, launchPop = 0, landingFx = 0;
    const V0 = Math.sqrt(2 * G * HMAX);
    kickRef.current = () => {
      const need = Math.sqrt(2 * G * Math.max(0.05, HMAX - hy));
      vy = Math.max(vy, need);
      launchPop = 1;
    };
    function stepPhysics(dt) {
      if (hy > 0 || vy > 0) {
        vy -= G * dt;
        hy += vy * dt;
        if (hy <= 0) {
          hy = 0;
          if (vy < -4) { landSq = 1; landingFx = 1; }
          vy = 0;
        }
      }
      landSq = Math.max(0, landSq - dt * 4.5);
      launchPop = Math.max(0, launchPop - dt * 7);
    }

    async function start() {
      let THREE, OBJLoader;
      try {
        THREE = await import('three');
        ({ OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js'));
      } catch (e) { if (!disposed) setFlat(true); return; }
      if (disposed) return;

      try {
        const el = sceneRef.current;
        const w = window.innerWidth, h = window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0xffffff, 1);
        renderer.outputEncoding = THREE.sRGBEncoding;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);
        const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);

        const FOV = 30, NEED_H = 6.8, NEED_W = 4.4, FLOOR_AT = 0.82;
        const fitCamera = () => {
          const aspect = window.innerWidth / window.innerHeight;
          const t = Math.tan((FOV * Math.PI) / 360);
          const d = Math.max(NEED_H / (2 * t), NEED_W / (aspect * 2 * t));
          const visH = 2 * d * t;
          const cy = FLOOR_AT * visH - visH / 2;
          camera.position.set(0, cy + 0.6, d);
          camera.lookAt(0, cy, 0);
        };
        fitCamera();

        scene.add(new THREE.AmbientLight(0xffffff, 0.62));
        const key = new THREE.DirectionalLight(0xffffff, 0.8);
        key.position.set(-2.5, 4, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.3);
        fill.position.set(3, 1, 4);
        scene.add(fill);

        const floor = new THREE.Mesh(
          new THREE.CircleGeometry(4.2, 64),
          new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: 0.95, metalness: 0 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.02;
        scene.add(floor);

        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, 'rgba(0,0,0,0.35)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.8, 1.8),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.005;
        scene.add(shadow);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.55, 0.66, 48),
          new THREE.MeshBasicMaterial({ color: 0xff3b7f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        scene.add(ring);

        const character = new THREE.Group();
        scene.add(character);

        // model + photo texture live in /public
        const objText = await (await fetch('/model.obj')).text();
        if (disposed) {
          renderer.dispose();
          if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
          return;
        }
        const obj = new OBJLoader().parse(objText);
        const tex = new THREE.TextureLoader().load('/photo.jpg');
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
        obj.traverse((m) => {
          if (!m.isMesh) return;
          m.geometry.computeVertexNormals();
          m.material = mat;
        });
        const probe = new THREE.Box3().setFromObject(obj);
        obj.scale.setScalar(2.2 / probe.getSize(new THREE.Vector3()).y);
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        obj.position.set(-center.x, -box.min.y, -center.z);
        character.add(obj);

        const onResize = () => {
          const W = window.innerWidth, H = window.innerHeight;
          renderer.setSize(W, H);
          camera.aspect = W / H;
          fitCamera();
          camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', onResize);

        let idleT = 0, last = performance.now();
        const loop = (now) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          idleT += dt;
          stepPhysics(dt);

          const air = hy > 0.001;
          const stretch = air ? Math.max(-0.08, Math.min(0.14, (vy / V0) * 0.14)) : 0;
          const squash = landSq * 0.16;
          let sy = 1 + stretch + launchPop * 0.06 - squash;
          let sx = 1 - stretch * 0.6 - launchPop * 0.03 + squash * 0.8;
          if (!air && landSq === 0) {
            sy *= 1 + Math.sin(idleT * 2.2) * 0.012;
            sx *= 1 - Math.sin(idleT * 2.2) * 0.006;
          }
          character.position.y = hy;
          character.scale.set(sx, sy, sx);

          const s = 1 - Math.min(0.55, hy / (HMAX * 1.3));
          shadow.scale.set(s, s, s);
          shadow.material.opacity = 0.35 + 0.65 * s;

          if (landingFx > 0) {
            landingFx = Math.max(0, landingFx - dt * 2.6);
            const r = 1 + (1 - landingFx) * 1.8;
            ring.scale.set(r, r, r);
            ring.material.opacity = landingFx * 0.5;
          } else {
            ring.material.opacity = 0;
          }

          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
          renderer.dispose();
          if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
      } catch (e) {
        if (!disposed) setFlat(true);
      }
    }

    // flat fallback loop (photo jumps with CSS) — runs only when `flat` elements exist
    const flatLoop = () => {
      const img = document.querySelector('.flat-img');
      const sh = document.querySelector('.flat-shadow');
      if (img && sh) {
        stepPhysics(1 / 60);
        img.style.transform = `translateX(-50%) translateY(${(-hy / HMAX) * window.innerHeight * 0.22}px)`;
        sh.style.transform = `scale(${1 - Math.min(0.5, hy / (HMAX * 1.3))})`;
      }
      raf = requestAnimationFrame(flatLoop);
    };

    start().then(() => { if (!disposed && !raf) raf = requestAnimationFrame(flatLoop); });

    return () => { disposed = true; cancelAnimationFrame(raf); cleanup(); };
  }, []);

  function confirmReset() {
    setConfirming(false);
    countRef.current = 0;
    setCount(0);
    save(0);
  }

  return (
    <>
      <div ref={sceneRef} className="scene" aria-label="Tap anywhere to jump" />

      {flat && (
        <>
          <div className="flat-shadow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="flat-img" src="/photo.jpg" alt="Character" />
        </>
      )}

      <div className="hud">
        <div className="title">Chennai Punjab Shangar</div>
        <div key={bump} className={`count${bump ? ' bump' : ''}`} aria-live="polite">{fmt(count)}</div>
        <div className="sub">{count >= MAX ? 'Challenge complete: 150,000 jumps!' : 'Tap anywhere to jump'}</div>
      </div>

      {pluses.map((p) => (
        <div key={p.id} className="plus" style={{ left: `${p.left}%` }}>+1</div>
      ))}

      <button className="reset" onClick={() => setConfirming(true)}>Reset</button>

      {confirming && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rt">
          <div className="dialog">
            <h2 id="rt">Reset progress?</h2>
            <p>Are you sure you want to reset your progress?</p>
            <div className="row">
              <button className="b-cancel" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="b-yes" onClick={confirmReset}>Yes, reset</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

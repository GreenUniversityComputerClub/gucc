"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Hero backdrop: a slowly drifting particle field with a lighter constellation
 * of nodes linked whenever they pass close to each other — a network motif that
 * suits a computer club and reads as depth rather than noise.
 *
 * Cost is kept deliberately low. The link pass is O(n²) over the *nodes* only
 * (a few dozen), never over the dust, and every count scales down on small
 * screens. The whole effect is skipped for `prefers-reduced-motion`.
 */

/** GUCC greens, cool→warm, sampled per particle for depth. */
const PALETTE_DARK = ['#22c55e', '#10b981', '#4ade80', '#34d399'];
const PALETTE_LIGHT = ['#15803d', '#047857', '#16a34a', '#0f766e'];

export const AnimatedBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Respect the OS "reduce motion" setting: this is a continuously animating
    // decorative background, exactly what that preference is for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const isSmallScreen = window.innerWidth < 768;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isSmallScreen });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const isDark = () => document.documentElement.classList.contains('dark');
    const paletteFor = (dark: boolean) =>
      (dark ? PALETTE_DARK : PALETTE_LIGHT).map((hex) => new THREE.Color(hex));

    /* ---------------- Dust: fine, many, per-particle colour and size -------- */

    // Phones get roughly half the dust: same impression, far less GPU work.
    const dustCount = isSmallScreen ? 1100 : 2400;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustColor = new Float32Array(dustCount * 3);
    const dustSize = new Float32Array(dustCount);

    const writeDustColours = (dark: boolean) => {
      const palette = paletteFor(dark);
      for (let i = 0; i < dustCount; i++) {
        const c = palette[Math.floor(Math.random() * palette.length)];
        dustColor.set([c.r, c.g, c.b], i * 3);
      }
      dustGeometry.getAttribute('color').needsUpdate = true;
    };

    for (let i = 0; i < dustCount; i++) {
      // Spherical shell rather than a cube: no visible box edges as it rotates.
      const radius = 1.4 + Math.random() * 1.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dustPos.set(
        [
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi),
        ],
        i * 3
      );
      dustSize[i] = 0.004 + Math.random() * 0.008;
    }

    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColor, 3));
    dustGeometry.setAttribute('size', new THREE.BufferAttribute(dustSize, 1));
    writeDustColours(isDark());

    const dustMaterial = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      opacity: isDark() ? 0.85 : 0.75,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);

    /* ---------------- Nodes + links: the constellation --------------------- */

    const nodeCount = isSmallScreen ? 34 : 60;
    const LINK_DISTANCE = isSmallScreen ? 0.95 : 0.85;
    const nodePos = new Float32Array(nodeCount * 3);
    const nodeVel = new Float32Array(nodeCount * 3);

    for (let i = 0; i < nodeCount; i++) {
      nodePos.set(
        [(Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.6],
        i * 3
      );
      nodeVel.set(
        [
          (Math.random() - 0.5) * 0.0016,
          (Math.random() - 0.5) * 0.0016,
          (Math.random() - 0.5) * 0.0009,
        ],
        i * 3
      );
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
    const nodeMaterial = new THREE.PointsMaterial({
      size: 0.03,
      color: new THREE.Color(isDark() ? '#4ade80' : '#15803d'),
      transparent: true,
      opacity: isDark() ? 0.95 : 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);

    // Preallocated to the worst case so the link buffer is never reallocated
    // mid-animation; `setDrawRange` controls how much of it is drawn.
    const maxLinks = (nodeCount * (nodeCount - 1)) / 2;
    const linkPositions = new Float32Array(maxLinks * 6);
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(isDark() ? '#22c55e' : '#15803d'),
      transparent: true,
      opacity: isDark() ? 0.16 : 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const links = new THREE.LineSegments(linkGeometry, linkMaterial);

    const BOUND_X = 1.8;
    const BOUND_Y = 1.2;
    const BOUND_Z = 0.9;

    const stepNodes = () => {
      for (let i = 0; i < nodeCount; i++) {
        const i3 = i * 3;
        nodePos[i3] += nodeVel[i3];
        nodePos[i3 + 1] += nodeVel[i3 + 1];
        nodePos[i3 + 2] += nodeVel[i3 + 2];
        // Bounce inside the box so the field never drifts empty.
        if (Math.abs(nodePos[i3]) > BOUND_X) nodeVel[i3] *= -1;
        if (Math.abs(nodePos[i3 + 1]) > BOUND_Y) nodeVel[i3 + 1] *= -1;
        if (Math.abs(nodePos[i3 + 2]) > BOUND_Z) nodeVel[i3 + 2] *= -1;
      }
      nodeGeometry.getAttribute('position').needsUpdate = true;
    };

    const rebuildLinks = () => {
      let cursor = 0;
      for (let i = 0; i < nodeCount; i++) {
        const i3 = i * 3;
        for (let j = i + 1; j < nodeCount; j++) {
          const j3 = j * 3;
          const dx = nodePos[i3] - nodePos[j3];
          const dy = nodePos[i3 + 1] - nodePos[j3 + 1];
          const dz = nodePos[i3 + 2] - nodePos[j3 + 2];
          if (dx * dx + dy * dy + dz * dz < LINK_DISTANCE * LINK_DISTANCE) {
            linkPositions[cursor++] = nodePos[i3];
            linkPositions[cursor++] = nodePos[i3 + 1];
            linkPositions[cursor++] = nodePos[i3 + 2];
            linkPositions[cursor++] = nodePos[j3];
            linkPositions[cursor++] = nodePos[j3 + 1];
            linkPositions[cursor++] = nodePos[j3 + 2];
          }
        }
      }
      linkGeometry.setDrawRange(0, cursor / 3);
      linkGeometry.getAttribute('position').needsUpdate = true;
    };

    camera.position.z = 2.6;

    /* ---------------- Interaction and loop --------------------------------- */

    let pointerX = 0;
    let pointerY = 0;
    const handleMouseMove = (event: MouseEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const group = new THREE.Group();
    group.add(dust, nodes, links);
    scene.add(group);

    let frameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      dust.rotation.y += 0.0004;
      dust.rotation.x += 0.00018;

      stepNodes();
      rebuildLinks();

      // Gentle parallax easing toward the pointer, plus a slow independent sway
      // so the scene still breathes when the pointer is still.
      const targetX = pointerX * 0.22 + Math.sin(elapsed * 0.12) * 0.03;
      const targetY = pointerY * 0.18 + Math.cos(elapsed * 0.1) * 0.025;
      group.rotation.y += (targetX - group.rotation.y) * 0.025;
      group.rotation.x += (targetY - group.rotation.x) * 0.025;

      renderer.render(scene, camera);
    };
    animate();

    // No point burning frames while the tab is in the background.
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
      } else {
        frameId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener('resize', handleResize);

    const applyTheme = () => {
      const dark = isDark();
      writeDustColours(dark);
      dustMaterial.opacity = dark ? 0.85 : 0.75;
      nodeMaterial.color.set(dark ? '#4ade80' : '#15803d');
      nodeMaterial.opacity = dark ? 0.95 : 0.8;
      linkMaterial.color.set(dark ? '#22c55e' : '#15803d');
      linkMaterial.opacity = dark ? 0.16 : 0.13;
    };
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      observer.disconnect();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      dustGeometry.dispose();
      dustMaterial.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      linkGeometry.dispose();
      linkMaterial.dispose();
      // Frees the WebGL context; browsers cap how many may be live at once.
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
};

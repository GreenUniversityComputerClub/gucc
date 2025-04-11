'use client';

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import Confetti from 'react-confetti';
import styles from './PohelaBoishakhGreeting.module.css';

const PohelaBoishakhGreeting: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [showConfetti, setShowConfetti] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;
    const { clientWidth: width, clientHeight: height } = currentMount;
    setDimensions({ width, height });

    // --- Basic Three.js Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    // --- Festive Element (e.g., a rotating abstract shape) ---
    const geometry = new THREE.IcosahedronGeometry(1, 0); // Simple geometry
    const material = new THREE.MeshStandardMaterial({
      color: 0xe53935, // Red
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true,
    });
    const element = new THREE.Mesh(geometry, material);
    scene.add(element);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 0.6);
    pointLight.position.set(2, 3, 4);
    scene.add(pointLight);

    // --- Animation Loop ---
    let animationFrameId: number;
    const animate = () => {
      element.rotation.x += 0.005;
      element.rotation.y += 0.008;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // --- Confetti Timer ---
    const timer = setTimeout(() => setShowConfetti(false), 8000); // Confetti for 8 seconds

    // --- Handle Resize (Optional but recommended) ---
    const handleResize = () => {
      if (!mountRef.current) return;
      const { clientWidth: newWidth, clientHeight: newHeight } = mountRef.current;
      setDimensions({ width: newWidth, height: newHeight });
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timer);
      if (currentMount && renderer.domElement) {
         // Check if the element is still a child before removing
         if (currentMount.contains(renderer.domElement)) {
            currentMount.removeChild(renderer.domElement);
         }
      }
       geometry.dispose();
       material.dispose();
       // Dispose other resources if necessary
    };
  }, []);

  return (
    <div className={styles.greetingContainer}>
      {showConfetti && dimensions.width > 0 && (
        <Confetti
          width={dimensions.width}
          height={dimensions.height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.15}
          // colors={['#e53935', '#ffffff', '#ffc107', '#4caf50']} // Red, White, Yellow, Green
          initialVelocityY={15}
        />
      )}
      <div ref={mountRef} className={styles.canvasContainer}></div>
      <div className={styles.textOverlay}>
        <h2 className={styles.greetingText}>শুভ নববর্ষ!</h2>
        <p className={styles.subText}>Pohela Boishakh</p>
      </div>
    </div>
  );
};

export default PohelaBoishakhGreeting; 
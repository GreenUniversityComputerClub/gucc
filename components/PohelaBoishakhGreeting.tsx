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

    // Check if dark mode is active
    const isDarkMode = document.documentElement.classList.contains('dark');

    // --- Enhanced Festive Elements ---
    const geometry = new THREE.IcosahedronGeometry(1, 1); // Increased detail
    const material = new THREE.MeshStandardMaterial({
      color: isDarkMode ? 0xff6b6b : 0xe53935, // Brighter red in dark mode
      roughness: 0.3,
      metalness: 0.4,
      flatShading: false, // Smoother shading
    });
    const element = new THREE.Mesh(geometry, material);
    scene.add(element);

    // Add a second smaller element for more visual interest
    const geometry2 = new THREE.OctahedronGeometry(0.6, 0);
    const material2 = new THREE.MeshStandardMaterial({
      color: isDarkMode ? 0xffd93d : 0xffc107, // Golden color
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.8,
    });
    const element2 = new THREE.Mesh(geometry2, material2);
    element2.position.set(1.5, 0, 0);
    scene.add(element2);

    // Add floating particles around the main element
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 50;
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 4;
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.05,
      color: isDarkMode ? 0x4ade80 : 0x22c55e, // Green particles
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // --- Enhanced Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, isDarkMode ? 0.8 : 0.7);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, isDarkMode ? 0.8 : 0.6);
    pointLight.position.set(2, 3, 4);
    scene.add(pointLight);

    // Add colored lights for more festive feel
    const redLight = new THREE.PointLight(0xff6b6b, 0.3);
    redLight.position.set(-2, 1, 2);
    scene.add(redLight);

    const greenLight = new THREE.PointLight(0x4ade80, 0.3);
    greenLight.position.set(2, -1, -2);
    scene.add(greenLight);

    // --- Animation Loop ---
    let animationFrameId: number;
    const animate = () => {
      element.rotation.x += 0.008;
      element.rotation.y += 0.012;
      element2.rotation.x -= 0.006;
      element2.rotation.y -= 0.008;
      particles.rotation.x += 0.002;
      particles.rotation.y += 0.003;

      // Gentle floating motion for particles
      particles.position.y = Math.sin(Date.now() * 0.001) * 0.1;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // --- Confetti Timer ---
    const timer = setTimeout(() => setShowConfetti(false), 8000); // Confetti for 8 seconds

    // --- Handle Resize ---
    const handleResize = () => {
      if (!mountRef.current) return;
      const { clientWidth: newWidth, clientHeight: newHeight } = mountRef.current;
      setDimensions({ width: newWidth, height: newHeight });
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Handle Theme Changes ---
    const handleThemeChange = () => {
      const isDark = document.documentElement.classList.contains('dark');
      material.color.setHex(isDark ? 0xff6b6b : 0xe53935);
      material2.color.setHex(isDark ? 0xffd93d : 0xffc107);
      particlesMaterial.color.setHex(isDark ? 0x4ade80 : 0x22c55e);
      ambientLight.intensity = isDark ? 0.8 : 0.7;
      pointLight.intensity = isDark ? 0.8 : 0.6;
    };

    // Listen for theme changes
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timer);
      if (currentMount && renderer.domElement) {
         if (currentMount.contains(renderer.domElement)) {
            currentMount.removeChild(renderer.domElement);
         }
      }
      geometry.dispose();
      geometry2.dispose();
      particlesGeometry.dispose();
      material.dispose();
      material2.dispose();
      particlesMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.greetingContainer}>
      {showConfetti && dimensions.width > 0 && (
        <Confetti
          width={dimensions.width}
          height={dimensions.height}
          recycle={false}
          numberOfPieces={300} // Increased confetti
          gravity={0.12}
          colors={['#e53935', '#ffffff', '#ffc107', '#4caf50', '#2196f3']} // More festive colors
          initialVelocityY={20}
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
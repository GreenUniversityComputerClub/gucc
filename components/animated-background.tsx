"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const AnimatedBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Create particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 2500; // Increased particle count
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 4; // Slightly larger spread
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    // Check if dark mode is active
    const isDarkMode = document.documentElement.classList.contains('dark');
    
    // Material with theme-aware colors
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.006, // Slightly larger particles
      color: isDarkMode ? '#22c55e' : '#15803d', // Brighter green in dark mode
      transparent: true,
      opacity: isDarkMode ? 0.8 : 0.9,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    // Mesh
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    // Add a second layer of particles for more depth
    const particlesGeometry2 = new THREE.BufferGeometry();
    const posArray2 = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      posArray2[i] = (Math.random() - 0.5) * 6; // Larger spread for background layer
    }

    particlesGeometry2.setAttribute('position', new THREE.BufferAttribute(posArray2, 3));

    const particlesMaterial2 = new THREE.PointsMaterial({
      size: 0.004,
      color: isDarkMode ? '#16a34a' : '#166534', // Different shade for depth
      transparent: true,
      opacity: isDarkMode ? 0.4 : 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const particlesMesh2 = new THREE.Points(particlesGeometry2, particlesMaterial2);
    scene.add(particlesMesh2);

    // Position camera
    camera.position.z = 2;

    // Mouse movement effect
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      mouseX = event.clientX / window.innerWidth - 0.5;
      mouseY = event.clientY / window.innerHeight - 0.5;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation
    const animate = () => {
      requestAnimationFrame(animate);

      // Animate both particle layers with different speeds
      particlesMesh.rotation.x += 0.0003;
      particlesMesh.rotation.y += 0.0004;
      particlesMesh2.rotation.x += 0.0002;
      particlesMesh2.rotation.y += 0.0003;

      // Smooth mouse movement for both layers
      particlesMesh.rotation.x += (mouseY * 0.3 - particlesMesh.rotation.x) * 0.03;
      particlesMesh.rotation.y += (mouseX * 0.3 - particlesMesh.rotation.y) * 0.03;
      particlesMesh2.rotation.x += (mouseY * 0.2 - particlesMesh2.rotation.x) * 0.02;
      particlesMesh2.rotation.y += (mouseX * 0.2 - particlesMesh2.rotation.y) * 0.02;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Handle theme changes
    const handleThemeChange = () => {
      const isDark = document.documentElement.classList.contains('dark');
      particlesMaterial.color.setHex(isDark ? 0x22c55e : 0x15803d);
      particlesMaterial.opacity = isDark ? 0.8 : 0.9;
      particlesMaterial2.color.setHex(isDark ? 0x16a34a : 0x166534);
      particlesMaterial2.opacity = isDark ? 0.4 : 0.6;
    };

    // Listen for theme changes
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      containerRef.current?.removeChild(renderer.domElement);
      scene.remove(particlesMesh);
      scene.remove(particlesMesh2);
      particlesGeometry.dispose();
      particlesGeometry2.dispose();
      particlesMaterial.dispose();
      particlesMaterial2.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}; 
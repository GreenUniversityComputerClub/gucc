"use client";

import { useEffect, useState } from "react";

export const TiltShapes = () => {
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };

    checkMobile();

    // Handle device orientation for mobile
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (isMobile && event.beta !== null && event.gamma !== null) {
        const x = (event.gamma / 90) * 20; // Convert to degrees and limit movement
        const y = (event.beta / 90) * 20;
        setTiltX(x);
        setTiltY(y);
      }
    };

    // Handle touch events for mobile
    const handleTouch = (event: TouchEvent) => {
      if (isMobile && event.touches[0]) {
        const touch = event.touches[0];
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const x = ((touch.clientX - centerX) / centerX) * 20;
        const y = ((touch.clientY - centerY) / centerY) * 20;
        setTiltX(x);
        setTiltY(y);
      }
    };

    // Handle mouse movement for desktop
    const handleMouseMove = (event: MouseEvent) => {
      if (!isMobile) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const x = ((event.clientX - centerX) / centerX) * 20;
        const y = ((event.clientY - centerY) / centerY) * 20;
        setTiltX(x);
        setTiltY(y);
      }
    };

    // Add event listeners
    if (isMobile) {
      window.addEventListener('deviceorientation', handleOrientation as EventListener);
      window.addEventListener('touchmove', handleTouch);
    } else {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Cleanup
    return () => {
      if (isMobile) {
        window.removeEventListener('deviceorientation', handleOrientation as EventListener);
        window.removeEventListener('touchmove', handleTouch);
      } else {
        window.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [isMobile]);

  return (
    <div 
      className="absolute inset-0 pointer-events-none transition-transform duration-300 ease-out"
      style={{
        transform: `perspective(1000px) rotateX(${tiltY}deg) rotateY(${tiltX}deg)`
      }}
    >
      <div className="absolute top-1/4 left-1/6 w-2 h-2 bg-primary/30 rounded-full animate-bounce delay-300" />
      <div className="absolute top-1/3 right-1/5 w-1 h-1 bg-primary/40 rounded-full animate-bounce delay-700" />
      <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-primary/25 rounded-full animate-bounce delay-1000" />
      <div className="absolute bottom-1/3 right-1/6 w-1 h-1 bg-primary/35 rounded-full animate-bounce delay-500" />
    </div>
  );
}; 
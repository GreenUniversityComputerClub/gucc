'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

const collaborationImages = [
  '/ClubCollaborations/UAP EEE.jpg',
  '/ClubCollaborations/AUST PIC.jpg',
  '/ClubCollaborations/IIEC-iubat.jpg',
  '/ClubCollaborations/hackCSB.jpg',
  '/ClubCollaborations/AUST RPC.jpg',
];

export function CollaborationScroll() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Create duplicate sets of images to ensure continuous flow
  const duplicatedImages = [...collaborationImages, ...collaborationImages, ...collaborationImages];

  return (
    <div className="w-full py-4 md:py-6 overflow-hidden bg-primary/5">
      <div className="container px-4 md:px-6 mb-3">
        <h2 className="text-xl font-bold tracking-tighter text-center md:text-2xl lg:text-3xl">
          Our Club Collaborations
        </h2>
        <p className="text-center text-muted-foreground mt-1 text-sm md:text-base">
          Partnering with leading tech clubs across universities
        </p>
      </div>
      
      <div className="relative flex overflow-x-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {duplicatedImages.map((image, index) => (
            <div 
              key={`img1-${index}`} 
              className="flex items-center justify-center mx-2 h-24 md:h-32"
            >
              <div className="relative h-full aspect-[16/10] rounded-lg overflow-hidden shadow-md">
                <Image
                  src={image}
                  alt={`Club Collaboration ${index % collaborationImages.length + 1}`}
                  fill
                  sizes="(max-width: 768px) 160px, 200px"
                  className="object-cover hover:scale-105 transition-transform duration-500"
                  priority={index < 5}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="absolute flex animate-marquee2 whitespace-nowrap">
          {duplicatedImages.map((image, index) => (
            <div 
              key={`img2-${index}`} 
              className="flex items-center justify-center mx-2 h-24 md:h-32"
            >
              <div className="relative h-full aspect-[16/10] rounded-lg overflow-hidden shadow-md">
                <Image
                  src={image}
                  alt={`Club Collaboration ${index % collaborationImages.length + 1}`}
                  fill
                  sizes="(max-width: 768px) 160px, 200px"
                  className="object-cover hover:scale-105 transition-transform duration-500"
                  priority={index < 5}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 
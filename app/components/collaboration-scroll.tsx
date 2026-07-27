'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const collaborators = [
  {
    name: 'UAP EEE',
    image: '/collaborators/uap-eee.png',
    description: 'Collaboration with UAP EEE Club',
  },
  {
    name: 'AUST PIC',
    image: '/collaborators/aust-pic.jpg',
    description: 'Partnership with AUST Programming & Informatics Club',
  },
  {
    name: 'IIEC-IUBAT',
    image: '/collaborators/iiec-iubat.jpg',
    description: 'Joint initiatives with IIEC-IUBAT',
  },
  {
    name: 'HackCSB',
    image: '/collaborators/hack-csb.png',
    description: 'Collaboration with HackCSB',
  },
  {
    name: 'AUST RPC',
    image: '/collaborators/aust-rpc.jpg',
    description: 'Partnership with AUST Robotics & Programming Club',
  },
];

export function CollaborationScroll() {
  return (
    <section className="w-full py-12 bg-primary/5">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">
              Featured Collaborations
            </h2>
            <p className="mt-2 text-muted-foreground">
              Working together with leading tech clubs
            </p>
          </div>
          <Link
            href="/collaborations"
            className="inline-flex items-center gap-2 mt-4 md:mt-0 text-primary"
          >
            View all collaborations
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {collaborators.map((collab, index) => (
            <div
              key={index}
              className="bg-white rounded-md shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="relative w-full pt-[100%] bg-gray-50">
                <Image
                  src={collab.image}
                  alt={collab.name}
                  fill
                  className="absolute inset-0 object-contain"
                  sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                  priority={index < 2}
                />
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium truncate">{collab.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{collab.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
} 
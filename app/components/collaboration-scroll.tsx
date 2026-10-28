'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SectionHeading } from '@/components/section-heading';

export interface Partner {
  name: string;
  image: string;
  description: string;
}

export function CollaborationScroll({ partners: collaborators }: { partners: Partner[] }) {
  return (
    <section className="relative w-full overflow-hidden border-y border-border/60 bg-muted/30 py-16 md:py-24">
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-secondary/10 blur-[100px]" />
      <div className="container px-4 md:px-6">
        <SectionHeading index="05" eyebrow="Partners" title="Featured collaborations" description="Working together with leading tech clubs" className="mb-12">
          <Link
            href="/collaborations"
            className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all collaborations
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </SectionHeading>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {collaborators.map((collab, index) => (
            <div
              key={index}
              className="lift overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
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
                {/* The tile is white in both themes, so its text stays dark in both. */}
                <h3 className="text-sm font-medium truncate text-gray-900">{collab.name}</h3>
                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{collab.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
} 
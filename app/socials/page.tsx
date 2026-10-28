'use client';
import React from 'react';
import { Facebook, Linkedin, Instagram, Mail, Users, ExternalLink, Youtube, Globe, Github, Share2 } from 'lucide-react';
import { PageHero } from "@/components/page-hero";

const socials = [
  {
    label: 'Facebook Page',
    url: 'https://www.facebook.com/GreenUniversityComputerClub',
    // Each brand colour a shade deeper where needed, so white text on it reads at 4.5:1.
    color: '#1467D6',
    icon: Facebook,
  },
  {
    label: 'Facebook Group',
    url: 'https://www.facebook.com/groups/1455061688068622',
    color: '#1467D6',
    icon: Users,
  },
  {
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/company/greenuniversitycomputerclub/',
    color: '#0077B5',
    icon: Linkedin,
  },
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/GreenUniversityComputerClub/',
    color: 'linear-gradient(45deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%)',
    icon: Instagram,
  },
  {
    label: 'YouTube',
    url: 'https://www.youtube.com/@GreenUniversityComputerClub',
    color: '#E00000',
    icon: Youtube,
  },
  {
    label: 'GitHub',
    url: 'https://github.com/GreenUniversityComputerClub',
    color: '#333333',
    icon: Github,
  },
  {
    label: 'Website',
    url: 'https://gucc.green.edu.bd/',
    color: '#1976D2',
    icon: Globe,
  },
];

export default function SocialsPage() {
  return (
    <>
    <PageHero
      icon={<Share2 />}
      eyebrow="Socials"
      title={<>Connect with <span className="text-gradient">GUCC</span></>}
      description="News, photos, videos and code: follow the club wherever you are."
    />
    <div className="flex flex-col items-center px-4 py-12 text-foreground">
      <div
        className="w-full max-w-4xl grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {socials.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              style={{
                background: item.color.startsWith('linear') ? item.color : undefined,
                backgroundColor: !item.color.startsWith('linear') ? item.color : undefined,
              }}
              className="flex items-center rounded-xl shadow-md p-4 sm:p-6 min-h-[80px] sm:min-h-[90px] gap-3 sm:gap-5"
            >
              <Icon size={30} className="flex-shrink-0 text-white sm:w-[38px] sm:h-[38px] w-[28px] h-[28px]" />
              <div className="flex flex-col min-w-0">
                <span className="text-white font-semibold text-base sm:text-lg mb-1 sm:mb-2">{item.label}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${item.label}`}
                  className="inline-flex items-center gap-1.5 bg-black/20 hover:bg-black/30 text-white font-medium rounded px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white/60 w-fit"
                >
                  Visit
                  <ExternalLink size={14} className="ml-1 sm:w-4 sm:h-4 w-3 h-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 sm:mt-8 w-full max-w-2xl mx-auto px-2 sm:px-0">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 bg-primary/10 border border-primary/30 rounded-lg px-3 py-3 sm:px-5 sm:py-4 text-primary text-sm sm:text-base font-medium shadow-sm justify-center text-center">
          <Mail size={18} className="flex-shrink-0 sm:w-[22px] sm:h-[22px] w-[18px] h-[18px]" />
          <span>For any kind of queries, mail us at</span>
          <a
            href="mailto:gucc@green.edu.bd"
            className="underline font-semibold hover:text-primary/80 ml-1"
          >
            gucc@green.edu.bd
          </a>
        </div>
      </div>
    </div>
    </>
  );
}

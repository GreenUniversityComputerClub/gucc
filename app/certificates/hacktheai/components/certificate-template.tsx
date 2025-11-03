'use client'

import { useEffect, useRef, useState, memo } from 'react'

interface CertificateProps {
  name: string
  teamName: string
  university: string
  gender: string
  eventName?: string
  eventDate?: string
  organization?: string
}

export const CertificateTemplate = memo(function CertificateTemplate(props: CertificateProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgLoaded, setSvgLoaded] = useState(false)

  useEffect(() => {
    // Load SVG as image for background, then overlay text
    setSvgLoaded(true)
  }, [])

  const genderText =
    props.gender === 'his' ? 'his' : props.gender === 'her' ? 'her' : 'their'

  return (
    <div
      id="certificate-container"
      ref={containerRef}
      className="relative w-full max-w-5xl mx-auto bg-white"
      style={{ aspectRatio: '1123 / 794', minHeight: '400px' }}
    >
      {/* SVG Background */}
      <img
        src="/certificates/hacktheai-template.svg"
        alt="Certificate Template"
        className="w-full h-auto absolute inset-0 object-contain"
        onLoad={() => setSvgLoaded(true)}
        loading="eager"
        decoding="async"
      />

      {/* Text Overlays */}
      {svgLoaded && (
        <>
          {/* Participant Name - Large elegant script font */}
          <div
            className="absolute"
            style={{
              left: '50%',
              top: '43%',
              transform: 'translateX(-50%)',
              width: '80%',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              className="font-bold text-[#313131] break-words"
              style={{
                fontFamily: 'serif',
                fontStyle: 'italic',
                letterSpacing: '0.05em',
                lineHeight: '1.2',
                fontSize: 'clamp(1.25rem, 4vw, 3rem)',
              }}
            >
              {props.name}
            </span>
          </div>

          {/* Description Text with Team and University */}
          <div
            className="absolute"
            style={{
              left: '50%',
              top: '53%',
              transform: 'translateX(-50%)',
              width: '85%',
              textAlign: 'center',
              pointerEvents: 'none',
              paddingLeft: '2%',
              paddingRight: '2%',
            }}
          >
            <span
              className="text-[#313131] leading-relaxed break-words"
              style={{
                fontFamily: 'serif',
                lineHeight: '1.5',
                fontSize: 'clamp(0.75rem, 2vw, 1.125rem)',
              }}
            >
              In acknowledgement of <span className="font-semibold">{genderText}</span> participation in HackTheAI
              powered by SmythOS as part of Team{' '}
              <span className="font-semibold">{props.teamName}</span> from{' '}
              <span className="font-semibold">{props.university}</span>. The
              Hackathon was hosted by Green University of Bangladesh. Organized
              by Dept. of CSE-GUB & Green University Computer Club (GUCC). In
              association with GUCC Virtual Gaming Society on 22/23/24
              September, 2025.
            </span>
          </div>
        </>
      )}
    </div>
  )
})

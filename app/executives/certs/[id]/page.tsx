'use client';

import executivesData from "../../../../data/executives.json";
import Certificate from "./certificate";
import { Montserrat, Pinyon_Script } from "next/font/google";
import localFont from "next/font/local";
import { useRef, useState } from "react";
import styles from "./certificates.module.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const pinyon_script = Pinyon_Script({
  subsets: ["latin"],
  weight: ["400"],
});

const engravers_old_english = localFont({
  src: [
    {
      path: "./engravers-old-english.ttf",
      weight: "400",
      style: "normal",
    },
  ],
});

interface Executive {
  position: string;
  name: string;
  studentId?: string;
  [key: string]: any;
}

interface ProcessedExecutive {
  name: string;
  position: string;
  studentId?: string;
}

export default function ProfilePage() {
  const certificatesRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Download all certificates as PDF using browser's native print
  const downloadAllCertificates = async () => {
    setIsGenerating(true);
    try {
      console.log('Starting PDF generation using browser print...');
      
      // Check if certificates container exists
      if (!certificatesRef.current) {
        console.error('Certificates container not found');
        alert('Certificates container not found. Please try again.');
        return;
      }
      
      // Find certificate elements
      const certificateElements = certificatesRef.current.querySelectorAll('[data-certificate]');
      console.log('Found certificate elements:', certificateElements.length);
      
      if (certificateElements.length === 0) {
        alert('No certificates found to download.');
        return;
      }

      // Create a new window with only the certificates
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow popups for this site to download certificates.');
        return;
      }

      // Create HTML content for printing
      const certificatesHtml = Array.from(certificateElements)
        .map(element => element.outerHTML)
        .join('');

      const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>GUCC Executive Certificates</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Pinyon+Script:wght@400&display=swap" rel="stylesheet">
          <style>
            @font-face {
              font-family: 'Engravers Old English';
              src: url('/fonts/engravers-old-english.ttf') format('truetype');
              font-weight: 400;
              font-style: normal;
            }
            
            @page {
              size: A4 landscape;
              margin: 0;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Montserrat', Arial, sans-serif;
              background: white;
            }
            
            .certificate-page {
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              page-break-after: always;
              page-break-inside: avoid;
            }
            
            .certificate-page:last-child {
              page-break-after: avoid;
            }
            
            .certificate-page svg {
              max-width: 95vw;
              max-height: 95vh;
              width: auto;
              height: auto;
            }
            
            /* Font family classes to ensure fonts are applied */
            .montserrat {
              font-family: 'Montserrat', sans-serif;
            }
            
            .pinyon-script {
              font-family: 'Pinyon Script', cursive;
            }
            
            .engravers-old-english {
              font-family: 'Engravers Old English', serif;
            }
            
            @media print {
              .certificate-page {
                page-break-after: always;
                page-break-inside: avoid;
              }
              
              .certificate-page:last-child {
                page-break-after: avoid;
              }
            }
          </style>
        </head>
        <body>
          ${Array.from(certificateElements)
            .map(element => `<div class="certificate-page">${element.innerHTML}</div>`)
            .join('')}
        </body>
        </html>
      `;

      printWindow.document.write(printHtml);
      printWindow.document.close();

      // Wait for content and fonts to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Additional font loading check
      try {
        await printWindow.document.fonts.ready;
        console.log('Fonts loaded successfully');
      } catch (fontError) {
        console.warn('Font loading check failed, proceeding anyway:', fontError);
      }

      // Focus the window and trigger print
      printWindow.focus();
      printWindow.print();
      
      // Close the window after a delay (user might need time to save)
      setTimeout(() => {
        printWindow.close();
      }, 2000);

      alert(`Print dialog opened with ${certificateElements.length} certificates! Choose "Save as PDF" in the print dialog.`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Error generating PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Process executives from years 2023 and 2024
  const processedExecutives: ProcessedExecutive[] = [];
  
  // Create a map to track executives who appear in both years
  const executiveMap = new Map<string, { name: string; positions: string[]; studentId?: string }>();

  // Process 2023 data (only merged)
  const year2023 = executivesData.find((data: any) => data.year === "2023");
  if (year2023?.campuses?.merged?.studentExecutives) {
    year2023.campuses.merged.studentExecutives.forEach((exec: Executive) => {
      if (exec.studentId) {
        const key = exec.studentId;
        const position = `${exec.position}'2023-24`;
        
        if (executiveMap.has(key)) {
          executiveMap.get(key)!.positions.push(position);
        } else {
          executiveMap.set(key, {
            name: exec.name,
            positions: [position],
            studentId: exec.studentId
          });
        }
      }
    });
  }

  // Process 2024 data (GUCC wing only, not VGS)
  const year2024 = executivesData.find((data: any) => data.year === "2024");
  if (year2024?.studentExecutives) {
    year2024.studentExecutives.forEach((exec: Executive) => {
      if (exec.studentId) {
        const key = exec.studentId;
        const position = `${exec.position}'Reformed-2024`;
        
        if (executiveMap.has(key)) {
          executiveMap.get(key)!.positions.push(position);
        } else {
          executiveMap.set(key, {
            name: exec.name,
            positions: [position],
            studentId: exec.studentId
          });
        }
      }
    });
  }

  // Convert map to final array with combined positions
  executiveMap.forEach((value) => {
    let finalPosition: string;
    
    if (value.positions.length === 2) {
      // Extract base role names (before the apostrophe)
      const role1Parts = value.positions[0].split("'");
      const role2Parts = value.positions[1].split("'");
      const baseRole1 = role1Parts[0];
      const baseRole2 = role2Parts[0];
      
      if (baseRole1 === baseRole2) {
        // Same role in both years - use tilde format
        const period1 = role1Parts[1];
        const period2 = role2Parts[1];
        finalPosition = `${baseRole1}'${period1}~${period2}`;
      } else {
        // Different roles - use ampersand separator
        finalPosition = value.positions.join(" & ");
      }
    } else {
      // Single position
      finalPosition = value.positions[0];
    }
    
    processedExecutives.push({
      name: value.name,
      position: finalPosition,
      studentId: value.studentId
    });
  });

  if (processedExecutives.length === 0) {
    return <div>No executives found for the specified criteria</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Executive Certificates</h1>
          <p className="text-gray-600 mt-2">
            {processedExecutives.length} certificate{processedExecutives.length !== 1 ? 's' : ''} available for download
          </p>
        </div>
        <button
          onClick={downloadAllCertificates}
          disabled={isGenerating}
          className={`${styles.downloadButton} text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isGenerating ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Opening Print Dialog...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print All Certificates as PDF
            </>
          )}
        </button>
      </div>
      <div ref={certificatesRef} className="flex flex-col gap-8">
        {processedExecutives.map((executive, index) => (
          <div key={index} className="border rounded-lg p-4 shadow-md">
            <div className={`${styles.executiveInfo} mb-4`}>
              <h2 className="text-xl font-semibold mb-2">{executive.name}</h2>
              <p className="text-gray-600">{executive.position}</p>
            </div>
            {executive.studentId && (
              <div data-certificate className={styles.certificateContainer}>
                <Certificate
                  name={executive.name}
                  position={executive.position}
                  profileLink={`${"https://gucc.green.edu.bd"}/executives/${executive.studentId}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

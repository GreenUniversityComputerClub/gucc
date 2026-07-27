'use client'

import { useState } from 'react'
import { downloadAsPNG, downloadAsPDF } from '@/lib/certificates/download'

interface DownloadButtonsProps {
  participantName: string
  teamName: string
}

export function DownloadButtons({
  participantName,
  teamName,
}: DownloadButtonsProps) {
  const [downloadingPNG, setDownloadingPNG] = useState(false)
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  const sanitizeFilename = (name: string) => {
    return name
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50)
  }

  const handlePNGDownload = async () => {
    setDownloadingPNG(true)
    try {
      const filename = `HackTheAI_Certificate_${sanitizeFilename(participantName)}_${sanitizeFilename(teamName)}.png`
      await downloadAsPNG('certificate-container', filename)
    } catch (error) {
      console.error('Error downloading PNG:', error)
      alert('Failed to download PNG. Please try again.')
    } finally {
      setDownloadingPNG(false)
    }
  }

  const handlePDFDownload = async () => {
    setDownloadingPDF(true)
    try {
      const filename = `HackTheAI_Certificate_${sanitizeFilename(participantName)}_${sanitizeFilename(teamName)}.pdf`
      await downloadAsPDF('certificate-container', filename)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF. Please try again.')
    } finally {
      setDownloadingPDF(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
      <button
        onClick={handlePNGDownload}
        disabled={downloadingPNG || downloadingPDF}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {downloadingPNG ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>Generating PNG...</span>
          </>
        ) : (
          <>
            <span>📥</span>
            <span>Download as PNG</span>
          </>
        )}
      </button>

      <button
        onClick={handlePDFDownload}
        disabled={downloadingPNG || downloadingPDF}
        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {downloadingPDF ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>Generating PDF...</span>
          </>
        ) : (
          <>
            <span>📄</span>
            <span>Download as PDF</span>
          </>
        )}
      </button>
    </div>
  )
}


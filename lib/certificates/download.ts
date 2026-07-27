import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export async function downloadAsPNG(
  elementId: string,
  filename: string = 'certificate.png'
): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    console.error(`Element with id "${elementId}" not found`)
    return
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.scrollWidth,
      height: element.scrollHeight,
    })

    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (error) {
    console.error('Error generating PNG:', error)
    throw error
  }
}

export async function downloadAsPDF(
  elementId: string,
  filename: string = 'certificate.pdf'
): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    console.error(`Element with id "${elementId}" not found`)
    return
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: element.scrollWidth,
      height: element.scrollHeight,
    })

    const imgData = canvas.toDataURL('image/png')

    // Get certificate dimensions
    const imgWidth = canvas.width
    const imgHeight = canvas.height

    // Calculate PDF dimensions
    // A4 landscape: 842 x 595 points (at 72 DPI)
    // We'll use pixels directly converted to points
    const pdfWidth = imgWidth * 0.75 // Convert pixels to points (approx)
    const pdfHeight = imgHeight * 0.75

    const pdf = new jsPDF({
      orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    })

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(filename)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}


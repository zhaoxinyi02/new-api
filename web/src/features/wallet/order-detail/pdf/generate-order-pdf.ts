/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

// A4 in millimeters.
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
// Rendering scale for the rasterized pages: 2x keeps CJK text crisp.
const RENDER_SCALE = 2

/**
 * Slice a tall canvas into fixed-aspect page images and append them to the
 * document, so content longer than one A4 page flows onto extra pages. The
 * first document reuses jsPDF's initial blank page; every later document must
 * open its own page, even for its first slice.
 */
async function appendCanvasPages(
  doc: jsPDF,
  canvas: HTMLCanvasElement,
  orientation: 'portrait' | 'landscape',
  reuseInitialPage = false
) {
  const pageWidth = orientation === 'portrait' ? A4_WIDTH_MM : A4_HEIGHT_MM
  const pageHeight = orientation === 'portrait' ? A4_HEIGHT_MM : A4_WIDTH_MM
  const sliceHeightPx = Math.round((canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM)
  for (let y = 0; y < canvas.height; y += sliceHeightPx) {
    const visibleHeight = Math.min(sliceHeightPx, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = visibleHeight
    const context = slice.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context unavailable')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, slice.width, slice.height)
    context.drawImage(
      canvas,
      0,
      y,
      canvas.width,
      visibleHeight,
      0,
      0,
      canvas.width,
      visibleHeight
    )
    if (y > 0 || !reuseInitialPage) {
      doc.addPage('a4', orientation)
    }
    doc.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      pageWidth,
      pageHeight
    )
  }
}

/**
 * Build the stamped order PDF: portrait service agreement with the company
 * seal first, then the landscape order bill with the finance seal, and hand
 * the blob to the caller.
 */
export async function generateOrderPdf(
  agreementNode: HTMLElement,
  billNode: HTMLElement
): Promise<Blob> {
  const [agreementCanvas, billCanvas] = await Promise.all([
    html2canvas(agreementNode, { scale: RENDER_SCALE, backgroundColor: '#ffffff' }),
    html2canvas(billNode, { scale: RENDER_SCALE, backgroundColor: '#ffffff' }),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  await appendCanvasPages(doc, agreementCanvas, 'portrait', true)
  await appendCanvasPages(doc, billCanvas, 'landscape')
  return doc.output('blob')
}

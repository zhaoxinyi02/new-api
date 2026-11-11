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
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pdfSpy = vi.hoisted(() => {
  return {
    pages: [] as { format: string; orientation: string }[],
    placements: [] as { width: number; height: number }[],
  }
})

vi.mock('jspdf', () => ({
  jsPDF: class {
    addPage(format: string, orientation: string) {
      pdfSpy.pages.push({ format, orientation })
    }
    addImage(
      _data: unknown,
      _format: string,
      _x: number,
      _y: number,
      width: number,
      height: number
    ) {
      pdfSpy.placements.push({ width, height })
    }
    output() {
      return new Blob(['pdf'])
    }
  },
}))

// html2canvas-pro is replaced by fake full-page canvases: a two-page-tall
// agreement and a one-page-tall landscape bill.
const fakeCanvases = vi.hoisted(() => ({
  queue: [] as { width: number; height: number }[],
}))

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => fakeCanvases.queue.shift() ?? null),
}))

// Minimal 2D-context stub: the slicer only fills white and blits slices.
function installCanvasStub() {
  const nativeCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        }),
        toDataURL: () => 'data:image/jpeg;base64,AAAA',
      } as unknown as HTMLCanvasElement
    }
    return nativeCreateElement(tag)
  }) as typeof document.createElement)
}

describe('generateOrderPdf', () => {
  beforeEach(() => {
    installCanvasStub()
    pdfSpy.pages = []
    pdfSpy.placements = []
    fakeCanvases.queue = [
      { width: 1588, height: 3172 }, // two-page-tall agreement
      { width: 2246, height: 1588 }, // one-page-tall landscape bill
    ]
  })

  it('opens a new landscape page for the bill instead of overprinting the agreement', async () => {
    const { generateOrderPdf } = await import('../generate-order-pdf')
    const blob = await generateOrderPdf(
      document.createElement('div'),
      document.createElement('div')
    )
    expect(blob).toBeInstanceOf(Blob)

    // Agreement: the first slice lands on jsPDF's initial page and the second
    // slice adds one portrait page. The bill must then open its own landscape
    // page before drawing — regression guard against overprinting page 1.
    expect(pdfSpy.pages).toEqual([
      { format: 'a4', orientation: 'portrait' },
      { format: 'a4', orientation: 'landscape' },
    ])
    expect(pdfSpy.placements).toEqual([
      { width: 210, height: 297 },
      { width: 210, height: 297 },
      { width: 297, height: 210 },
    ])
  })
})

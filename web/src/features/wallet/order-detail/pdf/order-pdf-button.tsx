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
import { useRef, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { createServerError } from '@/lib/server-error-message'

import type { TopupOrderDetail } from '../../types'
import { AgreementDocument } from './agreement-document'
import { BillDocument } from './bill-document'
import { generateOrderPdf } from './generate-order-pdf'

const hiddenStageStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: '-20000px',
  zIndex: -1,
  pointerEvents: 'none',
}

/**
 * "Download PDF" action for the order detail page. Keeps the A4 agreement and
 * bill documents rendered off-screen so clicking the button can rasterize
 * them into the downloadable stamped PDF.
 */
export function OrderPdfButton(props: { detail: TopupOrderDetail }) {
  const { t } = useTranslation()
  const agreementRef = useRef<HTMLDivElement | null>(null)
  const billRef = useRef<HTMLDivElement | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [exportedAt, setExportedAt] = useState<number>()

  const handleDownload = async () => {
    const agreementNode = agreementRef.current
    const billNode = billRef.current
    if (!agreementNode || !billNode || isGenerating) {
      return
    }
    setExportedAt(Math.floor(Date.now() / 1000))
    setIsGenerating(true)
    // Let React flush the stamped export time into the hidden documents
    // before they are rasterized.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    try {
      const blob = await generateOrderPdf(agreementNode, billNode)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${props.detail.order.trade_no}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      throw createServerError(error, t(
        'Failed to generate the PDF, please try again'
      ))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        onClick={() => void handleDownload()}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 aria-hidden='true' className='animate-spin' />
        ) : (
          <FileDown aria-hidden='true' />
        )}
        {t('Download PDF')}
      </Button>
      <div aria-hidden='true' style={hiddenStageStyle}>
        <AgreementDocument ref={agreementRef} detail={props.detail} />
        <BillDocument ref={billRef} detail={props.detail} exportedAt={exportedAt} />
      </div>
    </>
  )
}

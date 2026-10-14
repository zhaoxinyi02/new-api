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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatCurrencyFromUSD, formatLocalCurrencyAmount } from '@/lib/currency'

import { formatTimestamp, getPaymentMethodName, getStatusConfig } from '../../lib/billing'
import type { TopupRecord } from '../../types'

interface OrderDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: TopupRecord | null
  /**
   * Who paid for this order. The wallet page passes the signed-in account, so
   * a user's own order shows their username while an administrator sees the
   * order owner's user id.
   */
  payer: string
}

/**
 * Single-order receipt view. The rows are deliberately one per line so the
 * dialog can be screenshotted as payment proof for reimbursement.
 */
export function OrderDetailDialog(props: OrderDetailDialogProps) {
  const { t } = useTranslation()
  const record = props.record

  const rows: { label: string; value: ReactNode }[] = []
  if (record) {
    rows.push({
      label: t('Order number'),
      value: (
        <span className='flex items-center gap-1'>
          <code className='font-mono text-sm'>{record.trade_no}</code>
          <CopyButton value={record.trade_no} />
        </span>
      ),
    })
    rows.push({ label: t('Payer'), value: props.payer })
    rows.push({
      label: t('Payment Method'),
      value: getPaymentMethodName(record.payment_method, t),
    })
    rows.push({
      label: t('Amount to pay'),
      value: formatLocalCurrencyAmount(record.money),
    })
    rows.push({
      label: t('Quota'),
      value: formatCurrencyFromUSD(record.amount, {
        digitsLarge: 2,
        digitsSmall: 2,
        abbreviate: false,
      }),
    })
    rows.push({
      label: t('Status'),
      value: (
        <StatusBadge
          label={t(getStatusConfig(record.status).label)}
          variant={getStatusConfig(record.status).variant}
          showDot
          copyable={false}
        />
      ),
    })
    rows.push({
      label: t('Created at'),
      value: formatTimestamp(record.create_time),
    })
    if (record.complete_time) {
      rows.push({
        label: t('Paid at'),
        value: formatTimestamp(record.complete_time),
      })
    }
    if (record.note) {
      rows.push({
        label: t('Payment note'),
        value: (
          <span className='break-all whitespace-pre-wrap'>{record.note}</span>
        ),
      })
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Order details')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-1'
      footer={
        <Button onClick={() => props.onOpenChange(false)}>{t('Close')}</Button>
      }
    >
      <div className='divide-y py-2'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='flex items-start justify-between gap-4 py-2.5'
          >
            <span className='text-muted-foreground shrink-0 text-sm'>
              {row.label}
            </span>
            <span className='text-right text-sm font-medium break-all'>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

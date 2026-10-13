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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import type { OfflineOrder } from '../../types'

interface OfflinePayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OfflineOrder | null
}

// Known bank fields rendered in a stable order; unknown keys are appended so
// operators can add extra收款信息 through OFFLINE_PAY_INFO without a code change.
const FIELD_ORDER = ['holder', 'bank', 'branch', 'account']

function fieldLabel(key: string, t: (k: string) => string): string {
  switch (key) {
    case 'holder':
      return t('Account name')
    case 'bank':
      return t('Bank')
    case 'branch':
      return t('Branch')
    case 'account':
      return t('Account number')
    default:
      return key
  }
}

export function OfflinePayDialog({
  open,
  onOpenChange,
  order,
}: OfflinePayDialogProps) {
  const { t } = useTranslation()
  const info = order?.pay_info ?? {}
  const note = info.tip || info.remark || info.text
  const orderedKeys = [
    ...FIELD_ORDER.filter((key) => info[key]),
    ...Object.keys(info).filter(
      (key) =>
        !FIELD_ORDER.includes(key) &&
        key !== 'tip' &&
        key !== 'remark' &&
        key !== 'text'
    ),
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Corporate bank transfer')}
      description={t(
        'Transfer to the account below and put the order number in the remark.'
      )}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      titleClassName='text-xl font-semibold'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <Button onClick={() => onOpenChange(false)}>
          {t('I have completed the transfer')}
        </Button>
      }
    >
      <div className='space-y-4 py-3 sm:space-y-5 sm:py-4'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-sm'>{t('Amount to pay')}</span>
          <span className='text-2xl font-semibold'>{order?.money}</span>
        </div>

        <div className='flex items-center justify-between gap-3'>
          <span className='text-muted-foreground text-sm'>{t('Order number')}</span>
          <span className='flex items-center gap-1'>
            <code className='font-mono text-sm'>{order?.trade_no}</code>
            {order?.trade_no && <CopyButton value={order.trade_no} />}
          </span>
        </div>

        {orderedKeys.length > 0 && (
          <div className='space-y-2 border-t pt-4'>
            {orderedKeys.map((key) => (
              <div key={key} className='flex items-start justify-between gap-3'>
                <span className='text-muted-foreground text-sm'>
                  {fieldLabel(key, t)}
                </span>
                <span className='text-right font-medium break-all'>
                  {info[key]}
                </span>
              </div>
            ))}
          </div>
        )}

        {note && (
          <p className='bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-wrap'>
            {note}
          </p>
        )}

        <p className='text-muted-foreground text-xs'>
          {t(
            'After the transfer is received, an administrator will credit your balance. Include the order number in the remark to speed this up.'
          )}
        </p>
      </div>
    </Dialog>
  )
}

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

import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TitledCard } from '@/components/ui/titled-card'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
} from '@/lib/currency'

import { getStatusConfig } from '../../lib/billing'
import type { TopupRecord } from '../../types'

/**
 * Order line items. A top-up order is always one prepaid credit purchase, so
 * the table repeats the order amounts per product as the reimbursement form
 * expects them.
 */
export function ReceiptItemsCard(props: { order: TopupRecord }) {
  const { t } = useTranslation()
  const statusConfig = getStatusConfig(props.order.status)
  const money = formatLocalCurrencyAmount(props.order.money)
  const noDeduction = `-${formatLocalCurrencyAmount(0)}`
  const credited = formatCurrencyFromUSD(props.order.amount, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })

  return (
    <TitledCard title={t('Order items')} disableHoverEffect>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Product')}</TableHead>
            <TableHead>{t('Configuration')}</TableHead>
            <TableHead>{t('Payment Method')}</TableHead>
            <TableHead className='text-right'>{t('Quantity')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead className='text-right'>{t('Original amount')}</TableHead>
            <TableHead className='text-right'>{t('Discount amount')}</TableHead>
            <TableHead className='text-right'>
              {t('Voucher deduction')}
            </TableHead>
            <TableHead className='text-right'>
              {t('Points deduction')}
            </TableHead>
            <TableHead className='text-right'>{t('Amount to pay')}</TableHead>
            <TableHead className='text-right'>{t('Amount paid')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{t('Wallet top-up')}</TableCell>
            <TableCell>
              {t('Credits added')} {credited}
            </TableCell>
            <TableCell>{t('Prepaid')}</TableCell>
            <TableCell className='text-right'>1</TableCell>
            <TableCell>
              <StatusBadge
                label={t(statusConfig.label)}
                variant={statusConfig.variant}
                size='sm'
                copyable={false}
              />
            </TableCell>
            <TableCell className='text-right'>{money}</TableCell>
            <TableCell className='text-right'>{noDeduction}</TableCell>
            <TableCell className='text-right'>{noDeduction}</TableCell>
            <TableCell className='text-right'>{noDeduction}</TableCell>
            <TableCell className='text-right'>{money}</TableCell>
            <TableCell className='text-right'>{money}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TitledCard>
  )
}

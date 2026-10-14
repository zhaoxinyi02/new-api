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

import { Separator } from '@/components/ui/separator'
import { TitledCard } from '@/components/ui/titled-card'
import type { SubscriptionPlan } from '@/features/subscriptions/types'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
} from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import type { TopupRecord } from '../../types'
import { ReceiptRow } from './receipt-row'

/**
 * Order amount breakdown. The order flow has no discounts or promotions, so the
 * deduction rows are always zero; they stay visible because the receipt is used
 * as payment proof and the reimbursement form asks for every amount.
 */
export function ReceiptAmountCard(props: {
  order: TopupRecord
  plan?: SubscriptionPlan | null
}) {
  const { t } = useTranslation()
  const money = formatLocalCurrencyAmount(props.order.money)
  const noDeduction = `-${formatLocalCurrencyAmount(0)}`
  // A plan purchase credits plan quota instead of wallet balance.
  const credited = props.plan
    ? formatQuota(props.plan.total_amount)
    : formatCurrencyFromUSD(props.order.amount, {
        digitsLarge: 2,
        digitsSmall: 2,
        abbreviate: false,
      })

  return (
    <TitledCard title={t('Amount to pay')} disableHoverEffect>
      <p className='text-3xl font-semibold tracking-tight sm:text-4xl'>
        {money}
      </p>
      <Separator className='my-3' />
      <div className='divide-y'>
        <ReceiptRow label={t('Original amount')} value={money} />
        <ReceiptRow label={t('Discount amount')} value={noDeduction} />
        <ReceiptRow label={t('Voucher deduction')} value={noDeduction} />
        <ReceiptRow
          label={t('Points deduction')}
          value={t('{{amount}} ({{points}} points)', {
            amount: noDeduction,
            points: 0,
          })}
        />
        <ReceiptRow label={t('Amount paid')} value={money} />
        <ReceiptRow
          label={props.plan ? t('Plan Quota') : t('Credits added')}
          value={credited}
        />
      </div>
    </TitledCard>
  )
}

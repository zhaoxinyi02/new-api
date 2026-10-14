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
import { StatusBadge } from '@/components/status-badge'
import { useStatus } from '@/hooks/use-status'
import { formatLocalCurrencyAmount } from '@/lib/currency'

import {
  formatTimestamp,
  getPaymentMethodName,
  getStatusConfig,
} from '../../lib/billing'
import type { TopupOrderDetail } from '../../types'
import { ReceiptAmountCard } from './receipt-amount-card'
import { ReceiptInfoCard, type ReceiptField } from './receipt-info-card'
import { ReceiptItemsCard } from './receipt-items-card'
import { ReceiptPlanCard } from './receipt-plan-card'

/**
 * Full order receipt: order number and status, the amount breakdown, the order
 * and payment details, and the line item table. Every value comes from the
 * stored order, so the page can be screenshotted as payment proof.
 */
export function OrderReceipt(props: { detail: TopupOrderDetail }) {
  const { t } = useTranslation()
  const { status } = useStatus()

  const order = props.detail.order
  const statusConfig = getStatusConfig(order.status)
  const payer = props.detail.payer || `${t('User ID')}: ${order.user_id}`
  const seller = props.detail.seller
  const salesChannel = status?.system_name

  const orderFields: ReceiptField[] = [
    { label: t('Order type'), value: t('New purchase') },
    { label: t('Order ID'), value: order.id, mono: true },
    { label: t('Created at'), value: formatTimestamp(order.create_time) },
    { label: t('Payment Method'), value: t('Prepaid') },
    { label: t('Order account'), value: `${t('User ID')}: ${order.user_id}` },
    { label: t('Buyer account'), value: payer },
    { label: t('Payer account'), value: payer },
  ]
  if (salesChannel) {
    orderFields.push({ label: t('Sales channel'), value: salesChannel })
  }
  if (seller) {
    orderFields.push({ label: t('Seller account'), value: seller })
    orderFields.push({ label: t('Service entity'), value: seller })
  }

  const paymentFields: ReceiptField[] = [
    { label: t('Transaction ID'), value: order.trade_no, mono: true },
    {
      label: t('Payment channel'),
      value: getPaymentMethodName(order.payment_method, t),
    },
    { label: t('Transaction type'), value: t('Consumption') },
    { label: t('Payment fee'), value: formatLocalCurrencyAmount(order.money) },
    { label: t('Paid at'), value: formatTimestamp(order.complete_time ?? 0) },
  ]
  if (order.note) {
    paymentFields.push({ label: t('Payment note'), value: order.note })
  }

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-sm'>
          {t('Order number')}
        </span>
        <code className='font-mono text-sm font-medium'>{order.trade_no}</code>
        <CopyButton value={order.trade_no} />
        <StatusBadge
          label={t(statusConfig.label)}
          variant={statusConfig.variant}
          copyable={false}
        />
      </div>

      <ReceiptAmountCard order={order} plan={props.detail.plan} />

      {props.detail.plan && (
        <ReceiptPlanCard
          plan={props.detail.plan}
          subscription={props.detail.subscription}
        />
      )}

      <div className='grid gap-4 xl:grid-cols-2 xl:items-start'>
        <ReceiptInfoCard title={t('Basic information')} fields={orderFields} />
        <ReceiptInfoCard
          title={t('Payment information')}
          fields={paymentFields}
        />
      </div>

      <ReceiptItemsCard order={order} plan={props.detail.plan} />
    </>
  )
}

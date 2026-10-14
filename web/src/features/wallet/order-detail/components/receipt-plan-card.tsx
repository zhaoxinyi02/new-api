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

import { formatDuration, formatResetPeriod } from '@/features/subscriptions/lib'
import type {
  SubscriptionPlan,
  UserSubscription,
} from '@/features/subscriptions/types'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import { formatTimestamp } from '../../lib/billing'
import { ReceiptInfoCard, type ReceiptField } from './receipt-info-card'

/**
 * Plan purchase block. An offline payment can be applied to a plan instead of a
 * wallet credit; the receipt then shows which plan was bought, how much quota it
 * includes, and how long the customer can use it.
 */
export function ReceiptPlanCard(props: {
  plan: SubscriptionPlan
  subscription?: UserSubscription | null
}) {
  const { t } = useTranslation()
  const plan = props.plan
  const subscription = props.subscription

  const fields: ReceiptField[] = [{ label: t('Plan Name'), value: plan.title }]
  if (plan.subtitle) {
    fields.push({ label: t('Plan Subtitle'), value: plan.subtitle })
  }
  fields.push({
    label: t('Plan Price'),
    value: formatLocalCurrencyAmount(plan.price_amount),
  })
  fields.push({
    label: t('Plan Quota'),
    value:
      plan.total_amount > 0 ? formatQuota(plan.total_amount) : t('Unlimited'),
  })
  fields.push({
    label: t('Reset Period'),
    value: formatResetPeriod(plan, t),
  })

  if (subscription) {
    fields.push({
      label: t('Status'),
      value: subscription.status === 'active' ? t('Active') : t('Expired'),
    })
    fields.push({
      label: t('Quota used'),
      value: formatQuota(subscription.amount_used),
    })
    fields.push({
      label: t('Validity Period'),
      value: `${formatTimestamp(subscription.start_time)} ~ ${formatTimestamp(subscription.end_time)}`,
    })
  } else {
    fields.push({ label: t('Validity Period'), value: formatDuration(plan, t) })
  }

  return <ReceiptInfoCard title={t('Plan information')} fields={fields} />
}

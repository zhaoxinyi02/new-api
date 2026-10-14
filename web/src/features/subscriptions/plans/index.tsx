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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { SubscriptionPlansCard } from '@/features/wallet/components/subscription-plans-card'
import { useTopupInfo } from '@/features/wallet/hooks'
import { getSelf } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

/**
 * 套餐页：查看当前套餐使用情况，并直接付款购买套餐。
 *
 * 套餐是独立购买的商品——付款走扫码付款/对公转账（或管理员配置的在线渠道），
 * 不从余额扣款；余额只在钱包里充值。
 */
export function Plans() {
  const { t } = useTranslation()
  const { topupInfo } = useTopupInfo()
  const userQuery = useQuery({
    queryKey: ['user', 'self'],
    queryFn: async () => {
      const response = await getSelf()
      if (!response.success) {
        throw createServerError(response, t('Failed to fetch user information'))
      }
      return response.data
    },
    meta: { errorToast: false },
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Plans')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Buy a plan and pay directly by QR code or bank transfer; the plan starts once the administrator confirms your payment. To top up your balance, use the wallet.'
            )}
          </p>
          <SubscriptionPlansCard
            topupInfo={topupInfo}
            userQuota={userQuery.data?.quota}
            onPurchaseSuccess={async () => {
              await userQuery.refetch()
            }}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

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
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import { useOrderDetail } from '../hooks/use-order-detail'
import { OrderReceipt } from './components/order-receipt'

/**
 * Standalone order detail page. It replaces the old dialog so an order receipt
 * is a full page that can be linked to, refreshed, and screenshotted.
 */
export function WalletOrderDetail(props: { tradeNo: string }) {
  const { t } = useTranslation()
  const orderQuery = useOrderDetail(props.tradeNo)

  let body = <LoadingState message={t('Loading...')} />
  if (orderQuery.isError) {
    body = (
      <ErrorState
        title={t('Order not found')}
        description={t(
          'The order does not exist, or you do not have permission to view it'
        )}
        onRetry={() => void orderQuery.refetch()}
      />
    )
  } else if (orderQuery.data) {
    body = <OrderReceipt detail={orderQuery.data} />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Order details')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' size='sm' render={<Link to='/wallet' />}>
          <ArrowLeft aria-hidden='true' />
          {t('Back to wallet')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-5'>
          {body}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

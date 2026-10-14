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

import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { getTopupOrderDetail } from '../api'

// ============================================================================
// Order Detail Hook
// ============================================================================

/**
 * Load one top-up order receipt.
 *
 * A missing order and another account's order are both refused by the server,
 * and the page renders that as its own empty state, so the shared query client
 * must not raise a toast for this query.
 */
export function useOrderDetail(tradeNo: string) {
  return useQuery({
    queryKey: ['wallet', 'order-detail', tradeNo],
    queryFn: async () => {
      const response = requireServerSuccess(await getTopupOrderDetail(tradeNo))
      if (!response.data) {
        throw createServerError(response, 'Order not found')
      }
      return response.data
    },
    enabled: tradeNo !== '',
    retry: false,
    staleTime: 30_000,
    meta: { errorToast: false },
  })
}

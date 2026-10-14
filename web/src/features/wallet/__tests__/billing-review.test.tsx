import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { BillingHistoryDialog } from '@/features/wallet/components/dialogs/billing-history-dialog'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

vi.mock('@/hooks/use-admin', () => ({ useIsAdmin: () => true }))

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 3,
        items: [
          {
            id: 1,
            user_id: 8,
            amount: 10,
            money: 73,
            trade_no: 'OFF-review-1',
            payment_method: 'offline',
            payment_provider: 'offline',
            note: '微信流水 12345',
            create_time: 1,
            status: 'pending',
          },
          {
            id: 2,
            user_id: 8,
            amount: 5,
            money: 36.5,
            trade_no: 'EPAY-review-2',
            payment_method: 'alipay',
            create_time: 2,
            status: 'pending',
          },
          {
            id: 3,
            user_id: 7,
            amount: 20,
            money: 20,
            trade_no: 'OFF-review-3',
            payment_method: 'offline_qr',
            payment_provider: 'offline',
            create_time: 3,
            complete_time: 4,
            status: 'success',
          },
        ],
      },
    },
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } })
})

/**
 * The order details button is a typed route link, so the dialog needs a router
 * context. The order route is stubbed: this suite only asserts the navigation.
 */
function renderDialog() {
  const root = createRootRoute()
  const walletRoute = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => <BillingHistoryDialog open onOpenChange={vi.fn()} />,
  })
  const orderRoute = createRoute({
    getParentRoute: () => root,
    path: '/wallet/order/$tradeNo',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([walletRoute, orderRoute]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>
  )
  return router
}

it('shows the payment note and offline review actions for pending orders', async () => {
  renderDialog()
  expect(await screen.findByText('微信流水 12345')).toBeVisible()
  expect(screen.getByRole('button', { name: '通过' })).toBeVisible()
  expect(screen.getByRole('button', { name: '拒绝' })).toBeVisible()
  expect(screen.getByRole('button', { name: '补单' })).toBeVisible()
})

it('rejects an offline order through the reject endpoint after confirmation', async () => {
  const user = userEvent.setup()
  renderDialog()
  await screen.findByText('OFF-review-1')

  await user.click(screen.getByRole('button', { name: '拒绝' }))
  const confirmDialog = screen.getByRole('alertdialog')
  expect(within(confirmDialog).getByText(/不会到账/)).toBeVisible()

  const rejectButtons = within(confirmDialog).getAllByRole('button', {
    name: '拒绝',
  })
  const confirmRejectButton = rejectButtons.at(-1)
  if (!confirmRejectButton) throw new Error('reject confirm button missing')
  await user.click(confirmRejectButton)

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith('/api/user/topup/reject', {
      trade_no: 'OFF-review-1',
    })
  })
})

it('completes a pending order through the complete endpoint after confirmation', async () => {
  const user = userEvent.setup()
  renderDialog()
  await screen.findByText('OFF-review-1')

  await user.click(screen.getByRole('button', { name: '通过' }))
  const confirmDialog = screen.getByRole('alertdialog')
  await user.click(within(confirmDialog).getByRole('button', { name: '确认' }))

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith('/api/user/topup/complete', {
      trade_no: 'OFF-review-1',
    })
  })
})

it('labels a QR order as scan-to-pay and shows its payment time', async () => {
  renderDialog()
  await screen.findByText('OFF-review-3')

  expect(screen.getByText('扫码付款')).toBeVisible()
  // Only the completed order carries a payment time.
  expect(screen.getByText('支付时间')).toBeVisible()
  expect(screen.getAllByText('支付时间')).toHaveLength(1)
})

it('opens the standalone order detail page from the details button', async () => {
  const user = userEvent.setup()
  const router = renderDialog()
  await screen.findByText('OFF-review-3')

  // The details control is a Button primitive rendered as a router Link, so it
  // keeps the button role and exposes the order URL as its href.
  const details = screen.getByRole('button', { name: '详情 OFF-review-3' })
  expect(details).toHaveAttribute('href', '/wallet/order/OFF-review-3')

  await user.click(details)
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/wallet/order/OFF-review-3')
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { WalletOrderDetail } from '@/features/wallet/order-detail'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

const TRADE_NO = 'OFF9NO1791897638XJL55d'

// The credited amount differs from the paid amount so the receipt has to read
// both fields from the order instead of echoing one value everywhere.
const orderDetail = {
  order: {
    id: 14,
    user_id: 1,
    amount: 146,
    money: 73,
    trade_no: TRADE_NO,
    payment_method: 'offline_qr',
    payment_provider: 'offline',
    note: '微信流水 12345',
    create_time: 1791897638,
    complete_time: 1791897700,
    status: 'success',
  },
  payer: 'lansuan',
  seller: '湖北省澜算科技有限责任公司',
}

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

/** Mock `/api/status` (branding) and the order endpoint behind one axios spy. */
function mockApi(orderResponse: () => Promise<{ data: unknown }>): void {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url.startsWith('/api/user/topup/')) {
      return (await orderResponse()) as never
    }
    return {
      data: { success: true, data: { system_name: '澜算中转站' } },
    } as never
  })
}

function renderPage() {
  const root = createRootRoute()
  const orderRoute = createRoute({
    getParentRoute: () => root,
    path: '/wallet/order/$tradeNo',
    component: () => <WalletOrderDetail tradeNo={TRADE_NO} />,
  })
  const walletRoute = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([orderRoute, walletRoute]),
    history: createMemoryHistory({
      initialEntries: [`/wallet/order/${TRADE_NO}`],
    }),
  })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

it('renders every receipt section from the order returned by the API', async () => {
  mockApi(async () => ({ data: { success: true, data: orderDetail } }))

  renderPage()

  // The order number is shown in the header and again as the transaction id.
  expect((await screen.findAllByText(TRADE_NO)).length).toBeGreaterThan(1)
  // Status appears on the page header and in the line item row.
  expect(screen.getAllByText('成功').length).toBeGreaterThan(1)

  // 应付金额 also labels a line item column, so only presence matters here.
  for (const section of ['应付金额', '基本信息', '支付信息', '订单明细']) {
    expect(screen.getAllByText(section).length).toBeGreaterThan(0)
  }

  // Order identity and ownership.
  expect(screen.getByText('新购')).toBeVisible()
  // The sales channel is read from the shared /api/status payload.
  expect(await screen.findByText('澜算中转站')).toBeVisible()
  expect(screen.getByText('用户 ID: 1')).toBeVisible()
  expect(screen.getAllByText('lansuan')).toHaveLength(2)
  expect(screen.getAllByText('湖北省澜算科技有限责任公司')).toHaveLength(2)

  // Payment section.
  expect(screen.getByText('扫码付款')).toBeVisible()
  expect(screen.getByText('消费')).toBeVisible()
  expect(screen.getByText('微信流水 12345')).toBeVisible()

  // Amounts: the paid amount and the credited amount are different values, and
  // the display currency follows the active configuration.
  expect(screen.getAllByText(/[$¥]\s?73(\.\d+)?$/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/[$¥]\s?146(\.\d+)?$/).length).toBeGreaterThan(0)

  // Line item row.
  expect(screen.getByText('余额充值')).toBeVisible()

  const backToWallet = screen.getByRole('button', { name: /返回钱包/ })
  expect(backToWallet).toHaveAttribute('href', '/wallet')
})

it('shows the not-found state when the order cannot be loaded', async () => {
  mockApi(async () => {
    throw new Error('Request failed with status code 404')
  })

  renderPage()

  expect(await screen.findByText('订单不存在')).toBeVisible()
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible()
})

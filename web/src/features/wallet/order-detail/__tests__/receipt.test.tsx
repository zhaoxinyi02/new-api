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

// An offline payment applied to a plan keeps its trade number, carries no wallet
// credit, and owns a subscription order pointing at the plan that was bought.
const PLAN_TRADE_NO = 'OFF17NO1791961740ifaAJZ'
const planPurchaseDetail = {
  order: {
    ...orderDetail.order,
    id: 38,
    user_id: 17,
    amount: 0,
    money: 1000,
    trade_no: PLAN_TRADE_NO,
    create_time: 1791961740,
    complete_time: 1791961899,
  },
  payer: 'zhanwei',
  seller: '湖北省澜算科技有限责任公司',
  plan: {
    id: 1,
    title: '标准包月套餐',
    subtitle: '¥1000 / 月，含 ¥1000 等值用量',
    price_amount: 1000,
    currency: 'CNY',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'never',
    enabled: true,
    sort_order: 0,
    max_purchase_per_user: 0,
    total_amount: 500000000,
  },
  subscription: {
    id: 1,
    user_id: 17,
    plan_id: 1,
    status: 'active',
    source: 'order',
    start_time: 1791961899,
    end_time: 1794640299,
    amount_total: 500000000,
    amount_used: 0,
  },
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

  // A plain wallet top-up has no plan block.
  expect(screen.queryByText('套餐信息')).toBeNull()
})

it('renders a plan purchase instead of a wallet credit', async () => {
  mockApi(async () => ({ data: { success: true, data: planPurchaseDetail } }))

  renderPage()

  expect(await screen.findByText('套餐信息')).toBeVisible()

  // The plan block names the plan and its entitlement.
  expect(screen.getAllByText('标准包月套餐').length).toBeGreaterThan(0)
  expect(screen.getByText('¥1000 / 月，含 ¥1000 等值用量')).toBeVisible()
  // The plan quota is the credited amount, shown on both the amount breakdown
  // and the plan block.
  expect(screen.getAllByText('套餐额度').length).toBeGreaterThan(0)
  expect(screen.getByText('已用额度')).toBeVisible()
  expect(screen.getByText('生效')).toBeVisible()
  expect(screen.getByText(/~ \d{4}-\d{2}-\d{2}/)).toBeVisible()

  // The paid amount is unchanged, while the credited wallet balance is gone.
  expect(screen.getAllByText(/[$¥]\s?1,?000(\.\d+)?/).length).toBeGreaterThan(0)

  // The line item describes the plan purchase, not a top-up.
  expect(screen.getByText(/套餐购买/)).toBeVisible()
  expect(screen.queryByText('余额充值')).toBeNull()
})

it('shows the not-found state when the order cannot be loaded', async () => {
  mockApi(async () => {
    throw new Error('Request failed with status code 404')
  })

  renderPage()

  expect(await screen.findByText('订单不存在')).toBeVisible()
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible()
})

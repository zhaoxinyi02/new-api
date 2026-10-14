import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { SubscriptionPurchaseDialog } from '@/features/subscriptions/components/dialogs/subscription-purchase-dialog'
import type { PlanRecord } from '@/features/subscriptions/types'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

const paySubscriptionOffline = vi.fn()

vi.mock('@/features/subscriptions/api', () => ({
  paySubscriptionOffline: (...args: unknown[]) =>
    paySubscriptionOffline(...args),
  paySubscriptionBalance: vi.fn(),
  paySubscriptionStripe: vi.fn(),
  paySubscriptionCreem: vi.fn(),
  paySubscriptionEpay: vi.fn(),
  paySubscriptionWaffoPancake: vi.fn(),
}))

const i18n = createInstance()
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

beforeEach(async () => {
  paySubscriptionOffline.mockReset()
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

const offlineMethods = [
  { name: '扫码付款', type: 'offline_qr' },
  { name: '对公转账', type: 'offline' },
]

const planRecord: PlanRecord = {
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
    allow_balance_pay: true,
    allow_wallet_overflow: true,
  },
}

function renderDialog() {
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <SubscriptionPurchaseDialog
          open
          onOpenChange={vi.fn()}
          plan={planRecord}
          offlineMethods={offlineMethods}
          epayMethods={[{ name: '支付宝', type: 'alipay' }]}
          enableOnlineTopUp
        />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

it('offers 扫码付款 before 对公转账 as direct plan payments', () => {
  renderDialog()
  const buttonNames = screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())
  expect(buttonNames).toContain('扫码付款')
  expect(buttonNames).toContain('对公转账')
  expect(buttonNames.indexOf('扫码付款')).toBeLessThan(
    buttonNames.indexOf('对公转账')
  )
  expect(
    screen.getByText('直接支付套餐费用，管理员确认收款后套餐即生效。')
  ).toBeVisible()
})

it('creates a pending plan order paid by QR code and shows the pay info', async () => {
  const user = userEvent.setup()
  paySubscriptionOffline.mockResolvedValue({
    success: true,
    data: {
      trade_no: 'SUB17NO1791975000abc123',
      amount: 1000,
      money: '1000.00',
      payment_method: 'offline_qr',
      pay_info: {
        holder: '湖北省澜算科技有限责任公司',
        qr_image: 'data:image/png;base64,AAAA',
      },
    },
  })

  renderDialog()
  await user.click(screen.getByRole('button', { name: '扫码付款' }))

  await waitFor(() =>
    expect(paySubscriptionOffline).toHaveBeenCalledWith({
      plan_id: 1,
      payment_method: 'offline_qr',
    })
  )
  // The plan purchase must never be charged to the wallet balance.
  expect(
    screen.getByText('按下方金额付款，管理员确认订单后将为你的账号开通套餐。')
  ).toBeVisible()
  expect(screen.getByText('1000.00')).toBeVisible()
  expect(screen.getByText('SUB17NO1791975000abc123')).toBeVisible()
})

it('creates a bank transfer order when 对公转账 is chosen', async () => {
  const user = userEvent.setup()
  paySubscriptionOffline.mockResolvedValue({
    success: true,
    data: {
      trade_no: 'SUB17NO1791975001def456',
      amount: 1000,
      money: '1000.00',
      payment_method: 'offline',
      pay_info: { holder: '湖北省澜算科技有限责任公司', bank: '中国农业银行' },
    },
  })

  renderDialog()
  await user.click(screen.getByRole('button', { name: '对公转账' }))

  await waitFor(() =>
    expect(paySubscriptionOffline).toHaveBeenCalledWith({
      plan_id: 1,
      payment_method: 'offline',
    })
  )
  expect(
    screen.getByText(
      '向下方账户转账，并在备注里填写订单号，管理员确认后套餐生效。'
    )
  ).toBeVisible()
  expect(screen.getByText('中国农业银行')).toBeVisible()
})

it('surfaces a failed order creation instead of a fake receipt', async () => {
  const user = userEvent.setup()
  paySubscriptionOffline.mockResolvedValue({
    success: false,
    message: '套餐不存在',
  })

  renderDialog()
  await user.click(screen.getByRole('button', { name: '对公转账' }))

  await waitFor(() => expect(paySubscriptionOffline).toHaveBeenCalled())
  expect(screen.queryByText('1000.00')).not.toBeInTheDocument()
})

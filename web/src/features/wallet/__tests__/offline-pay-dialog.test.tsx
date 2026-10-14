import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { OfflinePayDialog } from '@/features/wallet/components/dialogs/offline-pay-dialog'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import type { OfflineOrder } from '../types'

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

const baseOrder: OfflineOrder = {
  trade_no: 'OFF1NO1abc123',
  amount: 10,
  money: '73.00',
  pay_info: {
    holder: '湖北省澜算科技有限责任公司',
    bank: '中国农业银行',
  },
}

it('renders the payment QR code without leaking the image payload as text', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <OfflinePayDialog
        open
        onOpenChange={vi.fn()}
        order={{
          ...baseOrder,
          pay_info: { ...baseOrder.pay_info, qr_image: 'data:image/png;base64,AAAA' },
        }}
      />
    </I18nextProvider>
  )
  expect(screen.getByRole('img', { name: '收款二维码' })).toHaveAttribute(
    'src',
    'data:image/png;base64,AAAA'
  )
  expect(screen.queryByText(/AAAA/)).not.toBeInTheDocument()
  expect(screen.getByText('73.00')).toBeVisible()
  expect(screen.getByText('OFF1NO1abc123')).toBeVisible()
})

it('omits the QR section when no QR image is configured', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <OfflinePayDialog open onOpenChange={vi.fn()} order={baseOrder} />
    </I18nextProvider>
  )
  expect(screen.queryByRole('img', { name: '收款二维码' })).not.toBeInTheDocument()
  expect(screen.getByText('湖北省澜算科技有限责任公司')).toBeVisible()
})

it('submits the payment note for the current order', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  render(
    <I18nextProvider i18n={i18n}>
      <OfflinePayDialog open onOpenChange={vi.fn()} order={baseOrder} />
    </I18nextProvider>
  )

  await user.type(
    screen.getByLabelText('支付凭证'),
    '微信已转，收款尾号 6789'
  )
  await user.click(screen.getByRole('button', { name: '提交凭证' }))

  await waitFor(() => {
    expect(post).toHaveBeenCalledWith('/api/user/topup/offline/note', {
      trade_no: 'OFF1NO1abc123',
      note: '微信已转，收款尾号 6789',
    })
  })
  expect(await screen.findByText('微信已转，收款尾号 6789')).toBeVisible()
})

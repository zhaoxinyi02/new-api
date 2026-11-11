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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import { OrderPdfButton } from '@/features/wallet/order-detail/pdf/order-pdf-button'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import type { TopupOrderDetail } from '@/features/wallet/types'

const i18n = createInstance()

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
  vi.stubGlobal('location', { host: 'api.lansuan.cc' })
})

const detail: TopupOrderDetail = {
  order: {
    id: 1,
    user_id: 42,
    amount: 10,
    money: 73,
    trade_no: 'OFF1NO1abc123',
    payment_method: 'offline',
    create_time: 1760000000,
    complete_time: 1760000600,
    status: 'success',
  },
  payer: '詹炜',
  seller: '湖北澜算科技有限公司',
  plan: null,
  subscription: null,
}

vi.mock('@/features/wallet/order-detail/pdf/generate-order-pdf', () => ({
  generateOrderPdf: vi.fn().mockResolvedValue(new Blob(['pdf'])),
}))

it('renders the download action with the stamped documents kept off-screen', async () => {
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <OrderPdfButton detail={detail} />
    </I18nextProvider>
  )

  const button = screen.getByRole('button', { name: '下载 PDF' })
  expect(button).toBeEnabled()

  // The hidden rasterization stage must stay out of the accessibility tree
  // and out of sight.
  const stage = button.parentElement?.querySelector('div[aria-hidden]')
  expect(stage).not.toBeNull()
  expect(stage).toHaveAttribute('aria-hidden', 'true')

  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  const clickSpy = vi.fn()
  const anchorSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation(((tag: string) => {
      if (tag === 'a') {
        return { click: clickSpy } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    }) as typeof document.createElement)

  await user.click(button)
  await vi.waitFor(() => {
    expect(clickSpy).toHaveBeenCalled()
  })
  expect(anchorSpy.mock.calls.some(([tag]) => tag === 'a')).toBe(true)
})

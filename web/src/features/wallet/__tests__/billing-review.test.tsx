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
        total: 2,
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
        ],
      },
    },
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } })
})

it('shows the payment note and offline review actions for pending orders', async () => {
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
  expect(await screen.findByText('微信流水 12345')).toBeVisible()
  expect(screen.getByRole('button', { name: '通过' })).toBeVisible()
  expect(screen.getByRole('button', { name: '拒绝' })).toBeVisible()
  expect(screen.getByRole('button', { name: '补单' })).toBeVisible()
})

it('rejects an offline order through the reject endpoint after confirmation', async () => {
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
  await screen.findByText('OFF-review-1')

  await user.click(screen.getByRole('button', { name: '拒绝' }))
  const confirmDialog = screen.getByRole('alertdialog')
  expect(
    within(confirmDialog).getByText(/不会到账/)
  ).toBeVisible()

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
  render(
    <I18nextProvider i18n={i18n}>
      <BillingHistoryDialog open onOpenChange={vi.fn()} />
    </I18nextProvider>
  )
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

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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, test } from 'vitest'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PricingSection } from '../pricing-section'

type DisplayType = 'USD' | 'CNY' | 'TOKENS'

const BASE_VALUES = {
  QuotaPerUnit: 500000,
  USDExchangeRate: 1,
  DisplayInCurrencyEnabled: true,
  DisplayTokenStatEnabled: true,
}

function Fixture(props: { displayType: DisplayType }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PricingSection
          defaultValues={{
            ...BASE_VALUES,
            general_setting: { quota_display_type: props.displayType },
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

function renderSection(displayType: DisplayType) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Fixture displayType={displayType} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

test('CNY display names the rate field after the credit unit, not USD', async () => {
  renderSection('CNY')

  expect(
    await screen.findByRole('spinbutton', { name: 'CNY per credit unit' })
  ).toHaveValue(1)
  expect(
    screen.getByText(
      'How many CNY one credit unit is worth (display only; 1 means no conversion)'
    )
  ).toBeVisible()
  expect(screen.queryByText('CNY per USD')).not.toBeInTheDocument()
})

test('USD display keeps the USD exchange-rate wording', async () => {
  renderSection('USD')

  expect(
    await screen.findByRole('spinbutton', { name: 'USD Exchange Rate' })
  ).toHaveValue(1)
  expect(
    screen.getByText(
      'Real exchange rate between USD and your payment gateway currency'
    )
  ).toBeVisible()
  expect(screen.queryByText('CNY per credit unit')).not.toBeInTheDocument()
})

test('token display hides the rate field entirely', async () => {
  renderSection('TOKENS')

  expect(await screen.findByText('Display Mode')).toBeVisible()
  expect(
    screen.queryByRole('spinbutton', { name: 'CNY per credit unit' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('spinbutton', { name: 'USD Exchange Rate' })
  ).not.toBeInTheDocument()
})

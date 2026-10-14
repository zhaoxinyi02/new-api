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
import type { ReactNode } from 'react'

import { TitledCard } from '@/components/ui/titled-card'

import { ReceiptRow } from './receipt-row'

export interface ReceiptField {
  label: string
  value: ReactNode
  /** Render the value in a monospace font, for order and transaction numbers */
  mono?: boolean
}

/**
 * Titled group of receipt fields, used for the order and payment sections.
 */
export function ReceiptInfoCard(props: {
  title: string
  fields: ReceiptField[]
}) {
  return (
    <TitledCard title={props.title} disableHoverEffect>
      <div className='divide-y'>
        {props.fields.map((field) => (
          <ReceiptRow
            key={field.label}
            label={field.label}
            value={field.value}
            mono={field.mono}
          />
        ))}
      </div>
    </TitledCard>
  )
}

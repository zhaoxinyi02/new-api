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

import { cn } from '@/lib/utils'

/**
 * One label/value line of an order receipt. Receipt values are order numbers
 * and amounts that get screenshotted as payment proof, so they keep their full
 * text and wrap instead of being truncated.
 */
export function ReceiptRow(props: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className='flex items-start justify-between gap-4 py-2.5 text-sm'>
      <span className='text-muted-foreground shrink-0'>{props.label}</span>
      <span
        className={cn(
          'min-w-0 text-right font-medium break-all',
          props.mono && 'font-mono'
        )}
      >
        {props.value}
      </span>
    </div>
  )
}

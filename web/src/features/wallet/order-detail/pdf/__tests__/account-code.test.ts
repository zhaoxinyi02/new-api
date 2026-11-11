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
import { describe, expect, it } from 'vitest'

import { deriveAccountCode } from '../account-code'

describe('deriveAccountCode', () => {
  it('produces a stable fixed-width code that hides the raw id', () => {
    expect(deriveAccountCode(17)).toBe('LS8APXGRT1W4')
    expect(deriveAccountCode(17)).toBe(deriveAccountCode(17))
    expect(deriveAccountCode(1)).toMatch(/^LS[0-9A-Z]{10}$/)
    expect(deriveAccountCode(1)).not.toContain('1')
  })

  it('spreads consecutive ids apart so the code leaks no platform scale', () => {
    const codes = [1, 2, 3, 4, 5, 16, 17, 18, 9999, 10000].map(deriveAccountCode)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) {
      expect(code).toMatch(/^LS[0-9A-Z]{10}$/)
    }
  })
})

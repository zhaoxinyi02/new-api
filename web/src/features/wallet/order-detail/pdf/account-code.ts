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

// Salt mixed into the hash so the code cannot be inverted by guessing the
// transform alone.
const ACCOUNT_CODE_SALT = 0x6c_61_6e_73 // "lans"

/**
 * One round of the SplitMix32 finalizer: spreads small integers (like user
 * IDs 1, 2, 3...) uniformly across the 32-bit space.
 */
function splitmix32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x21_f0_aa_ad) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x73_5a_2d_97) >>> 0
  return (x ^ (x >>> 15)) >>> 0
}

/**
 * Deterministic display code for an account, e.g. "LS3KQW8V2M". Printed on
 * invoices instead of the raw user ID so the document carries no signal about
 * how many accounts the platform has. Stable for the lifetime of the account.
 */
export function deriveAccountCode(userId: number): string {
  let value = (userId ^ ACCOUNT_CODE_SALT) >>> 0
  value = splitmix32(value)
  const high = splitmix32(value + 0x9e_37_79_b9)
  // 51 bits from both halves — just under 36^10, so the base36 form is always
  // exactly 10 characters with no truncation or collisions.
  const bits = ((BigInt(value) << 20n) | BigInt(high >>> 12)) & 0x7_ff_ff_ff_ff_ff_ff_fn
  const code = bits.toString(36).toUpperCase().padStart(10, '0')
  return `LS${code}`
}

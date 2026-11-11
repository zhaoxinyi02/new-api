package common

import (
	"strconv"
	"strings"
)

// accountCodeSalt is mixed into the hash so the code cannot be inverted by
// guessing the transform alone.
const accountCodeSalt uint32 = 0x6c_61_6e_73 // "lans"

// splitmix32Round is one round of the SplitMix32 finalizer: it spreads small
// integers (like user IDs 1, 2, 3...) uniformly across the 32-bit space.
func splitmix32Round(x uint32) uint32 {
	x = (x ^ (x >> 16)) * 0x21_f0_aa_ad
	x = (x ^ (x >> 15)) * 0x73_5a_2d_97
	return x ^ (x >> 15)
}

// DeriveAccountCode maps a user ID to a stable display code such as
// "LS8APXGRT1W4". Receipts and invoices print this code instead of the raw ID
// so the documents carry no signal about how many accounts the platform has.
// It matches the frontend derivation byte for byte.
func DeriveAccountCode(userID int) string {
	value := uint32(userID) ^ accountCodeSalt
	value = splitmix32Round(value)
	high := splitmix32Round(value + 0x9e_37_79_b9)
	// 51 bits from both halves — just under 36^10, so the base36 form is
	// always exactly 10 characters with no truncation or collisions.
	bits := (uint64(value)<<20 | uint64(high>>12)) & (uint64(1)<<51 - 1)
	code := strconv.FormatUint(bits, 36)
	for len(code) < 10 {
		code = "0" + code
	}
	return "LS" + strings.ToUpper(code)
}

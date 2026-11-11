package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// The expected value comes from the frontend implementation (account-code.ts),
// so receipts rendered server-side and client-side agree on the same code.
func TestDeriveAccountCodeMatchesFrontend(t *testing.T) {
	assert.Equal(t, "LS8APXGRT1W4", DeriveAccountCode(17))
	assert.Equal(t, "LSB7KS6ACQKN", DeriveAccountCode(1))
	assert.Regexp(t, `^LS[0-9A-Z]{10}$`, DeriveAccountCode(100000))
}

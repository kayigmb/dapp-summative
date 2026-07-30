package auth

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateInviteToken returns a random URL-safe token for an org invite
// link — longer than a wallet nonce (see NonceStore.GenerateNonce) since
// this one lives for days and is shared as a URL, not a one-shot challenge.
func GenerateInviteToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

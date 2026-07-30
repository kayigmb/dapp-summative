package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/ethereum/go-ethereum/crypto"
)

// NonceStore hands out one-time challenge messages per wallet address and
// verifies MetaMask signatures against them. In-memory is enough for a
// single-instance backend; a real deployment would back this with Redis/DB.
type NonceStore struct {
	mu     sync.Mutex
	nonces map[string]string
}

func NewNonceStore() *NonceStore {
	return &NonceStore{nonces: make(map[string]string)}
}

func (s *NonceStore) GenerateNonce(address string) (string, error) {
	address = strings.ToLower(address)

	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(buf)
	message := fmt.Sprintf("ChainTrack wallet verification\nAddress: %s\nNonce: %s", address, nonce)

	s.mu.Lock()
	s.nonces[address] = message
	s.mu.Unlock()

	return message, nil
}

// VerifySignature checks that `signature` was produced by `address` signing
// the previously issued nonce message (standard personal_sign / eth_sign
// format used by MetaMask). Consumes the nonce on success.
func (s *NonceStore) VerifySignature(address, signature string) error {
	address = strings.ToLower(address)

	s.mu.Lock()
	message, ok := s.nonces[address]
	s.mu.Unlock()
	if !ok {
		return errors.New("no pending nonce for this address, request a new one")
	}

	sigBytes, err := hex.DecodeString(strings.TrimPrefix(signature, "0x"))
	if err != nil || len(sigBytes) != 65 {
		return errors.New("malformed signature")
	}
	// go-ethereum's Ecrecover expects the recovery id in [0,1); MetaMask sends [27,28].
	if sigBytes[64] >= 27 {
		sigBytes[64] -= 27
	}

	hash := accountsTextHash([]byte(message))
	pubKey, err := crypto.SigToPub(hash, sigBytes)
	if err != nil {
		return errors.New("could not recover public key from signature")
	}

	recovered := crypto.PubkeyToAddress(*pubKey)
	if !strings.EqualFold(recovered.Hex(), address) {
		return errors.New("signature does not match address")
	}

	s.mu.Lock()
	delete(s.nonces, address)
	s.mu.Unlock()

	return nil
}

// accountsTextHash replicates go-ethereum's accounts.TextHash: the
// "\x19Ethereum Signed Message:\n<len>" prefix MetaMask's personal_sign adds.
func accountsTextHash(data []byte) []byte {
	msg := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(data), data)
	return crypto.Keccak256([]byte(msg))
}

package handlers

import (
	"gorm.io/gorm"

	"be/internal/auth"
	"be/internal/blockchain"
	"be/internal/config"
)

// API holds every dependency handlers need. Passed by value (small struct of
// pointers/strings) into route registration, methods are defined on it.
type API struct {
	DB     *gorm.DB
	Cfg    config.Config
	Nonces *auth.NonceStore
	Chain  blockchain.Client
}

func New(db *gorm.DB, cfg config.Config, chain blockchain.Client) *API {
	return &API{
		DB:     db,
		Cfg:    cfg,
		Nonces: auth.NewNonceStore(),
		Chain:  chain,
	}
}

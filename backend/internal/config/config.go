package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL     string
	JWTSecret       string
	ETHRPCURL       string
	ContractAddress string
	PrivateKey      string
	Port            string
	AdminEmail      string
	AdminPassword   string
	FrontendOrigin  string
}

func Load() Config {
	_ = godotenv.Load()

	return Config{
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://chaintrack:chaintrack@localhost:5488/chaintrack?sslmode=disable"),
		JWTSecret:       getEnv("JWT_SECRET", "dev-secret-change-me"),
		ETHRPCURL:       getEnv("ETH_RPC_URL", "http://127.0.0.1:8545"),
		ContractAddress: os.Getenv("CONTRACT_ADDRESS"),
		PrivateKey:      os.Getenv("PRIVATE_KEY"),
		Port:            getEnv("PORT", "5001"),
		AdminEmail:      getEnv("ADMIN_EMAIL", "admin@chaintrack.test"),
		AdminPassword:   getEnv("ADMIN_PASSWORD", "ChainTrack123!"),
		FrontendOrigin:  getEnv("FRONTEND_ORIGIN", "http://localhost:3000"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

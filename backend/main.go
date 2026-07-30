package main

import (
	"log"

	"github.com/gin-gonic/gin"

	"be/internal/blockchain"
	"be/internal/config"
	"be/internal/db"
	"be/internal/handlers"
	"be/internal/middleware"
	"be/internal/routes"
)

func main() {
	cfg := config.Load()

	database, err := db.Connect(cfg.DatabaseURL, cfg.AdminEmail, cfg.AdminPassword)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}

	chain, err := blockchain.NewEthClient(cfg.ETHRPCURL, cfg.ContractAddress, cfg.PrivateKey)
	if err != nil {
		log.Fatalf("blockchain client init failed: %v (is a Hardhat node running and CONTRACT_ADDRESS/PRIVATE_KEY set?)", err)
	}

	api := handlers.New(database, cfg, chain)

	router := gin.Default()
	router.Use(middleware.CORS(cfg.FrontendOrigin))
	routes.Register(router, api)

	log.Printf("ChainTrack backend listening on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

package blockchain

import "be/internal/models"

// Client is the seam between HTTP handlers and the deployed ChainTrack
// contract. Defined as an interface so handler tests can substitute a fake
// implementation instead of talking to a real chain.
type Client interface {
	CreateShipment(productName, origin, destination, ownerAddress string) (blockchainID uint64, txHash string, err error)
	UpdateStatus(blockchainID uint64, status models.ShipmentStatus) (txHash string, err error)
	TransferOwnership(blockchainID uint64, newOwnerAddress string) (txHash string, err error)
	ConfirmDelivery(blockchainID uint64) (txHash string, err error)
	GetShipment(blockchainID uint64) (ShipmentOnChain, error)
	VerifyShipment(blockchainID uint64) (bool, error)
}

type ShipmentOnChain struct {
	ID          uint64
	ProductName string
	Origin      string
	Destination string
	Owner       string
	Status      models.ShipmentStatus
	Timestamp   int64
}

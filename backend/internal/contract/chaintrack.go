// Package contract loads the compiled ChainTrack ABI (abi.json, copied from
// contract/artifacts after `npx hardhat compile`) so the blockchain package
// can bind to it with go-ethereum's accounts/abi/bind — no abigen binary
// needed, go-ethereum is already a dependency.
package contract

import (
	_ "embed"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

//go:embed abi.json
var abiJSON string

var ABI abi.ABI

func init() {
	parsed, err := abi.JSON(strings.NewReader(abiJSON))
	if err != nil {
		panic("contract: invalid embedded ABI: " + err.Error())
	}
	ABI = parsed
}

// Shipment mirrors the Solidity Shipment struct returned by getShipment.
type Shipment struct {
	Id          *big.Int
	ProductName string
	Origin      string
	Destination string
	Owner       common.Address
	Status      uint8
	Timestamp   *big.Int
}

func Bind(address common.Address, backend bind.ContractBackend) *bind.BoundContract {
	return bind.NewBoundContract(address, ABI, backend, backend, backend)
}

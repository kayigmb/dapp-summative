package blockchain

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"be/internal/contract"
	"be/internal/models"
)

// Backed by a real (or local Hardhat) chain, signs every write with a
// single relayer key — the backend pays gas, not individual wallets.
type EthClient struct {
	eth      *ethclient.Client
	contract *bind.BoundContract
	address  common.Address
	key      *ecdsa.PrivateKey
	from     common.Address
	chainID  *big.Int
}

func NewEthClient(rpcURL, contractAddress, privateKeyHex string) (*EthClient, error) {
	eth, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}

	key, err := crypto.HexToECDSA(trimHexPrefix(privateKeyHex))
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	from := crypto.PubkeyToAddress(key.PublicKey)

	chainID, err := eth.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("fetch chain id: %w", err)
	}

	addr := common.HexToAddress(contractAddress)

	return &EthClient{
		eth:      eth,
		contract: contract.Bind(addr, eth),
		address:  addr,
		key:      key,
		from:     from,
		chainID:  chainID,
	}, nil
}

func trimHexPrefix(s string) string {
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		return s[2:]
	}
	return s
}

func (e *EthClient) transactOpts() (*bind.TransactOpts, error) {
	return bind.NewKeyedTransactorWithChainID(e.key, e.chainID)
}

func (e *EthClient) send(method string, params ...interface{}) (string, error) {
	opts, err := e.transactOpts()
	if err != nil {
		return "", err
	}

	tx, err := e.contract.Transact(opts, method, params...)
	if err != nil {
		return "", fmt.Errorf("%s: %w", method, err)
	}

	receipt, err := bind.WaitMined(context.Background(), e.eth, tx)
	if err != nil {
		return "", fmt.Errorf("%s: waiting for receipt: %w", method, err)
	}
	if receipt.Status == 0 {
		return "", fmt.Errorf("%s: transaction reverted", method)
	}

	return tx.Hash().Hex(), nil
}

func (e *EthClient) CreateShipment(productName, origin, destination, ownerAddress string) (uint64, string, error) {
	owner := common.HexToAddress(ownerAddress)
	opts, err := e.transactOpts()
	if err != nil {
		return 0, "", err
	}

	tx, err := e.contract.Transact(opts, "createShipment", productName, origin, destination, owner)
	if err != nil {
		return 0, "", fmt.Errorf("createShipment: %w", err)
	}

	receipt, err := bind.WaitMined(context.Background(), e.eth, tx)
	if err != nil {
		return 0, "", fmt.Errorf("createShipment: waiting for receipt: %w", err)
	}
	if receipt.Status == 0 {
		return 0, "", errors.New("createShipment: transaction reverted")
	}

	eventID := contract.ABI.Events["ShipmentCreated"].ID
	for _, log := range receipt.Logs {
		// id and owner are `indexed` in the Solidity event, so they live in
		// Topics (topics[0] is the event signature itself), not Data.
		if len(log.Topics) != 3 || log.Topics[0] != eventID {
			continue
		}
		id := new(big.Int).SetBytes(log.Topics[1].Bytes())
		return id.Uint64(), tx.Hash().Hex(), nil
	}

	return 0, "", errors.New("createShipment: ShipmentCreated event not found in receipt")
}

func (e *EthClient) UpdateStatus(blockchainID uint64, status models.ShipmentStatus) (string, error) {
	statusCode, ok := models.StatusOrder[status]
	if !ok {
		return "", fmt.Errorf("unknown status %q", status)
	}
	return e.send("updateStatus", new(big.Int).SetUint64(blockchainID), statusCode)
}

func (e *EthClient) TransferOwnership(blockchainID uint64, newOwnerAddress string) (string, error) {
	return e.send("transferOwnership", new(big.Int).SetUint64(blockchainID), common.HexToAddress(newOwnerAddress))
}

func (e *EthClient) ConfirmDelivery(blockchainID uint64) (string, error) {
	return e.send("confirmDelivery", new(big.Int).SetUint64(blockchainID))
}

func (e *EthClient) GetShipment(blockchainID uint64) (ShipmentOnChain, error) {
	// getShipment returns a single tuple. go-ethereum's Copy special-cases a
	// struct destination with exactly one field as an atomic-value wrapper,
	// which misfires for a multi-field tuple struct like Shipment — so we
	// unpack raw and convert instead of passing &Shipment{} directly.
	var out []interface{}
	if err := e.contract.Call(&bind.CallOpts{}, &out, "getShipment", new(big.Int).SetUint64(blockchainID)); err != nil {
		return ShipmentOnChain{}, err
	}
	shipment := *abi.ConvertType(out[0], new(contract.Shipment)).(*contract.Shipment)

	statusName := models.StatusCreated
	for name, code := range models.StatusOrder {
		if code == shipment.Status {
			statusName = name
			break
		}
	}

	return ShipmentOnChain{
		ID:          shipment.Id.Uint64(),
		ProductName: shipment.ProductName,
		Origin:      shipment.Origin,
		Destination: shipment.Destination,
		Owner:       shipment.Owner.Hex(),
		Status:      statusName,
		Timestamp:   shipment.Timestamp.Int64(),
	}, nil
}

func (e *EthClient) VerifyShipment(blockchainID uint64) (bool, error) {
	var verified bool
	out := []interface{}{&verified}
	if err := e.contract.Call(&bind.CallOpts{}, &out, "verifyShipment", new(big.Int).SetUint64(blockchainID)); err != nil {
		return false, err
	}
	return verified, nil
}

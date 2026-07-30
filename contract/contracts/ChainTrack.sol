// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ChainTrack
/// @notice Tamper-proof shipment tracking. All writes come from a single
/// backend relayer address; off-chain role authorization is enforced by the
/// Go API before it ever calls into this contract (see backend/internal/auth).
contract ChainTrack {
    enum Status {
        Created,
        PickedUp,
        InTransit,
        WarehouseReceived,
        OutForDelivery,
        Delivered
    }

    struct Shipment {
        uint256 id;
        string productName;
        string origin;
        string destination;
        address owner;
        Status status;
        uint256 timestamp;
    }

    address public relayer;
    uint256 public nextId;

    mapping(uint256 => Shipment) private shipments;
    mapping(uint256 => Shipment[]) private shipmentHistory;

    event ShipmentCreated(uint256 indexed id, address indexed owner, uint256 timestamp);
    event StatusUpdated(uint256 indexed id, Status oldStatus, Status newStatus, uint256 timestamp);
    event OwnershipTransferred(uint256 indexed id, address indexed oldOwner, address indexed newOwner);
    event DeliveryConfirmed(uint256 indexed id, uint256 timestamp);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "ChainTrack: caller is not relayer");
        _;
    }

    modifier shipmentExists(uint256 id) {
        require(shipments[id].timestamp != 0, "ChainTrack: shipment does not exist");
        _;
    }

    constructor() {
        relayer = msg.sender;
        nextId = 1;
    }

    function createShipment(
        string calldata productName,
        string calldata origin,
        string calldata destination,
        address owner
    ) external onlyRelayer returns (uint256 id) {
        id = nextId++;
        Shipment memory shipment = Shipment({
            id: id,
            productName: productName,
            origin: origin,
            destination: destination,
            owner: owner,
            status: Status.Created,
            timestamp: block.timestamp
        });
        shipments[id] = shipment;
        shipmentHistory[id].push(shipment);

        emit ShipmentCreated(id, owner, block.timestamp);
    }

    function updateStatus(uint256 id, Status newStatus) external onlyRelayer shipmentExists(id) {
        Shipment storage shipment = shipments[id];
        Status oldStatus = shipment.status;
        shipment.status = newStatus;
        shipment.timestamp = block.timestamp;
        shipmentHistory[id].push(shipment);

        emit StatusUpdated(id, oldStatus, newStatus, block.timestamp);

        if (newStatus == Status.Delivered) {
            emit DeliveryConfirmed(id, block.timestamp);
        }
    }

    function transferOwnership(uint256 id, address newOwner) external onlyRelayer shipmentExists(id) {
        Shipment storage shipment = shipments[id];
        address oldOwner = shipment.owner;
        shipment.owner = newOwner;
        shipment.timestamp = block.timestamp;
        shipmentHistory[id].push(shipment);

        emit OwnershipTransferred(id, oldOwner, newOwner);
    }

    function confirmDelivery(uint256 id) external onlyRelayer shipmentExists(id) {
        Shipment storage shipment = shipments[id];
        Status oldStatus = shipment.status;
        shipment.status = Status.Delivered;
        shipment.timestamp = block.timestamp;
        shipmentHistory[id].push(shipment);

        emit StatusUpdated(id, oldStatus, Status.Delivered, block.timestamp);
        emit DeliveryConfirmed(id, block.timestamp);
    }

    function getShipment(uint256 id) external view shipmentExists(id) returns (Shipment memory) {
        return shipments[id];
    }

    function getShipmentHistory(uint256 id) external view shipmentExists(id) returns (Shipment[] memory) {
        return shipmentHistory[id];
    }

    function verifyShipment(uint256 id) external view returns (bool) {
        return shipments[id].timestamp != 0;
    }
}

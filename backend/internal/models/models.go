package models

import "time"

type Role string

const (
	RoleSuperAdmin  Role = "super_admin"
	RoleOrgAdmin    Role = "org_admin"
	RoleAgent       Role = "agent"
	RoleTransporter Role = "transporter"
	RoleCustomer    Role = "customer"
)

type UserStatus string

const (
	StatusActive UserStatus = "active"
	StatusLocked UserStatus = "locked"
	StatusBanned UserStatus = "banned"
)

type Organization struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Name          string    `json:"name"`
	Address       string    `json:"address"`
	LicenseNumber string    `json:"license_number"`
	CreatedAt     time.Time `json:"created_at"`
}

type Branch struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrganizationID uint      `gorm:"index" json:"organization_id"`
	Name           string    `json:"name"`
	Address        string    `json:"address"`
	CreatedAt      time.Time `json:"created_at"`
}

// Warehouse's BranchID is nil for an org-level warehouse not tied to a
// specific branch.
type Warehouse struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrganizationID uint      `gorm:"index" json:"organization_id"`
	BranchID       *uint     `gorm:"index" json:"branch_id"`
	Name           string    `json:"name"`
	Address        string    `json:"address"`
	CreatedAt      time.Time `json:"created_at"`
}

type User struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	Name           string        `json:"name"`
	Email          string        `gorm:"uniqueIndex" json:"email"`
	PasswordHash   string        `json:"-"`
	WalletAddress  string        `gorm:"index" json:"wallet_address"`
	Role           Role          `json:"role"`
	Status         UserStatus    `gorm:"default:active" json:"status"`
	OrganizationID *uint         `json:"organization_id"`
	Organization   *Organization `json:"organization,omitempty"`
	BranchID       *uint         `json:"branch_id"`
	Branch         *Branch       `json:"branch,omitempty"`
	// WarehouseID scopes an agent to a specific warehouse; nil means an
	// unscoped agent (or a non-agent role).
	WarehouseID *uint      `json:"warehouse_id"`
	Warehouse   *Warehouse `json:"warehouse,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type InviteStatus string

const (
	InviteStatusPending  InviteStatus = "pending"
	InviteStatusAccepted InviteStatus = "accepted"
)

// Expiry is checked live (Status == pending && now > ExpiresAt), no cron sweep.
type Invite struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	OrganizationID uint          `gorm:"index" json:"organization_id"`
	Organization   *Organization `json:"organization,omitempty"`
	Email          string        `gorm:"index" json:"email"`
	Role           Role          `json:"role"`
	BranchID       *uint         `json:"branch_id"`
	WarehouseID    *uint         `json:"warehouse_id"`
	Token          string        `gorm:"uniqueIndex" json:"-"`
	Status         InviteStatus  `gorm:"default:pending" json:"status"`
	InvitedByID    uint          `json:"invited_by_id"`
	ExpiresAt      time.Time     `json:"expires_at"`
	CreatedAt      time.Time     `json:"created_at"`
}

type ShipmentStatus string

const (
	StatusCreated           ShipmentStatus = "created"
	StatusPickedUp          ShipmentStatus = "picked_up"
	StatusInTransit         ShipmentStatus = "in_transit"
	StatusWarehouseReceived ShipmentStatus = "warehouse_received"
	StatusOutForDelivery    ShipmentStatus = "out_for_delivery"
	StatusDelivered         ShipmentStatus = "delivered"

	// off-chain only (in-person pickup) — not in the Solidity enum or StatusOrder
	StatusReadyForPickup ShipmentStatus = "ready_for_pickup"
	StatusCollected      ShipmentStatus = "collected"
)

// StatusOrder maps each lifecycle status to its on-chain enum index
// (must match the Status enum order in contract/contracts/ChainTrack.sol).
var StatusOrder = map[ShipmentStatus]uint8{
	StatusCreated:           0,
	StatusPickedUp:          1,
	StatusInTransit:         2,
	StatusWarehouseReceived: 3,
	StatusOutForDelivery:    4,
	StatusDelivered:         5,
}

type Shipment struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	TrackingNumber string         `gorm:"uniqueIndex" json:"tracking_number"`
	ProductName    string         `json:"product_name"`
	Origin         string         `json:"origin"`
	Destination    string         `json:"destination"`
	Status         ShipmentStatus `json:"status"`
	BlockchainID   uint64         `json:"blockchain_id"`
	OwnerID        uint           `json:"owner_id"`
	// CustodianID is whoever currently physically holds the goods — a
	// transporter or warehouse user, nil before anyone has claimed it.
	CustodianID *uint `json:"custodian_id"`
	// nil PendingNextStatus = lateral handoff (custody moves, status doesn't)
	PendingHandoverToID *uint           `json:"pending_handover_to_id"`
	PendingNextStatus   *ShipmentStatus `json:"pending_next_status"`
	PendingLocation     string          `json:"pending_location"`
	CreatedAt           time.Time       `json:"created_at"`
}

type ShipmentHistory struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	ShipmentID      uint           `gorm:"index" json:"shipment_id"`
	OldStatus       ShipmentStatus `json:"old_status"`
	NewStatus       ShipmentStatus `json:"new_status"`
	Location        string         `json:"location"`
	TransactionHash string         `json:"transaction_hash"`
	UpdatedBy       uint           `json:"updated_by"`
	HandoverToID    *uint          `json:"handover_to_id"`
	Note            string         `json:"note"`
	Timestamp       time.Time      `json:"timestamp"`
}

// ProfileChange is an append-only audit log of profile edits — lets an
// admin see every name a user has ever gone by, and backs the 14-day
// change cooldown that discourages identity-swap scams.
type ProfileChange struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index" json:"user_id"`
	Field     string    `json:"field"`
	OldValue  string    `json:"old_value"`
	NewValue  string    `json:"new_value"`
	ChangedAt time.Time `json:"changed_at"`
}

type Notification struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index" json:"user_id"`
	ShipmentID uint      `json:"shipment_id"`
	Message    string    `json:"message"`
	Read       bool      `json:"read"`
	CreatedAt  time.Time `json:"created_at"`
}

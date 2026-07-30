package handlers

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"be/internal/blockchain"
	"be/internal/middleware"
	"be/internal/models"
)

// Next status for legs where custody doesn't change hands. Anything that
// moves custody goes through InitiateHandover/AcceptHandover/RejectHandover.
func selfReportNext(current models.ShipmentStatus) (models.ShipmentStatus, bool) {
	switch current {
	case models.StatusCreated:
		return models.StatusPickedUp, true
	case models.StatusPickedUp:
		return models.StatusInTransit, true
	case models.StatusWarehouseReceived:
		return models.StatusReadyForPickup, true
	default:
		return "", false
	}
}

// Legal next statuses reachable via a two-party handover. Empty string = lateral relay.
var custodyTransferTargets = map[models.ShipmentStatus][]models.ShipmentStatus{
	models.StatusPickedUp:          {""},
	models.StatusInTransit:         {"", models.StatusWarehouseReceived},
	models.StatusWarehouseReceived: {models.StatusOutForDelivery},
	models.StatusOutForDelivery:    {models.StatusDelivered},
	models.StatusReadyForPickup:    {models.StatusCollected},
}

func validHandoverTarget(current, next models.ShipmentStatus) bool {
	for _, t := range custodyTransferTargets[current] {
		if t == next {
			return true
		}
	}
	return false
}

// Delivery/collection must go to the owner — otherwise a courier could
// mark it done without the customer ever confirming receipt.
func recipientMatchesTarget(shipment models.Shipment, next models.ShipmentStatus, recipient models.User) bool {
	switch next {
	case "":
		return recipient.Role == models.RoleTransporter
	case models.StatusWarehouseReceived:
		return recipient.Role == models.RoleAgent
	case models.StatusOutForDelivery:
		return recipient.Role == models.RoleTransporter
	case models.StatusDelivered, models.StatusCollected:
		return recipient.ID == shipment.OwnerID
	default:
		return false
	}
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// Mirrors frontend/src/lib/format.ts.
func formatStatus(status models.ShipmentStatus) string {
	words := strings.Split(string(status), "_")
	for i, w := range words {
		words[i] = capitalize(w)
	}
	return strings.Join(words, " ")
}

func generateTrackingNumber() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("CT-%X", buf), nil
}

func notify(db *gorm.DB, userID, shipmentID uint, message string) {
	db.Create(&models.Notification{UserID: userID, ShipmentID: shipmentID, Message: message})
}

// StatusCollected has no on-chain equivalent, records as Delivered there
// while staying "collected" in our DB. StatusReadyForPickup never touches the chain.
func updateChainStatus(chain blockchain.Client, blockchainID uint64, status models.ShipmentStatus) (string, error) {
	chainStatus := status
	if chainStatus == models.StatusCollected {
		chainStatus = models.StatusDelivered
	}
	if _, onChain := models.StatusOrder[chainStatus]; !onChain {
		return "", nil
	}
	return chain.UpdateStatus(blockchainID, chainStatus)
}

type createShipmentRequest struct {
	ProductName   string `json:"product_name" binding:"required"`
	Origin        string `json:"origin" binding:"required"`
	Destination   string `json:"destination" binding:"required"`
	TransporterID *uint  `json:"transporter_id"`
}

func (a *API) CreateShipment(c *gin.Context) {
	var req createShipmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get(middleware.ContextUserID)
	creatorID := userID.(uint)

	var creator models.User
	if err := a.DB.First(&creator, creatorID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}
	if creator.WalletAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "link a wallet before creating shipments"})
		return
	}

	trackingNumber, err := generateTrackingNumber()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate tracking number"})
		return
	}

	blockchainID, txHash, err := a.Chain.CreateShipment(req.ProductName, req.Origin, req.Destination, creator.WalletAddress)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain create failed: " + err.Error()})
		return
	}

	shipment := models.Shipment{
		TrackingNumber: trackingNumber,
		ProductName:    req.ProductName,
		Origin:         req.Origin,
		Destination:    req.Destination,
		Status:         models.StatusCreated,
		BlockchainID:   blockchainID,
		OwnerID:        creatorID,
		CustodianID:    req.TransporterID,
	}
	if err := a.DB.Create(&shipment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save shipment"})
		return
	}

	history := models.ShipmentHistory{
		ShipmentID:      shipment.ID,
		OldStatus:       "",
		NewStatus:       models.StatusCreated,
		TransactionHash: txHash,
		UpdatedBy:       creatorID,
		Timestamp:       time.Now(),
	}
	a.DB.Create(&history)

	notify(a.DB, creatorID, shipment.ID, fmt.Sprintf("Shipment %s created", shipment.TrackingNumber))
	if shipment.CustodianID != nil {
		notify(a.DB, *shipment.CustodianID, shipment.ID, fmt.Sprintf("You were assigned shipment %s", shipment.TrackingNumber))
	}

	c.JSON(http.StatusCreated, shipment)
}

func (a *API) ListShipments(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserID)
	role, _ := c.Get(middleware.ContextRole)

	query := a.DB.Model(&models.Shipment{})
	switch role {
	case models.RoleSuperAdmin:
		// see everything
	case models.RoleAgent:
		// only shipments they're actually assigned to — custodian now, or a
		// handover pending their acceptance. Claiming an unassigned one
		// happens via tracking-number lookup, not the list.
		query = query.Where("shipments.custodian_id = ? OR shipments.pending_handover_to_id = ?", userID, userID)
	case models.RoleTransporter:
		// see everything relevant to their operational role
	default:
		query = query.Where("owner_id = ?", userID)
	}

	var shipments []models.Shipment
	if err := query.Order("created_at desc").Find(&shipments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list shipments"})
		return
	}
	c.JSON(http.StatusOK, shipments)
}

func (a *API) GetShipment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var shipment models.Shipment
	if err := a.DB.First(&shipment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "shipment not found"})
		return
	}

	var history []models.ShipmentHistory
	a.DB.Where("shipment_id = ?", shipment.ID).Order("timestamp asc").Find(&history)

	c.JSON(http.StatusOK, gin.H{"shipment": shipment, "history": history})
}

type updateShipmentRequest struct {
	Status     *models.ShipmentStatus `json:"status"`
	NewOwnerID *uint                  `json:"new_owner_id"`
	Location   string                 `json:"location"`
}

// Handles ownership transfer (legal ownership, separate from physical
// custody) and self-report status legs. Custody transfer goes through
// InitiateHandover/AcceptHandover/RejectHandover instead.
func (a *API) UpdateShipment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req updateShipmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status == nil && req.NewOwnerID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provide status and/or new_owner_id"})
		return
	}

	userIDVal, _ := c.Get(middleware.ContextUserID)
	userID := userIDVal.(uint)
	roleVal, _ := c.Get(middleware.ContextRole)
	role, _ := roleVal.(models.Role)

	var shipment models.Shipment
	if err := a.DB.First(&shipment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "shipment not found"})
		return
	}

	if req.NewOwnerID != nil {
		if role != models.RoleAgent && role != models.RoleSuperAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "only warehouse or admin can transfer ownership"})
			return
		}

		var newOwner models.User
		if err := a.DB.First(&newOwner, *req.NewOwnerID).Error; err != nil || newOwner.WalletAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "new owner not found or has no linked wallet"})
			return
		}

		txHash, err := a.Chain.TransferOwnership(shipment.BlockchainID, newOwner.WalletAddress)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain transfer failed: " + err.Error()})
			return
		}

		newOwnerID := *req.NewOwnerID
		shipment.OwnerID = newOwnerID
		a.DB.Save(&shipment)
		a.DB.Create(&models.ShipmentHistory{
			ShipmentID:      shipment.ID,
			OldStatus:       shipment.Status,
			NewStatus:       shipment.Status,
			Location:        req.Location,
			TransactionHash: txHash,
			UpdatedBy:       userID,
			Timestamp:       time.Now(),
		})
		notify(a.DB, newOwnerID, shipment.ID, fmt.Sprintf("You are now the owner of shipment %s", shipment.TrackingNumber))
	}

	if req.Status != nil {
		expected, ok := selfReportNext(shipment.Status)
		if !ok || expected != *req.Status {
			c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf(
				"cannot self-report a move from %s to %s — this leg needs a handover (POST /api/shipments/%d/handover)",
				shipment.Status, *req.Status, shipment.ID,
			)})
			return
		}

		if shipment.Status == models.StatusCreated {
			// First transporter or in-org agent to claim an unassigned
			// shipment becomes its custodian; a pre-assigned one is locked
			// to that custodian.
			if role != models.RoleTransporter && role != models.RoleAgent && role != models.RoleSuperAdmin {
				c.JSON(http.StatusForbidden, gin.H{"error": "only a transporter or agent can claim pickup"})
				return
			}
			if role == models.RoleAgent {
				var owner models.User
				if err := a.DB.First(&owner, shipment.OwnerID).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "could not verify shipment owner"})
					return
				}
				var agent models.User
				if err := a.DB.First(&agent, userID).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "could not verify agent"})
					return
				}
				if owner.OrganizationID == nil || agent.OrganizationID == nil || *owner.OrganizationID != *agent.OrganizationID {
					c.JSON(http.StatusForbidden, gin.H{"error": "shipment belongs to a different organization"})
					return
				}
			}
			if shipment.CustodianID != nil && *shipment.CustodianID != userID && role != models.RoleSuperAdmin {
				c.JSON(http.StatusForbidden, gin.H{"error": "shipment is already assigned to another custodian"})
				return
			}
			if shipment.CustodianID == nil {
				shipment.CustodianID = &userID
			}
		} else if shipment.CustodianID == nil || (*shipment.CustodianID != userID && role != models.RoleSuperAdmin) {
			c.JSON(http.StatusForbidden, gin.H{"error": "only the current custodian or admin can update this shipment"})
			return
		}

		txHash, err := updateChainStatus(a.Chain, shipment.BlockchainID, *req.Status)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain update failed: " + err.Error()})
			return
		}

		oldStatus := shipment.Status
		shipment.Status = *req.Status
		a.DB.Save(&shipment)
		a.DB.Create(&models.ShipmentHistory{
			ShipmentID:      shipment.ID,
			OldStatus:       oldStatus,
			NewStatus:       *req.Status,
			Location:        req.Location,
			TransactionHash: txHash,
			UpdatedBy:       userID,
			Timestamp:       time.Now(),
		})

		message := fmt.Sprintf("Shipment %s is now %s", shipment.TrackingNumber, formatStatus(*req.Status))
		if req.Location != "" {
			message += fmt.Sprintf(" (%s)", req.Location)
		}
		notify(a.DB, shipment.OwnerID, shipment.ID, message)
	}

	c.JSON(http.StatusOK, shipment)
}

type handoverRequest struct {
	ToUserID   uint                   `json:"to_user_id" binding:"required"`
	NextStatus *models.ShipmentStatus `json:"next_status"`
	Location   string                 `json:"location"`
}

// Nothing changes yet — Status, CustodianID, and the chain stay untouched
// until the recipient calls AcceptHandover.
func (a *API) InitiateHandover(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req handoverRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDVal, _ := c.Get(middleware.ContextUserID)
	userID := userIDVal.(uint)
	roleVal, _ := c.Get(middleware.ContextRole)
	role, _ := roleVal.(models.Role)

	var shipment models.Shipment
	if err := a.DB.First(&shipment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "shipment not found"})
		return
	}

	if shipment.CustodianID == nil || (*shipment.CustodianID != userID && role != models.RoleSuperAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the current custodian or admin can initiate a handover"})
		return
	}
	if shipment.PendingHandoverToID != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "a handover is already pending for this shipment"})
		return
	}
	if req.ToUserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot hand off to yourself"})
		return
	}

	next := models.ShipmentStatus("")
	if req.NextStatus != nil {
		next = *req.NextStatus
	}
	if !validHandoverTarget(shipment.Status, next) {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("no handover is legal from %s to %q", shipment.Status, next)})
		return
	}

	var recipient models.User
	if err := a.DB.First(&recipient, req.ToUserID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recipient not found"})
		return
	}
	if !recipientMatchesTarget(shipment, next, recipient) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recipient isn't eligible for this handover"})
		return
	}

	shipment.PendingHandoverToID = &req.ToUserID
	shipment.PendingNextStatus = req.NextStatus
	shipment.PendingLocation = req.Location
	if err := a.DB.Save(&shipment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save handover"})
		return
	}

	notify(a.DB, req.ToUserID, shipment.ID, fmt.Sprintf(
		"%s (%s) wants to hand you shipment %s — review it", recipient.Name, role, shipment.TrackingNumber,
	))

	c.JSON(http.StatusOK, shipment)
}

// Custody actually moves here — chain update and ShipmentHistory row only
// happen on accept, so delivery means the customer confirmed receipt.
func (a *API) AcceptHandover(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userIDVal, _ := c.Get(middleware.ContextUserID)
	userID := userIDVal.(uint)
	roleVal, _ := c.Get(middleware.ContextRole)
	role, _ := roleVal.(models.Role)

	var shipment models.Shipment
	if err := a.DB.First(&shipment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "shipment not found"})
		return
	}
	if shipment.PendingHandoverToID == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "no pending handover for this shipment"})
		return
	}
	if *shipment.PendingHandoverToID != userID && role != models.RoleSuperAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the intended recipient or admin can accept this handover"})
		return
	}

	recipientID := *shipment.PendingHandoverToID
	var recipient models.User
	if err := a.DB.First(&recipient, recipientID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recipient not found"})
		return
	}

	priorCustodianID := shipment.CustodianID
	var actorDesc = "the sender"
	if priorCustodianID != nil {
		var actor models.User
		if err := a.DB.First(&actor, *priorCustodianID).Error; err == nil {
			actorDesc = fmt.Sprintf("%s (%s)", actor.Name, actor.Role)
		}
	}

	oldStatus := shipment.Status
	newStatus := oldStatus
	var txHash string
	if shipment.PendingNextStatus != nil {
		newStatus = *shipment.PendingNextStatus
		txHash, err = updateChainStatus(a.Chain, shipment.BlockchainID, newStatus)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain update failed: " + err.Error()})
			return
		}
	}

	pendingLocation := shipment.PendingLocation
	shipment.Status = newStatus
	shipment.CustodianID = &recipientID
	shipment.PendingHandoverToID = nil
	shipment.PendingNextStatus = nil
	shipment.PendingLocation = ""
	if err := a.DB.Save(&shipment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save shipment"})
		return
	}

	note := fmt.Sprintf("%s handed off to %s (%s)", capitalize(actorDesc), recipient.Name, recipient.Role)
	if pendingLocation != "" {
		note += fmt.Sprintf(" at %s", pendingLocation)
	}
	a.DB.Create(&models.ShipmentHistory{
		ShipmentID:      shipment.ID,
		OldStatus:       oldStatus,
		NewStatus:       newStatus,
		Location:        pendingLocation,
		TransactionHash: txHash,
		UpdatedBy:       userID,
		HandoverToID:    &recipientID,
		Note:            note,
		Timestamp:       time.Now(),
	})

	if priorCustodianID != nil {
		notify(a.DB, *priorCustodianID, shipment.ID, fmt.Sprintf("%s accepted your handoff of shipment %s", recipient.Name, shipment.TrackingNumber))
	}
	if recipientID == shipment.OwnerID {
		notify(a.DB, shipment.OwnerID, shipment.ID, fmt.Sprintf("You confirmed receipt of shipment %s", shipment.TrackingNumber))
	} else if newStatus != oldStatus {
		message := fmt.Sprintf("Shipment %s is now %s", shipment.TrackingNumber, formatStatus(newStatus))
		if pendingLocation != "" {
			message += fmt.Sprintf(" (%s)", pendingLocation)
		}
		notify(a.DB, shipment.OwnerID, shipment.ID, message)
	} else {
		notify(a.DB, shipment.OwnerID, shipment.ID, fmt.Sprintf(
			"Shipment %s changed hands: now with %s (%s)", shipment.TrackingNumber, recipient.Name, recipient.Role,
		))
	}

	c.JSON(http.StatusOK, shipment)
}

type rejectHandoverRequest struct {
	Reason string `json:"reason"`
}

// Leaves Status/CustodianID untouched so the sender can pick someone else —
// only accepted handoffs get a ShipmentHistory row.
func (a *API) RejectHandover(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var req rejectHandoverRequest
	_ = c.ShouldBindJSON(&req)

	userIDVal, _ := c.Get(middleware.ContextUserID)
	userID := userIDVal.(uint)
	roleVal, _ := c.Get(middleware.ContextRole)
	role, _ := roleVal.(models.Role)

	var shipment models.Shipment
	if err := a.DB.First(&shipment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "shipment not found"})
		return
	}
	if shipment.PendingHandoverToID == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "no pending handover for this shipment"})
		return
	}
	if *shipment.PendingHandoverToID != userID && role != models.RoleSuperAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the intended recipient or admin can reject this handover"})
		return
	}

	priorCustodianID := shipment.CustodianID
	shipment.PendingHandoverToID = nil
	shipment.PendingNextStatus = nil
	shipment.PendingLocation = ""
	if err := a.DB.Save(&shipment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save shipment"})
		return
	}

	if priorCustodianID != nil {
		message := fmt.Sprintf("Your handoff of shipment %s was declined", shipment.TrackingNumber)
		if req.Reason != "" {
			message += ": " + req.Reason
		}
		notify(a.DB, *priorCustodianID, shipment.ID, message)
	}

	c.JSON(http.StatusOK, shipment)
}

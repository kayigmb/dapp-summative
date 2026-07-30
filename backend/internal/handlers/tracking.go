package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"be/internal/models"
)

func itoa(v uint) string {
	return strconv.FormatUint(uint64(v), 10)
}

// GetTracking is public (no auth): DB lookup by tracking number, cross-checked
// against the chain so a customer's view can't be spoofed by DB tampering
// alone.
func (a *API) GetTracking(c *gin.Context) {
	trackingNumber := c.Param("trackingNumber")

	var shipment models.Shipment
	if err := a.DB.Where("tracking_number = ?", trackingNumber).First(&shipment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no shipment with that tracking number"})
		return
	}

	var history []models.ShipmentHistory
	a.DB.Where("shipment_id = ?", shipment.ID).Order("timestamp asc").Find(&history)

	verified, err := a.Chain.VerifyShipment(shipment.BlockchainID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain verification failed: " + err.Error()})
		return
	}

	onChain, err := a.Chain.GetShipment(shipment.BlockchainID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "blockchain lookup failed: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"shipment":            shipment,
		"history":             history,
		"blockchain_verified": verified,
		"on_chain":            onChain,
	})
}

// UpdateTracking is a thin alias for the same status/ownership transition
// logic as PUT /api/shipments/:id — kept as one shared implementation so the
// two spec-required routes can't drift out of sync.
func (a *API) UpdateTracking(c *gin.Context) {
	type body struct {
		ShipmentID uint `json:"shipment_id" binding:"required"`
	}
	var b body
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Params = append(c.Params, gin.Param{Key: "id", Value: itoa(b.ShipmentID)})
	a.UpdateShipment(c)
}

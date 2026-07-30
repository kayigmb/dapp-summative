package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"be/internal/models"
)

type roleCount struct {
	Role  string `json:"role"`
	Count int64  `json:"count"`
}

type statusCount struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
}

// AdminOverview gives admins a system-wide view distinct from the
// per-shipment dashboard everyone else gets: how many users of each role,
// how many shipments in each stage, and every registered company.
func (a *API) AdminOverview(c *gin.Context) {
	var usersByRole []roleCount
	if err := a.DB.Model(&models.User{}).
		Select("role, count(*) as count").Group("role").Scan(&usersByRole).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load user counts"})
		return
	}

	var shipmentsByStatus []statusCount
	if err := a.DB.Model(&models.Shipment{}).
		Select("status, count(*) as count").Group("status").Scan(&shipmentsByStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load shipment counts"})
		return
	}

	var organizations []models.Organization
	if err := a.DB.Find(&organizations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load organizations"})
		return
	}

	var totalUsers, totalShipments int64
	a.DB.Model(&models.User{}).Count(&totalUsers)
	a.DB.Model(&models.Shipment{}).Count(&totalShipments)

	c.JSON(http.StatusOK, gin.H{
		"total_users":         totalUsers,
		"total_shipments":     totalShipments,
		"users_by_role":       usersByRole,
		"shipments_by_status": shipmentsByStatus,
		"organizations":       organizations,
	})
}

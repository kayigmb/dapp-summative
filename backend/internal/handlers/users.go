package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"be/internal/middleware"
	"be/internal/models"
)

// One name change per window, so nobody dodges a shipment's tracked identity.
const nameChangeCooldown = 14 * 24 * time.Hour

// A bare ?role= lookup (assignment pickers) is open to any authed user.
// Anything else — pagination, filters, no role at all — is the real admin
// listing, requires super_admin/org_admin, and locks an org_admin to their own org.
func (a *API) ListUsers(c *gin.Context) {
	role := c.Query("role")
	orgFilter := c.Query("organization_id")
	statusFilter := c.Query("status")
	q := c.Query("q")
	_, hasPage := c.GetQuery("page")
	isManagementQuery := hasPage || orgFilter != "" || statusFilter != "" || q != "" || role == ""

	requesterRole, _ := c.Get(middleware.ContextRole)
	requesterOrgVal, _ := c.Get(middleware.ContextOrgID)
	requesterOrgID, _ := requesterOrgVal.(*uint)

	if isManagementQuery {
		isOrgAdmin := requesterRole == models.RoleOrgAdmin
		if requesterRole != models.RoleSuperAdmin && !isOrgAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin only; pass ?role= alone to list a specific role"})
			return
		}
		if isOrgAdmin {
			if requesterOrgID == nil {
				c.JSON(http.StatusOK, gin.H{"items": []models.User{}, "total": 0, "page": 1, "page_size": 20})
				return
			}
			orgFilter = strconv.FormatUint(uint64(*requesterOrgID), 10)
		}
	}

	query := a.DB.Model(&models.User{})
	if role != "" {
		query = query.Where("role = ?", role)
	}
	if orgFilter != "" {
		query = query.Where("organization_id = ?", orgFilter)
	}
	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}
	if q != "" {
		like := "%" + q + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ?", like, like)
	}

	if !isManagementQuery {
		var users []models.User
		if err := query.Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list users"})
			return
		}
		c.JSON(http.StatusOK, users)
		return
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not count users"})
		return
	}

	page, pageSize := parsePageParams(c)
	var users []models.User
	if err := query.Order("created_at desc").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Preload("Organization").Preload("Branch").Preload("Warehouse").
		Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": users, "total": total, "page": page, "page_size": pageSize})
}

func (a *API) GetUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var user models.User
	if err := a.DB.Preload("Organization").Preload("Branch").Preload("Warehouse").
		First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// super_admin can act on anyone but another super_admin; org_admin only on
// their own org's users, never on an org_admin or super_admin.
func canManageTarget(requesterRole models.Role, requesterOrgID *uint, target models.User) bool {
	switch requesterRole {
	case models.RoleSuperAdmin:
		return target.Role != models.RoleSuperAdmin
	case models.RoleOrgAdmin:
		if target.Role == models.RoleSuperAdmin || target.Role == models.RoleOrgAdmin {
			return false
		}
		return requesterOrgID != nil && target.OrganizationID != nil && *requesterOrgID == *target.OrganizationID
	default:
		return false
	}
}

// Assembled from existing shipment/history rows, no separate activity table.
func (a *API) UserActivity(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	userID := uint(id)

	requesterID, _ := c.Get(middleware.ContextUserID)
	requesterRole, _ := c.Get(middleware.ContextRole)
	requesterOrgVal, _ := c.Get(middleware.ContextOrgID)
	requesterOrgID, _ := requesterOrgVal.(*uint)

	if requesterID != userID && requesterRole != models.RoleSuperAdmin {
		if requesterRole != models.RoleOrgAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "can only view your own activity"})
			return
		}
		var target models.User
		if err := a.DB.First(&target, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		if requesterOrgID == nil || target.OrganizationID == nil || *requesterOrgID != *target.OrganizationID {
			c.JSON(http.StatusForbidden, gin.H{"error": "can only view activity for users in your organization"})
			return
		}
	}

	var shipments []models.Shipment
	if err := a.DB.Where("owner_id = ? OR custodian_id = ?", userID, userID).
		Order("created_at desc").Find(&shipments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load shipments"})
		return
	}

	var history []models.ShipmentHistory
	if err := a.DB.Where("updated_by = ? OR handover_to_id = ?", userID, userID).
		Order("timestamp desc").Find(&history).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"shipments": shipments, "history": history})
}

type setUserStatusRequest struct {
	Status models.UserStatus `json:"status" binding:"required"`
}

// Locked/banned users are rejected at Login and RequireAuth, even on an
// already-issued token. Recorded via the same ProfileChange log as ProfileHistory.
func (a *API) SetUserStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req setUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status != models.StatusActive && req.Status != models.StatusLocked && req.Status != models.StatusBanned {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be active, locked, or banned"})
		return
	}

	requesterID, _ := c.Get(middleware.ContextUserID)
	requesterRole, _ := c.Get(middleware.ContextRole)
	requesterOrgVal, _ := c.Get(middleware.ContextOrgID)
	requesterOrgID, _ := requesterOrgVal.(*uint)
	role, _ := requesterRole.(models.Role)

	if requesterID == uint(id) {
		c.JSON(http.StatusForbidden, gin.H{"error": "cannot change your own status"})
		return
	}

	var user models.User
	if err := a.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if !canManageTarget(role, requesterOrgID, user) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to change this user's status"})
		return
	}

	oldStatus := user.Status
	user.Status = req.Status
	if err := a.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update status"})
		return
	}

	a.DB.Create(&models.ProfileChange{
		UserID:    user.ID,
		Field:     "status",
		OldValue:  string(oldStatus),
		NewValue:  string(req.Status),
		ChangedAt: time.Now(),
	})

	c.JSON(http.StatusOK, user)
}

type updateUserRequest struct {
	Name          string `json:"name"`
	WalletAddress string `json:"wallet_address"`
}

func (a *API) UpdateUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	requesterID, _ := c.Get(middleware.ContextUserID)
	requesterRole, _ := c.Get(middleware.ContextRole)
	if requesterRole != models.RoleSuperAdmin && requesterID != uint(id) {
		c.JSON(http.StatusForbidden, gin.H{"error": "can only update your own profile"})
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := a.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if req.Name != "" && req.Name != user.Name {
		var lastChange models.ProfileChange
		err := a.DB.Where("user_id = ? AND field = ?", user.ID, "name").
			Order("changed_at desc").First(&lastChange).Error
		if err == nil {
			nextAllowed := lastChange.ChangedAt.Add(nameChangeCooldown)
			if time.Now().Before(nextAllowed) {
				c.JSON(http.StatusConflict, gin.H{
					"error":        fmt.Sprintf("name can only be changed once every 14 days; next allowed at %s", nextAllowed.Format(time.RFC3339)),
					"next_allowed": nextAllowed,
				})
				return
			}
		}

		a.DB.Create(&models.ProfileChange{
			UserID:    user.ID,
			Field:     "name",
			OldValue:  user.Name,
			NewValue:  req.Name,
			ChangedAt: time.Now(),
		})
		user.Name = req.Name
	}
	if req.WalletAddress != "" {
		user.WalletAddress = req.WalletAddress
	}

	if err := a.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update user"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// ProfileHistory lists every profile edit a user has made — lets an admin
// see all previous names someone has gone by. Self-viewable too so a user
// can check when their own cooldown ends.
func (a *API) ProfileHistory(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	requesterID, _ := c.Get(middleware.ContextUserID)
	requesterRole, _ := c.Get(middleware.ContextRole)
	if requesterRole != models.RoleSuperAdmin && requesterID != uint(id) {
		c.JSON(http.StatusForbidden, gin.H{"error": "can only view your own profile history"})
		return
	}

	var changes []models.ProfileChange
	if err := a.DB.Where("user_id = ?", id).Order("changed_at desc").Find(&changes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list profile history"})
		return
	}
	c.JSON(http.StatusOK, changes)
}

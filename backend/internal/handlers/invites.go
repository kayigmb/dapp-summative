package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"be/internal/auth"
	"be/internal/models"
)

// Shared by GetInviteByToken and AcceptInvite for the same not-found/accepted/expired checks.
func (a *API) lookupLiveInvite(c *gin.Context, token string) (models.Invite, bool) {
	var invite models.Invite
	if err := a.DB.Preload("Organization").Where("token = ?", token).First(&invite).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		return invite, false
	}
	if invite.Status == models.InviteStatusAccepted {
		c.JSON(http.StatusGone, gin.H{"error": "this invite has already been used"})
		return invite, false
	}
	if time.Now().After(invite.ExpiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "this invite has expired"})
		return invite, false
	}
	return invite, true
}

// Public — the invitee has no account yet — returns only what the accept page needs.
func (a *API) GetInviteByToken(c *gin.Context) {
	invite, ok := a.lookupLiveInvite(c, c.Param("token"))
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"email":        invite.Email,
		"open":         invite.Email == "",
		"role":         invite.Role,
		"organization": gin.H{"id": invite.Organization.ID, "name": invite.Organization.Name},
		"expires_at":   invite.ExpiresAt,
	})
}

type acceptInviteRequest struct {
	Name string `json:"name" binding:"required"`
	// only required for an open invite; a targeted invite's own email always wins
	Email    string `json:"email" binding:"omitempty,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// A targeted invite gets marked accepted; an open invite stays pending so
// it can keep being used until revoked.
func (a *API) AcceptInvite(c *gin.Context) {
	invite, ok := a.lookupLiveInvite(c, c.Param("token"))
	if !ok {
		return
	}

	var req acceptInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := invite.Email
	isOpen := email == ""
	if isOpen {
		if req.Email == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
			return
		}
		email = req.Email
	}

	var existing models.User
	if err := a.DB.Where("email = ? AND status = ?", email, models.StatusActive).
		First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "a user with this email already exists"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
		return
	}

	user := models.User{
		Name:           req.Name,
		Email:          email,
		PasswordHash:   hash,
		Role:           invite.Role,
		Status:         models.StatusActive,
		OrganizationID: &invite.OrganizationID,
		BranchID:       invite.BranchID,
		WarehouseID:    invite.WarehouseID,
	}

	if isOpen {
		err = a.DB.Create(&user).Error
	} else {
		err = a.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			invite.Status = models.InviteStatusAccepted
			return tx.Save(&invite).Error
		})
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not accept invite"})
		return
	}

	token, err := auth.GenerateToken(a.Cfg.JWTSecret, user.ID, user.Role, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"be/internal/auth"
	"be/internal/middleware"
	"be/internal/models"
)

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

type registerRequest struct {
	Name          string      `json:"name" binding:"required"`
	Email         string      `json:"email" binding:"required,email"`
	Password      string      `json:"password" binding:"required,min=8"`
	Role          models.Role `json:"role" binding:"required"`
	WalletAddress string      `json:"wallet_address"`
}

// selfRegisterableRoles are the only roles the public register form may
// grant directly. org_admin/agent/super_admin are org-scoped and can only
// be granted later by an org_admin/super_admin via the org-membership
// endpoints.
var selfRegisterableRoles = map[models.Role]bool{
	models.RoleTransporter: true,
	models.RoleCustomer:    true,
}

func (a *API) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !selfRegisterableRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be transporter or customer"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
		return
	}

	user := models.User{
		Name:          req.Name,
		Email:         req.Email,
		PasswordHash:  hash,
		WalletAddress: req.WalletAddress,
		Role:          req.Role,
		Status:        models.StatusActive,
	}
	if err := a.DB.Create(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) || isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (a *API) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := a.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.Status == models.StatusLocked || user.Status == models.StatusBanned {
		c.JSON(http.StatusForbidden, gin.H{"error": "account " + string(user.Status)})
		return
	}

	token, err := auth.GenerateToken(a.Cfg.JWTSecret, user.ID, user.Role, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

// Logout is a no-op: JWTs are stateless, the client simply discards the
// token. No blacklist/refresh-token machinery for this app's scale.
func (a *API) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

type connectWalletRequest struct {
	Address string `json:"address" binding:"required"`
}

func (a *API) ConnectWallet(c *gin.Context) {
	var req connectWalletRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	message, err := a.Nonces.GenerateNonce(req.Address)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate nonce"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": message})
}

type verifyWalletRequest struct {
	Address   string `json:"address" binding:"required"`
	Signature string `json:"signature" binding:"required"`
}

func (a *API) VerifyWallet(c *gin.Context) {
	var req verifyWalletRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := a.Nonces.VerifySignature(req.Address, req.Signature); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	userIDVal, _ := c.Get(middleware.ContextUserID)
	userID, hasUser := userIDVal.(uint)

	var user models.User
	if hasUser {
		if err := a.DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		user.WalletAddress = req.Address
		if err := a.DB.Save(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not link wallet"})
			return
		}
	} else if err := a.DB.Where("wallet_address = ?", req.Address).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "no account linked to this wallet, register or connect while logged in"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
		return
	}

	token, err := auth.GenerateToken(a.Cfg.JWTSecret, user.ID, user.Role, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token, "user": user, "wallet_verified": true})
}

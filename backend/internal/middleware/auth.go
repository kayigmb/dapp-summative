package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"be/internal/auth"
	"be/internal/models"
)

const (
	ContextUserID = "user_id"
	ContextRole   = "role"
	ContextOrgID  = "organization_id"
)

// Reflects the request Origin instead of a fixed one so localhost vs
// 127.0.0.1 / alternate dev ports don't fail the browser's origin check.
func CORS(fallbackOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = fallbackOrigin
		}
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// Re-checks live status on every request since a JWT can't be revoked —
// a locked/banned user gets rejected even with a still-valid token.
func RequireAuth(jwtSecret string, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if token == "" || token == header {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}

		claims, err := auth.ParseToken(jwtSecret, token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		var status models.UserStatus
		if err := db.Model(&models.User{}).Select("status").Where("id = ?", claims.UserID).Scan(&status).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		if status == models.StatusLocked || status == models.StatusBanned {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account " + string(status)})
			return
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextRole, claims.Role)
		c.Set(ContextOrgID, claims.OrganizationID)
		c.Next()
	}
}

// Same as RequireAuth but never aborts on a missing/invalid token.
func OptionalAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if token != "" && token != header {
			if claims, err := auth.ParseToken(jwtSecret, token); err == nil {
				c.Set(ContextUserID, claims.UserID)
				c.Set(ContextRole, claims.Role)
				c.Set(ContextOrgID, claims.OrganizationID)
			}
		}
		c.Next()
	}
}

func RequireRole(roles ...models.Role) gin.HandlerFunc {
	allowed := make(map[models.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}

	return func(c *gin.Context) {
		role, _ := c.Get(ContextRole)
		r, _ := role.(models.Role)
		if !allowed[r] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient role"})
			return
		}
		c.Next()
	}
}

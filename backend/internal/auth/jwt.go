package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"be/internal/models"
)

type Claims struct {
	UserID         uint        `json:"user_id"`
	Role           models.Role `json:"role"`
	OrganizationID *uint       `json:"organization_id"`
	jwt.RegisteredClaims
}

func GenerateToken(secret string, userID uint, role models.Role, organizationID *uint) (string, error) {
	claims := Claims{
		UserID:         userID,
		Role:           role,
		OrganizationID: organizationID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ParseToken(secret, tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

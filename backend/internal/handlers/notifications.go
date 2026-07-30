package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"be/internal/middleware"
	"be/internal/models"
)

func (a *API) ListNotifications(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserID)

	var notifications []models.Notification
	if err := a.DB.Where("user_id = ?", userID).Order("created_at desc").Limit(50).Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list notifications"})
		return
	}
	c.JSON(http.StatusOK, notifications)
}

func (a *API) MarkAllNotificationsRead(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextUserID)

	if err := a.DB.Model(&models.Notification{}).
		Where("user_id = ? AND read = ?", userID, false).
		Update("read", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (a *API) MarkNotificationRead(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	userID, _ := c.Get(middleware.ContextUserID)

	if err := a.DB.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("read", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update notification"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

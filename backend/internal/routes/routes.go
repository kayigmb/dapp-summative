package routes

import (
	"github.com/gin-gonic/gin"

	"be/internal/handlers"
	"be/internal/middleware"
	"be/internal/models"
)

func Register(router *gin.Engine, api *handlers.API) {
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})

	auth := router.Group("/api/auth")
	{
		auth.POST("/register", api.Register)
		auth.POST("/login", api.Login)
		auth.POST("/logout", api.Logout)
		auth.POST("/connect-wallet", api.ConnectWallet)
		auth.POST("/verify-wallet", middleware.OptionalAuth(api.Cfg.JWTSecret), api.VerifyWallet)
	}

	authed := router.Group("/api")
	authed.Use(middleware.RequireAuth(api.Cfg.JWTSecret, api.DB))
	{
		authed.GET("/users", api.ListUsers)
		authed.GET("/users/:id", api.GetUser)
		authed.PUT("/users/:id", api.UpdateUser)
		authed.GET("/users/:id/profile-history", api.ProfileHistory)
		authed.GET("/users/:id/activity", api.UserActivity)
		authed.PUT("/users/:id/status", api.SetUserStatus)

		authed.POST("/shipments", api.CreateShipment)
		authed.GET("/shipments", api.ListShipments)
		authed.GET("/shipments/:id", api.GetShipment)
		authed.PUT("/shipments/:id", api.UpdateShipment)
		authed.POST("/shipments/:id/handover", api.InitiateHandover)
		authed.POST("/shipments/:id/handover/accept", api.AcceptHandover)
		authed.POST("/shipments/:id/handover/reject", api.RejectHandover)

		authed.POST("/tracking/update", api.UpdateTracking)

		authed.GET("/notifications", api.ListNotifications)
		authed.POST("/notifications/read-all", api.MarkAllNotificationsRead)
		authed.POST("/notifications/:id/read", api.MarkNotificationRead)

		authed.GET("/admin/overview", middleware.RequireRole(models.RoleSuperAdmin), api.AdminOverview)

		authed.POST("/organizations", middleware.RequireRole(models.RoleSuperAdmin), api.CreateOrganization)
		authed.GET("/organizations", middleware.RequireRole(models.RoleSuperAdmin, models.RoleOrgAdmin), api.ListOrganizations)
		authed.GET("/organizations/:id", api.GetOrganization)
		authed.PUT("/organizations/:id", api.UpdateOrganization)
		authed.GET("/organizations/:id/users", api.ListOrganizationUsers)
		authed.POST("/organizations/:id/users", api.AddUserToOrganization)
		authed.DELETE("/organizations/:id/users/:userId", api.RemoveUserFromOrganization)
		authed.POST("/organizations/:id/invites", api.CreateInvite)
		authed.GET("/organizations/:id/invites", api.ListOrganizationInvites)
		authed.DELETE("/organizations/:id/invites/:inviteId", api.DeleteInvite)
		authed.GET("/organizations/:id/branches", api.ListBranches)
		authed.POST("/organizations/:id/branches", api.CreateBranch)
		authed.GET("/organizations/:id/warehouses", api.ListWarehouses)
		authed.POST("/organizations/:id/warehouses", api.CreateWarehouse)
		authed.GET("/organizations/:id/activity", api.OrgActivity)
	}

	// Public: anyone with a tracking number can look up shipment history.
	router.GET("/api/tracking/:trackingNumber", api.GetTracking)

	// Public: the invitee has no account yet.
	router.GET("/api/invites/:token", api.GetInviteByToken)
	router.POST("/api/invites/:token/accept", api.AcceptInvite)
}

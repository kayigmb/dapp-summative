package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"be/internal/auth"
	"be/internal/middleware"
	"be/internal/models"
)

const inviteExpiry = 7 * 24 * time.Hour

// requesterContext pulls the three auth values every org-scoped handler
// needs out of gin.Context.
func requesterContext(c *gin.Context) (role models.Role, orgID *uint, userID uint) {
	roleVal, _ := c.Get(middleware.ContextRole)
	role, _ = roleVal.(models.Role)
	orgVal, _ := c.Get(middleware.ContextOrgID)
	orgID, _ = orgVal.(*uint)
	idVal, _ := c.Get(middleware.ContextUserID)
	userID, _ = idVal.(uint)
	return role, orgID, userID
}

// canViewOrg: super_admin sees any org; everyone else must belong to it.
func canViewOrg(role models.Role, requesterOrgID *uint, targetOrgID uint) bool {
	if role == models.RoleSuperAdmin {
		return true
	}
	return requesterOrgID != nil && *requesterOrgID == targetOrgID
}

// canManageOrg: super_admin any org; org_admin only their own.
func canManageOrg(role models.Role, requesterOrgID *uint, targetOrgID uint) bool {
	if role == models.RoleSuperAdmin {
		return true
	}
	return role == models.RoleOrgAdmin && requesterOrgID != nil && *requesterOrgID == targetOrgID
}

type createOrganizationRequest struct {
	Name          string `json:"name" binding:"required"`
	Address       string `json:"address"`
	LicenseNumber string `json:"license_number"`
}

// CreateOrganization is super_admin-only (enforced at the route level).
func (a *API) CreateOrganization(c *gin.Context) {
	var req createOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	org := models.Organization{Name: req.Name, Address: req.Address, LicenseNumber: req.LicenseNumber}
	if err := a.DB.Create(&org).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create organization"})
		return
	}
	c.JSON(http.StatusCreated, org)
}

// ListOrganizations: super_admin sees all (paginated + search); org_admin
// is scoped to just their own org.
func (a *API) ListOrganizations(c *gin.Context) {
	role, orgID, _ := requesterContext(c)

	query := a.DB.Model(&models.Organization{})
	if role == models.RoleOrgAdmin {
		if orgID == nil {
			c.JSON(http.StatusOK, gin.H{"items": []models.Organization{}, "total": 0, "page": 1, "page_size": 20})
			return
		}
		query = query.Where("id = ?", *orgID)
	} else if q := c.Query("q"); q != "" {
		query = query.Where("name ILIKE ?", "%"+q+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not count organizations"})
		return
	}

	page, pageSize := parsePageParams(c)
	var orgs []models.Organization
	if err := query.Order("created_at desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&orgs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list organizations"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": orgs, "total": total, "page": page, "page_size": pageSize})
}

func (a *API) GetOrganization(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canViewOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
		return
	}

	var org models.Organization
	if err := a.DB.First(&org, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}

	var userCount, branchCount, warehouseCount, shipmentCount int64
	a.DB.Model(&models.User{}).Where("organization_id = ?", id).Count(&userCount)
	a.DB.Model(&models.Branch{}).Where("organization_id = ?", id).Count(&branchCount)
	a.DB.Model(&models.Warehouse{}).Where("organization_id = ?", id).Count(&warehouseCount)
	a.DB.Model(&models.Shipment{}).
		Where("owner_id IN (SELECT id FROM users WHERE organization_id = ?) OR custodian_id IN (SELECT id FROM users WHERE organization_id = ?)", id, id).
		Count(&shipmentCount)

	c.JSON(http.StatusOK, gin.H{
		"organization":    org,
		"user_count":      userCount,
		"branch_count":    branchCount,
		"warehouse_count": warehouseCount,
		"shipment_count":  shipmentCount,
	})
}

type updateOrganizationRequest struct {
	Name          string `json:"name"`
	Address       string `json:"address"`
	LicenseNumber string `json:"license_number"`
}

func (a *API) UpdateOrganization(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	var req updateOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var org models.Organization
	if err := a.DB.First(&org, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization not found"})
		return
	}
	if req.Name != "" {
		org.Name = req.Name
	}
	if req.Address != "" {
		org.Address = req.Address
	}
	if req.LicenseNumber != "" {
		org.LicenseNumber = req.LicenseNumber
	}
	if err := a.DB.Save(&org).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update organization"})
		return
	}
	c.JSON(http.StatusOK, org)
}

func (a *API) ListOrganizationUsers(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canViewOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
		return
	}

	query := a.DB.Model(&models.User{}).Where("organization_id = ?", id)
	if r := c.Query("role"); r != "" {
		query = query.Where("role = ?", r)
	}
	if s := c.Query("status"); s != "" {
		query = query.Where("status = ?", s)
	}
	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ?", like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not count users"})
		return
	}
	page, pageSize := parsePageParams(c)
	var users []models.User
	if err := query.Order("created_at desc").Offset((page - 1) * pageSize).Limit(pageSize).
		Preload("Branch").Preload("Warehouse").Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": users, "total": total, "page": page, "page_size": pageSize})
}

type addUserToOrgRequest struct {
	UserID      uint        `json:"user_id" binding:"required"`
	Role        models.Role `json:"role" binding:"required"`
	BranchID    *uint       `json:"branch_id"`
	WarehouseID *uint       `json:"warehouse_id"`
}

// org_admin can't grant super_admin/org_admin (no privilege escalation) or
// customer (self-serve only, never an org membership role).
var grantableByOrgAdmin = map[models.Role]bool{
	models.RoleAgent:       true,
	models.RoleTransporter: true,
}

// Also how an agent gets scoped to a warehouse — no separate "assign agent" endpoint.
func (a *API) AddUserToOrganization(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	var req addUserToOrgRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if role == models.RoleOrgAdmin && !grantableByOrgAdmin[req.Role] {
		c.JSON(http.StatusForbidden, gin.H{"error": "org admins cannot grant this role"})
		return
	}
	if req.Role == models.RoleCustomer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "customer is not a valid org membership role"})
		return
	}

	var user models.User
	if err := a.DB.First(&user, req.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	orgIDVal := uint(id)
	user.OrganizationID = &orgIDVal
	user.Role = req.Role
	user.BranchID = req.BranchID
	user.WarehouseID = req.WarehouseID
	if err := a.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add user to organization"})
		return
	}
	c.JSON(http.StatusOK, user)
}

// RemoveUserFromOrganization clears org/branch/warehouse scope; it does not
// delete the user or their shipment history.
func (a *API) RemoveUserFromOrganization(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	userID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var user models.User
	if err := a.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.OrganizationID == nil || *user.OrganizationID != uint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user is not a member of this organization"})
		return
	}

	user.OrganizationID = nil
	user.BranchID = nil
	user.WarehouseID = nil
	if err := a.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not remove user from organization"})
		return
	}
	c.JSON(http.StatusOK, user)
}

type createBranchRequest struct {
	Name    string `json:"name" binding:"required"`
	Address string `json:"address"`
}

func (a *API) ListBranches(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canViewOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
		return
	}

	var branches []models.Branch
	if err := a.DB.Where("organization_id = ?", id).Order("name").Find(&branches).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list branches"})
		return
	}
	c.JSON(http.StatusOK, branches)
}

func (a *API) CreateBranch(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	var req createBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branch := models.Branch{OrganizationID: uint(id), Name: req.Name, Address: req.Address}
	if err := a.DB.Create(&branch).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create branch"})
		return
	}
	c.JSON(http.StatusCreated, branch)
}

type createWarehouseRequest struct {
	Name     string `json:"name" binding:"required"`
	Address  string `json:"address"`
	BranchID *uint  `json:"branch_id"`
}

func (a *API) ListWarehouses(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canViewOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
		return
	}

	var warehouses []models.Warehouse
	if err := a.DB.Where("organization_id = ?", id).Order("name").Find(&warehouses).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list warehouses"})
		return
	}
	c.JSON(http.StatusOK, warehouses)
}

func (a *API) CreateWarehouse(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	var req createWarehouseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	warehouse := models.Warehouse{OrganizationID: uint(id), Name: req.Name, Address: req.Address, BranchID: req.BranchID}
	if err := a.DB.Create(&warehouse).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create warehouse"})
		return
	}
	c.JSON(http.StatusCreated, warehouse)
}

// Empty email = open, reusable invite link; whoever opens it fills in their
// own email at accept time. Non-empty = targeted, single-use.
type createInviteRequest struct {
	Email       string      `json:"email" binding:"omitempty,email"`
	Role        models.Role `json:"role" binding:"required"`
	BranchID    *uint       `json:"branch_id"`
	WarehouseID *uint       `json:"warehouse_id"`
}

// Re-inviting the same pending email reuses the row instead of duplicating it.
func (a *API) CreateInvite(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, userID := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	var req createInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if role == models.RoleOrgAdmin && !grantableByOrgAdmin[req.Role] {
		c.JSON(http.StatusForbidden, gin.H{"error": "org admins cannot grant this role"})
		return
	}
	if req.Role == models.RoleCustomer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "customer is not a valid org membership role"})
		return
	}

	if req.Email != "" {
		var existingUser models.User
		if err := a.DB.Where("email = ? AND status = ?", req.Email, models.StatusActive).
			First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "a user with this email already exists; add them directly instead"})
			return
		}
	}

	token, err := auth.GenerateInviteToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate invite token"})
		return
	}

	var invite models.Invite
	foundExisting := false
	if req.Email != "" {
		err := a.DB.Where("organization_id = ? AND email = ? AND status = ?", id, req.Email, models.InviteStatusPending).
			First(&invite).Error
		foundExisting = err == nil
	}
	if foundExisting {
		invite.Role = req.Role
		invite.BranchID = req.BranchID
		invite.WarehouseID = req.WarehouseID
		invite.Token = token
		invite.InvitedByID = userID
		invite.ExpiresAt = time.Now().Add(inviteExpiry)
		if err := a.DB.Save(&invite).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create invite"})
			return
		}
	} else {
		invite = models.Invite{
			OrganizationID: uint(id),
			Email:          req.Email,
			Role:           req.Role,
			BranchID:       req.BranchID,
			WarehouseID:    req.WarehouseID,
			Token:          token,
			Status:         models.InviteStatusPending,
			InvitedByID:    userID,
			ExpiresAt:      time.Now().Add(inviteExpiry),
		}
		if err := a.DB.Create(&invite).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create invite"})
			return
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"invite":      invite,
		"invite_link": a.Cfg.FrontendOrigin + "/invite/" + token,
	})
}

// ListOrganizationInvites shows pending invites alongside the members list
// so an admin can see who's been invited but hasn't joined yet.
func (a *API) ListOrganizationInvites(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canViewOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member of this organization"})
		return
	}

	query := a.DB.Model(&models.Invite{}).Where("organization_id = ?", id)
	if s := c.Query("status"); s != "" {
		query = query.Where("status = ?", s)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not count invites"})
		return
	}
	page, pageSize := parsePageParams(c)
	var invites []models.Invite
	if err := query.Order("created_at desc").Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&invites).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list invites"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": invites, "total": total, "page": page, "page_size": pageSize})
}

// Works for both a targeted single-use invite and an open reusable link.
func (a *API) DeleteInvite(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to manage this organization"})
		return
	}

	inviteID, err := strconv.ParseUint(c.Param("inviteId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite id"})
		return
	}

	res := a.DB.Where("id = ? AND organization_id = ?", inviteID, id).Delete(&models.Invite{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not revoke invite"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"revoked": true})
}

// Reuses ShipmentHistory and ProfileChange — no new audit table.
func (a *API) OrgActivity(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	role, orgID, _ := requesterContext(c)
	if !canManageOrg(role, orgID, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to view this organization's activity"})
		return
	}

	page, pageSize := parsePageParams(c)

	var shipmentHistory []models.ShipmentHistory
	a.DB.Where("updated_by IN (SELECT id FROM users WHERE organization_id = ?)", id).
		Order("timestamp desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&shipmentHistory)

	var profileChanges []models.ProfileChange
	a.DB.Where("user_id IN (SELECT id FROM users WHERE organization_id = ?)", id).
		Order("changed_at desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&profileChanges)

	c.JSON(http.StatusOK, gin.H{
		"shipment_history": shipmentHistory,
		"profile_changes":  profileChanges,
		"page":             page,
		"page_size":        pageSize,
	})
}

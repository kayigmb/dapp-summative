package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// parsePageParams reads page/page_size query params with sane defaults —
// used consistently by every paginated list endpoint (users, organizations,
// org-scoped users, branches, warehouses, activity feeds).
func parsePageParams(c *gin.Context) (page, pageSize int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ = strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return page, pageSize
}

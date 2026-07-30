package db

import (
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"be/internal/auth"
	"be/internal/models"
)

func Connect(dsn, adminEmail, adminPassword string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&models.Organization{},
		&models.Branch{},
		&models.Warehouse{},
		&models.User{},
		&models.Shipment{},
		&models.ShipmentHistory{},
		&models.Notification{},
		&models.ProfileChange{},
		&models.Invite{},
	); err != nil {
		return nil, err
	}

	if err := backfillOrgRename(db); err != nil {
		return nil, err
	}
	if err := backfillRoles(db); err != nil {
		return nil, err
	}

	if err := seedSuperAdmin(db, adminEmail, adminPassword); err != nil {
		return nil, err
	}

	return db, nil
}

// One-time copy-and-drop from the old Company table to Organization. No
// migration framework here, so this is best-effort, not reversible.
func backfillOrgRename(db *gorm.DB) error {
	if !db.Migrator().HasTable("companies") {
		return nil
	}
	if err := db.Exec(`INSERT INTO organizations (id, name, address, license_number)
		SELECT id, company_name, address, license_number FROM companies
		ON CONFLICT (id) DO NOTHING`).Error; err != nil {
		return err
	}
	if err := db.Exec(`UPDATE users SET organization_id = company_id WHERE company_id IS NOT NULL`).Error; err != nil {
		return err
	}
	return db.Migrator().DropTable("companies")
}

// Idempotent — re-running is a no-op.
func backfillRoles(db *gorm.DB) error {
	if err := db.Model(&models.User{}).Where("role = ?", "admin").Update("role", string(models.RoleSuperAdmin)).Error; err != nil {
		return err
	}
	if err := db.Model(&models.User{}).Where("role = ?", "supplier").Update("role", string(models.RoleCustomer)).Error; err != nil {
		return err
	}
	if err := db.Model(&models.User{}).Where("role = ?", "warehouse").Update("role", string(models.RoleAgent)).Error; err != nil {
		return err
	}
	return db.Model(&models.User{}).Where("status = ? OR status IS NULL", "").Update("status", string(models.StatusActive)).Error
}

func seedSuperAdmin(db *gorm.DB, email, password string) error {
	var count int64
	if err := db.Model(&models.User{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	admin := models.User{
		Name:         "ChainTrack Admin",
		Email:        email,
		PasswordHash: hash,
		Role:         models.RoleSuperAdmin,
		Status:       models.StatusActive,
	}
	if err := db.Create(&admin).Error; err != nil {
		return err
	}

	log.Printf("seeded default super admin user: %s", email)
	return nil
}

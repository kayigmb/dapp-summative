# ChainTrack

## Blockchain-Based Fraud-Proof Logistics Tracking System

## Project Overview

ChainTrack is a decentralized logistics tracking platform that uses blockchain technology to create a tamper-proof record of shipment movement.

The system combines:

- React frontend
- Go backend
- PostgreSQL database
- Ethereum (Hardhat local / Sepolia Testnet)
- Solidity smart contract
- MetaMask wallet authentication

The goal is to prevent logistics fraud by ensuring shipment history cannot be modified after being recorded on the blockchain.

---

# Mission

Build a blockchain-powered logistics tracking application that improves transparency, prevents shipment manipulation, and creates trust between suppliers, transporters, warehouses, retailers, and customers.

---

# Core Problem

Traditional logistics systems rely on centralized databases.

Problems:

- Shipment records can be modified
- Fake delivery confirmations
- Lost shipment history
- Counterfeit products
- Lack of transparency
- No trusted audit trail

Blockchain solves this by creating immutable shipment records.

---

# System Architecture

```
                    Users

                      |
                      |

              React Frontend

                      |
                      |

              Go REST API (Gin)

        ----------------------------

        |                          |

 PostgreSQL Database        Ethereum (go-ethereum)

 Users                     Solidity Contract

 Companies                     |

 Shipments                Blockchain History

 Logs
```

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router
- TanStack Query
- ethers.js
- MetaMask

## Backend

Language: Go

Framework: Gin

Libraries:

- GORM
- JWT
- bcrypt
- go-ethereum

Responsibilities:

- Authentication
- Authorization
- Shipment management
- API services
- Blockchain communication

## Database

PostgreSQL

Stores:

- Users
- Companies
- Roles
- Shipment metadata
- Logs
- Analytics

## Blockchain

Network: Hardhat local node (dev) / Ethereum Sepolia Testnet (deploy)

Smart Contract: Solidity

Development: Hardhat

Wallet: MetaMask

---

# User Roles

## Admin

- Manage users
- Manage companies
- View all shipments
- View audit logs

## Supplier

- Create shipment
- Upload documents
- Assign transporter

## Transporter

- Accept shipment
- Update location
- Update status

## Warehouse

- Receive shipment
- Inspect shipment
- Transfer ownership

## Customer

- Track shipment
- Verify authenticity

---

# Authentication System

Hybrid authentication: email/password + wallet signature.

## Registration

User submits:

- Name
- Email
- Password
- Company
- Role
- Wallet Address

Backend:

1. Validate input
2. Hash password using bcrypt
3. Store user in PostgreSQL
4. Create account

## Login Flow

```
Email
 +
Password

      |

Backend Validation

      |

JWT Token Generated

      |

Access Dashboard
```

## Wallet Authentication

```
Connect MetaMask

        |

Sign Message

        |

Backend verifies signature

        |

Wallet authorized
```

---

# Main Features

## User Management

- Register
- Login
- Logout
- Role management
- Wallet linking

## Shipment Management

Users can:

- Create shipments
- Assign transporters
- Update shipment status
- Transfer ownership
- Confirm delivery
- View history

## Shipment Lifecycle

```
Created
   |
Picked Up
   |
In Transit
   |
Warehouse Received
   |
Out For Delivery
   |
Delivered
```

Every status update creates:

- Database record
- Blockchain transaction
- Timestamp
- Wallet signature

## Tracking System

Every shipment has:

```
Tracking Number
+
Blockchain ID
```

Customer workflow:

```
Open Tracking Page

      |

Backend Lookup

      |

Blockchain Verification

      |

Display Shipment History
```

---

# Smart Contract

Location:

```
contract/contracts/ChainTrack.sol
```

## Shipment Structure

```solidity
Shipment {
  id
  productName
  origin
  destination
  owner
  status
  timestamp
}
```

## Smart Contract Functions

```solidity
createShipment()
updateStatus()
transferOwnership()
confirmDelivery()
getShipment()
getShipmentHistory()
verifyShipment()
```

## Smart Contract Events

```solidity
ShipmentCreated
StatusUpdated
OwnershipTransferred
DeliveryConfirmed
```

---

# Backend API

## Authentication

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/connect-wallet
POST /api/auth/verify-wallet
```

## Users

```
GET /api/users
GET /api/users/:id
PUT /api/users/:id
```

## Shipments

```
POST /api/shipments
GET  /api/shipments
GET  /api/shipments/:id
PUT  /api/shipments/:id
```

## Tracking

```
GET  /api/tracking/:trackingNumber
POST /api/tracking/update
```

---

# Database Schema

## Users Table

```
id
name
email
password_hash
wallet_address
role
company_id
created_at
```

## Companies Table

```
id
company_name
address
license_number
```

## Shipments Table

```
id
tracking_number
product_name
origin
destination
status
blockchain_id
created_at
```

## Shipment History Table

```
id
shipment_id
old_status
new_status
location
transaction_hash
updated_by
timestamp
```

---

# Project Folder Structure

```
dapp-summative/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── routes/          # login, register, dashboard, track
│   │   ├── lib/             # api, auth, wallet
│   │   └── integrations/
│   └── Dockerfile
│
├── backend/
│   ├── internal/
│   │   ├── auth/
│   │   ├── blockchain/
│   │   ├── config/
│   │   ├── contract/
│   │   ├── db/
│   │   ├── handlers/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── routes/
│   ├── main.go
│   └── Dockerfile
│
├── contract/
│   ├── contracts/
│   │   └── ChainTrack.sol
│   ├── scripts/
│   │   └── deploy.js
│   ├── test/
│   ├── hardhat.config.js
│   └── Dockerfile          # local hardhat node
│
├── docker-compose.yml      # postgres + hardhat + backend + frontend
├── .env.docker.example     # env for the full docker-compose stack
├── Makefile                # combined fe/be/db/docker commands
└── README.md
```

---

# Getting Started

Requires: Go 1.25+, Node/pnpm, Docker (for Postgres, or the full stack — see below), MetaMask.

```
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

make install     # go mod download + pnpm install
make db-up       # start Postgres via docker-compose
make dev         # run backend (:5001) + frontend (:3000) together
```

Or skip the host toolchain entirely and run everything in Docker — see [Docker (full stack)](#docker-full-stack) below.

## Makefile targets

```
make install          install-backend + install-frontend
make install-backend  go mod download
make install-frontend pnpm install
make dev              db-up, then backend + frontend in parallel
make dev-backend      go run main.go
make dev-frontend     pnpm dev
make build            build-backend + build-frontend
make test             test-contract (npx hardhat test)
make lint             pnpm lint
make db-up            docker compose up -d postgres
make db-down          docker compose down
make docker-build     build all four service images
make docker-up        docker compose up --build (postgres + hardhat + backend + frontend)
make docker-down      docker compose down
make clean            remove build artifacts
```

---

# Docker (full stack)

`docker-compose.yml` runs all four services — postgres, a local hardhat chain, the Go backend, and the frontend — no host Go/Node/pnpm install needed.

```
cp .env.docker.example .env.docker
# fill in POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD

make docker-up
```

Then deploy the contract into the containerized chain once, and put the resulting address in `.env.docker` (`CONTRACT_ADDRESS`) before restarting `backend`/`frontend`:

```
docker compose exec hardhat npx hardhat run scripts/deploy.js --network localhost
```

Ports: frontend `:3000`, backend `:5001`, postgres `:5488`, hardhat `:8545`.

---

# Development Order

## Phase 1 — Project Setup

- Create repositories
- Setup React
- Setup Go backend
- Setup PostgreSQL
- Setup Hardhat

## Phase 2 — Authentication

- Registration
- Login
- JWT
- bcrypt
- MetaMask wallet verification

## Phase 3 — Shipment System

- Create shipment
- Shipment dashboard
- Status updates
- Shipment history

## Phase 4 — Blockchain Integration

- Create Solidity contract
- Write tests
- Deploy contract
- Connect Go backend

## Phase 5 — Frontend Integration

- Dashboard
- Tracking page
- Blockchain verification

---

# Ethereum Deployment (contract/)

Requires: Node.js, Hardhat, MetaMask, Git.

```
cd contract
npm install
```

## Compile

```
npx hardhat compile
```

## Run local node

```
npx hardhat node
```

## Run tests

```
npx hardhat test
```

## Deploy

```
npx hardhat run scripts/deploy.js --network sepolia
```

Save: contract address, transaction hash, deployment block. Set `CONTRACT_ADDRESS` in `backend/.env` and `VITE_CONTRACT_ADDRESS` in `frontend/.env`.

---

# Environment Variables

Backend (`backend/.env`):

```
DATABASE_URL=
JWT_SECRET=
ETH_RPC_URL=
CONTRACT_ADDRESS=
PRIVATE_KEY=
PORT=
```

Frontend (`frontend/.env`):

```
VITE_API_URL=
VITE_CONTRACT_ADDRESS=
VITE_NETWORK=
```

---

# Testing Requirements

## Smart Contract Tests (`contract/test`)

- Shipment creation
- Status update
- Ownership transfer
- Unauthorized actions

Run: `npx hardhat test` (in `contract/`), or `make test`.

Backend and frontend have no automated test suite currently — verify those manually against the running app.

---

# Required Documentation

The final project report must include:

## Problem Identification

- Logistics fraud problem
- Why blockchain is suitable

## Solution Design

- Architecture
- Database design
- Smart contract design

## Implementation

- Screenshots
- Code snippets
- Deployment information

## Testing

- Test cases
- Expected results
- Actual results

---

# Final Goal

A complete working blockchain logistics application where:

```
Supplier creates shipment
        ↓
Blockchain stores shipment proof
        ↓
Transporter updates status
        ↓
Warehouse confirms receipt
        ↓
Customer verifies shipment history
        ↓
Fraudulent modification becomes impossible
```

# SwiftCargo API Reference

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## Authentication Endpoints

### Register
```
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+254712345678",
  "referral_code": "REF_OPTIONAL"
}

Response (201):
{
  "success": true,
  "message": "Registration successful",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+254712345678",
    "warehouse_id": "SC-XXXX",
    "referral_code": "REF_XXXX",
    "role": "customer"
  }
}
```

### Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

Response (200):
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "customer",
    "warehouse_id": "SC-XXXX",
    "language_pref": "en",
    "wallet_balance": 1500.00
  }
}
```

### Get Current User
```
GET /auth/me
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "phone": "+254712345678",
    "role": "customer",
    "warehouse_id": "SC-XXXX",
    "language_pref": "en",
    "referral_code": "REF_XXXX",
    "wallet_balance": 1500.00,
    "created_at": "2026-03-31T12:00:00Z",
    "updated_at": "2026-03-31T12:00:00Z"
  }
}
```

### Update Profile
```
PUT /auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Updated",
  "phone": "+254723456789",
  "language_pref": "sw"
}

Response (200):
{
  "success": true,
  "message": "Profile updated successfully",
  "user": { /* updated user object */ }
}
```

### Change Password
```
PUT /auth/password
Authorization: Bearer <token>
Content-Type: application/json

{
  "current_password": "password123",
  "new_password": "newpassword123"
}

Response (200):
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Order Endpoints

### Create Order
```
POST /orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "retailer": "Amazon",
  "market": "USA",
  "description": "Electronics and accessories",
  "weight_kg": 2.5,
  "dimensions": {
    "length": 30,
    "width": 20,
    "height": 15
  },
  "shipping_speed": "economy",
  "insurance": true,
  "declared_value": 150
}

Response (201):
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "uuid",
    "tracking_number": "SC-20260331-XXXX",
    "retailer": "Amazon",
    "market": "USA",
    "description": "Electronics and accessories",
    "weight_kg": 2.5,
    "dimensions": { /* as provided */ },
    "shipping_speed": "economy",
    "insurance": true,
    "declared_value": 150,
    "status": "pending",
    "cost_breakdown": {
      "summary": {
        "total": 3450.50,
        "currency": "KES",
        "shipping_speed": "economy",
        "market": "USA"
      },
      "breakdown": {
        "base_shipping": { "amount": 2600.00 },
        "dimensional_weight": { /* details */ },
        "insurance": { "amount": 4.50 },
        "handling_fee": { "amount": 250.00 },
        "customs_estimate": { "amount": 30.00 }
      }
    }
  }
}
```

### List Orders
```
GET /orders?page=1&limit=10&status=pending&market=USA
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "orders": [ /* array of orders */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Get Order Details
```
GET /orders/{id}
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "order": { /* full order object */ },
  "packages": [ /* associated packages */ ]
}
```

### Update Order (Admin)
```
PUT /orders/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "in_transit",
  "actual_cost": 3200,
  "customs_duty": 500
}

Response (200):
{
  "success": true,
  "message": "Order updated successfully",
  "order": { /* updated order */ }
}
```

---

## Tracking Endpoints

### Public Tracking (No Auth)
```
GET /tracking/{trackingNumber}

Response (200):
{
  "success": true,
  "tracking": {
    "id": "uuid",
    "user_id": "uuid",
    "tracking_number": "SC-20260331-XXXX",
    "retailer": "Amazon",
    "market": "USA",
    "status": "in_transit",
    "packages": [ /* array of packages */ ]
  }
}
```

### Get User's Packages
```
GET /tracking/user/packages?page=1&status=in_transit
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "packages": [
    {
      "id": "uuid",
      "tracking_number": "SC-20260331-XXXX",
      "retailer": "Amazon",
      "market": "USA",
      "status": "in_transit",
      "weight_kg": 2.5,
      "warehouse_location": "Section-A-45",
      "received_at": "2026-03-25T10:30:00Z"
    }
  ],
  "pagination": { /* pagination details */ }
}
```

### Update Package Status (Admin)
```
PUT /tracking/{packageId}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "out_for_delivery",
  "warehouse_location": "Section-B-78"
}

Response (200):
{
  "success": true,
  "message": "Package status updated successfully",
  "package": { /* updated package */ }
}
```

---

## Wallet Endpoints

### Get Wallet
```
GET /wallet
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "wallet": {
    "id": "uuid",
    "user_id": "uuid",
    "balance": 5000.00,
    "currency": "KES",
    "last_updated": "2026-03-31T12:00:00Z"
  },
  "recent_transactions": [
    {
      "id": "uuid",
      "type": "deposit",
      "amount": 2000,
      "currency": "KES",
      "payment_method": "mpesa",
      "status": "completed",
      "created_at": "2026-03-31T10:00:00Z"
    }
  ]
}
```

### Deposit Funds
```
POST /wallet/deposit
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 1000,
  "payment_method": "mpesa",
  "payment_details": {
    "phone": "+254712345678"
  }
}

Response (202):
{
  "success": true,
  "message": "Deposit initiated",
  "transaction_id": "uuid",
  "processing": {
    "success": true,
    "method": "MPESA_STK_PUSH",
    "phone": "+254712345678",
    "amount": 1000,
    "instruction": "Check your phone for M-Pesa prompt"
  }
}
```

### Pay from Wallet
```
POST /wallet/pay
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_id": "uuid",
  "amount": 3450.50
}

Response (200):
{
  "success": true,
  "message": "Payment completed from wallet",
  "transaction_id": "uuid",
  "amount_paid": 3450.50,
  "order_id": "uuid",
  "new_balance": 1549.50
}
```

### Transaction History
```
GET /wallet/transactions?page=1&type=deposit&status=completed
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "transactions": [ /* array of transactions */ ],
  "pagination": { /* pagination details */ }
}
```

---

## Referral Endpoints

### Get Referral Info
```
GET /referral
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "referral": {
    "referral_code": "REF_XXXX",
    "current_balance": 5000,
    "statistics": {
      "total_referrals": 3,
      "completed_referrals": 2,
      "total_earned": 100,
      "pending_referrals": 1
    }
  },
  "referred_users": [
    {
      "id": "uuid",
      "referee_email": "jane@example.com",
      "referee_name": "Jane Smith",
      "orders_placed": 2,
      "reward_status": "completed",
      "reward_amount": 50,
      "referred_at": "2026-03-15T08:00:00Z"
    }
  ]
}
```

### Apply Referral Code
```
POST /referral/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "referral_code": "REF_XXXX"
}

Response (200):
{
  "success": true,
  "message": "Referral code applied successfully",
  "referrer_code": "REF_XXXX"
}
```

### Referral History
```
GET /referral/history?page=1&limit=10
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "referrals": [ /* array of referrals */ ],
  "pagination": { /* pagination details */ }
}
```

---

## Ticket Endpoints

### Create Ticket
```
POST /tickets
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- subject: "Package Delayed"
- description: "My package has not arrived as expected"
- priority: "high"
- photo: (file - optional)

Response (201):
{
  "success": true,
  "message": "Ticket created successfully",
  "ticket": {
    "id": "uuid",
    "user_id": "uuid",
    "subject": "Package Delayed",
    "description": "My package has not arrived as expected",
    "status": "open",
    "priority": "high",
    "photo_url": "/uploads/ticket-xxx.jpg",
    "created_at": "2026-03-31T12:00:00Z"
  }
}
```

### List Tickets
```
GET /tickets?page=1&status=open&priority=high
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "tickets": [ /* array of tickets */ ],
  "pagination": { /* pagination details */ }
}
```

### Get Ticket Details
```
GET /tickets/{id}
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "ticket": { /* ticket object */ },
  "messages": [
    {
      "id": "uuid",
      "message": "Hello, we received your ticket",
      "email": "admin@swiftcargo.co.ke",
      "name": "SwiftCargo Admin",
      "role": "admin",
      "created_at": "2026-03-31T12:30:00Z"
    }
  ]
}
```

### Add Message to Ticket
```
POST /tickets/{id}/message
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Have you tracked your package?"
}

Response (201):
{
  "success": true,
  "message": "Message added successfully",
  "message_id": "uuid"
}
```

### Update Ticket Status (Admin)
```
PUT /tickets/{id}/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "resolved",
  "admin_message": "Your package has been located and is on the way"
}

Response (200):
{
  "success": true,
  "message": "Ticket status updated successfully",
  "ticket": { /* updated ticket */ }
}
```

---

## Pricing Endpoints

### Calculate Shipping Cost
```
POST /pricing/calculate
Content-Type: application/json

{
  "weight_kg": 2.5,
  "dimensions": {
    "length": 30,
    "width": 20,
    "height": 15
  },
  "market": "USA",
  "shipping_speed": "economy",
  "insurance": true,
  "declared_value": 150
}

Response (200):
{
  "success": true,
  "pricing": {
    "summary": {
      "total": 3450.50,
      "currency": "KES",
      "shipping_speed": "economy",
      "market": "USA"
    },
    "breakdown": {
      "base_shipping": {
        "amount": 2600.00,
        "description": "Base shipping cost (2.50 kg @ 10.00 USD/kg economy)"
      },
      "dimensional_weight": {
        "actual_weight_kg": 2.5,
        "dimensional_weight_kg": 1.8,
        "chargeable_weight_kg": 2.5,
        "calculation": "(30x20x15)/5000"
      },
      "insurance": {
        "amount": 4.50,
        "rate": "3% of declared value",
        "declared_value": 150,
        "included": true
      },
      "handling_fee": {
        "amount": 250.00,
        "description": "Handling and processing fee"
      },
      "customs_estimate": {
        "amount": 30.00,
        "vat_rate": "16%",
        "duty_rate": "10%",
        "declared_value": 150,
        "note": "Estimate only"
      }
    },
    "notes": {
      "delivery_time": "10-14 business days",
      "warehouse": "31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB"
    }
  }
}
```

---

## Exchange Rate Endpoints

### Get Rates
```
GET /exchange/rates

Response (200):
{
  "success": true,
  "message": "Exchange rates retrieved",
  "data": {
    "USD_KES": 130.50,
    "GBP_KES": 164.20,
    "EUR_KES": 142.80,
    "CNY_KES": 18.20,
    "timestamp": "2026-03-31T12:00:00Z",
    "last_updated": "31 Mar, 2:00 PM East Africa Time"
  }
}
```

### Convert Currency
```
POST /exchange/convert
Content-Type: application/json

{
  "amount": 100,
  "from_currency": "USD",
  "to_currency": "KES"
}

Response (200):
{
  "success": true,
  "conversion": {
    "amount": 100,
    "from_currency": "USD",
    "to_currency": "KES",
    "rate": 130.50,
    "converted_amount": 13050.00,
    "timestamp": "2026-03-31T12:00:00Z"
  }
}
```

---

## Consolidation Endpoints

### Get Packages Waiting
```
GET /consolidation
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "packages_waiting": 3,
  "total_weight_kg": 7.5,
  "packages": [
    {
      "id": "uuid",
      "description": "Electronics",
      "weight_kg": 2.5,
      "received_at": "2026-03-25T10:00:00Z",
      "warehouse_location": "Section-A-45",
      "tracking_number": "SC-20260331-XXXX",
      "retailer": "Amazon",
      "market": "USA"
    }
  ]
}
```

### Request Consolidation
```
POST /consolidation/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "package_ids": ["uuid1", "uuid2", "uuid3"]
}

Response (201):
{
  "success": true,
  "message": "Consolidation request created",
  "consolidation": {
    "consolidation_id": "uuid",
    "packages_count": 3,
    "total_weight_kg": 7.5,
    "status": "consolidating",
    "created_at": "2026-03-31T12:00:00Z"
  }
}
```

### Get Consolidation Details
```
GET /consolidation/{consolidationId}
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "consolidation": {
    "consolidation_id": "uuid",
    "status": "in_transit",
    "packages_count": 3,
    "total_weight_kg": 7.5,
    "packages": [ /* array of packages */ ]
  }
}
```

---

## Prohibited Items Endpoints

### Check Item
```
GET /prohibited/check?item=fireworks

Response (200):
{
  "success": true,
  "item": "fireworks",
  "check": {
    "allowed": false,
    "reason": "Safety hazard during transportation",
    "category": "Dangerous Goods",
    "risk_level": "critical"
  }
}
```

### Get Categories
```
GET /prohibited/categories

Response (200):
{
  "success": true,
  "categories": [
    {
      "category": "Dangerous Goods",
      "risk_level": "critical",
      "item_count": 17,
      "reason": "Safety hazard during transportation"
    }
  ]
}
```

### Get Items in Category
```
GET /prohibited/categories/Dangerous%20Goods

Response (200):
{
  "success": true,
  "category": {
    "category": "Dangerous Goods",
    "risk_level": "critical",
    "reason": "Safety hazard during transportation",
    "items": ["explosives", "flammable liquids", ...]
  }
}
```

---

## Admin Endpoints

### List Users
```
GET /admin/users?page=1&search=john&role=customer
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "users": [ /* array of users */ ],
  "pagination": { /* pagination details */ }
}
```

### Get User Details
```
GET /admin/users/{userId}
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "name": "John Doe",
    "ordersCount": 5,
    "orders": [ /* user's orders */ ]
  },
  "recentTransactions": [ /* recent transactions */ ]
}
```

### Update User
```
PUT /admin/users/{userId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin",
  "is_active": false
}

Response (200):
{
  "success": true,
  "message": "User updated successfully",
  "user": { /* updated user */ }
}
```

### List All Orders
```
GET /admin/orders?page=1&status=delivered&market=USA&startDate=2026-03-01&endDate=2026-03-31
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "orders": [ /* array of orders */ ],
  "pagination": { /* pagination details */ }
}
```

### Bulk Update Orders
```
PUT /admin/orders/bulk-update
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_ids": ["uuid1", "uuid2"],
  "status": "in_transit"
}

Response (200):
{
  "success": true,
  "message": "Updated 2 orders",
  "updated_count": 2,
  "orders": [ /* updated orders */ ]
}
```

### Dashboard Stats
```
GET /admin/stats
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "stats": {
    "users": {
      "total": 100,
      "customers": 95,
      "admins": 5,
      "active_users": 85
    },
    "orders": {
      "total_orders": 250,
      "delivered": 180,
      "pending": 30,
      "in_transit": 40,
      "avg_estimated_cost": 3500,
      "total_estimated_value": 875000
    },
    "markets": [ /* orders by market */ ],
    "order_statuses": [ /* orders by status */ ],
    "revenue": {
      "total_transactions": 200,
      "total_revenue": 650000,
      "deposits": 400000,
      "payments": 250000
    }
  }
}
```

### Revenue Report
```
GET /admin/revenue?startDate=2026-03-01&endDate=2026-03-31
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "revenue": [ /* daily revenue data */ ],
  "summary": [ /* revenue by payment method */ ]
}
```

### Export Revenue
```
GET /admin/revenue/export?startDate=2026-03-01&endDate=2026-03-31
Authorization: Bearer <token>

Response (200):
Content-Type: text/csv
Content-Disposition: attachment; filename="revenue-export.csv"

(CSV file with transaction data)
```

### Admin Logs
```
GET /admin/logs?page=1&limit=10
Authorization: Bearer <token>

Response (200):
{
  "success": true,
  "logs": [ /* array of logs */ ],
  "pagination": { /* pagination details */ }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Missing required fields: name, email, password, phone"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Missing or invalid authorization header"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Admin access required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Order not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Email already registered"
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Rate Limiting

- **General endpoints:** 100 requests per 15 minutes
- **Auth endpoints:** 5 requests per 15 minutes

Returns `429 Too Many Requests` when exceeded.

---

## Pagination

Most list endpoints support pagination:

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)

**Response includes:**
```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15
  }
}
```

---

## Best Practices

1. Always include `Authorization` header for protected endpoints
2. Check `success` flag in response before processing data
3. Handle error responses with appropriate messages
4. Implement pagination for list endpoints
5. Use appropriate HTTP methods (GET, POST, PUT)
6. Validate input before sending to API
7. Implement exponential backoff for retries
8. Cache exchange rates (valid for ~5 minutes)
9. Store JWT tokens securely
10. Refresh tokens before expiration

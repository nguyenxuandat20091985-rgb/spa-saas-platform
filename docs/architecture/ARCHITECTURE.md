# AI SPA ECOSYSTEM - Enterprise Architecture V20

## 1. System Overview

```
+------------------+    +------------------+    +----------------------+
|  SPA OWNER APP   |    |  CUSTOMER APP    |    |  SUPER ADMIN         |
|  (Flutter Web/   |    |  (Flutter Web/   |    |  PLATFORM            |
|   Mobile)        |    |   Mobile)        |    |  (Flutter Web)       |
+--------+---------+    +--------+---------+    +----------+-----------+
         |                       |                         |
         +----------+------------+-------------------------+
                    |
            +-------v--------+
            |  API GATEWAY   |  (NodeJS - Express)
            |  Rate Limit    |
            |  Auth Verify   |
            |  Tenant Route  |
            +-------+--------+
                    |
    +---------------+----------------+------------------+
    |               |                |                  |
+---v---+    +------v-----+   +-----v------+    +------v------+
| AUTH  |    | CORE SVC   |   | AI GATEWAY |    | ADMIN SVC   |
| SVC   |    | (Booking,  |   |            |    |             |
|       |    |  POS, CRM, |   +-----+------+    +-------------+
+-------+    |  Inventory)|         |
             +------------+   +-----v------+
                              | AI BRAIN   |
                              | CLOUD      |
                              +-----+------+
                                    |
                              +-----v------+
                              | Vector DB  |
                              | (Qdrant)   |
                              +------------+
```

## 2. Microservices Architecture

### Services

| Service | Port | Responsibility |
|---------|------|----------------|
| api-gateway | 3000 | Request routing, rate limiting, auth verification |
| auth-service | 3001 | Firebase Auth integration, JWT, RBAC |
| user-service | 3002 | User profiles, tenant user management |
| booking-service | 3003 | Appointments, scheduling, calendar |
| pos-service | 3004 | Sales, payments, invoices |
| inventory-service | 3005 | Stock management, products, equipment |
| crm-service | 3006 | Customer 360, history, interactions |
| notification-service | 3007 | Push, SMS, Email, Zalo notifications |
| billing-service | 3008 | Subscription plans, tenant billing |
| membership-service | 3009 | Loyalty, points, membership tiers |
| ai-gateway | 3010 | AI provider abstraction (Gemini/GPT/Claude) |
| ai-brain-service | 3011 | Knowledge base, RAG, embeddings |
| ai-automation-service | 3012 | Marketing automation, predictions |
| analytics-service | 3013 | Dashboard metrics, reporting |
| media-service | 3014 | File upload, image processing |
| admin-service | 3015 | Super admin operations |

### Communication

- **Synchronous**: REST API (service-to-service via internal network)
- **Asynchronous**: Redis Pub/Sub for event-driven communication
- **Events**: booking.created, payment.completed, customer.updated, ai.response.ready

## 3. Multi-Tenant Architecture

### Tenant Isolation Strategy

```
Shared Database + Row-Level Security (RLS)

Every table includes:
  tenant_id UUID NOT NULL REFERENCES tenants(id)

PostgreSQL RLS policies enforce tenant isolation at DB level.
Application layer sets: SET app.current_tenant = '<tenant_id>'
```

### Tenant Hierarchy

```
PLATFORM (Super Admin)
  └── TENANT (Spa Business)
       ├── BRANCH (Location)
       │    ├── STAFF
       │    ├── ROOMS
       │    └── EQUIPMENT
       └── CUSTOMERS
```

## 4. Database Schema

### Core Tables

```sql
-- TENANTS & ORGANIZATIONS
tenants
  id, name, slug, owner_id, subscription_plan, status,
  settings(jsonb), branding(jsonb), created_at, updated_at

branches
  id, tenant_id, name, address, phone, email, working_hours(jsonb),
  latitude, longitude, status, created_at

-- USERS & AUTH
users
  id, tenant_id, firebase_uid, email, phone, full_name, avatar_url,
  role, branch_id, status, last_login_at, created_at

roles: super_admin | tenant_owner | manager | receptionist | staff | customer

-- CUSTOMERS (CRM 360)
customers
  id, tenant_id, user_id, full_name, phone, email, gender, date_of_birth,
  avatar_url, skin_type, skin_concerns(text[]), allergy_notes,
  membership_tier, loyalty_points, total_spent, visit_count,
  last_visit_at, acquisition_source, tags(text[]),
  ai_profile(jsonb), notes, status, created_at, updated_at

customer_interactions
  id, tenant_id, customer_id, type, channel, content,
  staff_id, metadata(jsonb), created_at

customer_skin_records
  id, tenant_id, customer_id, image_url, analysis_result(jsonb),
  notes, recorded_by, created_at

-- SERVICES & PRODUCTS
service_categories
  id, tenant_id, name, description, icon, sort_order, status

services
  id, tenant_id, category_id, name, description, duration_minutes,
  price, discount_price, image_url, procedure_steps(jsonb),
  contraindications(text[]), status, created_at

products
  id, tenant_id, category_id, name, description, sku, barcode,
  price, cost_price, image_url, ingredients(text[]),
  usage_instructions, volume, unit, status, created_at

product_categories
  id, tenant_id, name, description, icon, sort_order

-- BOOKING SYSTEM
appointments
  id, tenant_id, branch_id, customer_id, service_id, staff_id,
  room_id, equipment_id, start_time, end_time, status,
  notes, source, reminder_sent, confirmed_at,
  cancelled_at, cancellation_reason, created_at

appointment_status: pending | confirmed | in_progress | completed | cancelled | no_show

rooms
  id, tenant_id, branch_id, name, capacity, equipment(text[]), status

equipment
  id, tenant_id, branch_id, name, type, serial_number,
  maintenance_schedule(jsonb), status, last_maintenance_at

staff_schedules
  id, tenant_id, staff_id, branch_id, day_of_week, start_time,
  end_time, is_available, break_start, break_end

-- POS & PAYMENTS
orders
  id, tenant_id, branch_id, customer_id, staff_id, order_number,
  subtotal, discount_amount, tax_amount, total_amount,
  payment_method, payment_status, payment_reference,
  voucher_id, notes, created_at

order_items
  id, order_id, item_type, item_id, item_name, quantity,
  unit_price, discount, total, notes

payment_methods: cash | card | qr | transfer | installment

invoices
  id, tenant_id, order_id, customer_id, invoice_number,
  amount, tax, total, status, due_date, paid_at, created_at

installments
  id, tenant_id, invoice_id, customer_id, total_amount,
  installment_count, paid_count, next_due_date,
  amount_per_installment, status

-- INVENTORY
inventory
  id, tenant_id, branch_id, product_id, quantity, min_quantity,
  max_quantity, location, updated_at

inventory_transactions
  id, tenant_id, branch_id, product_id, type, quantity,
  reference_id, reference_type, notes, performed_by, created_at

transaction_type: purchase | sale | adjustment | transfer | return | waste

-- MEMBERSHIP & LOYALTY
membership_tiers
  id, tenant_id, name, level, min_points, discount_percentage,
  benefits(jsonb), color, icon

membership_cards
  id, tenant_id, customer_id, tier_id, card_number,
  points_balance, total_points_earned, activated_at,
  expires_at, status

loyalty_transactions
  id, tenant_id, customer_id, type, points, reference_id,
  reference_type, description, created_at

vouchers
  id, tenant_id, code, type, value, min_order_amount,
  max_uses, used_count, valid_from, valid_until,
  applicable_services(uuid[]), applicable_products(uuid[]),
  status, created_at

customer_vouchers
  id, tenant_id, customer_id, voucher_id, used_at, order_id

-- BILLING (Platform Level - No tenant_id)
subscription_plans
  id, name, slug, tier, monthly_price, yearly_price,
  max_branches, max_staff, max_customers,
  features(jsonb), ai_features(jsonb), status

tenant_subscriptions
  id, tenant_id, plan_id, status, current_period_start,
  current_period_end, trial_ends_at, cancelled_at

platform_invoices
  id, tenant_id, subscription_id, amount, currency,
  status, due_date, paid_at, payment_method

-- AI KNOWLEDGE
ai_knowledge_documents
  id, tenant_id, title, type, file_url, content_text,
  chunk_count, embedding_status, uploaded_by, created_at

ai_knowledge_chunks
  id, tenant_id, document_id, chunk_index, content,
  embedding_id, metadata(jsonb), created_at

ai_conversations
  id, tenant_id, customer_id, session_id, context_type,
  started_at, ended_at, message_count, satisfaction_score

ai_messages
  id, conversation_id, role, content, tokens_used,
  model_used, metadata(jsonb), created_at

ai_product_knowledge
  id, tenant_id, product_id, enhanced_description,
  benefits_summary, usage_guide, faq(jsonb),
  embedding_id, updated_at

ai_service_knowledge
  id, tenant_id, service_id, enhanced_description,
  procedure_detail, aftercare_guide, faq(jsonb),
  embedding_id, updated_at

-- MARKETING & AUTOMATION
campaigns
  id, tenant_id, name, type, channel, target_segment(jsonb),
  content(jsonb), schedule_at, sent_at, status,
  reach_count, open_count, click_count, conversion_count

automation_rules
  id, tenant_id, name, trigger_event, conditions(jsonb),
  actions(jsonb), is_active, last_triggered_at

-- ANALYTICS
daily_metrics
  id, tenant_id, branch_id, date, revenue, order_count,
  new_customers, returning_customers, avg_ticket,
  top_services(jsonb), top_products(jsonb), staff_performance(jsonb)

-- AUDIT
audit_logs
  id, tenant_id, user_id, action, entity_type, entity_id,
  old_values(jsonb), new_values(jsonb), ip_address, created_at
```

## 5. API Design

### Authentication

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh-token
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/verify-email
DELETE /api/v1/auth/logout
```

### Spa Owner APIs

```
# Dashboard
GET    /api/v1/dashboard/overview
GET    /api/v1/dashboard/revenue?period=day|week|month|year
GET    /api/v1/dashboard/kpi
GET    /api/v1/dashboard/staff-performance

# CRM
GET    /api/v1/customers
GET    /api/v1/customers/:id
GET    /api/v1/customers/:id/history
GET    /api/v1/customers/:id/skin-records
POST   /api/v1/customers
PUT    /api/v1/customers/:id
GET    /api/v1/customers/segments/vip
GET    /api/v1/customers/segments/at-risk
GET    /api/v1/customers/segments/dormant

# Booking
GET    /api/v1/appointments
POST   /api/v1/appointments
PUT    /api/v1/appointments/:id
PATCH  /api/v1/appointments/:id/status
GET    /api/v1/appointments/calendar
GET    /api/v1/availability/staff/:staffId
GET    /api/v1/availability/rooms
GET    /api/v1/availability/slots

# POS
POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders/:id/payment
GET    /api/v1/invoices
POST   /api/v1/installments

# Inventory
GET    /api/v1/inventory
POST   /api/v1/inventory/receive
POST   /api/v1/inventory/dispatch
GET    /api/v1/inventory/alerts
GET    /api/v1/products
POST   /api/v1/products
PUT    /api/v1/products/:id

# Services
GET    /api/v1/services
POST   /api/v1/services
PUT    /api/v1/services/:id
GET    /api/v1/service-categories

# Staff
GET    /api/v1/staff
POST   /api/v1/staff
PUT    /api/v1/staff/:id
GET    /api/v1/staff/:id/schedule
PUT    /api/v1/staff/:id/schedule

# Membership
GET    /api/v1/membership/tiers
POST   /api/v1/membership/tiers
GET    /api/v1/membership/cards
POST   /api/v1/membership/cards
GET    /api/v1/loyalty/transactions

# Vouchers
GET    /api/v1/vouchers
POST   /api/v1/vouchers
PUT    /api/v1/vouchers/:id

# Marketing
GET    /api/v1/campaigns
POST   /api/v1/campaigns
PUT    /api/v1/campaigns/:id
POST   /api/v1/campaigns/:id/send

# Automation
GET    /api/v1/automations
POST   /api/v1/automations
PUT    /api/v1/automations/:id

# Analytics
GET    /api/v1/analytics/revenue
GET    /api/v1/analytics/customers
GET    /api/v1/analytics/services
GET    /api/v1/analytics/products
GET    /api/v1/analytics/staff
```

### Customer APIs

```
# Profile
GET    /api/v1/me
PUT    /api/v1/me
GET    /api/v1/me/history
GET    /api/v1/me/skin-records
GET    /api/v1/me/membership
GET    /api/v1/me/loyalty
GET    /api/v1/me/vouchers

# Spa Discovery
GET    /api/v1/spa/:slug
GET    /api/v1/spa/:slug/services
GET    /api/v1/spa/:slug/products
GET    /api/v1/spa/:slug/reviews

# Booking
GET    /api/v1/spa/:slug/availability
POST   /api/v1/spa/:slug/appointments
GET    /api/v1/me/appointments
PUT    /api/v1/me/appointments/:id
DELETE /api/v1/me/appointments/:id

# Shopping
GET    /api/v1/spa/:slug/shop
POST   /api/v1/me/cart
POST   /api/v1/me/orders
GET    /api/v1/me/orders
```

### AI APIs

```
# AI Chat
POST   /api/v1/ai/chat
POST   /api/v1/ai/chat/stream
GET    /api/v1/ai/conversations
GET    /api/v1/ai/conversations/:id

# AI Skin Analysis
POST   /api/v1/ai/skin-analysis

# AI Recommendations
GET    /api/v1/ai/recommendations/services
GET    /api/v1/ai/recommendations/products

# AI Sales (Owner)
POST   /api/v1/ai/sales/consult
POST   /api/v1/ai/sales/closing-script
GET    /api/v1/ai/sales/hot-leads

# AI Marketing (Owner)
POST   /api/v1/ai/marketing/generate-campaign
POST   /api/v1/ai/marketing/generate-content

# AI Knowledge (Owner)
POST   /api/v1/ai/knowledge/upload
GET    /api/v1/ai/knowledge/documents
DELETE /api/v1/ai/knowledge/documents/:id
POST   /api/v1/ai/knowledge/train

# AI Predictions (Owner)
GET    /api/v1/ai/predictions/churn-risk
GET    /api/v1/ai/predictions/revenue-forecast
GET    /api/v1/ai/predictions/trending-services
```

### Super Admin APIs

```
GET    /api/v1/admin/tenants
POST   /api/v1/admin/tenants
PUT    /api/v1/admin/tenants/:id
GET    /api/v1/admin/tenants/:id/usage

GET    /api/v1/admin/subscriptions
GET    /api/v1/admin/revenue
GET    /api/v1/admin/ai-usage

GET    /api/v1/admin/plans
POST   /api/v1/admin/plans
PUT    /api/v1/admin/plans/:id
```

## 6. AI Architecture

```
+------------------------------------------+
|            AI GATEWAY                     |
|  ┌────────────────────────────────────┐   |
|  │  Provider Abstraction Layer        │   |
|  │  ┌──────┐ ┌──────┐ ┌──────┐      │   |
|  │  │Gemini│ │ GPT  │ │Claude│ ...   │   |
|  │  └──────┘ └──────┘ └──────┘      │   |
|  └────────────────────────────────────┘   |
|  ┌────────────────────────────────────┐   |
|  │  Features                          │   |
|  │  - Model routing                   │   |
|  │  - Token tracking                  │   |
|  │  - Rate limiting per tenant        │   |
|  │  - Response caching                │   |
|  │  - Fallback chain                  │   |
|  │  - Cost optimization               │   |
|  └────────────────────────────────────┘   |
+------------------------------------------+

+------------------------------------------+
|          AI BRAIN CLOUD                   |
|  ┌────────────────────────────────────┐   |
|  │  Knowledge Engines                 │   |
|  │  - Product Brain                   │   |
|  │  - Service Brain                   │   |
|  │  - Customer Memory                 │   |
|  │  - Treatment Protocol Brain        │   |
|  └────────────────────────────────────┘   |
|  ┌────────────────────────────────────┐   |
|  │  RAG Pipeline                      │   |
|  │  1. Query → Embedding              │   |
|  │  2. Vector Search (Qdrant)         │   |
|  │  3. Context Assembly               │   |
|  │  4. LLM Generation                 │   |
|  │  5. Response + Citations           │   |
|  └────────────────────────────────────┘   |
|  ┌────────────────────────────────────┐   |
|  │  Specialized AI Agents             │   |
|  │  - Sales Consultant Agent          │   |
|  │  - Closing Agent                   │   |
|  │  - Customer Success Agent          │   |
|  │  - Marketing Agent                 │   |
|  │  - Beauty Advisor Agent            │   |
|  │  - Skin Analysis Agent             │   |
|  │  - Prediction Agent                │   |
|  └────────────────────────────────────┘   |
+------------------------------------------+

+------------------------------------------+
|          VECTOR DATABASE (Qdrant)         |
|  Collections:                             |
|  - products_{tenant_id}                   |
|  - services_{tenant_id}                   |
|  - knowledge_{tenant_id}                  |
|  - customer_profiles_{tenant_id}          |
+------------------------------------------+
```

### AI Agent System Prompts

Each AI agent has a specialized system prompt:

- **Beauty Advisor**: Skin expert, product recommender, treatment advisor
- **Sales Consultant**: Upsell/cross-sell expert, combo builder, objection handler
- **Closing Agent**: Deal closer, urgency creator, value communicator
- **Customer Success**: Post-sale care, satisfaction monitor, retention specialist
- **Marketing Agent**: Content creator, campaign designer, channel optimizer

### RAG Pipeline

1. **Document Ingestion**: PDF/DOCX/XLSX → text extraction → chunking (512 tokens, 50 overlap)
2. **Embedding**: Gemini text-embedding-004 → 768-dim vectors
3. **Storage**: Qdrant with tenant-isolated collections
4. **Retrieval**: Query embedding → top-k similarity search → re-ranking
5. **Generation**: Context + query → Gemini → structured response

## 7. Security Architecture

### Authentication Flow

```
Client → Firebase Auth → JWT Token → API Gateway → Verify Token → Extract tenant_id + role → Route to service
```

### RBAC Matrix

| Permission | Super Admin | Tenant Owner | Manager | Receptionist | Staff | Customer |
|------------|:-----------:|:------------:|:-------:|:------------:|:-----:|:--------:|
| Manage tenants | x | | | | | |
| Manage billing | x | x | | | | |
| Manage staff | x | x | x | | | |
| View dashboard | x | x | x | x | | |
| Manage bookings | x | x | x | x | | |
| Process POS | x | x | x | x | | |
| Manage inventory | x | x | x | | | |
| View own schedule | | | | | x | |
| Book appointment | | | | | | x |
| View own profile | | | | | x | x |

### Data Isolation

- PostgreSQL Row-Level Security (RLS) on all tenant-scoped tables
- Application-level tenant context via JWT claims
- API Gateway enforces tenant routing
- Vector DB collections isolated per tenant
- File storage paths: `/{tenant_id}/...`

## 8. UI/UX Design System

### Spa Owner App - "AI Spa Enterprise"

- **Theme**: Professional, data-rich, dark/light mode
- **Navigation**: Bottom nav (Dashboard, CRM, Booking, POS, More)
- **Dashboard**: Card-based KPI layout, charts, quick actions
- **Color**: Primary #1E3A5F (navy), Accent #E8B931 (gold)

### Customer App - "Beauty AI"

- **Theme**: Luxury, elegant, Apple/Tesla-inspired
- **Navigation**: Bottom nav (Home, AI, Book, Shop, Profile)
- **Home**: Hero banner, trending services, AI assistant entry
- **Color**: Primary #2D1B4E (deep purple), Accent #C9A96E (champagne gold)
- **Typography**: Serif headings (luxury feel), clean sans-serif body

### Super Admin Platform

- **Theme**: Clean dashboard, data-focused
- **Navigation**: Side drawer (Tenants, Revenue, Plans, AI Usage, Settings)
- **Color**: Primary #1A1A2E (dark), Accent #00D9FF (electric blue)

## 9. Deployment Roadmap

### Phase 1: Foundation (Current)
- Backend microservices core setup
- PostgreSQL schema with RLS
- Auth service with Firebase
- API Gateway
- Flutter project structures for all 3 apps

### Phase 2: Core Business Logic
- Booking system
- POS system
- CRM 360
- Inventory management

### Phase 3: AI Layer
- AI Gateway with Gemini integration
- Knowledge base & RAG pipeline
- AI Chat for customers
- AI Sales for owners

### Phase 4: Advanced Features
- Membership & Loyalty
- Marketing automation
- Predictions engine
- Analytics dashboard

### Phase 5: Polish & Scale
- Performance optimization
- Caching strategies
- Monitoring & alerting
- CI/CD pipeline

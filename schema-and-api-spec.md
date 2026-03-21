# Schema & API 技术规格（基于 v3 设计方案）

## 1. Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// 7.1 users
// ============================================================

enum UserStatus {
  invited
  active
  disabled
}

model User {
  id        String     @id @default(uuid()) @db.Uuid
  email     String     @unique
  name      String?
  status    UserStatus @default(invited)
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  discoveryRequests DiscoveryRequest[]
  leadFeedbacks     LeadFeedback[]
  batchFeedbacks    BatchFeedback[]

  @@map("users")
}

// ============================================================
// 7.2 discovery_requests
//
// 状态同步原则：
//   Job.status 是执行状态的 source of truth。
//   DiscoveryRequest.status 是用户视图的反规范化缓存。
//   每次 Job 状态变更时，必须在同一事务中同步更新
//   DiscoveryRequest.status。
//   查询用户任务列表时直接用 DiscoveryRequest.status，
//   避免 join jobs 表。
// ============================================================

model DiscoveryRequest {
  id                String    @id @default(uuid()) @db.Uuid
  userId            String    @map("user_id") @db.Uuid
  productCategory   String    @map("product_category")
  targetRegions     Json      @map("target_regions")   // JSONB string[]，后期可拆为 join table
  buyerTypes        Json      @map("buyer_types")      // JSONB string[]，后期可拆为 join table
  priorityDirection String    @map("priority_direction")
  advancedOptions   Json?     @map("advanced_options")
  status            JobStatus @default(queued)          // 复用 JobStatus 枚举，source of truth 在 Job
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  user           User            @relation(fields: [userId], references: [id])
  jobs           Job[]
  leads          Lead[]
  batchFeedbacks BatchFeedback[]

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@map("discovery_requests")
}

// ============================================================
// 7.3 jobs
// ============================================================

enum JobStatus {
  queued
  claimed
  running
  awaiting_review
  published
  failed
  cancelled
}

enum FailureType {
  execution_error
  quality_rejected
  invalid_input
}

enum ReviewDecision {
  approved
  rejected
}

model Job {
  id                 String          @id @default(uuid()) @db.Uuid
  discoveryRequestId String          @map("discovery_request_id") @db.Uuid
  status             JobStatus       @default(queued)
  claimedAt          DateTime?       @map("claimed_at")
  claimedBy          String?         @map("claimed_by") // 当前存管理员标识字符串，后续引入管理员账户体系再切 user id
  startedAt          DateTime?       @map("started_at")
  reviewReadyAt      DateTime?       @map("review_ready_at")
  publishedAt        DateTime?       @map("published_at")
  reviewDecision     ReviewDecision? @map("review_decision")
  reviewNote         String?         @map("review_note")
  failureType        FailureType?    @map("failure_type")
  errorSummary       String?         @map("error_summary")
  runId              String?         @map("run_id")
  createdAt          DateTime        @default(now()) @map("created_at")
  updatedAt          DateTime        @updatedAt @map("updated_at")

  discoveryRequest DiscoveryRequest  @relation(fields: [discoveryRequestId], references: [id])
  resultSummary    JobResultSummary?

  @@index([discoveryRequestId])
  @@index([status])
  @@index([createdAt])
  @@map("jobs")
}

// ============================================================
// 7.4 job_result_summaries
// ============================================================

enum ResultQuality {
  normal
  low_yield
  empty
}

model JobResultSummary {
  id                String        @id @default(uuid()) @db.Uuid
  jobId             String        @unique @map("job_id") @db.Uuid
  summaryText       String?       @map("summary_text")
  recommendedCount  Int           @default(0) @map("recommended_count")
  observationCount  Int           @default(0) @map("observation_count")
  sourceSummaryText String?       @map("source_summary_text")
  sourceSummaryJson Json?         @map("source_summary_json")
  resultQuality     ResultQuality @default(normal) @map("result_quality")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  job Job @relation(fields: [jobId], references: [id])

  @@map("job_result_summaries")
}

// ============================================================
// 7.5 companies
// ============================================================

model Company {
  id             String   @id @default(uuid()) @db.Uuid
  companyName    String   @map("company_name")
  normalizedName String   @map("normalized_name")
  website        String?
  countryRegion  String?  @map("country_region")
  linkedinUrl    String?  @map("linkedin_url")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  leads Lead[]

  // 不在 Prisma 层声明 @@unique([website])，
  // 因为需要 partial unique index（WHERE website IS NOT NULL）。
  // 真正的唯一约束通过 migration SQL 手动创建，见下方补充 SQL。
  @@index([website])
  @@index([normalizedName, countryRegion])
  @@map("companies")
}

// ============================================================
// 7.6 leads
// ============================================================

enum LeadBuyerType {
  importer
  distributor
  wholesaler
  brand_sourcing
  chain_retail_buyer
  trading_company
  unknown
}

enum LeadSourceType {
  industry_directory
  association
  customs_data
  marketplace
  exhibitor_list
  company_website
  other
}

enum LeadTier {
  recommended
  observation
}

enum RecommendedAction {
  contact_now       // 前端文案：优先联系（仅 recommended 可用）
  contact_if_fit    // 前端文案：建议联系（仅 recommended 可用）
  observe           // 前端文案：继续观察（仅 observation 可用）
  contact_maybe     // 前端文案：视情况联系（仅 observation 可用）
  deprioritize      // 前端文案：暂不优先（仅 observation 可用）
}

enum LeadStatus {
  new
  interested
  dismissed
  contacted
  following
  paused
  no_interest
}

model Lead {
  id                   String            @id @default(uuid()) @db.Uuid
  discoveryRequestId   String            @map("discovery_request_id") @db.Uuid
  companyId            String            @map("company_id") @db.Uuid
  sourceType           LeadSourceType?   @map("source_type")
  sourcePlatform       String?           @map("source_platform")
  sourceUrl            String?           @map("source_url")
  buyerType            LeadBuyerType?    @map("buyer_type")
  currentTier          LeadTier          @map("current_tier")
  recommendationReason String?           @map("recommendation_reason")
  recommendedAction    RecommendedAction? @map("recommended_action")
  status               LeadStatus        @default(new)
  note                 String?
  createdAt            DateTime   @default(now()) @map("created_at")
  updatedAt            DateTime   @updatedAt @map("updated_at")

  discoveryRequest DiscoveryRequest @relation(fields: [discoveryRequestId], references: [id])
  company          Company          @relation(fields: [companyId], references: [id])
  feedbacks        LeadFeedback[]

  @@index([discoveryRequestId])
  @@index([companyId])
  @@index([status])
  @@map("leads")
}

// ============================================================
// 7.7 lead_feedback
// ============================================================

enum FeedbackAction {
  interested
  not_fit
  contacted
}

enum FeedbackReason {
  type_mismatch
  too_small
  duplicate
  info_insufficient
  other
}

// 当前版本每次线索反馈只记录一个主原因（reason 单值）。
// 后续如需多标签原因，可升级 reason 为 Json（string[]）。
model LeadFeedback {
  id        String              @id @default(uuid()) @db.Uuid
  leadId    String              @map("lead_id") @db.Uuid
  userId    String              @map("user_id") @db.Uuid
  action    FeedbackAction
  reason    FeedbackReason?     // 仅 action=not_fit 时填写
  note      String?
  createdAt DateTime            @default(now()) @map("created_at")

  lead Lead @relation(fields: [leadId], references: [id])
  user User @relation(fields: [userId], references: [id])

  @@index([leadId])
  @@index([userId])
  @@map("lead_feedback")
}

// ============================================================
// 7.8 batch_feedback
// ============================================================

enum Helpfulness {
  helpful
  neutral
  not_helpful
}

model BatchFeedback {
  id                 String       @id @default(uuid()) @db.Uuid
  discoveryRequestId String       @map("discovery_request_id") @db.Uuid
  userId             String       @map("user_id") @db.Uuid
  helpfulness        Helpfulness
  note               String?
  createdAt          DateTime     @default(now()) @map("created_at")

  discoveryRequest DiscoveryRequest @relation(fields: [discoveryRequestId], references: [id])
  user             User             @relation(fields: [userId], references: [id])

  @@index([discoveryRequestId])
  @@index([userId])
  @@map("batch_feedback")
}
```

### 补充 SQL（Prisma 不支持的部分唯一索引）

Prisma 不支持 `WHERE` 条件的 partial unique index。Prisma schema 中只声明了普通 `@@index`，
真正的唯一约束通过 migration SQL 手动添加。在 `prisma/migrations/` 中创建自定义 migration：

```sql
-- companies 表：website 去重（仅非空时生效）
-- Prisma schema 中不声明 @@unique([website])，避免与此冲突
CREATE UNIQUE INDEX IF NOT EXISTS "companies_website_unique"
  ON "companies" ("website")
  WHERE "website" IS NOT NULL;

-- companies 表：无 website 时按 normalized_name + country_region 弱去重
CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_region_unique"
  ON "companies" ("normalized_name", "country_region")
  WHERE "website" IS NULL;
```

### 技术债记录

| 项 | 当前方案 | 后续可优化为 |
|----|---------|-------------|
| targetRegions / buyerTypes | JSONB string[] | join table 或 PostgreSQL text[] / enum[] |
| lead_feedback.reason | 单值 enum | Json string[]（多标签原因） |
| claimedBy | 管理员标识字符串 | FK → users（管理员账户体系） |

---

## 2. Zod 校验 Schema

### 2.1 发现任务提交

```typescript
import { z } from "zod";

export const createDiscoveryRequestSchema = z.object({
  productCategory: z
    .string()
    .min(1, "目标品类不能为空")
    .max(100),

  targetRegions: z
    .array(z.string())
    .min(1, "至少选择一个目标地区"),

  buyerTypes: z
    .array(
      z.enum([
        "importer",
        "distributor",
        "wholesaler",
        "brand_sourcing",
        "chain_retail_buyer",
        "trading_company",
      ])
    )
    .min(1, "至少选择一种客户类型"),

  priorityDirection: z.enum([
    "easy_to_close",
    "strong_purchase_signal",
    "oem_odm_fit",
    "long_term_development",
    "distribution_fit",
  ]),

  advancedOptions: z
    .object({
      exclusionRules: z.array(z.string()).optional(),
      supplyNotes: z.string().max(500).optional(),
      extraNotes: z.string().max(300).optional(),
    })
    .optional(),
});

export type CreateDiscoveryRequestInput = z.infer<typeof createDiscoveryRequestSchema>;
```

### 2.2 线索级反馈

```typescript
export const leadFeedbackSchema = z.object({
  action: z.enum(["interested", "not_fit", "contacted"]),

  reason: z
    .enum(["type_mismatch", "too_small", "duplicate", "info_insufficient", "other"])
    .optional()
    .describe("仅 action=not_fit 时填写，当前版本单值，后续可升级为数组"),

  note: z.string().max(500).optional(),
});

export type LeadFeedbackInput = z.infer<typeof leadFeedbackSchema>;
```

### 2.3 线索状态更新（第二层维护）

```typescript
export const leadStatusUpdateSchema = z.object({
  status: z.enum(["following", "paused", "no_interest"]),
  note: z.string().max(500).optional(),
});

export type LeadStatusUpdateInput = z.infer<typeof leadStatusUpdateSchema>;
```

### 2.4 批次级反馈

```typescript
export const batchFeedbackSchema = z.object({
  helpfulness: z.enum(["helpful", "neutral", "not_helpful"]),
  note: z.string().max(500).optional(),
});

export type BatchFeedbackInput = z.infer<typeof batchFeedbackSchema>;
```

### 2.5 管理员：结果回传（review-ready）

```typescript
const leadPayloadSchema = z.object({
  company_name: z.string().min(1),
  website: z.string().url().optional().nullable(),
  country_region: z.string().min(1),
  buyer_type: z.enum([
    "importer", "distributor", "wholesaler",
    "brand_sourcing", "chain_retail_buyer", "trading_company", "unknown",
  ]),
  source_type: z.enum([
    "industry_directory", "association", "customs_data",
    "marketplace", "exhibitor_list", "company_website", "other",
  ]),
  source_url: z.string().url().optional().nullable(),
  source_platform: z.string().optional().nullable(),
  recommendation_reason: z.string().min(1),
  recommended_action: z
    .enum(["contact_now", "contact_if_fit", "observe", "contact_maybe", "deprioritize"])
    .optional()
    .nullable(),
  current_tier: z.enum(["recommended", "observation"]),
  linkedin_url: z.string().url().optional().nullable(),
});

export const reviewReadyPayloadSchema = z.object({
  run_info: z.object({
    run_id: z.string().min(1),
    summary_text: z.string().optional(),
  }),

  batch_summary: z.object({
    recommended_count: z.number().int().min(0),
    observation_count: z.number().int().min(0),
    source_summary: z.string().optional(),
    source_breakdown: z
      .array(
        z.object({
          type: z.string(),
          count: z.number().int().min(0),
        })
      )
      .optional(),
  }),

  leads: z.array(leadPayloadSchema),
});

export type ReviewReadyPayload = z.infer<typeof reviewReadyPayloadSchema>;
```

### 2.6 管理员：拒绝发布

```typescript
export const rejectPayloadSchema = z.object({
  failureType: z.enum(["execution_error", "quality_rejected", "invalid_input"]),
  reviewNote: z.string().max(1000).optional(),
});
```

### 2.7 管理员：标记执行失败

```typescript
export const failPayloadSchema = z.object({
  failureType: z.enum(["execution_error", "quality_rejected", "invalid_input"]),
  errorSummary: z.string().max(2000).optional(),
});
```

---

## 3. API 详细规格

### 通用约定

- 基础路径：`/api`
- 用户侧认证：NextAuth session（httpOnly cookie）
- 管理员侧认证：`Authorization: Bearer <ADMIN_API_KEY>` 或管理员 session
- 响应格式：JSON
- 错误响应统一结构：

```typescript
interface ApiError {
  error: string;    // 机器可读错误码
  message: string;  // 人类可读描述
}
```

- 通用 HTTP 状态码：

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 状态冲突（如重复提交、非法状态转换） |

---

### 3.1 POST /api/discovery-requests

创建发现任务。

**认证：** 用户 session

**Request Body：**

```json
{
  "productCategory": "宠物用品",
  "targetRegions": ["US", "EU"],
  "buyerTypes": ["distributor", "brand_sourcing"],
  "priorityDirection": "strong_purchase_signal",
  "advancedOptions": {
    "exclusionRules": ["no_retail", "no_chinese_peers"],
    "supplyNotes": "支持 OEM/ODM，MOQ 500pcs",
    "extraNotes": ""
  }
}
```

**防抖规则：** 同一用户 30 秒内相同参数提交，返回已有任务（200），不创建新任务。

**Response 201：**

```json
{
  "id": "uuid",
  "status": "queued",
  "productCategory": "宠物用品",
  "targetRegions": ["US", "EU"],
  "buyerTypes": ["distributor", "brand_sourcing"],
  "priorityDirection": "strong_purchase_signal",
  "createdAt": "2026-03-13T10:00:00Z"
}
```

**Response 409（已有处理中任务时的弱提示）：**

```json
{
  "id": "uuid",
  "status": "queued",
  "createdAt": "2026-03-13T10:00:00Z",
  "hint": "当前有任务处理中，新任务会排队等待"
}
```

---

### 3.2 GET /api/discovery-requests

获取当前用户的任务列表。

**认证：** 用户 session

**Query Params：**

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 分页页码，默认 1 |
| limit | number | 每页数量，默认 20 |

**Response 200：**

```json
{
  "data": [
    {
      "id": "uuid",
      "productCategory": "宠物用品",
      "targetRegions": ["US", "EU"],
      "status": "published",
      "leadCount": 23,
      "createdAt": "2026-03-13T10:00:00Z",
      "updatedAt": "2026-03-13T14:30:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

`leadCount` 仅在 status=published 时返回实际值，其他状态返回 null。

---

### 3.3 GET /api/discovery-requests/:id

获取单个任务详情。

**认证：** 用户 session（只能查看自己的任务）

**Response 200：**

```json
{
  "id": "uuid",
  "productCategory": "宠物用品",
  "targetRegions": ["US", "EU"],
  "buyerTypes": ["distributor", "brand_sourcing"],
  "priorityDirection": "strong_purchase_signal",
  "advancedOptions": { "exclusionRules": ["no_retail"] },
  "status": "published",
  "statusText": "结果已可查看",
  "resultSummary": {
    "summaryText": "本轮围绕宠物用品品类...",
    "recommendedCount": 15,
    "observationCount": 8,
    "sourceSummaryText": "行业目录 12 条，协会 6 条，海关数据 5 条",
    "resultQuality": "normal"
  },
  "createdAt": "2026-03-13T10:00:00Z",
  "updatedAt": "2026-03-13T14:30:00Z"
}
```

**published 前后的字段可见性规则（同样适用于列表接口 3.2）：**

| 字段 | published 前 | published 后 |
|------|-------------|-------------|
| resultSummary | null | 完整对象 |
| leadCount | null | 实际数量 |
| statusText | 对应状态文案 | "结果已可查看" |

`statusText` 由后端根据 status 映射返回：

| status | statusText |
|--------|-----------|
| queued | 等待处理 |
| claimed | 任务已接收，准备开始 |
| running | 正在整理目标客户 |
| awaiting_review | 结果已生成，正在准备发布 |
| published | 结果已可查看 |
| failed | 本轮处理未完成 |
| cancelled | 任务已取消 |

---

### 3.4 GET /api/discovery-requests/:id/leads

获取该任务下的线索列表。

**认证：** 用户 session

**前置条件：** 任务 status 必须为 published，否则返回 403。

**Query Params：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 可选，按 lead.status 筛选 |
| page | number | 默认 1 |
| limit | number | 默认 50 |

**Response 200：**

```json
{
  "data": [
    {
      "id": "lead-uuid",
      "company": {
        "id": "company-uuid",
        "companyName": "PetSupply Co.",
        "website": "petsupply.com",
        "countryRegion": "US",
        "linkedinUrl": "https://linkedin.com/company/petsupplyco"
      },
      "sourceType": "industry_directory",
      "sourcePlatform": "Kompass",
      "sourceUrl": "https://example.com/listing/123",
      "buyerType": "distributor",
      "currentTier": "recommended",
      "recommendationReason": "主营宠物用品分销，年采购规模中等",
      "recommendedAction": "建议优先联系",
      "status": "new",
      "note": null,
      "previouslyDiscovered": true,
      "previousDiscoveries": [
        {
          "requestId": "prev-request-uuid",
          "createdAt": "2026-02-20T08:00:00Z",
          "leadStatus": "interested"
        }
      ],
      "createdAt": "2026-03-13T14:30:00Z"
    }
  ],
  "total": 23,
  "page": 1,
  "limit": 50
}
```

`previouslyDiscovered` 和 `previousDiscoveries`：当该 lead 的 company_id 在其他 discovery_request 下有 lead 记录时为 true，并返回最近 1~3 条历史。

---

### 3.5 POST /api/leads/:id/feedback

提交线索级反馈。

**认证：** 用户 session

**前置条件：** 对应任务的 status 必须为 published。

**Request Body：**

```json
{
  "action": "not_fit",
  "reason": "type_mismatch",
  "note": "看起来更像零售商"
}
```

**副作用：** 自动更新 lead.status（映射：interested→interested, not_fit→dismissed, contacted→contacted）。

**Response 201：**

```json
{
  "id": "feedback-uuid",
  "leadId": "lead-uuid",
  "action": "not_fit",
  "leadStatus": "dismissed",
  "createdAt": "2026-03-13T15:00:00Z"
}
```

---

### 3.6 PATCH /api/leads/:id/status

更新线索维护状态（第二层推进）。

**认证：** 用户 session

**前置条件：**
- 对应任务的 status 必须为 published
- lead.status 必须为 contacted（只有已联系后才能推进到第二层）

**Request Body：**

```json
{
  "status": "following",
  "note": "已发送报价单，等待对方反馈"
}
```

合法 status 值：`following` / `paused` / `no_interest`

**Response 200：**

```json
{
  "id": "lead-uuid",
  "status": "following",
  "note": "已发送报价单，等待对方反馈",
  "updatedAt": "2026-03-13T16:00:00Z"
}
```

**Response 409（状态不允许推进）：**

```json
{
  "error": "invalid_status_transition",
  "message": "线索需要先标记为「已联系」才能推进维护状态"
}
```

---

### 3.7 POST /api/discovery-requests/:id/feedback

提交批次级反馈。

**认证：** 用户 session

**前置条件：** 任务 status 必须为 published。

**Request Body：**

```json
{
  "helpfulness": "helpful",
  "note": "这批分销商方向整体不错"
}
```

**Response 201：**

```json
{
  "id": "feedback-uuid",
  "discoveryRequestId": "request-uuid",
  "helpfulness": "helpful",
  "createdAt": "2026-03-13T16:30:00Z"
}
```

---

### 3.8 GET /api/admin/jobs?status=queued

查看待处理任务列表。

**认证：** ADMIN_API_KEY

**Query Params：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 必填，按 job.status 筛选 |

**Response 200：**

```json
{
  "data": [
    {
      "id": "job-uuid",
      "discoveryRequestId": "request-uuid",
      "status": "queued",
      "request": {
        "productCategory": "宠物用品",
        "targetRegions": ["US", "EU"],
        "buyerTypes": ["distributor", "brand_sourcing"],
        "priorityDirection": "strong_purchase_signal",
        "advancedOptions": { "exclusionRules": ["no_retail"] },
        "userId": "user-uuid",
        "userName": "张三"
      },
      "createdAt": "2026-03-13T10:00:00Z"
    }
  ]
}
```

---

### 3.9 GET /api/admin/jobs/:id/payload

拉取任务详情，用于本地执行。

**认证：** ADMIN_API_KEY

**Response 200：**

```json
{
  "jobId": "job-uuid",
  "requestId": "request-uuid",
  "status": "claimed",
  "request": {
    "productCategory": "宠物用品",
    "targetRegions": ["US", "EU"],
    "buyerTypes": ["distributor", "brand_sourcing"],
    "priorityDirection": "strong_purchase_signal",
    "advancedOptions": {
      "exclusionRules": ["no_retail", "no_chinese_peers"],
      "supplyNotes": "支持 OEM/ODM，MOQ 500pcs",
      "extraNotes": ""
    }
  },
  "user": {
    "id": "user-uuid",
    "name": "张三",
    "email": "zhangsan@example.com"
  }
}
```

---

### 3.10 GET /api/admin/jobs/:id/review

查看待审核任务的完整详情（结果摘要 + leads 预览）。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = awaiting_review（其他状态也可调用，但 resultSummary 和 leads 仅 awaiting_review/published 后有值）

**Response 200：**

```json
{
  "job": {
    "id": "job-uuid",
    "status": "awaiting_review",
    "runId": "run_20260313_abc",
    "claimedBy": "admin",
    "startedAt": "2026-03-13T11:05:00Z",
    "reviewReadyAt": "2026-03-13T13:00:00Z"
  },
  "request": {
    "id": "request-uuid",
    "productCategory": "宠物用品",
    "targetRegions": ["US", "EU"],
    "buyerTypes": ["distributor", "brand_sourcing"],
    "priorityDirection": "strong_purchase_signal",
    "advancedOptions": { "exclusionRules": ["no_retail"] }
  },
  "user": {
    "id": "user-uuid",
    "name": "张三",
    "email": "zhangsan@example.com"
  },
  "resultSummary": {
    "summaryText": "本轮围绕宠物用品品类...",
    "recommendedCount": 15,
    "observationCount": 8,
    "sourceSummaryText": "行业目录 12 条，协会 6 条，海关数据 5 条",
    "sourceSummaryJson": [
      {"type": "industry_directory", "count": 12},
      {"type": "association", "count": 6}
    ],
    "resultQuality": "normal"
  },
  "leadsPreview": [
    {
      "id": "lead-uuid",
      "companyName": "PetSupply Co.",
      "website": "petsupply.com",
      "countryRegion": "US",
      "buyerType": "distributor",
      "currentTier": "recommended",
      "recommendationReason": "主营宠物用品分销...",
      "recommendedAction": "contact_now"
    }
  ],
  "stats": {
    "totalLeads": 23,
    "companiesCreated": 18,
    "companiesReused": 5
  }
}
```

---

### 3.11 POST /api/admin/jobs/:id/claim

领取任务。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = queued

**Request Body：**

```json
{
  "claimedBy": "admin"
}
```

**副作用：**
- job.status → claimed
- job.claimed_at → now()
- job.claimed_by → request body
- discovery_request.status → claimed

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "claimed",
  "claimedAt": "2026-03-13T11:00:00Z",
  "claimedBy": "admin"
}
```

---

### 3.12 POST /api/admin/jobs/:id/start

标记开始执行。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = claimed

**副作用：**
- job.status → running
- job.started_at → now()
- discovery_request.status → running

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "running",
  "startedAt": "2026-03-13T11:05:00Z"
}
```

---

### 3.13 POST /api/admin/jobs/:id/review-ready

执行完成，回传结果。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = running

**Request Body：** 见第 2.5 节 `reviewReadyPayloadSchema`

**副作用：**
1. 对每条 lead，按 company 去重规则查找或创建 companies 记录
2. 创建 leads 记录（status=new），关联到 company_id 和 discovery_request_id
3. 创建 job_result_summaries 记录，计算 result_quality
4. job.status → awaiting_review
5. job.review_ready_at → now()
6. job.run_id → run_info.run_id
7. discovery_request.status → awaiting_review
8. **leads 此时对用户不可见**

**Company 去重处理逻辑（在事务中执行）：**

```
对于每条 lead payload:
  1. 如果有 website:
     - 规范化 website（去协议、去www、去尾斜杠、小写）
     - 按 website 查找已有 company
     - 找到 → 复用 company_id
     - 未找到 → 创建新 company
  2. 如果没有 website:
     - 计算 normalized_name（小写、trim、去后缀、去标点、压空格）
     - 按 normalized_name + country_region 查找
     - 找到 → 复用 company_id
     - 未找到 → 创建新 company
  3. 创建 lead 记录，关联 company_id
```

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "awaiting_review",
  "reviewReadyAt": "2026-03-13T13:00:00Z",
  "resultSummary": {
    "recommendedCount": 15,
    "observationCount": 8,
    "resultQuality": "normal"
  },
  "leadsCreated": 23,
  "companiesCreated": 18,
  "companiesReused": 5
}
```

---

### 3.14 POST /api/admin/jobs/:id/publish

确认发布。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = awaiting_review

**副作用：**
- job.status → published
- job.published_at → now()
- job.review_decision → approved
- discovery_request.status → published
- **leads 对用户可见**

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "published",
  "publishedAt": "2026-03-13T14:30:00Z"
}
```

---

### 3.15 POST /api/admin/jobs/:id/reject

拒绝发布。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = awaiting_review

**Request Body：**

```json
{
  "failureType": "quality_rejected",
  "reviewNote": "结果中有较多不相关公司，需要调整搜索策略后重新执行"
}
```

**副作用：**
- job.status → failed
- job.review_decision → rejected
- job.failure_type → request body
- job.review_note → request body
- discovery_request.status → failed
- 已创建的 leads 保留在数据库中但对用户不可见

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "failed",
  "failureType": "quality_rejected",
  "reviewNote": "结果中有较多不相关公司..."
}
```

---

### 3.16 POST /api/admin/jobs/:id/fail

标记执行失败。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = running

**Request Body：**

```json
{
  "failureType": "execution_error",
  "errorSummary": "workflow_controller 在 extraction 阶段超时退出"
}
```

**副作用：**
- job.status → failed
- job.failure_type → request body
- job.error_summary → request body
- discovery_request.status → failed

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "failed",
  "failureType": "execution_error"
}
```

---

### 3.17 POST /api/admin/jobs/:id/cancel

取消任务。

**认证：** ADMIN_API_KEY

**前置条件：** job.status = queued 或 claimed

**副作用：**
- job.status → cancelled
- discovery_request.status → cancelled

**Response 200：**

```json
{
  "id": "job-uuid",
  "status": "cancelled"
}
```

---

## 4. 状态转换约束总表

### 4.1 job.status 合法转换

```
queued ──────→ claimed ──────→ running ──────→ awaiting_review ──────→ published
  │                │              │                    │
  ├→ cancelled     ├→ cancelled   ├→ failed            ├→ failed (rejected)
```

| 当前状态 | 合法操作 | 目标状态 |
|----------|---------|----------|
| queued | claim | claimed |
| queued | cancel | cancelled |
| claimed | start | running |
| claimed | cancel | cancelled |
| running | review-ready | awaiting_review |
| running | fail | failed |
| awaiting_review | publish | published |
| awaiting_review | reject | failed |
| published | — | 终态 |
| failed | — | 终态（需新建 job 重试） |
| cancelled | — | 终态 |

### 4.2 lead.status 合法转换

```
new ──→ interested
    ──→ dismissed
    ──→ contacted ──→ following
                  ──→ paused
                  ──→ no_interest
```

| 当前状态 | 合法目标 | 触发方式 |
|----------|---------|----------|
| new | interested / dismissed / contacted | feedback.action 自动映射 |
| interested | contacted / dismissed | feedback.action 自动映射 |
| contacted | following / paused / no_interest | PATCH 手动推进 |
| dismissed | interested / contacted | feedback.action（用户改主意） |
| following | paused / no_interest | PATCH 手动推进 |
| paused | following / no_interest | PATCH 手动推进 |

### 4.3 current_tier × recommended_action 约束

| current_tier | 允许的 RecommendedAction 枚举值 | 前端文案 |
|-------------|-------------------------------|---------|
| recommended | contact_now | 优先联系 |
| recommended | contact_if_fit | 建议联系 |
| observation | observe | 继续观察 |
| observation | contact_maybe | 视情况联系 |
| observation | deprioritize | 暂不优先 |

**禁止组合：** observation + contact_now，observation + contact_if_fit

校验应在 review-ready API 写入 leads 时执行。

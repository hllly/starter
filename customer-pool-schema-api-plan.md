# 客户池扩展设计：Schema / API / 低保真 / 实施计划

## 1. 文档目的

这份文档是在 `customer-pool-design-v1.md` 基础上继续往下走一步，回答 3 个问题：

1. 客户池要怎么扩展当前 schema 和 API
2. 前端页面第一版应该长什么样
3. 应该按什么阶段实施、每阶段怎么验收

当前约束不变：

- 现有系统仍然以 `DiscoveryRequest -> Lead -> Company` 为主链路
- `workflow` 仍然运行在 `/Users/hll/.openclaw/workspace`
- "构建深度画像"走人工领取 / 本地执行 / 回写结果
- 第一版优先低风险落地，不追求一次做成完整 CRM

---

## 2. 总体设计原则

### 2.1 产品原则

客户池不是新建一套完全独立的数据世界，而是：

- 以 `company` 为核心实体
- 汇总历史 `lead`
- 接入 `workflow` 的 `company_master.tsv` 和 `company_profile.tsv`
- 为后续维护 / 跟进 / 深追提供统一入口

### 2.2 技术原则

第一版采用"投影层"思路：

- `companies` 保留为基础公司实体
- 新增 `customer_pool_items` 作为客户池查询投影
- 新增 `company_profiles` 作为深度画像详情表
- 新增 `company_profile_requests` 作为画像构建任务表

原因：

- 避免把 `workflow` 的 TSV 直接硬塞进 `companies`
- 避免线索表和客户池表互相污染
- 方便前端列表查询和后续扩展

---

## 3. Schema 扩展设计

## 3.1 现有表变更

保留现有主链路表，但需要对 `companies` 做一处扩展：

- `users` — 不变（新增反向 relation）
- `discovery_requests` — 不变
- `jobs` — 不变
- `job_result_summaries` — 不变
- `companies` — **新增 `rootDomain` 字段**（见下方说明）
- `leads` — 不变
- `lead_feedback` — 不变
- `batch_feedback` — 不变

### `companies` 新增 `rootDomain`

当前 `companies.website` 存储的是原始 URL（可能带 `www.`、路径等），而 workflow 全部以 `root_domain`（规范化裸域名）作为主键。为了让 Web 与 workflow 有稳定的匹配锚点，需要在 `companies` 上新增：

```prisma
model Company {
  // ...existing fields...
  rootDomain     String?  @map("root_domain")

  // 新增反向 relation（支持客户池 + 画像）
  poolItems        CustomerPoolItem[]
  profile          CompanyProfile?
  profileRequests  CompanyProfileRequest[]

  @@index([rootDomain])
  // ...existing indexes...
}
```

`rootDomain` 在创建公司时从 `website` 规范化生成（去 `www.`、去路径、lowercase）。已有数据通过 backfill 脚本补全。

规范化规则：

1. 去协议头 (`https://`, `http://`)
2. 去 `www.` 前缀
3. 去路径和查询参数
4. lowercase
5. 去尾部 `/`

示例：`https://www.phillipspet.com/about` → `phillipspet.com`

### `users` 新增反向 relation

```prisma
model User {
  // ...existing fields...
  poolItems        CustomerPoolItem[]
  profileRequests  CompanyProfileRequest[]
}
```

## 3.2 建议新增枚举

```prisma
enum PoolStatus {
  active
  watching
  following
  archived
  excluded
}

enum MatchLevel {
  high
  medium
  low
  unknown
}

enum ProfileStatus {
  not_started
  partial
  complete
  failed
}

enum ProfileQuality {
  high
  medium
  low
  unknown
}

enum ProfileRequestStatus {
  queued
  claimed
  running
  completed
  failed
  cancelled
}
```

说明：

- `PoolStatus` 是客户池里的"当前经营状态"
- `MatchLevel` 是面向前端的统一判断标签（系统自动计算，见下方规则）
- `ProfileStatus` 只描述"画像数据本身的完整度"（not_started / partial / complete / failed），**不**包含 queued / running 等流转状态
- `ProfileRequestStatus` 描述"画像构建请求的流转状态"（queued / claimed / running / completed / failed / cancelled），对齐现有 admin job 模式
- 两者职责分离：`ProfileStatus` 回答"画像数据有没有"；`ProfileRequestStatus` 回答"请求处理到哪一步了"
- `ProfileQuality` 对齐 workflow 的画像质量评估

### `matchLevel` 计算规则

`matchLevel` 不由用户填写，由系统根据以下规则自动计算：

| matchLevel | 条件 |
|---|---|
| `high` | `buyerFit == "high"` 或 `poolScore >= 80` |
| `medium` | `buyerFit == "medium"` 或 `poolScore >= 50` |
| `low` | `buyerFit == "low"` 或 `poolScore < 50` |
| `unknown` | 没有 buyerFit 且没有 poolScore |

优先级：`buyerFit > poolScore`。即如果有 `buyerFit` 字段（来自 workflow profile），以它为准；否则 fallback 到 `poolScore`（来自 `company_master.tsv` 的 `total_score`）。

计算时机：
- 客户池条目创建/更新时
- 深度画像回写时
- workflow 历史数据导入时

建议实现为一个纯函数 `computeMatchLevel(buyerFit, poolScore)` 供所有写入点复用。

## 3.3 新增 `customer_pool_items`

这是客户池首页列表的查询主表。

```prisma
model CustomerPoolItem {
  id                   String         @id @default(uuid()) @db.Uuid
  userId               String         @map("user_id") @db.Uuid
  companyId            String         @map("company_id") @db.Uuid

  poolStatus           PoolStatus     @default(active) @map("pool_status")
  matchLevel           MatchLevel     @default(unknown) @map("match_level")
  poolScore            Int?           @map("pool_score")

  rootDomain           String?        @map("root_domain")
  companyRole          String?        @map("company_role")
  businessModel        String?        @map("business_model")
  buyerFit             String?        @map("buyer_fit")
  buyerFitReason       String?        @map("buyer_fit_reason")

  productCategoriesSummary String?    @map("product_categories_summary")
  targetMarketsSummary     String?    @map("target_markets_summary")

  firstSeenAt          DateTime?      @map("first_seen_at")
  lastSeenAt           DateTime?      @map("last_seen_at")
  appearCount          Int            @default(0) @map("appear_count")
  sourceCount          Int            @default(0) @map("source_count")

  latestLeadId         String?        @map("latest_lead_id") @db.Uuid
  latestRequestId      String?        @map("latest_request_id") @db.Uuid
  latestLeadStatus     String?        @map("latest_lead_status")

  profileStatus        ProfileStatus  @default(not_started) @map("profile_status")
  profileQuality       ProfileQuality @default(unknown) @map("profile_quality")
  profileLastUpdatedAt DateTime?      @map("profile_last_updated_at")

  topContactEmail      String?        @map("top_contact_email")
  topContactPhone      String?        @map("top_contact_phone")

  note                 String?
  createdAt            DateTime       @default(now()) @map("created_at")
  updatedAt            DateTime       @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@unique([userId, companyId])
  @@index([userId, poolStatus])
  @@index([userId, matchLevel])
  @@index([userId, profileStatus])
  @@index([lastSeenAt])
  @@map("customer_pool_items")
}
```

### 为什么需要它

因为客户池列表想展示的是"聚合后结果"，例如：

- 累计出现次数
- 最近一次出现时间
- 当前池内状态
- 最新画像状态
- 顶部联系方式

这些都不适合每次前端列表查询时临时从 `leads + companies + workflow 导入表` 拼出来。

### `userId` 归属规则

当前版本为**单租户模式**。拍板如下：

1. **从 lead 发布同步时**：`userId` = 该 `discoveryRequest` 的创建者（`discovery_requests.userId`）。
2. **从 workflow 历史导入时**：`userId` 统一指定为一个固定的 seed user（导入脚本接收 `--user-id` 参数）。当前只有一位种子用户，直接传入该用户 id 即可。
3. **唯一约束 `[userId, companyId]`** 保证同一用户对同一公司只有一条池记录。

后续如果发展为多用户，有两条演进路径（第一版不做，只预留空间）：

- **共享池**：去掉 `userId`，改为全局公司资产，各用户通过独立的"关注/状态"表维护个人视图。
- **按用户隔离池**：保持当前结构，每位用户看到的池内容由各自的 lead 历史决定。

当前选择方案 2（按用户隔离），因为与现有 `discoveryRequest -> lead` 的用户隔离逻辑一致，实现最简单。

## 3.4 新增 `company_profiles`

这是每家公司的最新深度画像详情。

```prisma
model CompanyProfile {
  id                    String         @id @default(uuid()) @db.Uuid
  companyId             String         @unique @map("company_id") @db.Uuid

  rootDomain            String?        @map("root_domain")
  profileStatus         ProfileStatus  @default(not_started) @map("profile_status")
  profileQuality        ProfileQuality @default(unknown) @map("profile_quality")
  profileRunId          String?        @map("profile_run_id")
  profileVersion        Int?           @map("profile_version")
  profileFirstBuiltAt   DateTime?      @map("profile_first_built_at")
  profileLastUpdatedAt  DateTime?      @map("profile_last_updated_at")

  emailBest             String?        @map("email_best")
  emailAlt              String?        @map("email_alt")
  phoneBest             String?        @map("phone_best")
  phoneAlt              String?        @map("phone_alt")
  contactPageUrl        String?        @map("contact_page_url")
  contactFormUrl        String?        @map("contact_form_url")
  linkedinCompanyUrl    String?        @map("linkedin_company_url")

  country               String?
  stateRegion           String?        @map("state_region")
  city                  String?
  addressRaw            String?        @map("address_raw")
  foundedYear           String?        @map("founded_year")

  businessModel         String?        @map("business_model")
  companyRole           String?        @map("company_role")
  buyerFit              String?        @map("buyer_fit")
  buyerFitReason        String?        @map("buyer_fit_reason")

  productCategories     String?        @map("product_categories")
  coreProducts          String?        @map("core_products")
  targetMarkets         String?        @map("target_markets")
  industryFocus         String?        @map("industry_focus")

  importSignal          String?        @map("import_signal")
  oemOdmSignal          String?        @map("oem_odm_signal")
  privateLabelSignal    String?        @map("private_label_signal")
  vendorOnboardingSignal String?       @map("vendor_onboarding_signal")
  moqSampleSignal       String?        @map("moq_sample_signal")
  procurementSignalNotes String?       @map("procurement_signal_notes")

  employeeRange         String?        @map("employee_range")
  revenueRange          String?        @map("revenue_range")
  facilitySignal        String?        @map("facility_signal")
  certifications        String?

  evidenceUrls          Json?          @map("evidence_urls")
  evidenceNotes         String?        @map("evidence_notes")
  pagesVisitedCount     Int?           @map("pages_visited_count")

  rawProfileJson        Json?          @map("raw_profile_json")
  createdAt             DateTime       @default(now()) @map("created_at")
  updatedAt             DateTime       @updatedAt @map("updated_at")

  company Company @relation(fields: [companyId], references: [id])

  @@index([profileStatus])
  @@index([profileQuality])
  @@map("company_profiles")
}
```

### 为什么不是把这些字段直接加到 `companies`

因为 `companies` 当前职责是"基础实体 + 去重锚点"。

如果把 profile 的 30+ 字段都塞进去，会导致：

- `companies` 角色混乱
- 未来 profile 重建 / 版本管理困难
- 工作流同步逻辑越来越脆

### 关于画像版本管理

当前设计为单版本覆盖模式：每次画像更新直接覆盖 `company_profiles` 当前行，`profileVersion` 自增，旧数据保存在 `rawProfileJson` 中。

如后续需要查看历史版本对比（例如"上次 buyer_fit 是 medium，这次变成了 high"），可新增 `company_profile_snapshots` 表，但 **第一版不做**。

## 3.5 新增 `company_profile_requests`

承接前端点击"构建深度画像"后的请求。

```prisma
model CompanyProfileRequest {
  id                String               @id @default(uuid()) @db.Uuid
  companyId         String               @map("company_id") @db.Uuid
  requestedBy       String               @map("requested_by") @db.Uuid

  status            ProfileRequestStatus @default(queued)
  claimedBy         String?              @map("claimed_by")
  requestedAt       DateTime             @default(now()) @map("requested_at")
  claimedAt         DateTime?            @map("claimed_at")
  startedAt         DateTime?            @map("started_at")
  finishedAt        DateTime?            @map("finished_at")

  runId             String?              @map("run_id")
  errorSummary      String?              @map("error_summary")
  resultSummary     String?              @map("result_summary")

  company   Company @relation(fields: [companyId], references: [id])
  requester User    @relation(fields: [requestedBy], references: [id])

  @@index([companyId, status])
  @@index([status, requestedAt])
  @@map("company_profile_requests")
}
```

### 作用

- 让"构建深度画像"成为明确可跟踪事件
- 与当前 `jobs` 的手工执行模式保持一致
- 支持后续后台列表 / CLI / 失败重试

## 3.6 投影同步规则

`customer_pool_items` 是投影表，不是主数据表。它的数据来源于多个触发点，需要明确定义每个触发点的同步行为。

### 核心原则：幂等重算，不做增量自加

所有投影字段的更新，**一律从源数据重新聚合**，而不是做 `+= 1` 之类的增量操作。这样可以保证：

- 重试发布不会导致 `appearCount` 翻倍
- 重复执行脚本不会产生脏数据
- 任何时候都可以通过 `recalc` 命令恢复到正确状态

具体来说，所有聚合字段的计算方式为：

```
appearCount   = COUNT(published leads WHERE companyId = X AND userId = Y)
firstSeenAt   = MIN(lead.createdAt)  WHERE companyId = X AND userId = Y AND status = published
lastSeenAt    = MAX(lead.createdAt)  WHERE companyId = X AND userId = Y AND status = published
sourceCount   = COUNT(DISTINCT lead.sourceType) WHERE companyId = X AND userId = Y
latestLeadId  = lead.id WHERE companyId = X AND userId = Y ORDER BY createdAt DESC LIMIT 1
latestRequestId = lead.discoveryRequestId  (来自 latestLead)
latestLeadStatus = lead.status  (来自 latestLead)
```

这组查询封装为一个函数 `recomputePoolItemFromLeads(userId, companyId)`，所有触发点复用。

### 触发点 1：Lead 发布（publish）

当 `review-ready -> publish` 完成后：

1. 找到本次产生的所有 `lead.companyId`
2. 对每个 `companyId` + `userId` 组合：
   - upsert `customer_pool_items`
   - 调用 `recomputePoolItemFromLeads(userId, companyId)` 重算全部聚合字段
   - 同步 `rootDomain` = company.rootDomain
   - 重算 `matchLevel` = computeMatchLevel(buyerFit, poolScore)

### 触发点 2：用户更新 Lead 状态（feedback）

当用户在线索页点击"感兴趣 / 已联系 / 不合适"时：

1. 找到该 lead 对应的 `companyId` + `userId`
2. 调用 `recomputePoolItemFromLeads(userId, companyId)` 重算聚合字段
   - 这会自动更新 `latestLeadStatus`（因为重算取最新 lead 的 status）

### 触发点 3：深度画像完成（profile complete）

当 `company_profiles` 更新后：

同步更新 `customer_pool_items`：

- `profileStatus`
- `profileQuality`
- `profileLastUpdatedAt`
- `topContactEmail` = profile.emailBest
- `topContactPhone` = profile.phoneBest
- `companyRole`
- `businessModel`
- `buyerFit`
- `buyerFitReason`
- `productCategoriesSummary` = profile.productCategories
- `matchLevel` = computeMatchLevel(buyerFit, poolScore)

这些是"覆盖写"，天然幂等，不涉及聚合计算。

### 触发点 4：workflow 历史导入

当运行 `import-workflow-company-master` 脚本时：

- upsert `customer_pool_items`（`userId` 由脚本 `--user-id` 参数指定）
- 覆盖写 `poolScore` / `sourceCount`（来自 TSV 的 `total_score` / `source_count`）
- 覆盖写 `firstSeenAt` / `lastSeenAt`（来自 TSV 的 `first_seen_at` / `last_seen_at`）
- 如果该 company 已有 leads，调用 `recomputePoolItemFromLeads` 合并（取 leads 和 TSV 中更早的 firstSeenAt、更晚的 lastSeenAt、更大的 appearCount）
- 重算 `matchLevel`

### 补救机制：全量重算命令

提供 `scripts/recalc-pool-items.ts`，可在投影数据与源数据出现漂移时手动触发全量重算：

1. 遍历所有 `customer_pool_items`
2. 对每条记录调用 `recomputePoolItemFromLeads(userId, companyId)`
3. 若有 `company_profiles`，覆盖写 profile 相关字段
4. 重算 `matchLevel`

该脚本可安全重复执行，结果始终收敛到源数据的真实状态。

这样客户池首页无需 join 太重的 profile 表即可完成列表渲染。

---

## 4. API 扩展设计

## 4.1 用户侧 API

### `GET /api/customer-pool`

用途：

- 客户池列表页查询

查询参数建议：

- `tab=all|high_match|needs_profile|profiled|follow_up|excluded`
- `keyword=...`
- `page=1`
- `limit=20`
- `sort=recent|score|profile_updated`

返回示例：

```json
{
  "data": [
    {
      "id": "pool_item_id",
      "company": {
        "id": "company_id",
        "companyName": "Phillips Pet Food & Supplies",
        "website": "phillipspet.com",
        "countryRegion": "US",
        "linkedinUrl": null,
        "rootDomain": "phillipspet.com"
      },
      "poolStatus": "active",
      "matchLevel": "high",
      "poolScore": 88,
      "companyRole": "distributor",
      "businessModel": "B2B",
      "buyerFit": "high",
      "buyerFitReason": "全国分销网络，服务B2B客户，适合中国供应商合作",
      "productCategoriesSummary": "pet food;pet supplies;pet specialty products",
      "firstSeenAt": "2026-03-09T01:00:00Z",
      "lastSeenAt": "2026-03-14T06:51:52Z",
      "appearCount": 4,
      "sourceCount": 2,
      "latestLeadStatus": "interested",
      "profileStatus": "complete",
      "profileQuality": "high",
      "profileLastUpdatedAt": "2026-03-14T06:51:52Z",
      "topContactEmail": "orders@phillipspet.com",
      "topContactPhone": "1-800-451-2817"
    }
  ],
  "stats": {
    "total": 132,
    "highMatch": 38,
    "profiled": 24,
    "needsProfile": 91
  },
  "page": 1,
  "limit": 20
}
```

### `GET /api/customer-pool/:id`

用途：

- 客户池详情抽屉 / 详情页

返回内容：

- `customer_pool_item`
- `company_profile`
- 最近 5 条历史线索
- 最近 5 次 profile request

### `GET /api/customer-pool/:id/leads`

用途：

- 查看该客户在哪些 discovery request 中出现过

返回内容：

- request 信息
- 命中时间
- 当时的 lead status
- source / reason / recommendedAction

### `POST /api/customer-pool/:id/build-profile`

用途：

- 用户点击"构建深度画像"

行为：

- 若已有 `queued/running/claimed` 请求，则直接返回现有请求
- 否则创建新的 `company_profile_requests`

返回示例：

```json
{
  "id": "profile_request_id",
  "status": "queued",
  "hint": "深度画像任务已加入处理队列"
}
```

### `PATCH /api/customer-pool/:id/status`

用途：

- 用户调整客户池状态

请求：

```json
{
  "poolStatus": "following",
  "note": "已转入重点维护"
}
```

## 4.2 管理员侧 API

### `GET /api/admin/company-profile-requests?status=queued`

- 查询待处理画像请求

### `POST /api/admin/company-profile-requests/:id/claim`

- 领取画像任务

### `GET /api/admin/company-profile-requests/:id/payload`

- 返回执行所需 payload
- 至少包括：
  - company id
  - companyName
  - website
  - rootDomain（来自 `companies.rootDomain`）
  - countryRegion

### `POST /api/admin/company-profile-requests/:id/start`

- 标记开始执行

### `POST /api/admin/company-profile-requests/:id/complete`

- 回传解析后的 profile 数据
- 同时 upsert `company_profiles`
- 同时更新 `customer_pool_items`（触发点 3）
- `profileVersion` 自增

### `POST /api/admin/company-profile-requests/:id/fail`

- 记录失败原因
- 更新 `company_profiles.profileStatus = failed`（如果已有 profile 行）
- 同步更新 `customer_pool_items.profileStatus`

## 4.3 Zod 校验建议

### `buildProfileRequestSchema`

```ts
export const buildProfileRequestSchema = z.object({
  forceRefresh: z.boolean().optional(),
});
```

### `poolStatusUpdateSchema`

```ts
export const poolStatusUpdateSchema = z.object({
  poolStatus: z.enum(["active", "watching", "following", "archived", "excluded"]),
  note: z.string().max(500).optional(),
});
```

### `companyProfileCompleteSchema`

直接围绕 `workflow/company_profile.tsv` 的稳定字段构建。

建议第一版要求：

- contact 字段（email_best, phone_best）
- buyer_fit
- company_role
- business_model
- profile_status（只接受 `complete` / `partial`）
- profile_quality
- product_categories
- evidence_urls

其余字段可选。

---

## 5. 与 workflow 的接口约定

## 5.1 推荐的后台执行命令

基于现有能力，后台执行单公司画像建议直接用：

```bash
python3 /Users/hll/.openclaw/workspace/workflow/company_workflow_controller.py profile "<identifier>"
```

其中 `<identifier>` 优先级建议：

1. `company.rootDomain`（最稳定，与 workflow 一致）
2. `company.website`
3. `company.companyName`（兜底）

## 5.2 Web -> workflow 的最小 payload

管理员 payload 建议至少包含：

```json
{
  "companyId": "uuid",
  "companyName": "Phillips Pet Food & Supplies",
  "website": "https://www.phillipspet.com/",
  "rootDomain": "phillipspet.com",
  "countryRegion": "US"
}
```

## 5.3 workflow -> Web 的推荐回传结构

虽然当前可以从 `company_profile.tsv` 再解析，但更推荐后台统一转换成 API payload：

```json
{
  "run_info": {
    "run_id": "20260314_profile_phillipspet",
    "summary_text": "已完成深度画像构建"
  },
  "profile": {
    "root_domain": "phillipspet.com",
    "profile_status": "complete",
    "profile_quality": "high",
    "email_best": "orders@phillipspet.com",
    "phone_best": "1-800-451-2817",
    "contact_page_url": "https://www.phillipspet.com/support/contact-us/",
    "country": "US",
    "company_role": "distributor",
    "business_model": "B2B",
    "buyer_fit": "high",
    "buyer_fit_reason": "全国分销网络，服务B2B客户",
    "product_categories": "pet food;pet supplies;pet specialty products",
    "import_signal": "unclear",
    "oem_odm_signal": "no",
    "private_label_signal": "no",
    "evidence_urls": [
      "https://www.phillipspet.com/",
      "https://www.phillipspet.com/about-phillips/"
    ],
    "evidence_notes": "首页与 About 页面可确认分销商定位"
  }
}
```

这样 Web 端不需要直接吃 TSV。

---

## 6. 前端页面低保真结构

## 6.1 导航层级

新增导航项：

- `客户发现`
- `已发掘客户线索`
- `客户池`

## 6.2 客户池首页

### 页面骨架

```text
+--------------------------------------------------------------+
| 客户池                                                        |
| 沉淀历史客户资产，并持续补全深度画像                           |
+--------------------------------------------------------------+

+-------------+-------------+-------------+--------------------+
| 池内客户     | 高匹配       | 已完成画像   | 待深挖              |
| 132         | 38          | 24          | 91                 |
+-------------+-------------+-------------+--------------------+

+--------------------------------------------------------------+
| 全部 | 高匹配 | 待深挖 | 已完成画像 | 需跟进 | 已排除           |
+--------------------------------------------------------------+

/ 当前语境容器：暖灰 / 浅绿 / 浅蓝底色随 tab 切换 /

+==============================================================+
| [高匹配] [分销商] phillipspet.com            完整画像 高质量  |
| Phillips Pet Food & Supplies                  最近更新 3/14   |
| US | pet food / pet supplies                                |
|--------------------------------------------------------------|
| 联系方式   | 公司画像         | 采购/合作信号 | 产品与市场      |
| orders@... | B2B / distributor| buyer_fit高   | pet food ...   |
| 1-800...   | 成立年份 /规模   | import/oem... | target markets |
| LinkedIn   |                  |               |                |
|--------------------------------------------------------------|
| 当前状态: active   历史出现 4 次   来源 2 个平台             |
| [构建深度画像] [查看历史线索] [加入维护]                      |
+==============================================================+
```

### 视觉原则

完全沿用当前线索页：

- 白底独立卡
- 左侧状态条
- 一级判断区 / 二级字段块 / 底部操作区
- 高匹配标签做强提醒色
- tab 下方整体场景底色

### 卡片字段优先级

一级：

- 匹配等级
- 客户角色
- 域名
- 公司名

二级：

- 联系方式
- buyer_fit / import / OEM / private_label
- business_model / company_role
- product_categories / target_markets

三级：

- 首次出现 / 最近出现 / 出现次数
- 最近命中任务
- 最近画像更新时间

## 6.3 客户详情抽屉

第一版建议不要直接做新页面，先做右侧抽屉。

### 抽屉结构

```text
+--------------------------------------------------+
| Phillips Pet Food & Supplies                     |
| phillipspet.com                                  |
| [高匹配] [分销商] [完整画像]                      |
|--------------------------------------------------|
| 一、画像摘要                                     |
| buyer_fit: high                                  |
| buyer_fit_reason: ...                            |
|--------------------------------------------------|
| 二、联系方式                                     |
| email / phone / contact page / LinkedIn          |
|--------------------------------------------------|
| 三、产品与市场                                   |
| product_categories / core_products / target...   |
|--------------------------------------------------|
| 四、采购信号                                     |
| import / oem_odm / private_label / onboarding    |
|--------------------------------------------------|
| 五、证据                                         |
| evidence_urls / evidence_notes                   |
|--------------------------------------------------|
| 六、历史线索时间线                               |
| 2026-03-14 / request A / interested              |
| 2026-03-09 / request B / new                     |
+--------------------------------------------------+
```

## 6.4 深度画像按钮交互

按钮状态建议：

- `构建深度画像`（profileStatus == not_started）
- `更新深度画像`（profileStatus == complete/partial）
- `画像构建中...`（有 queued/claimed/running 的 request）
- `构建失败，重新发起`（profileStatus == failed 且无进行中 request）

点击后反馈：

- 按钮变 loading
- toast: `深度画像任务已加入处理队列`
- 按钮文案变为 `画像构建中...`

---

## 7. 具体实施分阶段计划

## P0. 方案定稿

### 目标

- 锁定客户池的核心边界
- 确认"客户池页"和"已发掘客户线索页"的分工

### 任务

- 定稿本文件
- 明确 `customer_pool_items / company_profiles / company_profile_requests`
- 明确 workflow 打通方式采用"人工领取 + 本地执行 + 回写"

### 验收

- 文档定稿
- 不再对核心表结构反复摇摆

## P1. Schema + 历史数据导入

### 目标

- 数据库具备客户池和画像请求的落点
- **已有数据（leads + workflow 历史）能进入客户池**

### 任务

1. `companies` 表新增 `rootDomain` 字段
2. Prisma 增加新枚举
3. 新增 3 张表（`customer_pool_items` / `company_profiles` / `company_profile_requests`）
4. 新增 `User` 和 `Company` 的反向 relation
5. 实现 `recomputePoolItemFromLeads(userId, companyId)` 幂等聚合函数
6. 写 backfill 脚本 A：从已发布 `leads` 同步 `customer_pool_items`
   - `userId` 来自 `discoveryRequest.userId`
   - 调用 `recomputePoolItemFromLeads` 聚合
7. 写 backfill 脚本 B：从 `company_master.tsv` 导入 workflow 历史资产
   - 接收 `--user-id <uuid>` 参数，指定池记录归属的种子用户
   - 以 `root_domain` 匹配 `companies.rootDomain`
   - 新公司直接创建 `companies` + `customer_pool_items`
   - 覆盖写 `poolScore` / `firstSeenAt` / `lastSeenAt` / `sourceCount`
   - 计算 `matchLevel`
8. 提供全量重算命令 `scripts/recalc-pool-items.ts`

### 交付物

- Prisma schema 更新
- migration
- `lib/pool-sync.ts`（含 `recomputePoolItemFromLeads` + `computeMatchLevel`）
- `scripts/backfill-customer-pool.ts`（从 leads 回填）
- `scripts/import-workflow-company-master.ts`（从 workflow TSV 导入，接收 `--user-id`）
- `scripts/recalc-pool-items.ts`（全量重算投影）

### 验收标准

- 本地 migration 成功
- 已有 leads 能回填出客户池数据
- workflow 历史 company_master.tsv 能导入客户池
- **幂等性验证**：连续执行两次 backfill-customer-pool + import-workflow-company-master，`appearCount` / `firstSeenAt` / `lastSeenAt` 等聚合字段值不变
- **全量重算验证**：执行 recalc-pool-items 后，所有记录与源数据一致
- `matchLevel` 正确计算

### 为什么把 workflow 历史导入提前到 P1

原方案中 workflow 历史导入排在 P4（页面之后），这会导致 P2 做出来的客户池页面几乎是空的——因为仅靠 Web 内已有的少量 leads 数据量太少。将历史导入提前到 P1，可以确保 P2 客户池页面一上线就有足够的数据可展示，用户体验更好。

## P2. 客户池只读版页面

### 目标

- 用户能看到历史客户池列表

### 前置条件

- P1 完成，`customer_pool_items` 中已有足够数据

### 任务

1. 新增导航 `客户池`
2. 新增 `GET /api/customer-pool`
3. 新建页面：
   - 顶部概览卡
   - tab 语境切换
   - 客户池卡片列表
4. 新增 `GET /api/customer-pool/:id/leads`
5. 新增详情抽屉

### 交付物

- `web/src/app/(dashboard)/customer-pool/page.tsx`
- `customer-pool-list.tsx`
- `customer-pool-card.tsx`
- `customer-pool-drawer.tsx`

### 验收标准

- 可以浏览客户池列表
- 卡片样式与线索页同语法
- 能看到至少：
  - 公司基础信息
  - 历史出现次数
  - 最近命中
  - 画像状态
  - matchLevel 标签
- 数据量充足（workflow 历史 + leads 历史）

## P3. 深度画像请求链路

### 目标

- "构建深度画像"按钮真的可用

### 任务

1. 新增 `POST /api/customer-pool/:id/build-profile`
2. 新增管理员侧 profile request API
3. 扩展 admin-cli：
   - list profile requests
   - claim/start/complete/fail
4. 后台执行 workflow `profile`
5. 将结果解析并写入 `company_profiles`
6. 同步更新 `customer_pool_items`（触发点 3）

### 交付物

- API 路由
- admin CLI 扩展
- profile 回写逻辑

### 验收标准

- 任意客户可发起画像请求
- 管理员可领取并本地执行
- profile 成功后页面状态刷新
- 联系方式 / buyer_fit / role / product_categories 能显示出来
- `matchLevel` 在 profile 回写后正确更新

## P4. 画像详情强化版

### 目标

- 将客户池从"列表页"提升为"可查证、可运营"的客户资产页

### 任务

1. 详情抽屉增强：
   - evidence
   - certifications
   - procurement notes
2. 增加"加入维护 / 跟进状态"
3. 预留"全网动向追踪 / 深度画像构建"入口

### 验收标准

- 用户能在详情中理解画像依据
- 用户能将高价值客户转入维护

---

## 8. workflow 协同改进清单

第一版可以先接，但建议尽快协同改进这些点。

## 8.1 建议输出 JSON 版本 profile

当前 TSV 可用，但 Web 更适合吃 JSON。

建议新增：

- `company_profile.json`
- `company_master_summary.json`

## 8.2 建议固定枚举词表

例如：

- `profile_status`
- `profile_quality`
- `buyer_fit`
- `company_role`
- `business_model`

否则后续 Web 映射会不断补丁式处理。

## 8.3 建议输出更适合列表页的摘要层

新增：

- `profile_summary.json`

字段建议：

- root_domain
- company_name
- buyer_fit
- profile_status
- profile_quality
- top_contact
- top_signal_summary
- profile_last_updated_at

## 8.4 建议失败原因结构化

建议 profile 失败时输出：

- `failure_reason`
- `failure_detail`

推荐枚举：

- `site_unreachable`
- `anti_bot_blocked`
- `insufficient_content`
- `ambiguous_company`
- `parse_failed`

这样前端和后台都能更清晰处理。

---

## 9. 推荐下一步

如果要继续推进，建议顺序是：

1. P1: `Prisma schema + 历史数据导入`（让池子里先有数据）
2. P2: `客户池只读版页面`（用户可以看到沉淀的客户资产）
3. P3: `深度画像请求链路`（"构建深度画像"按钮可用）
4. P4: `画像详情强化版`（可查证、可运营）

原因：

- 先有数据，页面才不空
- 先有池，用户才知道"沉淀了什么"
- 再加深挖，用户才能理解"为什么值得点这个按钮"

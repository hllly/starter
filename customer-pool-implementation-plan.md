# 客户池实施计划（基于 customer-pool-schema-api-plan.md 定稿版）

## 总览

共 4 个实施阶段（P0 方案定稿已完成），每阶段有明确的子任务、交付物和验收标准。
阶段之间有依赖关系，必须按序执行。

```
P1 Schema + 核心函数 + 历史数据导入
 ↓
P2 客户池只读版页面（前端 + API）
 ↓
P3 深度画像请求链路（用户发起 → 管理员执行 → 回写）
 ↓
P4 画像详情强化 + 运营能力
```

### 前置条件

- 现有主链路（P0~P3）已全部完成并可用
- 数据库可连接（Neon）
- 管理员 CLI（`admin-cli/`）已可用
- 至少有 1 条 published lead 和 1 位 seed user

---

## P1：Schema + 核心函数 + 历史数据导入

### 目标

数据库扩展完成，核心投影同步函数可用，已有数据（leads + workflow 历史）全部进入客户池。

### P1.1 Prisma Schema 扩展

| # | 任务 | 说明 |
|---|------|------|
| 1.1.1 | `Company` 新增 `rootDomain` 字段 | `String? @map("root_domain")`，加 `@@index([rootDomain])` |
| 1.1.2 | `Company` 新增 3 条反向 relation | `poolItems CustomerPoolItem[]`、`profile CompanyProfile?`、`profileRequests CompanyProfileRequest[]` |
| 1.1.3 | `User` 新增 2 条反向 relation | `poolItems CustomerPoolItem[]`、`profileRequests CompanyProfileRequest[]` |
| 1.1.4 | 新增 5 个 enum | `PoolStatus`、`MatchLevel`、`ProfileStatus`（4 值，不含 queued/running）、`ProfileQuality`、`ProfileRequestStatus` |
| 1.1.5 | 新增 `CustomerPoolItem` 模型 | 按设计文档 §3.3，含 `@@unique([userId, companyId])` |
| 1.1.6 | 新增 `CompanyProfile` 模型 | 按设计文档 §3.4，`companyId @unique` |
| 1.1.7 | 新增 `CompanyProfileRequest` 模型 | 按设计文档 §3.5 |
| 1.1.8 | 执行 migration | `npx prisma db push` 或 `npx prisma migrate dev --name add-customer-pool` |

**验收标准：**

- [ ] migration 成功，无报错
- [ ] `npx prisma studio` 能看到 3 张新表 + 5 个新 enum
- [ ] `Company` 表有 `root_domain` 列
- [ ] `CustomerPoolItem` 的 `(user_id, company_id)` 唯一约束生效（插入重复组合报错）

### P1.2 工具函数实现

| # | 任务 | 说明 |
|---|------|------|
| 1.2.1 | 实现 `extractRootDomain(url)` | 去协议头 → 去 `www.` → 去路径 → lowercase → 去尾 `/`。示例：`https://www.phillipspet.com/about` → `phillipspet.com` |
| 1.2.2 | 实现 `computeMatchLevel(buyerFit, poolScore)` | buyerFit 优先，poolScore fallback。返回 `high/medium/low/unknown` |
| 1.2.3 | 实现 `recomputePoolItemFromLeads(userId, companyId)` | 从 `leads` 表按源数据重新聚合全部字段（见设计文档 §3.6 核心原则） |
| 1.2.4 | 实现 `syncProfileToPoolItem(companyId)` | 从 `company_profiles` 覆盖写 profile 相关字段到 `customer_pool_items` |

交付文件：`web/src/lib/pool-sync.ts`

**验收标准：**

- [ ] `extractRootDomain` 单元测试：覆盖 `https://www.foo.com/bar`、`http://foo.com`、`foo.com`、空值、`null`
- [ ] `computeMatchLevel` 单元测试：
  - `("high", null)` → `high`
  - `(null, 85)` → `high`
  - `("medium", 90)` → `medium`（buyerFit 优先）
  - `(null, null)` → `unknown`
  - `(null, 30)` → `low`
- [ ] `recomputePoolItemFromLeads` 手动验证：插入 3 条 lead（同 companyId），调用后 `appearCount=3`、`firstSeenAt` = 最早那条、`latestLeadId` = 最新那条
- [ ] 对同一条记录连续调用两次 `recomputePoolItemFromLeads`，结果完全一致（幂等）

### P1.3 已有数据回填 rootDomain

| # | 任务 | 说明 |
|---|------|------|
| 1.3.1 | 回填 `companies.rootDomain` | 遍历所有 `companies`，用 `extractRootDomain(website)` 生成并写入 |

交付文件：`web/scripts/backfill-root-domain.ts`

**验收标准：**

- [ ] 有 website 的 company 全部生成了 rootDomain
- [ ] 无 website 的 company，rootDomain 为 null
- [ ] 重复执行脚本，结果不变

### P1.4 从已有 Leads 回填客户池

| # | 任务 | 说明 |
|---|------|------|
| 1.4.1 | 脚本读取所有 published leads | join `discoveryRequest` 获取 `userId` |
| 1.4.2 | 对每个 `(userId, companyId)` 组合 upsert `CustomerPoolItem` | 调用 `recomputePoolItemFromLeads` |
| 1.4.3 | 同步 `rootDomain` | 从 `company.rootDomain` 写入 |
| 1.4.4 | 计算 `matchLevel` | 调用 `computeMatchLevel`（此阶段 buyerFit 为空，poolScore 也为空，应为 `unknown`） |

交付文件：`web/scripts/backfill-customer-pool.ts`

**验收标准：**

- [ ] 每个有 published lead 的 `(userId, companyId)` 组合产生一条 `CustomerPoolItem`
- [ ] `appearCount` = 该用户名下该公司的 published lead 数
- [ ] `firstSeenAt` = 最早 lead 的 `createdAt`
- [ ] `lastSeenAt` = 最新 lead 的 `createdAt`
- [ ] `latestLeadId` / `latestRequestId` / `latestLeadStatus` 正确指向最新 lead
- [ ] 连续执行两次，所有聚合字段不变（幂等验证）

### P1.5 从 workflow 历史导入

| # | 任务 | 说明 |
|---|------|------|
| 1.5.1 | 解析 `company_master.tsv` | 读取 `/Users/hll/.openclaw/workspace/company_master.tsv` |
| 1.5.2 | 按 `root_domain` 匹配 `companies` | 匹配到则更新 `rootDomain`；未匹配到则创建新 `Company`（`companyName` + `rootDomain`，website 由 rootDomain 推导） |
| 1.5.3 | upsert `CustomerPoolItem` | `userId` 由 `--user-id <uuid>` 参数指定 |
| 1.5.4 | 覆盖写 workflow 特有字段 | `poolScore`（来自 `total_score`）、`sourceCount`（来自 `source_count`） |
| 1.5.5 | 合并时间字段 | `firstSeenAt` = min(TSV, leads)、`lastSeenAt` = max(TSV, leads)。如该公司已有 leads，调用 `recomputePoolItemFromLeads` 合并 |
| 1.5.6 | 计算 `matchLevel` | 此时有 `poolScore`，可算出 `high/medium/low` |

交付文件：`web/scripts/import-workflow-company-master.ts`

**验收标准：**

- [ ] 脚本接收 `--user-id <uuid>` 参数，缺失时报错退出
- [ ] TSV 中新公司在 `companies` 和 `customer_pool_items` 中各创建一条记录
- [ ] TSV 中已存在公司（通过 rootDomain 匹配）不重复创建 company
- [ ] `poolScore` 正确写入
- [ ] 已有 leads 的公司，`appearCount` = leads 数量（不受 TSV 影响），`firstSeenAt` 取两者更早的
- [ ] 连续执行两次，所有字段值不变（幂等验证）
- [ ] `matchLevel` 按 poolScore 正确计算（如 `poolScore=85` → `high`）

### P1.6 全量重算命令

| # | 任务 | 说明 |
|---|------|------|
| 1.6.1 | 遍历所有 `CustomerPoolItem` | 逐条重算 |
| 1.6.2 | 调用 `recomputePoolItemFromLeads` | 重算 lead 聚合字段 |
| 1.6.3 | 若有 `CompanyProfile`，调用 `syncProfileToPoolItem` | 覆盖写 profile 相关字段 |
| 1.6.4 | 重算 `matchLevel` | 调用 `computeMatchLevel` |

交付文件：`web/scripts/recalc-pool-items.ts`

**验收标准：**

- [ ] 执行后所有 `CustomerPoolItem` 与 leads / profiles 源数据一致
- [ ] 连续执行两次，结果不变
- [ ] 执行时间在可接受范围内（< 100 条记录应 < 10s）

### P1.7 现有 Publish 链路集成

| # | 任务 | 说明 |
|---|------|------|
| 1.7.1 | 在 `POST /api/admin/jobs/:id/publish` 中新增同步逻辑 | publish 成功后，对本次所有 lead 的 `(userId, companyId)` 调用 `recomputePoolItemFromLeads` + upsert `CustomerPoolItem` |
| 1.7.2 | 在 `POST /api/leads/:id/feedback` 中新增同步逻辑 | feedback 成功后，对该 lead 的 `(userId, companyId)` 调用 `recomputePoolItemFromLeads` 更新 `latestLeadStatus` |

**验收标准：**

- [ ] 新 publish 一批 leads 后，`customer_pool_items` 自动出现/更新对应记录
- [ ] 用户在线索页点"感兴趣"后，对应 `CustomerPoolItem.latestLeadStatus` 自动变为 `interested`
- [ ] 原有线索页功能不受影响（回归测试）

### P1 整体验收检查清单

- [ ] 3 张新表 + 5 个 enum 全部在数据库中
- [ ] `companies.root_domain` 字段已存在且已有数据回填
- [ ] `customer_pool_items` 中有来自 leads 的记录
- [ ] `customer_pool_items` 中有来自 workflow TSV 的记录
- [ ] 幂等验证：三个脚本各连续执行两次，数据不变
- [ ] publish 和 feedback 链路自动同步客户池
- [ ] `matchLevel` 在所有入口正确计算

### P1 交付物汇总

```
web/prisma/schema.prisma         (扩展)
web/src/lib/pool-sync.ts         (新增)
web/scripts/backfill-root-domain.ts    (新增)
web/scripts/backfill-customer-pool.ts  (新增)
web/scripts/import-workflow-company-master.ts  (新增)
web/scripts/recalc-pool-items.ts       (新增)
web/src/app/api/admin/jobs/[id]/publish/route.ts  (修改)
web/src/app/api/leads/[id]/feedback/route.ts      (修改)
```

---

## P2：客户池只读版页面

### 目标

用户能看到历史客户池列表，能按 tab 筛选，能打开详情抽屉查看历史线索。

### 前置条件

- P1 全部完成，`customer_pool_items` 中已有充足数据

### P2.1 客户池列表 API

| # | 任务 | 说明 |
|---|------|------|
| 2.1.1 | `GET /api/customer-pool` | 查询当前用户的 `CustomerPoolItem`，join `Company` 基础信息 |
| 2.1.2 | tab 筛选实现 | `all` / `high_match`（matchLevel=high）/ `needs_profile`（profileStatus=not_started）/ `profiled`（profileStatus=complete\|partial）/ `follow_up`（poolStatus=following）/ `excluded`（poolStatus=excluded） |
| 2.1.3 | 排序实现 | `recent`（lastSeenAt DESC）/ `score`（poolScore DESC）/ `profile_updated`（profileLastUpdatedAt DESC） |
| 2.1.4 | keyword 搜索 | 模糊匹配 `company.companyName` 或 `company.rootDomain` |
| 2.1.5 | stats 统计 | 在同一查询中返回 `total` / `highMatch` / `profiled` / `needsProfile` 计数 |
| 2.1.6 | 分页 | `page` + `limit`，默认 `limit=20` |

**验收标准：**

- [ ] 未登录访问返回 401
- [ ] 返回 JSON 结构与设计文档 §4.1 一致
- [ ] tab=high_match 只返回 matchLevel=high 的记录
- [ ] tab=needs_profile 只返回 profileStatus=not_started 的记录
- [ ] keyword 搜索能匹配公司名和域名
- [ ] stats 数字与实际数据一致
- [ ] 分页正确（第 2 页不与第 1 页重复）

### P2.2 客户池历史线索 API

| # | 任务 | 说明 |
|---|------|------|
| 2.2.1 | `GET /api/customer-pool/:id/leads` | 通过 `poolItemId` 找到 `companyId`，查询该公司所有 published leads，join `discoveryRequest` |
| 2.2.2 | 返回字段 | request 品类/地区、lead 创建时间、lead status、source_type、recommendation_reason、recommended_action |

**验收标准：**

- [ ] 返回该公司的所有历史线索，按时间倒序
- [ ] 每条包含来源任务的品类和地区
- [ ] 非本用户的 pool item 返回 403

### P2.3 客户池详情 API

| # | 任务 | 说明 |
|---|------|------|
| 2.3.1 | `GET /api/customer-pool/:id` | 返回 `CustomerPoolItem` + `CompanyProfile`（如有）+ 最近 5 条 leads + 最近 5 条 profile requests |

**验收标准：**

- [ ] 有 profile 时返回完整画像数据
- [ ] 无 profile 时 `companyProfile` 为 null
- [ ] 历史线索和 profile requests 按时间倒序

### P2.4 导航 + 页面骨架

| # | 任务 | 说明 |
|---|------|------|
| 2.4.1 | `nav-shell.tsx` 新增"客户池"导航项 | 与"已发掘客户线索"同层级，图标用 `Database` 或 `Archive` |
| 2.4.2 | 新建页面 `web/src/app/(dashboard)/customer-pool/page.tsx` | 页面标题 + 副标题 + 概览卡 + tab + 列表 |
| 2.4.3 | 页面标题区 | "客户池" + "沉淀历史客户资产，并持续补全深度画像" |

### P2.5 概览统计卡

| # | 任务 | 说明 |
|---|------|------|
| 2.5.1 | 4 张概览卡 | 池内客户 / 高匹配 / 已完成画像 / 待深挖 |
| 2.5.2 | 样式对齐线索页 | 96px 高、20px 圆角、白底、`#E7E3DA` 边框、32px 数字、15px 标签 |
| 2.5.3 | 高匹配 / 待深挖强调色 | 数字用 `#0F7A5A` |

### P2.6 Tab 切换 + 场景背景

| # | 任务 | 说明 |
|---|------|------|
| 2.6.1 | 6 个 Tab | 全部 / 高匹配 / 待深挖 / 已完成画像 / 需跟进 / 已排除 |
| 2.6.2 | Tab 样式 | 药丸形按钮，48px 高、999px 圆角、16px 字号、600 字重 |
| 2.6.3 | 场景背景色 | 全部: `#F7F6F2`、高匹配: `#F3F8F7`、待深挖: `#FEF8F3`、已完成画像: `#EEF8F4`、需跟进: `#F1F5FA`、已排除: `#F6F3F0` |
| 2.6.4 | 列表容器样式 | `24px` 圆角、`24px 24px 32px` padding、场景背景色 |

### P2.7 客户池卡片

| # | 任务 | 说明 |
|---|------|------|
| 2.7.1 | 新建 `customer-pool-card.tsx` | 三层结构，沿用线索页设计语言 |
| 2.7.2 | 左侧状态条 | 6px 宽，颜色按 `poolStatus` 映射 |
| 2.7.3 | 一级判断区（第一层） | 左：`[matchLevel标签]` `[companyRole标签]` + 公司名(28px/700) + rootDomain(22px/600, 链接色) + 地区 |
| 2.7.4 | 一级判断区右侧 | 画像状态标签（完整画像/部分画像/未构建）+ 画像质量标签 |
| 2.7.5 | 二级字段块（第二层） | 4 列：联系方式 / 公司画像 / 采购与合作信号 / 产品与市场 |
| 2.7.6 | 字段块样式 | `#F7F5F0` 背景、`16px` 圆角、内容 `18px/600` |
| 2.7.7 | 底部操作区（第三层） | 左：当前状态 + 历史出现次数 + 来源数。右：[构建深度画像] [查看历史线索] |
| 2.7.8 | matchLevel 标签颜色 | `high`: 红底(`#FDE8E8`/`#C0392B`)、`medium`: 橙底(`#FEF0E6`/`#D35400`)、`low`/`unknown`: 灰底 |

### P2.8 客户池列表组件

| # | 任务 | 说明 |
|---|------|------|
| 2.8.1 | 新建 `customer-pool-list.tsx` | 封装 API 调用 + 概览卡 + tab + 卡片列表 |
| 2.8.2 | 排序逻辑 | 默认按 matchLevel 优先（high > medium > low > unknown），二级按 lastSeenAt 倒序 |
| 2.8.3 | 空状态 | "还没有客户数据，完成一次客户发现任务后会自动沉淀到这里" |
| 2.8.4 | 加载态 | Skeleton 占位 |

### P2.9 详情抽屉

| # | 任务 | 说明 |
|---|------|------|
| 2.9.1 | 新建 `customer-pool-drawer.tsx` | 右侧抽屉，shadcn `Sheet` 组件 |
| 2.9.2 | 抽屉头部 | 公司名 + rootDomain + [matchLevel] [companyRole] [profileStatus] 标签 |
| 2.9.3 | 画像摘要区 | buyer_fit + reason（如有 profile） |
| 2.9.4 | 联系方式区 | email / phone / contact page / LinkedIn |
| 2.9.5 | 产品与市场区 | product_categories / core_products / target_markets |
| 2.9.6 | 采购信号区 | import / oem_odm / private_label / vendor_onboarding |
| 2.9.7 | 历史线索时间线 | 调 `GET /api/customer-pool/:id/leads`，按时间倒序展示 |
| 2.9.8 | 无 profile 提示 | "暂未构建深度画像" + [构建深度画像] 按钮（P3 才真正可用，P2 先显示 ComingSoon tooltip） |

### P2 整体验收检查清单

- [ ] 导航"客户池"可点击并进入页面
- [ ] 概览卡数字与数据库实际数据一致
- [ ] 6 个 tab 切换正确筛选
- [ ] tab 切换时背景色变化
- [ ] 卡片样式与线索页设计语言一致
- [ ] matchLevel 标签颜色显眼（high 红色、medium 橙色）
- [ ] 点击卡片打开详情抽屉
- [ ] 抽屉中有 profile 的公司能看到画像摘要 + 联系方式 + 信号
- [ ] 抽屉中历史线索时间线正确
- [ ] 无数据时空状态提示友好
- [ ] keyword 搜索能按公司名/域名过滤
- [ ] 页面加载时有 skeleton 占位

### P2 交付物汇总

```
web/src/app/api/customer-pool/route.ts                  (新增)
web/src/app/api/customer-pool/[id]/route.ts              (新增)
web/src/app/api/customer-pool/[id]/leads/route.ts        (新增)
web/src/app/(dashboard)/customer-pool/page.tsx           (新增)
web/src/components/customer-pool/customer-pool-list.tsx   (新增)
web/src/components/customer-pool/customer-pool-card.tsx   (新增)
web/src/components/customer-pool/customer-pool-drawer.tsx (新增)
web/src/components/nav-shell.tsx                         (修改)
```

---

## P3：深度画像请求链路

### 目标

"构建深度画像"按钮真的可用：用户点击 → 创建请求 → 管理员领取并本地执行 workflow profile → 结果回写 → 页面状态刷新。

### 前置条件

- P2 全部完成
- workflow 的 `company_workflow_controller.py profile` 命令可在本地执行

### P3.1 用户侧 API

| # | 任务 | 说明 |
|---|------|------|
| 3.1.1 | `POST /api/customer-pool/:id/build-profile` | 校验用户身份 → 查找 poolItem → 检查是否有进行中请求（queued/claimed/running）→ 有则返回现有请求，无则创建新 `CompanyProfileRequest` |
| 3.1.2 | `PATCH /api/customer-pool/:id/status` | 校验 + 更新 `CustomerPoolItem.poolStatus` + `note` |
| 3.1.3 | Zod 校验 | `buildProfileRequestSchema` + `poolStatusUpdateSchema` |

**验收标准：**

- [ ] 首次点击"构建深度画像"，创建 `CompanyProfileRequest`（status=queued），返回 201
- [ ] 重复点击（已有 queued 请求），返回 200 + 现有请求，不重复创建
- [ ] 请求 completed 后再点击，创建新请求（更新画像）
- [ ] 更新 poolStatus 成功，note 正确写入
- [ ] 非本用户的 pool item 返回 403

### P3.2 管理员侧 API

| # | 任务 | 说明 |
|---|------|------|
| 3.2.1 | `GET /api/admin/company-profile-requests?status=queued` | 列出待处理画像请求，含 company 基础信息 |
| 3.2.2 | `POST /api/admin/company-profile-requests/:id/claim` | queued → claimed，写 `claimedAt` / `claimedBy` |
| 3.2.3 | `GET /api/admin/company-profile-requests/:id/payload` | 返回 companyId / companyName / website / rootDomain / countryRegion |
| 3.2.4 | `POST /api/admin/company-profile-requests/:id/start` | claimed → running，写 `startedAt` |
| 3.2.5 | `POST /api/admin/company-profile-requests/:id/complete` | running → completed，写 `finishedAt` / `runId` / `resultSummary`。**核心逻辑**：upsert `CompanyProfile`（profileVersion 自增）→ 调用 `syncProfileToPoolItem` → 重算 `matchLevel` |
| 3.2.6 | `POST /api/admin/company-profile-requests/:id/fail` | running → failed，写 `errorSummary`。若已有 `CompanyProfile` 行则更新 `profileStatus=failed`。同步更新 `CustomerPoolItem.profileStatus` |
| 3.2.7 | Zod 校验 | `companyProfileCompleteSchema`：`profile_status`（只接受 complete/partial）、`profile_quality`、`buyer_fit`、`company_role`、`business_model`、`email_best`、`phone_best`、`product_categories`、`evidence_urls` 为建议字段，其余可选 |
| 3.2.8 | 状态流转保护 | 非法转换返回 409（如 queued 直接 start、completed 再 complete） |

**验收标准：**

- [ ] 完整状态流转可跑通：queued → claim → start → complete
- [ ] complete 后 `company_profiles` 有对应记录，字段正确
- [ ] complete 后 `customer_pool_items` 的 `profileStatus` / `profileQuality` / `topContactEmail` / `buyerFit` / `matchLevel` 全部正确更新
- [ ] fail 后 `customer_pool_items.profileStatus` 变为 `failed`
- [ ] 非法状态转换返回 409

### P3.3 Admin CLI 扩展

| # | 任务 | 说明 |
|---|------|------|
| 3.3.1 | `admin-cli/profile_requests.py` | list / claim / start / complete / fail 命令 |
| 3.3.2 | `admin-cli/profile_execute.py` | 拉取 payload → 调用 `company_workflow_controller.py profile <rootDomain>` → 解析 `company_profile.tsv` / `company_profile_updates.tsv` → 转换为 API payload |
| 3.3.3 | `admin-cli/profile_run.py` | 一键编排：list queued → claim → payload → execute → complete/fail |
| 3.3.4 | TSV → JSON 转换 | 从 `company_profile.tsv` 提取稳定字段，映射为 `companyProfileCompleteSchema` 格式 |

**验收标准：**

- [ ] `python profile_run.py` 能一键完成：查看待处理 → claim → 拉取参数 → 本地执行 workflow → 解析结果 → 回传 complete
- [ ] complete 后客户池页面刷新可看到画像状态变化
- [ ] fail 路径：workflow 执行失败时正确调用 fail API
- [ ] TSV 中的 `buyer_fit` / `company_role` / `email_best` / `product_categories` 正确映射到 API payload

### P3.4 前端画像按钮交互

| # | 任务 | 说明 |
|---|------|------|
| 3.4.1 | 卡片底部"构建深度画像"按钮激活 | 替换 P2 的 ComingSoon tooltip，改为真正调用 `POST /api/customer-pool/:id/build-profile` |
| 3.4.2 | 按钮状态映射 | `not_started` → "构建深度画像"、`complete/partial` → "更新深度画像"、有进行中 request → "画像构建中..."、`failed` 且无进行中 → "构建失败，重新发起" |
| 3.4.3 | 点击反馈 | 按钮变 loading → toast "深度画像任务已加入处理队列" → 按钮文案变为"画像构建中..." |
| 3.4.4 | 列表 API 返回 `activeProfileRequestStatus` | 在 `GET /api/customer-pool` 中增加：查询该公司是否有 queued/claimed/running 的 `CompanyProfileRequest`，返回其 status（或 null） |

**验收标准：**

- [ ] profileStatus=not_started 时按钮显示"构建深度画像"
- [ ] 点击后 toast 出现，按钮变为"画像构建中..."
- [ ] 刷新页面后按钮仍显示"画像构建中..."（不丢失状态）
- [ ] 管理员 complete 后刷新页面，按钮变为"更新深度画像"
- [ ] 管理员 fail 后刷新页面，按钮变为"构建失败，重新发起"

### P3 整体验收检查清单

- [ ] 用户点击"构建深度画像" → 数据库出现 `CompanyProfileRequest`
- [ ] 管理员 CLI 能一键完成 claim → execute → complete
- [ ] complete 后客户池卡片上画像状态标签变化
- [ ] complete 后详情抽屉能看到 buyer_fit / 联系方式 / 产品信号
- [ ] matchLevel 在 profile 回写后正确更新（有 buyer_fit=high 的公司变为 high）
- [ ] fail 路径正确处理
- [ ] 按钮状态在刷新后仍正确

### P3 交付物汇总

```
web/src/app/api/customer-pool/[id]/build-profile/route.ts          (新增)
web/src/app/api/customer-pool/[id]/status/route.ts                 (新增)
web/src/app/api/admin/company-profile-requests/route.ts            (新增)
web/src/app/api/admin/company-profile-requests/[id]/claim/route.ts (新增)
web/src/app/api/admin/company-profile-requests/[id]/payload/route.ts (新增)
web/src/app/api/admin/company-profile-requests/[id]/start/route.ts (新增)
web/src/app/api/admin/company-profile-requests/[id]/complete/route.ts (新增)
web/src/app/api/admin/company-profile-requests/[id]/fail/route.ts  (新增)
web/src/lib/validations/customer-pool.ts                           (新增)
admin-cli/profile_requests.py                                       (新增)
admin-cli/profile_execute.py                                        (新增)
admin-cli/profile_run.py                                            (新增)
web/src/components/customer-pool/customer-pool-card.tsx             (修改)
web/src/app/api/customer-pool/route.ts                             (修改)
```

---

## P4：画像详情强化 + 运营能力

### 目标

将客户池从"列表页"提升为"可查证、可运营"的客户资产页。

### 前置条件

- P3 全部完成，至少 1 家公司有完整画像

### P4.1 详情抽屉增强

| # | 任务 | 说明 |
|---|------|------|
| 4.1.1 | 证据区块 | evidence_urls 渲染为可点击链接列表 + evidence_notes |
| 4.1.2 | 认证与资质区块 | certifications 字段展示 |
| 4.1.3 | 采购信号详情 | procurement_signal_notes 展示 + import/oem/private_label/moq 信号归类 |
| 4.1.4 | 规模与基础信息区块 | employee_range / revenue_range / founded_year / city + state_region |
| 4.1.5 | 原始数据折叠 | 可展开查看 rawProfileJson 原始内容 |

**验收标准：**

- [ ] 有完整画像的公司，抽屉中能看到所有区块
- [ ] evidence_urls 每条都是可点击的外链
- [ ] 没有某个区块数据时，该区块隐藏（不显示空块）

### P4.2 池内状态管理

| # | 任务 | 说明 |
|---|------|------|
| 4.2.1 | 卡片底部"加入维护"按钮 | 调 `PATCH /api/customer-pool/:id/status` 设 `poolStatus=following` |
| 4.2.2 | 状态切换下拉 | active / watching / following / archived / excluded |
| 4.2.3 | 备注输入 | 切换状态时可附带一句备注 |
| 4.2.4 | 抽屉中状态操作 | 抽屉头部也可切换状态 |

**验收标准：**

- [ ] 点击"加入维护"后 poolStatus 变为 following，卡片左侧状态条颜色变化
- [ ] 下拉切换到 excluded 后，"全部" tab 仍可见，"已排除" tab 中也可见
- [ ] 备注正确写入

### P4.3 ComingSoon 按钮激活

| # | 任务 | 说明 |
|---|------|------|
| 4.3.1 | 线索页卡片"深度画像构建"按钮 | 从 ComingSoon tooltip 改为跳转到客户池对应公司（通过 companyId 匹配） |
| 4.3.2 | 线索页卡片"全网动向深度追踪"按钮 | 保留 ComingSoon tooltip（后续版本） |

**验收标准：**

- [ ] 线索页点"深度画像构建"后跳转到客户池并自动打开该公司详情抽屉
- [ ] "全网动向深度追踪"仍为 ComingSoon

### P4 整体验收检查清单

- [ ] 详情抽屉信息完整且层次清晰
- [ ] 池内状态可切换且视觉反馈正确
- [ ] 线索页与客户池联动可用
- [ ] 无 profile 的公司不显示空的画像区块

### P4 交付物汇总

```
web/src/components/customer-pool/customer-pool-drawer.tsx  (修改)
web/src/components/customer-pool/customer-pool-card.tsx    (修改)
web/src/components/leads/lead-card.tsx                     (修改)
```

---

## 阶段依赖关系与预估工时

```
P1 Schema+函数+数据导入    ████████████████████        ~4-5 天
P2 客户池只读版页面         ████████████████████        ~4-5 天
P3 深度画像请求链路         ████████████████            ~3-4 天
P4 画像详情强化             ████████                    ~2 天
                                                      ──────
                                                      ~13-16 天
```

### 关键路径

- **P1.2**（核心函数 `recomputePoolItemFromLeads`）：是全链路幂等性的基石
- **P1.5**（workflow TSV 导入）：TSV 字段映射和公司匹配逻辑较复杂
- **P3.2.5**（complete 接口）：涉及 upsert profile + sync pool item + recalc matchLevel 三步事务
- **P3.3.2**（workflow profile 结果转换）：需要对齐 TSV 字段与 API schema

### 可并行的工作

- P2 前端页面可以在 P2.1~P2.3 API 完成后并行开发
- P3 admin CLI（P3.3）可以在 P3.2 管理员 API 完成后立刻开始
- P4 可以在 P3 完成一半后提前开始抽屉增强（纯前端展示部分）

---

## 阶段间切换检查清单

### P1 → P2 切换条件

- [ ] 3 张新表 + 5 个 enum 全部在数据库中
- [ ] `customer_pool_items` 中有数据（leads 回填 + workflow 导入）
- [ ] 幂等验证通过（三个脚本各执行两次，数据不变）
- [ ] publish / feedback 链路自动同步客户池

### P2 → P3 切换条件

- [ ] 客户池页面能展示列表
- [ ] 6 个 tab 筛选正确
- [ ] 详情抽屉能打开并展示历史线索
- [ ] "构建深度画像"按钮存在（虽然 P2 阶段为 ComingSoon）

### P3 → P4 切换条件

- [ ] "构建深度画像"按钮可用
- [ ] 管理员能完成 claim → execute → complete 全流程
- [ ] 至少 1 家公司有完整画像数据
- [ ] 按钮状态在刷新后仍正确

### P4 → 交付条件

- [ ] 详情抽屉信息完整
- [ ] 池内状态可管理
- [ ] 线索页→客户池联动可用

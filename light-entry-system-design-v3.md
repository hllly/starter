# 轻入口系统设计方案 v3（种子版 · 手动执行模式）

## 1. 文档定位

本文档是面向种子用户阶段的轻入口系统**最终落地方案**。
基于 v2 方案整合而成，核心变更为：将执行模式从"本地 worker 自动轮询"统一收缩为**手动领取执行模式**。

**一句话定义当前闭环：**

用户提交任务 → 管理员手动领取 → 本地执行 → 人工确认 → 发布结果 → 用户查看并反馈

覆盖内容：

- 产品定位与边界
- 页面结构与字段
- 反馈机制
- 技术架构与执行模式
- 数据库设计
- API 设计
- 认证与准入
- 部署方案
- 监控与告警
- 实施顺序
- 实施速查附录

---

## 2. 产品定位

### 2.1 当前阶段的产品定义

**一个面向外贸 SOHO 的"客户发现与轻维护工作台"**

不是全量 CRM，不是自动化平台全集。

当前只承诺三件事：

1. 提交客户发现任务
2. 查看本轮返回的线索
3. 对线索做轻量状态处理

### 2.2 产品目标

当前阶段重点追求：

- 少量真实种子用户可持续使用
- 用户输入极简
- 结果回显清楚
- 反馈极轻但可沉淀
- 后端工作流持续迭代
- 公司实体逐步形成数据闭环

当前阶段不追求：

- 大规模自助化
- 高并发
- 全自动无人值守
- 复杂的自动化调度与推荐

### 2.3 当前阶段边界说明

当前版本优先保证：

- 用户提交任务简单
- 本地工作流执行稳定
- 结果质量可控
- 用户反馈结构化沉淀

因此，执行链路采用**人工领取与人工确认结果**的方式，而不追求自动调度与全自动执行。

### 2.4 用户感知目标

用户应感受到：

- 这是一个完整系统当前优先开放的核心能力
- 当前开放的是最稳定、最有业务价值的一段
- 自己正在参与一个持续迭代中的专业系统

系统感的传达方式**不依赖首页堆功能卡片**，而通过以下方式实现：

- 导航中保留未来能力入口但弱化（标注"内测中""即将开放"）
- 线索页适度提示后续能力
- 账户页或页底给一个轻路线图

---

## 3. 页面结构

种子版只做 2 个核心页面 + 1 个轻量辅助页。

### 3.1 页面 A：发现页（首页）

#### 页面目标

让用户尽快提交一次发现任务。首屏即为表单，不堆说明信息。

#### 页面结构

##### 顶部简短说明

一句话价值定位：

> 帮你持续发现潜在客户，并沉淀可维护线索。

不放能力卡片大区块，不放未来功能大卡片。

##### 核心表单

**必填字段（4 个，首屏直接露出）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| 目标品类 | 文本/下拉可输入 | 例：宠物用品、家居用品、文具 |
| 目标地区 | 多选/文本 | 例：美国、欧洲、东南亚 |
| 客户类型 | 多选 | 进口商/分销商/批发商/品牌方sourcing/连锁零售买手/贸易公司 |
| 优先方向 | 单选 | 更容易成交/更强采购信号/更适合OEM-ODM/更适合长期开发/更适合分销合作 |

**高级选项（默认折叠）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| 排除项 | 多选+自定义 | 排除纯零售/排除中国同行/排除平台页/排除超大公司/排除本地闭环制造商 |
| 供货能力 | 短文本 | 支持OEM/ODM、MOQ范围、价格带、交期能力 |
| 补充说明 | 多行文本 | 限 300 字 |

v1 中的"规模偏好""痛点"两个字段**砍掉**，用户如有需求可写在补充说明里。

##### 提交区

- 主按钮：开始本轮发现
- 提交后提示：任务已提交，我们会尽快处理并将结果发布到"线索"页
- 若已有处理中的任务，弱提示：当前有任务处理中，新任务会排队等待

**表单草稿：** 不做服务端草稿。使用浏览器 localStorage 暂存表单内容，页面刷新不丢失，不要求跨设备同步。

##### 最近任务入口（表单上方或右上角）

在发现页保留一个极轻的最近任务区块：

| 字段 | 说明 |
|------|------|
| 任务摘要 | 如"美国 · 宠物用品" |
| 状态 | 等待处理 / 正在处理 / 结果已可查看 / 处理未完成 |
| 线索数 | 如"23 条线索"（仅 published 后显示） |
| 操作 | "查看结果"链接，跳转到线索页 |

只展示最近 1 条任务即可。让发现页像工作台入口，而不是一次性提交页。

##### 底部弱存在区

小字体/小卡片，不抢首屏注意力：

- 正在内测的能力：客户维护 · 开发信辅助 · 跟进建议
- 一个"了解更多"链接

---

### 3.2 页面 B：线索页（第二核心页面）

#### 页面目标

让用户看到结果，顺手完成最小反馈和状态推进。

#### 页面结构

##### 1）顶部任务状态条

显示最近任务的状态：

| 状态 | 前端文案 |
|------|----------|
| queued | 等待处理 |
| claimed | 任务已接收，准备开始 |
| running | 正在整理目标客户 |
| awaiting_review | 结果已生成，正在准备发布 |
| published | 结果已可查看 |
| failed | 本轮处理未完成 |
| cancelled | 任务已取消 |

附加信息：

- 最近更新时间
- 手动刷新按钮

轮询策略：

- queued/claimed/running/awaiting_review：每 15 秒轮询
- published/failed/cancelled：停止轮询

##### 2）线索列表

仅在任务状态为 **published** 后展示。其他状态下显示对应的状态提示文案。

每条线索展示：

| 字段 | 说明 |
|------|------|
| 公司名 | 来自 companies 实体 |
| 网站 | 可点击跳转 |
| 地区 | 国家/地区 |
| 客户类型 | 标签形式 |
| 来源 | 来源平台/来源类型 |
| 推荐理由 | 1-2 句简短摘要 |
| 当前状态 | 标签 |

**每条线索的首版动作（一键操作，不强制原因）：**

- 感兴趣（interested）
- 不合适（not_fit）
- 已联系（contacted）

**可选补充反馈（点击"不合适"后展开，不强迫填写）：**

- 类型不匹配
- 太小/太弱
- 重复
- 信息不足
- 其他

##### 3）维护状态内嵌（两层动作模型）

不做独立维护页。在线索卡片上分**两层**完成状态推进：

**第一层：一键动作（始终可见）**

| 动作 | 说明 |
|------|------|
| 感兴趣 | → lead.status = interested |
| 不合适 | → lead.status = dismissed |
| 已联系 | → lead.status = contacted，同时解锁第二层 |

**第二层：维护推进（仅在 contacted 后出现）**

用户点击"已联系"后，线索卡片展开第二组状态按钮：

| 动作 | → lead.status | 说明 |
|------|---------------|------|
| 跟进中 | following | 正在持续沟通 |
| 暂不跟进 | paused | 暂时搁置 |
| 无意向 | no_interest | 对方明确无意向或确认不合适 |

**设计原因：** "已联系"是进入维护流的门槛动作。第一层解决"要不要理这条线索"，第二层解决"联系之后进展如何"。

**完整 lead.status 枚举：**

| 状态值 | 含义 | 来源 |
|--------|------|------|
| new | 新线索（默认） | 系统写入 |
| interested | 已关注 | 第一层动作 |
| dismissed | 标记为不合适 | 第一层动作 |
| contacted | 已联系 | 第一层动作（门槛） |
| following | 跟进中 | 第二层维护 |
| paused | 暂不跟进 | 第二层维护 |
| no_interest | 无意向 | 第二层维护 |

支持一句短备注（可选，非必须）。

##### 4）跨批次重复发现提示

**触发条件：** 当前 lead 的 company_id 在**其他** discovery_request 下已存在至少 1 条 lead 记录。

**前端展示：**

- 线索卡片标注"此前任务中已发现过"
- 可展开查看最近 1~3 次历史记录摘要：
  - 任务时间
  - 当时的 lead.status
  - 用户是否标记为感兴趣 / 不合适 / 已联系

**不触发的情况：** 同一 discovery_request 内的多条 lead 指向同一 company 时，不算"此前发现"。

##### 5）线索筛选与排序

**首版只做最小筛选：**

| 能力 | 说明 |
|------|------|
| 状态 Tab 切换 | 全部 / 新线索 / 已关注 / 已联系 / 跟进中 / 暂停 / 已排除 |
| 默认排序 | 按系统推荐度 + 时间降序 |

**首版不做：**
- 复杂多条件筛选器
- 自由组合过滤
- 按客户类型/地区等维度筛选

##### 6）批次级反馈

在线索列表底部或顶部，放一个极轻问题：

> 这批结果整体是否有帮助？

- 有帮助
- 一般
- 没帮助

可附一句可选备注。仅此而已。

---

### 3.3 页面 C：任务历史页（轻量辅助页）

不是首批必须上线，但建议在执行流程打通后的同一阶段尽快补上。不应拖到最后才做——没有历史感的系统很快会让用户觉得"每次都是从头来"。

#### 页面目标

让用户有任务历史感和系统进展感。

#### 页面结构

##### 任务历史列表

| 字段 | 说明 |
|------|------|
| 任务名称/品类 | 自动生成或用户命名 |
| 目标地区 | 市场 |
| 提交时间 | - |
| 状态 | 等待处理/正在处理/结果已可查看/未完成/已取消 |
| 返回线索数 | 仅 published 后显示 |

##### 当前开放能力区（弱存在）

小型卡片，轻量呈现：

- 客户发现 —— 已开放
- 结果反馈 —— 已开放
- 客户维护 —— 内测中
- 开发信辅助 —— 即将开放
- 跟进建议 —— 即将开放

##### 系统共建提示

> 你的线索反馈与进展更新，会直接影响后续推荐方向与开放节奏。

---

## 4. 反馈机制

### 设计原则

种子阶段反馈机制追求**极轻但可沉淀**，不追求完整归因体系。

核心区分：

- **lead_feedback.action** —— 记录"用户这次点击了什么动作"，是**事件**，追加写入，不可覆盖
- **lead.status** —— 记录"这条线索当前处于什么工作状态"，是**状态快照**，可被后续动作更新

### 4.1 第一类：线索级动作反馈

位置：线索页，每条线索卡片内

操作方式：一键标记

| 动作 | 值 | 说明 |
|------|------|------|
| 感兴趣 | interested | 用户认为有价值 |
| 不合适 | not_fit | 用户认为不匹配 |
| 已联系 | contacted | 用户已采取联系动作 |

**feedback.action → lead.status 自动映射（第一层）：**

| feedback.action | → lead.status | 说明 |
|-----------------|---------------|------|
| interested | interested | 用户标记关注 |
| not_fit | dismissed | 用户排除 |
| contacted | contacted | 进入维护流门槛 |

**第二层维护推进（仅在 contacted 后可用）：**

用户通过 `PATCH /api/leads/:id/status` 手动推进到下一个状态：

| 目标 status | 说明 |
|-------------|------|
| following | 正在持续跟进 |
| paused | 暂时搁置 |
| no_interest | 对方无意向 |

"已联系"是进入维护流的门槛——第一层解决"要不要理"，第二层解决"联系之后怎样了"。

可选原因（仅 not_fit 时展开）：

- type_mismatch
- too_small
- duplicate
- info_insufficient
- other

### 4.2 第二类：批次级简单反馈

位置：线索页底部

形式：单选 + 可选备注

| 选项 | 值 |
|------|------|
| 有帮助 | helpful |
| 一般 | neutral |
| 没帮助 | not_helpful |

### 4.3 暂时后置的反馈能力

以下能力不在种子版实现，等真实使用数据验证后再决定：

- 页面底部复杂多选方向校正
- 多维原因归因体系
- 维护页复杂备注与时间线
- 高价值原因/无价值原因的完整选项体系
- 下一轮偏好调整表单

---

## 5. 技术架构

### 5.1 总体架构

```
用户浏览器
    ↕ HTTPS
云端（Vercel + PostgreSQL）
    ↕ 管理员通过 API/CLI 手动操作
管理员本地环境
    ↕ 调用
OpenClaw 工作流引擎
```

三层分工：

| 层 | 职责 |
|------|------|
| 云端产品层 | 用户登录/邀请、任务提交、状态展示、结果回显、反馈收集 |
| 管理员执行层 | 手动领取任务、本地执行工作流、人工确认结果、发布到云端 |
| 数据存储 | 云端 PostgreSQL 存结构化数据，本地保留原始产物（prompts/logs/tsv/json） |

### 5.2 技术栈

| 层 | 选型 |
|------|------|
| 前端 | Next.js + Tailwind CSS + shadcn/ui |
| 表单 | React Hook Form + Zod |
| 后端 | Next.js Route Handlers / Server Actions |
| ORM | Prisma |
| 数据库 | PostgreSQL（Supabase 或 Neon 托管） |
| 部署 | Vercel |
| 工作流执行 | 管理员本地手动执行，调用 workflow_controller.py |
| 错误监控 | Sentry |

---

## 6. 执行模式设计

### 6.1 当前执行模式

当前版本采用**手动领取执行模式**，不使用本地 worker 自动轮询云端任务。

任务流程如下：

1. 用户在云端提交客户发现任务
2. 云端创建任务记录，状态为 `queued`
3. 管理员查看待处理任务列表，并手动领取任务
4. 领取后，任务状态变为 `claimed`
5. 管理员在本地通过 job_id / request_id 拉取任务详情
6. 管理员在本地执行 OpenClaw workflow，并将任务状态更新为 `running`
7. 本地执行完成后，管理员将结果摘要回传到云端，任务状态更新为 `awaiting_review`
8. 管理员人工确认结果是否适合发布
9. 若确认通过，发布结果并将任务状态更新为 `published`
10. 若结果不适合发布，则将任务状态更新为 `failed`，并记录失败原因

### 6.2 采用该模式的原因

- 当前阶段用户数量少，任务频率低
- 结果质量仍需人工把关
- 避免过早引入自动调度复杂度
- 便于持续迭代本地工作流
- 异常结果不会自动暴露给用户
- 为后续自动化执行模式保留演进空间

### 6.3 任务状态机

| 状态 | 含义 | 用户可见文案 |
|------|------|-------------|
| queued | 任务已提交，等待管理员领取 | 等待处理 |
| claimed | 任务已被管理员领取，准备在本地执行 | 任务已接收，准备开始 |
| running | 任务正在本地执行 | 正在整理目标客户 |
| awaiting_review | 本地执行已完成，结果等待人工确认 | 结果已生成，正在准备发布 |
| published | 结果已确认并发布到云端，对用户可见 | 结果已可查看 |
| failed | 任务执行失败，或结果不符合发布标准 | 本轮处理未完成 |
| cancelled | 任务被取消，不再继续处理 | 任务已取消 |

**状态转换规则：**

```
queued → claimed（管理员领取）
claimed → running（管理员开始执行）
running → awaiting_review（执行完成，回传结果）
awaiting_review → published（人工确认通过）
awaiting_review → failed（人工确认不通过）
running → failed（执行过程中失败）
queued → cancelled（取消任务）
claimed → cancelled（取消任务）
```

### 6.4 任务推进方式

所有任务状态推进由管理员操作或本地执行完成后明确调用接口完成：

| 操作 | 接口 | 状态变化 |
|------|------|----------|
| 领取任务 | POST /api/jobs/:id/claim | queued → claimed |
| 开始执行 | POST /api/jobs/:id/start | claimed → running |
| 执行完成 | POST /api/jobs/:id/review-ready | running → awaiting_review |
| 确认发布 | POST /api/jobs/:id/publish | awaiting_review → published |
| 拒绝发布 | POST /api/jobs/:id/reject | awaiting_review → failed |
| 执行失败 | POST /api/jobs/:id/fail | running → failed |
| 取消任务 | POST /api/jobs/:id/cancel | queued/claimed → cancelled |

### 6.5 失败类型分类（failure_type）

| 类型 | 用户侧展示 | 说明 |
|------|------------|------|
| execution_error | 本轮处理过程中出现问题 | 执行阶段报错 |
| quality_rejected | 本轮结果未达到发布标准，会重新处理 | 人工审核不通过 |
| invalid_input | 任务参数有误，请检查后重新提交 | 输入校验不通过 |

### 6.6 结果回传 Payload 结构

管理员调用 `POST /api/jobs/:id/review-ready` 时，提交以下固定结构。云端 API 负责写库、company 去重、lead 创建。

```json
{
  "run_info": {
    "run_id": "run_20260313_abc",
    "summary_text": "本轮围绕宠物用品品类，在美国市场发现 23 个候选客户..."
  },
  "batch_summary": {
    "recommended_count": 15,
    "observation_count": 8,
    "source_summary": "行业目录 12 条，协会 6 条，海关数据 5 条",
    "source_breakdown": [
      {"type": "industry_directory", "count": 12},
      {"type": "association", "count": 6},
      {"type": "customs_data", "count": 5}
    ]
  },
  "leads": [
    {
      "company_name": "PetSupply Co.",
      "website": "https://petsupplyco.com",
      "country_region": "US",
      "buyer_type": "distributor",
      "source_type": "industry_directory",
      "source_url": "https://example.com/listing/123",
      "source_platform": "Kompass",
      "recommendation_reason": "主营宠物用品分销，年采购规模中等，有进口需求信号",
      "recommended_action": "建议优先联系",
      "current_tier": "recommended",
      "linkedin_url": "https://linkedin.com/company/petsupplyco"
    }
  ]
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| leads[].company_name | 是 | 公司名称 |
| leads[].website | 否 | 公司网站（用于 company 去重主键） |
| leads[].country_region | 是 | 国家/地区 |
| leads[].buyer_type | 是 | 客户类型 |
| leads[].source_type | 是 | 来源类型 |
| leads[].source_url | 否 | 来源页面 URL |
| leads[].source_platform | 否 | 来源平台名 |
| leads[].recommendation_reason | 是 | 推荐理由（1-2 句） |
| leads[].recommended_action | 否 | 建议动作 |
| leads[].current_tier | 是 | 推荐层级：recommended / observation |
| leads[].linkedin_url | 否 | LinkedIn 页面 |

**云端 API 收到后的处理流程：**

1. 解析 leads 数组
2. 对每条 lead，按 company 去重规则查找或创建 companies 记录
3. 创建 leads 记录，关联到 company_id 和 discovery_request_id
4. 创建 job_result_summaries 记录
5. 根据 recommended_count 和 observation_count 判定 result_quality
6. 更新 job 状态为 awaiting_review
7. **此时线索对用户不可见**，等管理员 publish 后才对用户可见

### 6.7 结果回传原则

云端只保存：

- request / job 基础信息
- 可展示的 lead 列表（关联到 companies）
- 结果摘要统计

本地保留：

- prompts
- temp files
- logs
- validation reports
- tsv/json 原始产物

### 6.8 当前版本不包含的机制

以下机制在当前版本**不实现**，如后续任务量增加、流程趋于稳定，可再引入：

- 本地 worker 自动轮询任务
- 自动 claim / 自动抢任务
- heartbeat 在线检测
- worker online / degraded / offline 状态展示
- stalled 自动检测与自动恢复
- 多 worker 协调
- worker_id / worker_name 节点识别

---

## 7. 数据库设计

种子版 **8 张核心表**。

### 7.1 users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| email | VARCHAR UNIQUE | 登录标识 |
| name | VARCHAR | 显示名 |
| status | VARCHAR | active/invited/disabled |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

### 7.2 discovery_requests

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| user_id | UUID FK → users | - |
| product_category | VARCHAR | 目标品类 |
| target_regions | JSONB | 目标地区列表 |
| buyer_types | JSONB | 客户类型列表 |
| priority_direction | VARCHAR | 优先方向 |
| advanced_options | JSONB | 低频补充字段（见下方说明） |
| status | VARCHAR | 与主 job 状态同步 |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

索引：user_id, status, created_at

**JSONB 策略：** 高频筛选字段（product_category, target_regions, buyer_types, priority_direction）使用独立列。仅低频补充字段放入 advanced_options JSONB：

```json
{
  "exclusion_rules": ["no_retail", "no_chinese_peers"],
  "supply_notes": "支持 OEM/ODM，MOQ 500pcs",
  "extra_notes": "优先找有稳定采购计划的中型分销商"
}
```

### 7.3 jobs

jobs 表**只负责调度与执行状态**，不存放结果摘要。结果数据存入 job_result_summaries（见 7.4）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| discovery_request_id | UUID FK → discovery_requests | - |
| status | VARCHAR | queued/claimed/running/awaiting_review/published/failed/cancelled |
| claimed_at | TIMESTAMP | 管理员领取时间 |
| claimed_by | VARCHAR | 领取人标识 |
| started_at | TIMESTAMP | 开始执行时间 |
| review_ready_at | TIMESTAMP | 执行完成、进入审核时间 |
| published_at | TIMESTAMP | 发布时间 |
| review_decision | VARCHAR | approved / rejected |
| review_note | TEXT | 审核备注 |
| failure_type | VARCHAR | execution_error/quality_rejected/invalid_input |
| error_summary | TEXT | 失败时的错误摘要 |
| run_id | VARCHAR | 本地 run 标识 |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

索引：discovery_request_id, status, created_at

### 7.4 job_result_summaries

存放任务完成后的结果摘要，与 jobs 表 1:1 关联（仅进入 awaiting_review 后的 job 有此记录）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| job_id | UUID FK → jobs UNIQUE | 1:1 关联 |
| summary_text | TEXT | 运行摘要 |
| recommended_count | INTEGER | 推荐线索数 |
| observation_count | INTEGER | 观察线索数 |
| source_summary_text | TEXT | 来源分布文本摘要（前端展示用） |
| source_summary_json | JSONB | 来源分布结构化数据（分析用） |
| result_quality | VARCHAR | 结果质量：normal/low_yield/empty |
| created_at | TIMESTAMP | - |

索引：job_id (UNIQUE)

**result_quality 判定规则：**

| 值 | 条件 | 前端文案 |
|----|------|----------|
| empty | recommended_count + observation_count = 0 | 本轮处理完成，但暂未得到可用线索。可尝试调整品类、地区或客户类型 |
| low_yield | recommended_count + observation_count < 5 | 本轮结果较少，建议调整发现条件以获得更多匹配 |
| normal | 其他 | （正常展示结果） |

**source_summary_json 示例：**

```json
[
  {"type": "industry_directory", "count": 12},
  {"type": "association", "count": 6},
  {"type": "customs_data", "count": 5}
]
```

### 7.5 companies

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| company_name | VARCHAR | 原始公司名（保留首次发现时的原始值） |
| normalized_name | VARCHAR | 标准化后的公司名（用于去重匹配） |
| website | VARCHAR | 规范化后的公司网站 |
| country_region | VARCHAR | 国家/地区（统一字段名，允许存国家或区域） |
| linkedin_url | VARCHAR | LinkedIn 页面 |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

**去重策略（保守优先，避免误合并）：**

优先级 1：规范化 website 精确去重
优先级 2：normalized_name + country_region 弱去重（仅当无 website 时）

第一版不做模糊编辑距离匹配，不做 AI 模糊归并。

**唯一索引：**
- `UNIQUE(website) WHERE website IS NOT NULL`
- `UNIQUE(normalized_name, country_region) WHERE website IS NULL`

**website 规范化规则：**

1. 去协议头（http:// / https://）
2. 去 www. 前缀
3. 去尾部斜杠
4. 统一小写

示例：`https://www.PetSupply.com/` → `petsupply.com`

**normalized_name 规则：**

1. lowercase
2. trim
3. 去常见后缀：inc, llc, ltd, corp, co, gmbh, sa, srl, pty
4. 去标点符号
5. 压缩连续空格为单个空格

示例：`PetSupply Co., Inc.` → `petsupply`

### 7.6 leads

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| discovery_request_id | UUID FK → discovery_requests | 来源任务 |
| company_id | UUID FK → companies | 关联到公司实体 |
| source_type | VARCHAR | 来源类型（行业目录/协会/海关等） |
| source_platform | VARCHAR | 来源平台名（如 Kompass、ThomasNet） |
| source_url | VARCHAR | 来源页面 |
| buyer_type | VARCHAR | 本次发现中的客户类型标签 |
| current_tier | VARCHAR | 系统推荐层级：recommended / observation |
| recommendation_reason | TEXT | 推荐理由（1-2 句） |
| recommended_action | TEXT | 系统建议动作 |
| status | VARCHAR | new/interested/dismissed/contacted/following/paused/no_interest |
| note | TEXT | 短备注 |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

索引：discovery_request_id, company_id, status

说明：

- leads 是"某次发现中的结果记录"，companies 是"长期沉淀的实体"
- 同一个 company_id 可以在不同 discovery_request 中产生多条 lead（因来源、任务画像、推荐理由可能不同）
- lead.status 由 feedback.action 自动映射更新（见第 4 节），也可通过维护操作手动推进
- leads 在 job 状态为 published 后才对用户可见

### 7.7 lead_feedback

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| lead_id | UUID FK → leads | - |
| user_id | UUID FK → users | - |
| action | VARCHAR | interested/not_fit/contacted |
| reason | VARCHAR | 可选原因（仅 not_fit 时） |
| note | TEXT | 可选备注 |
| created_at | TIMESTAMP | - |

索引：lead_id, user_id

### 7.8 batch_feedback

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| discovery_request_id | UUID FK → discovery_requests | - |
| user_id | UUID FK → users | - |
| helpfulness | VARCHAR | helpful/neutral/not_helpful |
| note | TEXT | 可选备注 |
| created_at | TIMESTAMP | - |

索引：discovery_request_id, user_id

---

## 8. API 设计

### 8.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/signin/magic-link | 发送 magic link 邮件 |
| GET | /api/auth/session | NextAuth session 接口 |

### 8.2 发现任务（用户侧）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/discovery-requests | 创建发现任务 |
| GET | /api/discovery-requests | 获取当前用户的任务列表 |
| GET | /api/discovery-requests/:id | 获取单个任务详情（含状态） |
| GET | /api/discovery-requests/:id/leads | 获取该任务下的线索列表（仅 published 后可见） |

### 8.3 线索操作（用户侧）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/leads/:id/feedback | 提交线索级反馈（action + 可选 reason） |
| PATCH | /api/leads/:id/status | 更新线索维护状态（following/paused/no_interest，仅 contacted 后可用） |

### 8.4 批次反馈（用户侧）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/discovery-requests/:id/feedback | 提交批次级反馈 |

### 8.5 任务执行（管理员侧）

管理员接口通过 **ADMIN_API_KEY** 认证（环境变量配置，Bearer token 传递），或通过管理员 session 认证。

```
请求头：Authorization: Bearer <ADMIN_API_KEY>
```

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/jobs?status=queued | 查看待处理任务列表 |
| GET | /api/admin/jobs/:id/payload | 拉取任务详情（用于本地执行） |
| POST | /api/admin/jobs/:id/claim | 领取任务（queued → claimed） |
| POST | /api/admin/jobs/:id/start | 标记开始执行（claimed → running） |
| POST | /api/admin/jobs/:id/review-ready | 执行完成，回传结果（running → awaiting_review，payload 见 6.6 节） |
| POST | /api/admin/jobs/:id/publish | 确认发布（awaiting_review → published） |
| POST | /api/admin/jobs/:id/reject | 拒绝发布（awaiting_review → failed，body: failure_type, review_note） |
| POST | /api/admin/jobs/:id/fail | 标记执行失败（running → failed，body: failure_type, error_summary） |
| POST | /api/admin/jobs/:id/cancel | 取消任务（queued/claimed → cancelled） |

### 8.6 多任务提交策略

用户可以在上一个任务处理中时继续提交新任务。新任务自动排队，管理员按需领取处理。

前端弱提示：当前有任务处理中，新任务会排队等待。

### 8.7 防抖与幂等

**提交防抖：** 同一用户 30 秒内相同参数重复提交，返回已有任务而非创建新任务。

**管理员操作幂等：**
- published 后重复 publish → 忽略
- failed 后不允许再写 running（需要创建新 job 重新执行）
- claim 只在 queued 状态下生效
- start 只在 claimed 状态下生效
- review-ready 只在 running 状态下生效

---

## 9. 认证与准入

| 项 | 方案 |
|------|------|
| 框架 | NextAuth / Auth.js |
| 登录方式 | Magic Link（邮箱链接登录） |
| Session | httpOnly cookie |
| 准入控制 | 邀请制 allowlist |
| 注册 | 不开放自助注册 |
| 多设备 | 不做复杂策略 |
| Token 刷新 | 不做复杂体系 |

### 邀请名单管理

手工维护 allowlist（可在 users 表中以 status=invited 管理）：

- email
- invited_at
- activated_at
- status（invited / active / disabled）

### 用户状态行为定义

| 状态 | 可提交新任务 | 可查看历史任务和线索 | 可做反馈 | 说明 |
|------|-------------|---------------------|---------|------|
| invited | 否 | 否 | 否 | 已邀请未激活 |
| active | 是 | 是 | 是 | 正常使用 |
| disabled | 否 | 是（只读） | 否 | 暂停合作/停止测试，保留历史数据 |

disabled 用户登录后看到的提示：当前账户已暂停使用，历史数据仍可查看。如需恢复请联系管理员。

---

## 10. 部署方案

| 组件 | 选型 | 说明 |
|------|------|------|
| 前端+后端 | Vercel | Next.js 一体部署，零运维 |
| 数据库 | Supabase PostgreSQL 或 Neon | 免运维托管 |
| 工作流执行 | 管理员本地机器 | 手动执行 Python workflow |
| 错误监控 | Sentry | 接入 Next.js 前后端 |
| 域名 | 自定义域名绑定 Vercel | - |

---

## 11. 监控与告警

种子阶段做两件事即可：

### 11.1 API 错误监控

接 Sentry，覆盖 Next.js 前后端。

### 11.2 任务积压监控

定期检查（可手动或 Vercel Cron）：
- queued 状态超过 24 小时的任务数
- 可选：发邮件/Telegram 提醒自己处理

---

## 12. 数据迁移

### 冷启动方案

不搞双向同步。做一个一次性导入脚本：

1. 读取既有 runs 目录中的 TSV/JSON
2. 提取公司实体写入 companies（执行去重逻辑）
3. 提取本轮结果写入 discovery_requests + jobs + leads
4. 历史反馈没有就空着

新系统从已有结果中冷启动，旧系统不需要长期与新系统双写。

---

## 13. 视觉与配色

延续 v1 方案的视觉系统，整体风格：清新简约、轻专业、有系统感。

### 配色策略

**浅青绿 + 暖灰白**

| 用途 | 色系 |
|------|------|
| 页面背景 | 暖灰白 |
| 内容卡片 | 白色 |
| 主色（按钮/选中/CTA） | 低饱和浅青绿 teal |
| 成功/维护中 | 柔和自然绿 |
| 观察/提醒 | 低饱和琥珀 |
| 错误/无意向 | 低饱和柔红 |
| 标题文字 | 深灰 |
| 正文文字 | 中深灰 |

### 使用原则

- 页面 70%+ 区域使用中性色
- 主色只用于关键交互和强调
- 状态色克制使用
- 不用高饱和科技蓝或高亮紫
- 不做大面积纯色背景或强渐变
- 通过留白、字号、边框建立层次

---

## 14. 产品边界

### 第一版明确不做

- 复杂多用户协作
- 用户操作 workflow 参数
- 全量自动化调度
- 本地 worker 自动轮询
- heartbeat / stalled 自动检测
- 大规模并发任务
- 高复杂度筛选器
- 用户直接接触内部平台层/公司层结构
- 独立维护页（内嵌到线索页）
- WebSocket/SSE 推送（用前端轮询替代）
- 复杂反馈归因体系
- 维护时间线
- 复杂认证策略

### 第一版优先上线顺序

| 批次 | 内容 |
|------|------|
| 第一批 | 数据库 + API 基础骨架 + 认证 |
| 第二批 | 发现页 + 线索页 |
| 第三批 | 管理员执行流程打通（claim → execute → review → publish） |
| 第四批 | 任务历史页（建议紧跟第三批，不宜拖延） |
| 第五批 | 根据种子用户反馈迭代字段、摘要、反馈标签 |

---

## 15. MVP 成功标准

1. 用户能在 2 分钟内完成任务提交
2. 用户能在结果页理解为什么推荐这些线索
3. 用户愿意对线索做一键反馈
4. 用户能更新至少一部分线索状态
5. 你能从数据库中拿到结构化的任务、线索、反馈数据
6. 用户感受到这是一个工作台，而不是单点找客户工具
7. 管理员能顺畅完成"领取 → 执行 → 审核 → 发布"全流程
8. 异常结果不会未经确认就暴露给用户

---

## 16. 后续再评估的问题

以下问题在当前种子版不实现，但在后续阶段需要评估：

1. 是否需要独立的内部审核页面（而非通过 CLI/API 确认发布）
2. 是否在任务量增加后引入自动领取或自动轮询模式
3. 是否支持部分任务自动发布、部分任务人工确认
4. 是否需要增加管理员批量处理任务能力
5. 是否需要引入 worker_id / worker_name 节点识别（多执行节点场景）
6. 是否需要 heartbeat / stalled 自动检测机制
7. 是否需要 current_step 执行进度展示（当前版本不展示细粒度步骤）

---

## 17. 实施速查附录

> 开发时需要快速查阅的关键规则汇总，避免回翻正文。

### A. feedback.action → lead.status 映射表

| feedback.action | → lead.status | 层级 |
|-----------------|---------------|------|
| interested | interested | 第一层 |
| not_fit | dismissed | 第一层 |
| contacted | contacted | 第一层（门槛） |
| —（手动推进） | following | 第二层（仅 contacted 后） |
| —（手动推进） | paused | 第二层（仅 contacted 后） |
| —（手动推进） | no_interest | 第二层（仅 contacted 后） |

### B. lead.status 完整枚举

| 状态 | 含义 | 来源 |
|------|------|------|
| new | 新线索 | 系统默认 |
| interested | 已关注 | 第一层动作 |
| dismissed | 不合适 | 第一层动作 |
| contacted | 已联系 | 第一层动作（门槛） |
| following | 跟进中 | 第二层维护 |
| paused | 暂不跟进 | 第二层维护 |
| no_interest | 无意向 | 第二层维护 |

### C. job.status 状态机

| 当前状态 | 允许的操作 | 目标状态 |
|----------|-----------|----------|
| queued | claim | claimed |
| queued | cancel | cancelled |
| claimed | start | running |
| claimed | cancel | cancelled |
| running | review-ready | awaiting_review |
| running | fail | failed |
| awaiting_review | publish | published |
| awaiting_review | reject | failed |

### D. 任务状态 → 用户可见文案

| job.status | 用户看到的文案 |
|------------|---------------|
| queued | 等待处理 |
| claimed | 任务已接收，准备开始 |
| running | 正在整理目标客户 |
| awaiting_review | 结果已生成，正在准备发布 |
| published | 结果已可查看 |
| failed | 本轮处理未完成 |
| cancelled | 任务已取消 |

### E. failure_type 枚举 + 前端文案

| 类型 | 前端文案 |
|------|----------|
| execution_error | 本轮处理过程中出现问题 |
| quality_rejected | 本轮结果未达到发布标准，会重新处理 |
| invalid_input | 任务参数有误，请检查后重新提交 |

### F. result_quality 枚举 + 前端文案

| 值 | 条件 | 前端文案 |
|----|------|----------|
| empty | recommended + observation = 0 | 本轮处理完成，但暂未得到可用线索。可尝试调整品类、地区或客户类型 |
| low_yield | recommended + observation < 5 | 本轮结果较少，建议调整发现条件以获得更多匹配 |
| normal | 其他 | （正常展示结果） |

### G. Company 去重优先级

| 优先级 | 条件 | 匹配键 |
|--------|------|--------|
| 1 | website 不为空 | 规范化 website（去协议、去www、去尾斜杠、小写） |
| 2 | website 为空 | normalized_name + country_region |

normalized_name 规则：lowercase → trim → 去后缀(inc/llc/ltd/corp/co/gmbh/sa/srl/pty) → 去标点 → 压空格

### H. current_tier × recommended_action 合法组合

| current_tier | 允许的 recommended_action |
|-------------|--------------------------|
| recommended | 优先联系、建议联系 |
| observation | 继续观察、视情况联系、暂不优先 |

**禁止组合：** observation + "优先联系"

### I. "此前任务中已发现过"判定条件

- **触发：** 当前 lead 的 company_id 在**其他** discovery_request_id 下存在 ≥1 条 lead 记录
- **不触发：** 同一 discovery_request 内多条 lead 指向同一 company
- **展示：** 标注提示 + 可展开查看最近 1~3 次历史（任务时间、当时状态、用户反馈）

### J. 幂等与状态转换约束

| 当前 job.status | 允许的操作 | 不允许 |
|----------------|-----------|--------|
| queued | claim, cancel | start, review-ready, publish, reject, fail |
| claimed | start, cancel | claim, review-ready, publish, reject |
| running | review-ready, fail | claim, start, publish, reject, cancel |
| awaiting_review | publish, reject | claim, start, review-ready, cancel |
| published | （终态，忽略重复 publish） | 所有状态变更 |
| failed | （终态，需新建 job 重试） | 所有状态变更 |
| cancelled | （终态） | 所有状态变更 |

### K. 管理员执行操作速查

```bash
# 1. 查看待处理任务
GET /api/admin/jobs?status=queued

# 2. 领取任务
POST /api/admin/jobs/:id/claim

# 3. 拉取任务详情到本地
GET /api/admin/jobs/:id/payload

# 4. 本地执行 workflow（在本地终端）
python workflow_controller.py --request-id <request_id>

# 5. 标记开始执行
POST /api/admin/jobs/:id/start

# 6. 执行完成，回传结果
POST /api/admin/jobs/:id/review-ready
Body: { run_info, batch_summary, leads }

# 7. 人工确认结果质量后发布
POST /api/admin/jobs/:id/publish

# 或拒绝发布
POST /api/admin/jobs/:id/reject
Body: { failure_type: "quality_rejected", review_note: "..." }
```

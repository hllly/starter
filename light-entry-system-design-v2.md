# 轻入口系统设计方案 v2（种子版极简闭环）

## 1. 文档定位

本文档是面向种子用户阶段的轻入口系统**最终落地方案**。
基于 v1 方案与架构评审意见整合而成，目标是：

**先把"提交 → 执行 → 看结果 → 轻反馈 → 持续维护"跑顺，而不是先做一个中型 SaaS 骨架。**

覆盖内容：

- 产品定位与边界
- 页面结构与字段
- 反馈机制
- 技术架构
- 数据库设计
- API 设计
- 本地 worker 可靠性
- 认证与准入
- 部署方案
- 监控与告警
- 实施顺序

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

### 2.3 用户感知目标

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
- 提交后提示：结果将在处理完成后出现在"线索"页
- 若 worker 离线，显示提示：处理引擎当前离线，任务已提交并排队等待执行
- 若已有 running 任务，弱提示：当前有任务处理中，新任务会排队执行

**表单草稿：** 不做服务端草稿。使用浏览器 localStorage 暂存表单内容，页面刷新不丢失，不要求跨设备同步。

##### 最近任务入口（表单上方或右上角）

在发现页保留一个极轻的最近任务区块，避免用户每次进来只看到表单而不知道上一个任务状态：

| 字段 | 说明 |
|------|------|
| 任务摘要 | 如"美国 · 宠物用品" |
| 状态 | 已完成 / 处理中 / 排队中 / 失败 |
| 线索数 | 如"23 条线索" |
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

| 状态 | 说明 |
|------|------|
| queued | 排队中 |
| running | 处理中（显示当前步骤名） |
| completed | 已完成 |
| failed | 失败（显示错误摘要） |
| stalled | 处理卡住（显示最后心跳时间） |

附加信息：

- 最近更新时间
- 手动刷新按钮
- 处理引擎状态指示（在线/降级/离线）

轮询策略：

- running/queued：每 10 秒轮询
- completed/failed/stalled：停止轮询

##### 2）线索列表

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

**设计原因：** "已联系"是进入维护流的门槛动作。第一层解决"要不要理这条线索"，第二层解决"联系之后进展如何"。如果不分层，用户会搞不清"我已经联系过了，为什么还要再改状态"。

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

##### 4）线索筛选与排序

**首版只做最小筛选：**

| 能力 | 说明 |
|------|------|
| 状态 Tab 切换 | 全部 / 新线索 / 已关注 / 已联系 / 跟进中 / 暂停 / 已排除 |
| 默认排序 | 按系统推荐度 + 时间降序 |

**首版不做：**
- 复杂多条件筛选器
- 自由组合过滤
- 按客户类型/地区等维度筛选

##### 5）批次级反馈

在线索列表底部或顶部，放一个极轻问题：

> 这批结果整体是否有帮助？

- 有帮助
- 一般
- 没帮助

可附一句可选备注。仅此而已。

---

### 3.3 页面 C：任务历史页（轻量辅助页）

不是首批必须上线，但建议在 worker 打通后的同一阶段尽快补上（对应第 14 节第四批）。不应拖到最后才做——没有历史感的系统很快会让用户觉得"每次都是从头来"。

#### 页面目标

让用户有任务历史感和系统进展感。

#### 页面结构

##### 任务历史列表

| 字段 | 说明 |
|------|------|
| 任务名称/品类 | 自动生成或用户命名 |
| 目标地区 | 市场 |
| 提交时间 | - |
| 状态 | queued/running/completed/failed/stalled |
| 返回线索数 | - |

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
    ↕ API 调用（worker 主动轮询 + 回写）
本地 Python Worker
    ↕ 调用
OpenClaw 工作流引擎
```

三层分工：

| 层 | 职责 |
|------|------|
| 云端产品层 | 用户登录/邀请、任务提交、状态展示、结果回显、反馈收集 |
| 本地执行层 | 拉取待执行任务、调用现有 Python 工作流、生成结果、回传结构化数据 |
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
| 工作流执行 | 本地 Python worker，调用 workflow_controller.py |
| 错误监控 | Sentry |

---

## 6. Worker 可靠性设计

### 6.1 心跳机制

Worker 每 30~60 秒上报一次心跳到云端：

```
POST /api/worker/heartbeat
Body: { worker_id, timestamp, current_job_id? }
```

云端根据心跳计算 worker_status：

| 状态 | 条件 |
|------|------|
| online | 最近 90 秒内有心跳 |
| degraded | 90~300 秒无心跳 |
| offline | 超过 300 秒无心跳 |

前端在发现页和线索页都展示此状态。

### 6.2 任务状态模型

| 状态 | 含义 |
|------|------|
| queued | 已创建，等待 worker 拉取 |
| running | worker 已开始执行 |
| completed | 执行完成，结果已回写 |
| failed | 执行失败，保留错误摘要 |
| stalled | running 状态下心跳超时，判定为卡住 |

**stalled 判定规则：**

- 任务处于 running 且 last_heartbeat_at 超过阈值（默认 5 分钟）未更新
- 由云端定时任务（Vercel Cron）每隔几分钟扫描标记

**stalled 恢复规则：**

- 仅管理员可触发重试（种子阶段不开放给普通用户）
- 重试时创建新的 job，原 stalled job 保持原状不覆盖（保留审计链）
- 新 job 自动进入 queued 状态，worker 正常拉取执行

**失败类型分类（failure_type）：**

| 类型 | 用户侧展示 | 说明 |
|------|------------|------|
| temporary_issue | 处理过程中出现临时问题，请稍后重试 | 可重试的临时性错误 |
| worker_offline | 处理引擎离线，任务将在恢复后继续 | worker 心跳丢失导致 |
| invalid_input | 任务参数有误，请检查后重新提交 | 输入校验未通过 |

用户不能只看到"失败"，前端根据 failure_type 展示不同文案。

### 6.3 执行步骤枚举（current_step）

current_step 使用固定枚举，不允许自由文本。

| 枚举值 | 前端展示文案 |
|--------|-------------|
| platform_discovery | 平台识别中 |
| direct_company_discovery | 公司候选整理中 |
| candidate_verification | 候选校验中 |
| platform_drilldown | 平台下钻中 |
| extraction | 结果提取中 |
| scoring | 线索评估中 |
| result_packaging | 结果整理中 |

Worker 通过 `POST /api/jobs/:id/progress` 上报 current_step，前端在任务状态条中展示对应文案。

### 6.4 任务调试信息

任务详情展示：

- 当前状态
- 当前步骤（前端文案映射）
- 开始时间
- 最近更新时间
- worker 名称/节点标识
- 失败类型 + 错误摘要（如果失败）

不需要把本地日志搬到云端，但要让出问题时能大致知道卡在哪。

### 6.5 结果回传原则

云端只保存：

- request / job 基础信息
- 可展示的 lead 列表（关联到 companies）
- 关键统计

本地保留：

- prompts
- temp files
- logs
- validation reports
- tsv/json 原始产物

### 6.6 Worker 完成回传 Payload 结构

Worker 调用 `POST /api/jobs/:id/complete` 时，提交以下固定结构。Worker 只负责回传结构化数据，**不直接操作业务表**，写库、company 去重、lead 创建全部由云端 API 负责。

```json
{
  "run_info": {
    "run_id": "run_20260313_abc",
    "status": "completed",
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
4. 创建 job_result_summaries 记录（存储 summary_text、统计、来源分布等）
5. 根据 recommended_count 和 observation_count 判定 result_quality（empty / low_yield / normal）
6. 更新 job 状态为 completed
7. 更新 discovery_request 状态为 completed

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
| status | VARCHAR | queued/running/completed/failed/stalled |
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
| status | VARCHAR | queued/running/completed/failed/stalled |
| worker_id | VARCHAR | 执行该任务的 worker 标识 |
| worker_name | VARCHAR | worker 显示名（用于调试） |
| current_step | VARCHAR | 固定枚举，见 6.3 节 |
| failure_type | VARCHAR | 失败类型：temporary_issue/worker_offline/invalid_input |
| run_id | VARCHAR | worker 回传的本地 run 标识 |
| started_at | TIMESTAMP | - |
| finished_at | TIMESTAMP | - |
| last_heartbeat_at | TIMESTAMP | worker 最近一次心跳 |
| error_summary | TEXT | 失败时的错误摘要 |
| created_at | TIMESTAMP | - |
| updated_at | TIMESTAMP | - |

索引：discovery_request_id, status, last_heartbeat_at

current_step 合法值（枚举）：

- platform_discovery
- direct_company_discovery
- candidate_verification
- platform_drilldown
- extraction
- scoring
- result_packaging

说明：种子阶段不拆 job_runs，一个 request 对应一个主 job。stalled 恢复时创建新 job，不重置原 job。

### 7.4 job_result_summaries

存放任务完成后的结果摘要，与 jobs 表 1:1 关联（仅 completed 的 job 有此记录）。将结果数据从 jobs 中分离，避免 jobs 表同时承担调度、审计和结果展示职责。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | - |
| job_id | UUID FK → jobs UNIQUE | 1:1 关联 |
| summary_text | TEXT | worker 回传的运行摘要 |
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

前端展示用 source_summary_text，后续来源分布图表和来源分析用 source_summary_json。

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

### 8.2 发现任务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/discovery-requests | 创建发现任务 |
| GET | /api/discovery-requests | 获取当前用户的任务列表 |
| GET | /api/discovery-requests/:id | 获取单个任务详情（含状态） |
| GET | /api/discovery-requests/:id/leads | 获取该任务下的线索列表 |

### 8.3 线索操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/leads/:id/feedback | 提交线索级反馈（action + 可选 reason） |
| PATCH | /api/leads/:id/status | 更新线索维护状态（following/paused/no_interest，仅 contacted 后可用） |

### 8.4 批次反馈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/discovery-requests/:id/feedback | 提交批次级反馈 |

### 8.5 Worker 接口

**认证方式：** 固定 WORKER_API_KEY，通过环境变量配置。

```
请求头：Authorization: Bearer <WORKER_API_KEY>
```

Worker 每次请求需携带 `worker_id` 和 `worker_name`（在 heartbeat 和 start 中传递）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/worker/heartbeat | 上报心跳（body: worker_id, worker_name, timestamp, current_job_id?） |
| GET | /api/worker/next-job | 拉取下一个 queued 任务 |
| POST | /api/jobs/:id/start | 标记开始执行（body: worker_id, worker_name） |
| POST | /api/jobs/:id/progress | 更新进度（body: current_step，值必须为 6.3 节枚举） |
| POST | /api/jobs/:id/complete | 标记完成并回传结果（payload 结构见 6.6 节） |
| POST | /api/jobs/:id/fail | 标记失败（body: failure_type, error_summary） |

### 8.6 多任务提交策略

用户可以在上一个任务 running 时继续提交新任务。新任务自动排队，worker 串行处理。

前端弱提示：当前有任务处理中，新任务会排队执行。

### 8.7 防抖与幂等

**提交防抖：** 同一用户 30 秒内相同参数重复提交，返回已有任务而非创建新任务。

**Worker 回调幂等：**
- completed 后重复 complete → 忽略
- failed 后不允许再写 running（除非管理员显式 retry，retry 会创建新 job）
- start 只在 queued 状态下生效
- progress 只在 running 状态下生效

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

如后续需要彻底冻结（不允许登录），再新增 `archived` 状态。

---

## 10. 部署方案

| 组件 | 选型 | 说明 |
|------|------|------|
| 前端+后端 | Vercel | Next.js 一体部署，零运维 |
| 数据库 | Supabase PostgreSQL 或 Neon | 免运维托管 |
| Worker | 本地机器或轻量云主机 | 运行 Python worker 进程 |
| 错误监控 | Sentry | 接入 Next.js 前后端 |
| 域名 | 自定义域名绑定 Vercel | - |

---

## 11. 监控与告警

种子阶段做三件事即可：

### 11.1 API 错误监控

接 Sentry，覆盖 Next.js 前后端。

### 11.2 Worker 心跳监控

云端数据库可查：
- 最后心跳时间
- 当前状态 online/degraded/offline

前端页面展示 worker 状态指示。

### 11.3 任务卡住检测

云端定时任务（可用 Vercel Cron 或单独脚本）每隔几分钟扫描：
- running 且 last_heartbeat_at 超过阈值
- 标记为 stalled
- 可选：发邮件/Telegram/Slack 通知自己

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
| 第三批 | 本地 worker 打通任务执行与结果回传 |
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
7. 任务链路可观测——能知道 worker 是否在线、任务卡在哪

---

## 16. 已定设计决策记录

> 以下设计决策已在方案整合阶段确认拍板，对应内容已融入各章节。此处汇总留档以便后续查阅。

### 第一轮拍板（13 项）

| # | 决策项 | 结论 | 融入章节 |
|---|--------|------|----------|
| 1 | lead.status 与 feedback.action 的关系 | 分开：action 是事件（追加），status 是状态快照（覆盖）。feedback 提交后自动映射更新 status。not_fit → dismissed | §4.1, §7.6 |
| 2 | Worker 完成回传 payload | 固定结构化 JSON（run_info + batch_summary + leads 数组）。Worker 不直接写业务表，云端 API 负责去重和写库 | §6.6 |
| 3 | Company 去重规则 | 优先 website 精确去重，其次 normalized_name + country_region 弱去重。normalized_name 做 lowercase + trim + 去后缀 + 去标点 + 压空格。不做模糊匹配 | §7.5 |
| 4 | Stalled 任务恢复 | 仅管理员可 retry。retry 创建新 job，不覆盖原 stalled job | §6.2 |
| 5 | current_step 枚举 | 固定 7 个枚举值，不允许自由文本。前端做文案映射 | §6.3 |
| 6 | 跨批次重复 company | 同 company 可产生多条 lead（保留不同批次上下文）。前端标注"此前任务中已发现过" | §3.2, §7.6 |
| 7 | Worker 认证 | 固定 WORKER_API_KEY，环境变量配置，Bearer token 传递。Worker 附带 worker_id + worker_name | §8.5 |
| 8 | 多任务并行提交 | 允许用户继续提交。新任务排队，worker 串行处理。前端弱提示 | §3.1, §8.6 |
| 9 | JSONB 使用范围 | 高频字段（品类/地区/客户类型/优先方向）独立列。仅 exclusion_rules/supply_notes/extra_notes 放 JSONB | §7.2 |
| 10 | 草稿能力 | 不做服务端草稿。localStorage 暂存，不要求跨设备同步 | §3.1 |
| 11 | Worker 在线状态 | 由 heartbeat 推导：<90s online / 90~300s degraded / >300s offline | §6.1 |
| 12 | 失败类型分类 | 至少 3 类：temporary_issue / worker_offline / invalid_input。前端根据类型展示不同文案 | §6.2, §7.3 |
| 13 | 线索页筛选 | 首版只做状态 Tab 切换 + 默认推荐度排序。不做多条件筛选器 | §3.2 |

### 第二轮补充（10 项）

| # | 决策项 | 结论 | 融入章节 |
|---|--------|------|----------|
| 14 | contacted 与维护流的关系 | 两层动作模型：第一层（interested/not_fit/contacted）+ 第二层（following/paused/no_interest，仅 contacted 后可用）。contacted 是维护流门槛 | §3.2, §4.1 |
| 15 | jobs 表职责过重 | 拆出 job_result_summaries 表，jobs 只管调度/执行，结果摘要独立存放 | §7.3, §7.4 |
| 16 | country 字段命名统一 | 全部统一为 country_region，不再出现单独的 country | §7.5, §7.6 |
| 17 | 跨批次重复判定规则 | 当前 lead 的 company_id 在其他 discovery_request 下有 ≥1 条 lead 即触发。同 request 内不算 | §3.2 |
| 18 | 发现页最近任务入口 | 表单上方展示最近 1 条任务（摘要/状态/线索数/查看结果） | §3.1 |
| 19 | "完成但低产出"状态 | 新增 result_quality 字段（empty/low_yield/normal），不属于失败，有独立前端文案 | §7.4 |
| 20 | source_summary 结构化 | 双存：source_summary_text（展示）+ source_summary_json（分析）。Worker payload 同时回传 source_breakdown 数组 | §6.6, §7.4 |
| 21 | current_tier × recommended_action 约束 | recommended 可搭配"优先联系/建议联系"；observation 可搭配"继续观察/视情况联系/暂不优先"。不允许 observation 搭配"优先联系" | §18 附录 |
| 22 | disabled 用户行为 | 不能提交新任务/做反馈，但可查看历史（只读） | §9 |
| 23 | 任务历史页上线时序 | 不阻塞首批，但建议紧跟 worker 打通后尽快补上 | §3.3, §14 |

---

## 17. 本文档状态

所有已知设计问题已在两轮确认中全部定义完毕，方案可进入实施阶段。

下一步：按第 14 节上线顺序，从"数据库 + API 基础骨架 + 认证"开始。

---

## 18. 实施速查附录

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

### C. Company 去重优先级

| 优先级 | 条件 | 匹配键 |
|--------|------|--------|
| 1 | website 不为空 | 规范化 website（去协议、去www、去尾斜杠、小写） |
| 2 | website 为空 | normalized_name + country_region |

normalized_name 规则：lowercase → trim → 去后缀(inc/llc/ltd/corp/co/gmbh/sa/srl/pty) → 去标点 → 压空格

### D. current_step 枚举 + 前端文案

| 枚举值 | 前端文案 |
|--------|---------|
| platform_discovery | 平台识别中 |
| direct_company_discovery | 公司候选整理中 |
| candidate_verification | 候选校验中 |
| platform_drilldown | 平台下钻中 |
| extraction | 结果提取中 |
| scoring | 线索评估中 |
| result_packaging | 结果整理中 |

### E. result_quality 枚举 + 前端文案

| 值 | 条件 | 前端文案 |
|----|------|----------|
| empty | recommended + observation = 0 | 本轮处理完成，但暂未得到可用线索。可尝试调整品类、地区或客户类型 |
| low_yield | recommended + observation < 5 | 本轮结果较少，建议调整发现条件以获得更多匹配 |
| normal | 其他 | （正常展示结果） |

### F. failure_type 枚举 + 前端文案

| 类型 | 前端文案 |
|------|----------|
| temporary_issue | 处理过程中出现临时问题，请稍后重试 |
| worker_offline | 处理引擎离线，任务将在恢复后继续 |
| invalid_input | 任务参数有误，请检查后重新提交 |

### G. current_tier × recommended_action 合法组合

| current_tier | 允许的 recommended_action |
|-------------|--------------------------|
| recommended | 优先联系、建议联系 |
| observation | 继续观察、视情况联系、暂不优先 |

**禁止组合：** observation + "优先联系"

### H. "此前任务中已发现过"判定条件

- **触发：** 当前 lead 的 company_id 在**其他** discovery_request_id 下存在 ≥1 条 lead 记录
- **不触发：** 同一 discovery_request 内多条 lead 指向同一 company
- **展示：** 标注提示 + 可展开查看最近 1~3 次历史（任务时间、当时状态、用户反馈）

### I. Worker 心跳状态判定

| 状态 | 条件 |
|------|------|
| online | last_heartbeat_at 距今 < 90 秒 |
| degraded | 90~300 秒 |
| offline | > 300 秒 |

### J. 幂等与状态转换约束

| 当前 job.status | 允许的操作 |
|----------------|-----------|
| queued | start |
| running | progress, complete, fail |
| completed | 重复 complete → 忽略 |
| failed | 仅管理员 retry（创建新 job） |
| stalled | 仅管理员 retry（创建新 job） |

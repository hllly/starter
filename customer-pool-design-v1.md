# 客户池方案 v1

## 1. 目标定义

当前系统已经有两条主链路：

- `客户发现`：提交新任务
- `已发掘客户线索`：查看某一轮任务里产出的线索

下一步需要补上的不是“再多一个结果页”，而是一个**可持续沉淀历史客户资产**的层：

- 让用户看到跨任务累积下来的历史客户池
- 让客户从“一次线索”变成“长期可维护对象”
- 让 `workflow` 深挖能力真正有落点
- 让后续“客户维护 / 自动跟进 / 全网动向追踪 / 深度画像”都有统一入口

一句话定义：

**客户池 = 跨批次沉淀的客户资产层；线索页看本轮，客户池看历史。**

---

## 2. 产品定位

### 2.1 线索页和客户池页的分工

`已发掘客户线索`

- 面向“本轮任务处理”
- 重点是快速判断、标记、推进状态
- 载体是 `lead`

`客户池`

- 面向“长期客户资产管理”
- 重点是历史汇总、画像沉淀、深挖触发、后续维护
- 载体是 `company`

所以客户池不是简单复制线索页，而是：

**用与线索页一致的视觉语言，承载更深的信息密度和更长的时间视角。**

---

## 3. 页面信息架构

### 3.1 顶部导航

保持与当前导航同层级，建议主导航改为：

- `客户发现`
- `已发掘客户线索`
- `客户池`
- `客户维护`（disabled）
- `客户自动跟进`（disabled）
- `客户深度追踪`（disabled）

这里的 `客户池` 与 `已发掘客户线索` 是同级主页面，不是嵌在线索页里。

### 3.2 页面结构

客户池页面建议采用与线索页同一套设计语法：

1. 顶部概览卡
2. Tab / 筛选区
3. 当前视图容器（有场景底色）
4. 客户池卡片列表

---

## 4. 客户池页面设计

## 4.1 顶部概览卡

建议保留 4 张概览卡，语义改成客户资产视角：

- `池内客户`
- `高匹配`
- `已完成画像`
- `待深挖`

样式直接复用线索页：

- 高度 `96px`
- 圆角 `20px`
- 白底 + 浅灰边框
- 数字 `32px`
- 标签 `15px`

## 4.2 Tabs / 筛选语境

建议第一版只做最小但有业务意义的切换：

- `全部`
- `高匹配`
- `待深挖`
- `已完成画像`
- `需跟进`
- `已排除`

说明：

- `高匹配`：来自 buyer_fit / total_score / priority 的综合结果
- `待深挖`：已有客户池记录，但没有完整 profile
- `已完成画像`：已有 `complete` 或 `high/medium quality` profile
- `需跟进`：用户已关注 / 已联系 / 已加入后续维护
- `已排除`：buyer_fit 明确低，或人工标记无效

和线索页一样，tab 下方应有整体场景底色，帮助用户进入不同处理语境。

---

## 5. 客户池卡片设计

## 5.1 设计原则

客户池卡片必须沿用线索页的设计语言：

- 白底独立卡
- 左侧状态色条
- 三层结构
- 一级 / 二级 / 三级字段层级清晰

但信息重点要从“本轮是否值得处理”切换为：

**这个客户是否值得长期经营，以及目前对它已经了解多深。**

## 5.2 一级判断区

卡片头部建议结构：

左侧：

- `匹配等级标签`
- `客户角色标签`
- `root_domain / website`
- `公司名`
- `国家 / 地区`
- `核心品类`

右侧：

- `画像完成度`
- `最新画像状态`
- `最近更新时间`

一级字段建议重点突出：

- `高匹配 / 中匹配 / 低匹配`
- `进口商 / 分销商 / 制造商 / 品牌方 / 混合型`
- `root_domain`
- `公司名`

其中“匹配等级”可以延续线索页的强提醒风格：

- 高匹配：偏红或深强调色，形成视觉锁定
- 中匹配：橙色
- 低匹配：暖灰

## 5.3 二级字段块

客户池卡片的中部建议使用 4 个信息块，延续线索页“有底色的字段块”设计：

### 1. 联系方式

- 邮箱
- 电话
- 联系页
- LinkedIn

### 2. 公司画像

- business_model
- company_role
- founded_year
- employee_range / revenue_range

### 3. 采购 / 合作信号

- buyer_fit
- import_signal
- oem_odm_signal
- private_label_signal
- vendor_onboarding_signal

### 4. 产品与市场

- product_categories
- core_products
- target_markets
- industry_focus

这些字段在 `workflow/company_profile.tsv` 里已有很强基础，不需要从零发明。

## 5.4 第三层操作区

底部操作区建议从左到右：

- 当前池内状态
- 最近来源摘要
- `构建深度画像`
- `查看历史线索`
- `加入维护 / 标记跟进`

其中：

- `构建深度画像` 是主动作
- `查看历史线索` 用来回看它在哪些 discovery task 里出现过
- `加入维护 / 标记跟进` 用于后续客户维护体系

---

## 6. 历史客户池列表的核心视图

客户池页面本质上是一个**历史客户资产列表**，不是简单地从线索表复制一遍。

第一版建议每张客户卡至少展示这些“历史感”信息：

- 首次发现时间
- 最近一次出现时间
- 累计出现次数
- 来源平台数
- 最近一次被哪轮任务命中
- 最近一次人工状态
- 是否已完成深度画像

这些字段里：

- `first_seen_at / last_seen_at / seen_count / source_count` 已经可以参考 `workflow/company_master.tsv`
- “最近命中任务 / 最近人工状态” 则来自当前系统里的 `leads`

所以客户池是**现有 Web 系统数据 + workflow 历史主表**的汇合层。

---

## 7. 与 workflow 的打通方式

## 7.1 目前 workflow 已有能力

从 `/Users/hll/.openclaw/workspace` 可以确认：

### A. 候选客户总表

`company_master.tsv`

已经有适合作为客户池“轻主表”的字段：

- `root_domain`
- `company_name_best`
- `best_entry_url`
- `source_type`
- `source_platform_domain`
- `first_seen_at`
- `last_seen_at`
- `verification_level`
- `total_score`
- `priority`
- `seen_count`
- `source_count`
- `profile_status`
- `profile_quality`
- `email_best`
- `phone_best`
- `country`
- `company_role`
- `business_model`
- `product_categories`
- `buyer_fit`
- `import_signal`
- `oem_odm_signal`

### B. 深度画像详情表

`company_profile.tsv`

已经有适合作为“深度画像详情”的字段：

- `profile_status`
- `profile_quality`
- `profile_run_id`
- `profile_first_built_at`
- `profile_last_updated_at`
- `email_best / email_alt`
- `phone_best / phone_alt`
- `contact_page_url / contact_form_url`
- `linkedin_company_url`
- `country / state_region / city / address_raw`
- `founded_year`
- `business_model`
- `company_role`
- `buyer_fit / buyer_fit_reason`
- `product_categories / core_products / target_markets / industry_focus`
- `import_signal / oem_odm_signal / private_label_signal`
- `vendor_onboarding_signal / moq_sample_signal`
- `procurement_signal_notes`
- `employee_range / revenue_range / facility_signal`
- `certifications`
- `evidence_urls / evidence_notes`

### C. 单公司深挖命令入口

`workflow/company_workflow_controller.py profile "<domain|url|name>"`

这意味着 Web 侧按钮“构建深度画像”可以直接映射到现有能力，不需要先重做 workflow。

---

## 8. 推荐的系统打通方案

## 8.1 总体原则

当前 Web 侧已经是“云端保存 + 后台人工执行”的模式，所以客户池第一版也应该延续这个原则：

- 用户点击 `构建深度画像`
- 云端创建一个 `company_profile_request`
- 管理员在后台领取
- 后台调用 workflow 的 `profile` 命令
- 结果写回 Web 数据库

不要第一版就让 Web 直接远程控制本地 workflow。

## 8.2 建议的数据流

### 流 1：线索沉淀进入客户池

当某轮任务 `published` 后：

1. 结果里每个 `lead` 已经绑定到 `company`
2. 发布时或发布后，系统将该 `company` 同步到 `customer_pool_items`
3. 若已存在，则更新统计与最近命中信息

### 流 2：workflow 历史主表补全客户池

初始化或定时同步时：

1. 读取 `company_master.tsv`
2. 以 `root_domain` 为主键候选，匹配 Web 里的 `company.website`
3. 将 `first_seen_at / last_seen_at / total_score / priority / buyer_fit / profile_status` 等轻字段写入客户池摘要

### 流 3：构建深度画像

1. 用户在客户池卡片点击 `构建深度画像`
2. 创建 `company_profile_requests` 记录，状态 `queued`
3. 后台管理员领取后执行：

```bash
python3 /Users/hll/.openclaw/workspace/workflow/company_workflow_controller.py profile "<domain-or-url-or-name>"
```

4. workflow 输出：
   - run-scoped `company_profile.tsv`
   - workspace-level `company_profile.tsv`
   - `company_profile_updates.tsv`

5. Web 后台读取对应公司 profile 结果并写入数据库
6. 客户池卡片立即变为“画像已更新”

---

## 9. Web 侧建议新增的数据模型

为了保持当前系统轻量，我不建议直接把 workflow 全量 TSV 原样灌进现有 `companies` 表。

推荐新增 3 层：

## 9.1 `customer_pool_items`

客户池主表，面向前端列表查询。

核心字段建议：

- `id`
- `user_id`
- `company_id`
- `pool_status`
- `match_level`
- `pool_score`
- `first_seen_at`
- `last_seen_at`
- `appear_count`
- `source_count`
- `latest_request_id`
- `latest_lead_status`
- `profile_status`
- `profile_quality`
- `profile_last_updated_at`
- `buyer_fit`
- `company_role`
- `business_model`
- `product_categories_summary`
- `contact_email`
- `contact_phone`
- `root_domain`
- `created_at`
- `updated_at`

说明：

- 这是“面向页面渲染的投影表”
- 一条 `company` 可以对应一个或多个用户池内条目；当前单用户阶段可简化为 1:1

## 9.2 `company_profiles`

存储当前最新深度画像。

核心字段建议：

- `id`
- `company_id`
- `root_domain`
- `profile_status`
- `profile_quality`
- `profile_run_id`
- `profile_first_built_at`
- `profile_last_updated_at`
- `email_best`
- `email_alt`
- `phone_best`
- `phone_alt`
- `contact_page_url`
- `contact_form_url`
- `linkedin_company_url`
- `country`
- `state_region`
- `city`
- `address_raw`
- `founded_year`
- `business_model`
- `company_role`
- `buyer_fit`
- `buyer_fit_reason`
- `product_categories`
- `core_products`
- `target_markets`
- `industry_focus`
- `import_signal`
- `oem_odm_signal`
- `private_label_signal`
- `vendor_onboarding_signal`
- `moq_sample_signal`
- `procurement_signal_notes`
- `employee_range`
- `revenue_range`
- `facility_signal`
- `certifications`
- `evidence_urls_json`
- `evidence_notes`
- `pages_visited_count`
- `raw_profile_json`

## 9.3 `company_profile_requests`

用于承接“构建深度画像”动作。

核心字段建议：

- `id`
- `company_id`
- `requested_by`
- `status` (`queued / claimed / running / completed / failed / cancelled`)
- `requested_at`
- `claimed_at`
- `started_at`
- `finished_at`
- `run_id`
- `error_summary`

这样做的好处：

- 保持和当前 job 管理方式一致
- 便于以后单独看“谁申请了画像、什么时候构建、是否失败”

---

## 10. API 设计建议

## 10.1 用户侧

- `GET /api/customer-pool`
  - 列表查询
  - 支持 `tab` / `matchLevel` / `profileStatus` / `keyword`

- `GET /api/customer-pool/:id`
  - 客户池详情页
  - 返回客户基本信息 + 最新画像摘要 + 历史线索列表

- `POST /api/customer-pool/:id/build-profile`
  - 创建深度画像构建请求
  - 不直接执行 workflow，只创建请求

- `GET /api/customer-pool/:id/leads`
  - 查看该客户历史出现在哪些 discovery request 中

## 10.2 管理员侧

- `GET /api/admin/company-profile-requests?status=queued`
- `POST /api/admin/company-profile-requests/:id/claim`
- `POST /api/admin/company-profile-requests/:id/start`
- `POST /api/admin/company-profile-requests/:id/complete`
- `POST /api/admin/company-profile-requests/:id/fail`

这套接口可以直接沿用现有 admin CLI 的模式继续做。

---

## 11. 前端交互建议

## 11.1 客户池列表卡片

按钮建议：

- `构建深度画像`
- `查看历史线索`
- `加入客户维护`（后续）

规则：

- 若无画像：按钮主态为 `构建深度画像`
- 若已有画像：按钮文案改为 `更新深度画像`
- 若当前已有请求在跑：显示 `画像构建中`

## 11.2 客户详情抽屉 / 侧边面板

第一版不一定要独立详情页，可以先做右侧抽屉：

- 画像摘要
- 关键证据
- 联系方式
- 产品与市场
- 历史线索时间线
- 最近深挖结果

这样比直接上独立详情页更轻。

---

## 12. 与 workflow 协同的改进建议

当前 workflow 已经可用，但如果要和 Web 产品更稳地协同，建议做以下改进。

## 12.1 建议新增稳定主键字段

当前最稳定的是 `root_domain`，但 Web 侧 `company.website` 不一定总是严格一致。

建议 workflow 统一保证：

- `root_domain` 一定输出
- 所有 profile / master / updates 都以 `root_domain` 为主键
- URL 类字段单独保留 `best_entry_url`

## 12.2 建议给 profile 输出增加 machine-friendly JSON

现在 `company_profile.tsv` 很适合人读，但 Web 接入更适合同时拿到：

- `company_profile.json`
- 每家公司一条标准 JSON 对象

尤其这些字段适合 JSON 化：

- `product_categories`
- `core_products`
- `target_markets`
- `certifications`
- `evidence_urls`

否则 Web 侧要自己拆分分号字符串。

## 12.3 建议统一枚举

workflow 当前字段值里有：

- `buyer_fit`: `high / medium / low / unclear / unknown`
- `profile_status`: `complete / partial / failed`
- `profile_quality`: `high / medium / low`
- `company_role`: `distributor / importer / manufacturer / retailer / hybrid ...`

建议在 workflow 层定成固定枚举并文档化，避免拼写漂移。

## 12.4 建议增加“摘要层输出”

建议 workflow 在 profile 完成后，多输出一个非常适合前端列表的轻摘要：

- `profile_summary.json`

字段建议：

- `root_domain`
- `company_name`
- `match_level`
- `profile_status`
- `profile_quality`
- `buyer_fit`
- `company_role`
- `business_model`
- `top_contact`
- `top_signal_summary`
- `evidence_count`
- `profile_last_updated_at`

这样 Web 侧客户池列表无需自己从 30+ 字段里重新压缩。

## 12.5 建议增加“构建失败原因分类”

现在 `failed` 只表示失败，不利于前端提示。

建议补充失败原因枚举：

- `site_unreachable`
- `anti_bot_blocked`
- `insufficient_content`
- `ambiguous_company`
- `parse_failed`

这样前端客户池卡片能更明确地告诉用户为什么画像没有建成。

---

## 13. 第一版实施建议

建议按 3 个阶段落地：

### P1. 客户池只读版

- 新增 `客户池` 导航
- 新建 `customer_pool_items`
- 从已发布 leads 和 `company_master.tsv` 同步出客户池列表
- 展示历史客户池卡片
- 支持查看历史线索

### P2. 深度画像打通版

- 新增 `company_profiles`
- 新增 `company_profile_requests`
- 打通按钮 `构建深度画像`
- 后台执行 workflow `profile`
- 结果回写并更新卡片

### P3. 深度运营版

- 客户详情抽屉 / 详情页
- 接入后续 `客户维护`
- 接入 `自动跟进`
- 接入 `全网动向追踪`

---

## 14. 本方案的关键结论

### 14.1 产品层

客户池不是“另一个线索页”，而是：

**把跨任务出现过的公司沉淀成长期客户资产的页面。**

### 14.2 设计层

视觉语言完全继承当前线索页：

- 同样的卡片边界
- 同样的层级结构
- 同样的 tab 场景底色

但展示重点切换为：

- 历史累计
- 深挖完成度
- 采购 / 合作信号
- 可运营性

### 14.3 技术层

`workflow` 已经具备可接入基础：

- `company_master.tsv` 做客户池轻主表
- `company_profile.tsv` 做深度画像详情
- `company_workflow_controller.py profile` 做单公司深挖入口

所以第一版重点不是重做 workflow，而是：

**建立 Web 侧的数据投影层和“构建深度画像请求”机制。**

### 14.4 协同改进层

为了更稳接入，建议 workflow 后续补：

- 稳定主键
- JSON 输出
- 枚举规范
- profile 摘要层
- 失败原因分类

---

## 15. 推荐文档落地名称

建议当前方案保存为：

- `customer-pool-design-v1.md`

后续如果你确认这个方向，再继续拆：

- schema 方案
- API 方案
- 页面低保真
- 分阶段实施计划

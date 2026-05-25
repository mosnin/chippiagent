<p align="center">
  <img src="assets/banner.png" alt="Chippi" width="100%">
</p>

# Chippi

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Proprietary-black?style=for-the-badge" alt="License"></a>
  <a href="crm/"><img src="https://img.shields.io/badge/Web-Next.js%2015-000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15"></a>
  <a href="pyproject.toml"><img src="https://img.shields.io/badge/Agent-Python%203.11-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.11"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/Lang-English-lightgrey?style=for-the-badge" alt="English"></a>
</p>

**面向美国房产经纪人与经纪公司的智能代理操作系统。**

经纪人的客户簿——联系人、线索、交易、看房、房源、申请——就是工作空间。Chippi 是一个自主 AI 代理，在这个工作空间里替经纪人干活:筛选入站线索、起草并发送跟进、安排看房、推进交易、生产营销内容、并把真正需要关注的事浮出来。只在必须由人做决定的地方,才请求确认。

产品就是这个代理。底层那些 CRM 风格的数据——联系人、交易、管道——是基底,不是产品。Chippi 不是一个让经纪人去维护的数据库;它是替经纪人维护数据库的操作员。

---

## 两个入口,一个代理

Chippi 以两种方式运行,二者共享同一份工作空间状态、记忆和工具:

| 入口 | 是什么 |
|------|--------|
| **对话** | 经纪人和 Chippi 对话——通过网页应用,通过 Telegram、Slack、Discord、WhatsApp、Signal,或者 CLI。Chippi 把事干完然后汇报。 |
| **自主** | 工作空间事件(新线索、申请提交、看房结束、交易阶段变更、入站消息)和定时巡检会近实时唤醒 Chippi,无需任何人开口。 |

所有变更动作都需要审批。Chippi 起草;它不会默默发送。

---

## Chippi 能做什么

能力快照——按类别列,非穷举。完整的产品蓝图见 [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) 和 [`crm/ARCHITECTURE.md`](crm/ARCHITECTURE.md)。

<table>
<tr><td><b>线索摄取</b></td><td>带品牌的、可定制的、对话式申请页面。租赁和购房分流。每位经纪人一条可分享的摄取链接。</td></tr>
<tr><td><b>可解释的线索评分</b></td><td>每条线索都有分数、冷/热/温分级,以及一段普通人能读懂的理由。没有"AI 黑魔法"。</td></tr>
<tr><td><b>线索 → 联系人 → 交易管道</b></td><td>作为基底的 CRM,支持自定义阶段。看板视图、拖拽、交易评审。</td></tr>
<tr><td><b>看房</b></td><td>排程、公开预约页、日历同步、确认、提醒、看房后反馈。</td></tr>
<tr><td><b>房源</b></td><td>挂牌房源和可分享的房源资料包。</td></tr>
<tr><td><b>经纪公司层</b></td><td>团队成员、邀请、跨经纪人的线索分发、佣金账本、交易评审、排行榜、审计日志。基于 Stripe 的按席位计费。</td></tr>
<tr><td><b>工作室</b></td><td>AI 图像与视频生成、品牌套件、社交内容编辑器、排期发布。</td></tr>
<tr><td><b>集成</b></td><td>已连接的工具包(Gmail、HubSpot、Slack、Google Calendar)直接变成代理工具。Chippi 也以 MCP 服务器形式对外暴露。</td></tr>
<tr><td><b>通知</b></td><td>邮件(Resend)与短信(Telnyx),覆盖线索、看房、交易、跟进。</td></tr>
<tr><td><b>分析</b></td><td>管道、线索、看房、表单流量、团队业绩。</td></tr>
</table>

---

## 服务对象

- **独立和自雇经纪人** —— Chippi 端到端跑完线索管道。
- **经纪公司** —— 公司老板和管理员监督一队经纪人:线索分发、佣金、交易评审、业绩。
- **仅作为经纪公司管理员的用户** —— 监督团队,不必同时运营个人线索工作空间。

经纪公司层是同一个产品的一部分,不是另一个产品——房地产的操作系统必须同时覆盖经纪人个体和他们所属的公司。

---

## 代码在哪里

这个仓库是一个产品,由两半组成,一起发布:

| 路径 | 里面是什么 |
|------|-----------|
| **`crm/`** | 网页应用和面向经纪人的产品。Next.js 15 (App Router)、React 19、TypeScript、Tailwind、shadcn/ui。Clerk 鉴权、Supabase + pgvector、Resend、Telnyx、Upstash Redis、Stripe 计费。部署在 Vercel。 |
| **仓库根目录** | Python 代理框架——驱动 Chippi 的推理、工具调用、记忆、技能和消息网关的引擎。Fork 自 [Nous Research 的 hermes-agent](https://github.com/NousResearch/hermes-agent),并针对房地产做了适配。 |

网页应用调用代理运行时来处理对话和工具执行;代理运行时通过 CRM 的 API 和工具注册表(`crm/lib/ai-tools/`)反向操作工作空间。同一份记忆。同一套技能。同一个 Chippi。

```
chippiagent/
├── crm/                    # Next.js 网页应用——经纪人的工作空间
│   ├── app/                # App Router 页面和 API 路由
│   ├── components/         # UI 组件
│   ├── lib/                # 业务逻辑、AI 工具、技能、集成
│   ├── agent/              # 网页应用内的代理运行时胶水层
│   └── supabase/           # 数据库 Schema
├── chippi_cli/             # Python CLI 入口
├── agent/                  # 代理循环、工具调用、规划
├── skills/                 # 一方技能(过程记忆)
├── plugins/                # 消息网关、推理服务商、MCP
├── gateway/                # Telegram / Discord / Slack / WhatsApp / Signal
├── chippi                  # CLI 启动器 (./chippi)
└── pyproject.toml          # Python 依赖 (uv)
```

---

## 快速开始

### 网页应用 (`crm/`)

```bash
cd crm
cp .env.example .env.local      # 填入 Supabase、Clerk、OpenAI 密钥
pnpm install
pnpm dev                        # http://localhost:3000
```

数据库:在 Supabase 启用 `vector` 扩展,然后跑 `crm/supabase/schema.sql`。完整环境变量参考见 [`crm/ENVIRONMENT.md`](crm/ENVIRONMENT.md)。

### 代理框架(仓库根目录)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync                         # 创建 .venv,安装依赖
./chippi                        # 自动识别 venv
```

然后:

```bash
./chippi model        # 选择 LLM 提供商
./chippi tools        # 配置启用的工具
./chippi gateway      # 启动消息网关 (Telegram、Discord……)
./chippi doctor       # 诊断问题
```

代理自带 Python 3.11、uv 和 `./chippi` 启动器,不需要你先激活 venv。如果想一次端到端装好(把 `~/.local/bin/chippi` 做成符号链接,安装 `.[all]`),跑 `./setup-chippi.sh`。

---

## 设计原则

下面这些来自 [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md),管所有决策:

1. **新功能应让 Chippi 替用户多做事**——而不是给用户多一个自己得操作的界面。
2. **配置页是最后手段。**"我们加个设置吧"通常意味着代理没干好它该干的事。要么直接定下来,要么教代理学会。
3. **每个 AI 输出都可解释。**没有理由的分数不发版。
4. **代理起草;它绝不默默发送。**所有变更动作都要审批。
5. **保护切入点。**新加入的独立经纪人从注册到拿到上线的摄取链接,只需几分钟,而不是一个配置项目。

---

## 文档

产品和工程文档都在 `crm/` 里面:

| 文档 | 内容 |
|------|------|
| [`crm/PRODUCT_SCOPE.md`](crm/PRODUCT_SCOPE.md) | Chippi 是什么、服务谁、边界在哪 |
| [`crm/ARCHITECTURE.md`](crm/ARCHITECTURE.md) | 系统架构、数据流、代理运行时 |
| [`crm/API_CONTRACTS.md`](crm/API_CONTRACTS.md) | 网页应用的 API 接口 |
| [`crm/STYLESHEET.md`](crm/STYLESHEET.md) | 设计系统——tokens、组件、文案风格 |
| [`crm/ROADMAP.md`](crm/ROADMAP.md) | 正在构建的内容 |
| [`crm/SECURITY.md`](crm/SECURITY.md) | 鉴权、权限、数据隔离 |
| [`crm/ENVIRONMENT.md`](crm/ENVIRONMENT.md) | 所有环境变量 |
| [`crm/AGENTS.md`](crm/AGENTS.md) | 在这里写代码的人(人或 AI)必须遵守的硬规则 |
| [`AGENTS.md`](AGENTS.md) | 代理框架的运行规则 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 开发环境搭建、代码风格、PR 流程 |

---

## 致谢

Chippi 的代理引擎构建于 [Nous Research](https://nousresearch.com) 的 [**hermes-agent**](https://github.com/NousResearch/hermes-agent) 之上——一个出色的开源自进化代理基础(技能系统、记忆、消息网关、工具调用、终端后端)。我们对此心怀感激。

本仓库 fork 了那套框架,把它改名为 Chippi,并针对一件事做了适配:运行面向美国房地产从业者的操作系统。原框架基于 MIT 许可证;详见 [LICENSE](LICENSE)。

---

## 许可证

专有软件。保留所有权利。

Chippi 所依赖的上游 hermes-agent 框架,在其原作者 Nous Research 处依然以 MIT 许可证发布。

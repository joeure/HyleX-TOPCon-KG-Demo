# 评委访问、模型 API 配置与功能操作指南

本文面向比赛评委，说明如何访问 HyleX TOPCon Public Demo，并使用评委自行准备的
OpenAI-compatible 模型 API 体验 Knowledge Universe、Query 和 Document Ingestion。

## 1. 两种访问入口

### 1.1 GitHub Pages 公开预览

访问：

<https://joeure.github.io/HyleX-TOPCon-KG-Demo/>

该地址直接显示完整的三模式 Inspector UI：

- **知识宇宙**：可以浏览 `toy_snapshot_v1` 的 Synthetic Ontology、实体、关系和 Evidence。
- **查询与搜索**：界面和 Provider 配置入口可见；正式后端域名启用前不执行真实模型调用。
- **文档导入**：上传、处理和候选预览界面可见；正式后端域名启用前不上传文件。

页面顶部出现“GitHub Pages 预览模式”提示时，表示当前处于静态预览状态。此状态不会
接收邀请码、API Key 或用户文档，也不会显示虚假的 Query/Ingestion 成功结果。

### 1.2 交互式 Public Demo

正式评审时，组委会或参赛团队会另行提供 HTTPS 交互地址，例如：

```text
https://app-demo.<比赛域名>/
```

只有交互式地址支持注册、登录、模型 API 配置、真实 Query 和文档 Ingestion。请确认
浏览器地址栏使用 `https://`，不要向 HTTP 地址或非官方页面填写 API Key。

推荐使用近期版本的 Chrome、Edge、Safari 或 Firefox。评委电脑不需要安装 Python、
Node.js、Docker、数据库或模型运行环境。

## 2. 注册和登录

1. 从评审联系人处取得一个一次性邀请码。
2. 打开交互式 Public Demo，选择 **Register with invite**。
3. 填写邀请码、用户名和不少于 12 位的密码。
4. 确认该账户和上传内容仅用于本次比赛评审，然后完成注册。
5. 注册成功后自动进入 Inspector；以后可使用同一用户名和密码登录。

邀请码默认只能使用一次，并有有效期。邀请码已使用、过期或被撤销时，请联系评审
联系人重新生成。Public Demo 不提供默认管理员账户，评委账户角色固定为
`public_inspector`，只能访问 Inspector UI。

## 3. 准备模型 API

第一版支持 **OpenAI-compatible HTTPS API**。评委需要自行准备：

| 字段 | 填写内容 | 示例格式 |
|---|---|---|
| Provider type | 选择 `OpenAI-compatible` | 固定选项 |
| Base URL | Provider 官方 API 根地址 | `https://provider.example/v1` |
| Model ID | Provider 文档中给出的模型标识 | `example-chat-model` |
| API Key | 评委自己的临时 API Key | 仅在密码框中填写 |

Provider 必须满足以下条件：

- 使用公开可解析的 HTTPS 域名，默认端口为 443。
- URL 中不能包含用户名、密码或 API Key。
- 不能使用 `localhost`、局域网地址、链路本地地址、云元数据地址或其他保留地址。
- 应提供 OpenAI-compatible 的模型与 Chat Completions 能力；“测试连接”会检查模型
  服务是否可达。
- Provider 的网络、配额、地区访问和模型权限由评委自己的 Provider 账户负责。

API Key 不会写入浏览器 `localStorage`、Cookie、运行数据库、Core/Query Provider Store
或日志。它只保存在当前 Gateway 进程的 Session Vault 中。退出登录、Session 到期、
删除 Provider 或 Gateway 重启后，必须重新填写。

## 4. 使用知识宇宙

1. 进入 **知识宇宙**。
2. 确认页面显示 `toy_snapshot_v1` 和 `synthetic_ontology_v1`。
3. 在 3D/2D 视图中选择 Process、Material、Parameter、Property、Document 或 Evidence。
4. 使用搜索框检索 Toy concept/entity。
5. 选择关系或 Evidence，查看其 synthetic chunk 和来源位置。

这套数据完全虚构，只用于展示：

```text
Synthetic 文档 → Chunks → 示例 Embedding → Ontology → KG → Evidence
```

Public Demo 不读取主系统的真实文档、Ontology、KG、Snapshot 或 Provider。

## 5. 配置 Query Provider 并提问

1. 进入 **查询与搜索**。
2. 点击右上角的 **Provider settings** 齿轮按钮。
3. 选择 **Query** 标签。
4. 填写 Provider type、Base URL、Model ID 和 API Key。
5. 点击 **保存**。保存成功后 API Key 输入框会立即清空。
6. 可点击 **测试连接** 检查 Provider 是否可达。
7. Provider 状态显示为已配置后，在问题框输入问题并执行查询。

Query 只检索 Synthetic Toy Snapshot。回答界面会显示：

- 模型回答；
- Evidence/citation 链接；
- 使用的 Toy Snapshot；
- 检索通道和安全执行信息（如当前回答包含这些字段）。

建议先尝试：

```text
Toy cure temperature 会影响哪个属性？请给出证据。
```

如需替换 API，重新填写并保存即可；点击 **删除当前配置** 会立即删除当前 Session 中的
Query Provider。

## 6. 配置 Extraction Provider 并执行 Ingestion

进入 **文档导入** 后，可使用两种方式准备 Extraction Provider：

1. 在 Extraction Provider 面板中单独填写一套 Provider；或
2. 点击 **使用当前 Query Provider**，在 Gateway 内存中复制当前 Query Provider。

复制操作不会把 API Key 返回浏览器。开始处理前必须确认 Extraction Provider 已配置；
否则系统不会上传文件，也不会创建残留任务。

### 6.1 上传要求

- 文件类型：PDF、Markdown 或 CSV。
- 单文件最大 10 MiB。
- 上传和处理能力受当前演示服务器资源限制；繁忙时任务可能需要等待。

请只上传公开、合成或已获得授权的材料，不要上传商业秘密、个人敏感信息、未公开研究
数据或受限企业文件。

### 6.2 操作流程

1. 配置或复制 Extraction Provider。
2. 选择 PDF、Markdown 或 CSV 文件。
3. 点击 **开始处理**。
4. 等待 Parsing 与 Extraction 完成。
5. 查看 Chunks、Ontology Proposal、KG Delta 和 Evidence Preview。
6. 结果进入 **等待处理** 状态。

公开评委账户只能查看候选结果，不能执行以下操作：

```text
Audit / Ontology Decision / KG Decision / Approve / Reject / Publish / Promote
```

这些操作不仅从界面中移除，Gateway/Core 权限检查也会拒绝直接请求。候选知识不会进入
Toy Snapshot，更不会进入主系统 KG。

## 7. Session、隐私和数据保留

- 登录 Session 默认有效 8 小时。
- Provider 配置仅在当前 Gateway 进程内存中有效。
- 用户 A 不能读取用户 B 的 Document、Batch、Chunk、Candidate、Conversation 或 Evidence。
- 演示环境不作为长期存储使用；界面标示的目标保留期为 24 小时，评委应自行保存所需
  截图或结果，不应依赖服务端长期留存。
- 退出登录前可主动删除 Query/Extraction Provider。
- 不要在截图、录屏、问题文本、文件名或报错反馈中暴露 API Key。

## 8. 常见问题

### 页面提示“GitHub Pages 预览模式”

当前打开的是静态预览地址。请使用评审联系人提供的 HTTPS 交互地址执行登录、Query 和
Ingestion。

### Provider 保存失败

检查 Base URL 是否为官方 HTTPS 地址、是否使用 443 端口、Model ID 是否正确，以及
域名是否解析到公开地址。不要填写控制台网页地址，应填写 Provider 文档指定的 API 根地址。

### 测试连接失败

检查 API Key、模型权限、账户余额、地区/网络限制和 Provider 服务状态。系统会保留有助
于判断原因的 Provider 错误，但会删除 Authorization Header、API Key 和请求正文。

### Query 按钮仍不可用

确认 Query 标签下的 Provider 状态为“已配置”。Extraction Provider 与 Query Provider
相互独立；只配置 Extraction 不会启用 Query。

### Ingestion 无法开始

确认已配置 Extraction Provider，且文件类型和大小符合限制。如果演示服务器繁忙，请稍后再试。

### 刷新或重新登录后 Provider 消失

这是设计行为。Provider Key 不持久化；Session 到期、退出或 Gateway 重启后需重新填写。

## 9. 评审结束

1. 删除 Query 和 Extraction Provider。
2. 退出账号。
3. 如需反馈问题，只提供操作时间、页面、错误信息和匿名资源 ID，不要提供 API Key。
4. 数据/IP 边界参见 [`DATA_AND_IP_NOTICE_CN.md`](DATA_AND_IP_NOTICE_CN.md)。

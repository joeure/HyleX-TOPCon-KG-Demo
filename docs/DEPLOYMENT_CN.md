# Public Demo 部署边界

公开仓库只部署 GitHub Pages 静态展示站点。交互式 Inspector 在独立 VPS 上运行，使用私有 Core、Query、UI Gateway 镜像；这些镜像不上传 GitHub。

## 两个入口

- `https://joeure.github.io/HyleX-TOPCon-KG-Demo/`：项目介绍、截图和只读 Toy Viewer，不处理登录、Cookie、Provider、Query 或文件上传。
- `https://app-demo.<your-domain>/`：后续配置的 VPS 交互应用。没有域名时仅通过 SSH 隧道访问 `127.0.0.1:18512`。

## 公网前置条件

1. VPS 使用 `/opt/hylex-topcon-public`、独立 Compose project、网络、卷和 Secret。
2. Provider 策略文件初始为 `{ "allowed_hosts": [] }`；取得评委 API 域名后原子替换该文件，不需要重新构建二进制。
3. DNS 配置 `demo.<domain>` 指向 `joeure.github.io`，`app-demo.<domain>` 的 A 记录指向 VPS；80/443 只交给 Public Caddy。
4. 先用 loopback 完成无 Provider 和内部 Fake Provider 验收，再开放公网。

## 运行边界

Public Core 使用文件状态和 Synthetic Toy Snapshot，不连接主系统 PostgreSQL、Neo4j、MinIO、MinerU 或卷。Public Gateway 创建邀请码和 `public_inspector` 用户；Provider Key 只在当前会话内存中临时存在。用户只能查看自己的候选文档和 Query 会话，不能 Audit、Approve、Publish 或 Promote。

主栈的清理只允许定向删除 Docker Build Cache；不得运行全局 prune、删除主数据或删除主栈卷。

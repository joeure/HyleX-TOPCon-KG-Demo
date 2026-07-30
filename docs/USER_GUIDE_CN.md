# 用户操作手册

1. 使用评审方提供的 `demo` 用户登录。该用户只允许进入 Inspector UI，不能进入
   Streamlit、设置页、Provider 管理或开发者代理。
2. 在“知识宇宙”查看 synthetic Ontology、实体、关系和当前 Snapshot。点击关系后可
   打开 Evidence，并回到对应的 synthetic chunk。
3. 在“查询与搜索”执行 Toy 检索；需要 LLM 回答时，界面会明确提示运行方先完成
   Provider provision。
4. 在“文档摄取”上传不超过 10 MiB 的 PDF、Markdown 或 CSV。没有 Extraction
   Provider 时只显示配置提示，不返回 502 或伪造成功。
5. Review 页面先处理 Ontology decision，再处理文档 KG decision，最后执行 Publish。
6. 演示结束后可运行 `./scripts/reset-demo.sh` 恢复原始 Toy Snapshot；该命令会删除
   本 Compose 项目的卷，请确认没有要保留的评审数据。

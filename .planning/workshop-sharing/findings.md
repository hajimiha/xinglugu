# Findings: GitHub 创意工坊

## Existing architecture
- 标题页 `StartLayer` 的创意工坊目前把 `TavernHubModal` 包进 `StartModalFrame`，没有独立产品界面。
- GitHub OAuth 已使用 PKCE、加密 HttpOnly Cookie，且只申请 `gist` scope。
- 云存档已有经过验证的 GitHub REST Gist 网关，可复用会话和请求安全边界。
- 世界书、预设、角色立绘都已由 `TavernContext` 暴露读写方法；角色文字与立绘已经分离。
- 仓库当前没有持久化工坊目录服务，也没有额外数据库依赖。

## Recommended architecture
- 资源主体存放在作者公开 Gist，目录采用一个部署配置的公共目录 Gist。
- 发布、更新、撤回、收藏以目录 Gist 结构化评论事件表达；服务端校验评论作者、资源 Gist owner、schema、修订和体积后折叠目录。
- 匿名玩家可浏览和下载；GitHub 登录玩家可发布、更新、撤回与收藏。
- OAuth 继续只申请 `gist`，不扩大到 `public_repo`。
- 安装在客户端执行预览与事务：世界书/预设创建独立本地 ID，立绘组只更新匹配角色的 portraitSlots。

## Image finding
- `4718.jpg` 的灰白棋盘格是真实像素，不是 Alpha。
- 角色白色服装与棋盘颜色相近，不能简单按颜色全局删除；应只删除从图像边缘连通、符合棋盘周期和低饱和灰白簇的区域。


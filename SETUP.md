# 运行与提交（最少步骤）

作业原文保留在 [README.md](README.md)，边界规则见 [FAQ.md](FAQ.md)。本项目只实现后端 API，没有前端。

## 1. MongoDB Atlas

1. 在 Atlas 创建免费集群、一个数据库用户；在 Network Access 添加作业要求的 **Allow access from anywhere**。
2. 在 **Connect → Drivers** 复制 `mongodb+srv://...` 连接串，填写数据库用户名、密码和数据库名（例如 `mp3`）。密码含特殊字符时需要 URL 编码。
3. 本地需要运行时，将连接串放进 `.env` 的 `MONGODB_URI`。不要把密码发到聊天中或提交 GitHub。

```bash
nvm install 24
nvm use 24
npm ci
cp .env.example .env  # 只在第一次创建；已有 .env 时不要覆盖
# 编辑 .env，填写 MONGODB_URI
npm start
```

访问 `http://localhost:3000/api`，正常返回 `message` 和 `data`。`npm run dev` 使用 Node 内置热重载。

## 2. Render

先将完成的代码推送到自己的公开 GitHub 仓库，然后在 Render 创建 **Web Service**，连接该仓库：

| 设置 | 值 |
|---|---|
| Runtime | Node |
| Branch | main |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | Free |
| 环境变量 `NODE_VERSION` | `24` |
| 环境变量 `MONGODB_URI` | Atlas 的完整连接串 |

仓库也提供 `render.yaml`，可以通过 Render Blueprint 导入相同设置。部署后访问 `https://你的服务.onrender.com/api` 和 `/api/users`。数据库使用事务，因此要连接 Atlas，不能使用不支持事务的本地单机 MongoDB。

## 3. 自测与正式提交

正式提交由你本人完成；助手只协助代码、部署和自测，不再访问、填写或提交表单。

1. 把 `submit.js` 第一处 `API_URL` 改成 Render **根地址**，不要带 `/api`；保持 `AUTOGRADER_URL` 不变。
2. 使用 Node 24 运行 `npm run submit`。如果服务休眠，先打开 `/api` 等待响应，再重试。
3. 提交前保留公开仓库和在线服务，检查 `.env` 没有被 Git 跟踪。
4. 在 [正式表单](https://forms.gle/4V1v2VWU78XwM3H57) 填写自己的信息、仓库及部署地址，并回答 LLM 使用问卷。**自测不会代替正式提交。**表单需要登录，具体字段以登录后显示的表单为准。
5. 按课程要求附上真实的 AI 聊天记录（见 `docs/CHATLOG.md`），参考来源和使用说明见 `docs/SOURCES.md`。如果后续继续用 AI 修改代码，请同时补充新的聊天记录。

截止：**2026-11-03 11:59 PM CT**。不要求视频或指定数量的预填数据。

## 本地回归测试

```bash
npm ci
npm test
```

测试启动临时的真实 MongoDB 副本集，再通过 HTTP 测试 API；首次运行会下载 MongoDB 测试二进制，需要联网。不读取或修改你的 Atlas 数据。生产部署不安装这个测试依赖。

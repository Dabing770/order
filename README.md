# 餐厅点单网页

这是一个纯 HTML/CSS/JavaScript 前端，加 Node.js 后端发送 Telegram 订单的点单网页。

## 本地运行

1. 在 Telegram 里打开你的 bot，发送 `/start`。
2. 复制 `.env.example` 为 `.env`，填写：

```env
TELEGRAM_BOT_TOKEN=你的bot_token
TELEGRAM_CHAT_ID=你的chat_id
HOST=127.0.0.1
PORT=3000
```

3. 如果不知道 `chat_id`，先只填写 `TELEGRAM_BOT_TOKEN`，然后运行：

```powershell
npm run chat-id
```

4. 启动：

```powershell
npm start
```

5. 打开：

```text
http://127.0.0.1:3000/index.html
```

## 部署成公网网页

需要部署整个 Node.js 项目，而不是只上传 `index.html`。否则 Telegram token 会暴露在前端。

推荐用支持 Node.js Web Service 的平台，例如 Railway、Render、Fly.io、VPS 等。

部署时在平台后台设置这些环境变量：

```env
TELEGRAM_BOT_TOKEN=你的bot_token
TELEGRAM_CHAT_ID=你的chat_id
```

不要把真实 `.env` 上传到 GitHub。

启动命令：

```bash
npm start
```

服务会读取平台提供的 `PORT`，并默认监听 `0.0.0.0`，适合公网部署。

## GitHub Pages 前端 + 外部后端

GitHub Pages 只能托管静态前端，不能运行 `server.js`，所以 `/api/send-order` 会失败。

如果一定要用 GitHub Pages：

1. 先把这个项目的后端部署到 Render/Railway，拿到后端公网地址。
2. 在部署平台设置环境变量：

```env
TELEGRAM_BOT_TOKEN=你的bot_token
TELEGRAM_CHAT_ID=你的chat_id
ALLOWED_ORIGIN=https://你的github用户名.github.io
```

3. 打开 `index.html`，把 `API_BASE_URL` 改成后端公网地址：

```js
const API_BASE_URL = "https://your-menu-backend.onrender.com";
```

如果前端和后端部署在同一个 Node 服务上，`API_BASE_URL` 保持空字符串。

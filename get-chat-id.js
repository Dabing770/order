const fs = require("node:fs");
const path = require("node:path");

loadEnvFile();

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error("请先设置 TELEGRAM_BOT_TOKEN。");
    process.exitCode = 1;
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    console.error(data.description || `Telegram API HTTP ${response.status}`);
    process.exitCode = 1;
    return;
  }

  const chats = new Map();
  for (const update of data.result || []) {
    const chat = update.message?.chat || update.channel_post?.chat || update.my_chat_member?.chat;
    if (!chat) continue;
    chats.set(chat.id, chat);
  }

  if (chats.size === 0) {
    console.log("没有找到 chat_id。请先在 Telegram 里打开你的 bot，并发送 /start，然后再运行本脚本。");
    return;
  }

  console.log("找到以下 chat_id：");
  for (const chat of chats.values()) {
    const name = [chat.first_name, chat.last_name, chat.title, chat.username && `@${chat.username}`]
      .filter(Boolean)
      .join(" ");
    console.log(`${chat.id} ${chat.type}${name ? ` ${name}` : ""}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

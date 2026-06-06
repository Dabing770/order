const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_SIZE = 1024 * 1024;

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
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

function getCorsHeaders(request) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  const requestOrigin = request.headers.origin;
  let origin = "*";

  if (allowedOrigin !== "*") {
    const allowedOrigins = allowedOrigin.split(",").map((value) => value.trim()).filter(Boolean);
    origin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function sendJson(response, statusCode, data, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(requestedPath)));

  if (!filePath.startsWith(ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        request.destroy();
        reject(new Error("Pyyntö on liian suuri."));
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("Pyynnön JSON-muoto on virheellinen."));
      }
    });

    request.on("error", () => {
      reject(new Error("Pyynnön lukeminen epäonnistui."));
    });
  });
}

function validateOrderPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Tilaus ei voi olla tyhjä.";
  }

  if (!payload.order || typeof payload.order !== "object") {
    return "Tilauksen tiedot puuttuvat.";
  }

  const { customer, items, total } = payload.order;
  if (!customer?.name || !customer?.phone || !customer?.location) {
    return "Asiakkaan nimi, puhelin tai pöytä/osoite puuttuu.";
  }

  if (!Array.isArray(items) || items.length === 0) {
    return "Tilauksessa pitää olla vähintään yksi annos.";
  }

  if (!Number.isFinite(Number(total))) {
    return "Tilauksen yhteissumma on virheellinen.";
  }

  if (!payload.message || typeof payload.message !== "string") {
    return "Telegram-viestin sisältö puuttuu.";
  }

  return "";
}

function clampTelegramMessage(message) {
  const trimmed = message.trim();
  if (trimmed.length <= 3900) return trimmed;

  return `${trimmed.slice(0, 3900)}\n\nTilaus oli liian pitkä ja sitä lyhennettiin.`;
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Palvelimelta puuttuu TELEGRAM_BOT_TOKEN tai TELEGRAM_CHAT_ID.");
  }

  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const telegramResponse = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: clampTelegramMessage(text),
      disable_web_page_preview: true
    })
  });

  const data = await telegramResponse.json().catch(() => ({}));
  if (!telegramResponse.ok || !data.ok) {
    const description = data.description || `Telegram API HTTP ${telegramResponse.status}`;
    throw new Error(description);
  }

  return data.result;
}

async function handleSendOrder(request, response, corsHeaders) {
  try {
    const payload = await readJsonBody(request);
    const validationError = validateOrderPayload(payload);

    if (validationError) {
      sendJson(response, 400, { ok: false, error: validationError }, corsHeaders);
      return;
    }

    const result = await sendTelegramMessage(payload.message);
    sendJson(response, 200, {
      ok: true,
      message: "Tilaus lähetetty.",
      telegramMessageId: result.message_id
      
    }, corsHeaders);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error.message || "Telegram-lähetys epäonnistui."
    }, corsHeaders);
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const corsHeaders = getCorsHeaders(request);

  if (requestUrl.pathname.startsWith("/api/") && request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
    }, corsHeaders);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/send-order") {
    handleSendOrder(request, response, corsHeaders);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  sendText(response, 405, "Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Restaurant ordering server running at http://${HOST}:${PORT}`);
  console.log(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
      ? "Telegram sending is configured."
      : "Telegram sending is not configured yet. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
  );
});

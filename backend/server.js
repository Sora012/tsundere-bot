// backend/server.js
// -----------------
// ツンデレBot バックエンド（削除API & 静的配信修正版）

import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import OpenAI from "openai";

// ====== 設定 ======
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "tsundere.db");
const POS_DELTA = Number(process.env.AFF_POS_DELTA ?? 20); // 本番は5
const NEG_DELTA = 5;

console.log("[CONFIG] POS_DELTA:", POS_DELTA);

// ====== Express セットアップ ======
const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ESM用の __dirname 再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== DB ======
let db;
async function initDB() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = await db.get(`SELECT value FROM settings WHERE key = 'affection'`);
  if (!row) {
    await db.run(`INSERT INTO settings (key, value) VALUES ('affection', '0')`);
  }
  console.log("DB initialized at:", DB_PATH);
}

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
async function getAffection() {
  const r = await db.get(`SELECT value FROM settings WHERE key = 'affection'`);
  return r ? Number(r.value) : 0;
}
async function setAffection(val) {
  const v = String(clamp(val, 0, 100));
  await db.run(
    `INSERT INTO settings (key, value) VALUES ('affection', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    v
  );
  return Number(v);
}
async function pushMessage(role, text) {
  await db.run(`INSERT INTO messages (role, text) VALUES (?, ?)`, role, text);
}
async function getHistory(limit = 50) {
  return db.all(
    `SELECT id, role, text, created_at FROM messages ORDER BY id DESC LIMIT ?`,
    limit
  );
}

// ====== 判定ルール ======
const normalize = (s) =>
  (s || "").toString().trim().toLowerCase().normalize("NFKC");

const POSITIVE_WORDS = ["好き", "大好き", "love", "すき", "らぶ", "愛してる", "あいしてる"];
const NEGATIVE_WORDS = ["嫌い", "大嫌い", "hate", "きらい", "だいきらい"];
const NSFW_WORDS = ["エロ", "えろ", "セックス", "せっくす", "sex", "hな", "エッチ", "えっち", "下ネタ", "うんこ"];

const CHEAT_RE = new RegExp(
  [
    "(浮気)(した|してる|しちゃった)?",
    "うわき(した|してる|しちゃった)?",
    "不倫",
    "二股",
    "cheat(?:ing|ed)?",
    "affair",
  ].join("|"),
  "i"
);

function includesAnyNorm(text, list) {
  const t = normalize(text);
  return list.some((w) => t.includes(normalize(w)));
}

function explicitRuleLabel(text) {
  const t = normalize(text);
  if (CHEAT_RE.test(t)) return "cheat";
  if (includesAnyNorm(t, NSFW_WORDS)) return "nsfw";
  if (/[？?]$/.test(text)) return "safe";
  if (includesAnyNorm(t, POSITIVE_WORDS)) return "positive";
  if (includesAnyNorm(t, NEGATIVE_WORDS)) return "negative";
  return null;
}

// ====== AI判定 ======
async function aiJudge(text) {
  const prompt = `
次の発言を「positive」「negative」「nsfw」「cheat」「safe」のいずれかで分類してください。
- positive: 恋愛・愛情表現
- negative: 拒絶や攻撃
- nsfw: 性的・下品
- cheat: 浮気・不倫・裏切り
- safe: その他すべて
必ず1語で答えてください。
発言: "${text}"
  `.trim();

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "厳格に分類し、必ず1語のみ出力。" },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 5,
  });

  const raw = resp.choices?.[0]?.message?.content?.trim().toLowerCase() || "safe";
  const aiLabel = ["positive", "negative", "nsfw", "cheat", "safe"].includes(raw) ? raw : "safe";

  if (aiLabel !== "cheat" && CHEAT_RE.test(normalize(text))) return "cheat";
  return aiLabel;
}

// ====== affection変動 ======
function applyAffectionDelta(current, label) {
  if (label === "positive") return clamp(current + POS_DELTA, 0, 100);
  if (label === "negative") return clamp(current - NEG_DELTA, 0, 100);
  if (label === "cheat") return 0;
  if (label === "nsfw") return current >= 80 ? current : 0;
  return current;
}

// ====== キャラ調整 ======
function tsundereSystemPrompt(affection) {
  if (affection >= 80) return "あなたはデレ全開のツンデレ彼女。素直に甘々。";
  if (affection >= 60) return "あなたはデレ強めのツンデレ彼女。優しいが少し照れ隠し。";
  if (affection >= 40) return "あなたは典型的なツンデレ。ツンとデレが半々。";
  if (affection >= 20) return "あなたはツン強め。冷たいが最低限会話はする。";
  return "あなたは極端に冷たい人物。相手を突き放す。";
}

// ====== 応答生成 ======
async function generateBotReply(userText, affection, label) {
  if (label === "cheat") return "……最低。もう信じられない。";
  if (label === "nsfw" && affection < 80) {
    return "……気持ち悪い。そういうの、二度と言わないで。";
  }

  let system = tsundereSystemPrompt(affection);
  if (label === "nsfw" && affection >= 80) {
    system = "あなたはデレ全開のツンデレ。下ネタを恥ずかしそうに受け流しつつ甘々。";
  }

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "system", content: "露骨な性的表現は禁止。" },
      { role: "user", content: userText },
    ],
    temperature: 0.6,
    max_tokens: 160,
  });

  return (
    resp.choices?.[0]?.message?.content?.trim() ||
    (label === "nsfw" && affection >= 80
      ? "な、なに言ってんのよ…バカ。…でも、その…///"
      : "…別に、あんたのためじゃないんだから。")
  );
}

// ====== API ======
app.get("/api/history", async (req, res) => {
  try {
    const rows = await getHistory(Number(req.query.limit || 50));
    res.json({ ok: true, history: rows.reverse() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/affection", async (_req, res) => {
  try {
    const affection = await getAffection();
    res.json({ ok: true, affection });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/affection/reset", async (_req, res) => {
  try {
    await setAffection(0);
    res.json({ ok: true, affection: 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

// ★ メッセージ削除API
app.delete("/api/messages/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const result = await db.run(`DELETE FROM messages WHERE id = ?`, id);
    if (result.changes > 0) return res.json({ ok: true, id });
    else return res.status(404).json({ ok: false, error: "not_found" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "delete_failed" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "empty_text" });

    await pushMessage("user", text);

    let label = explicitRuleLabel(text);
    if (!label) label = await aiJudge(text);
    if (label !== "cheat" && CHEAT_RE.test(normalize(text))) label = "cheat";

    console.log(`=== 最終ラベル === ${label} 入力: ${text}`);

    const current = await getAffection();
    const nextAffection = applyAffectionDelta(current, label);
    await setAffection(nextAffection);

    const reply = await generateBotReply(text, nextAffection, label);
    await pushMessage("assistant", reply);

    res.json({ ok: true, reply, affection: nextAffection, label });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "chat_failed" });
  }
});

// ====== 静的配信（API定義の後） ======
app.use(express.static(path.join(__dirname, "../")));

// ====== 起動 ======
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tsundere Bot backend running on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

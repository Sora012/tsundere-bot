import { Router } from "express";
import { replyTsundere } from "../openai.js";
import db from "../db.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { userText, conversationId = "default" } = req.body || {};
    if (!userText) return res.status(400).json({ error: "userText required" });

    // ユーザー発話を保存
    db.prepare(
      `INSERT INTO messages(conversation_id, role, content)
       VALUES(?,?,?)`
    ).run(conversationId, "user", userText);

    // AI 返答を生成
    const ai = await replyTsundere(userText, { affinity: 0 });

    // アシスタント発話を保存
    db.prepare(
      `INSERT INTO messages(conversation_id, role, content, mood)
       VALUES(?,?,?,?)`
    ).run(conversationId, "assistant", ai.content, ai.mood);

    res.json({ assistant: ai });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

export default router;


import express from "express";
import db from "./db.js";

const router = express.Router();
const isValidMood = (m) => ["tsun","dere","neutral"].includes(m);

const getMessageById = (id) => {
  const stmt = db.prepare(`
    SELECT id, conversation_id, role, content, mood, created_at, edited_at, deleted_at
    FROM messages
    WHERE id = ? AND deleted_at IS NULL
  `);
  return stmt.get(id);
};

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { content, mood } = req.body ?? {};
  const target = getMessageById(id);
  if (!target) return res.status(404).json({ error: "not_found" });

  const updates = {};
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) return res.status(400).json({ error: "empty_content" });
    updates.content = trimmed;
  }
  if (typeof mood === "string") {
    if (!isValidMood(mood)) return res.status(400).json({ error: "invalid_mood" });
    updates.mood = mood;
  }
  if (!("content" in updates) && !("mood" in updates)) {
    return res.status(400).json({ error: "no_fields_to_update" });
  }

  const fields = [];
  const params = [];
  if ("content" in updates) { fields.push("content = ?"); params.push(updates.content); }
  if ("mood" in updates)    { fields.push("mood = ?");    params.push(updates.mood);    }
  fields.push("edited_at = CURRENT_TIMESTAMP");
  params.push(id);

  const sql = `UPDATE messages SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`;
  const info = db.prepare(sql).run(...params);
  if (info.changes === 0) return res.status(409).json({ error: "update_conflict" });

  const updated = getMessageById(id);
  return res.json(updated);
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const target = getMessageById(id);
  if (!target) return res.status(404).json({ error: "not_found" });

  const info = db.prepare(`UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).run(id);
  if (info.changes === 0) return res.status(409).json({ error: "delete_conflict" });

  return res.json({ ok: true, id });
});

export default router;

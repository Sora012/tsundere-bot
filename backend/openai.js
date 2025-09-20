import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function replyTsundere(prompt, opts = {}) {
  const { affinity = 0 } = opts;
  const sys = `あなたはツンデレキャラ。短く答える。ときどき優しい。本音は優しい。
好感度=${affinity}。0未満→ツン寄り、50以上→デレ寄り。
返答の末尾に "#mood:tsun|dere|neutral" のどれかを必ず付ける。`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.9,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt }
    ]
  });

  const text = res.choices?.[0]?.message?.content?.trim() ?? "…べ、別に。#mood:neutral";
  const m = text.match(/#mood:(tsun|dere|neutral)/i);
  const mood = m ? m[1].toLowerCase() : "neutral";
  const content = text.replace(/#mood:(tsun|dere|neutral)/i, "").trim();
  return { content, mood };
}

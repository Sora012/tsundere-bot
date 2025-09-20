// frontend/main.js
// 元のUI構造（.line + .avatar + .bubble / 下に .actions）を維持。
// ・履歴表示（左=bot, 右=user）
// ・編集/削除：user と assistant の両方で有効化（動作は同じ：編集=入力欄へコピー、削除=DBから消去）
// ・👤/🤖ボタンでアイコン変更（localStorage保存）
// ・好感度バッジ更新、並び替え、再読込

// ===== refs =====
const chatList   = document.getElementById("chatList");
const chatForm   = document.getElementById("chatForm");
const inputText  = document.getElementById("inputText");
const affBadge   = document.getElementById("affBadge");
const reloadBtn  = document.getElementById("reloadBtn");
const sortBtn    = document.getElementById("sortBtn");
const chatScroll = document.getElementById("chatScroll");

// アイコン変更ボタン
const setUserIconBtn = document.getElementById("setUserIconBtn");
const setBotIconBtn  = document.getElementById("setBotIconBtn");
const userIconInput  = document.getElementById("userIconInput");
const botIconInput   = document.getElementById("botIconInput");

// ===== state =====
let sortAsc = true;       // true=古→新
let historyCache = [];

// ===== utils =====
function updateAffBadge(val) {
  affBadge.textContent = `❤ ${val}`;
  affBadge.setAttribute("data-affection", String(val));
}
function escapeHtml(s) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function safeJSON(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text().then(t => { try { return JSON.parse(t); } catch { return { ok:false, raw:t }; } });
}

// 既定アイコン（固定パス）
const USER_ICON_DEFAULT = "./frontend/icons/user.png";
const BOT_ICON_DEFAULT  = "./frontend/icons/bot.png";

// 現在のアイコンURL（localStorage 優先）
function getCurrentIcon(kind) {
  const key = kind === "user" ? "userIcon" : "botIcon";
  return localStorage.getItem(key) || (kind === "user" ? USER_ICON_DEFAULT : BOT_ICON_DEFAULT);
}

// ファイル→DataURL（最大160pxに縮小して保存）
function fileToDataURL(file, max = 160) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read_fail"));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = img.width, h = img.height;
        const scale = Math.min(1, max / Math.max(w, h));
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        resolve(canvas.toDataURL("image/png", 0.9));
      };
      img.onerror = () => reject(new Error("img_fail"));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ===== view（元レイアウトを厳守） =====
function liTpl(msg) {
  const isUser    = msg.role === "user";
  const roleClass = isUser ? "me" : "bot";
  const text      = escapeHtml(msg.text);
  const iconUrl   = isUser ? getCurrentIcon("user") : getCurrentIcon("bot");

  return `
    <li class="msg ${roleClass}" data-id="${msg.id}" data-role="${msg.role}">
      <div class="line">
        ${isUser ? "" : `<div class="avatar left"  style="--icon: url('${iconUrl}')"></div>`}
        <div class="bubble">
          <div class="content">${text.replace(/\n/g, "<br>")}</div>
        </div>
        ${isUser ? `<div class="avatar right" style="--icon: url('${iconUrl}')"></div>` : ""}
      </div>
      <div class="actions">
        <!-- ここを変更：assistant側にもボタンを表示 -->
        <button class="btn-ghost btn-edit" type="button"
                data-id="${msg.id}" data-text="${escapeHtml(msg.text)}">編集</button>
        <button class="btn-ghost btn-del"  type="button"
                data-id="${msg.id}">削除</button>
      </div>
    </li>
  `;
}

// ===== fetchers =====
async function fetchHistory() {
  const res  = await fetch(`/api/history?limit=200`, { cache: "no-store" });
  const data = await res.json().catch(() => ({ ok:false }));
  if (!data.ok) throw new Error("failed_to_get_history");
  historyCache = data.history || [];
  renderHistory();
}
async function fetchAffection() {
  const res  = await fetch(`/api/affection`, { cache: "no-store" });
  const data = await res.json().catch(() => ({ ok:false, affection:0 }));
  if (data.ok && typeof data.affection === "number") updateAffBadge(data.affection);
}

// ===== rendering =====
function renderHistory() {
  const arr = [...historyCache];
  arr.sort((a, b) => (sortAsc ? a.id - b.id : b.id - a.id));
  chatList.innerHTML = arr.map(liTpl).join("");
  if (sortAsc) {
    requestAnimationFrame(() => {
      if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
    });
  }
}

// ===== events =====
// 送信
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputText.value.trim();
  if (!text) return;

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;

  try {
    const r = await fetch(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await safeJSON(r);

    if (!r.ok || !data.ok) {
      console.error("chat failed:", data);
      alert("送信に失敗しました");
      return;
    }

    await fetchHistory();
    if (typeof data.affection === "number") updateAffBadge(data.affection);
    inputText.value = "";
  } catch (err) {
    console.error(err);
    alert("送信エラー");
  } finally {
    sendBtn.disabled = false;
    inputText.focus();
  }
});

// 編集/削除（※ 役割に関係なく有効）
chatList.addEventListener("click", async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  // 編集：本文を入力欄へコピー
  if (t.classList.contains("btn-edit")) {
    const text = t.getAttribute("data-text") || "";
    inputText.value = text;
    inputText.focus();
    inputText.setSelectionRange(text.length, text.length);
    return;
  }

  // 削除：DELETE /api/messages/:id（user/assistant問わず）
  if (t.classList.contains("btn-del")) {
    const id = t.getAttribute("data-id");
    if (!id) return;

    if (!confirm(`メッセージ #${id} を削除します。よろしいですか？`)) return;

    try {
      const r = await fetch(`/api/messages/${id}`, { method: "DELETE" });
      const data = await safeJSON(r);
      if (!r.ok || data?.ok !== true) {
        console.error("delete failed:", data);
        alert(`削除に失敗しました (${data?.error || r.status})`);
        return;
      }
      historyCache = historyCache.filter((m) => String(m.id) !== String(id));
      renderHistory();
    } catch (err) {
      console.error(err);
      alert("削除エラー");
    }
  }
});

// アイコン変更（👤 / 🤖）
if (setUserIconBtn && userIconInput) {
  setUserIconBtn.addEventListener("click", () => userIconInput.click());
  userIconInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file, 160);
      localStorage.setItem("userIcon", dataUrl);
      renderHistory();
    } catch (err) {
      console.error(err);
      alert("アイコンの読み込みに失敗しました");
    } finally {
      userIconInput.value = "";
    }
  });
}
if (setBotIconBtn && botIconInput) {
  setBotIconBtn.addEventListener("click", () => botIconInput.click());
  botIconInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file, 160);
      localStorage.setItem("botIcon", dataUrl);
      renderHistory();
    } catch (err) {
      console.error(err);
      alert("アイコンの読み込みに失敗しました");
    } finally {
      botIconInput.value = "";
    }
  });
}

// 並び替え / 再読込
sortBtn?.addEventListener("click", () => {
  sortAsc = !sortAsc;
  renderHistory();
});
reloadBtn?.addEventListener("click", async () => {
  await fetchHistory();
  await fetchAffection();
});

// ===== init =====
(async function init() {
  await fetchHistory();
  await fetchAffection();
})();

// Kids Bank on Render
// Single file Express app with Postgres
// Usage
// 1. Set DATABASE_URL env var from Render Postgres
// 2. Optional ADMIN_PASSWORD to protect write actions
// 3. Start with: node server.js

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ""; // empty means no auth

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      child TEXT NOT NULL CHECK (child IN ('hana', 'nour')),
      amount NUMERIC NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab { padding: 8px 12px; border: 1px solid #ccc; border-radius: 8px; text-decoration: none; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
    input, select, button, textarea { padding: 8px; border: 1px solid #ccc; border-radius: 8px; width: 100%; box-sizing: border-box; }
    form { display: grid; gap: 8px; max-width: 420px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .muted { color: #666; font-size: 14px; }
    .success { color: #0a0; }
    .error { color: #a00; }
    .pill { padding: 2px 8px; border-radius: 999px; background: #f2f2f2; font-size: 12px; }
    .flex { display: flex; align-items: center; gap: 8px; }
    .right { text-align: right; }
    .nowrap { white-space: nowrap; }
    .center { text-align: center; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function money(n) { return Number(n).toFixed(2); }

async function getBalance(child) {
  const res = await pool.query("SELECT COALESCE(SUM(amount),0) AS balance FROM transactions WHERE child = $1", [child]);
  return res.rows[0].balance;
}

async function getTransactions(child) {
  const res = await pool.query(
    "SELECT id, child, amount, reason, created_at FROM transactions WHERE child = $1 ORDER BY created_at DESC, id DESC",
    [child]
  );
  return res.rows;
}

// Admin dashboard at root: shows both balances and a form to add or subtract
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    const [hanaBal, nourBal] = await Promise.all([getBalance("hana"), getBalance("nour")]);
    const body = `
      <div class="tabs">
        <a class="tab" href="/bank/hana">Hana statement</a>
        <a class="tab" href="/bank/nour">Nour statement</a>
      </div>

      <div class="card">
        <h2>Balances</h2>
        <div class="row">
          <div><strong>Hana</strong><div class="pill">EGP</div></div>
          <div class="right"><strong>${money(hanaBal)}</strong></div>
        </div>
        <div class="row">
          <div><strong>Nour</strong><div class="pill">EGP</div></div>
          <div class="right"><strong>${money(nourBal)}</strong></div>
        </div>
      </div>

      <div class="card">
        <h2>Add transaction</h2>
        <form id="txForm">
          <label>Child
            <select name="child" required>
              <option value="hana">Hana</option>
              <option value="nour">Nour</option>
            </select>
          </label>
          <div class="row">
            <label>Amount
              <input type="number" step="0.01" name="amount" placeholder="Positive for add, negative for subtract" required>
            </label>
            <label class="${ADMIN_PASSWORD ? '' : 'muted'}">Admin password ${ADMIN_PASSWORD ? '' : '(not set)'} 
              <input type="password" name="password" ${ADMIN_PASSWORD ? 'required' : ''} placeholder="${ADMIN_PASSWORD ? 'Enter password' : 'Optional'}">
            </label>
          </div>
          <label>Reason <textarea name="reason" placeholder="Gift, chores, purchase, etc" rows="2"></textarea></label>
          <button type="submit">Save</button>
          <div id="msg" class="muted"></div>
        </form>
      </div>

      <script>
      const form = document.getElementById("txForm");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        try {
          const r = await fetch("/tx", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(data) });
          const j = await r.json();
          const msg = document.getElementById("msg");
          if (r.ok) {
            msg.textContent = "Saved";
            msg.className = "success";
            setTimeout(() => location.reload(), 700);
          } else {
            msg.textContent = j.error || "Error";
            msg.className = "error";
          }
        } catch (err) {
          document.getElementById("msg").textContent = "Network error";
        }
      });
      </script>
    `;
    res.send(htmlPage("Kids Bank admin", body));
  } catch (e) {
    res.status(500).send("Server error");
  }
});

// Public statement page for a child
app.get("/bank/:child", async (req, res) => {
  const child = req.params.child;
  if (!["hana", "nour"].includes(child)) return res.status(404).send("Not found");
  try {
    const [balance, txs] = await Promise.all([getBalance(child), getTransactions(child)]);
    const rows = txs.map(t => `
      <tr>
        <td class="nowrap">${new Date(t.created_at).toLocaleString()}</td>
        <td class="right">${money(t.amount)}</td>
        <td>${t.reason ? t.reason.replace(/</g, "&lt;") : ""}</td>
      </tr>
    `).join("");
    const body = `
      <div class="tabs">
        <a class="tab" href="/">Admin</a>
        <a class="tab" href="/bank/hana">${child === "hana" ? "• " : ""}Hana</a>
        <a class="tab" href="/bank/nour">${child === "nour" ? "• " : ""}Nour</a>
      </div>

      <div class="card">
        <h2>${child[0].toUpperCase() + child.slice(1)} balance</h2>
        <p class="center" style="font-size: 28px"><strong>${money(balance)} EGP</strong></p>
      </div>

      <div class="card">
        <h3>Statement</h3>
        <table>
          <thead><tr><th>Date</th><th class="right">Amount</th><th>Reason</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="3" class="center muted">No transactions yet</td></tr>'}</tbody>
        </table>
      </div>
    `;
    res.send(htmlPage(`Bank | ${child}`, body));
  } catch (e) {
    res.status(500).send("Server error");
  }
});

// Create transaction endpoint
app.post("/tx", async (req, res) => {
  try {
    const { child, amount, reason, password } = req.body || {};
    if (!child || !amount) return res.status(400).json({ error: "Missing fields" });
    if (!["hana", "nour"].includes(child)) return res.status(400).json({ error: "Invalid child" });
    const amt = Number(amount);
    if (!Number.isFinite(amt)) return res.status(400).json({ error: "Invalid amount" });
    if (ADMIN_PASSWORD && password !== ADMIN_PASSWORD) return res.status(403).json({ error: "Wrong password" });
    await pool.query("INSERT INTO transactions (child, amount, reason) VALUES ($1, $2, $3)", [child, amt, reason || null]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

init().then(() => {
  app.listen(PORT, () => console.log(`Kids Bank listening on ${PORT}`));
}).catch(err => {
  console.error("Init failed", err);
  process.exit(1);
});

// Kids Bank on Render
// Single file Express app with Postgres
// Usage
// 1. Set DATABASE_URL env var from Render Postgres
// 2. Start with: node server.js

const express = require("express");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
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

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "&#10;");
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
    .table-wrapper { overflow-x: auto; }
    .tx-table input, .tx-table select { width: 100%; }
    .row-msg { font-size: 12px; margin-top: 4px; }
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

async function getBalances() {
  const [hana, nour] = await Promise.all([getBalance("hana"), getBalance("nour")]);
  return { hana, nour };
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
    const [hanaBal, nourBal, allTxs] = await Promise.all([
      getBalance("hana"),
      getBalance("nour"),
      pool.query(
        "SELECT id, child, amount, reason, created_at FROM transactions ORDER BY created_at DESC, id DESC LIMIT 50"
      ).then(r => r.rows)
    ]);
    const txRows = allTxs.map(t => {
      const type = Number(t.amount) >= 0 ? "credit" : "debit";
      const absAmount = Math.abs(Number(t.amount));
      return `
        <tr data-id="${t.id}">
          <td class="nowrap">${new Date(t.created_at).toLocaleString()}</td>
          <td>
            <select name="child">
              <option value="hana" ${t.child === "hana" ? "selected" : ""}>Hana</option>
              <option value="nour" ${t.child === "nour" ? "selected" : ""}>Nour</option>
            </select>
          </td>
          <td>
            <select name="type">
              <option value="credit" ${type === "credit" ? "selected" : ""}>Credit (+)</option>
              <option value="debit" ${type === "debit" ? "selected" : ""}>Debit (−)</option>
            </select>
          </td>
          <td><input type="number" step="0.01" min="0" name="amount" value="${absAmount.toFixed(2)}"></td>
          <td><input type="text" name="reason" value="${escapeHtml(t.reason || "")}"></td>
          <td class="nowrap">
            <button class="save-btn">Save</button>
            <button class="delete-btn">Delete</button>
            <div class="row-msg muted"></div>
          </td>
        </tr>
      `;
    }).join("");
    const body = `
      <div class="tabs">
        <a class="tab" href="/bank/hana">Hana statement</a>
        <a class="tab" href="/bank/nour">Nour statement</a>
      </div>

      <div class="card">
        <h2>Balances</h2>
        <div class="row">
          <div><strong>Hana</strong><div class="pill">EGP</div></div>
          <div class="right"><strong data-balance="hana">${money(hanaBal)}</strong></div>
        </div>
        <div class="row">
          <div><strong>Nour</strong><div class="pill">EGP</div></div>
          <div class="right"><strong data-balance="nour">${money(nourBal)}</strong></div>
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
              <input type="number" step="0.01" min="0" name="amount" placeholder="Enter amount" required>
            </label>
            <label>Type
              <select name="type" required>
                <option value="credit">Credit (+)</option>
                <option value="debit">Debit (−)</option>
              </select>
            </label>
          </div>
          <label>Reason <textarea name="reason" placeholder="Gift, chores, purchase, etc" rows="2"></textarea></label>
          <button type="submit">Save</button>
          <div id="msg" class="muted"></div>
        </form>
      </div>

      <div class="card">
        <h2>Recent transactions</h2>
        <p class="muted">Edit the latest 50 records directly below.</p>
        <div class="table-wrapper">
          <table class="tx-table">
            <thead>
              <tr><th>Date</th><th>Child</th><th>Type</th><th>Amount</th><th>Reason</th><th class="nowrap">Actions</th></tr>
            </thead>
            <tbody>${txRows || '<tr><td colspan="6" class="center muted">No transactions yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <script>
      function esc(s) {
        return String(s || "")
          .replace(/&/g,"&amp;")
          .replace(/</g,"&lt;")
          .replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;")
          .replace(/'/g,"&#39;");
      }
      function rowHtml(t) {
        const type = Number(t.amount) >= 0 ? "credit" : "debit";
        const absAmount = Math.abs(Number(t.amount)).toFixed(2);
        return \`
          <tr data-id="\${t.id}">
            <td class="nowrap">\${new Date(t.created_at).toLocaleString()}</td>
            <td>
              <select name="child">
                <option value="hana" \${t.child === "hana" ? "selected" : ""}>Hana</option>
                <option value="nour" \${t.child === "nour" ? "selected" : ""}>Nour</option>
              </select>
            </td>
            <td>
              <select name="type">
                <option value="credit" \${type === "credit" ? "selected" : ""}>Credit (+)</option>
                <option value="debit"  \${type === "debit"  ? "selected" : ""}>Debit (−)</option>
              </select>
            </td>
            <td><input type="number" step="0.01" min="0" name="amount" value="\${absAmount}"></td>
            <td><input type="text" name="reason" value="\${esc(t.reason)}"></td>
            <td class="nowrap">
              <button class="save-btn">Save</button>
              <button class="delete-btn">Delete</button>
              <div class="row-msg muted"></div>
            </td>
          </tr>
        \`;
      }

      const form = document.getElementById("txForm");

      async function fetchBalances() {
        try {
          const r = await fetch("/balances");
          const j = await r.json();
          updateBalances(j);
        } catch {}
      }

      function updateBalances(balances) {
        if (!balances) return;
        const hanaEl = document.querySelector('[data-balance="hana"]');
        const nourEl = document.querySelector('[data-balance="nour"]');
        if (hanaEl && balances.hana !== undefined) {
          hanaEl.textContent = Number(balances.hana).toFixed(2);
        }
        if (nourEl && balances.nour !== undefined) {
          nourEl.textContent = Number(balances.nour).toFixed(2);
        }
      }

      function ensureTxRows() {
        const tbody = document.querySelector(".tx-table tbody");
        if (!tbody) return;
        if (!tbody.querySelector("tr")) {
          tbody.innerHTML = '<tr><td colspan="6" class="center muted">No transactions yet</td></tr>';
        }
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const baseAmount = Number(data.amount);
        if (!Number.isFinite(baseAmount) || baseAmount < 0) {
          document.getElementById("msg").textContent = "Enter a valid amount";
          document.getElementById("msg").className = "error";
          return;
        }
        const signedAmount = data.type === "debit" ? -Math.abs(baseAmount) : Math.abs(baseAmount);
        const payload = { child: data.child, amount: signedAmount, reason: data.reason };
        try {
          const r = await fetch("/tx", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
          const j = await r.json();
          const msg = document.getElementById("msg");
          if (r.ok) {
            msg.textContent = "Saved";
            msg.className = "success";
            await fetchBalances();
            if (j.tx) {
              const tbody = document.querySelector(".tx-table tbody");
              const first = tbody.querySelector("tr .center.muted");
              if (first) first.closest("tr").remove();
              tbody.insertAdjacentHTML("afterbegin", rowHtml(j.tx));

            }
            form.reset();
            ensureTxRows();
            return;
          }
        } catch (err) {
          document.getElementById("msg").textContent = "Network error";
        }
      });

      const tbody = document.querySelector(".tx-table tbody");

      tbody.addEventListener("click", async (e) => {
        const row = e.target.closest("tr");
        if (!row) return;

        const saveBtn = e.target.closest(".save-btn");
        const delBtn  = e.target.closest(".delete-btn");
        const id = Number(row.dataset.id);
        const msg = row.querySelector(".row-msg");

        // delete
        if (delBtn) {
          if (!confirm("Delete this transaction?")) return;
          delBtn.disabled = true;
          msg.textContent = "Deleting...";
          msg.className = "row-msg muted";
          try {
            const res = await fetch(\`/tx/\${id}\`, { method: "DELETE" });
            const j = await res.json().catch(() => ({}));
            if (res.ok) {
              row.remove();
              await fetchBalances();
              ensureTxRows();
            } else {
              msg.textContent = j.error || "Error";
              msg.className = "row-msg error";
            }
          } finally {
            delBtn.disabled = false;
          }
          return;
        }

        // save
        if (saveBtn) {
          const child = row.querySelector('[name="child"]').value;
          const type  = row.querySelector('[name="type"]').value;
          const amtIn = Number(row.querySelector('[name="amount"]').value);
          const reason = row.querySelector('[name="reason"]').value;

          if (!Number.isFinite(amtIn) || amtIn < 0) {
            msg.textContent = "Invalid amount";
            msg.className = "row-msg error";
            return;
          }
          const amount = type === "debit" ? -Math.abs(amtIn) : Math.abs(amtIn);

          saveBtn.disabled = true;
          msg.textContent = "Saving...";
          msg.className = "row-msg muted";
          try {
            const res = await fetch(\`/tx/\${id}\`, {
              method: "PUT",
              headers: { "Content-Type":"application/json" },
              body: JSON.stringify({ child, amount, reason })
            });
            const j = await res.json().catch(() => ({}));
            if (res.ok) {
              msg.textContent = "Saved";
              msg.className = "row-msg success";
              await fetchBalances();
            } else {
              msg.textContent = j.error || "Error";
              msg.className = "row-msg error";
            }
          } finally {
            saveBtn.disabled = false;
          }
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
        <td>${t.reason ? escapeHtml(t.reason).replace(/&#10;/g, "<br>") : ""}</td>
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
    const { child, amount, reason } = req.body || {};
    if (!child || amount === undefined || amount === null) return res.status(400).json({ error: "Missing fields" });
    if (!["hana", "nour"].includes(child)) return res.status(400).json({ error: "Invalid child" });
    const amt = Number(amount);
    if (!Number.isFinite(amt)) return res.status(400).json({ error: "Invalid amount" });

    const r = await pool.query(
      "INSERT INTO transactions (child, amount, reason) VALUES ($1, $2, $3) RETURNING id, child, amount, reason, created_at",
      [child, amt, reason ? String(reason) : null]
    );

    res.json({ ok: true, tx: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});


app.put("/tx/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
    const { child, amount, reason } = req.body || {};
    if (!child || amount === undefined || amount === null) return res.status(400).json({ error: "Missing fields" });
    if (!["hana", "nour"].includes(child)) return res.status(400).json({ error: "Invalid child" });
    const amt = Number(amount);
    if (!Number.isFinite(amt)) return res.status(400).json({ error: "Invalid amount" });
    const result = await pool.query(
      "UPDATE transactions SET child = $1, amount = $2, reason = $3 WHERE id = $4 RETURNING id",
      [child, amt, reason ? String(reason) : null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// quick balances api used by the front end to refresh numbers
app.get("/balances", async (req, res) => {
  try {
    const balances = await getBalances();
    res.json(balances);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// delete transaction by id
app.delete("/tx/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
    const r = await pool.query("DELETE FROM transactions WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
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

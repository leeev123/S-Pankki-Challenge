// Demoasiakkaan tunniste
const CUSTOMER_ID = "CUST_001";

// Muotoilee luvun suomalaiseen euromuotoon, esim. 853.34 -> "853,34 €"
const fmtEur = (n) => Number(n).toFixed(2).replace(".", ",") + " €";

// Hakee alkutilan backendiltä sivun auetessa
async function loadState() {
  const res = await fetch(`/api/state/${CUSTOMER_ID}`);
  const data = await res.json();
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
}

// Päivittää Koti- ja Suunnitelma-välilehtien luvut ja listat
function renderSnapshot(s) {
  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = `Turvallinen päivävara ~${fmtEur(s.daily_safe_to_spend_eur)} / pv`;
  document.getElementById("accountBalance").textContent = fmtEur(s.account_balance_eur);
  document.getElementById("bufferAmount").textContent = fmtEur(s.profile.current_buffer_eur || 850);

  const goal = s.profile.active_goal;
  document.getElementById("goalCaption").textContent = goal
    ? `Tavoite aktiivisena: ${goal.name} (${goal.target_eur} €)`
    : `Viikkobudjetista (${fmtEur(s.weekly_budget_eur)}) jäljellä`;

  // Viimeisimmät kuitit Koti-näkymässä
  const receiptsEl = document.getElementById("recentReceipts");
  receiptsEl.innerHTML = s.recent_transactions
    .slice(0, 4)
    .map(
      (tx) => `
      <div class="row-between" style="padding: 6px 0; border-bottom: 1px solid #f2f5f3;">
        <div>
          <div class="item-title">${tx.merchant}</div>
          <div class="item-sub">${tx.date} · ${tx.category}</div>
        </div>
        <strong style="color:${tx.amount_eur > 0 ? "#007a33" : "#18241d"}">${fmtEur(tx.amount_eur)}</strong>
      </div>`
    )
    .join("");

  // Kolme pedagogista koria Suunnitelma-näkymässä
  const b = s.baskets_30d;
  document.getElementById("basketsCard").innerHTML = `
    <div class="row-between"><span class="item-title">1. Välttämättömät säännölliset</span><strong>${fmtEur(b.mandatory_regular_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">2. Välttämättömät epäsäännölliset (puskuri)</span><strong>${fmtEur(b.irregular_reserve_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">3. Arjen käyttöbudjetti (30 pv)</span><strong>${fmtEur(b.monthly_everyday_budget_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">Säästö & tavoitteet / kk</span><strong class="amount-green">${fmtEur(b.monthly_savings_target_eur)}</strong></div>
  `;

  // Arjen kategoriat
  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:4px 0;"><span>${k}</span><strong>${fmtEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia</div>`;

  // Käyttäjän prioriteetit
  document.getElementById("prioritiesCard").innerHTML = `
    <div class="item-title">Säilytettävät asiat: ${(s.profile.priorities || []).join(", ")}</div>
    <div class="item-sub" style="margin-top:6px;">Joustokohteet: ${(s.profile.cut_from || []).join(", ")}</div>
  `;
}

// Piirtää chat-viestit ja neuvottelevat toimintokortit
function renderHistory(history) {
  const el = document.getElementById("chatMessages");
  if (!history.length) {
    el.innerHTML = `<div class="msg assistant">Moikka! Olen Urho, S-AI-talousvalmentajasi. Kysy viikon käyttövarastasi tai kokeile hankinnan suunnittelua (esim. "Haluan ostaa 1 200 € läppärin").</div>`;
    return;
  }
  el.innerHTML = history
    .map((m) => {
      const cardsHtml = (m.action_cards || [])
        .map(
          (c) => `
          <div class="action-card">
            <h4>${c.title}</h4>
            <p>${c.summary}</p>
            <button class="apply-btn" onclick='applyPlan(${JSON.stringify(c)})'>Hyväksy suunnitelma</button>
          </div>`
        )
        .join("");
      return `<div class="msg ${m.role}">${m.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}${cardsHtml}</div>`;
    })
    .join("");
  el.scrollTop = el.scrollHeight;
}

// Lähettää chat-viestin backendille
async function sendMessage(text) {
  if (!text.trim()) return;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: CUSTOMER_ID, message: text }),
  });
  const data = await res.json();
  renderSnapshot(data.updated_state);
  await loadState();
}

// Hyväksyy AI:n ehdottaman suunnitelman ja palaa etusivulle näyttämään uuden käyttövaran
async function applyPlan(card) {
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: CUSTOMER_ID, ...card }),
  });
  const data = await res.json();
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
  switchTab("home");
}

// Lähettää käyttäjän valitseman Excel-tiliotteen (.xlsx) backendille
async function uploadExcel() {
  const input = document.getElementById("excelFileInput");
  const statusEl = document.getElementById("excelStatus");
  if (!input.files.length) {
    statusEl.textContent = "Valitse ensin .xlsx-tiedosto.";
    return;
  }

  const formData = new FormData();
  formData.append("file", input.files[0]);
  statusEl.textContent = "Ladataan ja analysoidaan tiliotetta...";

  const res = await fetch(`/api/upload-excel/${CUSTOMER_ID}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    statusEl.textContent = `Virhe: ${err.detail}`;
    return;
  }

  const data = await res.json();
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
  statusEl.textContent = "Excel-tiliote ladattu ja käyttövara päivitetty!";
  switchTab("home");
}

// Välilehtien vaihto
function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
}

function askPreset(text) {
  switchTab("chat");
  sendMessage(text);
}
function sendQuickChat(text) { sendMessage(text); }

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value;
  input.value = "";
  sendMessage(text);
});

// Käyttöönotto-modaali
document.getElementById("openOnboardingBtn").onclick = () => document.getElementById("onboardingModal").classList.remove("hidden");
function closeOnboarding() { document.getElementById("onboardingModal").classList.add("hidden"); }

async function saveOnboarding() {
  const priorities = Array.from(document.querySelectorAll("#priorityChecks input:checked")).map((i) => i.value);
  const savings = Number(document.getElementById("savingsInput").value || 250);
  await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: CUSTOMER_ID, priorities, savings_goal_monthly_eur: savings }),
  });
  closeOnboarding();
  loadState();
}

// Käynnistetään sovellus
loadState();
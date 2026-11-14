function getStatementSessionId() {
  const key = "suunta_statement_id";
  let id = localStorage.getItem(key);
  if (!id || !/^[a-zA-Z0-9_-]{4,40}$/.test(id)) {
    id = "stmt_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, id);
  }
  return id;
}

const currentStatementId = getStatementSessionId();
let currentSnapshot = null;
let detailsVisible = true;

const fmtEur = (n) => Number(n || 0).toFixed(2).replace(".", ",") + " €";

window.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch(`/api/state/${currentStatementId}`);
  const data = await res.json();
  currentSnapshot = data.snapshot;

  if (currentSnapshot.has_uploaded_statement) {
    document.getElementById("statementGate").classList.add("hidden");
    document.getElementById("appShell").classList.remove("hidden");
    renderSnapshot(data.snapshot);
    renderHistory(data.history);
  }
});

function openStatementGate() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("statementGate").classList.remove("hidden");
}

async function uploadStatementFromGate(input) {
  if (!input.files.length) return;
  const statusEl = document.getElementById("gateStatus");
  statusEl.textContent = "Ladataan ja analysoidaan tiliotetta...";

  const ok = await uploadStatementFile(input.files[0], statusEl);
  input.value = "";
  if (ok) {
    document.getElementById("statementGate").classList.add("hidden");
    document.getElementById("appShell").classList.remove("hidden");
    await loadState();
    if (!currentSnapshot.profile.suunta_enabled) {
      openActivatePrompt();
    }
  }
}

async function loadState() {
  const res = await fetch(`/api/state/${currentStatementId}`);
  const data = await res.json();
  currentSnapshot = data.snapshot;
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
}

function renderSnapshot(s) {
  const p = s.profile || {};
  const suuntaEnabled = Boolean(p.suunta_enabled);

  const badge = document.getElementById("activeStatementBadge");
  badge.textContent = s.source_name || "Tuotu tiliote";
  badge.classList.remove("hidden");

  document.getElementById("classicHero").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("classicQuickActions").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("suuntaBannerCard").classList.toggle("hidden", suuntaEnabled);

  document.getElementById("suuntaHero").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("suuntaQuickActions").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("dot1").classList.toggle("active", !suuntaEnabled);
  document.getElementById("dot2").classList.toggle("active", suuntaEnabled);

  document.getElementById("classicBonusAmount").textContent = fmtEur(p.bonus_eur || 6.84);
  document.getElementById("classicNextTier").textContent = fmtEur(p.bonus_next_tier_eur || 58.08);

  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = `Turvallinen päivävara ~${fmtEur(s.daily_safe_to_spend_eur)} / pv`;
  const goal = p.active_goal;
  document.getElementById("goalCaption").textContent = goal
    ? `Tavoite: ${goal.name} (${goal.target_eur} €)`
    : "Katso 3 kulutuskoria & budjetti";

  document.getElementById("accountBalance").textContent = detailsVisible ? fmtEur(s.account_balance_eur) : "••• €";

  const firstTx = (s.recent_transactions || [])[0];
  document.getElementById("homeReceiptCard").innerHTML = firstTx
    ? renderReceiptRow(firstTx)
    : `<div class="item-sub">Ei vielä tapahtumia</div>`;

  const allReceiptsHtml = (s.recent_transactions || []).map(renderReceiptRow).join('<div class="divider"></div>');
  document.getElementById("allReceiptsCard").innerHTML = allReceiptsHtml;
  document.getElementById("etukorttiReceipts").innerHTML = allReceiptsHtml;

  const b = s.baskets_30d;
  document.getElementById("basketsCard").innerHTML = `
    <div class="row-between"><span class="item-title">1. Välttämättömät säännölliset</span><strong class="nowrap">${fmtEur(b.mandatory_regular_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">2. Välttämättömät epäsäännölliset (puskuri)</span><strong class="nowrap">${fmtEur(b.irregular_reserve_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">3. Arjen käyttöbudjetti (30 pv)</span><strong class="nowrap">${fmtEur(b.monthly_everyday_budget_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">Säästötavoite / kk</span><strong class="amount-green nowrap">${fmtEur(b.monthly_savings_target_eur)}</strong></div>
  `;

  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:5px 0;"><span>${k}</span><strong class="nowrap">${fmtEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia</div>`;

  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${s.source_name || "Tuotu tiliote"}</div>
    <div class="item-sub">${s.transaction_count} tapahtumaa · Kuukausitulot ${fmtEur(s.monthly_income_eur)}</div>
    <div class="divider"></div>
    <div class="item-sub">Tärkeät asiat: ${(p.priorities || []).join(", ")}</div>
  `;
  document.getElementById("meToggleSuuntaBtn").textContent = suuntaEnabled ? "Poista käytöstä" : "Aktivoi";
}

function renderReceiptRow(tx) {
  return `
    <div class="row-between">
      <div class="row-left">
        <span class="receipt-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2H4z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/></svg>
        </span>
        <div>
          <div class="item-title">${tx.merchant}</div>
          <div class="item-sub">${tx.date}</div>
        </div>
      </div>
      <strong class="nowrap" style="color:${tx.amount_eur > 0 ? "#007429" : "#18241d"}">${fmtEur(tx.amount_eur)}</strong>
    </div>`;
}

function openActivatePrompt() {
  document.getElementById("activateSuuntaModal").classList.remove("hidden");
}

function declineSuuntaActivation() {
  document.getElementById("activateSuuntaModal").classList.add("hidden");
}

function proceedToOnboarding() {
  document.getElementById("activateSuuntaModal").classList.add("hidden");
  openOnboarding();
}

function openOnboarding() {
  if (currentSnapshot?.profile?.monthly_savings_target_eur !== undefined) {
    document.getElementById("savingsInput").value = currentSnapshot.profile.monthly_savings_target_eur;
  }
  document.getElementById("onboardingModal").classList.remove("hidden");
}

function closeOnboarding() {
  document.getElementById("onboardingModal").classList.add("hidden");
}

async function saveOnboarding() {
  const priorities = Array.from(document.querySelectorAll("#priorityChecks input:checked")).map((i) => i.value);
  const savings = Number(document.getElementById("savingsInput").value || 200);
  await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statement_id: currentStatementId,
      suunta_enabled: true,
      priorities,
      savings_goal_monthly_eur: savings,
    }),
  });
  closeOnboarding();
  await loadState();
  switchTab("home");
}

async function toggleSuuntaMode() {
  const nextState = !Boolean(currentSnapshot?.profile?.suunta_enabled);
  if (nextState) {
    openActivatePrompt();
    return;
  }
  await fetch(`/api/toggle-suunta/${currentStatementId}?enabled=false`, { method: "POST" });
  await loadState();
}

function handleChatIconClick() {
  if (!currentSnapshot?.profile?.suunta_enabled) {
    openActivatePrompt();
  } else {
    switchTab("chat");
  }
}

function renderHistory(history) {
  const el = document.getElementById("chatMessages");
  if (!history.length) {
    el.innerHTML = `<div class="msg assistant">Moikka! Olen Suunta, henkilökohtainen talousvalmentajasi. Kysy viikon käyttövarastasi tai kokeile hankinnan suunnittelua (esim. "Haluan ostaa 1 200 € läppärin").</div>`;
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

async function sendMessage(text) {
  if (!text.trim()) return;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement_id: currentStatementId, message: text }),
  });
  const data = await res.json();
  renderSnapshot(data.updated_state);
  await loadState();
}

async function applyPlan(card) {
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement_id: currentStatementId, ...card }),
  });
  const data = await res.json();
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
  switchTab("home");
}

async function uploadStatementFile(file, statusEl) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/upload-statement/${currentStatementId}`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json();
    statusEl.textContent = `Virhe: ${err.detail}`;
    return false;
  }
  statusEl.textContent = "Tiliote ladattu!";
  return true;
}

async function uploadStatementFromMe() {
  const input = document.getElementById("meStatementInput");
  const statusEl = document.getElementById("meUploadStatus");
  if (!input.files.length) {
    statusEl.textContent = "Valitse ensin .xlsx- tai .csv-tiedosto.";
    return;
  }
  statusEl.textContent = "Ladataan...";
  const ok = await uploadStatementFile(input.files[0], statusEl);
  if (ok) {
    await loadState();
    switchTab("home");
  }
}

async function resetDemoSession() {
  await fetch(`/api/reset/${currentStatementId}`, { method: "POST" });
  openStatementGate();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
}

function toggleCardDetails() {
  detailsVisible = !detailsVisible;
  document.getElementById("cardDetailsBlock").classList.toggle("hidden", !detailsVisible);
  document.getElementById("toggleDetailsBtn").textContent = detailsVisible ? "Piilota tiedot" : "Näytä tiedot";
  if (currentSnapshot) renderSnapshot(currentSnapshot);
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
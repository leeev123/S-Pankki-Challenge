let currentCustomerId = null;
let currentSnapshot = null;
let currentHistory = [];
let detailsVisible = true;
let isSending = false;

const fmtEur = (n) => Number(n || 0).toFixed(2).replace(".", ",") + " €";

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMessageText(text) {
  return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadProfileGate();
});

async function loadProfileGate() {
  const listEl = document.getElementById("profileList");
  const statusEl = document.getElementById("gateStatus");
  try {
    const res = await fetch("/api/customers");
    if (!res.ok) throw new Error("Profiilien haku epäonnistui");
    const data = await res.json();
    const customers = data.customers || [];

    if (!customers.length) {
      listEl.innerHTML = `<div class="gate-status">Profiileja ei löytynyt datakansiosta.</div>`;
      return;
    }

    listEl.innerHTML = customers
      .map((c) => {
        const iconSvg =
          c.role_label === "Opiskelija"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`
            : c.role_label === "Eläkeläinen"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`;

        const titleText =
          c.display_name === c.role_label
            ? c.display_name
            : `${c.role_label} (${c.display_name})`;

        return `
          <button class="persona-card" onclick="selectProfile('${escapeHtml(c.customer_id)}')">
            <div class="persona-icon">${iconSvg}</div>
            <div class="persona-info">
              <strong>${escapeHtml(titleText)}</strong>
              <span>${escapeHtml(c.customer_age)} v · Postinumero ${escapeHtml(c.customer_postal_code)} · Saldo ${fmtEur(c.account_balance_eur)}</span>
            </div>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>`;
      })
      .join("");
    statusEl.textContent = "";
  } catch (err) {
    listEl.innerHTML = "";
    statusEl.textContent = `Virhe profiilien latauksessa: ${err.message}`;
  }
}

async function selectProfile(customerId) {
  currentCustomerId = customerId;
  document.getElementById("profileGate").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  switchTab("home");
  await loadState();
}

function openProfileGate() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("profileGate").classList.remove("hidden");
}

async function loadState() {
  if (!currentCustomerId) return;
  const res = await fetch(`/api/state/${encodeURIComponent(currentCustomerId)}`);
  const data = await res.json();
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

function renderSnapshot(s) {
  const p = s.profile || {};
  const suuntaEnabled = Boolean(p.suunta_enabled);

  const badge = document.getElementById("activeProfileBadge");
  badge.textContent = s.display_name || p.display_name || s.role_label;
  badge.classList.remove("hidden");

  document.getElementById("classicHero").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("classicQuickActions").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("suuntaBannerCard").classList.toggle("hidden", suuntaEnabled);

  document.getElementById("suuntaHero").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("suuntaQuickActions").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("homeSuuntaChatCard").classList.toggle("hidden", !suuntaEnabled);

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
    : `<div class="item-sub">Ei tapahtumia</div>`;

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
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:5px 0;"><span>${escapeHtml(k)}</span><strong class="nowrap">${fmtEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia</div>`;

  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${escapeHtml(s.display_name || s.role_label)} (${escapeHtml(s.role_label)})</div>
    <div class="item-sub">${escapeHtml(p.customer_age)} v · ${escapeHtml(p.customer_postal_code)} · ${s.transaction_count} tapahtumaa · Tulot (30 pv) ${fmtEur(s.monthly_income_eur)}</div>
    <div class="divider"></div>
    <div class="item-sub">Tärkeät asiat: ${escapeHtml((p.priorities || []).join(", "))}</div>
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
          <div class="item-title">${escapeHtml(tx.merchant)}</div>
          <div class="item-sub">${escapeHtml(tx.date)}</div>
        </div>
      </div>
      <strong class="nowrap" style="color:${tx.amount_eur > 0 ? "#007a33" : "#18241d"}">${fmtEur(tx.amount_eur)}</strong>
    </div>`;
}

// Suora käyttöönotto ilman pop-up-ikkunaa
async function enableSuuntaDirect() {
  if (!currentCustomerId) return;
  await fetch(`/api/toggle-suunta/${encodeURIComponent(currentCustomerId)}?enabled=true`, { method: "POST" });
  await loadState();
}

async function toggleSuuntaMode() {
  if (!currentCustomerId) return;
  const nextState = !Boolean(currentSnapshot?.profile?.suunta_enabled);
  await fetch(`/api/toggle-suunta/${encodeURIComponent(currentCustomerId)}?enabled=${nextState}`, { method: "POST" });
  await loadState();
}

async function openHomeOrFullChat() {
  if (!currentSnapshot?.profile?.suunta_enabled) {
    await enableSuuntaDirect();
  }
  switchTab("chat");
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
      statement_id: currentCustomerId,
      suunta_enabled: true,
      priorities,
      savings_goal_monthly_eur: savings,
    }),
  });
  closeOnboarding();
  await loadState();
  switchTab("home");
}

// Piirtää keskusteluhistorian sekä etusivun chattiin että koko ruudun chattiin
function renderHistory(history, showLoading = false) {
  const containers = [
    document.getElementById("chatMessages"),
    document.getElementById("homeChatMessages"),
  ];

  const greeting = `<div class="msg assistant">Moikka! Olen Suunta, talousvalmentajasi. Kysy viikon käyttövarastasi tai kokeile hankinnan suunnittelua (esim. "Haluan ostaa 1 200 € läppärin").</div>`;

  const messagesHtml = history.length
    ? history
        .map((m) => {
          const cardsHtml = (m.action_cards || [])
            .map((c) => {
              const encoded = encodeURIComponent(JSON.stringify(c));
              return `
                <div class="action-card">
                  <h4>${escapeHtml(c.title)}</h4>
                  <p>${escapeHtml(c.summary)}</p>
                  <button class="apply-btn" onclick="applyPlanEncoded('${encoded}')">Hyväksy suunnitelma</button>
                </div>`;
            })
            .join("");
          return `<div class="msg ${m.role}">${formatMessageText(m.content)}${cardsHtml}</div>`;
        })
        .join("")
    : greeting;

  const loadingHtml = showLoading
    ? `<div class="typing-bubble" role="status" aria-live="polite">
         <span class="spinner-ring"></span>
         <span>Suunta miettii ja laskee</span>
         <span class="typing-dots"><span></span><span></span><span></span></span>
       </div>`
    : "";

  for (const el of containers) {
    if (!el) continue;
    el.innerHTML = messagesHtml + loadingHtml;
    el.scrollTop = el.scrollHeight;
  }
}

function setSendingState(loading) {
  isSending = loading;
  ["homeChatSubmit", "chatSubmit"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? "..." : "Lähetä";
    }
  });
}

async function sendMessage(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText || isSending || !currentCustomerId) return;

  // Näytetään käyttäjän viesti ja latausindikaattori heti
  const optimisticHistory = [
    ...currentHistory,
    { role: "user", content: cleanText, action_cards: [] },
  ];
  renderHistory(optimisticHistory, true);
  setSendingState(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement_id: currentCustomerId, message: cleanText }),
    });
    if (!res.ok) throw new Error("Palvelinvirhe vastauksessa");
    const data = await res.json();
    renderSnapshot(data.updated_state);
    await loadState();
  } catch (err) {
    renderHistory([
      ...optimisticHistory,
      { role: "assistant", content: `Yhteysvirhe: ${err.message}`, action_cards: [] },
    ]);
  } finally {
    setSendingState(false);
  }
}

async function applyPlanEncoded(encoded) {
  const card = JSON.parse(decodeURIComponent(encoded));
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement_id: currentCustomerId, ...card }),
  });
  const data = await res.json();
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
  switchTab("home");
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

function askPreset(text, stayOnHome = false) {
  if (!stayOnHome) switchTab("chat");
  sendMessage(text);
}

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value;
  input.value = "";
  sendMessage(text);
});

document.getElementById("homeChatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("homeChatInput");
  const text = input.value;
  input.value = "";
  sendMessage(text);
});
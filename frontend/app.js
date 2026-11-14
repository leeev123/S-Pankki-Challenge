let currentCustomerId = null;
let currentSnapshot = null;
let currentHistory = [];
let detailsVisible = true;
let isSending = false;
let heroOverride = null;

const fmtEur = (n) => Number(n || 0).toFixed(2).replace(".", ",") + " €";
const fmtBonus = (n) => Number(n || 0).toFixed(2).replace(".", ",").replace(/0$/, "") + " €";

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMessageText(text) {
  return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

window.addEventListener("DOMContentLoaded", async () => {
  await fetch("/api/reset-all", { method: "POST" }).catch(() => {});
  await loadProfileGate();
});

async function logoutAndReset() {
  await fetch("/api/reset-all", { method: "POST" }).catch(() => {});
  currentCustomerId = null;
  currentSnapshot = null;
  currentHistory = [];
  detailsVisible = true;
  heroOverride = null;
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("profileGate").classList.remove("hidden");
  await loadProfileGate();
}

async function loadProfileGate() {
  const listEl = document.getElementById("profileList");
  const statusEl = document.getElementById("gateStatus");
  try {
    const res = await fetch("/api/customers");
    if (!res.ok) throw new Error("Profiilien haku epäonnistui");
    const data = await res.json();
    const customers = data.customers || [];

    listEl.innerHTML = customers
      .map((c) => {
        const iconSvg =
          c.role_label === "Opiskelija"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`
            : c.role_label === "Eläkeläinen"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`;

        const titleText = c.display_name === c.role_label ? c.display_name : `${c.role_label} · ${c.display_name}`;
        return `
          <button class="persona-card" onclick="selectProfile('${escapeHtml(c.customer_id)}')">
            <div class="persona-icon">${iconSvg}</div>
            <div class="persona-info">
              <strong>${escapeHtml(titleText)}</strong>
              <span>${escapeHtml(c.customer_age)} v · ${escapeHtml(c.customer_postal_code)} · Saldo ${fmtEur(c.account_balance_eur)}</span>
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
  detailsVisible = true;
  heroOverride = null;
  document.getElementById("profileGate").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  switchTab("home");
  await loadState();
}

async function loadState() {
  if (!currentCustomerId) return;
  const res = await fetch(`/api/state/${encodeURIComponent(currentCustomerId)}`);
  if (!res.ok) return;
  const data = await res.json();
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

function showHeroSlide(mode) {
  heroOverride = mode;
  if (currentSnapshot) renderSnapshot(currentSnapshot);
}

function renderSnapshot(s) {
  const p = s.profile || {};
  const suuntaEnabled = Boolean(p.suunta_enabled);
  const showSuuntaHero = heroOverride ? heroOverride === "suunta" : suuntaEnabled;

  const badge = document.getElementById("activeProfileBadge");
  badge.textContent = s.role_label || s.display_name;
  badge.classList.remove("hidden");

  document.getElementById("classicHero").classList.toggle("hidden", showSuuntaHero);
  document.getElementById("suuntaHero").classList.toggle("hidden", !showSuuntaHero);
  document.getElementById("dot1").classList.toggle("active", !showSuuntaHero);
  document.getElementById("dot2").classList.toggle("active", showSuuntaHero);

  document.getElementById("classicQuickActions").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("suuntaQuickActions").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("suuntaOffBody").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("suuntaOnBody").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("suuntaExpandBtn").classList.toggle("hidden", !suuntaEnabled);
  document.getElementById("suuntaDot").classList.toggle("active", suuntaEnabled);

  ["homeSuuntaSwitch", "meSuuntaSwitch"].forEach((id) => {
    const sw = document.getElementById(id);
    if (!sw) return;
    sw.classList.toggle("on", suuntaEnabled);
    sw.setAttribute("aria-checked", String(suuntaEnabled));
  });

  const bonusStr = fmtBonus(p.bonus_eur || 23.4);
  const nextTierStr = fmtBonus(p.bonus_next_tier_eur || 56.7);
  document.getElementById("classicBonusAmount").textContent = bonusStr;
  document.getElementById("classicNextTier").textContent = nextTierStr;
  document.getElementById("etukorttiBonusAmount").textContent = bonusStr;
  document.getElementById("etukorttiNextTier").textContent = nextTierStr;

  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = `Viikkobudjetti ${fmtEur(s.weekly_budget_eur)} · käytetty ${fmtEur(s.spent_this_week_eur)}`;
  document.getElementById("chatHeaderAllowance").textContent = `Viikon käyttövara ${fmtEur(s.weekly_safe_to_spend_eur)}`;

  const goal = p.active_goal;
  document.getElementById("goalCaption").textContent = goal
    ? `Tavoite: ${goal.name} (${goal.target_eur} €)`
    : "Katso 3 kulutuskoria & suunnitelma";

  // Kokonaissaldon näyttö / piilotus
  document.getElementById("accountBalance").textContent = detailsVisible ? fmtEur(s.account_balance_eur) : "•••• €";
  document.getElementById("toggleDetailsBtn").textContent = detailsVisible ? "Piilota tiedot" : "Näytä tiedot";

  const firstTx = (s.recent_transactions || [])[0];
  document.getElementById("homeReceiptCard").innerHTML = firstTx ? renderReceiptRow(firstTx) : `<div class="item-sub">Ei tapahtumia</div>`;

  const allReceiptsHtml = (s.recent_transactions || []).map(renderReceiptRow).join('<div class="divider"></div>');
  document.getElementById("allReceiptsCard").innerHTML = allReceiptsHtml;
  document.getElementById("etukorttiReceipts").innerHTML = allReceiptsHtml;

  const b = s.baskets_30d;
  const totalOut = Math.max(1, b.mandatory_regular_eur + b.irregular_reserve_eur + b.monthly_everyday_budget_eur);
  const pct1 = Math.min(100, Math.round((b.mandatory_regular_eur / totalOut) * 100));
  const pct2 = Math.min(100, Math.round((b.irregular_reserve_eur / totalOut) * 100));
  const pct3 = Math.min(100, Math.round((b.monthly_everyday_budget_eur / totalOut) * 100));

  document.getElementById("basketsCard").innerHTML = `
    <div class="basket-item">
      <div class="row-between"><span class="item-title">1. Välttämättömät säännölliset</span><strong class="tabular nowrap">${fmtEur(b.mandatory_regular_eur)}</strong></div>
      <div class="basket-bar-track"><div class="basket-bar-fill" style="width:${pct1}%"></div></div>
    </div>
    <div class="basket-item">
      <div class="row-between"><span class="item-title">2. Epäsäännölliset &amp; puskurivaraus</span><strong class="tabular nowrap">${fmtEur(b.irregular_reserve_eur)}</strong></div>
      <div class="basket-bar-track"><div class="basket-bar-fill" style="width:${pct2}%"></div></div>
    </div>
    <div class="basket-item">
      <div class="row-between"><span class="item-title">3. Arjen käyttöbudjetti (kk)</span><strong class="tabular nowrap">${fmtEur(b.monthly_everyday_budget_eur)}</strong></div>
      <div class="basket-bar-track"><div class="basket-bar-fill" style="width:${pct3}%"></div></div>
    </div>
    <div class="divider"></div>
    <div class="row-between">
      <span class="item-sub">Säästötavoite / kk · Puskuri ${fmtEur(p.current_buffer_eur || 850)}</span>
      <strong class="amount-green tabular nowrap" style="font-size:15px;">+${fmtEur(b.monthly_savings_target_eur)}</strong>
    </div>`;

  const opps = s.savings_opportunities || [];
  document.getElementById("opportunitiesCard").innerHTML = opps.length
    ? opps
        .map((o) => {
          const sc20 = (o.scenarios || []).find((x) => x.reduction_percent === 20) || (o.scenarios || [])[0];
          const saveMo = sc20 ? fmtEur(sc20.monthly_saving_eur) : "0,00 €";
          return `
            <div class="opp-row">
              <div>
                <div class="item-title">${escapeHtml(o.category_fi)} (-20 %)</div>
                <div class="item-sub">Keskimäärin ${fmtEur(o.monthly_average_eur)}/kk · säästö ${saveMo}/kk</div>
              </div>
              <button class="btn-subtle" onclick="askAndOpenSuunta('Paljonko säästän jos vähennän kategoriaa ${escapeHtml(o.category_fi)} 20 %?')">Simuloi</button>
            </div>`;
        })
        .join("")
    : `<div class="item-sub">Nykyiset prioriteettisi suojaavat suurimmat arjen kategoriat.</div>`;

  const fc = s.forecast_6m || [];
  const lastFc = fc[fc.length - 1];
  document.getElementById("forecastCard").innerHTML = lastFc
    ? `<div class="row-between"><span class="item-title">Puskuri 6 kk kuluttua (${escapeHtml(lastFc.month)})</span><strong class="tabular">${fmtEur(lastFc.buffer_eur)}</strong></div>
       <div class="divider"></div>
       <div class="row-between"><span class="item-title">Kertynyt tavoitesäästö (6 kk)</span><strong class="amount-green tabular" style="font-size:15px;">+${fmtEur(lastFc.goal_fund_eur)}</strong></div>`
    : `<div class="item-sub">Ennuste ei saatavilla.</div>`;

  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:5px 0;"><span>${escapeHtml(k)}</span><strong class="tabular nowrap">${fmtEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia jaksolla.</div>`;

  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${escapeHtml(s.role_label)} · ${escapeHtml(s.display_name)}</div>
    <div class="item-sub">${escapeHtml(p.customer_age)} v · ${escapeHtml(p.customer_postal_code)} · Tulot keskim. ${fmtEur(s.monthly_income_eur)}/kk</div>
    <div class="divider"></div>
    <div class="item-sub">Suojatut prioriteetit: <strong>${escapeHtml((p.priorities || []).join(", "))}</strong></div>`;
}

function renderReceiptRow(tx) {
  return `
    <div class="row-between">
      <div class="row-left">
        <svg class="receipt-svg-icon" aria-hidden="true"><use href="#icon-receipt"/></svg>
        <div>
          <div class="item-title">${escapeHtml(tx.merchant)}</div>
          <div class="item-sub">${escapeHtml(tx.date)} · ${escapeHtml(tx.category)}</div>
        </div>
      </div>
      <strong class="tabular nowrap" style="color:${tx.amount_eur > 0 ? "#007a3d" : "#18201b"}">${fmtEur(tx.amount_eur)}</strong>
    </div>`;
}

// Kytkee Suunnan päälle/pois. Käyttöönotto piilottaa kokonaissaldon automaattisesti!
async function setSuuntaEnabled(enable) {
  if (!currentCustomerId) return;
  if (enable) {
    detailsVisible = false;
    heroOverride = "suunta";
  } else {
    detailsVisible = true;
    heroOverride = "bonus";
  }
  await fetch(`/api/toggle-suunta/${encodeURIComponent(currentCustomerId)}?enabled=${enable}`, { method: "POST" });
  await loadState();
}

async function toggleSuuntaMode() {
  const nextState = !Boolean(currentSnapshot?.profile?.suunta_enabled);
  await setSuuntaEnabled(nextState);
}

function toggleCardDetails() {
  detailsVisible = !detailsVisible;
  if (currentSnapshot) renderSnapshot(currentSnapshot);
}

async function openFullChat() {
  if (!currentSnapshot?.profile?.suunta_enabled) {
    await setSuuntaEnabled(true);
  }
  switchTab("chat");
}

async function askAndOpenSuunta(messageText) {
  if (!currentSnapshot?.profile?.suunta_enabled) {
    await setSuuntaEnabled(true);
  }
  switchTab("chat");
  await sendMessage(messageText);
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
  const savings = Number(document.getElementById("savingsInput").value || 150);
  detailsVisible = false;
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
}

function renderActionCard(c) {
  const encoded = encodeURIComponent(JSON.stringify(c));
  const weeklyBadge =
    typeof c.impact_weekly_eur === "number" && c.impact_weekly_eur !== 0
      ? `<span class="impact-pill">${c.impact_weekly_eur > 0 ? "+" : ""}${c.impact_weekly_eur.toFixed(0)} €/vk</span>`
      : c.impact_savings_months
      ? `<span class="impact-pill">${c.impact_savings_months} kk</span>`
      : "";

  return `
    <div class="action-card">
      <div class="action-card-top">
        <h4>${escapeHtml(c.title)}</h4>
        ${weeklyBadge}
      </div>
      <p>${escapeHtml(c.summary)}</p>
      <button class="apply-btn" onclick="applyPlanEncoded('${encoded}')">Ota suunnitelma käyttöön</button>
    </div>`;
}

function renderHistory(history, showLoading = false) {
  const containers = [document.getElementById("chatMessages"), document.getElementById("homeChatMessages")];
  const greeting = `
    <div class="msg-group assistant">
      <span class="msg-sender">Suunta</span>
      <div class="msg assistant">Hei! Olen Suunta. Piilotin tilin kokonaissaldon näkyvistä, jotta viikon todellinen käyttövara pysyy selkeänä. Miten voin auttaa?</div>
    </div>`;

  const messagesHtml = history.length
    ? history
        .map((m) => {
          const isUser = m.role === "user";
          const cards = m.action_cards || [];
          const cardsHtml = cards.length ? `<div class="action-cards-stack">${cards.map(renderActionCard).join("")}</div>` : "";
          return `
            <div class="msg-group ${isUser ? "user" : "assistant"}">
              ${isUser ? "" : `<span class="msg-sender">Suunta</span>`}
              <div class="msg ${isUser ? "user" : "assistant"}">${formatMessageText(m.content)}</div>
              ${cardsHtml}
            </div>`;
        })
        .join("")
    : greeting;

  const loadingHtml = showLoading
    ? `<div class="msg-group assistant">
         <span class="msg-sender">Suunta</span>
         <div class="typing-bubble"><span>Lasketaan</span><span class="typing-dots"><span></span><span></span><span></span></span></div>
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
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "..." : "Lähetä";
  });
}

async function sendMessage(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText || isSending || !currentCustomerId) return;

  const optimisticHistory = [...currentHistory, { role: "user", content: cleanText, action_cards: [] }];
  renderHistory(optimisticHistory, true);
  setSendingState(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement_id: currentCustomerId, message: cleanText }),
    });
    if (!res.ok) throw new Error("Palvelinvirhe");
    const data = await res.json();
    renderSnapshot(data.updated_state);
    await loadState();
  } catch (err) {
    renderHistory([...optimisticHistory, { role: "assistant", content: `Yhteysvirhe: ${err.message}`, action_cards: [] }]);
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
  heroOverride = "suunta";
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
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

document.getElementById("homePreChatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("homePreChatInput");
  const text = input.value.trim();
  input.value = "";
  if (!currentSnapshot?.profile?.suunta_enabled) {
    await setSuuntaEnabled(true);
  }
  if (text) {
    await sendMessage(text);
  }
});
// Aktiivinen asiakasprofiili (valitaan aloitusruudusta)
let currentCustomerId = null;
let currentSnapshot = null;
let detailsVisible = true;

// Muotoilee luvun suomalaiseen muotoon: 853.34 -> "853,34 €"
const fmtEur = (n) => Number(n).toFixed(2).replace(".", ",") + " €";

// --- 1. ALOITUSNÄKYMÄ (Asiakasluokan valinta) ---
async function selectPersona(customerId) {
  currentCustomerId = customerId;
  document.getElementById("personaGate").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  await loadState();

  // Jos S-AI ei ole vielä aktivoitu tälle profiilille, näytetään aktivointikysymys
  if (!currentSnapshot.profile.s_ai_enabled) {
    openActivatePrompt();
  }
}

function openPersonaGate() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("personaGate").classList.remove("hidden");
}

// Oman Excelin lataus suoraan aloitusvalikosta ("4. Lisää oma tiliote")
async function uploadExcelFromGate(input) {
  if (!input.files.length) return;
  const statusEl = document.getElementById("gateStatus");
  statusEl.textContent = "Ladataan ja analysoidaan tiliotetta...";

  const ok = await uploadExcelFile("CUST_CUSTOM", input.files[0], statusEl);
  if (ok) {
    await selectPersona("CUST_CUSTOM");
  }
}

// --- 2. TILAN HAKU JA PIIRTÄMINEN ---
async function loadState() {
  if (!currentCustomerId) return;
  const res = await fetch(`/api/state/${currentCustomerId}`);
  const data = await res.json();
  currentSnapshot = data.snapshot;
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
}

function renderSnapshot(s) {
  const p = s.profile || {};
  const saiEnabled = Boolean(p.s_ai_enabled);

  // Yläpalkin hillitty profiilitieto
  const badge = document.getElementById("activePersonaBadge");
  badge.textContent = p.display_name || s.customer_id;
  badge.classList.remove("hidden");

  // Vaihdetaan etusivun näkymä: perinteinen S-mobiili vs. S-AI-käyttövara
  document.getElementById("classicHero").classList.toggle("hidden", saiEnabled);
  document.getElementById("classicQuickActions").classList.toggle("hidden", saiEnabled);
  document.getElementById("saiBannerCard").classList.toggle("hidden", saiEnabled);

  document.getElementById("saiHero").classList.toggle("hidden", !saiEnabled);
  document.getElementById("saiQuickActions").classList.toggle("hidden", !saiEnabled);
  document.getElementById("dot1").classList.toggle("active", !saiEnabled);
  document.getElementById("dot2").classList.toggle("active", saiEnabled);

  // Perinteisen näkymän bonusluvut
  document.getElementById("classicBonusAmount").textContent = fmtEur(p.bonus_eur || 6.84);
  document.getElementById("classicNextTier").textContent = fmtEur(p.bonus_next_tier_eur || 58.08);

  // S-AI-näkymän käyttövaraluvut
  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = `Turvallinen päivävara ~${fmtEur(s.daily_safe_to_spend_eur)} / pv`;
  const goal = p.active_goal;
  document.getElementById("goalCaption").textContent = goal
    ? `Tavoite: ${goal.name} (${goal.target_eur} €)`
    : `Katso 3 kulutuskoria & budjetti`;

  // Tilit ja kortit
  document.getElementById("accountBalance").textContent = detailsVisible ? fmtEur(s.account_balance_eur) : "••• €";

  // Kuitit Koti-näkymässä (ensimmäinen kuitti täsmälleen S-mobiilin tyyliin)
  const firstTx = (s.recent_transactions || [])[0];
  document.getElementById("homeReceiptCard").innerHTML = firstTx
    ? renderReceiptRow(firstTx)
    : `<div class="item-sub">Ei vielä kuitteja</div>`;

  // Kaikki kuitit Pankki- ja S-Etukortti-välilehdillä
  const allReceiptsHtml = (s.recent_transactions || []).map(renderReceiptRow).join('<div class="divider"></div>');
  document.getElementById("allReceiptsCard").innerHTML = allReceiptsHtml;
  document.getElementById("etukorttiReceipts").innerHTML = allReceiptsHtml;

  // Pankki-välilehden 3 koria
  const b = s.baskets_30d;
  document.getElementById("basketsCard").innerHTML = `
    <div class="row-between"><span class="item-title">1. Välttämättömät säännölliset</span><strong>${fmtEur(b.mandatory_regular_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">2. Välttämättömät epäsäännölliset (puskuri)</span><strong>${fmtEur(b.irregular_reserve_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">3. Arjen käyttöbudjetti (30 pv)</span><strong>${fmtEur(b.monthly_everyday_budget_eur)}</strong></div>
    <div class="divider"></div>
    <div class="row-between"><span class="item-title">Säästötavoite / kk</span><strong class="amount-green">${fmtEur(b.monthly_savings_target_eur)}</strong></div>
  `;

  // Kategoriat
  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:5px 0;"><span>${k}</span><strong>${fmtEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia</div>`;

  // Minä-välilehden kortit
  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${p.display_name || s.customer_id}</div>
    <div class="item-sub">${p.role_label || ""} · Kuukausitulot ${fmtEur(s.monthly_income_eur)}</div>
    <div class="divider"></div>
    <div class="item-sub">Tärkeät asiat: ${(p.priorities || []).join(", ")}</div>
  `;
  document.getElementById("meToggleSaiBtn").textContent = saiEnabled ? "Poista käytöstä" : "Aktivoi";
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
      <strong style="color:${tx.amount_eur > 0 ? "#007429" : "#18241d"}">${fmtEur(Math.abs(tx.amount_eur))}</strong>
    </div>`;
}

// --- 3. S-AI AKTIVOINTI & KÄYTTÖÖNOTTO ---
function openActivatePrompt() {
  document.getElementById("activateSaiModal").classList.remove("hidden");
}

function declineSaiActivation() {
  document.getElementById("activateSaiModal").classList.add("hidden");
}

function proceedToOnboarding() {
  document.getElementById("activateSaiModal").classList.add("hidden");
  openOnboarding();
}

function openOnboarding() {
  if (currentSnapshot?.profile?.monthly_savings_target_eur) {
    document.getElementById("savingsInput").value = currentSnapshot.profile.monthly_savings_target_eur;
  }
  document.getElementById("onboardingModal").classList.remove("hidden");
}

function closeOnboarding() {
  document.getElementById("onboardingModal").classList.add("hidden");
}

async function saveOnboarding() {
  const priorities = Array.from(document.querySelectorAll("#priorityChecks input:checked")).map((i) => i.value);
  const savings = Number(document.getElementById("savingsInput").value || 250);
  await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_id: currentCustomerId,
      s_ai_enabled: true,
      priorities,
      savings_goal_monthly_eur: savings,
    }),
  });
  closeOnboarding();
  await loadState();
  switchTab("home");
}

async function toggleSaiMode() {
  const nextState = !Boolean(currentSnapshot?.profile?.s_ai_enabled);
  if (nextState) {
    openActivatePrompt();
    return;
  }
  await fetch(`/api/toggle-sai/${currentCustomerId}?enabled=false`, { method: "POST" });
  await loadState();
}

function handleChatIconClick() {
  if (!currentSnapshot?.profile?.s_ai_enabled) {
    openActivatePrompt();
  } else {
    switchTab("chat");
  }
}

// --- 4. CHAT & HANKINTASUUNNITTELU ---
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

async function sendMessage(text) {
  if (!text.trim()) return;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: currentCustomerId, message: text }),
  });
  const data = await res.json();
  renderSnapshot(data.updated_state);
  await loadState();
}

async function applyPlan(card) {
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: currentCustomerId, ...card }),
  });
  const data = await res.json();
  renderSnapshot(data.snapshot);
  renderHistory(data.history);
  switchTab("home");
}

// --- 5. EXCEL-TUONTI ---
async function uploadExcelFile(targetCustId, file, statusEl) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/upload-excel/${targetCustId}`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json();
    statusEl.textContent = `Virhe: ${err.detail}`;
    return false;
  }
  statusEl.textContent = "Excel-tiliote ladattu!";
  return true;
}

async function uploadExcelFromMe() {
  const input = document.getElementById("excelFileInput");
  const statusEl = document.getElementById("excelStatus");
  if (!input.files.length) {
    statusEl.textContent = "Valitse ensin .xlsx-tiedosto.";
    return;
  }
  statusEl.textContent = "Ladataan...";
  const ok = await uploadExcelFile(currentCustomerId, input.files[0], statusEl);
  if (ok) {
    await loadState();
    switchTab("home");
  }
}

// --- 6. NAVIGOINTI ---
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
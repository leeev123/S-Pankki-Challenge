let currentCustomerId = null;
let currentSnapshot = null;
let currentHistory = [];
let detailsVisible = true;
let isSending = false;

let wizardStep = 1;
let wizardEntryStep = 1;
let wizardState = {
  goal: "Säästää tavoitteeseen",
  cutFrom: [],
  protect: [],
  monthlySavings: 60,
  targetAmount: 1200,
};

const GOAL_OPTIONS = [
  "Säästää tavoitteeseen",
  "Kasvattaa puskuria",
  "Pienentää arjen kuluja",
  "Pitää nykyinen taso",
];

const fmtEur = (n) =>
  Number(n || 0).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtWholeEur = (n) => Math.round(Number(n || 0)).toLocaleString("fi-FI") + " €";
const fmtBonus = (n) => Number(n || 0).toFixed(2).replace(".", ",").replace(/0$/, "") + " €";

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
  await fetch("/api/reset-all", { method: "POST" }).catch(() => {});
  await loadProfileGate();
});

async function logoutAndReset() {
  await fetch("/api/reset-all", { method: "POST" }).catch(() => {});
  currentCustomerId = null;
  currentSnapshot = null;
  currentHistory = [];
  detailsVisible = true;
  document.getElementById("onboardingScreen").classList.add("hidden");
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
    const customers = (await res.json()).customers || [];

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
    statusEl.textContent = `Virhe: ${err.message}`;
  }
}

async function selectProfile(customerId) {
  currentCustomerId = customerId;
  detailsVisible = true;
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

function getCustomerPurchaseCategories(s) {
  const list = (s.everyday_categories_list || []).filter((x) => x.amount_eur > 0);
  if (list.length > 0) return list;
  return Object.entries(s.everyday_categories_30d || {}).map(([label, amount_eur]) => ({ label, amount_eur }));
}

function getRecommendedMonthlySavings(s) {
  const curSave = Number(s.baskets_30d?.monthly_savings_target_eur || 0);
  const safeWk = Number(s.weekly_safe_to_spend_eur || 0);
  const maxTotalMo = Math.max(0, Math.floor((curSave + ((safeWk - 15) * 52) / 12) / 10) * 10);
  return Math.min(300, maxTotalMo);
}

function initWizardDefaults(s) {
  const p = s.profile || {};
  const userCats = getCustomerPurchaseCategories(s).map((c) => c.label);
  const recSave = getRecommendedMonthlySavings(s);

  const defaultProtect = userCats.includes("Ruokakauppa") ? ["Ruokakauppa"] : userCats.slice(0, 1);
  const defaultCut = userCats.filter((c) => !defaultProtect.includes(c)).slice(0, 2);

  wizardState = {
    goal: p.active_goal?.name && GOAL_OPTIONS.includes(p.active_goal.name) ? p.active_goal.name : "Säästää tavoitteeseen",
    cutFrom: p.onboarded && Array.isArray(p.cut_from) && p.cut_from.length ? [...p.cut_from] : defaultCut,
    protect: p.onboarded && Array.isArray(p.priorities) && p.priorities.length ? [...p.priorities] : defaultProtect,
    monthlySavings: p.onboarded ? Number(s.baskets_30d?.monthly_savings_target_eur || 0) : recSave,
    targetAmount: p.active_goal?.target_eur || 1200,
  };
}

function openOnboardingScreen(startStep = 1) {
  if (!currentSnapshot) return;
  initWizardDefaults(currentSnapshot);
  wizardEntryStep = startStep;
  wizardStep = startStep;
  renderOnboardingStep();
  document.getElementById("onboardingScreen").classList.remove("hidden");
}

function handleOnboardingBack() {
  if (wizardStep > wizardEntryStep) {
    wizardStep -= 1;
    renderOnboardingStep();
  } else {
    document.getElementById("onboardingScreen").classList.add("hidden");
  }
}

async function handleOnboardingNext() {
  if (wizardStep < 3) {
    wizardStep += 1;
    renderOnboardingStep();
  } else {
    await finishWizard();
  }
}

function renderOnboardingStep() {
  const s = currentSnapshot;
  if (!s) return;
  const b = s.baskets_30d;
  const userCats = getCustomerPurchaseCategories(s);

  document.getElementById("obStepText").textContent = `Vaihe ${wizardStep} / 3`;
  document.getElementById("obProgressFill").style.width = `${(wizardStep / 3) * 100}%`;
  document.getElementById("obBackLabel").textContent = wizardStep > wizardEntryStep ? "Takaisin" : "Sulje";
  document.getElementById("obNextBtn").textContent = wizardStep === 3 ? "Valmis" : "Jatka";

  const bodyEl = document.getElementById("obBody");

  if (wizardStep === 1) {
    const catRows = userCats
      .slice(0, 5)
      .map((c) => `<div class="ob-cat-row"><span>${escapeHtml(c.label)}</span><strong class="tabular">${fmtWholeEur(c.amount_eur)} / kk</strong></div>`)
      .join("");

    bodyEl.innerHTML = `
      <h2 class="ob-title">Kuukauden kulusi</h2>
      <p class="ob-subtitle">Tiliotteesi perusteella kuukauden tulot ja menot jakautuvat seuraavasti.</p>
      <div class="ob-summary-cards">
        <div class="ob-sum-tile"><span>Tulot</span><strong class="tabular">${fmtWholeEur(s.monthly_income_eur)}</strong></div>
        <div class="ob-sum-tile"><span>Kiinteät</span><strong class="tabular">${fmtWholeEur(b.mandatory_regular_eur)}</strong></div>
        <div class="ob-sum-tile"><span>Arki</span><strong class="tabular">${fmtWholeEur(s.average_everyday_monthly_eur || b.everyday_spent_eur)}</strong></div>
      </div>
      <div class="ob-section-label">Suurimmat arjen ostokategoriasi</div>
      <div class="ob-cat-list">${catRows || '<div class="item-sub">Ei arjen ostoja</div>'}</div>`;
  } else if (wizardStep === 2) {
    const goalRadios = GOAL_OPTIONS.map((opt) => {
      const sel = wizardState.goal === opt;
      return `
        <button type="button" class="ob-radio-btn ${sel ? "selected" : ""}" data-goal="${escapeHtml(opt)}" onclick="selectSingleGoal(this)">
          <span>${escapeHtml(opt)}</span>
          <span class="ob-radio-dot"></span>
        </button>`;
    }).join("");

    const cutPills = userCats
      .map((c) => {
        const sel = wizardState.cutFrom.includes(c.label);
        return `<button type="button" class="choice-pill ${sel ? "selected" : ""}" data-cat="${escapeHtml(c.label)}" data-group="cutFrom" onclick="toggleCategoryPill(this)">${escapeHtml(c.label)} · ${fmtWholeEur(c.amount_eur)}</button>`;
      })
      .join("");

    const protectPills = userCats
      .map((c) => {
        const sel = wizardState.protect.includes(c.label);
        return `<button type="button" class="choice-pill ${sel ? "selected" : ""}" data-cat="${escapeHtml(c.label)}" data-group="protect" onclick="toggleCategoryPill(this)">${escapeHtml(c.label)}</button>`;
      })
      .join("");

    bodyEl.innerHTML = `
      <h2 class="ob-title">Omat valinnat</h2>
      <p class="ob-subtitle">Valitse päätavoite sekä ostokategoriat toteutuneen kulutuksesi pohjalta.</p>

      <div class="ob-section-label" style="margin-top:4px;">Mitä haluaisit tehdä kuluillesi?</div>
      <div class="ob-radio-list" id="obGoalList">${goalRadios}</div>

      <div class="ob-section-label">Mistä ostoistasi voit tarvittaessa säästää?</div>
      <div class="pill-grid" id="obCutGrid">${cutPills}</div>

      <div class="ob-section-label">Mistä et halua tinkiä?</div>
      <div class="pill-grid" id="obProtectGrid">${protectPills}</div>`;
  } else {
    const currentSave = Number(b.monthly_savings_target_eur || 0);
    const projSafe = Math.round(s.weekly_safe_to_spend_eur - ((wizardState.monthlySavings - currentSave) * 12) / 52);
    const saveWk = Math.round((wizardState.monthlySavings * 12) / 52);
    const months = wizardState.monthlySavings > 0 ? Math.ceil(wizardState.targetAmount / wizardState.monthlySavings) : 0;
    const recMo = getRecommendedMonthlySavings(s);

    bodyEl.innerHTML = `
      <h2 class="ob-title">Aseta tavoitteesi</h2>
      <p class="ob-subtitle">Säädä kuukausisäästö ja tavoitesumma liukusäätimillä.</p>

      <div class="slider-block">
        <div class="slider-head">
          <span>Kuukausisäästö</span>
          <strong id="wizSaveLabel" class="tabular">${wizardState.monthlySavings} €/kk (${saveWk} €/vk)</strong>
        </div>
        <input id="wizSaveInput" type="range" class="suunta-range" min="0" max="500" step="10" value="${wizardState.monthlySavings}" oninput="onWizardSavingsSlide(this.value)" />
        <div class="slider-live-note">
          <span>Viikon käyttövara: <strong id="wizWeeklyPreview" class="tabular">${projSafe} €</strong></span>
          <span>Vuodessa: <strong id="wizYearlyPreview" class="tabular">+${wizardState.monthlySavings * 12} €</strong></span>
        </div>
        <div id="wizDeficitWarn" class="deficit-warn-box ${projSafe < 0 ? "" : "hidden"}">
          <span>Käyttövara menee miinukselle. Suositus enintään ${recMo} €/kk.</span>
          <button type="button" class="btn-subtle" onclick="applyRecommendedWizardSavings(${recMo})">Suositus</button>
        </div>
      </div>

      <div class="slider-block">
        <div class="slider-head">
          <span>Tavoitesumma</span>
          <strong id="wizTargetLabel" class="tabular">${fmtWholeEur(wizardState.targetAmount)}</strong>
        </div>
        <input type="range" class="suunta-range" min="300" max="3000" step="100" value="${wizardState.targetAmount}" oninput="onWizardTargetSlide(this.value)" />
        <div id="wizMonthsPreview" class="item-sub" style="margin-top:6px;">${months ? `Tavoite täyttyy noin ${months} kuukaudessa.` : "Aseta kuukausisäästö nähdäksesi aikataulun."}</div>
      </div>`;
  }
}

function selectSingleGoal(btnEl) {
  wizardState.goal = btnEl.dataset.goal;
  document.querySelectorAll("#obGoalList .ob-radio-btn").forEach((b) => {
    b.classList.toggle("selected", b === btnEl);
  });
}

function toggleCategoryPill(btnEl) {
  const cat = btnEl.dataset.cat;
  const group = btnEl.dataset.group;
  const otherGroup = group === "cutFrom" ? "protect" : "cutFrom";
  const otherContainerId = group === "cutFrom" ? "obProtectGrid" : "obCutGrid";

  const arr = wizardState[group];
  const idx = arr.indexOf(cat);
  if (idx >= 0) {
    arr.splice(idx, 1);
    btnEl.classList.remove("selected");
  } else {
    arr.push(cat);
    btnEl.classList.add("selected");
    const otherIdx = wizardState[otherGroup].indexOf(cat);
    if (otherIdx >= 0) {
      wizardState[otherGroup].splice(otherIdx, 1);
      document.querySelectorAll(`#${otherContainerId} .choice-pill`).forEach((b) => {
        if (b.dataset.cat === cat) b.classList.remove("selected");
      });
    }
  }
}

function applyRecommendedWizardSavings(recMo) {
  const input = document.getElementById("wizSaveInput");
  if (input) input.value = String(recMo);
  onWizardSavingsSlide(recMo);
}

function onWizardSavingsSlide(valRaw) {
  const val = Number(valRaw);
  wizardState.monthlySavings = val;
  const currentSave = Number(currentSnapshot?.baskets_30d?.monthly_savings_target_eur || 0);
  const curSafe = Number(currentSnapshot?.weekly_safe_to_spend_eur || 0);
  const projSafe = Math.round(curSafe - ((val - currentSave) * 12) / 52);
  const saveWk = Math.round((val * 12) / 52);
  const months = val > 0 ? Math.ceil(wizardState.targetAmount / val) : 0;

  document.getElementById("wizSaveLabel").textContent = `${val} €/kk (${saveWk} €/vk)`;
  document.getElementById("wizWeeklyPreview").textContent = `${projSafe} €`;
  document.getElementById("wizYearlyPreview").textContent = `+${val * 12} €`;
  document.getElementById("wizDeficitWarn").classList.toggle("hidden", projSafe >= 0);
  document.getElementById("wizMonthsPreview").textContent = months
    ? `Tavoite täyttyy noin ${months} kuukaudessa.`
    : "Aseta kuukausisäästö nähdäksesi aikataulun.";
}

function onWizardTargetSlide(valRaw) {
  const val = Number(valRaw);
  wizardState.targetAmount = val;
  const months = wizardState.monthlySavings > 0 ? Math.ceil(val / wizardState.monthlySavings) : 0;
  document.getElementById("wizTargetLabel").textContent = fmtWholeEur(val);
  document.getElementById("wizMonthsPreview").textContent = months
    ? `Tavoite täyttyy noin ${months} kuukaudessa.`
    : "Aseta kuukausisäästö nähdäksesi aikataulun.";
}

async function finishWizard() {
  if (!currentCustomerId) return;
  detailsVisible = false;
  await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statement_id: currentCustomerId,
      suunta_enabled: true,
      priorities: wizardState.protect.length ? wizardState.protect : ["Ruokakauppa"],
      cut_from: wizardState.cutFrom,
      savings_goal_name: wizardState.goal,
      savings_goal_monthly_eur: wizardState.monthlySavings,
    }),
  });
  document.getElementById("onboardingScreen").classList.add("hidden");
  switchTab("home");
  await loadState();
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSnapshot(s) {
  const p = s.profile || {};
  const onboarded = Boolean(p.onboarded);
  const suuntaEnabled = onboarded && Boolean(p.suunta_enabled);

  document.getElementById("heroSection").classList.toggle("compact-mode", suuntaEnabled);
  document.getElementById("fullBonusCollapse").classList.toggle("open", !suuntaEnabled);
  document.getElementById("compactBonusCollapse").classList.toggle("open", suuntaEnabled);
  document.getElementById("allowanceDrawer").classList.toggle("open", suuntaEnabled);
  document.getElementById("topQuickActions").classList.toggle("hidden", suuntaEnabled);

  document.getElementById("suuntaInviteCard").classList.toggle("hidden", onboarded);
  document.getElementById("homeSuuntaCard").classList.toggle("hidden", !onboarded);

  if (onboarded) {
    document.getElementById("suuntaPausedBody").classList.toggle("hidden", suuntaEnabled);
    document.getElementById("suuntaOnBody").classList.toggle("hidden", !suuntaEnabled);
    document.getElementById("suuntaExpandBtn").classList.toggle("hidden", !suuntaEnabled);
    document.getElementById("suuntaDot").classList.toggle("active", suuntaEnabled);
    const sw = document.getElementById("homeSuuntaSwitch");
    sw.classList.toggle("on", suuntaEnabled);
    sw.setAttribute("aria-checked", String(suuntaEnabled));
  }

  const bonusStr = fmtBonus(p.bonus_eur || 23.4);
  const nextTierStr = fmtBonus(p.bonus_next_tier_eur || 56.7);
  document.getElementById("classicBonusAmount").textContent = bonusStr;
  document.getElementById("classicNextTier").textContent = nextTierStr;
  document.getElementById("compactBonusAmount").textContent = bonusStr;
  document.getElementById("compactNextTier").textContent = nextTierStr;
  document.getElementById("etukorttiBonusAmount").textContent = bonusStr;
  document.getElementById("etukorttiNextTier").textContent = nextTierStr;

  const isDeficit = s.weekly_safe_to_spend_eur < 0;
  document.getElementById("allowanceBanner").classList.toggle("deficit", isDeficit);
  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = `Käytetty ${fmtWholeEur(s.spent_this_week_eur)} · Viikkobudjetti ${fmtWholeEur(s.weekly_budget_eur)}`;
  document.getElementById("allowanceStatusTag").textContent = isDeficit
    ? "Ylitetty – tarkista budjetti"
    : `~${fmtWholeEur(s.daily_safe_to_spend_eur)} / pv`;
  document.getElementById("chatHeaderAllowance").textContent = `Viikon käyttövara ${fmtEur(s.weekly_safe_to_spend_eur)}`;

  const usedRatio = s.weekly_budget_eur > 0 ? Math.min(100, Math.round((s.spent_this_week_eur / s.weekly_budget_eur) * 100)) : 100;
  document.getElementById("allowanceMeterFill").style.width = suuntaEnabled ? `${usedRatio}%` : "0%";

  const goal = p.active_goal;
  document.getElementById("goalCaption").textContent = goal ? `${goal.name}` : "Kokonaiskuva";

  document.getElementById("accountBalance").textContent = detailsVisible ? fmtEur(s.account_balance_eur) : "•••• €";
  document.getElementById("toggleDetailsBtn").textContent = detailsVisible ? "Piilota tiedot" : "Näytä tiedot";

  const firstTx = (s.recent_transactions || [])[0];
  document.getElementById("homeReceiptCard").innerHTML = firstTx ? renderReceiptRow(firstTx) : `<div class="item-sub">Ei tapahtumia</div>`;

  const allReceiptsHtml = (s.recent_transactions || []).map(renderReceiptRow).join('<div class="divider"></div>');
  document.getElementById("allReceiptsCard").innerHTML = allReceiptsHtml;
  document.getElementById("etukorttiReceipts").innerHTML = allReceiptsHtml;

  renderBasketsSection(s);
  renderOpportunitiesSection(s);

  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:6px 0;"><span>${escapeHtml(k)}</span><strong class="tabular nowrap">${fmtWholeEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">Ei arjen tapahtumia jaksolla.</div>`;

  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${escapeHtml(s.role_label)} · ${escapeHtml(s.display_name)}</div>
    <div class="item-sub">${escapeHtml(p.customer_age)} v · ${escapeHtml(p.customer_postal_code)} · Tulot keskim. ${fmtWholeEur(s.monthly_income_eur)}/kk</div>
    <div class="divider"></div>
    <div class="item-sub">Suojatut kohteet: <strong>${escapeHtml((p.priorities || []).join(", "))}</strong></div>`;

  document.getElementById("meSuuntaSettingsCard").innerHTML = onboarded
    ? `<div class="row-between">
         <div>
           <div class="item-title">Suunta-talousvalmentaja</div>
           <div class="item-sub">Piilottaa kokonaissaldon ja näyttää viikon käyttövaran</div>
         </div>
         <button type="button" class="toggle-switch ${suuntaEnabled ? "on" : ""}" role="switch" aria-checked="${suuntaEnabled}" onclick="toggleSuuntaMode()">
           <span class="toggle-thumb"></span>
         </button>
       </div>
       <div class="divider"></div>
       <button class="center-link" onclick="openOnboardingScreen(2)">Muokkaa tavoitteita</button>`
    : `<div class="row-between">
         <div>
           <div class="item-title">Suunta ei ole vielä käytössä</div>
           <div class="item-sub">Ota käyttöön vastaamalla muutamaan kysymykseen</div>
         </div>
         <button type="button" class="btn-primary" onclick="openOnboardingScreen(1)">Ota käyttöön</button>
       </div>`;
}

function toggleQuickPurchase() {
  const box = document.getElementById("quickPurchaseBox");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) {
    document.getElementById("qpName").focus();
  }
}

function submitQuickPurchase() {
  const name = document.getElementById("qpName").value.trim() || "hankinta";
  const price = Number(document.getElementById("qpPrice").value || 0);
  document.getElementById("quickPurchaseBox").classList.add("hidden");
  document.getElementById("qpName").value = "";
  document.getElementById("qpPrice").value = "";
  if (price > 0) {
    sendMessage(`Haluan ostaa ${price} € kohteen: ${name}`);
  } else {
    sendMessage(`Haluan hankkia kohteen: ${name}`);
  }
}

function handleTopChatClick() {
  if (!currentSnapshot?.profile?.onboarded) {
    openOnboardingScreen(1);
    return;
  }
  if (!currentSnapshot?.profile?.suunta_enabled) {
    setSuuntaEnabled(true).then(() => switchTab("chat"));
    return;
  }
  switchTab("chat");
}

function renderBasketsSection(s) {
  const b = s.baskets_30d;
  const p = s.profile || {};
  const fc = s.forecast_6m || [];
  const lastFc = fc[fc.length - 1];
  const totalOut = Math.max(1, b.mandatory_regular_eur + b.irregular_reserve_eur + b.monthly_everyday_budget_eur);
  const pct1 = Math.min(100, Math.round((b.mandatory_regular_eur / totalOut) * 100));
  const pct2 = Math.min(100, Math.round((b.irregular_reserve_eur / totalOut) * 100));
  const pct3 = Math.min(100, Math.round((b.monthly_everyday_budget_eur / totalOut) * 100));
  const savePerWeek = Math.round((b.monthly_savings_target_eur * 12) / 52);

  document.getElementById("basketsCard").innerHTML = `
    <div class="overview-stats">
      <div class="stat-card">
        <div class="stat-card-label">Puskuri nyt</div>
        <div class="stat-card-val tabular">${fmtWholeEur(p.current_buffer_eur || 850)}</div>
        <div class="stat-card-sub">${lastFc ? `6 kk ennuste ${fmtWholeEur(lastFc.buffer_eur)}` : "Turvapuskuri"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Säästötavoite</div>
        <div class="stat-card-val green tabular">+${fmtWholeEur(b.monthly_savings_target_eur)}<small style="font-size:13px;font-weight:500;">/kk</small></div>
        <div class="stat-card-sub">noin ${savePerWeek} € / vk</div>
      </div>
    </div>
    <div class="baskets-clean-card">
      <div class="basket-row-card" style="padding-top:2px;">
        <div class="basket-head"><span class="basket-name">1. Kiinteät menot</span><span class="basket-eur tabular">${fmtWholeEur(b.mandatory_regular_eur)} / kk</span></div>
        <div class="basket-desc"><span>Asuminen, laskut ja sopimukset</span><span>${pct1} %</span></div>
        <div class="basket-bar-track"><div class="basket-bar-fill muted" style="width:${pct1}%"></div></div>
      </div>
      <div class="basket-row-card">
        <div class="basket-head"><span class="basket-name">2. Yllättävien menojen varaus</span><span class="basket-eur tabular">${fmtWholeEur(b.irregular_reserve_eur)} / kk</span></div>
        <div class="basket-desc"><span>Terveys, apteekki ja huollot</span><span>${pct2} %</span></div>
        <div class="basket-bar-track"><div class="basket-bar-fill soft" style="width:${pct2}%"></div></div>
      </div>
      <div class="basket-row-card" style="padding-bottom:2px;">
        <div class="basket-head"><span class="basket-name">3. Arjen käyttöraha</span><span class="basket-eur tabular" style="color:var(--s-green);">${fmtWholeEur(b.monthly_everyday_budget_eur)} / kk</span></div>
        <div class="basket-desc"><span>Ruoka, liikkuminen ja vapaa-aika</span><strong>${fmtWholeEur(s.weekly_budget_eur)} / vk</strong></div>
        <div class="basket-bar-track"><div class="basket-bar-fill" style="width:${pct3}%"></div></div>
      </div>
    </div>`;
}

function renderOpportunitiesSection(s) {
  const opps = s.savings_opportunities || [];
  const el = document.getElementById("opportunitiesCard");
  if (!opps.length) {
    el.innerHTML = `<div class="item-sub">Valitsemasi prioriteetit suojaavat suurimmat arjen kategoriat.</div>`;
    return;
  }
  el.innerHTML = opps
    .map((o, idx) => {
      const avg = Number(o.monthly_average_eur || 0);
      const save20 = Math.round(avg * 0.2);
      const save20Wk = Math.max(1, Math.round((save20 * 12) / 52));
      return `
        <div class="slider-block" style="margin-bottom:${idx === opps.length - 1 ? 0 : 10}px;">
          <div class="slider-head">
            <span><strong>${escapeHtml(o.category_fi)}</strong> (${fmtWholeEur(avg)}/kk)</span>
            <strong id="oppVal_${idx}" class="tabular">-20 % · +${save20} €/kk</strong>
          </div>
          <input type="range" class="suunta-range" min="5" max="50" step="5" value="20" oninput="updateOppSlider(${idx}, ${avg}, this.value)" />
          <div class="row-between" style="margin-top:6px;">
            <span id="oppSub_${idx}" class="item-sub">Vapauttaa ${save20Wk} €/vk (${save20 * 12} €/v)</span>
            <button id="oppBtn_${idx}" class="btn-subtle" data-pct="20" onclick="applyQuickCategoryCut('${escapeHtml(o.category_fi)}', ${avg}, this.dataset.pct)">Ota käyttöön</button>
          </div>
        </div>`;
    })
    .join("");
}

function updateOppSlider(idx, avgMonthly, pctRaw) {
  const pct = Number(pctRaw);
  const saveMo = Math.round((avgMonthly * pct) / 100);
  const saveWk = Math.max(1, Math.round((saveMo * 12) / 52));
  document.getElementById(`oppVal_${idx}`).textContent = `-${pct} % · +${saveMo} €/kk`;
  document.getElementById(`oppSub_${idx}`).textContent = `Vapauttaa ${saveWk} €/vk (${saveMo * 12} €/v)`;
  document.getElementById(`oppBtn_${idx}`).dataset.pct = String(pct);
}

async function applyQuickCategoryCut(labelFi, avgMonthly, pctRaw) {
  const pct = Number(pctRaw || 20);
  const saveMo = Math.max(1, Math.round((avgMonthly * pct) / 100));
  const saveWk = Math.max(1, Math.round((saveMo * 12) / 52));
  await applyPlanObject({
    plan_id: `quick_cut_${labelFi}_${pct}`,
    title: `${labelFi} -${pct} %`,
    summary: `Siirretään ${saveWk} €/vk (${saveMo} €/kk) säästöön.`,
    impact_weekly_eur: -saveWk,
    monthly_savings_delta_eur: saveMo,
    everyday_budget_delta_eur: -saveMo,
    buffer_delta_eur: 0,
  });
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

async function setSuuntaEnabled(enable) {
  if (!currentCustomerId) return;
  detailsVisible = !enable;
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

function renderActionCard(c) {
  const encoded = encodeURIComponent(JSON.stringify(c));
  const monthsBadge = c.impact_savings_months ? `<span class="impact-pill neutral">${c.impact_savings_months} kk</span>` : "";
  const wkVal = Math.round(Number(c.impact_weekly_eur || 0));
  const wkBadge = `<span class="impact-pill">${wkVal > 0 ? "+" : ""}${wkVal} €/vk</span>`;

  return `
    <div class="action-card">
      <div class="action-card-top">
        <h4>${escapeHtml(c.title)}</h4>
        <span class="badge-pair">${monthsBadge}${wkBadge}</span>
      </div>
      <p>${escapeHtml(c.summary)}</p>
      <button class="apply-btn" onclick="applyPlanEncoded('${encoded}')">Valitse tämä</button>
    </div>`;
}

function renderCustomPurchaseSlider(cards, uid) {
  const first = cards[0];
  if (!first || !first.goal_target_eur || cards.length < 2) return "";
  const price = Number(first.goal_target_eur);
  const goalName = first.goal_name || "Hankinta";
  const currentMoSave = Number(currentSnapshot?.baskets_30d?.monthly_savings_target_eur || 0);
  const initWkCut = 20;
  const initMoDelta = Math.round((initWkCut * 52) / 12);
  const initMonths = Math.max(1, Math.ceil(price / Math.max(10, currentMoSave + initMoDelta)));

  return `
    <div class="action-card" style="background:#f7fbf8;">
      <div class="action-card-top">
        <h4>Säädä oma tahti</h4>
        <span class="badge-pair">
          <span id="cMonths_${uid}" class="impact-pill neutral">${initMonths} kk</span>
          <span id="cWeek_${uid}" class="impact-pill">-${initWkCut} €/vk</span>
        </span>
      </div>
      <input type="range" class="suunta-range" min="5" max="80" step="5" value="${initWkCut}" oninput="updatePurchaseSlider('${uid}', ${price}, ${currentMoSave}, this.value)" />
      <p id="cDesc_${uid}" style="margin-top:4px;">Lisäsäästö -${initWkCut} €/vk (-${initMoDelta} €/kk arjesta) · valmis ${initMonths} kk kuluttua.</p>
      <button id="cBtn_${uid}" class="apply-btn" data-wk="${initWkCut}" onclick="applyCustomSliderPlan('${uid}', '${escapeHtml(goalName)}', ${price})">Ota oma tahti käyttöön</button>
    </div>`;
}

function updatePurchaseSlider(uid, price, currentMoSave, wkRaw) {
  const wk = Number(wkRaw);
  const moDelta = Math.round((wk * 52) / 12);
  const months = Math.max(1, Math.ceil(price / Math.max(10, currentMoSave + moDelta)));

  document.getElementById(`cMonths_${uid}`).textContent = `${months} kk`;
  document.getElementById(`cWeek_${uid}`).textContent = `-${wk} €/vk`;
  document.getElementById(`cDesc_${uid}`).textContent = `Lisäsäästö -${wk} €/vk (-${moDelta} €/kk arjesta) · valmis ${months} kk kuluttua.`;
  document.getElementById(`cBtn_${uid}`).dataset.wk = String(wk);
}

async function applyCustomSliderPlan(uid, goalName, price) {
  const wk = Number(document.getElementById(`cBtn_${uid}`)?.dataset.wk || 20);
  const moDelta = Math.round((wk * 52) / 12);
  await applyPlanObject({
    plan_id: `custom_slider_${Math.round(price)}_${wk}`,
    title: `Oma tahti (-${wk} €/vk)`,
    monthly_savings_delta_eur: moDelta,
    everyday_budget_delta_eur: -moDelta,
    buffer_delta_eur: 0,
    goal_name: goalName,
    goal_target_eur: price,
  });
}

function buildDeficitGreeting(s) {
  const deficitAbs = Math.max(5, Math.ceil(Math.abs(s.weekly_safe_to_spend_eur)));
  const curSaveMo = Number(s.baskets_30d?.monthly_savings_target_eur || 0);
  const neededMoRelief = Math.min(curSaveMo, Math.ceil(((deficitAbs + 15) * 52) / 12 / 10) * 10);
  const reliefWk = Math.round((neededMoRelief * 12) / 52);

  let recoveryCards = "";
  if (neededMoRelief >= 10) {
    recoveryCards += renderActionCard({
      plan_id: "relieve_savings_deficit",
      title: `Kevennä säästöä (-${neededMoRelief} €/kk)`,
      summary: `Vapauttaa +${reliefWk} €/vk arkeen, jolloin viikkobudjetti nousee plussalle.`,
      impact_weekly_eur: reliefWk,
      impact_savings_months: null,
      monthly_savings_delta_eur: -neededMoRelief,
      everyday_budget_delta_eur: neededMoRelief,
      buffer_delta_eur: 0,
    });
  }

  recoveryCards += renderActionCard({
    plan_id: `cover_week_deficit_${deficitAbs}`,
    title: `Tasaa ylitys puskurista (${deficitAbs} €)`,
    summary: `Siirtää ${deficitAbs} € puskurista tälle viikolle.`,
    impact_weekly_eur: deficitAbs,
    impact_savings_months: 1,
    monthly_savings_delta_eur: 0,
    everyday_budget_delta_eur: Math.round((deficitAbs * 52) / 12),
    buffer_delta_eur: -deficitAbs,
  });

  return `
    <div class="msg-group assistant">
      <div class="msg assistant warn">Viikon käyttövarasi on miinuksella. Valitse sopiva korjausliike tai muuta budjettia:</div>
      <div class="action-cards-stack">${recoveryCards}</div>
    </div>`;
}

function renderHistory(history, showLoading = false) {
  const streams = [
    { el: document.getElementById("chatMessages"), prefix: "full" },
    { el: document.getElementById("homeChatMessages"), prefix: "home" },
  ];

  const isDeficit = currentSnapshot && currentSnapshot.weekly_safe_to_spend_eur < 0;
  const greeting = isDeficit
    ? buildDeficitGreeting(currentSnapshot)
    : `<div class="msg-group assistant"><div class="msg assistant">Miten voin auttaa?</div></div>`;

  for (const { el, prefix } of streams) {
    if (!el) continue;

    const messagesHtml = history.length
      ? history
          .map((m, idx) => {
            const isUser = m.role === "user";
            const cards = m.action_cards || [];
            const uid = `${prefix}_${idx}`;
            const cardsHtml = cards.length
              ? `<div class="action-cards-stack">${cards.map(renderActionCard).join("")}${renderCustomPurchaseSlider(cards, uid)}</div>`
              : "";
            return `
              <div class="msg-group ${isUser ? "user" : "assistant"}">
                <div class="msg ${isUser ? "user" : "assistant"}">${formatMessageText(m.content)}</div>
                ${cardsHtml}
              </div>`;
          })
          .join("")
      : greeting;

    const loadingHtml = showLoading
      ? `<div class="msg-group assistant">
           <div class="typing-bubble"><span>Lasketaan</span><span class="typing-dots"><span></span><span></span><span></span></span></div>
         </div>`
      : "";

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

async function applyPlanObject(planPayload) {
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement_id: currentCustomerId, ...planPayload }),
  });
  const data = await res.json();
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

async function applyPlanEncoded(encoded) {
  const card = JSON.parse(decodeURIComponent(encoded));
  await applyPlanObject(card);
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

document.getElementById("qpPrice").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitQuickPurchase();
  }
});
let sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
let currentCustomerId = null;
let cachedCustomers = [];
let currentSnapshot = null;
let currentHistory = [];
let detailsVisible = true;
let isSending = false;
let inviteDismissed = false;
let deficitFollowupDismissed = false;
let homeChatCollapsed = false;
let currentLang = "fi";

let wizardStep = 1;
let wizardEntryStep = 1;
let budgetEditOnlyMode = false;
let wizardState = {
  incomeEur: 0,
  fixedEur: 0,
  everydayEur: 0,
  goal: "Säästää tavoitteeseen",
  cutFrom: [],
  protect: [],
  monthlySavings: 50,
  targetAmount: 1200,
  savingsManuallyAdjusted: false,
  targetManuallyAdjusted: false,
};

const SBANK_MEDIAN_EUR = 50;

const I18N = {
  fi: {
    gateTitle: "Valitse asiakasprofiili",
    gateSub: "Viikkobudjetti muodostetaan asiakkaan todellisista varoista ja kulutuksesta.",
    yrs: "v",
    balance: "Saldo",
    back: "Takaisin",
    close: "Sulje",
    next: "Jatka",
    done: "Valmis",
    save: "Tallenna",
    saveChanges: "Tallenna muutokset",
    stepOf: (s) => `Vaihe ${s} / 3`,
    unsupportedHeading: "Demo-versio ei tue tätä ominaisuutta",
    unsupportedBody: "Tämä näkymä ei ole käytössä Suunta-esittelyversiossa.",
    editGoalTitle: "Muokkaa säästötavoitetta",
    goalNameLbl: "Tavoitteen nimi",
    goalTargetLbl: "Tavoitesumma (€)",
    savingTimeLbl: "Säästöaika",
    savingRateLbl: "Säästöerä",
    wkBudgetShort: "Viikkobudjetti",
    deleteGoal: "Poista tavoite",
    nextTierIn: "Seuraavaan tasoon",
    nextTierShort: "Seuraavaan tasoon",
    nextTierSub: "Saatat jo olla seuraavalla bonustasolla",
    bonusIncoming: "Bonusta tulossa",
    viewTotalBenefit: "Katso kokonaishyötysi",
    tierProgress: "Taso 3,5 % → 4,0 %",
    weeklyRemaining: "Viikon jäljellä oleva käyttövara",
    deficitPromptText: "Viikkobudjettisi on alijäämäinen. Haluatko muokata valintojasi?",
    deficitPromptBtn: "Muokkaa valintoja keskustelussa",
    qaNewPayment: "Uusi maksu",
    qaNearby: "Edut lähellä",
    qaSaved: "Tallennetut edut",
    inviteTitle: "Haluatko ottaa Suunnan käyttöön?",
    inviteLead: "Rakenna oma viikkobudjetti ja säästötavoite toteutuneiden ostojesi pohjalta.",
    inviteBtn: "Ota Suunta käyttöön",
    expand: "Laajenna",
    suuntaPaused: "Suunta on pois päältä. Kytke takaisin päälle nähdäksesi viikon käyttövarasi.",
    btnChangeBudget: "Muuta budjettia",
    btnChangeBudgetSub: "Tavoite, tulot & menot",
    btnNewPurchase: "Uusi hankinta",
    btnNewPurchaseSub: "Laske toteutustavat",
    whatBuying: "Mitä hankit?",
    priceEur: "Hinta €",
    calculate: "Laske",
    howCanIHelp: "Miten voin auttaa?",
    hideHistorySlim: "Piilota keskustelu",
    send: "Lähetä",
    accountsAndCards: "Tilit ja kortit",
    hideDetails: "Piilota tiedot",
    showDetails: "Näytä tiedot",
    receipts: "Kuitit",
    open: "Avaa",
    recentPurchases: "Viimeisimmät ostot",
    financialOverview: "Talouden kokonaiskuva",
    savingsComparison: "Säästövertailu",
    everydayByCat: "Arjen menot kategorioittain",
    transactions: "Tilitapahtumat",
    customerProfile: "Asiakasprofiili",
    suuntaSettings: "Suunta-asetukset",
    switchProfileReset: "Vaihda asiakasprofiilia (Nollaa istunto)",
    navHome: "Koti",
    navBank: "Pankki",
    navMe: "Minä",
    spentOfWk: (sp, wb) => `Käytetty ${sp} · Viikkobudjetti ${wb}`,
    inDeficit: "Alijäämäinen",
    perDay: (d) => `~${d} / pv`,
    goalPrefix: (g) => `Tavoite: ${g}`,
    setGoal: "Aseta tavoite",
    wkAllowHeader: (v) => `Viikon käyttövara ${v}`,
    doneHideChat: "Valmis – piilota keskustelu",
    doneReturnHome: "Valmis – palaa kotinäkymään",
    chosenBtn: "Valittu ✓",
    optionChosenBtn: "Vaihtoehto valittu",
    chooseThisBtn: "Valitse tämä",
    customPaceTitle: "Säädä oma tahti",
    applyCustomBtn: "Ota oma tahti käyttöön",
    customDesc: (mo, wb) => `Säästöerä ${mo} €/kk · uusi viikkobudjetti ${wb} €/vk.`,
    customDefWarn: (wb) => `Tämä tahti vie viikkobudjetin alijäämäiseksi (${wb} €/vk).`,
    computing: "Lasketaan",
    moUnit: "kk",
    yrUnit: "v",
    perWk: "/vk",
    perMo: "/kk",
    ob1Title: "Kuukauden tulot ja menot",
    ob1Sub: "Tarkista tiliotteeltasi tunnistetut kuukausitulot ja menot. Voit tarvittaessa muokata lukuja.",
    incomeMo: "Tulot / kk",
    salaryBenefits: "Palkka ja etuudet",
    expensesMo: "Menot / kk",
    fixed: "Kiinteät",
    everyday: "Arki",
    editIoBtn: "Muokkaa tuloja tai menoja",
    largestFixed: "Suurimmat kiinteät menot",
    yourEverydayCats: "Arjen ostokategoriasi",
    gapNotice: (g) => `Menot ylittävät tulot ${g}/kk. Suunta selvittää kanssasi erotuksen rahoituksen ja laskee kestävän viikkobudjetin.`,
    ob2Title: "Omat valinnat",
    ob2Sub: "Määritä päätavoitteesi ja ostokategoriat toteutuneen kulutuksesi pohjalta.",
    whatIsGoal: "Mikä on tavoitteesi?",
    whereSave: "Mistä ostoistasi voit tarvittaessa säästää?",
    whereSaveHint: "Valitse kategoriat, joissa on joustovaraa",
    whereProtect: "Mistä et halua tinkiä?",
    whereProtectHint: "Suunta suojaa nämä kategoriat leikkausehdotuksilta",
    ob3Title: "Aseta tavoitteesi",
    ob3Sub: "Säädä kuukausisäästö ja tavoitesumma liukusäätimillä. S-Pankin asiakkaiden mediaanisäästö oli 50 €/kk (31.1.2026).",
    monthlySaving: "Kuukausisäästö",
    wkAllowance: "Viikon käyttövara",
    perYear: "Vuodessa",
    wizDefWarn: (r) => `Säästötahti vie viikon käyttövaran miinukselle. Suositus enintään ${r.toLocaleString("fi-FI")} €/kk.`,
    recommendBtn: "Suositus",
    targetSum: "Tavoitesumma",
    targetFilledIn: (lbl) => `Tavoite täyttyy noin ${lbl} kuluessa.`,
    setSavingForTime: "Aseta kuukausisäästö nähdäksesi aikataulun.",
    bufferNow: "Puskuri nyt",
    forecast6m: (v) => `6 kk ennuste ${v}`,
    savingsGoal: "Säästötavoite",
    approxPerWk: (w) => `noin ${w.toLocaleString("fi-FI")} € / vk`,
    b1Name: "1. Kiinteät menot",
    b1Desc: "Asuminen, laskut ja sopimukset",
    b2Name: "2. Yllättävien menojen varaus",
    b2Desc: "Terveys, apteekki ja huollot",
    b3Name: "3. Arjen käyttöraha",
    b3Desc: "Ruoka, liikkuminen ja vapaa-aika",
    cmpTitle: "Sinä verrattuna muihin säästäjiin",
    cmpYour: "Sinun kuukausisäästösi",
    cmpMedian: "S-Pankin asiakkaiden mediaani (31.1.2026)",
    cmpAbove: (d) => `+${d.toLocaleString("fi-FI")} € yli mediaanin`,
    cmpAt: "Mediaanitasolla",
    cmpBelow: (d) => `${d.toLocaleString("fi-FI")} € mediaaniin`,
    cmpNoteAbove: (d) => `Säästät kuukaudessa <strong>${d.toLocaleString("fi-FI")} € enemmän</strong> kuin S-Pankin asiakkaat keskimäärin (mediaani 50 €/kk, 31.1.2026).`,
    cmpNoteAt: "Kuukausisäästösi vastaa S-Pankin asiakkaiden mediaania (50 €/kk, 31.1.2026).",
    cmpNoteBelow: (d) => `S-Pankin asiakkaiden mediaanisäästö oli <strong>50 €/kk</strong> (31.1.2026). Jo +${d.toLocaleString("fi-FI")} €/kk nostaa sinut mediaanitasolle.`,
    meCoachTitle: "Suunta-talousvalmentaja",
    meCoachSub: "Piilottaa kokonaissaldon ja näyttää viikon käyttövaran",
    meCoachOffSub: "Ota käyttöön vastaamalla muutamaan kysymykseen",
    enableBtn: "Ota käyttöön",
    editGoalsBtn: "Muokkaa tavoitteita",
    protectedItems: "Suojatut kohteet",
    incExpLine: (a, i, e) => `${a} v · Tulot ${i}/kk · Menot ${e}/kk`,
    deficitBankWarn: (d) => `Kuukausimenot ylittävät säännölliset tulot <strong>${d}/kk</strong>. Viikkobudjetti perustuu käytettävissä oleviin varoihin.`,
  },
  en: {
    gateTitle: "Select customer profile",
    gateSub: "Your weekly budget is built from real available funds and actual spending.",
    yrs: "yrs",
    balance: "Balance",
    back: "Back",
    close: "Close",
    next: "Continue",
    done: "Done",
    save: "Save",
    saveChanges: "Save changes",
    stepOf: (s) => `Step ${s} / 3`,
    unsupportedHeading: "This feature is not supported in the demo version",
    unsupportedBody: "This view is disabled in the Suunta showcase demo.",
    editGoalTitle: "Edit savings goal",
    goalNameLbl: "Goal name",
    goalTargetLbl: "Target amount (€)",
    savingTimeLbl: "Timeline",
    savingRateLbl: "Saving rate",
    wkBudgetShort: "Weekly budget",
    deleteGoal: "Delete goal",
    nextTierIn: "Next tier in",
    nextTierShort: "Next tier in",
    nextTierSub: "You may already be on the next bonus tier",
    bonusIncoming: "Bonus accruing",
    viewTotalBenefit: "View total benefit",
    tierProgress: "Tier 3.5% → 4.0%",
    weeklyRemaining: "Remaining weekly allowance",
    deficitPromptText: "Your weekly budget is in deficit. Would you like to adjust your choices?",
    deficitPromptBtn: "Adjust choices in chat",
    qaNewPayment: "New payment",
    qaNearby: "Nearby benefits",
    qaSaved: "Saved benefits",
    inviteTitle: "Would you like to enable Suunta?",
    inviteLead: "Build your weekly budget and savings goal based on your actual purchases.",
    inviteBtn: "Enable Suunta",
    expand: "Expand",
    suuntaPaused: "Suunta is turned off. Switch back on to view your weekly allowance.",
    btnChangeBudget: "Adjust budget",
    btnChangeBudgetSub: "Goal, income & expenses",
    btnNewPurchase: "New purchase",
    btnNewPurchaseSub: "Calculate options",
    whatBuying: "What are you buying?",
    priceEur: "Price €",
    calculate: "Calculate",
    howCanIHelp: "How can I help?",
    hideHistorySlim: "Hide chat",
    send: "Send",
    accountsAndCards: "Accounts and cards",
    hideDetails: "Hide details",
    showDetails: "Show details",
    receipts: "Receipts",
    open: "Open",
    recentPurchases: "Recent purchases",
    financialOverview: "Financial overview",
    savingsComparison: "Savings comparison",
    everydayByCat: "Everyday spending by category",
    transactions: "Transactions",
    customerProfile: "Customer profile",
    suuntaSettings: "Suunta settings",
    switchProfileReset: "Switch customer profile (Reset session)",
    navHome: "Home",
    navBank: "Bank",
    navMe: "Me",
    spentOfWk: (sp, wb) => `Spent ${sp} · Weekly budget ${wb}`,
    inDeficit: "In deficit",
    perDay: (d) => `~${d} / day`,
    goalPrefix: (g) => `Goal: ${g}`,
    setGoal: "Set goal",
    wkAllowHeader: (v) => `Weekly allowance ${v}`,
    doneHideChat: "Done – hide chat",
    doneReturnHome: "Done – back to home",
    chosenBtn: "Selected ✓",
    optionChosenBtn: "Option selected",
    chooseThisBtn: "Choose this",
    customPaceTitle: "Adjust your own pace",
    applyCustomBtn: "Apply custom pace",
    customDesc: (mo, wb) => `Saving ${mo} €/mo · new weekly budget ${wb} €/wk.`,
    customDefWarn: (wb) => `This pace puts your weekly budget in deficit (${wb} €/wk).`,
    computing: "Calculating",
    moUnit: "mo",
    yrUnit: "yr",
    perWk: "/wk",
    perMo: "/mo",
    ob1Title: "Monthly income and expenses",
    ob1Sub: "Review the monthly income and expenses detected from your statement. You can edit the numbers if needed.",
    incomeMo: "Income / mo",
    salaryBenefits: "Salary and benefits",
    expensesMo: "Expenses / mo",
    fixed: "Fixed",
    everyday: "Everyday",
    editIoBtn: "Edit income or expenses",
    largestFixed: "Largest fixed expenses",
    yourEverydayCats: "Your everyday categories",
    gapNotice: (g) => `Expenses exceed income by ${g}/mo. Suunta will discuss how you fund the gap and build a sustainable weekly budget.`,
    ob2Title: "Your preferences",
    ob2Sub: "Select your main goal and spending categories based on your actual history.",
    whatIsGoal: "What is your goal?",
    whereSave: "Where can you save if needed?",
    whereSaveHint: "Select categories with room for flexibility",
    whereProtect: "What won't you compromise on?",
    whereProtectHint: "Suunta protects these categories from cut suggestions",
    ob3Title: "Set your goal",
    ob3Sub: "Adjust your monthly saving and target amount. The S-Pankki customer median saving was 50 €/mo (31.1.2026).",
    monthlySaving: "Monthly saving",
    wkAllowance: "Weekly allowance",
    perYear: "Per year",
    wizDefWarn: (r) => `This saving pace puts your weekly allowance in deficit. Recommended max ${r.toLocaleString("en-IE")} €/mo.`,
    recommendBtn: "Recommended",
    targetSum: "Target amount",
    targetFilledIn: (lbl) => `Goal reached in about ${lbl}.`,
    setSavingForTime: "Set monthly saving to see timeline.",
    bufferNow: "Buffer now",
    forecast6m: (v) => `6 mo forecast ${v}`,
    savingsGoal: "Savings goal",
    approxPerWk: (w) => `approx. ${w.toLocaleString("en-IE")} € / wk`,
    b1Name: "1. Fixed expenses",
    b1Desc: "Housing, bills and contracts",
    b2Name: "2. Irregular expense reserve",
    b2Desc: "Health, pharmacy and repairs",
    b3Name: "3. Everyday spending",
    b3Desc: "Food, transport and leisure",
    cmpTitle: "You compared to other savers",
    cmpYour: "Your monthly saving",
    cmpMedian: "S-Pankki customer median (31.1.2026)",
    cmpAbove: (d) => `+${d.toLocaleString("en-IE")} € above median`,
    cmpAt: "At median",
    cmpBelow: (d) => `${d.toLocaleString("en-IE")} € to median`,
    cmpNoteAbove: (d) => `You save <strong>${d.toLocaleString("en-IE")} € more</strong> per month than S-Pankki customers on average (median 50 €/mo, 31.1.2026).`,
    cmpNoteAt: "Your monthly saving matches the S-Pankki customer median (50 €/mo, 31.1.2026).",
    cmpNoteBelow: (d) => `The S-Pankki customer median saving was <strong>50 €/mo</strong> (31.1.2026). Just +${d.toLocaleString("en-IE")} €/mo brings you to the median.`,
    meCoachTitle: "Suunta financial coach",
    meCoachSub: "Hides total account balance and displays weekly allowance",
    meCoachOffSub: "Enable by answering a few quick questions",
    enableBtn: "Enable",
    editGoalsBtn: "Edit goals",
    protectedItems: "Protected categories",
    incExpLine: (a, i, e) => `${a} yrs · Income ${i}/mo · Expenses ${e}/mo`,
    deficitBankWarn: (d) => `Monthly expenses exceed regular income by <strong>${d}/mo</strong>. Weekly budget is based on available funds.`,
  },
};

const CAT_EN_MAP = {
  "Ruokakauppa": "Groceries",
  "Kotitalous": "Household",
  "Ravintolat": "Restaurants",
  "Kahvilat": "Cafes",
  "Liikkuminen": "Transport",
  "Tilaukset": "Subscriptions",
  "Ostokset": "Shopping",
  "Vapaa-aika & harrastukset": "Leisure & hobbies",
  "Taksit": "Taxis",
  "Muu arki": "Other everyday",
  "Asuminen & vuokra": "Housing & rent",
  "Sähkö & vesi": "Electricity & water",
  "Vakuutukset": "Insurance",
  "Puhelin & netti": "Phone & internet",
  "Kausilippu": "Transit pass",
  "Lainat": "Loans",
  "Terveys & apteekki": "Health & pharmacy",
  "Huollot & korjaukset": "Repairs & service",
  "Kodinkoneet": "Appliances",
};

const ROLE_EN_MAP = { "Opiskelija": "Student", "Työssäkäyvä": "Employed", "Eläkeläinen": "Pensioner", "Mies": "Adult", "Mummo": "Senior" };

const GOAL_META = [
  { id: "Säästää tavoitteeseen", en: "Save for a goal", subFi: "Uusi hankinta tai kohde", subEn: "New purchase or target", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>` },
  { id: "Kasvattaa puskuria", en: "Grow safety buffer", subFi: "Talouden vararahasto", subEn: "Emergency reserve", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7.5-3.8 7.5-9.5V5.2L12 2.5 4.5 5.2v6.3C4.5 17.2 12 21 12 21z"/></svg>` },
  { id: "Pienentää arjen kuluja", en: "Reduce everyday spend", subFi: "Enemmän liikkumavaraa", subEn: "More weekly headroom", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>` },
  { id: "Säilyttää nykyinen", en: "Maintain current", subFi: "Tasainen kulutustahti", subEn: "Steady spending pace", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>` },
];

const t = () => I18N[currentLang] || I18N.fi;
const trCat = (label) => (currentLang === "en" ? CAT_EN_MAP[label] || label : label);
const trRole = (label) => (currentLang === "en" ? ROLE_EN_MAP[label] || label : label);
const trGoal = (name) => {
  if (currentLang !== "en") return name;
  const hit = GOAL_META.find((g) => g.id === name);
  return hit ? hit.en : name;
};

const fmtEur = (n) => Number(n || 0).toLocaleString(currentLang === "en" ? "en-IE" : "fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtWholeEur = (n) => Math.round(Number(n || 0)).toLocaleString(currentLang === "en" ? "en-IE" : "fi-FI") + " €";
const fmtBonus = (n) => {
  const s = Number(n || 0).toFixed(2).replace(/0$/, "");
  return (currentLang === "en" ? s : s.replace(".", ",")) + " €";
};

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMessageText(text) {
  return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function fmtMonthsLabel(m) {
  const mo = t().moUnit;
  const yr = t().yrUnit;
  if (m >= 12 && m % 12 === 0) return `${m} ${mo} (${m / 12} ${yr})`;
  if (m > 12) return `${m} ${mo} (${Math.floor(m / 12)} ${yr} ${m % 12} ${mo})`;
  return `${m} ${mo}`;
}

function applyStaticTranslations() {
  const d = t();
  document.documentElement.lang = currentLang;
  document.getElementById("gateTitle").textContent = d.gateTitle;
  document.getElementById("gateSub").textContent = d.gateSub;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (typeof d[key] === "string") el.textContent = d[key];
  });
  document.getElementById("qpName").placeholder = d.whatBuying;
  document.getElementById("qpPrice").placeholder = d.priceEur;
  document.getElementById("homeChatInput").placeholder = d.howCanIHelp;
  document.getElementById("chatInput").placeholder = d.howCanIHelp;
}

function selectLanguage(lang) {
  currentLang = lang;
  document.getElementById("langFiBtn")?.classList.toggle("active", lang === "fi");
  document.getElementById("langEnBtn")?.classList.toggle("active", lang === "en");
  applyStaticTranslations();
  renderCustomerCards();
  if (currentSnapshot) {
    renderSnapshot(currentSnapshot);
    renderHistory(currentHistory);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  applyStaticTranslations();
  await loadProfileGate();
});

async function logoutAndReset() {
  if (currentCustomerId) {
    await fetch(`/api/reset/${encodeURIComponent(currentCustomerId)}`, { method: "POST" }).catch(() => {});
  }
  sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  currentCustomerId = null;
  currentSnapshot = null;
  currentHistory = [];
  detailsVisible = true;
  inviteDismissed = false;
  deficitFollowupDismissed = false;
  homeChatCollapsed = false;
  document.getElementById("onboardingScreen").classList.add("hidden");
  document.getElementById("unsupportedScreen").classList.add("hidden");
  document.getElementById("goalEditorModal").classList.add("hidden");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("profileGate").classList.remove("hidden");
  await loadProfileGate();
}

function dismissSuuntaInvite() {
  inviteDismissed = true;
  document.getElementById("suuntaInviteCard").classList.add("hidden");
}

function dismissDeficitFollowup() {
  deficitFollowupDismissed = true;
  document.getElementById("deficitFollowupBanner").classList.add("hidden");
}

function hideMiniChat() {
  homeChatCollapsed = true;
  renderHistory(currentHistory);
}

function finishFullChatAndReturn() {
  homeChatCollapsed = true;
  renderHistory(currentHistory);
  switchTab("home");
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

async function openDeficitHelpChat() {
  if (!currentCustomerId) return;
  homeChatCollapsed = false;
  const res = await fetch(`/api/deficit-help/${encodeURIComponent(currentCustomerId)}?lang=${currentLang}`, { method: "POST" });
  if (res.ok) {
    const data = await res.json();
    currentSnapshot = data.snapshot;
    currentHistory = data.history || [];
    renderSnapshot(currentSnapshot);
    renderHistory(currentHistory);
  }
  switchTab("chat");
  document.getElementById("chatInput")?.focus();
}

function openUnsupportedByKey(i18nKey) {
  document.getElementById("unsupportedTitle").textContent = t()[i18nKey] || "";
  document.getElementById("unsupportedScreen").classList.remove("hidden");
}

function closeUnsupportedView() {
  document.getElementById("unsupportedScreen").classList.add("hidden");
}

function renderCustomerCards() {
  const listEl = document.getElementById("profileList");
  const d = t();
  listEl.innerHTML = cachedCustomers
    .map((c) => {
      const iconSvg =
        c.role_label === "Opiskelija"
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`
          : c.role_label === "Eläkeläinen"
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`;
      const rLbl = trRole(c.role_label);
      const dLbl = trRole(c.display_name);
      const titleText = c.display_name === c.role_label ? rLbl : `${rLbl} · ${dLbl}`;
      return `
        <button class="persona-card" onclick="selectProfile('${escapeHtml(c.customer_id)}')">
          <div class="persona-icon">${iconSvg}</div>
          <div class="persona-info">
            <strong>${escapeHtml(titleText)}</strong>
            <span>${escapeHtml(c.customer_age)} ${d.yrs} · ${d.balance} ${fmtEur(c.account_balance_eur)}</span>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>`;
    })
    .join("");
}

async function loadProfileGate() {
  const statusEl = document.getElementById("gateStatus");
  try {
    const res = await fetch("/api/customers");
    if (!res.ok) throw new Error("Load failed");
    cachedCustomers = (await res.json()).customers || [];
    renderCustomerCards();
    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

async function selectProfile(customerId) {
  currentCustomerId = `${customerId}::${sessionId}`;
  detailsVisible = true;
  inviteDismissed = false;
  deficitFollowupDismissed = false;
  homeChatCollapsed = false;
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
  const prevDef = currentSnapshot ? currentSnapshot.weekly_safe_to_spend_eur < 0 : false;
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  if (!prevDef && currentSnapshot.weekly_safe_to_spend_eur < 0) deficitFollowupDismissed = false;
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

function getCustomerPurchaseCategories(s) {
  const list = (s.everyday_categories_list || []).filter((x) => x.amount_eur > 0);
  if (list.length > 0) return list;
  return Object.entries(s.everyday_categories_30d || {}).map(([label, amount_eur]) => ({ label, amount_eur }));
}

function computeZeroSaveMonthlyEveryday() {
  const s = currentSnapshot;
  if (!s) return wizardState.everydayEur;
  const irreg = Number(s.baskets_30d?.irregular_reserve_eur || 35);
  const totalExp = wizardState.fixedEur + irreg + wizardState.everydayEur;
  const isDef = wizardState.incomeEur < totalExp;

  if (!isDef) {
    return Math.max(0, wizardState.incomeEur - wizardState.fixedEur - irreg);
  }
  const confirmedFunding = Number(s.profile?.deficit_monthly_funding_eur || 0);
  const bal = Number(s.account_balance_eur || 0);
  const resMo = confirmedFunding > 0 ? confirmedFunding : Math.max(0, bal - Math.min(500, bal * 0.2)) / 12;
  const room = wizardState.incomeEur + resMo - wizardState.fixedEur - irreg;
  if (room > 0) return wizardState.everydayEur > 0 ? Math.min(wizardState.everydayEur, room) : room;
  return Math.max(60, Math.max(wizardState.incomeEur, bal / 6) * 0.18);
}

/* Säästöliukusäätimen maksimi on suoraan henkilön kuukausitulot (varalattiana käytettävissä oleva vara, jos tulot = 0 €) */
function getSavingsSliderConfig() {
  const incomeMax = Math.round(Number(wizardState.incomeEur || 0));
  const fallbackMax = Math.max(100, Math.round(computeZeroSaveMonthlyEveryday()));
  const max = incomeMax > 0 ? incomeMax : fallbackMax;

  let step;
  if (max < 25) step = 1;
  else if (max <= 300) step = 5;
  else if (max <= 1500) step = 10;
  else if (max <= 5000) step = 25;
  else if (max <= 15000) step = 50;
  else if (max <= 50000) step = 100;
  else step = 250;

  return { min: 0, max, step };
}

function getRecommendedMonthlySavings() {
  const s = currentSnapshot;
  const irreg = Number(s?.baskets_30d?.irregular_reserve_eur || 35);
  const zeroSaveEv = computeZeroSaveMonthlyEveryday();
  const spentWk = Number(s?.spent_this_week_eur || 0);
  const { max: sliderMax, step } = getSavingsSliderConfig();

  const minWkBuffer = Math.max(15, Math.min(150, (wizardState.everydayEur * 0.15 * 12) / 52));
  const maxSafeMo = Math.max(0, zeroSaveEv - ((spentWk + minWkBuffer) * 52) / 12);

  const totalExp = wizardState.fixedEur + irreg + wizardState.everydayEur;
  const isDef = wizardState.incomeEur < totalExp;

  let rawRec;
  if (!isDef) {
    const surplus = Math.max(0, zeroSaveEv - wizardState.everydayEur);
    const gentleTrim = Math.min(surplus + wizardState.everydayEur * 0.1, zeroSaveEv * 0.25);
    rawRec = Math.max(surplus * 0.8, gentleTrim);
  } else {
    rawRec = zeroSaveEv * 0.1;
  }

  const bounded = Math.min(sliderMax, maxSafeMo, Math.max(0, rawRec));
  return Math.max(0, Math.floor(bounded / step) * step);
}

function getTargetSliderConfig(includeCurrent = true) {
  const saveCfg = getSavingsSliderConfig();
  const currentTarget = includeCurrent ? Number(wizardState.targetAmount || 0) : 0;
  const rawMax = Math.max(1000, saveCfg.max * 12, currentTarget);

  let min, step, roundUnit;
  if (rawMax <= 3000) {
    min = 50; step = 50; roundUnit = 250;
  } else if (rawMax <= 15000) {
    min = 50; step = 100; roundUnit = 500;
  } else if (rawMax <= 50000) {
    min = 250; step = 250; roundUnit = 1000;
  } else if (rawMax <= 150000) {
    min = 500; step = 500; roundUnit = 5000;
  } else {
    min = 1000; step = 1000; roundUnit = 10000;
  }

  const max = Math.ceil(rawMax / roundUnit) * roundUnit;
  return { min, max, step };
}

function getDefaultTargetAmount(recMonthlySavings) {
  const targetCfg = getTargetSliderConfig(false);
  const rawTarget = Math.max(targetCfg.min, (recMonthlySavings || 50) * 12);
  const snapped = Math.round(rawTarget / targetCfg.step) * targetCfg.step;
  return Math.min(targetCfg.max, Math.max(targetCfg.min, snapped));
}

function initWizardDefaults(s) {
  const p = s.profile || {};
  const b = s.baskets_30d || {};
  const userCats = getCustomerPurchaseCategories(s).map((c) => c.label);
  const defaultProtect = userCats.includes("Ruokakauppa") ? ["Ruokakauppa"] : userCats.slice(0, 1);
  const defaultCut = userCats.filter((c) => !defaultProtect.includes(c)).slice(0, 2);

  wizardState.incomeEur = Math.round(Number(s.monthly_income_eur || 0));
  wizardState.fixedEur = Math.round(Number(b.mandatory_regular_eur || 0));
  wizardState.everydayEur = Math.round(Number(s.average_everyday_monthly_eur || b.everyday_spent_eur || 0));
  wizardState.goal = p.active_goal?.name && GOAL_META.some((g) => g.id === p.active_goal.name) ? p.active_goal.name : "Säästää tavoitteeseen";
  wizardState.cutFrom = p.onboarded && Array.isArray(p.cut_from) && p.cut_from.length ? [...p.cut_from] : defaultCut;
  wizardState.protect = p.onboarded && Array.isArray(p.priorities) && p.priorities.length ? [...p.priorities] : defaultProtect;

  wizardState.savingsManuallyAdjusted = Boolean(p.onboarded);
  wizardState.targetManuallyAdjusted = Boolean(p.onboarded && p.active_goal?.target_eur);

  const saveCfg = getSavingsSliderConfig();
  const recSave = getRecommendedMonthlySavings();
  const initialSave = p.onboarded ? Math.round(Number(b.monthly_savings_target_eur || 0)) : recSave;
  wizardState.monthlySavings = Math.min(saveCfg.max, Math.max(0, initialSave));

  wizardState.targetAmount = p.active_goal?.target_eur
    ? Math.round(Number(p.active_goal.target_eur))
    : getDefaultTargetAmount(wizardState.monthlySavings || recSave);
}

function openOnboardingScreen(startStep = 1) {
  if (!currentSnapshot) return;
  initWizardDefaults(currentSnapshot);
  budgetEditOnlyMode = false;
  wizardEntryStep = startStep;
  wizardStep = startStep;
  renderOnboardingStep();
  document.getElementById("onboardingScreen").classList.remove("hidden");
}

function openBudgetEditScreen() {
  if (!currentSnapshot) return;
  initWizardDefaults(currentSnapshot);
  budgetEditOnlyMode = true;
  wizardEntryStep = 3;
  wizardStep = 3;
  renderOnboardingStep();
  document.getElementById("onboardingScreen").classList.remove("hidden");
}

function handleOnboardingBack() {
  if (!budgetEditOnlyMode && wizardStep > wizardEntryStep) {
    wizardStep -= 1;
    renderOnboardingStep();
  } else {
    document.getElementById("onboardingScreen").classList.add("hidden");
  }
}

async function handleOnboardingNext() {
  if (!budgetEditOnlyMode && wizardStep < 3) {
    wizardStep += 1;
    renderOnboardingStep();
  } else {
    await finishWizard();
  }
}

function toggleEditIoPanel() {
  document.getElementById("editIoPanel")?.classList.toggle("hidden");
}

function renderIoEditorHtml() {
  const d = t();
  const totalExpenses = wizardState.fixedEur + wizardState.everydayEur;
  const gap = totalExpenses - wizardState.incomeEur;
  return `
    <div class="io-summary-grid">
      <div class="io-box income">
        <div><div class="io-tag">${d.incomeMo}</div><div class="io-total tabular" id="ioIncomeTotal">+${fmtWholeEur(wizardState.incomeEur)}</div></div>
        <div class="io-sub-split"><span>${d.salaryBenefits}</span></div>
      </div>
      <div class="io-box expenses">
        <div><div class="io-tag">${d.expensesMo}</div><div class="io-total tabular" id="ioExpenseTotal">–${fmtWholeEur(totalExpenses)}</div></div>
        <div class="io-sub-split">
          <div class="io-sub-row"><span>${d.fixed}</span><strong class="tabular" id="ioFixedVal">${fmtWholeEur(wizardState.fixedEur)}</strong></div>
          <div class="io-sub-row"><span>${d.everyday}</span><strong class="tabular" id="ioEverydayVal">${fmtWholeEur(wizardState.everydayEur)}</strong></div>
        </div>
      </div>
    </div>
    <div id="ioDeficitNotice" class="deficit-warn-box ${gap > 0 ? "" : "hidden"}" style="margin-bottom:8px;">
      ${d.gapNotice(fmtWholeEur(Math.max(0, gap)))}
    </div>
    <button type="button" class="edit-io-toggle" onclick="toggleEditIoPanel()">${d.editIoBtn}</button>
    <div id="editIoPanel" class="edit-io-panel hidden">
      <div class="edit-io-field"><label for="editIncomeInp">${d.incomeMo}</label><input id="editIncomeInp" type="number" min="0" step="50" value="${wizardState.incomeEur}" oninput="onEditIoChange()" /></div>
      <div class="edit-io-field"><label for="editFixedInp">${d.fixed} (€)</label><input id="editFixedInp" type="number" min="0" step="25" value="${wizardState.fixedEur}" oninput="onEditIoChange()" /></div>
      <div class="edit-io-field"><label for="editEverydayInp">${d.everyday} (€)</label><input id="editEverydayInp" type="number" min="0" step="25" value="${wizardState.everydayEur}" oninput="onEditIoChange()" /></div>
    </div>`;
}

function syncSlidersToCurrentIncome(isIncomeFieldEmpty = false) {
  const d = t();
  const saveCfg = getSavingsSliderConfig();
  const recMo = getRecommendedMonthlySavings();

  if (!wizardState.savingsManuallyAdjusted) {
    wizardState.monthlySavings = recMo;
  } else if (!isIncomeFieldEmpty && wizardState.monthlySavings > saveCfg.max) {
    wizardState.monthlySavings = saveCfg.max;
  }

  if (!wizardState.targetManuallyAdjusted) {
    wizardState.targetAmount = getDefaultTargetAmount(wizardState.monthlySavings || recMo);
  }
  const targetCfg = getTargetSliderConfig(true);
  wizardState.targetAmount = Math.min(Math.max(wizardState.targetAmount, targetCfg.min), targetCfg.max);

  const saveInp = document.getElementById("wizSaveInput");
  if (saveInp) {
    saveInp.min = String(saveCfg.min);
    saveInp.max = String(saveCfg.max);
    saveInp.step = String(saveCfg.step);
    saveInp.value = String(Math.min(saveCfg.max, wizardState.monthlySavings));

    const maxLbl = document.getElementById("wizSaveMaxLabel");
    if (maxLbl) maxLbl.textContent = `${fmtWholeEur(saveCfg.max)}${d.perMo}`;

    const recBtn = document.getElementById("wizQuickRecBtn");
    if (recBtn) {
      recBtn.textContent = `${d.recommendBtn}: ${fmtWholeEur(recMo)}${d.perMo}`;
      recBtn.classList.toggle("hidden", recMo === wizardState.monthlySavings);
    }

    onWizardSavingsSlide(saveInp.value, false);
  }

  const targetInp = document.getElementById("wizTargetInput");
  if (targetInp) {
    targetInp.min = String(targetCfg.min);
    targetInp.max = String(targetCfg.max);
    targetInp.step = String(targetCfg.step);
    targetInp.value = String(wizardState.targetAmount);

    const minTgtLbl = document.getElementById("wizTargetMinLabel");
    const maxTgtLbl = document.getElementById("wizTargetMaxLabel");
    if (minTgtLbl) minTgtLbl.textContent = fmtWholeEur(targetCfg.min);
    if (maxTgtLbl) maxTgtLbl.textContent = fmtWholeEur(targetCfg.max);

    onWizardTargetSlide(wizardState.targetAmount, false);
  }
}

function onEditIoChange() {
  const incomeRaw = document.getElementById("editIncomeInp")?.value ?? "";
  const inc = Math.max(0, Math.round(Number(incomeRaw || 0)));
  const fix = Math.max(0, Math.round(Number(document.getElementById("editFixedInp")?.value || 0)));
  const evd = Math.max(0, Math.round(Number(document.getElementById("editEverydayInp")?.value || 0)));
  wizardState.incomeEur = inc;
  wizardState.fixedEur = fix;
  wizardState.everydayEur = evd;
  const totalExp = fix + evd;
  document.getElementById("ioIncomeTotal").textContent = `+${fmtWholeEur(inc)}`;
  document.getElementById("ioExpenseTotal").textContent = `–${fmtWholeEur(totalExp)}`;
  document.getElementById("ioFixedVal").textContent = fmtWholeEur(fix);
  document.getElementById("ioEverydayVal").textContent = fmtWholeEur(evd);

  const defNote = document.getElementById("ioDeficitNotice");
  if (defNote) {
    const gap = totalExp - inc;
    defNote.classList.toggle("hidden", gap <= 0);
    if (gap > 0) defNote.textContent = t().gapNotice(fmtWholeEur(gap));
  }

  syncSlidersToCurrentIncome(incomeRaw === "");
}

function renderOnboardingStep() {
  const s = currentSnapshot;
  if (!s) return;
  const d = t();
  const userCats = getCustomerPurchaseCategories(s);
  const fixedCats = (s.mandatory_categories_list || []).filter((x) => x.amount_eur > 0);
  const stepTextEl = document.getElementById("obStepText");
  const progTrackEl = document.getElementById("obProgressTrack");

  if (budgetEditOnlyMode) {
    stepTextEl.textContent = "";
    progTrackEl.classList.add("hidden");
    document.getElementById("obBackLabel").textContent = d.close;
    document.getElementById("obNextBtn").textContent = d.saveChanges;
  } else {
    stepTextEl.textContent = d.stepOf(wizardStep);
    progTrackEl.classList.remove("hidden");
    document.getElementById("obProgressFill").style.width = `${(wizardStep / 3) * 100}%`;
    document.getElementById("obBackLabel").textContent = wizardStep > wizardEntryStep ? d.back : d.close;
    document.getElementById("obNextBtn").textContent = wizardStep === 3 ? d.done : d.next;
  }

  const bodyEl = document.getElementById("obBody");

  if (!budgetEditOnlyMode && wizardStep === 1) {
    const fixedRows = fixedCats.slice(0, 4).map((c) => `<div class="ob-cat-row"><span>${escapeHtml(trCat(c.label))}</span><strong class="tabular">${fmtWholeEur(c.amount_eur)} ${d.perMo}</strong></div>`).join("");
    const everydayRows = userCats.slice(0, 5).map((c) => `<div class="ob-cat-row"><span>${escapeHtml(trCat(c.label))}</span><strong class="tabular">${fmtWholeEur(c.amount_eur)} ${d.perMo}</strong></div>`).join("");

    bodyEl.innerHTML = `
      <h2 class="ob-title">${d.ob1Title}</h2>
      <p class="ob-subtitle">${d.ob1Sub}</p>
      ${renderIoEditorHtml()}
      <div class="ob-section-label">${d.largestFixed}</div>
      <div class="ob-cat-list">${fixedRows || '<div class="item-sub">–</div>'}</div>
      <div class="ob-section-label">${d.yourEverydayCats}</div>
      <div class="ob-cat-list">${everydayRows || '<div class="item-sub">–</div>'}</div>`;
  } else if (!budgetEditOnlyMode && wizardStep === 2) {
    const goalCards = GOAL_META.map((g) => {
      const sel = wizardState.goal === g.id;
      const gTitle = currentLang === "en" ? g.en : g.id;
      const gSub = currentLang === "en" ? g.subEn : g.subFi;
      return `
        <button type="button" class="goal-choice-card ${sel ? "selected" : ""}" data-goal="${escapeHtml(g.id)}" onclick="selectSingleGoal(this)">
          <div class="goal-card-head"><span class="goal-icon-box">${g.svg}</span><span class="goal-check-ring"></span></div>
          <div><div class="goal-card-title">${escapeHtml(gTitle)}</div><div class="goal-card-sub">${escapeHtml(gSub)}</div></div>
        </button>`;
    }).join("");

    const cutPills = userCats.map((c) => `<button type="button" class="choice-pill ${wizardState.cutFrom.includes(c.label) ? "selected" : ""}" data-cat="${escapeHtml(c.label)}" data-group="cutFrom" onclick="toggleCategoryPill(this)"><span>${escapeHtml(trCat(c.label))}</span><small>${fmtWholeEur(c.amount_eur)}</small></button>`).join("");
    const protectPills = userCats.map((c) => `<button type="button" class="choice-pill ${wizardState.protect.includes(c.label) ? "selected" : ""}" data-cat="${escapeHtml(c.label)}" data-group="protect" onclick="toggleCategoryPill(this)"><span>${escapeHtml(trCat(c.label))}</span></button>`).join("");

    bodyEl.innerHTML = `
      <h2 class="ob-title">${d.ob2Title}</h2>
      <p class="ob-subtitle">${d.ob2Sub}</p>
      <div class="ob-section-label" style="margin-top:2px;">${d.whatIsGoal}</div>
      <div class="goal-card-grid" id="obGoalList">${goalCards}</div>
      <div class="ob-choice-section-card">
        <div class="ob-card-heading">${d.whereSave}</div>
        <div class="ob-card-hint">${d.whereSaveHint}</div>
        <div class="pill-grid" id="obCutGrid">${cutPills}</div>
      </div>
      <div class="ob-choice-section-card">
        <div class="ob-card-heading">${d.whereProtect}</div>
        <div class="ob-card-hint">${d.whereProtectHint}</div>
        <div class="pill-grid" id="obProtectGrid">${protectPills}</div>
      </div>`;
  } else {
    const saveCfg = getSavingsSliderConfig();
    if (wizardState.monthlySavings > saveCfg.max) wizardState.monthlySavings = saveCfg.max;
    const targetCfg = getTargetSliderConfig(true);
    const recMo = getRecommendedMonthlySavings();
    const estProjSafe = computeProjectedWeeklySafe(wizardState.monthlySavings);
    const saveWk = Math.round((wizardState.monthlySavings * 12) / 52);
    const months = wizardState.monthlySavings > 0 ? Math.ceil(wizardState.targetAmount / wizardState.monthlySavings) : 0;
    const extraIoSection = budgetEditOnlyMode ? `<div class="ob-section-label" style="margin-top:18px;">${d.ob1Title}</div>${renderIoEditorHtml()}` : "";

    bodyEl.innerHTML = `
      <h2 class="ob-title">${budgetEditOnlyMode ? d.btnChangeBudget : d.ob3Title}</h2>
      <p class="ob-subtitle">${d.ob3Sub}</p>
      <div class="slider-block">
        <div class="slider-head">
          <span>${d.monthlySaving}</span>
          <strong id="wizSaveLabel" class="tabular">${fmtWholeEur(wizardState.monthlySavings)}${d.perMo} (${fmtWholeEur(saveWk)}${d.perWk})</strong>
        </div>
        <input id="wizSaveInput" type="range" class="suunta-range" min="${saveCfg.min}" max="${saveCfg.max}" step="${saveCfg.step}" value="${wizardState.monthlySavings}" oninput="onWizardSavingsSlide(this.value, true)" />
        <div class="row-between" style="font-size:11.5px;color:var(--s-muted);margin-top:2px;">
          <span class="tabular">0 €${d.perMo}</span>
          <button type="button" id="wizQuickRecBtn" class="btn-subtle ${recMo === wizardState.monthlySavings ? "hidden" : ""}" style="padding:2px 8px;font-size:11px;" onclick="applyRecommendedWizardSavings()">${d.recommendBtn}: ${fmtWholeEur(recMo)}${d.perMo}</button>
          <span id="wizSaveMaxLabel" class="tabular">${fmtWholeEur(saveCfg.max)}${d.perMo}</span>
        </div>
        <div class="slider-live-note">
          <span>${d.wkAllowance}: <strong id="wizWeeklyPreview" class="tabular">${fmtWholeEur(estProjSafe)}</strong></span>
          <span>${d.perYear}: <strong id="wizYearlyPreview" class="tabular">+${fmtWholeEur(wizardState.monthlySavings * 12)}</strong></span>
        </div>
        <div id="wizDeficitWarn" class="deficit-warn-box ${estProjSafe < 0 ? "" : "hidden"}">
          <span id="wizDeficitWarnText">${d.wizDefWarn(recMo)}</span>
          <button type="button" class="btn-subtle" onclick="applyRecommendedWizardSavings()">${d.recommendBtn}</button>
        </div>
      </div>
      <div class="slider-block">
        <div class="slider-head"><span>${d.targetSum}</span><strong id="wizTargetLabel" class="tabular">${fmtWholeEur(wizardState.targetAmount)}</strong></div>
        <input id="wizTargetInput" type="range" class="suunta-range" min="${targetCfg.min}" max="${targetCfg.max}" step="${targetCfg.step}" value="${wizardState.targetAmount}" oninput="onWizardTargetSlide(this.value, true)" />
        <div class="row-between" style="font-size:11.5px;color:var(--s-muted);margin-top:2px;">
          <span id="wizTargetMinLabel" class="tabular">${fmtWholeEur(targetCfg.min)}</span>
          <span id="wizTargetMaxLabel" class="tabular">${fmtWholeEur(targetCfg.max)}</span>
        </div>
        <div id="wizMonthsPreview" class="item-sub" style="margin-top:6px;">${months ? d.targetFilledIn(fmtMonthsLabel(months)) : d.setSavingForTime}</div>
      </div>
      ${extraIoSection}`;
  }
}

/* Sama kaava kuin engine.py:ssä: kuukausisäästö vähentää viikkobudjettia suoraviivaisesti kaikilla asiakkailla */
function computeProjectedWeeklySafe(monthlySavingsVal) {
  const s = currentSnapshot;
  if (!s) return 0;
  const zeroSaveEv = computeZeroSaveMonthlyEveryday();
  const monthlyEvBudget = zeroSaveEv - monthlySavingsVal;
  return Math.round((monthlyEvBudget * 12) / 52 - Number(s.spent_this_week_eur || 0));
}

function selectSingleGoal(btnEl) {
  wizardState.goal = btnEl.dataset.goal;
  document.querySelectorAll("#obGoalList .goal-choice-card").forEach((b) => b.classList.toggle("selected", b === btnEl));
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

function applyRecommendedWizardSavings() {
  const recMo = getRecommendedMonthlySavings();
  const input = document.getElementById("wizSaveInput");
  if (input) input.value = String(recMo);
  onWizardSavingsSlide(recMo, true);
}

function onWizardSavingsSlide(valRaw, isUserInput = true) {
  const d = t();
  const val = Number(valRaw);
  if (isUserInput) wizardState.savingsManuallyAdjusted = true;
  wizardState.monthlySavings = val;

  const recMo = getRecommendedMonthlySavings();
  const projSafe = computeProjectedWeeklySafe(val);
  const saveWk = Math.round((val * 12) / 52);
  const months = val > 0 ? Math.ceil(wizardState.targetAmount / val) : 0;

  document.getElementById("wizSaveLabel").textContent = `${fmtWholeEur(val)}${d.perMo} (${fmtWholeEur(saveWk)}${d.perWk})`;
  document.getElementById("wizWeeklyPreview").textContent = fmtWholeEur(projSafe);
  document.getElementById("wizYearlyPreview").textContent = `+${fmtWholeEur(val * 12)}`;

  const warnBox = document.getElementById("wizDeficitWarn");
  const warnTxt = document.getElementById("wizDeficitWarnText");
  if (warnTxt) warnTxt.textContent = d.wizDefWarn(recMo);
  if (warnBox) warnBox.classList.toggle("hidden", projSafe >= 0);

  const recBtn = document.getElementById("wizQuickRecBtn");
  if (recBtn) {
    recBtn.textContent = `${d.recommendBtn}: ${fmtWholeEur(recMo)}${d.perMo}`;
    recBtn.classList.toggle("hidden", recMo === val);
  }

  document.getElementById("wizMonthsPreview").textContent = months ? d.targetFilledIn(fmtMonthsLabel(months)) : d.setSavingForTime;
}

function onWizardTargetSlide(valRaw, isUserInput = true) {
  const d = t();
  const val = Number(valRaw);
  if (isUserInput) wizardState.targetManuallyAdjusted = true;
  wizardState.targetAmount = val;
  const months = wizardState.monthlySavings > 0 ? Math.ceil(val / wizardState.monthlySavings) : 0;
  document.getElementById("wizTargetLabel").textContent = fmtWholeEur(val);
  document.getElementById("wizMonthsPreview").textContent = months ? d.targetFilledIn(fmtMonthsLabel(months)) : d.setSavingForTime;
}

async function finishWizard() {
  if (!currentCustomerId) return;
  detailsVisible = false;
  deficitFollowupDismissed = false;
  await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statement_id: currentCustomerId,
      lang: currentLang,
      suunta_enabled: true,
      monthly_income_eur: wizardState.incomeEur,
      mandatory_regular_eur: wizardState.fixedEur,
      everyday_monthly_eur: wizardState.everydayEur,
      priorities: wizardState.protect.length ? wizardState.protect : ["Ruokakauppa"],
      cut_from: wizardState.cutFrom,
      savings_goal_name: wizardState.goal,
      savings_goal_monthly_eur: wizardState.monthlySavings,
      savings_goal_target_eur: wizardState.targetAmount,
    }),
  });
  document.getElementById("onboardingScreen").classList.add("hidden");
  switchTab("home");
  await loadState();
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function openGoalEditor() {
  if (!currentSnapshot) return;
  const p = currentSnapshot.profile || {};
  const curSaveMo = Number(currentSnapshot.baskets_30d?.monthly_savings_target_eur || currentSnapshot.recommended_monthly_savings_eur || 50);
  const defaultName = currentLang === "en" ? "Savings goal" : "Säästötavoite";
  const fallbackTarget = Math.max(300, Math.round((curSaveMo * 12) / 100) * 100);
  const goal = p.active_goal || { name: defaultName, target_eur: fallbackTarget };
  const initMonths = curSaveMo > 0 ? Math.min(120, Math.max(1, Math.round(goal.target_eur / curSaveMo))) : 24;

  document.getElementById("geNameInput").value = trGoal(goal.name || defaultName);
  document.getElementById("geTargetInput").value = Math.round(goal.target_eur || fallbackTarget);
  document.getElementById("geMonthsRange").value = String(initMonths);
  onGoalEditorChange();
  document.getElementById("goalEditorModal").classList.remove("hidden");
}

function closeGoalEditor() {
  document.getElementById("goalEditorModal").classList.add("hidden");
}

function onGoalEditorChange() {
  if (!currentSnapshot) return;
  const d = t();
  const target = Math.max(50, Number(document.getElementById("geTargetInput").value || 500));
  const months = Number(document.getElementById("geMonthsRange").value || 24);
  const reqMo = target / months;
  const reqWk = (reqMo * 12) / 52;
  const adj = Number(currentSnapshot.profile?.everyday_adjustment_eur || 0);
  const zeroSaveEv = Number(currentSnapshot.zero_save_everyday_monthly_eur || currentSnapshot.average_everyday_monthly_eur || 400) + adj;
  const newWkBudget = Math.round(((zeroSaveEv - reqMo) * 12) / 52);

  document.getElementById("geMonthsLabel").textContent = fmtMonthsLabel(months);
  document.getElementById("geRatePreview").textContent = `${fmtWholeEur(reqWk)}${d.perWk} (${fmtWholeEur(reqMo)}${d.perMo})`;
  document.getElementById("geWeeklyPreview").textContent = `${fmtWholeEur(newWkBudget)}${d.perWk}`;
}

async function saveEditedGoal() {
  const name = document.getElementById("geNameInput").value.trim() || (currentLang === "en" ? "Goal" : "Tavoite");
  const target = Math.max(50, Number(document.getElementById("geTargetInput").value || 500));
  const months = Number(document.getElementById("geMonthsRange").value || 24);
  const newMoSave = Math.round((target / months) * 100) / 100;

  deficitFollowupDismissed = false;
  closeGoalEditor();
  await applyPlanObject({
    plan_id: `__EDIT_GOAL__${Date.now()}`,
    title: name,
    summary: "",
    impact_weekly_eur: 0,
    monthly_savings_delta_eur: newMoSave,
    everyday_budget_delta_eur: 0,
    buffer_delta_eur: 0,
    goal_name: name,
    goal_target_eur: target,
  });
}

async function clearActiveGoal() {
  closeGoalEditor();
  await applyPlanObject({ plan_id: "__CLEAR_GOAL__", title: "-", summary: "", impact_weekly_eur: 0, monthly_savings_delta_eur: 0, everyday_budget_delta_eur: 0, buffer_delta_eur: 0 });
}

function renderSnapshot(s) {
  const d = t();
  const p = s.profile || {};
  const onboarded = Boolean(p.onboarded);
  const suuntaEnabled = onboarded && Boolean(p.suunta_enabled);

  document.getElementById("heroSection").classList.toggle("compact-mode", suuntaEnabled);
  document.getElementById("fullBonusCollapse").classList.toggle("open", !suuntaEnabled);
  document.getElementById("compactBonusCollapse").classList.toggle("open", suuntaEnabled);
  document.getElementById("allowanceDrawer").classList.toggle("open", suuntaEnabled);

  document.getElementById("topQuickActions").classList.toggle("hidden", suuntaEnabled);
  document.getElementById("belowSuuntaQuickActions").classList.toggle("hidden", !suuntaEnabled);

  document.getElementById("suuntaInviteCard").classList.toggle("hidden", onboarded || inviteDismissed);
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

  const isNegativeAllowance = s.weekly_safe_to_spend_eur < 0 || s.weekly_budget_eur < 0;
  document.getElementById("allowanceBanner").classList.toggle("deficit", isNegativeAllowance);
  document.getElementById("deficitFollowupBanner").classList.toggle("hidden", !(suuntaEnabled && isNegativeAllowance && !deficitFollowupDismissed));

  document.getElementById("weeklySafeAmount").textContent = fmtEur(s.weekly_safe_to_spend_eur);
  document.getElementById("dailyHint").textContent = d.spentOfWk(fmtWholeEur(s.spent_this_week_eur), fmtWholeEur(s.weekly_budget_eur));
  document.getElementById("allowanceStatusTag").textContent = isNegativeAllowance ? d.inDeficit : d.perDay(fmtWholeEur(s.daily_safe_to_spend_eur));
  document.getElementById("chatHeaderAllowance").textContent = d.wkAllowHeader(fmtEur(s.weekly_safe_to_spend_eur));

  const usedRatio = s.weekly_budget_eur > 0 ? Math.min(100, Math.round((s.spent_this_week_eur / s.weekly_budget_eur) * 100)) : 100;
  document.getElementById("allowanceMeterFill").style.width = suuntaEnabled ? `${usedRatio}%` : "0%";

  const goal = p.active_goal;
  document.getElementById("goalCaption").textContent = goal ? d.goalPrefix(trGoal(goal.name)) : d.setGoal;

  document.getElementById("accountBalance").textContent = detailsVisible ? fmtEur(s.account_balance_eur) : "•••• €";
  document.getElementById("toggleDetailsBtn").textContent = detailsVisible ? d.hideDetails : d.showDetails;

  const firstTx = (s.recent_transactions || [])[0];
  document.getElementById("homeReceiptCard").innerHTML = firstTx ? renderReceiptRow(firstTx) : `<div class="item-sub">–</div>`;

  const allReceiptsHtml = (s.recent_transactions || []).map(renderReceiptRow).join('<div class="divider"></div>');
  document.getElementById("allReceiptsCard").innerHTML = allReceiptsHtml;
  document.getElementById("etukorttiReceipts").innerHTML = allReceiptsHtml;

  renderBasketsSection(s);
  renderSavingsComparisonSection(s);

  const cats = Object.entries(s.everyday_categories_30d || {});
  document.getElementById("categoriesCard").innerHTML = cats.length
    ? cats.map(([k, v]) => `<div class="row-between" style="padding:6px 0;"><span>${escapeHtml(trCat(k))}</span><strong class="tabular nowrap">${fmtWholeEur(v)}</strong></div>`).join("")
    : `<div class="item-sub">–</div>`;

  const protStr = (p.priorities || []).map(trCat).join(", ");
  document.getElementById("meProfileCard").innerHTML = `
    <div class="item-title">${escapeHtml(trRole(s.role_label))} · ${escapeHtml(trRole(s.display_name))}</div>
    <div class="item-sub">${d.incExpLine(escapeHtml(p.customer_age), fmtWholeEur(s.monthly_income_eur), fmtWholeEur(s.total_monthly_expenses_eur))}</div>
    <div class="divider"></div>
    <div class="item-sub">${d.protectedItems}: <strong>${escapeHtml(protStr)}</strong></div>`;

  document.getElementById("meSuuntaSettingsCard").innerHTML = onboarded
    ? `<div class="row-between">
         <div><div class="item-title">${d.meCoachTitle}</div><div class="item-sub">${d.meCoachSub}</div></div>
         <button type="button" class="toggle-switch ${suuntaEnabled ? "on" : ""}" role="switch" aria-checked="${suuntaEnabled}" onclick="toggleSuuntaMode()"><span class="toggle-thumb"></span></button>
       </div>
       <div class="divider"></div>
       <button class="center-link" onclick="openOnboardingScreen(1)">${d.editGoalsBtn}</button>`
    : `<div class="row-between">
         <div><div class="item-title">${d.meCoachTitle}</div><div class="item-sub">${d.meCoachOffSub}</div></div>
         <button type="button" class="btn-primary" onclick="openOnboardingScreen(1)">${d.enableBtn}</button>
       </div>`;
}

function toggleQuickPurchase() {
  const box = document.getElementById("quickPurchaseBox");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) document.getElementById("qpName").focus();
}

function submitQuickPurchase() {
  const name = document.getElementById("qpName").value.trim() || (currentLang === "en" ? "item" : "hankinta");
  const price = Number(document.getElementById("qpPrice").value || 0);
  document.getElementById("quickPurchaseBox").classList.add("hidden");
  document.getElementById("qpName").value = "";
  document.getElementById("qpPrice").value = "";
  const msg = currentLang === "en"
    ? (price > 0 ? `I want to buy ${name} for ${price} €` : `I want to buy: ${name}`)
    : (price > 0 ? `Haluan ostaa ${price} € kohteen: ${name}` : `Haluan hankkia kohteen: ${name}`);
  sendMessage(msg);
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
  const d = t();
  const b = s.baskets_30d;
  const p = s.profile || {};
  const fc = s.forecast_6m || [];
  const lastFc = fc[fc.length - 1];
  const totalOut = Math.max(1, b.mandatory_regular_eur + b.irregular_reserve_eur + Math.max(0, b.monthly_everyday_budget_eur));
  const pct1 = Math.min(100, Math.round((b.mandatory_regular_eur / totalOut) * 100));
  const pct2 = Math.min(100, Math.round((b.irregular_reserve_eur / totalOut) * 100));
  const pct3 = Math.max(0, Math.min(100, Math.round((b.monthly_everyday_budget_eur / totalOut) * 100)));
  const savePerWeek = Math.round((b.monthly_savings_target_eur * 12) / 52);

  const deficitBanner = s.is_monthly_deficit ? `<div class="deficit-warn-box" style="margin-bottom:12px;"><span>${d.deficitBankWarn(fmtWholeEur(s.monthly_deficit_eur))}</span></div>` : "";

  document.getElementById("basketsCard").innerHTML = `
    ${deficitBanner}
    <div class="overview-stats">
      <div class="stat-card">
        <div class="stat-card-label">${d.bufferNow}</div>
        <div class="stat-card-val tabular">${fmtWholeEur(p.current_buffer_eur || 850)}</div>
        <div class="stat-card-sub">${lastFc ? d.forecast6m(fmtWholeEur(lastFc.buffer_eur)) : ""}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">${d.savingsGoal}</div>
        <div class="stat-card-val green tabular">+${fmtWholeEur(b.monthly_savings_target_eur)}<small style="font-size:13px;font-weight:500;">${d.perMo}</small></div>
        <div class="stat-card-sub">${d.approxPerWk(savePerWeek)}</div>
      </div>
    </div>
    <div class="baskets-clean-card">
      <div class="basket-row-card" style="padding-top:2px;">
        <div class="basket-head"><span class="basket-name">${d.b1Name}</span><span class="basket-eur tabular">${fmtWholeEur(b.mandatory_regular_eur)} ${d.perMo}</span></div>
        <div class="basket-desc"><span>${d.b1Desc}</span><span>${pct1} %</span></div>
        <div class="basket-bar-track"><div class="basket-bar-fill muted" style="width:${pct1}%"></div></div>
      </div>
      <div class="basket-row-card">
        <div class="basket-head"><span class="basket-name">${d.b2Name}</span><span class="basket-eur tabular">${fmtWholeEur(b.irregular_reserve_eur)} ${d.perMo}</span></div>
        <div class="basket-desc"><span>${d.b2Desc}</span><span>${pct2} %</span></div>
        <div class="basket-bar-track"><div class="basket-bar-fill soft" style="width:${pct2}%"></div></div>
      </div>
      <div class="basket-row-card" style="padding-bottom:2px;">
        <div class="basket-head"><span class="basket-name">${d.b3Name}</span><span class="basket-eur tabular" style="color:var(--s-green);">${fmtWholeEur(b.monthly_everyday_budget_eur)} ${d.perMo}</span></div>
        <div class="basket-desc"><span>${d.b3Desc}</span><strong>${fmtWholeEur(s.weekly_budget_eur)} ${d.perWk}</strong></div>
        <div class="basket-bar-track"><div class="basket-bar-fill" style="width:${pct3}%"></div></div>
      </div>
    </div>`;
}

function renderSavingsComparisonSection(s) {
  const d = t();
  const el = document.getElementById("opportunitiesCard");
  if (!el) return;
  const userSave = Math.round(Number(s.baskets_30d?.monthly_savings_target_eur || 0));
  const median = Number(s.sbank_median_savings_eur || SBANK_MEDIAN_EUR);
  const diff = userSave - median;
  const scaleMax = Math.max(100, userSave, median);
  const userPct = Math.min(100, Math.round((userSave / scaleMax) * 100));
  const medianPct = median > 0 ? Math.max(2, Math.min(100, Math.round((median / scaleMax) * 100))) : 0;

  const badgeHtml = diff > 0 ? `<span class="cmp-badge">${d.cmpAbove(diff)}</span>` : diff === 0 ? `<span class="cmp-badge">${d.cmpAt}</span>` : `<span class="cmp-badge below">${d.cmpBelow(Math.abs(diff))}</span>`;
  const noteText = diff > 0 ? d.cmpNoteAbove(diff) : diff === 0 ? d.cmpNoteAt : d.cmpNoteBelow(Math.abs(diff));

  el.innerHTML = `
    <div class="cmp-header"><strong style="font-size:14.5px;">${d.cmpTitle}</strong>${badgeHtml}</div>
    <div class="cmp-row">
      <div class="cmp-row-top"><span>${d.cmpYour}</span><strong class="tabular" style="color:var(--s-green);">${fmtWholeEur(userSave)} ${d.perMo}</strong></div>
      <div class="cmp-track"><div class="cmp-fill-user" style="width:${userPct}%"></div></div>
    </div>
    <div class="cmp-row" style="margin-bottom:4px;">
      <div class="cmp-row-top"><span style="color:var(--s-muted);">${d.cmpMedian}</span><strong class="tabular">${fmtWholeEur(median)} ${d.perMo}</strong></div>
      <div class="cmp-track"><div class="cmp-fill-median" style="width:${medianPct}%"></div></div>
    </div>
    <div class="cmp-note">
      <div>${noteText}</div>
      <div style="margin-top:8px;"><button type="button" class="btn-subtle" onclick="openBudgetEditScreen()">${d.btnChangeBudget}</button></div>
    </div>`;
}

function renderReceiptRow(tx) {
  return `
    <div class="row-between">
      <div class="row-left">
        <svg class="receipt-svg-icon" aria-hidden="true"><use href="#icon-receipt"/></svg>
        <div><div class="item-title">${escapeHtml(tx.merchant)}</div><div class="item-sub">${escapeHtml(tx.date)} · ${escapeHtml(trCat(tx.category))}</div></div>
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
  await setSuuntaEnabled(!Boolean(currentSnapshot?.profile?.suunta_enabled));
}

function toggleCardDetails() {
  detailsVisible = !detailsVisible;
  if (currentSnapshot) renderSnapshot(currentSnapshot);
}

function renderActionCard(c, selectedPlanId = null) {
  const d = t();
  const encoded = encodeURIComponent(JSON.stringify(c));
  const isResolved = Boolean(selectedPlanId);
  const isChosen = selectedPlanId === c.plan_id;
  const cls = isResolved ? `action-card resolved ${isChosen ? "chosen" : ""}` : "action-card";
  const btnText = isChosen ? d.chosenBtn : isResolved ? d.optionChosenBtn : d.chooseThisBtn;

  const monthsBadge = c.impact_savings_months ? `<span class="impact-pill neutral">${fmtMonthsLabel(c.impact_savings_months)}</span>` : "";
  const wkVal = Math.round(Number(c.impact_weekly_eur || 0));
  const wkBadge = `<span class="impact-pill">${wkVal > 0 ? "+" : ""}${wkVal} €${d.perWk}</span>`;

  return `
    <div class="${cls}">
      <div class="action-card-top"><h4>${escapeHtml(c.title)}</h4><span class="badge-pair">${monthsBadge}${wkBadge}</span></div>
      <p>${escapeHtml(c.summary)}</p>
      <button class="apply-btn" ${isResolved ? "disabled" : ""} onclick="applyPlanEncoded('${encoded}')">${btnText}</button>
    </div>`;
}

function renderCustomPurchaseSlider(cards, uid, selectedPlanId = null) {
  const d = t();
  const first = cards[0];
  if (!first || !first.goal_target_eur || cards.length < 2) return "";
  const isResolved = Boolean(selectedPlanId);
  const isChosen = selectedPlanId && selectedPlanId.startsWith("custom_timeline_");
  if (isResolved && !isChosen) return "";

  const price = Number(first.goal_target_eur);
  const goalName = first.goal_name || (currentLang === "en" ? "Purchase" : "Hankinta");
  const curSaveMo = Number(currentSnapshot?.baskets_30d?.monthly_savings_target_eur || 0);
  const wkBudget = Number(currentSnapshot?.weekly_budget_eur || 50);

  const safeMo = Math.max(15, ((Math.max(15, wkBudget) * 0.25) * 52) / 12);
  const initMonths = Math.min(120, Math.max(2, Math.ceil(price / Math.max(15, curSaveMo + safeMo))));
  const reqTotalMo = price / initMonths;
  const moDelta = Math.max(0, Math.round((reqTotalMo - curSaveMo) * 100) / 100);
  const wkDelta = Math.round((moDelta * 12) / 52);
  const newWkBudget = Math.round(wkBudget - wkDelta);

  return `
    <div class="action-card ${isResolved ? "resolved chosen" : ""}" style="${isResolved ? "" : "background:#f7fbf8;"}">
      <div class="action-card-top">
        <h4>${d.customPaceTitle}</h4>
        <span class="badge-pair">
          <span id="cMonths_${uid}" class="impact-pill neutral">${fmtMonthsLabel(initMonths)}</span>
          <span id="cWeek_${uid}" class="impact-pill">-${wkDelta} €${d.perWk}</span>
        </span>
      </div>
      <input
        type="range"
        class="suunta-range"
        min="1"
        max="120"
        step="1"
        value="${initMonths}"
        ${isResolved ? "disabled" : ""}
        oninput="updatePurchaseTimelineSlider('${uid}', ${price}, ${curSaveMo}, ${wkBudget}, this.value)"
      />
      <p id="cDesc_${uid}" style="margin-top:4px;">${d.customDesc(Math.round(reqTotalMo), newWkBudget)}</p>
      <div id="cWarn_${uid}" class="deficit-warn-box ${newWkBudget < 0 && !isResolved ? "" : "hidden"}" style="margin-bottom:8px;">
        <span>${d.customDefWarn(newWkBudget)}</span>
      </div>
      <button
        id="cBtn_${uid}"
        class="apply-btn"
        data-months="${initMonths}"
        ${isResolved ? "disabled" : ""}
        onclick="applyCustomTimelinePlan('${uid}', '${escapeHtml(goalName)}', ${price}, ${curSaveMo})"
      >${isResolved ? d.chosenBtn : d.applyCustomBtn}</button>
    </div>`;
}

function updatePurchaseTimelineSlider(uid, price, curSaveMo, wkBudget, monthsRaw) {
  const d = t();
  const months = Number(monthsRaw);
  const reqTotalMo = price / months;
  const moDelta = Math.max(0, Math.round((reqTotalMo - curSaveMo) * 100) / 100);
  const wkDelta = Math.round((moDelta * 12) / 52);
  const newWkBudget = Math.round(wkBudget - wkDelta);

  document.getElementById(`cMonths_${uid}`).textContent = fmtMonthsLabel(months);
  document.getElementById(`cWeek_${uid}`).textContent = `-${wkDelta} €${d.perWk}`;
  document.getElementById(`cDesc_${uid}`).textContent = d.customDesc(Math.round(reqTotalMo), newWkBudget);
  const warnEl = document.getElementById(`cWarn_${uid}`);
  warnEl.classList.toggle("hidden", newWkBudget >= 0);
  warnEl.innerHTML = `<span>${d.customDefWarn(newWkBudget)}</span>`;
  document.getElementById(`cBtn_${uid}`).dataset.months = String(months);
}

async function applyCustomTimelinePlan(uid, goalName, price, curSaveMo) {
  const months = Number(document.getElementById(`cBtn_${uid}`)?.dataset.months || 24);
  const reqTotalMo = price / months;
  const moDelta = Math.max(0, Math.round((reqTotalMo - curSaveMo) * 100) / 100);
  const wkDelta = Math.round((moDelta * 12) / 52);

  deficitFollowupDismissed = false;
  await applyPlanObject({
    plan_id: `custom_timeline_${Math.round(price)}_${months}`,
    title: `${goalName} (${fmtMonthsLabel(months)})`,
    summary: "",
    impact_weekly_eur: -wkDelta,
    impact_savings_months: months,
    monthly_savings_delta_eur: moDelta,
    everyday_budget_delta_eur: -moDelta,
    buffer_delta_eur: 0,
    goal_name: goalName,
    goal_target_eur: price,
  });
}

function renderHistory(history, showLoading = false) {
  const d = t();
  const lastMsg = history[history.length - 1];
  const isPlanJustConfirmed = Boolean(lastMsg && (lastMsg.status_type === "plan_confirmed" || lastMsg.selected_plan_id));
  const homeVisible = (history.length > 0 || showLoading) && (!homeChatCollapsed || showLoading);

  // Näytetään tekstikentän alapuolella oleva kapea piilotuspainike silloin, kun pikkuchatissa on historiaa näkyvillä
  document.getElementById("collapseMiniChatBtn")?.classList.toggle("hidden", !(history.length > 0 && !homeChatCollapsed));

  const streams = [
    { el: document.getElementById("chatMessages"), prefix: "full", collapsed: false },
    { el: document.getElementById("homeChatMessages"), prefix: "home", collapsed: !homeVisible },
  ];

  for (const { el, prefix, collapsed } of streams) {
    if (!el) continue;
    if (collapsed) {
      el.innerHTML = "";
      continue;
    }

    const messagesHtml = history.length
      ? history
          .map((m, idx) => {
            const isUser = m.role === "user";
            const cards = m.action_cards || [];
            const selectedId = m.selected_plan_id || null;
            const uid = `${prefix}_${idx}`;
            const cardsHtml = cards.length
              ? `<div class="action-cards-stack">${cards.map((c) => renderActionCard(c, selectedId)).join("")}${renderCustomPurchaseSlider(cards, uid, selectedId)}</div>`
              : "";
            return `
              <div class="msg-group ${isUser ? "user" : "assistant"}">
                <div class="msg ${isUser ? "user" : "assistant"}">${formatMessageText(m.content)}</div>
                ${cardsHtml}
              </div>`;
          })
          .join("")
      : "";

    const doneBtnHtml =
      isPlanJustConfirmed && !showLoading
        ? prefix === "home"
          ? `<button type="button" class="chat-done-btn" onclick="hideMiniChat()">${d.doneHideChat}</button>`
          : `<button type="button" class="chat-done-btn" onclick="finishFullChatAndReturn()">${d.doneReturnHome}</button>`
        : "";

    const loadingHtml = showLoading
      ? `<div class="msg-group assistant"><div class="typing-bubble"><span>${d.computing}</span><span class="typing-dots"><span></span><span></span><span></span></span></div></div>`
      : "";

    el.innerHTML = messagesHtml + doneBtnHtml + loadingHtml;
    el.scrollTop = el.scrollHeight;
  }
}

function setSendingState(loading) {
  isSending = loading;
  ["homeChatSubmit", "chatSubmit"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "..." : t().send;
  });
}

async function sendMessage(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText || isSending || !currentCustomerId) return;

  homeChatCollapsed = false;
  const optimisticHistory = [...currentHistory, { role: "user", content: cleanText, action_cards: [] }];
  renderHistory(optimisticHistory, true);
  setSendingState(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement_id: currentCustomerId, message: cleanText, lang: currentLang }),
    });
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    renderSnapshot(data.updated_state);
    await loadState();
  } catch (err) {
    renderHistory([...optimisticHistory, { role: "assistant", content: `Error: ${err.message}`, action_cards: [] }]);
  } finally {
    setSendingState(false);
  }
}

async function applyPlanObject(planPayload) {
  homeChatCollapsed = false;
  const res = await fetch("/api/apply-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement_id: currentCustomerId, lang: currentLang, ...planPayload }),
  });
  const data = await res.json();
  currentSnapshot = data.snapshot;
  currentHistory = data.history || [];
  renderSnapshot(currentSnapshot);
  renderHistory(currentHistory);
}

async function applyPlanEncoded(encoded) {
  const card = JSON.parse(decodeURIComponent(encoded));
  deficitFollowupDismissed = false;
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
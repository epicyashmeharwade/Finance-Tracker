// ============================================================
// STATE
// ============================================================
let ALL_TRANSACTIONS = [];   // every parsed row, newest first, with closingBalance attached
let CURRENT_TAB = 'home';    // 'home' | 'history' | 'balances'
let DETAIL_ORIGIN = 'home';  // where to go back to from a detail screen
let HISTORY_VISIBLE_COUNT = CONFIG.PAGE_SIZE;
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const firstDay = `${year}-${pad(month + 1)}-01`;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const lastDay = `${year}-${pad(month + 1)}-${pad(lastDate)}`;
  return { from: firstDay, to: lastDay };
}

const DEFAULT_MONTH_RANGE = getCurrentMonthRange();
let HISTORY_FILTERS = { text: '', method: '', from: DEFAULT_MONTH_RANGE.from, to: DEFAULT_MONTH_RANGE.to };
let refreshTimer = null;
let isLoading = false;
let SELECTED_ACCOUNT = '__total__'; // '__total__' or a bank name from CONFIG.OPENING_BALANCES

// ============================================================
// FORMATTING HELPERS
// ============================================================
const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function formatRupees(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}<span class="rupee">₹</span>${inrFormatter.format(Math.abs(amount))}`;
}

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseSheetDate(value) {
  // Handles common formats Sheets may return: "8/30/2026", "2026-08-30", etc.
  const d = new Date(value);
  if (!isNaN(d)) return d;
  // Fallback: try dd/mm/yyyy
  const parts = String(value).split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    const fallback = new Date(c, b - 1, a);
    if (!isNaN(fallback)) return fallback;
  }
  return new Date(NaN);
}

// ============================================================
// DATA FETCH + PARSE
// ============================================================
async function fetchTransactions() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_RANGE)}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sheet fetch failed (${res.status}). Check your API key, Sheet ID, and that the sheet is shared as "Anyone with the link – Viewer".`);
  }
  const data = await res.json();
  const rows = data.values || [];

  const parsed = rows.map((row, i) => {
    const [dateRaw, description, amountRaw, account, method, app] = row;
    return {
      rowIndex: i,
      date: parseSheetDate(dateRaw),
      description: (description || '(no description)').trim(),
      amount: parseFloat(String(amountRaw).replace(/[^0-9.\-]/g, '')) || 0,
      account: (account || '').trim(),
      method: (method || '').trim(),
      app: (app || '').trim()
    };
  }).filter(t => !isNaN(t.date));

  return parsed;
}

// Sorts chronologically per account and assigns a running closing
// balance to every transaction based on CONFIG.OPENING_BALANCES.
function computeBalances(transactions) {
  const byAccount = {};
  Object.keys(CONFIG.OPENING_BALANCES).forEach(acc => byAccount[acc] = []);

  transactions.forEach(t => {
    if (!byAccount[t.account]) byAccount[t.account] = [];
    byAccount[t.account].push(t);
  });

  const accountCurrentBalances = {};

  Object.keys(byAccount).forEach(acc => {
    const list = byAccount[acc].sort((a, b) => a.date - b.date || a.rowIndex - b.rowIndex);
    let running = CONFIG.OPENING_BALANCES[acc] || 0;
    list.forEach(t => {
      running += t.amount;
      t.closingBalance = running;
    });
    accountCurrentBalances[acc] = running;
  });

  const totalBalance = Object.values(accountCurrentBalances).reduce((a, b) => a + b, 0);

  // Newest first for display
  const sortedForDisplay = [...transactions].sort((a, b) => b.date - a.date || b.rowIndex - a.rowIndex);

  return { transactions: sortedForDisplay, accountCurrentBalances, totalBalance };
}

// ============================================================
// LOAD + REFRESH
// ============================================================
async function loadData(showLoadingState) {
  if (isLoading) return;
  isLoading = true;
  try {
    const raw = await fetchTransactions();
    const { transactions, accountCurrentBalances, totalBalance } = computeBalances(raw);
    ALL_TRANSACTIONS = transactions;
    window.__ACCOUNT_BALANCES__ = accountCurrentBalances;
    window.__TOTAL_BALANCE__ = totalBalance;
    renderCurrentScreen();
    document.querySelectorAll('.balance-updated').forEach(el => {
      el.textContent = `Updated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    });
  } catch (err) {
    console.error(err);
    if (showLoadingState) {
      document.getElementById('screen-home').querySelector('.tx-list').innerHTML =
        `<li class="empty-state">Couldn't load data.<br>${err.message}</li>`;
    }
  } finally {
    isLoading = false;
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadData(false), CONFIG.REFRESH_SECONDS * 1000);
}

// ============================================================
// RENDER: HOME
// ============================================================
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return `Good morning, ${CONFIG.USER_NAME}`;
  if (hour >= 12 && hour < 16) return `Good afternoon, ${CONFIG.USER_NAME}`;
  if (hour >= 16 && hour < 24) return `Good evening, ${CONFIG.USER_NAME}`;
  return `Hi, look who's up late, ${CONFIG.USER_NAME}`;
}

function populateAccountSelector() {
  const selector = document.getElementById('account-selector');
  if (selector.dataset.populated) return;

  Object.keys(CONFIG.OPENING_BALANCES).forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc;
    opt.textContent = acc;
    selector.appendChild(opt);
  });

  selector.value = SELECTED_ACCOUNT;
  selector.dataset.populated = 'true';

  selector.addEventListener('change', (e) => {
    SELECTED_ACCOUNT = e.target.value;
    renderHome();
  });
}

function renderHome() {
  document.getElementById('greeting-name').textContent = getGreeting();
  populateAccountSelector();

  const balances = window.__ACCOUNT_BALANCES__ || {};
  const displayedBalance = SELECTED_ACCOUNT === '__total__'
    ? (window.__TOTAL_BALANCE__ || 0)
    : (balances[SELECTED_ACCOUNT] || 0);

  document.getElementById('home-balance').innerHTML = formatRupees(displayedBalance);
  document.querySelector('.balance-label').textContent =
    SELECTED_ACCOUNT === '__total__' ? 'Account balance' : SELECTED_ACCOUNT;

  const list = document.getElementById('home-tx-list');
  const recent = ALL_TRANSACTIONS.slice(0, 10);

  if (recent.length === 0) {
    list.innerHTML = `<li class="empty-state">No transactions yet.</li>`;
    return;
  }

  list.innerHTML = recent.map(t => txRowHTML(t, 'home')).join('');
  attachRowHandlers(list, 'home');
}

// ============================================================
// RENDER: HISTORY
// ============================================================
function getFilteredTransactions() {
  return ALL_TRANSACTIONS.filter(t => {
    const { text, method, from, to } = HISTORY_FILTERS;

    if (text) {
      const needle = text.toLowerCase();
      const matchesDesc = t.description.toLowerCase().includes(needle);
      const matchesAmount = String(t.amount).includes(needle);
      if (!matchesDesc && !matchesAmount) return false;
    }
    if (method && t.method !== method) return false;
    if (from && t.date < new Date(from)) return false;
    if (to && t.date > new Date(to + 'T23:59:59')) return false;

    return true;
  });
}

function renderHistory() {
  const filtered = getFilteredTransactions();
  const visible = filtered.slice(0, HISTORY_VISIBLE_COUNT);
  const list = document.getElementById('history-tx-list');

  if (visible.length === 0) {
    list.innerHTML = `<li class="empty-state">No transactions match.</li>`;
  } else {
    list.innerHTML = visible.map(t => txRowHTML(t, 'history')).join('');
    attachRowHandlers(list, 'history');
  }

  const loadMoreBtn = document.getElementById('load-more-btn');
  if (visible.length >= filtered.length) {
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.style.display = 'block';
    loadMoreBtn.textContent = `Load ${Math.min(CONFIG.PAGE_SIZE, filtered.length - visible.length)} more`;
  }

  // populate method filter options once
  const methodSelect = document.getElementById('filter-method');
  if (methodSelect.options.length <= 1) {
    const methods = [...new Set(ALL_TRANSACTIONS.map(t => t.method).filter(Boolean))];
    methods.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      methodSelect.appendChild(opt);
    });
  }
}

// ============================================================
// RENDER: BALANCES
// ============================================================
function renderBalances() {
  const container = document.getElementById('balances-list');
  const balances = window.__ACCOUNT_BALANCES__ || {};
  const accounts = Object.keys(CONFIG.OPENING_BALANCES);

  container.innerHTML = accounts.map(acc => `
    <div class="bank-row">
      <span class="bank-name">${acc}</span>
      <span class="bank-balance">${formatRupees(balances[acc] || 0)}</span>
    </div>
  `).join('');
}

// ============================================================
// RENDER: TRANSACTION ROW (shared by home + history)
// ============================================================
function txRowHTML(t, origin) {
  const amountClass = t.amount < 0 ? 'negative' : 'positive';
  return `
    <li class="tx-row" data-row-index="${t.rowIndex}" data-origin="${origin}">
      <div class="tx-left">
        <span class="tx-desc">${escapeHtml(t.description)}</span>
        <span class="tx-date">${formatDate(t.date)}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${amountClass}">${formatRupees(t.amount)}</span>
        <span class="tx-closing">${formatRupees(t.closingBalance)}</span>
      </div>
    </li>
  `;
}

function attachRowHandlers(listEl, origin) {
  listEl.querySelectorAll('.tx-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = Number(row.dataset.rowIndex);
      openDetail(idx, origin);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// RENDER: DETAIL SCREEN
// ============================================================
function openDetail(rowIndex, origin) {
  const t = ALL_TRANSACTIONS.find(x => x.rowIndex === rowIndex);
  if (!t) return;
  DETAIL_ORIGIN = origin;

  const amountClass = t.amount < 0 ? 'negative' : 'positive';
  document.getElementById('detail-amount').innerHTML = formatRupees(t.amount);
  document.getElementById('detail-amount').className = `detail-amount ${amountClass}`;
  document.getElementById('detail-desc').textContent = t.description;
  document.getElementById('detail-meta').innerHTML = `
    <div class="detail-meta-row"><span>Date</span><span>${formatDate(t.date)}</span></div>
    <div class="detail-meta-row"><span>Payment method</span><span>${escapeHtml(t.method || '—')}</span></div>
    <div class="detail-meta-row"><span>Bank account</span><span>${escapeHtml(t.account || '—')}</span></div>
    <div class="detail-meta-row"><span>Payment app</span><span>${escapeHtml(t.app || '—')}</span></div>
  `;

  document.body.classList.add('detail-open');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-detail').classList.add('active');
}

function closeDetail() {
  document.body.classList.remove('detail-open');
  switchTab(DETAIL_ORIGIN === 'history' ? 'history' : 'home');
}

// ============================================================
// TAB SWITCHING / ROUTING
// ============================================================
function switchTab(tab) {
  CURRENT_TAB = tab;
  document.body.classList.remove('detail-open');

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${tab}`).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  renderCurrentScreen();
}

function renderCurrentScreen() {
  if (document.body.classList.contains('detail-open')) return;
  if (CURRENT_TAB === 'home') renderHome();
  else if (CURRENT_TAB === 'history') renderHistory();
  else if (CURRENT_TAB === 'balances') renderBalances();
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-from').value = HISTORY_FILTERS.from;
  document.getElementById('filter-to').value = HISTORY_FILTERS.to;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('back-btn').addEventListener('click', closeDetail);

  document.getElementById('search-input').addEventListener('input', (e) => {
    HISTORY_FILTERS.text = e.target.value;
    HISTORY_VISIBLE_COUNT = CONFIG.PAGE_SIZE;
    renderHistory();
  });
  document.getElementById('filter-method').addEventListener('change', (e) => {
    HISTORY_FILTERS.method = e.target.value;
    HISTORY_VISIBLE_COUNT = CONFIG.PAGE_SIZE;
    renderHistory();
  });
  document.getElementById('filter-from').addEventListener('change', (e) => {
    HISTORY_FILTERS.from = e.target.value;
    HISTORY_VISIBLE_COUNT = CONFIG.PAGE_SIZE;
    renderHistory();
  });
  document.getElementById('filter-to').addEventListener('change', (e) => {
    HISTORY_FILTERS.to = e.target.value;
    HISTORY_VISIBLE_COUNT = CONFIG.PAGE_SIZE;
    renderHistory();
  });
  document.getElementById('load-more-btn').addEventListener('click', () => {
    HISTORY_VISIBLE_COUNT += CONFIG.PAGE_SIZE;
    renderHistory();
  });

  loadData(true);
  startAutoRefresh();
});

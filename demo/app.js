const STORAGE_KEY = "bookkeeping-demo-v1";

const categories = [
  { id: "food", name: "餐饮", type: "expense", icon: "utensils", color: "#E76F51" },
  { id: "shopping", name: "购物", type: "expense", icon: "shopping-bag", color: "#2563EB" },
  { id: "transport", name: "交通", type: "expense", icon: "bus-front", color: "#0284C7" },
  { id: "housing", name: "住房", type: "expense", icon: "house", color: "#6D28D9" },
  { id: "entertainment", name: "娱乐", type: "expense", icon: "clapperboard", color: "#DB2777" },
  { id: "health", name: "医疗", type: "expense", icon: "heart-pulse", color: "#DC2626" },
  { id: "utilities", name: "生活缴费", type: "expense", icon: "receipt-text", color: "#64748B" },
  { id: "expense-other", name: "其他支出", type: "expense", icon: "more-horizontal", color: "#78716C" },
  { id: "salary", name: "工资", type: "income", icon: "banknote", color: "#16836B" },
  { id: "bonus", name: "奖金", type: "income", icon: "gift", color: "#0F766E" },
  { id: "investment", name: "理财", type: "income", icon: "trending-up", color: "#047857" },
  { id: "income-other", name: "其他收入", type: "income", icon: "more-horizontal", color: "#65A30D" },
];

const mockReceiptTemplates = [
  { merchant: "星巴克咖啡", amountMinor: 3800, categoryId: "food", note: "咖啡和小食", confidence: 0.93 },
  { merchant: "永辉超市", amountMinor: 8850, categoryId: "shopping", note: "日常采购", confidence: 0.91 },
  { merchant: "中石化加油站", amountMinor: 26000, categoryId: "transport", note: "车辆加油", confidence: 0.89 },
  { merchant: "美团外卖", amountMinor: 4680, categoryId: "food", note: "晚餐", confidence: 0.9 },
];

let state = loadState();
let editingId = null;
let detailId = null;
let pendingDeleteId = null;
let confirmAction = "delete";
let currentMode = "manual";
let selectedType = "expense";
let selectedCategoryId = "food";
let currentImage = null;
let pendingRecognition = null;
let recognitionTimer = null;
const imageCache = new Map();

const elements = {};

function getCategoryById(id) {
  return categories.find((category) => category.id === id) || null;
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toMinor(value) {
  const numeric = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round((numeric + Number.EPSILON) * 100);
}

function formatCurrency(minor, currency = "CNY") {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatSignedCurrency(transaction) {
  const value = formatCurrency(transaction.amountMinor);
  return transaction.type === "income" ? `+${value}` : `-${value}`;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatFullDate(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatMonth(now = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(now);
}

function isInMonth(transaction, now = new Date()) {
  const date = new Date(`${transaction.occurredAt}T00:00:00`);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function summarize(transactions, now = new Date()) {
  const result = { income: 0, expense: 0, balance: 0, count: 0 };

  transactions.forEach((transaction) => {
    if (!isInMonth(transaction, now)) {
      return;
    }

    result.count += 1;
    if (transaction.type === "income") {
      result.income += transaction.amountMinor;
    } else {
      result.expense += transaction.amountMinor;
    }
  });

  result.balance = result.income - result.expense;
  return result;
}

function createSeedTransactions(now = new Date()) {
  const maxDay = now.getDate();
  const date = (day) => {
    const safeDay = Math.min(day, maxDay);
    const value = new Date(now.getFullYear(), now.getMonth(), safeDay);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const paddedDay = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${paddedDay}`;
  };

  const transactions = [
    {
      id: "seed-1",
      type: "expense",
      amountMinor: 3650,
      currency: "CNY",
      occurredAt: date(3),
      categoryId: "food",
      note: "午餐",
      receipt: null,
      createdAt: date(3),
      updatedAt: date(3),
    },
    {
      id: "seed-2",
      type: "expense",
      amountMinor: 12800,
      currency: "CNY",
      occurredAt: date(5),
      categoryId: "transport",
      note: "打车和地铁",
      receipt: null,
      createdAt: date(5),
      updatedAt: date(5),
    },
    {
      id: "seed-3",
      type: "income",
      amountMinor: 1280000,
      currency: "CNY",
      occurredAt: date(7),
      categoryId: "salary",
      note: "本月工资",
      receipt: null,
      createdAt: date(7),
      updatedAt: date(7),
    },
    {
      id: "seed-4",
      type: "expense",
      amountMinor: 19900,
      currency: "CNY",
      occurredAt: date(4),
      categoryId: "health",
      note: "药店购药",
      receipt: null,
      createdAt: date(4),
      updatedAt: date(4),
    },
    {
      id: "seed-5",
      type: "expense",
      amountMinor: 8850,
      currency: "CNY",
      occurredAt: date(8),
      categoryId: "shopping",
      note: "超市采购",
      receipt: {
        id: "seed-receipt-1",
        fileName: "sample-receipt.svg",
        isSample: true,
        confidence: 0.91,
        recognizedFields: {
          merchant: "永辉超市",
          categoryId: "shopping",
        },
      },
      createdAt: date(8),
      updatedAt: date(8),
    },
    {
      id: "seed-6",
      type: "expense",
      amountMinor: 6800,
      currency: "CNY",
      occurredAt: date(6),
      categoryId: "entertainment",
      note: "电影票",
      receipt: null,
      createdAt: date(6),
      updatedAt: date(6),
    },
    {
      id: "seed-7",
      type: "expense",
      amountMinor: 32000,
      currency: "CNY",
      occurredAt: date(9),
      categoryId: "housing",
      note: "水电燃气",
      receipt: null,
      createdAt: date(9),
      updatedAt: date(9),
    },
    {
      id: "seed-8",
      type: "expense",
      amountMinor: 4500,
      currency: "CNY",
      occurredAt: date(10),
      categoryId: "food",
      note: "咖啡",
      receipt: null,
      createdAt: date(10),
      updatedAt: date(10),
    },
  ];

  return transactions.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) {
      return b.occurredAt.localeCompare(a.occurredAt);
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

function seedState() {
  return { transactions: createSeedTransactions() };
}

function loadState() {
  try {
    if (typeof localStorage === "undefined") {
      return seedState();
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return seedState();
    }

    const parsed = JSON.parse(stored);
    if (!parsed || !Array.isArray(parsed.transactions)) {
      return seedState();
    }

    return parsed;
  } catch {
    return seedState();
  }
}

function saveState() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    showToast("演示数据仅保存在当前页面内存中", "error");
  }
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickMockReceipt(value = "") {
  const index = hashString(value) % mockReceiptTemplates.length;
  return mockReceiptTemplates[index];
}

function createSampleReceiptDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="560" height="720" viewBox="0 0 560 720">
      <rect width="560" height="720" fill="#fbfaf7"/>
      <rect x="52" y="36" width="456" height="648" rx="10" fill="#fffdf8" stroke="#ddd6c8" stroke-width="2"/>
      <text x="280" y="106" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="700" fill="#2e2924">永辉超市</text>
      <text x="280" y="142" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#7a7167">购物小票</text>
      <line x1="92" y1="178" x2="468" y2="178" stroke="#ddd6c8" stroke-width="2" stroke-dasharray="8 8"/>
      <text x="92" y="226" font-family="monospace" font-size="20" fill="#4c463f">商品名称</text>
      <text x="408" y="226" font-family="monospace" font-size="20" fill="#4c463f">金额</text>
      <text x="92" y="278" font-family="monospace" font-size="19" fill="#2e2924">牛奶 950ml</text>
      <text x="408" y="278" text-anchor="end" font-family="monospace" font-size="19" fill="#2e2924">23.80</text>
      <text x="92" y="328" font-family="monospace" font-size="19" fill="#2e2924">鸡蛋 12枚</text>
      <text x="408" y="328" text-anchor="end" font-family="monospace" font-size="19" fill="#2e2924">18.90</text>
      <text x="92" y="378" font-family="monospace" font-size="19" fill="#2e2924">洗衣液</text>
      <text x="408" y="378" text-anchor="end" font-family="monospace" font-size="19" fill="#2e2924">45.80</text>
      <line x1="92" y1="424" x2="468" y2="424" stroke="#ddd6c8" stroke-width="2"/>
      <text x="92" y="478" font-family="sans-serif" font-size="21" font-weight="700" fill="#2e2924">合计</text>
      <text x="468" y="478" text-anchor="end" font-family="monospace" font-size="24" font-weight="700" fill="#2563eb">¥88.50</text>
      <text x="92" y="532" font-family="sans-serif" font-size="17" fill="#7a7167">日期</text>
      <text x="468" y="532" text-anchor="end" font-family="monospace" font-size="17" fill="#4c463f">2026-09-10</text>
      <text x="92" y="584" font-family="sans-serif" font-size="17" fill="#7a7167">支付方式</text>
      <text x="468" y="584" text-anchor="end" font-family="monospace" font-size="17" fill="#4c463f">微信支付</text>
      <line x1="92" y1="628" x2="468" y2="628" stroke="#ddd6c8" stroke-width="2" stroke-dasharray="8 8"/>
      <text x="280" y="666" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#8a8177">感谢惠顾，欢迎再次光临</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getReceiptPreviewUrl(receipt) {
  if (!receipt) {
    return null;
  }

  if (imageCache.has(receipt.id)) {
    return imageCache.get(receipt.id);
  }

  return receipt.isSample ? createSampleReceiptDataUrl() : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  renderSummary();
  renderTransactions();
  refreshIcons();
}

function renderSummary() {
  const summary = summarize(state.transactions);
  elements.monthLabel.textContent = formatMonth();
  elements.balanceValue.textContent = formatCurrency(summary.balance);
  elements.incomeValue.textContent = formatCurrency(summary.income);
  elements.expenseValue.textContent = formatCurrency(summary.expense);
  elements.recordCount.textContent = `本月共 ${summary.count} 笔账单`;
  elements.balanceValue.classList.toggle("income", summary.balance >= 0);
  elements.balanceValue.classList.toggle("expense", summary.balance < 0);
}

function renderTransactions() {
  const monthTransactions = state.transactions.filter((transaction) => isInMonth(transaction));

  if (!monthTransactions.length) {
    elements.transactionList.innerHTML = `
      <div class="empty-state">
        <div>
          <i data-lucide="notebook-tabs"></i>
          <h3>本月还没有账单</h3>
          <p>点击右下角按钮，记下第一笔收支。</p>
          <button class="primary-button" type="button" data-open-entry>
            <i data-lucide="plus"></i>
            记一笔
          </button>
        </div>
      </div>
    `;
    refreshIcons();
    return;
  }

  elements.transactionList.innerHTML = monthTransactions
    .map((transaction) => {
      const category = getCategoryById(transaction.categoryId);
      const categoryName = category ? category.name : "未分类";
      const categoryColor = category ? category.color : "#78716C";
      const categoryIcon = category ? category.icon : "more-horizontal";
      const meta = [formatDate(transaction.occurredAt), transaction.note].filter(Boolean).join(" · ");

      return `
        <button class="transaction-row" type="button" data-detail-id="${escapeHtml(transaction.id)}">
          <span class="category-icon" style="color:${categoryColor};background:${hexToSoft(categoryColor)}">
            <i data-lucide="${categoryIcon}"></i>
          </span>
          <span class="transaction-main">
            <span class="transaction-title">
              <strong>${escapeHtml(categoryName)}</strong>
              ${
                transaction.receipt
                  ? '<span class="receipt-dot"><i data-lucide="image"></i>图片</span>'
                  : ""
              }
            </span>
            <span class="transaction-meta">${escapeHtml(meta)}</span>
          </span>
          <span class="transaction-amount ${transaction.type}">
            <strong>${escapeHtml(formatSignedCurrency(transaction))}</strong>
            <small>${escapeHtml(transaction.type === "income" ? "收入" : "支出")}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function hexToSoft(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return "#EEF2F4";
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.13)`;
}

function renderCategories() {
  const filtered = categories.filter((category) => category.type === selectedType);

  elements.categoryChips.innerHTML = filtered
    .map(
      (category) => `
        <button class="category-chip ${selectedCategoryId === category.id ? "is-selected" : ""}" type="button" data-category-id="${category.id}">
          <i data-lucide="${category.icon}"></i>
          <span>${escapeHtml(category.name)}</span>
        </button>
      `,
    )
    .join("");

  refreshIcons();
}

function openBackdrop(id) {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

function closeBackdrop(id) {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = true;
  }

  if (!document.querySelector(".modal-backdrop:not([hidden])")) {
    document.body.style.overflow = "";
  }
}

function closeAllBackdrops() {
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.hidden = true;
  });
  document.body.style.overflow = "";
}

function openActionSheet() {
  closeAllBackdrops();
  openBackdrop("actionSheetBackdrop");
}

function setEntryMode(mode) {
  currentMode = mode;
  elements.imageEntrySection.hidden = mode !== "image";
  elements.entryDialogEyebrow.textContent = editingId ? "编辑账单" : "新增账单";
  elements.entryDialogTitle.textContent = mode === "image" ? "图片记账" : "手动记账";
}

function resetForm() {
  editingId = null;
  pendingRecognition = null;
  clearRecognitionTimer();
  clearCurrentImage();
  selectedType = "expense";
  selectedCategoryId = "food";
  elements.transactionForm.reset();
  elements.dateInput.value = new Date().toISOString().slice(0, 10);
  setEntryType("expense");
  hideFormError();
}

function openEntryForm(mode, transaction = null) {
  resetForm();
  editingId = transaction ? transaction.id : null;
  setEntryMode(mode);

  if (transaction) {
    selectedType = transaction.type;
    selectedCategoryId = transaction.categoryId;
    elements.amountInput.value = (transaction.amountMinor / 100).toFixed(2);
    elements.dateInput.value = transaction.occurredAt;
    elements.noteInput.value = transaction.note || "";
    setEntryType(transaction.type);

    if (transaction.receipt) {
      currentImage = {
        id: transaction.receipt.id,
        name: transaction.receipt.fileName,
        isSample: transaction.receipt.isSample,
        previewUrl: getReceiptPreviewUrl(transaction.receipt),
      };
      pendingRecognition = {
        confidence: transaction.receipt.confidence,
        merchant: transaction.receipt.recognizedFields?.merchant || "",
      };
      showImagePreview(currentImage.previewUrl, currentImage.name);
      if (pendingRecognition.confidence) {
        showRecognitionNotice();
      }
    }
  }

  closeBackdrop("actionSheetBackdrop");
  openBackdrop("entryModalBackdrop");
  window.setTimeout(() => {
    if (mode === "manual" && !transaction) {
      elements.amountInput.focus();
    }
  }, 80);
}

function setEntryType(type) {
  selectedType = type;
  elements.expenseTypeButton.classList.toggle("is-active", type === "expense");
  elements.incomeTypeButton.classList.toggle("is-active", type === "income");
  if (!categories.some((category) => category.id === selectedCategoryId && category.type === type)) {
    selectedCategoryId = type === "expense" ? "food" : "salary";
  }
  renderCategories();
}

function handleFileSelection(file) {
  if (!file) {
    return;
  }

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    showFormError("请选择 PNG、JPEG 或 WebP 格式的图片。");
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showFormError("图片不能超过 20 MB。");
    return;
  }

  clearCurrentImage();
  clearRecognitionTimer();
  const previewUrl = URL.createObjectURL(file);
  currentImage = {
    name: file.name,
    isSample: false,
    previewUrl,
  };
  imageCache.set(currentImage.name, previewUrl);
  showImagePreview(previewUrl, file.name);
  hideFormError();
  runMockRecognition(file.name);
}

function useSampleReceipt() {
  clearCurrentImage();
  clearRecognitionTimer();
  const previewUrl = createSampleReceiptDataUrl();
  currentImage = {
    name: "sample-receipt.svg",
    isSample: true,
    previewUrl,
  };
  showImagePreview(previewUrl, currentImage.name);
  hideFormError();
  runMockRecognition(currentImage.name);
}

function showImagePreview(url, name) {
  elements.dropzonePrompt.hidden = true;
  elements.imagePreviewWrap.hidden = false;
  elements.imagePreview.src = url;
  elements.imagePreview.alt = `${name} 预览`;
}

function resetImageSection() {
  clearCurrentImage();
  clearRecognitionTimer();
  elements.dropzonePrompt.hidden = false;
  elements.imagePreviewWrap.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.imageFileInput.value = "";
  elements.recognitionState.hidden = true;
  elements.recognitionNotice.hidden = true;
  pendingRecognition = null;
}

function clearCurrentImage() {
  if (currentImage?.previewUrl && !currentImage.isSample && currentImage.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(currentImage.previewUrl);
  }
  currentImage = null;
}

function clearRecognitionTimer() {
  if (recognitionTimer) {
    window.clearTimeout(recognitionTimer);
    recognitionTimer = null;
  }
}

function runMockRecognition(value) {
  elements.recognitionNotice.hidden = true;
  elements.recognitionState.hidden = false;
  pendingRecognition = null;

  clearRecognitionTimer();
  recognitionTimer = window.setTimeout(() => {
    const result = pickMockReceipt(value);
    pendingRecognition = result;
    elements.amountInput.value = (result.amountMinor / 100).toFixed(2);
    elements.dateInput.value = new Date().toISOString().slice(0, 10);
    elements.noteInput.value = result.note;
    selectedCategoryId = result.categoryId;
    setEntryType("expense");
    elements.recognitionState.hidden = true;
    showRecognitionNotice();
    refreshIcons();
  }, 1150);
}

function showRecognitionNotice() {
  const confidence = pendingRecognition?.confidence;
  elements.recognitionNotice.querySelector("span").textContent = confidence
    ? `已生成模拟识别结果，置信度 ${Math.round(confidence * 100)}%，请确认后保存`
    : "已读取图片信息，请确认后保存";
  elements.recognitionNotice.hidden = false;
}

function showFormError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function hideFormError() {
  elements.formError.hidden = true;
  elements.formError.textContent = "";
}

function buildReceipt() {
  if (!currentImage) {
    return null;
  }

  const receiptId = currentImage.id || makeId();
  if (currentImage.previewUrl) {
    imageCache.set(receiptId, currentImage.previewUrl);
  }

  return {
    id: receiptId,
    fileName: currentImage.name,
    isSample: currentImage.isSample,
    confidence: pendingRecognition?.confidence ?? null,
    recognizedFields: pendingRecognition
      ? {
          merchant: pendingRecognition.merchant,
          categoryId: pendingRecognition.categoryId,
        }
      : null,
  };
}

function handleSubmit(event) {
  event.preventDefault();
  hideFormError();

  const amountMinor = toMinor(elements.amountInput.value);
  const occurredAt = elements.dateInput.value;
  const note = elements.noteInput.value.trim();

  if (!elements.amountInput.value.trim()) {
    showFormError("请输入金额。");
    elements.amountInput.focus();
    return;
  }

  if (!amountMinor || amountMinor <= 0) {
    showFormError("金额必须大于 0。");
    elements.amountInput.focus();
    return;
  }

  if (!occurredAt) {
    showFormError("请选择日期。");
    elements.dateInput.focus();
    return;
  }

  if (!selectedCategoryId) {
    showFormError("请选择一个分类。");
    return;
  }

  if (currentMode === "image" && !currentImage) {
    showFormError("请先选择一张图片。");
    return;
  }

  const receipt = buildReceipt();
  const nowIso = new Date().toISOString();

  if (editingId) {
    const index = state.transactions.findIndex((transaction) => transaction.id === editingId);
    if (index >= 0) {
      state.transactions[index] = {
        ...state.transactions[index],
        type: selectedType,
        amountMinor,
        occurredAt,
        categoryId: selectedCategoryId,
        note,
        receipt,
        updatedAt: nowIso,
      };
    }
    showToast("账单已更新");
  } else {
    const transaction = {
      id: makeId(),
      type: selectedType,
      amountMinor,
      currency: "CNY",
      occurredAt,
      categoryId: selectedCategoryId,
      note,
      receipt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.transactions.push(transaction);
    showToast("账单已保存");
  }

  state.transactions.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) {
      return b.occurredAt.localeCompare(a.occurredAt);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  saveState();
  render();
  closeBackdrop("entryModalBackdrop");
}

function renderDetail(transaction) {
  const category = getCategoryById(transaction.categoryId);
  const previewUrl = getReceiptPreviewUrl(transaction.receipt);
  const typeLabel = transaction.type === "income" ? "收入" : "支出";

  elements.detailContent.innerHTML = `
    <div class="detail-amount ${transaction.type}">
      <span>${typeLabel}金额</span>
      <strong>${escapeHtml(formatSignedCurrency(transaction))}</strong>
    </div>
    <div class="detail-grid">
      <div class="detail-field">
        <span>分类</span>
        <strong>${escapeHtml(category?.name || "未分类")}</strong>
      </div>
      <div class="detail-field">
        <span>日期</span>
        <strong>${escapeHtml(formatFullDate(transaction.occurredAt))}</strong>
      </div>
      <div class="detail-field">
        <span>类型</span>
        <strong>${typeLabel}</strong>
      </div>
      <div class="detail-field">
        <span>币种</span>
        <strong>${escapeHtml(transaction.currency || "CNY")}</strong>
      </div>
    </div>
    <div class="detail-note">${escapeHtml(transaction.note || "")}</div>
    ${
      previewUrl
        ? `<div class="detail-image"><img src="${escapeHtml(previewUrl)}" alt="账单图片"></div>`
        : ""
    }
    ${
      transaction.receipt?.confidence
        ? `<div class="detail-recognition">
            <i data-lucide="scan-line"></i>
            <span>图片识别置信度 ${Math.round(transaction.receipt.confidence * 100)}%</span>
          </div>`
        : ""
    }
  `;
  refreshIcons();
}

function openDetail(transactionId) {
  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) {
    return;
  }

  detailId = transactionId;
  renderDetail(transaction);
  closeBackdrop("actionSheetBackdrop");
  openBackdrop("detailModalBackdrop");
}

function requestDelete() {
  if (!detailId) {
    return;
  }

  const transaction = state.transactions.find((item) => item.id === detailId);
  if (!transaction) {
    return;
  }

  pendingDeleteId = detailId;
  confirmAction = "delete";
  elements.confirmTitle.textContent = "删除这笔账单？";
  elements.confirmMessage.textContent = "删除后无法恢复，关联图片也会被删除。";
  elements.confirmDeleteButton.querySelector("span, strong")?.remove();
  elements.confirmDeleteButton.textContent = "";
  elements.confirmDeleteButton.insertAdjacentHTML(
    "afterbegin",
    '<i data-lucide="trash-2"></i><span>确认删除</span>',
  );
  openBackdrop("confirmModalBackdrop");
  refreshIcons();
}

function requestReset() {
  confirmAction = "reset";
  elements.confirmTitle.textContent = "恢复演示数据？";
  elements.confirmMessage.textContent = "当前新增和修改的数据会被清除，并恢复为初始演示账单。";
  elements.confirmDeleteButton.textContent = "";
  elements.confirmDeleteButton.insertAdjacentHTML(
    "afterbegin",
    '<i data-lucide="rotate-ccw"></i><span>确认恢复</span>',
  );
  closeBackdrop("mobileNavBackdrop");
  openBackdrop("confirmModalBackdrop");
  refreshIcons();
}

function confirmActionHandler() {
  if (confirmAction === "reset") {
    state = seedState();
    imageCache.clear();
    saveState();
    render();
    closeBackdrop("confirmModalBackdrop");
    showToast("演示数据已恢复");
    return;
  }

  if (!pendingDeleteId) {
    return;
  }

  const deletedTransaction = state.transactions.find(
    (transaction) => transaction.id === pendingDeleteId,
  );
  state.transactions = state.transactions.filter((transaction) => transaction.id !== pendingDeleteId);
  if (deletedTransaction?.receipt) {
    imageCache.delete(deletedTransaction.receipt.id);
  }
  saveState();
  render();
  pendingDeleteId = null;
  detailId = null;
  closeBackdrop("confirmModalBackdrop");
  closeBackdrop("detailModalBackdrop");
  showToast("账单已删除");
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${type === "success" ? "circle-check" : "triangle-alert"}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  elements.toastContainer.appendChild(toast);
  refreshIcons();

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function refreshIcons() {
  if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

function bindEvents() {
  elements.addButton.addEventListener("click", openActionSheet);
  elements.manualEntryButton.addEventListener("click", () => openEntryForm("manual"));
  elements.imageEntryButton.addEventListener("click", () => openEntryForm("image"));
  elements.menuButton.addEventListener("click", () => openBackdrop("mobileNavBackdrop"));

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeBackdrop(button.dataset.close));
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeBackdrop(backdrop.id);
      }
    });
  });

  elements.expenseTypeButton.addEventListener("click", () => setEntryType("expense"));
  elements.incomeTypeButton.addEventListener("click", () => setEntryType("income"));

  elements.categoryChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-id]");
    if (!button) {
      return;
    }
    selectedCategoryId = button.dataset.categoryId;
    renderCategories();
  });

  elements.imageDropzone.addEventListener("click", () => elements.imageFileInput.click());
  elements.imageDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.imageFileInput.click();
    }
  });
  elements.imageFileInput.addEventListener("change", (event) => {
    handleFileSelection(event.target.files[0]);
  });
  elements.replaceImageButton.addEventListener("click", (event) => {
    event.stopPropagation();
    resetImageSection();
    elements.imageFileInput.click();
  });
  elements.sampleReceiptButton.addEventListener("click", useSampleReceipt);

  elements.transactionList.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-detail-id]");
    if (detailButton) {
      openDetail(detailButton.dataset.detailId);
      return;
    }

    if (event.target.closest("[data-open-entry]")) {
      openActionSheet();
    }
  });

  elements.transactionForm.addEventListener("submit", handleSubmit);
  elements.cancelEntryButton.addEventListener("click", () => closeBackdrop("entryModalBackdrop"));
  elements.editTransactionButton.addEventListener("click", () => {
    const transaction = state.transactions.find((item) => item.id === detailId);
    closeBackdrop("detailModalBackdrop");
    if (transaction) {
      openEntryForm(transaction.receipt ? "image" : "manual", transaction);
    }
  });
  elements.deleteTransactionButton.addEventListener("click", requestDelete);
  elements.cancelDeleteButton.addEventListener("click", () => closeBackdrop("confirmModalBackdrop"));
  elements.confirmDeleteButton.addEventListener("click", confirmActionHandler);
  elements.resetDataButton.addEventListener("click", requestReset);
  elements.mobileResetButton.addEventListener("click", requestReset);
  elements.helpButton.addEventListener("click", () => openBackdrop("helpModalBackdrop"));
  elements.mobileHelpButton.addEventListener("click", () => {
    closeBackdrop("mobileNavBackdrop");
    openBackdrop("helpModalBackdrop");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllBackdrops();
    }
  });
}

function cacheElements() {
  const ids = [
    "monthLabel",
    "balanceValue",
    "incomeValue",
    "expenseValue",
    "recordCount",
    "transactionList",
    "addButton",
    "menuButton",
    "manualEntryButton",
    "imageEntryButton",
    "entryModalBackdrop",
    "detailModalBackdrop",
    "confirmModalBackdrop",
    "helpModalBackdrop",
    "mobileNavBackdrop",
    "actionSheetBackdrop",
    "transactionForm",
    "entryDialogEyebrow",
    "entryDialogTitle",
    "imageEntrySection",
    "imageFileInput",
    "imageDropzone",
    "dropzonePrompt",
    "imagePreviewWrap",
    "imagePreview",
    "replaceImageButton",
    "sampleReceiptButton",
    "recognitionState",
    "recognitionNotice",
    "expenseTypeButton",
    "incomeTypeButton",
    "amountInput",
    "dateInput",
    "categoryChips",
    "noteInput",
    "formError",
    "cancelEntryButton",
    "saveEntryButton",
    "detailContent",
    "editTransactionButton",
    "deleteTransactionButton",
    "confirmTitle",
    "confirmMessage",
    "cancelDeleteButton",
    "confirmDeleteButton",
    "resetDataButton",
    "mobileResetButton",
    "helpButton",
    "mobileHelpButton",
    "toastContainer",
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function init() {
  cacheElements();
  bindEvents();
  elements.dateInput.value = new Date().toISOString().slice(0, 10);
  setEntryType("expense");
  render();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

if (typeof module !== "undefined") {
  module.exports = {
    categories,
    mockReceiptTemplates,
    createSeedTransactions,
    formatCurrency,
    formatSignedCurrency,
    formatDate,
    formatFullDate,
    formatMonth,
    getCategoryById,
    isInMonth,
    pickMockReceipt,
    seedState,
    summarize,
    toMinor,
  };
}

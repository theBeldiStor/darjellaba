import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// =========================
// Supabase configuration
// =========================
const SUPABASE_URL = "https://begttfktetyeqjoltehs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3P7qQ_nLAca54GbkRkz-fQ_mkw1ZPJ1";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// App configuration
// =========================
const whatsappNumber = "212642047321"; // بدل هذا الرقم برقمك الحقيقي
const cartKey = "darija_cart_v1";

// Cached products (from Supabase)
let allProducts = [];
let productsRealtimeChannel = null;
const optionalColumnSupport = {
  sizes: false,
  size: false,
  taille: false,
  tailles: false,
  rating_value: false,
  reviews_count: false,
  availability_text: false,
};
let schemaChecked = false;

const baseProductSelect = "id,name,price,old_price,description,image_url,category,stock";

async function ensureProductSchema() {
  if (schemaChecked) return;

  // First try to infer existing columns from an actual row.
  // This is more reliable when schemas evolve (size/taille/sizes/tailles).
  try {
    const { data, error } = await supabase.from("products").select("*").limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      const sample = data[0] || {};
      Object.keys(optionalColumnSupport).forEach((columnName) => {
        optionalColumnSupport[columnName] = Object.prototype.hasOwnProperty.call(sample, columnName);
      });
      schemaChecked = true;
      return;
    }
  } catch (error) {
    // Fallback to per-column probing below.
  }

  const columnsToCheck = Object.keys(optionalColumnSupport);
  await Promise.all(
    columnsToCheck.map(async (columnName) => {
      try {
        const { error } = await supabase.from("products").select(columnName).limit(1);
        optionalColumnSupport[columnName] = !error;
      } catch (error) {
        optionalColumnSupport[columnName] = false;
      }
    })
  );
  schemaChecked = true;
}

function hasOptionalColumn(columnName) {
  return Boolean(optionalColumnSupport[columnName]);
}

function getOptionalColumnValue(product, columnName) {
  if (!hasOptionalColumn(columnName)) return undefined;
  return product?.[columnName];
}

function parseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getProductRatingValue(product) {
  const rating = parseNumber(getOptionalColumnValue(product, "rating_value"));
  if (rating === null) return null;
  return Math.max(0, Math.min(5, rating));
}

function getProductReviewsCountValue(product) {
  const reviews = parseNumber(getOptionalColumnValue(product, "reviews_count"));
  if (reviews === null) return null;
  return Math.max(0, Math.floor(reviews));
}

function getProductAvailabilityLabel(product) {
  const text = String(getOptionalColumnValue(product, "availability_text") || "").trim();
  if (text) return text;
  return getStockUrgencyLabel(product);
}

function getProductRawSizesValue(product) {
  const sizeColumns = ["sizes", "size", "taille", "tailles"];
  for (const columnName of sizeColumns) {
    const value = product?.[columnName];
    if (Array.isArray(value) && value.length) return value;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function resolveSizeColumnName(product) {
  const sizeColumns = ["sizes", "size", "taille", "tailles"];
  const fromProduct = sizeColumns.find((columnName) => product && Object.prototype.hasOwnProperty.call(product, columnName));
  if (fromProduct) return fromProduct;
  return sizeColumns.find((columnName) => hasOptionalColumn(columnName)) || null;
}

function getProductRatingMarkup(product) {
  const rating = getProductRatingValue(product);
  const reviewsCount = getProductReviewsCountValue(product);
  if (rating === null || reviewsCount === null) return "";
  return `<div class="text-[11px] font-semibold text-slate-500">⭐ ${rating.toFixed(1)} / 5 · ${reviewsCount} تقييم</div>`;
}

function buildOptionalProductPayload({ product, sizes, ratingValue, reviewsCountValue, availabilityTextValue }) {
  const optionalPayload = {};

  const sizeTargetColumn = resolveSizeColumnName(product);
  if (sizeTargetColumn) {
    optionalPayload[sizeTargetColumn] = String(sizes || "").trim() || null;
  }

  if (hasOptionalColumn("rating_value")) {
    optionalPayload.rating_value = ratingValue !== "" && ratingValue !== null ? Number(ratingValue) : null;
  }

  if (hasOptionalColumn("reviews_count")) {
    optionalPayload.reviews_count = reviewsCountValue !== "" && reviewsCountValue !== null ? Number(reviewsCountValue) : null;
  }

  if (hasOptionalColumn("availability_text")) {
    optionalPayload.availability_text = availabilityTextValue ? String(availabilityTextValue).trim() : null;
  }

  return optionalPayload;
}

function getProductSelectColumns() {
  const optionalColumns = Object.entries(optionalColumnSupport)
    .filter(([, supported]) => supported)
    .map(([columnName]) => columnName);

  if (!optionalColumns.length) return baseProductSelect;
  return `${baseProductSelect},${optionalColumns.join(",")}`;
}

// Admin modal state
let adminModal = null;
let adminEmailInput = null;
let adminPasswordInput = null;
let adminLoginError = null;

// Admin product form state
let editingId = null;
let currentImageFile = null;
let currentImagePreview = "";
let editingExistingImageUrl = "";

const loadingEl = document.getElementById("loading");

function setLoading(isLoading) {
  if (!loadingEl) return;
  loadingEl.style.display = isLoading ? "grid" : "none";
}

function openAdminModal() {
  if (!adminModal) return;
  adminModal.classList.add("show");
  adminModal.setAttribute("aria-hidden", "false");
  if (adminLoginError) adminLoginError.textContent = "";
  if (adminEmailInput) adminEmailInput.value = "";
  if (adminPasswordInput) adminPasswordInput.value = "";
  adminEmailInput?.focus();
}

function closeAdminModal() {
  if (!adminModal) return;
  adminModal.classList.remove("show");
  adminModal.setAttribute("aria-hidden", "true");
}

function bindAdminModal() {
  adminModal = document.getElementById("adminModal");
  if (!adminModal) return;

  adminEmailInput = document.getElementById("adminEmailInput");
  adminPasswordInput = document.getElementById("adminPasswordInput");
  adminLoginError = document.getElementById("adminLoginError");

  const trigger = document.getElementById("adminTrigger");
  const loginBtn = document.getElementById("adminLoginBtn");
  const closeButtons = adminModal.querySelectorAll("[data-close]");

  trigger?.addEventListener("click", openAdminModal);
  closeButtons.forEach((button) => button.addEventListener("click", closeAdminModal));
  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) closeAdminModal();
  });

  loginBtn?.addEventListener("click", async () => {
    if (!adminEmailInput || !adminPasswordInput) return;

    const email = adminEmailInput.value.trim();
    const password = adminPasswordInput.value;
    if (!email || !password) {
      if (adminLoginError) adminLoginError.textContent = "دخل الإيميل وكود السر.";
      return;
    }

    if (adminLoginError) adminLoginError.textContent = "";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (adminLoginError) adminLoginError.textContent = "ماقدّرتش ندير الدخول. راجع المعلومات.";
      return;
    }

    closeAdminModal();
    showToast("دخلتي بنجاح ✅");
    if (document.body?.dataset?.page === "admin") {
      await updateAdminView();
    } else {
      window.location.href = "admin.html";
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAdminModal();
  });
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

async function isAuthedAdmin() {
  const session = await getSession();
  return Boolean(session);
}

function getCart() {
  const stored = localStorage.getItem(cartKey);
  if (!stored) return [];
  try {
    return JSON.parse(stored) || [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartCount();
}

function parsePrice(value) {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isNaN(numeric) ? 0 : numeric;
}

function formatPrice(amount) {
  return `${amount} DH`;
}

function getProductPriceValue(product) {
  return parsePrice(product?.price);
}

function getProductOldPriceValue(product) {
  return parsePrice(product?.old_price);
}

function getDiscountLabel(product) {
  const price = getProductPriceValue(product);
  const oldPrice = getProductOldPriceValue(product);
  if (!oldPrice || oldPrice <= price || price <= 0) return "Promo";
  const percent = Math.round(((oldPrice - price) / oldPrice) * 100);
  return `-${percent}%`;
}

function getStockUrgencyLabel(product) {
  const value = Number(product?.stock);
  if (!Number.isFinite(value)) return "🔥 ستوك محدود";
  if (value <= 0) return "نفذ الستوك";
  if (value <= 3) return `باقي ${value} فقط`;
  if (value <= 7) return `باقي ${value}`;
  return "متوفر";
}

function getProductSizesLabel(product) {
  const raw = getProductRawSizesValue(product);
  if (Array.isArray(raw)) {
    const cleaned = raw.map((value) => String(value || "").trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(" ") : "";
  }
  const text = String(raw || "").trim();
  if (!text) return "";
  const cleaned = text
    .split(/[;,|/]+|\s{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned.join(" ") : text;
}

function getProductSizesArray(product) {
  const label = getProductSizesLabel(product);
  if (!label) return [];
  return label
    .split(/[\s,|/;-]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function renderProductPriceMarkup(product) {
  const priceValue = getProductPriceValue(product);
  const oldPriceValue = getProductOldPriceValue(product);
  const hasDiscount = oldPriceValue > priceValue && priceValue > 0;
  const currentPriceText = formatPrice(priceValue || 0);

  if (!hasDiscount) {
    return `<span class="current-price">${currentPriceText}</span>`;
  }

  return `
    <span class="current-price">${currentPriceText}</span>
    <span class="old-price">${formatPrice(oldPriceValue)}</span>
  `;
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = count;
  });
  if (document.getElementById("cartDrawerItems")) {
    renderCartDrawer();
  }
}

function addToCart(productId) {
  const cart = getCart();
  const existing = cart.find((item) => String(item.id) === String(productId));
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }
  saveCart(cart);
  showToast("تزاد فالسلة ✅");
}

// =========================
// Supabase products API
// =========================
async function fetchAllProducts() {
  await ensureProductSchema();
  const { data, error } = await supabase
    .from("products")
    .select(getProductSelectColumns())
    .order("id", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchProductById(id) {
  await ensureProductSchema();
  const { data, error } = await supabase
    .from("products")
    .select(getProductSelectColumns())
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

async function fetchProductsByIds(ids) {
  if (!ids.length) return [];
  await ensureProductSchema();
  const { data, error } = await supabase
    .from("products")
    .select(getProductSelectColumns())
    .in("id", ids);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function subscribeToProductsChanges(onChange) {
  if (productsRealtimeChannel) return;

  productsRealtimeChannel = supabase
    .channel("products-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "products" },
      (payload) => onChange?.(payload)
    )
    .subscribe();
}

function renderProducts(products) {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = `
      <div class="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md">
        <h3 class="text-xl font-extrabold text-luxury-800">ماكاين حتى منتوج دابا</h3>
        <p class="mt-2 text-slate-600">دخل للأدمن وزيد المنتوجات من قاعدة البيانات.</p>
        <a href="admin.html" class="mt-4 inline-flex rounded-xl border border-gold-400/40 bg-gold-400 px-4 py-2.5 text-sm font-bold text-[#1f1600]">لوحة التحكم</a>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  products.forEach((product) => {
    const priceValue = getProductPriceValue(product);
    const oldPriceValue = getProductOldPriceValue(product);
    const hasDiscount = oldPriceValue > priceValue && priceValue > 0;
    const currentPriceText = formatPrice(priceValue || 0);
    const oldPriceText = hasDiscount ? formatPrice(oldPriceValue) : "";
    const saleLabel = getDiscountLabel(product);
    const sizesLabel = getProductSizesLabel(product);
    const urgencyLabel = getProductAvailabilityLabel(product);
    const ratingMarkup = getProductRatingMarkup(product);
    const isOutOfStock = Number(product?.stock) === 0;

    const card = document.createElement("div");
    card.className = "product-card reveal group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,.1)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,.16)]";
    card.dataset.productId = String(product.id);
    card.innerHTML = `
      <div class="product-image relative aspect-[3/4] overflow-hidden bg-slate-100">
        ${hasDiscount ? `<span class="sale-badge absolute left-3 top-3 z-10 rounded-full bg-gold-300 px-2.5 py-1 text-xs font-bold text-[#251800]">${saleLabel}</span>` : ""}
        ${sizesLabel ? `<span class="sizes-overlay absolute right-3 top-3 z-10 max-w-[calc(100%-24px)] truncate rounded-full border border-slate-300 bg-white/90 px-2.5 py-1 text-[11px] tracking-wide text-slate-700">${sizesLabel}</span>` : ""}
        <img class="h-full w-full object-cover transition duration-500 group-hover:scale-105" src="${product.image_url || ""}" alt="${product.name || ""}" loading="lazy" decoding="async" />
      </div>
      <div class="product-body grid gap-3 bg-gradient-to-b from-white to-slate-50 p-3.5 text-right sm:p-4">
        <div class="product-header grid gap-2">
          <h4 class="text-balance text-lg font-bold leading-7 text-slate-900 sm:text-[1.15rem]" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:3.4rem;">${product.name}</h4>
          <div class="price-wrap inline-flex items-baseline gap-2 whitespace-nowrap">
            <span class="price text-xl font-extrabold text-luxury-700 sm:text-2xl">${currentPriceText}</span>
            ${hasDiscount ? `<span class="old-price text-xs font-bold text-rose-400 line-through sm:text-sm">${oldPriceText}</span>` : ""}
          </div>
          ${ratingMarkup}
        </div>
        <p class="text-sm leading-6 text-slate-600" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:3rem;">${product.description || ""}</p>
        <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 sm:text-xs">${urgencyLabel}</div>
        <div class="product-actions grid gap-2 pt-1">
          <button ${isOutOfStock ? "disabled" : ""} class="cta-btn glow add-cart-btn w-full rounded-xl border border-gold-400/40 bg-gold-400 px-4 py-3 text-sm font-bold text-[#1f1600] transition hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50" data-action="add" data-id="${product.id}" data-default-text="🛒 أضف للسلة">🛒 أضف للسلة</button>
          <button ${isOutOfStock ? "disabled" : ""} class="order-btn w-full rounded-xl border border-luxury-300/35 bg-luxury-100 px-4 py-3 text-sm font-bold text-luxury-700 transition hover:bg-luxury-200 disabled:cursor-not-allowed disabled:opacity-50" data-action="order" data-id="${product.id}">⚡ اشتري الآن</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  observeReveal();
}

function bindProductActions() {
  const grid = document.getElementById("productsGrid");
  if (!grid || grid.dataset.bound === "true") return;
  grid.dataset.bound = "true";
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      const card = event.target.closest(".product-card[data-product-id]");
      if (!card) return;
      const idFromCard = card.dataset.productId;
      if (!idFromCard) return;
      window.location.href = `product.html?id=${idFromCard}`;
      return;
    }
    const id = button.dataset.id;
    const action = button.dataset.action;
    const product = allProducts.find((item) => String(item.id) === String(id));
    if (!product) return;

    if (action === "add") {
      addToCart(id);
      const defaultText = button.dataset.defaultText || "🛒 أضف للسلة";
      button.classList.add("is-added");
      button.textContent = "تزادت!";
      window.setTimeout(() => {
        button.classList.remove("is-added");
        button.textContent = defaultText;
      }, 1200);
      return;
    }

    if (action === "order") {
      openWhatsApp(buildProductMessage(product));
      return;
    }

    if (action === "details") {
      window.location.href = `product.html?id=${id}`;
    }
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function observeReveal() {
  const elements = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.2 }
  );
  elements.forEach((el) => observer.observe(el));
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("input", () => {
    renderFilteredProducts();
  });
}

function renderFilteredProducts() {
  const input = document.getElementById("searchInput");
  const query = input ? input.value.trim().toLowerCase() : "";
  if (!query) {
    renderProducts(allProducts);
    return;
  }
  const filtered = allProducts.filter((product) => {
    const content = `${product.name || ""} ${product.description || ""} ${product.category || ""}`.toLowerCase();
    return content.includes(query);
  });
  renderProducts(filtered);
}

function openWhatsApp(message) {
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  showToast("تحولتي للواتساب 📲");
}

function buildProductMessage(product, options = {}) {
  const sizeLine = options?.size ? `📏 المقاس: ${options.size}\n` : "";
  const colorLine = options?.color ? `🎨 اللون: ${options.color}\n` : "";
  return `السلام عليكم،\nبغيت نطلب هاد المنتوج:\n\n📦 المنتوج: ${product.name}\n💰 الثمن: ${formatPrice(getProductPriceValue(product))}\n${sizeLine}${colorLine}\nشكراً`;
}

function buildCartMessage(cart) {
  // Cart message will be built from Supabase-fetched products in cart page.
  // This placeholder is kept for backwards compatibility.
  return `السلام عليكم،\nبغيت نطلب هاد السلة.\n\nشكراً`;
}

async function initHomepage() {
  updateCartCount();
  bindProductActions();
  setupSearch();
  bindCartDrawer();

  try {
    setLoading(true);
    allProducts = await fetchAllProducts();
    renderFilteredProducts();
  } catch (error) {
    console.error(error);
    showToast("وقع مشكل فتحميل المنتوجات");
  } finally {
    setLoading(false);
  }

  // Realtime refresh
  subscribeToProductsChanges(async () => {
    try {
      allProducts = await fetchAllProducts();
      renderFilteredProducts();
      renderCartDrawer();
    } catch (error) {
      console.error(error);
    }
  });
}

async function initProductPage() {
  updateCartCount();

  const details = document.getElementById("productDetails");
  const notFound = document.getElementById("productNotFound");
  if (!details) return;

  const idParam = new URLSearchParams(window.location.search).get("id");
  const productId = idParam && !Number.isNaN(Number(idParam)) ? Number(idParam) : idParam;
  const imageEl = document.getElementById("productImage");
  const lifestyleImageEl = document.getElementById("productLifestyleImage");
  const nameEl = document.getElementById("productName");
  const descriptionEl = document.getElementById("productDescription");
  const priceEl = document.getElementById("productPrice");
  const urgencyEl = document.getElementById("productUrgency");
  const ratingValueEl = document.getElementById("productRatingValue");
  const reviewsCountEl = document.getElementById("productReviewsCount");
  const stickyPriceEl = document.getElementById("stickyPrice");
  const thumbsEl = document.getElementById("productThumbs");
  const sizeBlock = document.getElementById("sizeBlock");
  const sizeOptions = document.getElementById("sizeOptions");
  const colorOptions = document.getElementById("colorOptions");
  const zoomWrap = document.getElementById("imageZoomWrap");
  const zoomBtn = document.getElementById("zoomImageBtn");
  const sizeGuideModal = document.getElementById("sizeGuideModal");
  const openSizeGuideBtn = document.getElementById("openSizeGuideBtn");
  const stickyBuyNowBtn = document.getElementById("stickyBuyNowBtn");

  const getSelectedVariant = (container, key) => {
    if (!container) return "";
    const selected = container.querySelector(`.variant-pill.is-selected[data-variant-${key}]`);
    return selected?.dataset?.[`variant${key[0].toUpperCase()}${key.slice(1)}`] || "";
  };

  const selectVariantPill = (container, key, value) => {
    if (!container || !value) return;
    container.querySelectorAll(`.variant-pill[data-variant-${key}]`).forEach((button) => {
      const datasetKey = `variant${key[0].toUpperCase()}${key.slice(1)}`;
      button.classList.toggle("is-selected", button.dataset[datasetKey] === value);
    });
  };

  const buildGallery = (imageSrc, productName = "") => {
    if (!imageEl || !thumbsEl) return;
    const fallback = imageSrc || "https://images.unsplash.com/photo-1618244972963-dbad68f98dc5?auto=format&fit=crop&w=1200&q=80";
    const images = [fallback, fallback, fallback, fallback];
    thumbsEl.innerHTML = images
      .map((src, index) => {
        const selectedClass = index === 0 ? "is-selected" : "";
        return `<button type="button" class="thumb-btn ${selectedClass}" data-thumb-src="${src}"><img src="${src}" alt="${productName} - صورة ${index + 1}" loading="lazy" /></button>`;
      })
      .join("");
  };

  const renderSizeOptions = (productData) => {
    if (!sizeOptions || !sizeBlock) return false;
    const sizes = getProductSizesArray(productData);
    if (!sizes.length) {
      sizeBlock.classList.add("hidden");
      sizeOptions.innerHTML = "";
      return false;
    }
    sizeBlock.classList.remove("hidden");
    sizeOptions.innerHTML = sizes
      .map((size, index) => `<button type="button" class="variant-pill ${index === 0 ? "is-selected" : ""}" data-variant-size="${size}">${size}</button>`)
      .join("");
    return true;
  };

  const normalizeUrgencyLabel = (productData) => {
    const base = getProductAvailabilityLabel(productData);
    if (base.includes("نفذ")) return "نفذ المخزون";
    if (base.includes("باقي")) return `🔥 ${base} في المخزون`;
    if (base === "متوفر") return "✅ متوفر حاليا";
    return `🔥 ${base}`;
  };

  const getSelectedProductVariants = (requireSize = false) => {
    const size = getSelectedVariant(sizeOptions, "size");
    const color = getSelectedVariant(colorOptions, "color");
    if (requireSize && !size) {
      showToast("اختار المقاس أولا");
      return null;
    }
    return { size, color };
  };

  const applyProductToView = (productData) => {
    if (!productData) return false;
    const defaultImage = productData.image_url || "https://images.unsplash.com/photo-1618244972963-dbad68f98dc5?auto=format&fit=crop&w=1200&q=80";
    if (imageEl) {
      imageEl.src = defaultImage;
      imageEl.alt = productData.name || "";
    }
    if (lifestyleImageEl) {
      lifestyleImageEl.src = defaultImage;
      lifestyleImageEl.alt = `إطلالة ${productData.name || ""}`;
    }
    if (nameEl) nameEl.textContent = productData.name || "";
    if (descriptionEl) {
      const originalDescription = String(productData.description || "").trim();
      descriptionEl.textContent = originalDescription || "جلابة مغربية بلمسة عصرية، خفيفة ومريحة، مناسبة للمناسبات والخروجات اليومية بأناقة عالية.";
    }
    if (priceEl) priceEl.innerHTML = renderProductPriceMarkup(productData);
    if (urgencyEl) urgencyEl.textContent = normalizeUrgencyLabel(productData);
    if (ratingValueEl) {
      const rating = getProductRatingValue(productData);
      ratingValueEl.textContent = rating !== null ? `التقييم العام: ${rating.toFixed(1)} من 5` : "التقييم العام: --";
    }
    if (reviewsCountEl) {
      const reviews = getProductReviewsCountValue(productData);
      reviewsCountEl.textContent = reviews !== null ? `بناء على ${reviews} تقييم موثق من الزبناء` : "لا توجد تقييمات بعد";
    }
    if (stickyPriceEl) stickyPriceEl.textContent = formatPrice(getProductPriceValue(productData));
    buildGallery(defaultImage, productData.name || "منتوج");
    return renderSizeOptions(productData);
  };

  let product = null;
  let sizeRequired = false;
  try {
    setLoading(true);
    product = await fetchProductById(productId);
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false);
  }

  if (!product) {
    details.classList.add("hidden");
    notFound?.classList.remove("hidden");
  } else {
    sizeRequired = applyProductToView(product);
  }

  thumbsEl?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-thumb-src]");
    if (!button || !imageEl) return;
    const src = button.dataset.thumbSrc;
    if (!src) return;
    imageEl.src = src;
    thumbsEl.querySelectorAll(".thumb-btn").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
  });

  zoomBtn?.addEventListener("click", () => {
    zoomWrap?.classList.toggle("zoomed");
  });

  imageEl?.addEventListener("dblclick", () => {
    zoomWrap?.classList.toggle("zoomed");
  });

  sizeOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-variant-size]");
    if (!button) return;
    selectVariantPill(sizeOptions, "size", button.dataset.variantSize);
  });

  colorOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-variant-color]");
    if (!button) return;
    selectVariantPill(colorOptions, "color", button.dataset.variantColor);
  });

  openSizeGuideBtn?.addEventListener("click", () => {
    if (!sizeGuideModal) return;
    sizeGuideModal.classList.add("show");
    sizeGuideModal.setAttribute("aria-hidden", "false");
  });

  sizeGuideModal?.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-size-close='true']");
    if (!closeTarget) return;
    sizeGuideModal.classList.remove("show");
    sizeGuideModal.setAttribute("aria-hidden", "true");
  });

  document.getElementById("addToCartBtn")?.addEventListener("click", () => {
    if (!product) return;
    const variants = getSelectedProductVariants(sizeRequired);
    if (!variants) return;
    addToCart(product.id);
  });

  document.getElementById("whatsAppBtn")?.addEventListener("click", () => {
    if (!product) return;
    const variants = getSelectedProductVariants(sizeRequired);
    if (!variants) return;
    openWhatsApp(buildProductMessage(product, variants));
  });

  stickyBuyNowBtn?.addEventListener("click", () => {
    if (!product) return;
    const variants = getSelectedProductVariants(sizeRequired);
    if (!variants) return;
    openWhatsApp(buildProductMessage(product, variants));
  });

  observeReveal();

  subscribeToProductsChanges(async (payload) => {
    const changed = payload?.new?.id ?? payload?.old?.id;
    if (String(changed) !== String(productId)) return;
    const updated = await fetchProductById(productId);
    if (!updated) {
      details.classList.add("hidden");
      notFound?.classList.remove("hidden");
      return;
    }
    product = updated;
    sizeRequired = applyProductToView(updated);
  });
}

async function renderCart() {
  const container = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  if (!container) return;

  const cart = getCart();
  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>السلة ديالك خاوية</h3>
        <p>شوف المنتوجات وزيد اللي بغيتي.</p>
        <a href="index.html#products" class="cta-btn glow">شوف المنتوجات</a>
      </div>
    `;
    if (totalEl) totalEl.textContent = formatPrice(0);
    return;
  }

  const productIds = cart.map((i) => i.id);
  let products = [];
  try {
    products = await fetchProductsByIds(productIds);
  } catch (error) {
    console.error(error);
    showToast("وقع مشكل فتحميل منتوجات السلة");
    products = [];
  }

  const byId = new Map(products.map((p) => [String(p.id), p]));
  let total = 0;
  const validCart = [];

  container.innerHTML = cart
    .map((item) => {
      const product = byId.get(String(item.id));
      if (!product) return "";
      validCart.push(item);
      const priceValue = parsePrice(product.price);
      const itemTotal = priceValue * item.qty;
      total += itemTotal;
      return `
        <div class="cart-item">
          <img src="${product.image_url || ""}" alt="${product.name || ""}" />
          <div class="cart-info">
            <h4>${product.name}</h4>
            <span class="price">${formatPrice(priceValue)}</span>
            <div class="qty-controls">
              <button class="qty-btn" data-action="dec" data-id="${product.id}">-</button>
              <span>${item.qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${product.id}">+</button>
            </div>
          </div>
          <button class="remove-btn" data-action="remove" data-id="${product.id}">حذف</button>
        </div>
      `;
    })
    .join("");

  if (validCart.length !== cart.length) saveCart(validCart);
  if (totalEl) totalEl.textContent = formatPrice(total);
}

function initCartPage() {
  updateCartCount();
  renderCart();

  const container = document.getElementById("cartItems");
  if (container && container.dataset.bound !== "true") {
    container.dataset.bound = "true";
    container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      const action = button.dataset.action;
      const cart = getCart();
      const item = cart.find((entry) => String(entry.id) === String(id));
      if (!item) return;

      if (action === "inc") {
        item.qty += 1;
      } else if (action === "dec") {
        item.qty = Math.max(0, item.qty - 1);
      } else if (action === "remove") {
        item.qty = 0;
      }

      const updated = cart.filter((entry) => entry.qty > 0);
      saveCart(updated);
      renderCart();
    });
  }

  document.getElementById("checkoutBtn")?.addEventListener("click", async () => {
    const cart = getCart();
    if (!cart.length) {
      showToast("السلة فارغة");
      return;
    }

    const ids = cart.map((i) => i.id);
    const products = await fetchProductsByIds(ids);
    const byId = new Map(products.map((p) => [String(p.id), p]));

    let total = 0;
    const lines = cart
      .map((item) => {
        const product = byId.get(String(item.id));
        if (!product) return null;
        const priceValue = parsePrice(product.price);
        const itemTotal = priceValue * item.qty;
        total += itemTotal;
        return `• ${product.name} x${item.qty} — ${formatPrice(itemTotal)}`;
      })
      .filter(Boolean)
      .join("\n");

    const message = `السلام عليكم،\nبغيت نطلب هاد السلة:\n\n${lines}\n\n💰 المجموع: ${formatPrice(total)}\n\nشكراً`;
    openWhatsApp(message);
  });

  document.getElementById("clearCartBtn")?.addEventListener("click", () => {
    saveCart([]);
    renderCart();
    showToast("تفرغات السلة ✅");
  });

  subscribeToProductsChanges(() => renderCart());
}

async function renderCartDrawer() {
  const drawerItems = document.getElementById("cartDrawerItems");
  const drawerTotal = document.getElementById("cartDrawerTotal");
  if (!drawerItems || !drawerTotal) return;

  const cart = getCart();
  if (!cart.length) {
    drawerItems.innerHTML = `<div class="drawer-empty rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">السلة خاوية دابا</div>`;
    drawerTotal.textContent = formatPrice(0);
    return;
  }

  const ids = cart.map((item) => item.id);
  let products = [];
  try {
    products = await fetchProductsByIds(ids);
  } catch (error) {
    console.error(error);
  }

  const byId = new Map(products.map((product) => [String(product.id), product]));
  let total = 0;

  drawerItems.innerHTML = cart
    .map((item) => {
      const product = byId.get(String(item.id));
      if (!product) return "";
      const priceValue = getProductPriceValue(product);
      total += priceValue * item.qty;
      return `
        <article class="drawer-item grid grid-cols-[64px_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <img class="h-16 w-16 rounded-lg object-cover" src="${product.image_url || ""}" alt="${product.name || ""}" loading="lazy" />
          <div class="drawer-item-info space-y-1">
            <h4 class="text-sm font-bold text-slate-800">${product.name || ""}</h4>
            <span class="price text-sm font-bold text-luxury-700">${formatPrice(priceValue)}</span>
            <span class="drawer-item-qty text-xs text-slate-500">الكمية: ${item.qty}</span>
          </div>
          <button class="remove-btn rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700" data-action="drawer-remove" data-id="${item.id}">حذف</button>
        </article>
      `;
    })
    .join("");

  drawerTotal.textContent = formatPrice(total);
}

function openCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("cartDrawerBackdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.add("open");
  backdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  renderCartDrawer();
}

function closeCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const backdrop = document.getElementById("cartDrawerBackdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function bindCartDrawer() {
  const trigger = document.getElementById("cartTrigger");
  const closeBtn = document.getElementById("closeCartDrawer");
  const backdrop = document.getElementById("cartDrawerBackdrop");
  const drawerItems = document.getElementById("cartDrawerItems");
  const checkoutBtn = document.getElementById("drawerCheckoutBtn");
  if (!trigger) return;

  trigger.addEventListener("click", openCartDrawer);
  closeBtn?.addEventListener("click", closeCartDrawer);
  backdrop?.addEventListener("click", closeCartDrawer);

  drawerItems?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='drawer-remove']");
    if (!button) return;
    const id = button.dataset.id;
    const updated = getCart().filter((item) => String(item.id) !== String(id));
    saveCart(updated);
    renderCartDrawer();
  });

  checkoutBtn?.addEventListener("click", async () => {
    const cart = getCart();
    if (!cart.length) {
      showToast("السلة فارغة");
      return;
    }

    const ids = cart.map((item) => item.id);
    const products = await fetchProductsByIds(ids);
    const byId = new Map(products.map((product) => [String(product.id), product]));

    let total = 0;
    const lines = cart
      .map((item) => {
        const product = byId.get(String(item.id));
        if (!product) return null;
        const itemTotal = getProductPriceValue(product) * item.qty;
        total += itemTotal;
        return `• ${product.name} x${item.qty} — ${formatPrice(itemTotal)}`;
      })
      .filter(Boolean)
      .join("\n");

    const message = `السلام عليكم،\nبغيت نكمل هاد الطلب:\n\n${lines}\n\nالمجموع: ${formatPrice(total)}`;
    openWhatsApp(message);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCartDrawer();
  });
}

async function updateAdminView() {
  const gate = document.getElementById("adminGate");
  const panel = document.getElementById("panelSection");
  if (!gate || !panel) return;
  const authed = await isAuthedAdmin();
  if (authed) {
    gate.classList.add("hidden");
    panel.classList.add("active");
    await renderAdminTable();
  } else {
    gate.classList.remove("hidden");
    panel.classList.remove("active");
  }
}

async function initAdmin() {
  await ensureProductSchema();
  updateCartCount();
  updateAdminView();

  document.getElementById("openAdminModal")?.addEventListener("click", openAdminModal);
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    await updateAdminView();
    showToast("خرجتي بنجاح ✅");
    window.location.href = "index.html";
  });

  setupProductForm();

  supabase.auth.onAuthStateChange(() => updateAdminView());
  subscribeToProductsChanges(() => renderAdminTable());
}

function setupProductForm() {
  const form = document.getElementById("productForm");
  const nameInput = document.getElementById("productName");
  const priceInput = document.getElementById("productPrice");
  const sizesInput = document.getElementById("productSizes");
  const ratingInput = document.getElementById("productRating");
  const reviewsCountInput = document.getElementById("productReviewsCount");
  const availabilityInput = document.getElementById("productAvailability");
  const categoryInput = document.getElementById("productCategory");
  const stockInput = document.getElementById("productStock");
  const imageFileInput = document.getElementById("productImageFile");
  const imagePreview = document.getElementById("imagePreview");
  const imagePreviewImg = document.getElementById("imagePreviewImg");
  const descInput = document.getElementById("productDescription");
  const cancelBtn = document.getElementById("cancelEdit");
  const saveBtn = document.getElementById("saveBtn");

  if (!form) return;

  const supportsAnySizesColumn = ["sizes", "size", "taille", "tailles"].some((columnName) => hasOptionalColumn(columnName));
  if (sizesInput && !supportsAnySizesColumn) {
    sizesInput.disabled = true;
    sizesInput.placeholder = "زيد واحد من هاد الأعمدة: sizes/size/taille/tailles";
  }

  if (ratingInput && !hasOptionalColumn("rating_value")) {
    ratingInput.disabled = true;
    ratingInput.placeholder = "زيد العمود rating_value ف Supabase";
  }

  if (reviewsCountInput && !hasOptionalColumn("reviews_count")) {
    reviewsCountInput.disabled = true;
    reviewsCountInput.placeholder = "زيد العمود reviews_count ف Supabase";
  }

  if (availabilityInput && !hasOptionalColumn("availability_text")) {
    availabilityInput.disabled = true;
    availabilityInput.placeholder = "زيد العمود availability_text ف Supabase";
  }

  const updatePreview = (src) => {
    if (!imagePreview || !imagePreviewImg) return;
    if (src) {
      imagePreviewImg.src = src;
      imagePreview.classList.add("has-image");
    } else {
      imagePreviewImg.src = "";
      imagePreview.classList.remove("has-image");
    }
  };

  imageFileInput?.addEventListener("change", () => {
    const file = imageFileInput.files?.[0];
    if (!file) {
      currentImageFile = null;
      currentImagePreview = "";
      if (!editingId) updatePreview("");
      return;
    }
    currentImageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      currentImagePreview = String(reader.result || "");
      updatePreview(currentImagePreview);
    };
    reader.readAsDataURL(file);
  });

  const resetForm = () => {
    editingId = null;
    form.reset();
    currentImageFile = null;
    currentImagePreview = "";
    editingExistingImageUrl = "";
    if (imageFileInput) imageFileInput.value = "";
    updatePreview("");
    cancelBtn.hidden = true;
    saveBtn.textContent = "زيد المنتوج";
  };

  cancelBtn?.addEventListener("click", resetForm);

  const uploadImageToSupabase = async (file) => {
    const safeName = String(file.name || "image")
      .replaceAll("/", "-")
      .replaceAll("\\\\", "-")
      .replaceAll("..", ".");
    const path = `products/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;

    const { data, error } = await supabase.storage.from("jellabas").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from("jellabas").getPublicUrl(data.path);
    return urlData?.publicUrl || "";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const authed = await isAuthedAdmin();
    if (!authed) {
      showToast("خاصك تدخل للحساب");
      openAdminModal();
      return;
    }

    const name = nameInput.value.trim();
    const price = priceInput.value.trim();
    const description = descInput.value.trim();
    const sizes = sizesInput ? sizesInput.value.trim() : "";
    const ratingValue = ratingInput ? ratingInput.value.trim() : "";
    const reviewsCountValue = reviewsCountInput ? reviewsCountInput.value.trim() : "";
    const availabilityTextValue = availabilityInput ? availabilityInput.value.trim() : "";
    const category = categoryInput ? categoryInput.value.trim() : "";
    const stock = stockInput && stockInput.value !== "" ? Number(stockInput.value) : null;

    if (!name || !price) {
      showToast("عمر الاسم والثمن");
      return;
    }

    if (!editingId && !currentImageFile) {
      showToast("خصك تختار صورة للمنتوج");
      return;
    }

    try {
      setLoading(true);
      let imageUrl = editingExistingImageUrl;
      if (currentImageFile) {
        imageUrl = await uploadImageToSupabase(currentImageFile);
      }

      const payload = {
        name,
        price,
        description,
        image_url: imageUrl,
        category,
        stock,
      };

      Object.assign(
        payload,
        buildOptionalProductPayload({
          product: editingId ? allProducts.find((item) => String(item.id) === String(editingId)) : null,
          sizes,
          ratingValue,
          reviewsCountValue,
          availabilityTextValue,
        })
      );

      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
        showToast("تبدّل المنتوج ✅");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        showToast("تزاد المنتوج ✅");
      }

      resetForm();
      await renderAdminTable();
    } catch (error) {
      console.error(error);
      showToast("وقع مشكل فحفظ المنتوج");
    } finally {
      setLoading(false);
    }
  });
}

async function renderAdminTable() {
  const table = document.getElementById("adminTable");
  if (!table) return;

  const authed = await isAuthedAdmin();
  if (!authed) return;

  let products = [];
  try {
    products = await fetchAllProducts();
  } catch (error) {
    console.error(error);
    table.innerHTML = `
      <div class="empty-state">
        <h3>ماقدرناش نجيبو المنتوجات</h3>
        <p>راجع الإعدادات ديال Supabase ولا الانترنت.</p>
      </div>
    `;
    return;
  }

  table.innerHTML = "";
  products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <h4>${product.name}</h4>
        <p>${product.description}</p>
        <span class="price">${product.price}</span>
        ${getProductSizesLabel(product) ? `<div class="note-text">المقاسات: ${getProductSizesLabel(product)}</div>` : ""}
        ${getProductRatingValue(product) !== null ? `<div class="note-text">التقييم: ${getProductRatingValue(product).toFixed(1)} / 5</div>` : ""}
        ${getProductReviewsCountValue(product) !== null ? `<div class="note-text">عدد التقييمات: ${getProductReviewsCountValue(product)}</div>` : ""}
        ${String(product.availability_text || "").trim() ? `<div class="note-text">التوفر: ${product.availability_text}</div>` : ""}
        ${product.category ? `<div class="note-text">الصنف: ${product.category}</div>` : ""}
        ${product.stock !== null && product.stock !== undefined ? `<div class="note-text">المخزون: ${product.stock}</div>` : ""}
      </div>
      <div class="admin-actions">
        <button class="edit">تعديل</button>
        <button class="delete">حذف</button>
      </div>
    `;

    const editBtn = row.querySelector(".edit");
    const deleteBtn = row.querySelector(".delete");

    editBtn.addEventListener("click", async () => {
      const authed = await isAuthedAdmin();
      if (!authed) {
        showToast("خاصك تسجل الدخول");
        openAdminModal();
        return;
      }
      editingId = product.id;
      document.getElementById("productName").value = product.name;
      document.getElementById("productPrice").value = product.price;
      document.getElementById("productDescription").value = product.description;
      document.getElementById("productSizes") && (document.getElementById("productSizes").value = Array.isArray(getProductRawSizesValue(product)) ? getProductRawSizesValue(product).join(", ") : getProductRawSizesValue(product) || "");
      document.getElementById("productRating") && (document.getElementById("productRating").value = product.rating_value ?? "");
      document.getElementById("productReviewsCount") && (document.getElementById("productReviewsCount").value = product.reviews_count ?? "");
      document.getElementById("productAvailability") && (document.getElementById("productAvailability").value = product.availability_text || "");
      document.getElementById("productCategory") && (document.getElementById("productCategory").value = product.category || "");
      document.getElementById("productStock") && (document.getElementById("productStock").value = product.stock ?? "");
      currentImageFile = null;
      currentImagePreview = "";
      editingExistingImageUrl = product.image_url || "";
      const previewBox = document.getElementById("imagePreview");
      const previewImg = document.getElementById("imagePreviewImg");
      if (previewBox && previewImg) {
        previewImg.src = product.image_url || "";
        previewBox.classList.add("has-image");
      }
      const fileInput = document.getElementById("productImageFile");
      if (fileInput) fileInput.value = "";
      document.getElementById("saveBtn").textContent = "حدّث المنتوج";
      document.getElementById("cancelEdit").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    deleteBtn.addEventListener("click", async () => {
      const authed = await isAuthedAdmin();
      if (!authed) {
        showToast("خاصك تدخل للحساب");
        openAdminModal();
        return;
      }
      const confirmed = confirm("واش متأكد باغي تحذف هاد المنتوج؟");
      if (!confirmed) return;
      try {
        setLoading(true);
        const { error } = await supabase.from("products").delete().eq("id", product.id);
        if (error) throw error;
        await renderAdminTable();
        showToast("تحيّد المنتوج ✅");
      } catch (error) {
        console.error(error);
        showToast("وقع مشكل فالحذف");
      } finally {
        setLoading(false);
      }
    });

    table.appendChild(row);
  });
}

bindAdminModal();
updateCartCount();

const page = document.body?.dataset?.page;
if (page === "admin") {
  initAdmin();
} else if (page === "product") {
  initProductPage();
} else if (page === "cart") {
  initCartPage();
} else {
  initHomepage();
}

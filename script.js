import { isSupabaseEnabled, supabase } from "./supabase-client.js";

const WHATSAPP_NUMBER = "212642047321";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=100086131103739&sk=reels_tab";
const CART_KEY = "dar_jellaba_cart_v3";
const PRODUCTS_KEY = "dar_jellaba_products_v3";
const SUPABASE_PRODUCTS_TABLE =
  import.meta.env?.VITE_SUPABASE_PRODUCTS_TABLE ||
  window.SUPABASE_PRODUCTS_TABLE ||
  "products";

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "جلابة ملكية مطرزة",
    price: 699,
    oldPrice: 899,
    image: "assets/brand/image.png",
    badge: "best",
    stock: 5,
    rating: 4.9,
    reviews: 142,
    description: "جلابة فخمة بتطريز راقي وخامة مريحة للمناسبات واللبسة اليومية.",
  },
  {
    id: 2,
    name: "جلابة صيفية خفيفة",
    price: 459,
    oldPrice: 559,
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1000&q=80",
    badge: "new",
    stock: 8,
    rating: 4.7,
    reviews: 89,
    description: "قماش خفيف ومريح، مناسب للصيف والخروجات اليومية بستايل أنيق.",
  },
  {
    id: 3,
    name: "جلابة كلاسيك فاخرة",
    price: 599,
    oldPrice: 739,
    image: "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?auto=format&fit=crop&w=1000&q=80",
    badge: "best",
    stock: 4,
    rating: 4.8,
    reviews: 110,
    description: "تصميم كلاسيكي بلمسة عصرية، تشطيب نظيف وأناقة ديال الصح.",
  },
  {
    id: 4,
    name: "جلابة عصرية للمناسبات",
    price: 849,
    oldPrice: 999,
    image: "https://images.unsplash.com/photo-1592878904946-b3cd21a1a5f5?auto=format&fit=crop&w=1000&q=80",
    badge: "new",
    stock: 3,
    rating: 5,
    reviews: 61,
    description: "موديل راقي للمناسبات الكبيرة وتفاصيل خياطة فاخرة.",
  },
];

const state = {
  products: [],
  page: "",
  currentSearch: "",
};

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function formatPrice(value) {
  return `${Number(value) || 0} DH`;
}

function pickField(row, candidates, fallback = "") {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeSupabaseProduct(row, index) {
  const id = pickField(row, ["id", "product_id", "uuid"], `db-${index + 1}`);
  const name = String(pickField(row, ["name", "title", "product_name"], "")).trim();
  const price = toNumber(pickField(row, ["price", "current_price", "sale_price"]), 0);
  const oldPrice = toNumber(pickField(row, ["old_price", "original_price", "compare_at_price", "price"]), price);
  const image = String(
    pickField(row, ["image", "image_url", "photo", "photo_url", "picture", "thumbnail"], DEFAULT_PRODUCTS[0].image)
  ).trim();

  if (!name || price <= 0) return null;

  return {
    id: String(id),
    name,
    price,
    oldPrice: oldPrice >= price ? oldPrice : price,
    image: image || DEFAULT_PRODUCTS[0].image,
    badge: String(pickField(row, ["badge", "tag", "label"], "new")).toLowerCase() === "best" ? "best" : "new",
    stock: Math.max(0, toNumber(pickField(row, ["stock", "quantity", "inventory", "inventory_count"], 5), 5)),
    rating: Math.min(5, Math.max(0, toNumber(pickField(row, ["rating", "rate"], 4.8), 4.8))),
    reviews: Math.max(0, toNumber(pickField(row, ["reviews", "reviews_count", "rating_count"], 20), 20)),
    description: String(
      pickField(row, ["description", "details", "short_description"], "جلابة مغربية أنيقة بخامة ممتازة.")
    ),
  };
}

async function fetchSupabaseProducts() {
  if (!isSupabaseEnabled || !supabase) {
    return { data: [], error: "supabase_not_configured" };
  }

  const { data, error } = await supabase.from(SUPABASE_PRODUCTS_TABLE).select("*").limit(200);
  if (error) {
    return { data: [], error: error.message || "supabase_query_failed" };
  }

  const mapped = (Array.isArray(data) ? data : [])
    .map((row, index) => normalizeSupabaseProduct(row, index))
    .filter(Boolean);

  return { data: mapped, error: "" };
}

async function loadProductsSource() {
  const local = getProducts();
  const remote = await fetchSupabaseProducts();

  if (remote.data.length) {
    saveProducts(remote.data);
    return remote.data;
  }

  if (remote.error && remote.error !== "supabase_not_configured") {
    console.warn("Supabase products fetch failed:", remote.error);
  }

  state.products = local;
  return local;
}

function getProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return DEFAULT_PRODUCTS.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_PRODUCTS.slice();
  } catch (error) {
    return DEFAULT_PRODUCTS.slice();
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  state.products = products;
}

function getProductById(id) {
  return state.products.find((item) => String(item.id) === String(id));
}

function getCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
  renderCartDrawer();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.qty, 0);
  $all("[data-cart-count]").forEach((el) => {
    el.textContent = count;
  });
}

function addToCart(productId, qty = 1, options = {}) {
  const cart = getCart();
  const key = `${productId}::${options.size || ""}::${options.color || ""}`;
  const found = cart.find((item) => item.key === key);

  if (found) {
    found.qty += qty;
  } else {
    cart.push({
      key,
      id: String(productId),
      qty,
      size: options.size || "",
      color: options.color || "",
    });
  }

  saveCart(cart);
  showToast("تزاد للسلة بنجاح");
}

function removeCartItem(key) {
  const next = getCart().filter((item) => item.key !== key);
  saveCart(next);
}

function updateCartItemQty(key, nextQty) {
  const cart = getCart();
  const target = cart.find((item) => item.key === key);
  if (!target) return;
  target.qty = Math.max(0, nextQty);
  saveCart(cart.filter((item) => item.qty > 0));
}

function buildStars(rating) {
  const full = Math.round(Number(rating) || 0);
  return "★".repeat(Math.min(5, Math.max(0, full))).padEnd(5, "☆");
}

function openWhatsApp(message) {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener");
}

function buildProductMessage(product, options = {}) {
  return [
    "السلام عليكم،",
    "بغيت نطلب هاد المنتوج:",
    `الاسم: ${product.name}`,
    `الثمن: ${formatPrice(product.price)}`,
    options.size ? `المقاس: ${options.size}` : null,
    options.color ? `اللون: ${options.color}` : null,
    "شكرا",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCartMessage(cartWithProducts) {
  let total = 0;
  const lines = cartWithProducts
    .map((item) => {
      const itemTotal = item.product.price * item.qty;
      total += itemTotal;
      const opts = [item.size ? `المقاس: ${item.size}` : "", item.color ? `اللون: ${item.color}` : ""]
        .filter(Boolean)
        .join(" | ");
      return `- ${item.product.name} x${item.qty} (${formatPrice(itemTotal)})${opts ? ` | ${opts}` : ""}`;
    })
    .join("\n");

  return `السلام عليكم،\nبغيت نأكد هاد الطلب:\n\n${lines}\n\nالمجموع: ${formatPrice(total)}\n\nشكرا`;
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function productCardTemplate(product) {
  const urgency = product.stock <= 5 ? `Only ${product.stock} left in stock` : "Limited offer";
  return `
    <article class="product-card reveal" data-product-id="${product.id}">
      <a class="product-media" href="product.html?id=${product.id}">
        <div class="badges">
          <span class="badge ${product.badge === "new" ? "badge-new" : "badge-best"}">${product.badge === "new" ? "New" : "Best Seller"}</span>
        </div>
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
      </a>
      <div class="product-body">
        <h3 class="product-title">${product.name}</h3>
        <div class="rating">${buildStars(product.rating)} <small>(${product.reviews})</small></div>
        <div class="price-row">
          <span class="price-current">${formatPrice(product.price)}</span>
          <span class="price-old">${formatPrice(product.oldPrice)}</span>
        </div>
        <span class="urgency-badge">${urgency}</span>
        <div class="card-actions">
          <button class="btn btn-dark" data-action="add" data-id="${product.id}">زيد للسلة</button>
          <button class="btn btn-gold" data-action="buy" data-id="${product.id}">شري دابا</button>
        </div>
      </div>
    </article>
  `;
}

function renderCartDrawer() {
  const itemsEl = $("#cartDrawerItems");
  const totalEl = $("#cartDrawerTotal");
  if (!itemsEl || !totalEl) return;

  const cart = getCart();
  if (!cart.length) {
    itemsEl.innerHTML = `<div class="empty-state">السلة خاوية دابا</div>`;
    totalEl.textContent = formatPrice(0);
    return;
  }

  const cartWithProducts = cart
    .map((entry) => ({ ...entry, product: getProductById(entry.id) }))
    .filter((entry) => entry.product);

  let total = 0;
  itemsEl.innerHTML = cartWithProducts
    .map((entry) => {
      total += entry.product.price * entry.qty;
      return `
        <article class="drawer-item">
          <img src="${entry.product.image}" alt="${entry.product.name}" />
          <div>
            <h4>${entry.product.name}</h4>
            <small>${formatPrice(entry.product.price)} x ${entry.qty}</small>
          </div>
          <button class="icon-btn" data-action="drawer-remove" data-key="${entry.key}">حذف</button>
        </article>
      `;
    })
    .join("");

  totalEl.textContent = formatPrice(total);
}

function bindDrawer() {
  const openBtn = $("#openCartBtn");
  const closeBtn = $("#closeCartBtn");
  const backdrop = $("#cartBackdrop");
  const drawer = $("#cartDrawer");
  const drawerItems = $("#cartDrawerItems");
  const checkoutBtn = $("#drawerCheckoutBtn");

  const open = () => {
    if (!drawer || !backdrop) return;
    drawer.classList.add("open");
    backdrop.classList.add("open");
    renderCartDrawer();
  };

  const close = () => {
    if (!drawer || !backdrop) return;
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  };

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);

  drawerItems?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='drawer-remove']");
    if (!button) return;
    removeCartItem(button.dataset.key);
  });

  checkoutBtn?.addEventListener("click", () => {
    const cartWithProducts = getCart()
      .map((item) => ({ ...item, product: getProductById(item.id) }))
      .filter((item) => item.product);
    if (!cartWithProducts.length) {
      showToast("السلة خاوية");
      return;
    }
    openWhatsApp(buildCartMessage(cartWithProducts));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function setupReveal() {
  const targets = $all(".reveal");
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  targets.forEach((el) => observer.observe(el));
}

function initHome() {
  const grid = $("#productsGrid");
  const searchInput = $("#searchInput");
  if (!grid) return;

  const render = (query = state.currentSearch || "") => {
    state.currentSearch = query;
    const q = query.trim().toLowerCase();
    const list = !q ? state.products : state.products.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q));

    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">ما لقيناش منتوج بهاد البحث.</div>`;
      return;
    }

    grid.innerHTML = list.map(productCardTemplate).join("");
    setupReveal();
  };

  render();

  searchInput?.addEventListener("input", () => render(searchInput.value));

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const product = getProductById(button.dataset.id);
    if (!product) return;

    if (button.dataset.action === "add") {
      addToCart(product.id);
      return;
    }

    if (button.dataset.action === "buy") {
      openWhatsApp(buildProductMessage(product));
    }
  });
}

function initProduct() {
  const id = new URLSearchParams(window.location.search).get("id");
  const product = getProductById(id);
  const titleEl = $("#productTitle");
  if (!titleEl) return;

  if (!product) {
    titleEl.textContent = "المنتوج ما متوفرش";
    return;
  }

  $("#productImage").src = product.image;
  $("#productImage").alt = product.name;
  $("#productTitle").textContent = product.name;
  $("#productPriceCurrent").textContent = formatPrice(product.price);
  $("#productPriceOld").textContent = formatPrice(product.oldPrice);
  $("#productRating").innerHTML = `${buildStars(product.rating)} <small>(${product.reviews} تقييم)</small>`;
  $("#productStock").textContent = product.stock <= 5 ? `Only ${product.stock} left in stock` : "Limited offer";
  $("#productDescription").textContent = product.description;

  const sizeWrap = $("#sizeOptions");
  const colorWrap = $("#colorOptions");
  const sizes = ["S", "M", "L", "XL"];
  const colors = ["أسود", "سكري", "كحلي", "زيتي"];
  let selectedSize = sizes[1];
  let selectedColor = colors[0];

  sizeWrap.innerHTML = sizes.map((size, i) => `<button class="option-pill ${i === 1 ? "active" : ""}" data-size="${size}">${size}</button>`).join("");
  colorWrap.innerHTML = colors.map((color, i) => `<button class="option-pill ${i === 0 ? "active" : ""}" data-color="${color}">${color}</button>`).join("");

  sizeWrap.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-size]");
    if (!button) return;
    selectedSize = button.dataset.size;
    $all("#sizeOptions .option-pill").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
  });

  colorWrap.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-color]");
    if (!button) return;
    selectedColor = button.dataset.color;
    $all("#colorOptions .option-pill").forEach((el) => el.classList.remove("active"));
    button.classList.add("active");
  });

  $("#addToCartBtn")?.addEventListener("click", () => {
    addToCart(product.id, 1, { size: selectedSize, color: selectedColor });
  });

  $("#buyNowBtn")?.addEventListener("click", () => {
    openWhatsApp(buildProductMessage(product, { size: selectedSize, color: selectedColor }));
  });
}

function initCart() {
  const listEl = $("#cartList");
  const subtotalEl = $("#cartSubtotal");
  if (!listEl || !subtotalEl) return;

  const render = () => {
    const cartWithProducts = getCart()
      .map((entry) => ({ ...entry, product: getProductById(entry.id) }))
      .filter((entry) => entry.product);

    if (!cartWithProducts.length) {
      listEl.innerHTML = `<div class="empty-state">السلة خاوية. رجع للمنتوجات وكمل الشرا.</div>`;
      subtotalEl.textContent = formatPrice(0);
      return;
    }

    let subtotal = 0;
    listEl.innerHTML = cartWithProducts
      .map((entry) => {
        const rowTotal = entry.product.price * entry.qty;
        subtotal += rowTotal;
        return `
          <article class="cart-item">
            <img src="${entry.product.image}" alt="${entry.product.name}" />
            <div>
              <h3>${entry.product.name}</h3>
              <p>${formatPrice(entry.product.price)} للواحد</p>
              <p>${entry.size ? `المقاس: ${entry.size}` : ""} ${entry.color ? `| اللون: ${entry.color}` : ""}</p>
              <div class="qty-controls">
                <button class="qty-btn" data-action="dec" data-key="${entry.key}">-</button>
                <strong>${entry.qty}</strong>
                <button class="qty-btn" data-action="inc" data-key="${entry.key}">+</button>
              </div>
            </div>
            <div>
              <strong>${formatPrice(rowTotal)}</strong>
              <button class="remove-btn" data-action="remove" data-key="${entry.key}">حذف</button>
            </div>
          </article>
        `;
      })
      .join("");

    subtotalEl.textContent = formatPrice(subtotal);
  };

  render();

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const key = button.dataset.key;
    const action = button.dataset.action;
    const target = getCart().find((item) => item.key === key);
    if (!target) return;

    if (action === "inc") updateCartItemQty(key, target.qty + 1);
    if (action === "dec") updateCartItemQty(key, target.qty - 1);
    if (action === "remove") removeCartItem(key);

    render();
  });

  $("#clearCartBtn")?.addEventListener("click", () => {
    saveCart([]);
    render();
  });

  $("#cartCheckoutBtn")?.addEventListener("click", () => {
    const cartWithProducts = getCart()
      .map((item) => ({ ...item, product: getProductById(item.id) }))
      .filter((item) => item.product);

    if (!cartWithProducts.length) {
      showToast("السلة خاوية");
      return;
    }

    openWhatsApp(buildCartMessage(cartWithProducts));
  });
}

function initAdmin() {
  const form = $("#adminProductForm");
  const listEl = $("#adminProductsList");
  if (!form || !listEl) return;

  const render = () => {
    listEl.innerHTML = state.products
      .map(
        (p) => `
        <article class="admin-item">
          <div>
            <strong>${p.name}</strong>
            <p>${formatPrice(p.price)} | stock: ${p.stock}</p>
          </div>
          <button class="icon-btn" data-action="delete" data-id="${p.id}">حذف</button>
        </article>
      `
      )
      .join("");
  };

  render();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);

    const item = {
      id: Date.now(),
      name: String(data.get("name") || "").trim(),
      price: Number(data.get("price") || 0),
      oldPrice: Number(data.get("oldPrice") || 0) || Number(data.get("price") || 0),
      stock: Number(data.get("stock") || 0),
      rating: Number(data.get("rating") || 4.7),
      reviews: Number(data.get("reviews") || 10),
      badge: String(data.get("badge") || "new"),
      image: String(data.get("image") || "").trim() || DEFAULT_PRODUCTS[0].image,
      description: String(data.get("description") || "").trim() || "جلابة مغربية أنيقة بخامة ممتازة.",
    };

    if (!item.name || item.price <= 0) {
      showToast("دخل اسم وثمن صحيح");
      return;
    }

    const next = [item, ...state.products];
    saveProducts(next);
    render();
    form.reset();
    showToast("تزاد المنتوج");
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete']");
    if (!button) return;
    const id = button.dataset.id;
    const next = state.products.filter((p) => String(p.id) !== String(id));
    saveProducts(next);
    render();
    showToast("تحيد المنتوج");
  });

  $("#resetCatalogBtn")?.addEventListener("click", () => {
    localStorage.removeItem(PRODUCTS_KEY);
    state.products = DEFAULT_PRODUCTS.slice();
    saveProducts(state.products);
    render();
    showToast("رجع الكاتالوج الافتراضي");
  });
}

function initGlobal() {
  updateCartCount();
  bindDrawer();
  renderCartDrawer();
  setupReveal();
}

document.addEventListener("DOMContentLoaded", async () => {
  state.page = document.body.dataset.page || "";
  await loadProductsSource();

  initGlobal();

  if (state.page === "home") initHome();
  if (state.page === "product") initProduct();
  if (state.page === "cart") initCart();
  if (state.page === "admin") initAdmin();

  $("#facebookLink")?.setAttribute("href", FACEBOOK_URL);
});

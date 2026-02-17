const normalizeApiBase = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
};

const resolveApiBaseUrl = () => {
  const runtimeValue =
    typeof window !== "undefined" && typeof window.__API_BASE_URL__ === "string"
      ? normalizeApiBase(window.__API_BASE_URL__)
      : "";
  if (runtimeValue) return runtimeValue;

  // Only allow runtime API overrides in local development to prevent accidental
  // production traffic redirection through localStorage tampering.
  const host = typeof window !== "undefined" ? window.location.hostname || "" : "";
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const localValue = normalizeApiBase(localStorage.getItem("api_base_url"));
  if (isLocalHost && localValue) return localValue;

  if (typeof window !== "undefined" && window.location?.origin) {
    const isGithubPages = host.endsWith("github.io");
    const origin = normalizeApiBase(window.location.origin);

    // Never default to same-origin for GitHub Pages, because backend is not hosted there.
    if (origin && origin !== "null" && isLocalHost && !isGithubPages) {
      return origin;
    }
  }

  throw new Error(
    "API base URL is not configured. Set window.__API_BASE_URL__ in runtime-config.js to your Render backend URL."
  );
};

const API_BASE_URL = resolveApiBaseUrl();
const AUTH_TOKEN_KEY = "auth_token";
const USERNAME_KEY = "username";
const USER_ROLE_KEY = "user_role";
const ANON_ID_KEY = "anon_id";
const CSRF_TOKEN_KEY = "csrf_token";
const CSRF_COOKIE_NAME_KEY = "csrf_cookie_name";
const DEFAULT_CSRF_COOKIE_NAME = "csrf_token";
const THREAD_CACHE_KEY = "thread_ids";

const appState = {
  threads: [],
  activeFilter: "hot",
  currentThreadId: null,
  currentUser: null,
  threadIdIndex: new Map(),
  threadSortCache: new Map(),
  threadsVersion: 0,
};

// ==========================
// THEME HANDLING
// ==========================

const THEME_TOGGLE_TEMPLATE = `
  <span class="theme-track" aria-hidden="true">
    <span class="theme-thumb">
      <span class="icon-sun"><img src="assets/sun.png" alt="sun" /></span>
      <span class="icon-moon"><img src="assets/moon.png" alt="moon" /></span>
    </span>
  </span>
`;

const initThemeToggles = () => {
  document.querySelectorAll(".theme-toggle").forEach((toggle) => {
    toggle.innerHTML = THEME_TOGGLE_TEMPLATE;
  });
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? null : "light";

  if (next) {
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  }

  syncThemeToggles();
};

const loadTheme = () => {
  const saved = localStorage.getItem("theme");
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
  syncThemeToggles();
};

const syncThemeToggles = () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const nextThemeLabel = isLight ? "Switch to dark mode" : "Switch to light mode";

  document.querySelectorAll(".theme-toggle").forEach((toggle) => {
    toggle.setAttribute("aria-label", nextThemeLabel);
    toggle.setAttribute("title", nextThemeLabel);
    toggle.setAttribute("aria-pressed", isLight ? "true" : "false");
  });
};

// ==========================
// HELPERS
// ==========================

const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY);
const getAnonId = () => localStorage.getItem(ANON_ID_KEY);
const getStoredUsername = () => localStorage.getItem(USERNAME_KEY);
const hasAuthHint = () => Boolean(appState.currentUser?.id || getStoredUsername() || getAuthToken());

const isUnsafeMethod = (method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method);

const readCookie = (name) => {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return null;
  return decodeURIComponent(cookie.slice(prefix.length));
};

const updateAnonIdFromHeaders = (headers) => {
  const anon = headers.get("X-Anon-Id");
  if (anon) {
    localStorage.setItem(ANON_ID_KEY, anon);
    syncUserBadge();
  }
};

const formatAnonymousTag = (anonId) => {
  if (!anonId) return "Anonymous";
  return `Anonymous #${String(anonId).replace(/^anon_/, "").slice(0, 4).toUpperCase()}`;
};

const getCurrentUsername = () => appState.currentUser?.username || getStoredUsername();

const clearAuthSession = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
  sessionStorage.removeItem(CSRF_COOKIE_NAME_KEY);
  appState.currentUser = null;
};

const openDashboard = () => {
  window.location.href = hasAuthHint() ? "dashboard-user.html" : "dashboard.html";
};

const showAuthChoiceModal = () => {
  const modal = document.getElementById("authChoiceModal");
  if (!modal) return;
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};

const closeAuthChoiceModal = () => {
  const modal = document.getElementById("authChoiceModal");
  if (!modal) return;
  modal.classList.remove("active");
  document.body.style.overflow = "";
};

const continueAsAnonymous = () => {
  closeAuthChoiceModal();
  window.location.href = "home.html";
};

const goToLoginPage = (mode = "login") => {
  const safeMode = mode === "register" ? "register" : "login";
  closeAuthChoiceModal();
  window.location.href = `login.html?mode=${safeMode}`;
};

const signOut = async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST", auth: false });
  } catch {
    // Local cleanup still proceeds if network logout fails.
  } finally {
    clearAuthSession();
    syncUserBadge();
    setReplyIdentity();
    showNotification("Signed out", "success");
  }
};

const hydrateCurrentUser = async () => {
  try {
    const user = await requestJson("/api/auth/me", { method: "GET", auth: true });
    appState.currentUser = user;
    if (user?.username) {
      localStorage.setItem(USERNAME_KEY, user.username);
    }
    if (user?.role) {
      localStorage.setItem(USER_ROLE_KEY, user.role);
    }
  } catch (error) {
    const msg = String(error.message || "").toLowerCase();
    if (
      msg.includes("invalid") ||
      msg.includes("expired") ||
      msg.includes("missing") ||
      msg.includes("authentication token")
    ) {
      clearAuthSession();
    }
    appState.currentUser = null;
  }
};

const ensureProfileMenu = (badge, username) => {
  if (!badge || !badge.parentElement) return;

  let menu = badge.parentElement.querySelector(".profile-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "profile-menu";
    menu.innerHTML = `
      <div class="profile-menu-name"></div>
      <button type="button" class="profile-dashboard-btn">Dashboard</button>
      <button type="button" class="profile-signout-btn">Sign out</button>
    `;
    badge.parentElement.appendChild(menu);
  }

  const name = menu.querySelector(".profile-menu-name");
  if (name) {
    name.textContent = username;
  }

  if (!badge.dataset.profileBound) {
    const closeMenu = () => menu.classList.remove("open");

    badge.addEventListener("click", () => {
      menu.classList.toggle("open");
    });

    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        menu.classList.toggle("open");
      }
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target) && event.target !== badge) {
        closeMenu();
      }
    });

    const signoutButton = menu.querySelector(".profile-signout-btn");
    const dashboardButton = menu.querySelector(".profile-dashboard-btn");

    dashboardButton?.addEventListener("click", () => {
      closeMenu();
      openDashboard();
    });

    signoutButton?.addEventListener("click", () => {
      closeMenu();
      signOut();
    });

    badge.dataset.profileBound = "true";
  }
};

const syncUserBadge = () => {
  const badge = document.querySelector(".user-badge");
  if (!badge) return;
  const disableProfileMenu = badge.dataset.profileMenu === "disabled";

  if (hasAuthHint()) {
    const username = getCurrentUsername();
    badge.textContent = username || "Loading profile...";
    if (!disableProfileMenu) {
      badge.classList.add("profile-trigger");
      badge.setAttribute("role", "button");
      badge.setAttribute("tabindex", "0");
      if (username) {
        ensureProfileMenu(badge, username);
      } else {
        badge.parentElement?.querySelector(".profile-menu")?.remove();
        hydrateCurrentUser().then(() => {
          if (getCurrentUsername()) {
            syncUserBadge();
            setReplyIdentity();
          }
        });
      }
    } else {
      badge.parentElement?.querySelector(".profile-menu")?.remove();
      badge.classList.remove("profile-trigger");
      badge.removeAttribute("role");
      badge.removeAttribute("tabindex");
    }
    return;
  }

  const menu = badge.parentElement?.querySelector(".profile-menu");
  menu?.remove();
  badge.classList.remove("profile-trigger");
  badge.removeAttribute("role");
  badge.removeAttribute("tabindex");
  badge.textContent = formatAnonymousTag(getAnonId());
};

const getCsrfCookieName = () => sessionStorage.getItem(CSRF_COOKIE_NAME_KEY) || DEFAULT_CSRF_COOKIE_NAME;

const setCsrfCookieName = (value) => {
  if (typeof value !== "string") return;
  const normalized = value.trim();
  if (!normalized) return;
  sessionStorage.setItem(CSRF_COOKIE_NAME_KEY, normalized);
};

const ensureCsrfToken = async () => {
  const cookieName = getCsrfCookieName();
  const inStorage = sessionStorage.getItem(CSRF_TOKEN_KEY);
  const fromCookie = readCookie(cookieName);
  if (inStorage && fromCookie && inStorage === fromCookie) {
    return inStorage;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    throw new Error(
      "Could not reach backend security endpoint. Verify runtime-config.js points to your Render backend URL."
    );
  }

  if (!response.ok) {
    throw new Error(`Unable to initialize CSRF protection (${response.status})`);
  }

  const data = await response.json();
  setCsrfCookieName(data?.csrfCookieName);
  if (!data.csrfToken) {
    throw new Error("CSRF token endpoint did not return a token");
  }

  sessionStorage.setItem(CSRF_TOKEN_KEY, data.csrfToken);
  const latestCookieName = getCsrfCookieName();
  const cookieToken = readCookie(latestCookieName);
  if (!cookieToken) {
    throw new Error(
      "Security cookie was blocked by the browser. Check HTTPS + cookie settings (SameSite=None; Secure) and CORS_ORIGIN."
    );
  }
  if (cookieToken !== data.csrfToken) {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
    throw new Error("Security token mismatch. Refresh and try again.");
  }
  return data.csrfToken;
};

const runAuthPreflight = async () => {
  let healthResponse;
  try {
    healthResponse = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    throw new Error(
      "Backend is unreachable. Verify runtime-config.js uses your live Render backend URL."
    );
  }

  if (!healthResponse.ok) {
    throw new Error(`Backend health check failed (${healthResponse.status})`);
  }

  await ensureCsrfToken();
};

const requestJson = async (path, { method = "GET", body, auth = true } = {}) => {
  const upperMethod = method.toUpperCase();
  const headers = {
    "Content-Type": "application/json",
  };

  if (auth && getAuthToken()) {
    headers.Authorization = `Bearer ${getAuthToken()}`;
  }

  const anonId = getAnonId();
  if (anonId) {
    headers["X-Anon-Id"] = anonId;
  }

  if (isUnsafeMethod(upperMethod)) {
    const csrfToken = await ensureCsrfToken();
    headers["X-CSRF-Token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: upperMethod,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new Error("Network request failed. Verify backend URL and CORS configuration.");
  }

  updateAnonIdFromHeaders(response.headers);

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    const detail = payload?.message || `Request failed (${response.status})`;
    throw new Error(detail);
  }

  return payload;
};

const sanitizeTextInput = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const formatCompactNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  // Keep formatting stable across browsers/locales.
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`.replace(/\.0m$/, "m");
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`.replace(/\.0k$/, "k");
  return new Intl.NumberFormat("en-US").format(num);
};

const updateLandingStats = (stats) => {
  const active = document.getElementById("statActiveThreads");
  const anon = document.getElementById("statAnonymousUsers");
  const posts = document.getElementById("statTotalPosts");
  if (!active || !anon || !posts) return false;

  active.textContent = formatCompactNumber(stats?.activeThreads);
  anon.textContent = formatCompactNumber(stats?.anonymousUsers);
  posts.textContent = formatCompactNumber(stats?.totalPosts);
  return true;
};

const initLandingStats = () => {
  // Only run on index.html (or any page that includes these stat ids).
  if (
    !document.getElementById("statActiveThreads") ||
    !document.getElementById("statAnonymousUsers") ||
    !document.getElementById("statTotalPosts")
  ) {
    return;
  }

  let timer = null;
  const refresh = async () => {
    try {
      const stats = await requestJson("/api/stats", { method: "GET", auth: false });
      updateLandingStats(stats);
    } catch {
      // Keep the landing page usable even if backend is unavailable.
    }
  };

  void refresh();
  timer = setInterval(refresh, 15_000);
  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
  });
};

const formatRelativeTime = (timestamp) => {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return "just now";

  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const persistThreadIds = (threads) => {
  const ids = threads.map((thread) => thread.id);
  appState.threadIdIndex = new Map(ids.map((id, index) => [id, index]));
  sessionStorage.setItem(THREAD_CACHE_KEY, JSON.stringify(ids));
};

const getCachedThreadIds = () => {
  try {
    const raw = sessionStorage.getItem(THREAD_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// ==========================
// AUTH TAB SWITCHING
// ==========================

const switchTab = (tab) => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabs = document.querySelectorAll(".auth-tab");

  tabs.forEach((t) => t.classList.remove("active"));

  if (tab === "login") {
    loginForm?.classList.add("active");
    registerForm?.classList.remove("active");
    tabs[0]?.classList.add("active");
  } else {
    registerForm?.classList.add("active");
    loginForm?.classList.remove("active");
    tabs[1]?.classList.add("active");
  }
};

// ==========================
// AUTH HANDLERS
// ==========================

const finalizeLoginSession = async (authPayload) => {
  if (authPayload?.user?.username) {
    localStorage.setItem(USERNAME_KEY, authPayload.user.username);
    appState.currentUser = authPayload.user;
  }
  if (authPayload?.user?.role) {
    localStorage.setItem(USER_ROLE_KEY, authPayload.user.role);
  }

  // Prefer cookie-based session. Keep Bearer only as migration fallback if cookie login is blocked.
  localStorage.removeItem(AUTH_TOKEN_KEY);

  let cookieSessionOk = false;
  try {
    const me = await requestJson("/api/auth/me", { method: "GET", auth: false });
    if (me?.username) {
      localStorage.setItem(USERNAME_KEY, me.username);
      appState.currentUser = me;
    }
    if (me?.role) {
      localStorage.setItem(USER_ROLE_KEY, me.role);
    }
    cookieSessionOk = true;
  } catch {
    cookieSessionOk = false;
  }

  if (!cookieSessionOk && authPayload?.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, authPayload.token);
    showNotification(
      "Secure auth cookie was blocked. Using temporary token fallback; check Render cookie/CORS settings.",
      "warning"
    );
    return;
  }

  if (!cookieSessionOk) {
    throw new Error("Login succeeded but session verification failed. Check cookie configuration.");
  }
};

const handleLogin = async () => {
  const username = sanitizeTextInput(document.getElementById("loginUsername")?.value);
  const password = document.getElementById("loginPassword")?.value;

  if (!username || !password) {
    showNotification("Please fill in all fields", "error");
    return;
  }

  try {
    await runAuthPreflight();
    const data = await requestJson("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });

    await finalizeLoginSession(data);
    showNotification("Login successful", "success");
    setTimeout(() => {
      window.location.href = "home.html";
    }, 500);
  } catch (error) {
    showNotification(error.message, "error");
  }
};

const handleRegister = async () => {
  const username = sanitizeTextInput(document.getElementById("registerUsername")?.value);
  const password = document.getElementById("registerPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

  if (!username || !password || !confirmPassword) {
    showNotification("Please fill in all fields", "error");
    return;
  }

  if (password !== confirmPassword) {
    showNotification("Passwords do not match", "error");
    return;
  }

  if (password.length < 8) {
    showNotification("Password must be at least 8 characters", "error");
    return;
  }

  try {
    await runAuthPreflight();
    await requestJson("/api/auth/register", {
      method: "POST",
      auth: false,
      body: { username, password },
    });

    showNotification("Account created. Signing in...", "success");
    const loginData = await requestJson("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });
    await finalizeLoginSession(loginData);
    setTimeout(() => {
      window.location.href = "home.html";
    }, 500);
  } catch (error) {
    showNotification(error.message, "error");
  }
};

// ==========================
// THREAD LIST
// ==========================

const sortThreads = (threads, filter) => {
  const cacheKey = `${filter}:${appState.threadsVersion}`;
  const cached = appState.threadSortCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const list = [...threads];

  if (filter === "new") {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    appState.threadSortCache.set(cacheKey, list);
    return list;
  }

  if (filter === "top") {
    list.sort((a, b) => (b.post_count || 0) - (a.post_count || 0));
    appState.threadSortCache.set(cacheKey, list);
    return list;
  }

  list.sort((a, b) => {
    const countDiff = (b.post_count || 0) - (a.post_count || 0);
    if (countDiff !== 0) return countDiff;
    return new Date(b.last_activity_at || b.created_at) - new Date(a.last_activity_at || a.created_at);
  });
  appState.threadSortCache.set(cacheKey, list);
  return list;
};

const buildThreadCard = (thread) => {
  const card = document.createElement("div");
  card.className = "thread-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const header = document.createElement("div");
  header.className = "thread-header";

  const title = document.createElement("h3");
  title.textContent = thread.title;
  header.appendChild(title);

  if ((thread.post_count || 0) >= 10) {
    const badge = document.createElement("span");
    badge.className = "thread-badge hot";
    badge.textContent = "Hot";
    header.appendChild(badge);
  } else if (Date.now() - new Date(thread.created_at).getTime() < 6 * 60 * 60 * 1000) {
    const badge = document.createElement("span");
    badge.className = "thread-badge new";
    badge.textContent = "New";
    header.appendChild(badge);
  }

  const preview = document.createElement("p");
  preview.className = "thread-preview";
  preview.textContent = "Open this thread to read and contribute to the discussion.";

  const meta = document.createElement("div");
  meta.className = "thread-meta";

  const replies = document.createElement("span");
  replies.className = "meta-item";
  replies.textContent = `💬 ${Math.max((thread.post_count || 0) - 1, 0)} replies`;

  const posts = document.createElement("span");
  posts.className = "meta-item";
  posts.textContent = `🧵 ${thread.post_count || 0} posts`;

  const active = document.createElement("span");
  active.className = "meta-item";
  active.textContent = `⏰ Active ${formatRelativeTime(thread.last_activity_at || thread.created_at)}`;

  meta.append(replies, posts, active);
  card.append(header, preview, meta);

  const openThread = () => {
    window.location.href = `thread.html?id=${thread.id}`;
  };

  card.addEventListener("click", openThread);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openThread();
    }
  });

  return card;
};

const renderThreads = () => {
  const list = document.getElementById("threadsList");
  if (!list) return;

  list.innerHTML = "";

  const filtered = sortThreads(appState.threads, appState.activeFilter);
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "thread-card";
    empty.textContent = "No threads yet. Start the first one.";
    list.appendChild(empty);
    return;
  }

  filtered.forEach((thread) => {
    list.appendChild(buildThreadCard(thread));
  });
};

const initializeFilters = () => {
  const filterBtns = document.querySelectorAll(".filter-btn");

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      appState.activeFilter = btn.getAttribute("data-filter") || "hot";
      renderThreads();
    });
  });
};

const loadThreadsPage = async () => {
  const list = document.getElementById("threadsList");
  if (!list) return;

  list.textContent = "Loading threads...";

  try {
    appState.threads = await requestJson("/api/threads", { method: "GET", auth: false });
    appState.threadsVersion += 1;
    appState.threadSortCache.clear();
    persistThreadIds(appState.threads);
    renderThreads();
  } catch (error) {
    list.textContent = "Could not load threads.";
    showNotification(error.message, "error");
  }
};

// ==========================
// NEW THREAD MODAL
// ==========================

const showNewThreadModal = () => {
  const modal = document.getElementById("newThreadModal");
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
};

const closeNewThreadModal = () => {
  const modal = document.getElementById("newThreadModal");
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
    const title = document.getElementById("threadTitle");
    const content = document.getElementById("threadContent");
    if (title) title.value = "";
    if (content) content.value = "";
  }
};

const createThread = async () => {
  const title = sanitizeTextInput(document.getElementById("threadTitle")?.value);
  const content = String(document.getElementById("threadContent")?.value || "").trim();

  if (!title) {
    showNotification("Please enter a thread title", "error");
    return;
  }

  try {
    const thread = await requestJson("/api/threads", {
      method: "POST",
      body: { title, content },
      auth: true,
    });

    showNotification("Thread created", "success");
    closeNewThreadModal();
    window.location.href = `thread.html?id=${thread.id}`;
  } catch (error) {
    showNotification(error.message, "error");
  }
};

// ==========================
// POSTS + THREAD PAGE
// ==========================

const formatAuthorLabel = (post) => {
  if (post.author_type === "user") {
    return post.author_username || `User ${String(post.author_ref).slice(0, 8)}`;
  }
  return formatAnonymousTag(post.author_ref);
};

const renderThreadHeader = (thread) => {
  const title = document.getElementById("threadTitle");
  const replies = document.getElementById("threadRepliesStat");
  const posts = document.getElementById("threadPostsStat");
  const started = document.getElementById("threadStartedStat");

  if (title) title.textContent = thread.title;
  if (replies) replies.textContent = `${Math.max((thread.post_count || 0) - 1, 0)} replies`;
  if (posts) posts.textContent = `${thread.post_count || 0} posts`;
  if (started) started.textContent = `Started ${formatRelativeTime(thread.created_at)}`;
};

const makePostElement = (post, isOriginalPoster) => {
  const wrapper = document.createElement("div");
  wrapper.className = `post${isOriginalPoster ? " original-post" : ""}`;

  const sidebar = document.createElement("div");
  sidebar.className = "post-sidebar";

  const author = document.createElement("div");
  author.className = "post-author";
  author.textContent = formatAuthorLabel(post);
  sidebar.appendChild(author);

  if (isOriginalPoster) {
    const role = document.createElement("div");
    role.className = "post-role";
    role.textContent = "OP";
    sidebar.appendChild(role);
  }

  const content = document.createElement("div");
  content.className = "post-content";

  const time = document.createElement("div");
  time.className = "post-time";
  time.textContent = formatRelativeTime(post.created_at);

  const body = document.createElement("div");
  body.className = "post-body";

  String(post.content || "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      body.appendChild(paragraph);
    });

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likeButton = document.createElement("button");
  likeButton.className = "action-btn";
  likeButton.type = "button";
  likeButton.innerHTML = '<span class="action-icon">▲</span><span class="action-count">0</span>';
  likeButton.addEventListener("click", () => likePost(likeButton));

  const replyButton = document.createElement("button");
  replyButton.className = "action-btn";
  replyButton.type = "button";
  replyButton.innerHTML = '<span class="action-icon">↩</span>Reply';
  replyButton.addEventListener("click", () => replyToPost());

  actions.append(likeButton, replyButton);
  content.append(time, body, actions);
  wrapper.append(sidebar, content);

  return wrapper;
};

const renderPosts = (posts) => {
  const container = document.getElementById("postsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "post";
    empty.textContent = "No posts yet. Be the first to reply.";
    container.appendChild(empty);
    return;
  }

  const opRef = posts[0]?.author_ref;
  posts.forEach((post) => {
    const isOriginalPoster = opRef && post.author_ref === opRef;
    container.appendChild(makePostElement(post, isOriginalPoster));
  });
};

const setReplyIdentity = () => {
  const label = document.getElementById("replyAuthor");
  if (!label) return;

  if (getAuthToken()) {
    const username = getCurrentUsername();
    label.textContent = username || "Loading profile...";
    if (!username) {
      hydrateCurrentUser().then(() => {
        const next = getCurrentUsername();
        if (next) label.textContent = next;
      });
    }
  } else {
    label.textContent = formatAnonymousTag(getAnonId());
  }
};

const loadThreadPage = async () => {
  const container = document.getElementById("postsContainer");
  if (!container) return;

  const threadId = new URLSearchParams(window.location.search).get("id");
  if (!threadId) {
    container.textContent = "Thread ID missing in URL.";
    return;
  }

  appState.currentThreadId = threadId;
  container.textContent = "Loading posts...";

  try {
    const [thread, posts] = await Promise.all([
      requestJson(`/api/threads/${threadId}`, { method: "GET", auth: false }),
      requestJson(`/api/posts/thread/${threadId}`, { method: "GET", auth: false }),
    ]);

    renderThreadHeader(thread);
    renderPosts(posts);
    setReplyIdentity();
    await initThreadControls();
  } catch (error) {
    container.textContent = "Could not load this thread.";
    showNotification(error.message, "error");
  }
};

// ==========================
// POST INTERACTIONS
// ==========================

const likePost = (btn) => {
  const isLiked = btn.classList.contains("liked");
  const countElement = btn.querySelector(".action-count");
  const current = Number.parseInt(countElement?.textContent || "0", 10);

  btn.classList.toggle("liked", !isLiked);
  if (countElement) {
    countElement.textContent = String(isLiked ? Math.max(current - 1, 0) : current + 1);
  }
};

const replyToPost = () => {
  const textarea = document.getElementById("replyContent");
  if (!textarea) return;
  textarea.focus();
  textarea.scrollIntoView({ behavior: "smooth", block: "center" });
};

const submitReply = async () => {
  const textarea = document.getElementById("replyContent");
  const content = textarea?.value?.trim();

  if (!content) {
    showNotification("Please write a reply", "error");
    return;
  }

  if (!appState.currentThreadId) {
    showNotification("Thread is not loaded", "error");
    return;
  }

  try {
    await requestJson(`/api/posts/thread/${appState.currentThreadId}`, {
      method: "POST",
      body: { content },
      auth: true,
    });

    textarea.value = "";
    showNotification("Reply posted", "success");
    await loadThreadPage();
  } catch (error) {
    showNotification(error.message, "error");
  }
};

// ==========================
// THREAD NAV + SCROLL UP
// ==========================

const initThreadControls = async () => {
  const nextThreadBtn = document.getElementById("nextThreadBtn");
  const scrollTopBtn = document.getElementById("scrollTopBtn");

  if (!nextThreadBtn && !scrollTopBtn) return;

  const currentId = appState.currentThreadId || new URLSearchParams(window.location.search).get("id");
  if (currentId && nextThreadBtn) {
    let ids = getCachedThreadIds();
    if (!ids.length) {
      try {
        const threads = await requestJson("/api/threads", { method: "GET", auth: false });
        persistThreadIds(threads);
        ids = threads.map((thread) => thread.id);
      } catch {
        ids = [];
      }
    }

    if (ids.length > 1) {
      if (!appState.threadIdIndex.size || appState.threadIdIndex.size !== ids.length) {
        appState.threadIdIndex = new Map(ids.map((id, index) => [id, index]));
      }
      const index = appState.threadIdIndex.get(currentId) ?? 0;
      const nextId = ids[(index + 1) % ids.length];
      nextThreadBtn.onclick = () => {
        window.location.href = `thread.html?id=${nextId}`;
      };
    } else {
      nextThreadBtn.disabled = true;
      nextThreadBtn.textContent = "No more threads";
    }
  }

  if (scrollTopBtn) {
    const toggleScrollBtn = () => {
      if (window.scrollY > 260) {
        scrollTopBtn.classList.add("visible");
      } else {
        scrollTopBtn.classList.remove("visible");
      }
    };

    window.addEventListener("scroll", toggleScrollBtn, { passive: true });
    toggleScrollBtn();

    scrollTopBtn.onclick = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }
};

// ==========================
// NOTIFICATIONS
// ==========================

const showNotification = (message, type = "info") => {
  const existing = document.querySelector(".notification");
  if (existing) existing.remove();

  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  Object.assign(notification.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "1rem 1.5rem",
    background:
      type === "success"
        ? "var(--success)"
        : type === "error"
          ? "var(--danger)"
          : type === "warning"
            ? "var(--warning)"
            : "var(--accent)",
    color: "var(--bg-main)",
    borderRadius: "4px",
    fontWeight: "600",
    fontSize: "0.9rem",
    zIndex: "10000",
    boxShadow: "var(--shadow-lg)",
    animation: "slideInRight 0.3s ease-out",
    maxWidth: "320px",
    wordWrap: "break-word",
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
};

const style = document.createElement("style");
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ==========================
// UX HELPERS
// ==========================

const observeElements = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );

  const elements = document.querySelectorAll(".feature-card, .thread-card, .post");
  elements.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });
};

const initAutoExpandTextareas = () => {
  document.querySelectorAll("textarea").forEach((textarea) => {
    textarea.addEventListener("input", function onInput() {
      this.style.height = "auto";
      this.style.height = `${this.scrollHeight}px`;
    });
  });
};

// ==========================
// STARTUP
// ==========================

document.addEventListener("click", (event) => {
  const modal = document.getElementById("newThreadModal");
  if (modal && event.target === modal) {
    closeNewThreadModal();
  }

  const authChoiceModal = document.getElementById("authChoiceModal");
  if (authChoiceModal && event.target === authChoiceModal) {
    closeAuthChoiceModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeNewThreadModal();
    closeAuthChoiceModal();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    if (document.getElementById("newThreadModal")) {
      event.preventDefault();
      showNewThreadModal();
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  initThemeToggles();
  loadTheme();
  await hydrateCurrentUser();
  syncUserBadge();
  initLandingStats();
  initializeFilters();
  initAutoExpandTextareas();

  try {
    await ensureCsrfToken();
  } catch {
    // Keep app usable for read-only pages if backend is unavailable.
  }

  if (document.getElementById("threadsList")) {
    await loadThreadsPage();
    const shouldOpenNewThread = new URLSearchParams(window.location.search).get("new");
    if (shouldOpenNewThread === "1") {
      showNewThreadModal();
    }
  }

  if (document.getElementById("postsContainer")) {
    await loadThreadPage();
  }

  setTimeout(() => {
    observeElements();
  }, 100);

  const authInputs = document.querySelectorAll(".auth-form input");
  authInputs.forEach((input) => {
    input.addEventListener("keypress", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const form = input.closest(".auth-form");
      if (form?.id === "loginForm") handleLogin();
      if (form?.id === "registerForm") handleRegister();
    });
  });

  const replyTextarea = document.getElementById("replyContent");
  if (replyTextarea) {
    replyTextarea.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submitReply();
      }
    });
  }

  const authMode = new URLSearchParams(window.location.search).get("mode");
  if (authMode === "register") {
    switchTab("register");
  } else if (authMode === "login") {
    switchTab("login");
  }
});

window.toggleTheme = toggleTheme;
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.showNewThreadModal = showNewThreadModal;
window.closeNewThreadModal = closeNewThreadModal;
window.createThread = createThread;
window.likePost = likePost;
window.replyToPost = replyToPost;
window.submitReply = submitReply;
window.showNotification = showNotification;
window.openDashboard = openDashboard;
window.showAuthChoiceModal = showAuthChoiceModal;
window.closeAuthChoiceModal = closeAuthChoiceModal;
window.continueAsAnonymous = continueAsAnonymous;
window.goToLoginPage = goToLoginPage;

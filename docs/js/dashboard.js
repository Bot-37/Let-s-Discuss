(() => {
const DASHBOARD_STORAGE_KEY = "dashboard_profile";
const DASHBOARD_REFRESH_MS = 15000;

const dashboardState = {
  profile: {
    displayName: "",
    bio: "",
    bannerDataUrl: "",
    avatarDataUrl: "",
    website: "",
    location: "",
  },
  authUser: null,
  identity: null,
  dashboardSummary: {
    summary: {
      threadsStarted: 0,
      repliesPosted: 0,
      totalPosts: 0,
    },
    startedThreads: [],
    replies: [],
    activity: [],
  },
  threadLookup: new Map(),
  pollTimer: null,
};

const normalizeApiBase = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
};

const getApiBase = () => {
  if (typeof window !== "undefined" && typeof window.__API_BASE_URL__ === "string") {
    const runtimeValue = normalizeApiBase(window.__API_BASE_URL__);
    if (runtimeValue) return runtimeValue;
  }

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

const getAuthToken = () => localStorage.getItem("auth_token");
const getStoredUsername = () => localStorage.getItem("username");
const getAnonId = () => localStorage.getItem("anon_id");
const CSRF_TOKEN_KEY = "csrf_token";
const CSRF_COOKIE_NAME_KEY = "csrf_cookie_name";
const DEFAULT_CSRF_COOKIE_NAME = "csrf_token";

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
    response = await fetch(`${getApiBase()}/api/csrf-token`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    throw new Error("Could not initialize CSRF protection");
  }
  if (!response.ok) {
    throw new Error(`Unable to initialize CSRF protection (${response.status})`);
  }

  const payload = await response.json();
  setCsrfCookieName(payload?.csrfCookieName);
  if (!payload?.csrfToken) {
    throw new Error("CSRF token endpoint did not return a token");
  }

  sessionStorage.setItem(CSRF_TOKEN_KEY, payload.csrfToken);
  return payload.csrfToken;
};

const formatAnonymousTag = (anonId) => {
  if (!anonId) return "Anonymous";
  return `Anonymous #${String(anonId).replace(/^anon_/, "").slice(0, 4).toUpperCase()}`;
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
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

const safeSnippet = (value, max = 200) => {
  const text = typeof value === "string" ? value : "";
  return text.slice(0, max);
};

const setText = (selector, value) => {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
};

const setValue = (selector, value) => {
  const node = document.querySelector(selector);
  if (node && "value" in node) {
    node.value = value;
  }
};

const showNotice = (message, type = "info") => {
  if (typeof window.showNotification === "function") {
    window.showNotification(message, type);
  }
};

const loadDashboardState = () => {
  try {
    const raw = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      dashboardState.profile = { ...dashboardState.profile, ...parsed };
    }
  } catch {
    // Ignore malformed stored profile state.
  }
};

const saveDashboardState = () => {
  localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboardState.profile));
};

const requestJson = async (path, { method = "GET", auth = false, body } = {}) => {
  const upperMethod = method.toUpperCase();
  const headers = { "Content-Type": "application/json" };
  if (auth && getAuthToken()) {
    headers.Authorization = `Bearer ${getAuthToken()}`;
  }
  if (isUnsafeMethod(upperMethod)) {
    headers["X-CSRF-Token"] = await ensureCsrfToken();
  }

  let response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method: upperMethod,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new Error("Network request failed. Verify backend URL and CORS settings.");
  }

  const anonHeader = response.headers.get("X-Anon-Id");
  if (anonHeader) {
    localStorage.setItem("anon_id", anonHeader);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload;
};

const detectIdentity = async () => {
  const userPage = window.location.pathname.endsWith("dashboard-user.html");
  const guestPage = window.location.pathname.endsWith("dashboard.html");

  dashboardState.authUser = null;
  try {
    const me = await requestJson("/api/auth/me", { auth: true });
    dashboardState.authUser = me;
    localStorage.setItem("username", me.username);
    if (me?.role) {
      localStorage.setItem("user_role", me.role);
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const authFailure =
      message.includes("401") ||
      message.includes("invalid") ||
      message.includes("expired") ||
      message.includes("missing") ||
      message.includes("authentication token");

    if (authFailure) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("username");
      localStorage.removeItem("user_role");
    }
  }

  if (dashboardState.authUser && guestPage) {
    window.location.replace("dashboard-user.html");
    return false;
  }

  if (!dashboardState.authUser && userPage) {
    window.location.replace("dashboard.html");
    return false;
  }

  const anon = getAnonId();
  if (dashboardState.authUser) {
    dashboardState.identity = {
      type: "user",
      id: dashboardState.authUser.id,
      label: dashboardState.authUser.username,
    };
  } else {
    dashboardState.identity = {
      type: "anon",
      id: anon,
      label: formatAnonymousTag(anon),
    };
  }

  return true;
};

const applyProfileUI = () => {
  const identity = dashboardState.identity;
  if (!identity) return;

  const isUser = identity.type === "user";
  const storedDisplayName = String(dashboardState.profile.displayName || "").trim();
  const displayName =
    storedDisplayName && !/^loading profile/i.test(storedDisplayName)
      ? storedDisplayName
      : identity.label;
  const storedBio = String(dashboardState.profile.bio || "").trim();
  const bio =
    (storedBio && !/^loading profile bio/i.test(storedBio) ? storedBio : "") ||
    (isUser
      ? "Participating in meaningful discussions across the community."
      : "Browsing anonymously. Create an account to customize your profile.");

  setText("#userBadge", identity.label);
  setText("#profileName", displayName);
  setText("#profileType", isUser ? "Verified Member" : "Guest User");
  setText("#profileBio", bio);
  setText("#settingsUsername", dashboardState.authUser?.username || identity.label);
  setText("#accountTypeValue", isUser ? "Verified Member" : "Guest (Anonymous)");
  setValue("#settingsDisplayName", displayName);
  setValue("#settingsBio", bio);

  const profileDetails = document.querySelector(".profile-details");
  if (profileDetails) {
    profileDetails.classList.add("profile-clickable");
    profileDetails.onclick = () => {
      if (isUser) {
        editProfile();
      } else {
        showSettingsModal();
      }
    };
  }

  const bannerBtn = document.getElementById("bannerEditBtn");
  if (bannerBtn) {
    bannerBtn.style.display = isUser ? "inline-flex" : "none";
  }

  const upgradeBtn = document.getElementById("upgradeBtn");
  if (upgradeBtn) {
    upgradeBtn.style.display = isUser ? "none" : "inline-flex";
  }

  const profileAvatar = document.getElementById("profileAvatar");
  if (profileAvatar) {
    if (isUser) {
      profileAvatar.classList.add("editable");
      if (!profileAvatar.getAttribute("onclick") && profileAvatar.dataset.avatarBound !== "true") {
        profileAvatar.addEventListener("click", showAvatarUploadModal);
        profileAvatar.dataset.avatarBound = "true";
      }
    } else {
      profileAvatar.classList.remove("editable");
      profileAvatar.removeAttribute("onclick");
    }
  }

  const editableBio = document.querySelector("#profileBio.editable");
  if (editableBio) {
    editableBio.classList.toggle("editable", isUser);
  }

  if (dashboardState.profile.bannerDataUrl) {
    const banner = document.getElementById("profileBanner");
    if (banner) {
      banner.style.backgroundImage = `url('${dashboardState.profile.bannerDataUrl}')`;
      banner.style.backgroundSize = "cover";
      banner.style.backgroundPosition = "center";
    }
  }

  if (dashboardState.profile.avatarDataUrl) {
    const avatarImg = document.getElementById("avatarImg");
    if (avatarImg) avatarImg.src = dashboardState.profile.avatarDataUrl;
  }
};

const fetchDashboardSummary = async () => {
  const payload = await requestJson("/api/dashboard/summary", { auth: true });
  const summary = payload?.summary && typeof payload.summary === "object" ? payload.summary : {};
  const startedThreads = Array.isArray(payload?.startedThreads) ? payload.startedThreads : [];
  const replies = Array.isArray(payload?.replies) ? payload.replies : [];
  const activity = Array.isArray(payload?.activity) ? payload.activity : [];

  dashboardState.dashboardSummary = {
    summary: {
      threadsStarted: Number(summary.threadsStarted || 0),
      repliesPosted: Number(summary.repliesPosted || 0),
      totalPosts: Number(summary.totalPosts || 0),
    },
    startedThreads,
    replies,
    activity,
  };

  dashboardState.threadLookup = new Map(
    startedThreads.map((thread, index) => [String(thread.id), index])
  );

  if (payload?.identity?.type && payload?.identity?.id) {
    const isUser = payload.identity.type === "user";
    dashboardState.identity = {
      type: payload.identity.type,
      id: payload.identity.id,
      label: isUser
        ? dashboardState.authUser?.username || getStoredUsername() || "Member"
        : formatAnonymousTag(payload.identity.id),
    };
  }
};

const renderStatCards = (summaryState) => {
  const stats = summaryState?.summary || {};
  setText("#statThreads", String(stats.threadsStarted || 0));
  setText("#statReplies", String(stats.repliesPosted || 0));
  setText("#statLikes", "--");

  if (dashboardState.authUser?.created_at) {
    setText("#statJoined", formatRelativeTime(dashboardState.authUser.created_at));
  } else {
    setText("#statJoined", "Today");
  }
};

const clearContainer = (selector) => {
  const node = document.querySelector(selector);
  if (node) node.textContent = "";
  return node;
};

const makeEmptyState = ({ title, message, actionLabel, actionHref }) => {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = message;
  wrapper.append(heading, body);

  if (actionLabel && actionHref) {
    const link = document.createElement("a");
    link.href = actionHref;
    const button = document.createElement("button");
    button.className = "btn-primary";
    button.type = "button";
    button.textContent = actionLabel;
    link.appendChild(button);
    wrapper.appendChild(link);
  }

  return wrapper;
};

const makeActivityItem = (entry) => {
  const iconClass = entry?.kind === "thread_start" ? "activity-icon-thread" : "activity-icon-reply";
  const item = document.createElement("div");
  item.className = "activity-item";

  const icon = document.createElement("div");
  icon.className = `activity-icon ${iconClass}`;
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  const circle = document.createElementNS(svgNs, "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "10");
  svg.appendChild(circle);
  icon.appendChild(svg);

  const content = document.createElement("div");
  content.className = "activity-content";
  const text = document.createElement("p");
  const actor = document.createElement("strong");
  actor.textContent = "You";
  text.appendChild(actor);
  text.appendChild(
    document.createTextNode(entry?.kind === "thread_start" ? " started " : " replied in ")
  );

  const link = document.createElement("a");
  link.href = `thread.html?id=${encodeURIComponent(String(entry?.thread_id || ""))}`;
  link.textContent = String(entry?.thread_title || "a thread");
  text.appendChild(link);

  const time = document.createElement("span");
  time.className = "activity-time";
  time.textContent = formatRelativeTime(entry?.created_at);

  content.append(text, time);
  item.append(icon, content);
  return item;
};

const renderActivity = (summaryState) => {
  const activityTab = clearContainer("#activityTab");
  if (!activityTab) return;

  const items = Array.isArray(summaryState?.activity) ? summaryState.activity : [];

  if (!items.length) {
    activityTab.appendChild(
      makeEmptyState({
        title: "No Recent Activity",
        message: "Start participating in discussions to see your activity here.",
        actionLabel: "Browse Threads",
        actionHref: "home.html",
      })
    );
    return;
  }

  const list = document.createElement("div");
  list.className = "activity-list";
  items.slice(0, 8).forEach((item) => list.appendChild(makeActivityItem(item)));
  activityTab.appendChild(list);
};

const renderThreadsTab = (summaryState) => {
  const tab = clearContainer("#threadsTab");
  if (!tab) return;

  const startedThreads = Array.isArray(summaryState?.startedThreads)
    ? summaryState.startedThreads
    : [];

  if (!startedThreads.length) {
    tab.appendChild(
      makeEmptyState({
        title: "No Threads Yet",
        message: "You haven't started any discussions yet.",
        actionLabel: "Start Your First Thread",
        actionHref: "home.html?new=1",
      })
    );
    return;
  }

  const list = document.createElement("div");
  list.className = "content-list";

  startedThreads.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "content-item";

    const heading = document.createElement("h4");
    const link = document.createElement("a");
    link.href = `thread.html?id=${encodeURIComponent(String(entry.id || ""))}`;
    link.textContent = String(entry.title || "Untitled thread");
    heading.appendChild(link);

    const preview = document.createElement("p");
    preview.className = "content-preview";
    preview.textContent = safeSnippet(entry.first_post_content || "No opening message.", 170);

    const meta = document.createElement("div");
    meta.className = "content-meta";
    const replies = document.createElement("span");
    replies.textContent = `${Math.max((entry.post_count || 0) - 1, 0)} replies`;
    const active = document.createElement("span");
    active.textContent = `Active ${formatRelativeTime(entry.last_activity_at || entry.created_at)}`;
    meta.append(replies, active);

    item.append(heading, preview, meta);
    list.appendChild(item);
  });

  tab.appendChild(list);
};

const renderRepliesTab = (summaryState) => {
  const tab = clearContainer("#repliesTab");
  if (!tab) return;

  const replies = Array.isArray(summaryState?.replies) ? summaryState.replies : [];
  if (!replies.length) {
    tab.appendChild(
      makeEmptyState({
        title: "No Replies Yet",
        message: "You haven't replied to any threads yet.",
        actionLabel: "Join a Discussion",
        actionHref: "home.html",
      })
    );
    return;
  }

  const list = document.createElement("div");
  list.className = "content-list";

  replies.slice(0, 12).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "content-item";

    const replyTo = document.createElement("p");
    replyTo.className = "reply-to";
    replyTo.appendChild(document.createTextNode("Reply to: "));
    const link = document.createElement("a");
    link.href = `thread.html?id=${encodeURIComponent(String(entry.thread_id || ""))}`;
    link.textContent = String(entry.thread_title || "Untitled thread");
    replyTo.appendChild(link);

    const threadIndex = dashboardState.threadLookup.get(String(entry.thread_id || ""));
    if (typeof threadIndex === "number") {
      const ownThreadTag = document.createElement("span");
      ownThreadTag.className = "thread-badge new";
      ownThreadTag.textContent = "In your thread";
      replyTo.appendChild(document.createTextNode(" "));
      replyTo.appendChild(ownThreadTag);
    }

    const preview = document.createElement("p");
    preview.className = "content-preview";
    preview.textContent = safeSnippet(entry.content, 200);

    const meta = document.createElement("div");
    meta.className = "content-meta";
    const when = document.createElement("span");
    when.textContent = formatRelativeTime(entry.created_at);
    meta.appendChild(when);

    item.append(replyTo, preview, meta);
    list.appendChild(item);
  });

  tab.appendChild(list);
};

const renderSavedTab = () => {
  const tab = clearContainer("#savedTab");
  if (!tab) return;
  tab.appendChild(
    makeEmptyState({
      title: "No Saved Items",
      message: "Saved content is not connected yet.",
    })
  );
};

const updateTabCounts = (summaryState) => {
  const setTabLabel = (tab, base, count) => {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (!btn) return;
    const textNode = Array.from(btn.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
    const label = count === null ? base : `${base} (${count})`;
    if (textNode) {
      textNode.textContent = ` ${label}`;
    } else {
      btn.append(document.createTextNode(` ${label}`));
    }
  };

  const startedThreads = Array.isArray(summaryState?.startedThreads)
    ? summaryState.startedThreads
    : [];
  const replies = Array.isArray(summaryState?.replies) ? summaryState.replies : [];
  const stats = summaryState?.summary || {};
  const threadsCount = Number.isFinite(stats.threadsStarted)
    ? stats.threadsStarted
    : startedThreads.length;
  const repliesCount = Number.isFinite(stats.repliesPosted) ? stats.repliesPosted : replies.length;

  setTabLabel("threads", "My Threads", threadsCount);
  setTabLabel("replies", "My Replies", repliesCount);
  setTabLabel("saved", "Saved", null);
};

const refreshDashboardData = async () => {
  if (!dashboardState.identity) return;

  try {
    await fetchDashboardSummary();
    const summary = dashboardState.dashboardSummary;
    renderStatCards(summary);
    renderActivity(summary);
    renderThreadsTab(summary);
    renderRepliesTab(summary);
    renderSavedTab();
    updateTabCounts(summary);
  } catch (error) {
    showNotice(error.message || "Failed to refresh dashboard", "error");
  }
};

const startRealtimeRefresh = () => {
  if (dashboardState.pollTimer) {
    clearInterval(dashboardState.pollTimer);
  }
  dashboardState.pollTimer = setInterval(() => {
    void refreshDashboardData();
  }, DASHBOARD_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshDashboardData();
    }
  });
};

const activateTab = (tab) => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${tab}Tab`);
  });
};

const initDashboardTabs = () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) activateTab(tab);
    });
  });
};

const activateSettingsPanel = (setting) => {
  document.querySelectorAll(".settings-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.setting === setting);
  });
  document.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${setting}Settings`);
  });
};

const initSettingsNav = () => {
  document.querySelectorAll(".settings-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const setting = btn.dataset.setting;
      if (setting) activateSettingsPanel(setting);
    });
  });
};

const initThemeSelector = () => {
  const options = document.querySelectorAll(".theme-option");
  if (!options.length) return;

  const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  options.forEach((option) => {
    option.classList.toggle(
      "active",
      option.dataset.theme === current || (option.dataset.theme === "auto" && current === "dark")
    );

    option.addEventListener("click", () => {
      options.forEach((item) => item.classList.remove("active"));
      option.classList.add("active");

      const theme = option.dataset.theme;
      if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem("theme");
      }
    });
  });
};

const initFontSizeControl = () => {
  const slider = document.getElementById("fontSizeSlider");
  const value = document.getElementById("fontSizeValue");
  if (!slider || !value) return;

  const apply = () => {
    const size = `${slider.value}px`;
    document.documentElement.style.fontSize = size;
    value.textContent = size;
  };

  slider.addEventListener("input", apply);
  apply();
};

const initCompactModeToggle = () => {
  const checkbox = document.getElementById("compactMode");
  if (!checkbox) return;
  checkbox.addEventListener("change", () => {
    document.body.classList.toggle("compact-mode", checkbox.checked);
  });
};

const initColorPicker = () => {
  const options = document.querySelectorAll(".color-option");
  if (!options.length) return;

  options[0].classList.add("active");
  options.forEach((btn) => {
    btn.addEventListener("click", () => {
      options.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      const color = btn.dataset.color;
      if (color) document.documentElement.style.setProperty("--accent", color);
    });
  });
};

const closeModalById = (id) => {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
};

const openModalById = (id) => {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
};

const showSettingsModal = () => openModalById("settingsModal");
const closeSettingsModal = () => closeModalById("settingsModal");
const showBannerUploadModal = () => openModalById("bannerUploadModal");
const closeBannerUploadModal = () => closeModalById("bannerUploadModal");
const showAvatarUploadModal = () => openModalById("avatarUploadModal");
const closeAvatarUploadModal = () => closeModalById("avatarUploadModal");
const editProfile = () => openModalById("editProfileModal");
const closeEditProfileModal = () => closeModalById("editProfileModal");

const previewImage = (event, previewWrapperId, previewImgId, saveButtonId) => {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const wrapper = document.getElementById(previewWrapperId);
    const previewImg = document.getElementById(previewImgId);
    const saveButton = document.getElementById(saveButtonId);
    if (previewImg) previewImg.src = String(reader.result);
    if (wrapper) wrapper.style.display = "block";
    if (saveButton) saveButton.style.display = "inline-flex";
  };
  reader.readAsDataURL(file);
};

const previewBanner = (event) => previewImage(event, "bannerPreview", "bannerPreviewImg", "saveBannerBtn");
const previewAvatar = (event) => previewImage(event, "avatarPreview", "avatarPreviewImg", "saveAvatarBtn");

const saveBanner = () => {
  const preview = document.getElementById("bannerPreviewImg");
  const banner = document.getElementById("profileBanner");
  if (!preview || !banner || !preview.src) return;

  banner.style.backgroundImage = `url('${preview.src}')`;
  banner.style.backgroundSize = "cover";
  banner.style.backgroundPosition = "center";
  dashboardState.profile.bannerDataUrl = preview.src;
  saveDashboardState();
  closeBannerUploadModal();
};

const saveAvatar = () => {
  const preview = document.getElementById("avatarPreviewImg");
  const avatarImg = document.getElementById("avatarImg");
  if (!preview || !avatarImg || !preview.src) return;

  avatarImg.src = preview.src;
  dashboardState.profile.avatarDataUrl = preview.src;
  saveDashboardState();
  closeAvatarUploadModal();
};

const saveProfile = () => {
  const displayNameInput = document.getElementById("editDisplayName");
  const bioInput = document.getElementById("editBio");
  const websiteInput = document.getElementById("editWebsite");
  const locationInput = document.getElementById("editLocation");

  const fallback = dashboardState.identity?.label || getStoredUsername() || formatAnonymousTag(getAnonId());
  const displayName = displayNameInput?.value.trim() || fallback;
  const bio = bioInput?.value.trim() || "No bio added yet.";

  dashboardState.profile.displayName = displayName;
  dashboardState.profile.bio = bio;
  dashboardState.profile.website = websiteInput?.value.trim() || "";
  dashboardState.profile.location = locationInput?.value.trim() || "";
  saveDashboardState();

  applyProfileUI();
  closeEditProfileModal();
};

const shareProfile = async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showNotice("Profile link copied", "success");
  } catch {
    showNotice("Could not copy link", "error");
  }
};

const clearSession = async () => {
  try {
    await requestJson("/api/auth/logout", { method: "POST", auth: false });
  } catch {
    // Local cleanup still proceeds even if backend logout fails.
  }
  localStorage.removeItem("auth_token");
  localStorage.removeItem("username");
  localStorage.removeItem("user_role");
  localStorage.removeItem("anon_id");
  sessionStorage.clear();
  window.location.href = "index.html";
};

const initModalCloseByOverlay = () => {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("modal")) {
      target.classList.remove("active");
      document.body.style.overflow = "";
    }
  });
};

const initBioCounter = () => {
  const editBio = document.getElementById("editBio");
  const editBioCount = document.getElementById("editBioCount");
  if (!editBio || !editBioCount) return;

  const sync = () => {
    editBioCount.textContent = String(editBio.value.length);
  };

  editBio.addEventListener("input", sync);
  sync();
};

const initUploadInputs = () => {
  const bannerInput = document.getElementById("bannerInput");
  const avatarInput = document.getElementById("avatarInput");
  if (bannerInput) bannerInput.addEventListener("change", previewBanner);
  if (avatarInput) avatarInput.addEventListener("change", previewAvatar);
};

const initDashboardActionButtons = () => {
  const wireSoonButton = (selector, message) => {
    document.querySelectorAll(selector).forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.dataset.wired === "true") return;
      btn.dataset.wired = "true";
      btn.type = "button";
      btn.addEventListener("click", () => {
        showNotice(message, "info");
      });
    });
  };

  wireSoonButton(".btn-outline:not([onclick])[class*='btn-outline']", "This feature will be available soon.");
  wireSoonButton(".btn-danger:not([onclick])", "This action requires backend support and is not enabled yet.");
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.querySelector(".dashboard-page")) return;

  loadDashboardState();

  const cachedUsername = getStoredUsername();
  if (cachedUsername) {
    dashboardState.identity = {
      type: "user",
      id: null,
      label: cachedUsername,
    };
    applyProfileUI();
  } else {
    dashboardState.identity = {
      type: "anon",
      id: getAnonId(),
      label: formatAnonymousTag(getAnonId()),
    };
    applyProfileUI();
  }

  const proceed = await detectIdentity();
  if (!proceed) return;

  initDashboardTabs();
  initSettingsNav();
  initThemeSelector();
  initFontSizeControl();
  initCompactModeToggle();
  initColorPicker();
  initModalCloseByOverlay();
  initBioCounter();
  initUploadInputs();
  initDashboardActionButtons();

  applyProfileUI();

  const displayNameInput = document.getElementById("editDisplayName");
  if (displayNameInput) {
    displayNameInput.value = dashboardState.profile.displayName || dashboardState.identity?.label || "";
  }

  const bioInput = document.getElementById("editBio");
  if (bioInput && dashboardState.profile.bio) {
    bioInput.value = dashboardState.profile.bio;
    const count = document.getElementById("editBioCount");
    if (count) count.textContent = String(bioInput.value.length);
  }

  await refreshDashboardData();
  startRealtimeRefresh();
});

window.showSettingsModal = showSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.showBannerUploadModal = showBannerUploadModal;
window.closeBannerUploadModal = closeBannerUploadModal;
window.showAvatarUploadModal = showAvatarUploadModal;
window.closeAvatarUploadModal = closeAvatarUploadModal;
window.editProfile = editProfile;
window.closeEditProfileModal = closeEditProfileModal;
window.previewBanner = previewBanner;
window.previewAvatar = previewAvatar;
window.saveBanner = saveBanner;
window.saveAvatar = saveAvatar;
window.saveProfile = saveProfile;
window.shareProfile = shareProfile;
window.clearSession = clearSession;
})();

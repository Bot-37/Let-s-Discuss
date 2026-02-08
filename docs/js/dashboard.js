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
  threads: [],
  postsByThread: new Map(),
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

  const localValue = normalizeApiBase(localStorage.getItem("api_base_url"));
  if (localValue) return localValue;

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = normalizeApiBase(window.location.origin);
    if (origin && origin !== "null") return origin;
  }

  throw new Error("API base URL is not configured");
};

const getAuthToken = () => localStorage.getItem("auth_token");
const getStoredUsername = () => localStorage.getItem("username");
const getAnonId = () => localStorage.getItem("anon_id");

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

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

const requestJson = async (path, { method = "GET", auth = false } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (auth && getAuthToken()) {
    headers.Authorization = `Bearer ${getAuthToken()}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    credentials: "include",
  });

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
  if (getAuthToken()) {
    try {
      const me = await requestJson("/api/auth/me", { auth: true });
      dashboardState.authUser = me;
      localStorage.setItem("username", me.username);
    } catch {
      // Token may be stale.
      localStorage.removeItem("auth_token");
      localStorage.removeItem("username");
    }
  }

  if (dashboardState.authUser && guestPage) {
    window.location.replace("dashboard-user.html");
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

    if (userPage) {
      setText("#profileType", "Guest User");
    }
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
      if (!profileAvatar.getAttribute("onclick")) {
        profileAvatar.setAttribute("onclick", "showAvatarUploadModal()");
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

const isAuthoredByIdentity = (post) => {
  const identity = dashboardState.identity;
  if (!identity || !post) return false;

  if (identity.type === "user") {
    return post.author_type === "user" && post.author_ref === identity.id;
  }
  return post.author_type === "anon" && post.author_ref === identity.id;
};

const fetchThreadsAndPosts = async () => {
  const threads = await requestJson("/api/threads", { auth: false });
  dashboardState.threads = Array.isArray(threads) ? threads : [];

  const postRequests = dashboardState.threads.map(async (thread) => {
    try {
      const posts = await requestJson(`/api/posts/thread/${thread.id}`, { auth: false });
      return [thread.id, Array.isArray(posts) ? posts : []];
    } catch {
      return [thread.id, []];
    }
  });

  const entries = await Promise.all(postRequests);
  dashboardState.postsByThread = new Map(entries);
};

const computeSummary = () => {
  const authoredPosts = [];
  const startedThreads = [];

  for (const thread of dashboardState.threads) {
    const posts = dashboardState.postsByThread.get(thread.id) || [];
    const firstPost = posts[0];

    if (firstPost && isAuthoredByIdentity(firstPost)) {
      startedThreads.push({ thread, firstPost });
    }

    for (const post of posts) {
      if (isAuthoredByIdentity(post)) {
        authoredPosts.push({ thread, post, isThreadStarter: firstPost && firstPost.id === post.id });
      }
    }
  }

  const replies = authoredPosts.filter((item) => !item.isThreadStarter);
  return { authoredPosts, startedThreads, replies };
};

const renderStatCards = (summary) => {
  setText("#statThreads", String(summary.startedThreads.length));
  setText("#statReplies", String(summary.replies.length));
  setText("#statLikes", "--");

  if (dashboardState.authUser?.created_at) {
    setText("#statJoined", formatRelativeTime(dashboardState.authUser.created_at));
  } else {
    setText("#statJoined", "Today");
  }
};

const clearContainer = (selector) => {
  const node = document.querySelector(selector);
  if (node) node.innerHTML = "";
  return node;
};

const makeActivityItem = ({ iconClass, text, time }) => {
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `
    <div class="activity-icon ${iconClass}">
      <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
    </div>
    <div class="activity-content">
      <p>${text}</p>
      <span class="activity-time">${time}</span>
    </div>
  `;
  return item;
};

const renderActivity = (summary) => {
  const activityTab = clearContainer("#activityTab");
  if (!activityTab) return;

  const items = [];
  for (const item of summary.authoredPosts) {
    const kind = item.isThreadStarter ? "activity-icon-thread" : "activity-icon-reply";
    const action = item.isThreadStarter ? "started" : "replied in";
    const title = escapeHtml(item.thread.title);
    items.push({
      iconClass: kind,
      text: `<strong>You</strong> ${action} <a href="thread.html?id=${encodeURIComponent(item.thread.id)}">${title}</a>`,
      time: formatRelativeTime(item.post.created_at),
      timestamp: new Date(item.post.created_at).getTime(),
    });
  }

  items.sort((a, b) => {
    const ta = Number.isFinite(a.timestamp) ? a.timestamp : 0;
    const tb = Number.isFinite(b.timestamp) ? b.timestamp : 0;
    return tb - ta;
  });

  if (!items.length) {
    activityTab.innerHTML = `
      <div class="empty-state">
        <h3>No Recent Activity</h3>
        <p>Start participating in discussions to see your activity here.</p>
        <a href="home.html"><button class="btn-primary">Browse Threads</button></a>
      </div>
    `;
    return;
  }

  const list = document.createElement("div");
  list.className = "activity-list";
  items.slice(0, 8).forEach((item) => list.appendChild(makeActivityItem(item)));
  activityTab.appendChild(list);
};

const renderThreadsTab = (summary) => {
  const tab = clearContainer("#threadsTab");
  if (!tab) return;

  if (!summary.startedThreads.length) {
    tab.innerHTML = `
      <div class="empty-state">
        <h3>No Threads Yet</h3>
        <p>You haven't started any discussions yet.</p>
        <button class="btn-primary" onclick="location.href='home.html?new=1'">Start Your First Thread</button>
      </div>
    `;
    return;
  }

  const list = document.createElement("div");
  list.className = "content-list";

  summary.startedThreads.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "content-item";
    const title = escapeHtml(entry.thread.title);
    const preview = escapeHtml(safeSnippet(entry.firstPost?.content || "No opening message.", 170));
    item.innerHTML = `
      <h4><a href="thread.html?id=${encodeURIComponent(entry.thread.id)}">${title}</a></h4>
      <p class="content-preview">${preview}</p>
      <div class="content-meta">
        <span>${Math.max((entry.thread.post_count || 0) - 1, 0)} replies</span>
        <span>Active ${formatRelativeTime(entry.thread.last_activity_at || entry.thread.created_at)}</span>
      </div>
    `;
    list.appendChild(item);
  });

  tab.appendChild(list);
};

const renderRepliesTab = (summary) => {
  const tab = clearContainer("#repliesTab");
  if (!tab) return;

  if (!summary.replies.length) {
    tab.innerHTML = `
      <div class="empty-state">
        <h3>No Replies Yet</h3>
        <p>You haven't replied to any threads yet.</p>
        <a href="home.html"><button class="btn-primary">Join a Discussion</button></a>
      </div>
    `;
    return;
  }

  const list = document.createElement("div");
  list.className = "content-list";

  summary.replies.slice(0, 12).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "content-item";
    const title = escapeHtml(entry.thread.title);
    const preview = escapeHtml(safeSnippet(entry.post.content, 200));
    item.innerHTML = `
      <p class="reply-to">Reply to: <a href="thread.html?id=${encodeURIComponent(entry.thread.id)}">${title}</a></p>
      <p class="content-preview">${preview}</p>
      <div class="content-meta">
        <span>${formatRelativeTime(entry.post.created_at)}</span>
      </div>
    `;
    list.appendChild(item);
  });

  tab.appendChild(list);
};

const renderSavedTab = () => {
  const tab = clearContainer("#savedTab");
  if (!tab) return;
  tab.innerHTML = `
    <div class="empty-state">
      <h3>No Saved Items</h3>
      <p>Saved content is not connected yet.</p>
    </div>
  `;
};

const updateTabCounts = (summary) => {
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

  setTabLabel("threads", "My Threads", summary.startedThreads.length);
  setTabLabel("replies", "My Replies", summary.replies.length);
  setTabLabel("saved", "Saved", null);
};

const refreshDashboardData = async () => {
  if (!dashboardState.identity) return;

  try {
    await fetchThreadsAndPosts();
    const summary = computeSummary();
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

const clearSession = () => {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("username");
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
  if (getAuthToken() && cachedUsername) {
    dashboardState.identity = {
      type: "user",
      id: null,
      label: cachedUsername,
    };
    applyProfileUI();
  } else if (!getAuthToken()) {
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

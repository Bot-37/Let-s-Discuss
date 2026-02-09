// API base used by docs/js/app.js and docs/js/dashboard.js
//
// This project is typically deployed as:
// - Frontend: GitHub Pages (https://<user>.github.io/...)
// - Backend: Render (https://<service>.onrender.com)
//
// Because GitHub Pages is cross-origin, the frontend must explicitly know the backend origin.
(() => {
  const host = window.location.hostname || "";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const isGithubPages = host.endsWith("github.io");

  if (isLocal) {
    window.__API_BASE_URL__ = "http://localhost:4000";
    return;
  }

  if (isGithubPages) {
    // Production backend (Render).
    window.__API_BASE_URL__ = "https://lets-discuss-backend.onrender.com";
    return;
  }

  // For other hosting setups, set this explicitly.
  window.__API_BASE_URL__ = "";
})();


// API base used by docs/js/app.js and docs/js/dashboard.js
//
// Set this to your Render backend URL for production, for example:
//   https://your-service-name.onrender.com
//
// Keep localhost for local development.
window.__API_BASE_URL__ =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "https://lets-discuss-backend.onrender.com";

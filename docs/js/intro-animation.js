/**
 * Intro Animation System
 * Displays the intro animation once per tab session.
 */

const INTRO_SESSION_KEY = "intro_shown";
const INTRO_VISIBLE_MS = 3400;
const INTRO_FADE_MS = 600;
const FALLBACK_TIMEOUT_MS = 5000;
const introMemoryStore = { shown: false };

let introOverlay = null;
let finishTimer = null;
let cleanupTimer = null;
let fallbackTimer = null;

function readSessionFlag() {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === "true";
  } catch {
    return introMemoryStore.shown;
  }
}

function writeSessionFlag(value) {
  introMemoryStore.shown = Boolean(value);
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, value ? "true" : "false");
  } catch {
    // Ignore storage failures (private mode / storage restrictions).
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function clearIntroTimers() {
  if (finishTimer) {
    clearTimeout(finishTimer);
    finishTimer = null;
  }
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function releaseBodyLock() {
  if (document.body) {
    document.body.style.overflow = "";
  }
}

function removeIntroOverlay() {
  if (introOverlay?.parentNode) {
    introOverlay.parentNode.removeChild(introOverlay);
  }
  introOverlay = null;
}

function completeIntro() {
  clearIntroTimers();
  removeIntroOverlay();
  releaseBodyLock();
  writeSessionFlag(true);
}

function startFadeOut() {
  if (!introOverlay) {
    completeIntro();
    return;
  }

  introOverlay.classList.add("fade-out");
  cleanupTimer = setTimeout(completeIntro, INTRO_FADE_MS);
}

function createIntroAnimation() {
  const overlay = document.createElement("div");
  overlay.className = "intro-overlay";
  overlay.innerHTML = `
    <div class="intro-content">
      <div class="intro-logo">
        <div class="intro-logo-circle">
          <span class="intro-logo-text">LET'S<br>DISCUSS</span>
        </div>
      </div>
      <div class="intro-tagline">
        <span class="intro-word" style="--word-index: 0">Speak</span>
        <span class="intro-word" style="--word-index: 1">freely.</span>
        <span class="intro-word" style="--word-index: 2">Stay</span>
        <span class="intro-word" style="--word-index: 3">unknown.</span>
      </div>
    </div>
  `;
  return overlay;
}

function playIntroAnimation() {
  if (readSessionFlag()) return;
  if (!document.body) return;

  // Respect accessibility preference and skip non-essential motion.
  if (prefersReducedMotion()) {
    writeSessionFlag(true);
    return;
  }

  // Guard against duplicate initialization.
  if (introOverlay || document.querySelector(".intro-overlay")) {
    writeSessionFlag(true);
    return;
  }

  introOverlay = createIntroAnimation();
  document.body.appendChild(introOverlay);
  document.body.style.overflow = "hidden";

  // Force reflow so .active transition is reliably applied.
  void introOverlay.offsetHeight;
  requestAnimationFrame(() => {
    introOverlay?.classList.add("active");
  });

  finishTimer = setTimeout(startFadeOut, INTRO_VISIBLE_MS);
  // Hard fail-safe in case timers/transition are interrupted.
  fallbackTimer = setTimeout(completeIntro, FALLBACK_TIMEOUT_MS);
}

// Ensure overlay cannot stay stuck if tab/page lifecycle interrupts timers.
window.addEventListener("pagehide", completeIntro);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && introOverlay) {
    completeIntro();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", playIntroAnimation, { once: true });
} else {
  playIntroAnimation();
}

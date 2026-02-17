/**
 * Intro Animation System
 * Displays a stunning intro animation on first visit per session
 */

const INTRO_SESSION_KEY = 'intro_shown';

// Check if intro should be shown
function shouldShowIntro() {
    // Check if already shown this session
    const shown = sessionStorage.getItem(INTRO_SESSION_KEY);
    return !shown;
}

// Mark intro as shown
function markIntroShown() {
    sessionStorage.setItem(INTRO_SESSION_KEY, 'true');
}

// Create intro animation HTML
function createIntroAnimation() {
    const introOverlay = document.createElement('div');
    introOverlay.className = 'intro-overlay';
    introOverlay.innerHTML = `
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

    return introOverlay;
}

// Play intro animation
function playIntroAnimation() {
    if (!shouldShowIntro()) {
        return;
    }

    const introOverlay = createIntroAnimation();
    document.body.appendChild(introOverlay);

    // Prevent scrolling during animation
    document.body.style.overflow = 'hidden';

    // Force reflow for animation
    introOverlay.offsetHeight;

    // Start animation
    requestAnimationFrame(() => {
        introOverlay.classList.add('active');
    });

    // Complete animation after duration
    setTimeout(() => {
        introOverlay.classList.add('fade-out');

        // Remove overlay after fade out
        setTimeout(() => {
            document.body.removeChild(introOverlay);
            document.body.style.overflow = '';
            markIntroShown();
        }, 600);
    }, 3400); // Total animation time: 3.4s
}

// Initialize intro animation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', playIntroAnimation);
} else {
    playIntroAnimation();
}

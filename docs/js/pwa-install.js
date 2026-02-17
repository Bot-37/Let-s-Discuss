/**
 * PWA Install Prompt Handler
 * Manages custom install banner and prompt
 */

let deferredPrompt = null;
let installBanner = null;

// Capture the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();

    // Stash the event so it can be triggered later
    deferredPrompt = e;

    // Show custom install banner
    showInstallBanner();
});

// Create install banner
function createInstallBanner() {
    const banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
    <div class="pwa-install-content">
      <div class="pwa-install-icon">📱</div>
      <div class="pwa-install-text">
        <div class="pwa-install-title">Install Let's Discuss</div>
        <div class="pwa-install-subtitle">Get the app experience</div>
      </div>
      <div class="pwa-install-actions">
        <button class="pwa-install-btn" type="button">Install</button>
        <button class="pwa-dismiss-btn" type="button" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `;

    return banner;
}

// Show install banner
function showInstallBanner() {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return;
    }

    // Don't show if dismissed recently
    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed) {
        const dismissedTime = parseInt(dismissed, 10);
        const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
        if (daysSinceDismissed < 7) {
            return; // Wait 7 days before showing again
        }
    }

    // Create and show banner
    installBanner = createInstallBanner();
    document.body.appendChild(installBanner);

    // Fade in
    requestAnimationFrame(() => {
        installBanner.classList.add('visible');
    });

    // Add event listeners
    const installBtn = installBanner.querySelector('.pwa-install-btn');
    const dismissBtn = installBanner.querySelector('.pwa-dismiss-btn');

    installBtn.addEventListener('click', handleInstallClick);
    dismissBtn.addEventListener('click', handleDismissClick);
}

// Handle install button click
async function handleInstallClick() {
    if (!deferredPrompt) {
        return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response to install prompt: ${outcome}`);

    // Clear the deferred prompt
    deferredPrompt = null;

    // Hide the banner
    hideInstallBanner();
}

// Handle dismiss button click
function handleDismissClick() {
    // Store dismissal time
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());

    // Hide the banner
    hideInstallBanner();
}

// Hide install banner
function hideInstallBanner() {
    if (!installBanner) {
        return;
    }

    installBanner.classList.remove('visible');

    setTimeout(() => {
        if (installBanner && installBanner.parentNode) {
            installBanner.parentNode.removeChild(installBanner);
        }
        installBanner = null;
    }, 300);
}

// Detect if app is already installed
window.addEventListener('appinstalled', () => {
    console.log('PWA was installed successfully');
    hideInstallBanner();

    // Clear dismissal flag
    localStorage.removeItem('pwa_install_dismissed');
});

// Log if running as installed PWA
if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('Running as installed PWA');
}

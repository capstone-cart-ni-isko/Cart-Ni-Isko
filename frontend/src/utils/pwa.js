/**
 * Open the browser's install prompt when it has offered one; otherwise ask
 * <PwaInstallPrompt /> to show the manual "Add to Home Screen" steps.
 */
export function triggerPwaInstall() {
  const promptEvent = window.__pwaDeferredPrompt
  if (promptEvent) {
    promptEvent.prompt()
    promptEvent.userChoice.then(({ outcome }) => {
      if (outcome === 'accepted') {
        window.__pwaDeferredPrompt = null
      }
    })
  } else {
    window.dispatchEvent(new CustomEvent('open-pwa-prompt'))
  }
}

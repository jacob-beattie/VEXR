import { useRegisterSW } from 'virtual:pwa-register/react'

// Wraps vite-plugin-pwa's React helper so the update-available UI only depends
// on this one hook's return shape, not the virtual module directly (easier to
// mock in tests, and gives the app one place to change if the library's API shifts).
export function usePWAUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return {
    needRefresh,
    update: () => updateServiceWorker(),
    dismiss: () => setNeedRefresh(false),
  }
}

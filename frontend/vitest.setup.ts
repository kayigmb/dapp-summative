import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement matchMedia; the shadcn sidebar's useIsMobile hook needs it.
window.matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

import { createContext, useContext, useState } from 'react'
import { formatCurrency } from './utils'

export type DisplayCurrency = 'EUR' | 'AED' | 'USD'

/** Conversion rates from stored EUR to each display currency. */
export const DISPLAY_RATES: Record<DisplayCurrency, number> = {
  EUR: 1,
  AED: 3.984, // 1 EUR = 3.984 AED
  USD: 1.08, // 1 EUR = 1.08 USD
}

interface CurrencyContextType {
  displayCurrency: DisplayCurrency
  setDisplayCurrency: (c: DisplayCurrency) => void
  /** Convert a stored-EUR amount to the display currency */
  toDisplay: (eur: number) => number
  /** Format a stored-EUR amount in the display currency */
  fmt: (eur: number) => string
  /** Current display currency code */
  curr: string
}

const CurrencyContext = createContext<CurrencyContextType>({
  displayCurrency: 'EUR',
  setDisplayCurrency: () => {},
  toDisplay: (x) => x,
  fmt: (x) => formatCurrency(x, 'EUR'),
  curr: 'EUR',
})

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [displayCurrency, setDisplayCurrencyRaw] = useState<DisplayCurrency>(() => {
    const stored = localStorage.getItem('displayCurrency')
    return stored && stored in DISPLAY_RATES ? (stored as DisplayCurrency) : 'EUR'
  })

  function setDisplayCurrency(c: DisplayCurrency) {
    setDisplayCurrencyRaw(c)
    localStorage.setItem('displayCurrency', c)
  }

  function toDisplay(eur: number) {
    return eur * DISPLAY_RATES[displayCurrency]
  }

  function fmt(eur: number) {
    return formatCurrency(toDisplay(eur), displayCurrency)
  }

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, toDisplay, fmt, curr: displayCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}

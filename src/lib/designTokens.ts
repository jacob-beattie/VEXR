export const RADIUS = {
  card: 8,
  input: 8,
  button: 8,
  chip: 6,
  avatar: '50%' as const,
}

// Only real floating overlays get a shadow — in-flow cards use borders/rule-line
// dividers for separation instead, per the "Splits" instrument-panel language.
export const SHADOW = {
  modal: '0 12px 32px rgba(20,23,26,0.18), 0 2px 8px rgba(20,23,26,0.10)',
  dropdown: '0 8px 20px rgba(20,23,26,0.14), 0 2px 6px rgba(20,23,26,0.08)',
}

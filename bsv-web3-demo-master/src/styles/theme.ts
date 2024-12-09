export const theme = {
  background: '#111111',
  cardBg: '#1c1c1c',
  text: '#ffffff',
  secondaryText: '#888888',
  border: '#2a2a2a',
  buttonBg: '#ffffff',
  buttonText: '#000000',
} as const;

export type Theme = typeof theme; 
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export const money = (n: number) => usd.format(Math.round(n) === 0 ? 0 : n);
export const moneyCompact = (n: number) => compact.format(n);
export const pct = (r: number, digits = 0) => `${(r * 100).toFixed(digits)}%`;

export function formatMoney(amount) {
  const n = Number(amount) || 0;
  return `ETB ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

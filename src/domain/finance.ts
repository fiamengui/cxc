export function addMonthsClamped(value: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !Number.isInteger(offset)) {
    throw new Error("Data ou intervalo inválido.");
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const source = new Date(Date.UTC(year, month - 1, day));
  if (
    source.getUTCFullYear() !== year ||
    source.getUTCMonth() !== month - 1 ||
    source.getUTCDate() !== day
  ) {
    throw new Error("Data inválida.");
  }
  const targetFirst = new Date(Date.UTC(year, month - 1 + offset, 1));
  const targetLastDay = new Date(
    Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetFirst.getUTCFullYear(),
      targetFirst.getUTCMonth(),
      Math.min(day, targetLastDay),
    ),
  )
    .toISOString()
    .slice(0, 10);
}

export function splitInstallmentCents(totalCents: number, count: number): number[] {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 120 ||
    totalCents < count
  ) {
    throw new Error("Valor total ou quantidade de parcelas inválido.");
  }
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? totalCents - base * (count - 1) : base,
  );
}

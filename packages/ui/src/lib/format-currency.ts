export interface FormatCurrencyOptions {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  noDecimals?: boolean;
}

export function formatCurrency(
  amount: number,
  opts?: FormatCurrencyOptions,
) {
  const {
    currency = "USD",
    locale = "en-US",
    minimumFractionDigits,
    maximumFractionDigits,
    noDecimals,
  } = opts ?? {};

  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: noDecimals ? 0 : minimumFractionDigits,
    maximumFractionDigits: noDecimals ? 0 : maximumFractionDigits,
  };

  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}

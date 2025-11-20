const usdInput = document.getElementById('usdPrice');
const form = document.getElementById('calcForm');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const finalCadEl = document.getElementById('finalCad');
const usdSummary = document.getElementById('usdSummary');
const shippingSummary = document.getElementById('shippingSummary');
const dutySummary = document.getElementById('dutySummary');
const rateSummary = document.getElementById('rateSummary');
const resetButton = document.getElementById('resetButton');

const DUTY_RATE = 0.15;
const SHIPPING_COST = 20;
const FREE_SHIPPING_THRESHOLD = 250;

function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

function setStatus(message, variant = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${variant ? `status--${variant}` : ''}`;
}

function toggleResults(visible) {
  resultsEl.hidden = !visible;
}

async function fetchConversionRate() {
  const response = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!response.ok) {
    throw new Error('Unable to fetch conversion rate');
  }

  const data = await response.json();
  if (!data?.rates?.CAD) {
    throw new Error('CAD rate unavailable');
  }

  return data.rates.CAD;
}

function parseUsdInput(rawValue) {
  const entries = rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item));

  if (entries.length === 0 || entries.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  return entries.reduce((sum, value) => sum + value, 0);
}

async function handleCalculation(event) {
  event.preventDefault();
  const usd = parseUsdInput(usdInput.value);

  if (!Number.isFinite(usd) || usd <= 0) {
    setStatus('Enter item prices separated by commas (numbers only).', 'error');
    toggleResults(false);
    return;
  }

  setStatus('Fetching the latest USD → CAD rate…');
  toggleResults(false);

  try {
    const conversionRate = await fetchConversionRate();
    const shipping = usd > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    const duty = usd * DUTY_RATE;
    const totalUsd = usd + shipping + duty;
    const totalCad = totalUsd * conversionRate;

    finalCadEl.textContent = `${formatCurrency(totalCad, 'CAD')} CAD`;
    usdSummary.textContent = `Subtotal from items: ${formatCurrency(usd)}`;
    shippingSummary.textContent = shipping === 0
      ? 'Shipping: Free'
      : `Shipping: ${formatCurrency(shipping)}`;
    dutySummary.textContent = `Duty (15%): ${formatCurrency(duty)}`;
    rateSummary.textContent = `USD → CAD rate: ${conversionRate.toFixed(4)}`;

    toggleResults(true);
    setStatus('Calculation updated with live rates.', 'success');
  } catch (error) {
    console.error(error);
    setStatus('Could not update rates right now. Please try again.', 'error');
  }
}

function resetForm() {
  form.reset();
  usdInput.focus();
  toggleResults(false);
  setStatus('');
}

form.addEventListener('submit', handleCalculation);
resetButton.addEventListener('click', resetForm);

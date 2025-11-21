async function initSupremeCalculator() {
  const { fetchSupremeCommunityDroplists } = await import('./src/data/supremecommunity.js');

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

  const droplistGrid = document.getElementById('droplistGrid');
  const droplistStatus = document.getElementById('droplistStatus');
  const droplistSummary = document.getElementById('droplistSummary');
  const refreshDroplistButton = document.getElementById('refreshDroplist');

  const DUTY_RATE = 0.15;
  const SHIPPING_COST = 20;
  const FREE_SHIPPING_THRESHOLD = 250;

  function formatCurrency(value, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  }

  function setStatus(target, message, variant = '') {
    target.textContent = message;
    target.className = `status ${variant ? `status--${variant}` : ''}`;
  }

  function formatDropDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
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

  function calculateFees(subtotalUsd) {
    const shipping = subtotalUsd > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    const duty = subtotalUsd * DUTY_RATE;
    const totalUsd = subtotalUsd + shipping + duty;
    return { shipping, duty, totalUsd };
  }

  async function handleCalculation(event) {
    event.preventDefault();
    const usd = parseUsdInput(usdInput.value);

    if (!Number.isFinite(usd) || usd <= 0) {
      setStatus(statusEl, 'Enter item prices separated by commas (numbers only).', 'error');
      toggleResults(false);
      return;
    }

    setStatus(statusEl, 'Fetching the latest USD → CAD rate…');
    toggleResults(false);

    try {
      const conversionRate = await fetchConversionRate();
      const { shipping, duty, totalUsd } = calculateFees(usd);
      const totalCad = totalUsd * conversionRate;

      finalCadEl.textContent = `${formatCurrency(totalCad, 'CAD')} CAD`;
      usdSummary.textContent = `Subtotal from items: ${formatCurrency(usd)}`;
      shippingSummary.textContent = shipping === 0
        ? 'Shipping: Free'
        : `Shipping: ${formatCurrency(shipping)}`;
      dutySummary.textContent = `Duty (15%): ${formatCurrency(duty)}`;
      rateSummary.textContent = `USD → CAD rate: ${conversionRate.toFixed(4)}`;

      toggleResults(true);
      setStatus(statusEl, 'Calculation updated with live rates.', 'success');
    } catch (error) {
      console.error(error);
      setStatus(statusEl, 'Could not update rates right now. Please try again.', 'error');
    }
  }

  function resetForm() {
    form.reset();
    usdInput.focus();
    toggleResults(false);
    setStatus(statusEl, '');
  }

  function availabilityClass(label) {
    if (!label) return '';
    const lower = label.toLowerCase();
    if (lower.includes('sold')) return 'availability--soldout';
    if (lower.includes('available') || lower.includes('in stock')) return 'availability--available';
    return '';
  }

  function createDroplistCard(item, conversionRate) {
    const card = document.createElement('article');
    card.className = 'droplist-card';

    const image = document.createElement('img');
    image.className = 'droplist-card__image';
    image.src = item.image || '';
    image.alt = item.name;
    card.appendChild(image);

    const title = document.createElement('h3');
    title.className = 'droplist-card__title';
    title.textContent = item.name;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'droplist-card__meta';
    const category = document.createElement('span');
    category.className = `pill pill--${item.category}`;
    category.textContent = 'Upcoming droplist';
    meta.appendChild(category);

    const availability = document.createElement('span');
    availability.className = `availability ${availabilityClass(item.availability)}`;
    availability.textContent = item.availability || 'Unknown';
    meta.appendChild(availability);
    card.appendChild(meta);

    const fees = calculateFees(item.priceUsd);
    const totalCad = fees.totalUsd * conversionRate;

    const pricing = document.createElement('div');
    pricing.className = 'droplist-card__pricing';
    pricing.innerHTML = `
      <div><strong>${formatCurrency(item.priceUsd)}</strong> USD price</div>
      <div>Shipping: ${fees.shipping === 0 ? 'Free' : formatCurrency(fees.shipping)}</div>
      <div>Duty (15%): ${formatCurrency(fees.duty)}</div>
      <div><strong>${formatCurrency(totalCad, 'CAD')}</strong> CAD est.</div>
    `;
    card.appendChild(pricing);

    return card;
  }

  function renderDroplist(items, conversionRate) {
    droplistGrid.innerHTML = '';
    let subtotalUsd = 0;

    items.forEach((item) => {
      subtotalUsd += item.priceUsd;
      droplistGrid.appendChild(createDroplistCard(item, conversionRate));
    });

    const { shipping, duty, totalUsd } = calculateFees(subtotalUsd);
    const totalCad = totalUsd * conversionRate;

    droplistSummary.innerHTML = `
      <p class="droplist-summary__title">Cart totals (${items.length} items)</p>
      <div>Subtotal: ${formatCurrency(subtotalUsd)} USD</div>
      <div>Shipping: ${shipping === 0 ? 'Free' : formatCurrency(shipping)}</div>
      <div>Duty (15%): ${formatCurrency(duty)}</div>
      <div><strong>Total: ${formatCurrency(totalCad, 'CAD')}</strong></div>
      <div class="muted">Conversion rate applied: ${conversionRate.toFixed(4)}</div>
    `;
  }

  async function loadDroplist() {
    setStatus(droplistStatus, 'Loading droplist and live rates…');
    refreshDroplistButton.disabled = true;

    try {
      const conversionRate = await fetchConversionRate();
      const droplist = await fetchSupremeCommunityDroplists();

      if (!droplist.items?.length) {
        throw new Error('No droplist items found');
      }

      renderDroplist(droplist.items, conversionRate);
      setStatus(
        droplistStatus,
        `Droplist for ${formatDropDate(droplist.date)} (${droplist.season}) loaded. Source: ${droplist.sources.droplist}`,
        'success',
      );
    } catch (error) {
      console.error(error);
      droplistGrid.innerHTML = '';
      droplistSummary.innerHTML = `
        <p class="droplist-summary__title">Cart totals</p>
        <div>Droplist unavailable. Please try refreshing.</div>
      `;
      setStatus(droplistStatus, `Could not load droplist data right now. ${error.message}`, 'error');
    } finally {
      refreshDroplistButton.disabled = false;
    }
  }

  form.addEventListener('submit', handleCalculation);
  resetButton.addEventListener('click', resetForm);
  refreshDroplistButton.addEventListener('click', loadDroplist);

  loadDroplist();
}

document.addEventListener('DOMContentLoaded', () => {
  initSupremeCalculator().catch((error) => {
    console.error('Failed to initialize Supreme Calculator', error);
  });
});

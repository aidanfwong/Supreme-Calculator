const IMAGE_HOST = 'https://www.supremecommunity.com';

function normalizeImageUrl(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) return `${IMAGE_HOST}${src}`;
  return src;
}

function textFromSelectors(element, selectors) {
  for (const selector of selectors) {
    const node = element.querySelector(selector);
    if (node?.textContent?.trim()) {
      return node.textContent.trim();
    }
  }
  return '';
}

function findImage(element) {
  const image = element.querySelector('img');
  const source = image?.dataset?.src || image?.getAttribute('src');
  return normalizeImageUrl(source || '');
}

function parsePrice(rawText) {
  if (!rawText) return null;
  const clean = rawText.replace(/[,\s]/g, '');
  const match = clean.match(/\$?(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseHtmlDroplist(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const selectorCandidates = [
    '.catalog-item',
    '.masonry__item',
    '.card-block',
    '.view_detail_box',
    '.droplist-item',
  ];
  const nodes = doc.querySelectorAll(selectorCandidates.join(','));
  const items = [];

  nodes.forEach((node) => {
    const name = textFromSelectors(node, ['[itemprop="name"]', '.name', '.card__title', '.catalog-item__title', 'h3', 'h4']);
    const priceText = textFromSelectors(node, [
      '[data-price]',
      '.price',
      '.label-price',
      '.catalog-item__price',
      '.card__price',
      '.sc-price',
    ]);
    const priceUsd = parsePrice(priceText);
    const image = findImage(node);

    if (name && Number.isFinite(priceUsd)) {
      items.push({
        name,
        priceUsd,
        image,
        availability: '',
      });
    }
  });

  return items;
}

function formatDateSlug(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSeasonPath(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const isSpringSummer = month >= 1 && month <= 7; // Feb–Aug
  return `${isSpringSummer ? 'spring-summer' : 'fall-winter'}${year}`;
}

function getNextThursday(startDate = new Date()) {
  const date = new Date(startDate);
  const day = date.getDay();
  const distance = (4 - day + 7) % 7; // 4 = Thursday
  date.setDate(date.getDate() + distance);
  return date;
}

function buildDroplistUrl(date = new Date()) {
  const dropDate = getNextThursday(date);
  const season = getSeasonPath(dropDate);
  const dateSlug = formatDateSlug(dropDate);
  const base = 'https://www.supremecommunity.com';
  return {
    url: `${base}/season/${season}/droplist/${dateSlug}/`,
    date: dropDate,
    season,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    mode: 'cors',
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.text();
}

export async function fetchSupremeCommunityDroplists(date = new Date()) {
  const target = buildDroplistUrl(date);
  // Use a single, cache-friendly request while avoiding CORS issues by
  // routing through the lightweight jina mirror. This still fetches the
  // exact droplist page path without additional endpoint hits.
  const proxiedUrl = `https://r.jina.ai/${target.url}`;
  const html = await fetchText(proxiedUrl);
  const items = parseHtmlDroplist(html).map((item) => ({ ...item, category: 'upcoming' }));

  if (!items.length) {
    throw new Error(`Droplist data unavailable at ${target.url}`);
  }

  return {
    items,
    sources: {
      droplist: target.url,
    },
    date: target.date,
    season: target.season,
  };
}

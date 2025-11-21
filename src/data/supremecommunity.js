const PROXY_PREFIX = 'https://r.jina.ai/http://';
const SEASON_PATH = 'fall-winter2025';
const DROPLIST_BASE = `https://www.supremecommunity.com/season/${SEASON_PATH}`;
const DROPLIST_DEFAULT_SLUG = '2025-11-20';
const DROPLIST_DEFAULT_URL = `${DROPLIST_BASE}/droplist/${DROPLIST_DEFAULT_SLUG}/`;

const DROPLIST_INDEX_SOURCES = [
  `${DROPLIST_BASE}/droplist/`,
  `${PROXY_PREFIX}www.supremecommunity.com/season/${SEASON_PATH}/droplist/`,
];

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

function normalizeLink(href) {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `${IMAGE_HOST}${href}`;
  return `${DROPLIST_BASE}/${href.replace(/^\//, '')}`;
}

function parsePrice(rawText) {
  if (!rawText) return null;
  const clean = rawText.replace(/[,\s]/g, '');
  const match = clean.match(/\$?(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseJsonPayload(json) {
  if (!json) return [];
  const products = json.products || json.items || [];
  return products
    .map((item) => ({
      name: item.name || item.title,
      priceUsd: Number(item.price?.usd ?? item.price) || parsePrice(item.price_text || ''),
      image: normalizeImageUrl(item.image || item.img),
      availability: item.sold_out === false || item.available === true ? 'Available' : (item.sold_out ? 'Sold out' : ''),
    }))
    .filter((entry) => entry.name && Number.isFinite(entry.priceUsd));
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
    const priceText = textFromSelectors(node, ['[data-price]', '.price', '.label-price', '.catalog-item__price', '.card__price', '.sc-price']);
    const availabilityText = textFromSelectors(node, ['.sold_out', '.label', '.badge', '.status', '.availability']);
    const priceUsd = parsePrice(priceText);
    const image = findImage(node);

    if (name && Number.isFinite(priceUsd)) {
      items.push({
        name,
        priceUsd,
        image,
        availability: availabilityText || 'Unknown',
      });
    }
  });

  return items;
}

function parseDroplistLinks(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a[href*="/droplist/"]'));
  const links = anchors
    .map((anchor) => normalizeLink(anchor.getAttribute('href')))
    .filter((href) => href.includes(`/season/${SEASON_PATH}/droplist/`));

  return Array.from(new Set(links));
}

async function fetchJsonMaybe(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Response was not JSON');
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.text();
}

async function resolveCategory(sources) {
  const errors = [];

  for (const source of sources) {
    try {
      if (source.endsWith('.json')) {
        const jsonPayload = await fetchJsonMaybe(source);
        const items = parseJsonPayload(jsonPayload);
        if (items.length) {
          return { items, source };
        }
      }

      const html = await fetchText(source);
      const items = parseHtmlDroplist(html);
      if (items.length) {
        return { items, source };
      }
      errors.push(new Error('No items detected in response'));
    } catch (error) {
      errors.push(error);
    }
  }

  return { items: [], errors };
}

async function fetchLatestDroplistUrl() {
  return {
    url: DROPLIST_DEFAULT_URL,
    source: DROPLIST_DEFAULT_URL,
  };
}

async function fetchDroplistItems(url) {
  const cleanUrl = url.endsWith('/') ? url : `${url}/`;
  const detailSources = [
    cleanUrl,
    `${cleanUrl}json`,
    `${PROXY_PREFIX}${cleanUrl.replace(/^https?:\/\//, '')}`,
    `${PROXY_PREFIX}${cleanUrl.replace(/^https?:\/\//, '')}json`,
  ];

  const result = await resolveCategory(detailSources);
  return { ...result, source: result.source || url };
}

export async function fetchSupremeCommunityDroplists() {
  const latest = await fetchLatestDroplistUrl();
  const droplist = await fetchDroplistItems(latest.url);

  const items = droplist.items.map((item) => ({ ...item, category: 'upcoming' }));

  if (!items.length) {
    throw new Error('Droplist data unavailable');
  }

  return {
    items,
    sources: {
      index: latest.source,
      droplist: droplist.source,
    },
  };
}

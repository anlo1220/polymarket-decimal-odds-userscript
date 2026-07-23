// ==UserScript==
// @name         Polymarket 多制式賠率
// @namespace    https://polymarket.com/
// @version      1.4.0
// @description  在 Polymarket 全站交易控制元件顯示十進位、香港盤或美式賠率。
// @author       anlo1220
// @match        https://polymarket.com/*
// @updateURL    https://raw.githubusercontent.com/anlo1220/polymarket-decimal-odds-userscript/main/polymarket-decimal-odds.user.js
// @downloadURL  https://raw.githubusercontent.com/anlo1220/polymarket-decimal-odds-userscript/main/polymarket-decimal-odds.user.js
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const PRICE_PATTERN = /(\d+(?:\.\d+)?)\s*([¢%])/;
  const PRICE_NODE_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*([¢%])(?:\s*·?\s*(?:\d+(?:\.\d+)?x|HK\s+\d+(?:\.\d+)?|US\s+(?:[+-]\d+|—)))?\s*$/;
  const CONTROL_SELECTOR = 'button, a[href], [role="radio"]';
  const BADGE_ATTRIBUTE = 'data-pm-decimal-odds';
  const STYLE_ID = 'pm-decimal-odds-style';
  const FORMAT_KEY = 'pm-odds-format';
  const FORMAT_LABELS = {
    decimal: '十進位（1.72x）',
    'hong-kong': '香港盤（HK 0.72）',
    american: '美式（US ±139）',
  };
  const observedNumberFlows = new WeakSet();
  const badges = new WeakMap();
  const badgeSources = new WeakMap();

  const normalizeFormat = (format) => Object.hasOwn(FORMAT_LABELS, format) ? format : 'decimal';

  const formatOdds = (value, format = 'decimal') => {
    const cents = Number(value);
    if (!Number.isFinite(cents) || cents <= 0 || cents > 100) return null;

    const decimal = 100 / cents;
    if (format === 'hong-kong') return `HK ${(decimal - 1).toFixed(2)}`;
    if (format === 'american') {
      if (cents === 100) return 'US —';
      const odds = cents <= 50
        ? Math.round(((100 - cents) / cents) * 100)
        : -Math.round((cents / (100 - cents)) * 100);
      return `US ${odds > 0 ? '+' : ''}${odds}`;
    }
    return `${decimal.toFixed(2)}x`;
  };

  const oddsFromPriceText = (text, format = 'decimal') => {
    const price = String(text || '').replace(/\s+/g, ' ').trim().match(PRICE_PATTERN);
    return price ? formatOdds(price[1], normalizeFormat(format)) : null;
  };

  const isMarketHref = (href) => {
    const value = String(href || '');
    return /(?:^|\/)event\//.test(value)
      || /(?:^|\/)sports\/[^/?#]+\/[^/?#]+/.test(value)
      || /[?&](?:marketSlug|outcomeIndex)=/.test(value);
  };

  const isSupportedPrice = (price, tagName, href) => Boolean(price
    && (price[2] !== '%' || (tagName === 'A' && isMarketHref(href))));

  if (typeof document === 'undefined') {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };

    assert(formatOdds(58.2) === '1.72x', 'decimal 58.2¢');
    assert(formatOdds(41.9) === '2.39x', 'decimal 41.9¢');
    assert(formatOdds(50) === '2.00x', 'decimal 50¢');
    assert(formatOdds(100) === '1.00x', 'decimal 100¢');
    assert(formatOdds(58.2, 'hong-kong') === 'HK 0.72', 'Hong Kong 58.2¢');
    assert(formatOdds(41.9, 'hong-kong') === 'HK 1.39', 'Hong Kong 41.9¢');
    assert(formatOdds(50, 'hong-kong') === 'HK 1.00', 'Hong Kong 50¢');
    assert(formatOdds(100, 'hong-kong') === 'HK 0.00', 'Hong Kong 100¢');
    assert(formatOdds(58.2, 'american') === 'US -139', 'American 58.2¢');
    assert(formatOdds(41.9, 'american') === 'US +139', 'American 41.9¢');
    assert(formatOdds(50, 'american') === 'US +100', 'American 50¢');
    assert(formatOdds(100, 'american') === 'US —', 'American 100¢');
    assert(formatOdds(0) === null, 'zero price should be ignored');
    assert(formatOdds(58.2, 'unknown') === '1.72x', 'unknown format should use decimal');
    assert(oddsFromPriceText('58%') === '1.72x', 'percentage price');
    assert(oddsFromPriceText('買入 是') === null, 'missing price');
    assert(oddsFromPriceText('ENG 35.25¢', 'hong-kong') === 'HK 1.84', 'sports button');
    assert(PRICE_NODE_PATTERN.test('58.2¢ 1.72x'), 'decimal suffix');
    assert(PRICE_NODE_PATTERN.test('58.2¢ HK 0.72'), 'Hong Kong suffix');
    assert(PRICE_NODE_PATTERN.test('58.2¢ US -139'), 'American suffix');
    assert(normalizeFormat('hong-kong') === 'hong-kong', 'saved format');
    assert(normalizeFormat('bad') === 'decimal', 'invalid saved format');
    assert(isMarketHref('/zh-hant/event/world-cup-winner/team') === true, 'event link');
    assert(isMarketHref('/zh-hant/sports/world-cup/fifwc-eng-arg') === true, 'sports market link');
    assert(isMarketHref('/event/team?marketSlug=x') === true, 'market query link');
    assert(isMarketHref('/zh-hant/sports/world-cup') === false, 'sports category link');
    assert(isMarketHref('/rewards?apr=3.25') === false, 'non-market percentage link');
    assert(isSupportedPrice('58%'.match(PRICE_PATTERN), 'A', '/event/team') === true, 'market percentage');
    assert(isSupportedPrice('3.25%'.match(PRICE_PATTERN), 'A', '/rewards') === false, 'reward percentage');
    assert(isSupportedPrice('41.9¢'.match(PRICE_PATTERN), 'BUTTON', '') === true, 'cent button');
    console.log('Polymarket odds self-check passed (30 checks).');
    return;
  }

  let selectedFormat = normalizeFormat(GM_getValue(FORMAT_KEY, 'decimal'));

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `span[${BADGE_ATTRIBUTE}] { display:block; margin:1px 0 0; opacity:.78; font-size:9px; line-height:9px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:center; text-transform:none; pointer-events:none; }`;
    (document.head || document.documentElement).append(style);
  }

  const decodeNumberFlow = (numberFlow) => {
    const shadowRoot = numberFlow.shadowRoot;
    if (!shadowRoot) return numberFlow.textContent;
    return [...shadowRoot.querySelectorAll('.digit, .symbol')]
      .map((node) => node.classList.contains('digit')
        ? node.querySelector('.digit__num:not([inert])')?.textContent || ''
        : node.querySelector('.symbol__value:not([inert])')?.textContent || '')
      .join('');
  };

  const removeBadge = (source) => {
    const badge = badges.get(source);
    if (!badge) return;
    badge.remove();
    badgeSources.delete(badge);
    badges.delete(source);
  };

  const renderOdds = (source, priceText, container) => {
    const odds = oddsFromPriceText(priceText, selectedFormat);
    let badge = badges.get(source);

    if (!odds) {
      removeBadge(source);
      return;
    }

    if (!container) return;

    if (!badge?.isConnected) {
      if (badge) badgeSources.delete(badge);
      badge = document.createElement('span');
      badge.setAttribute(BADGE_ATTRIBUTE, '');
      badge.setAttribute('aria-hidden', 'true');
      container.append(badge);
      badges.set(source, badge);
      badgeSources.set(badge, source);
    }

    if (badge.textContent !== odds) badge.textContent = odds;
  };

  const updateNumberFlow = (numberFlow) => {
    renderOdds(numberFlow, decodeNumberFlow(numberFlow), numberFlow.parentElement);
  };

  const updateControl = (control) => {
    const liveSources = new Set();
    const supportsPrice = (price) => isSupportedPrice(price, control.tagName, control.getAttribute('href'));
    const textPriceNodes = [...control.querySelectorAll('*')]
      .filter((node) => {
        if (node.hasAttribute(BADGE_ATTRIBUTE) || node.closest('number-flow-react')) return false;
        const price = node.textContent.match(PRICE_NODE_PATTERN);
        if (!supportsPrice(price)) return false;
        return ![...node.children].some((child) =>
          !child.hasAttribute(BADGE_ATTRIBUTE) && PRICE_NODE_PATTERN.test(child.textContent));
      });

    if (!textPriceNodes.length) {
      const price = control.textContent.match(PRICE_NODE_PATTERN);
      if (supportsPrice(price)) textPriceNodes.push(control);
    }

    textPriceNodes.forEach((node) => {
      liveSources.add(node);
      renderOdds(node, node.textContent, node);
    });

    control.querySelectorAll('number-flow-react').forEach((numberFlow) => {
      const shadowRoot = numberFlow.shadowRoot;
      liveSources.add(numberFlow);
      updateNumberFlow(numberFlow);

      if (shadowRoot && !observedNumberFlows.has(numberFlow)) {
        observedNumberFlows.add(numberFlow);
        new MutationObserver(() => updateNumberFlow(numberFlow)).observe(shadowRoot, {
          attributes: true,
          attributeFilter: ['inert'],
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    });

    control.querySelectorAll(`[${BADGE_ATTRIBUTE}]`).forEach((badge) => {
      const source = badgeSources.get(badge);
      if (liveSources.has(source)) return;
      if (source) removeBadge(source);
      else badge.remove();
    });
  };

  const pendingControls = new Set();
  let updateQueued = false;
  const scheduleControl = (control) => {
    if (!control?.isConnected) return;
    pendingControls.add(control);
    if (!updateQueued) {
      updateQueued = true;
      requestAnimationFrame(() => {
        updateQueued = false;
        const controls = [...pendingControls];
        pendingControls.clear();
        controls.forEach((item) => item.isConnected && updateControl(item));
      });
    }
  };

  const scheduleNode = (node) => {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || element.closest(`[${BADGE_ATTRIBUTE}]`)) return;
    const control = element.matches(CONTROL_SELECTOR) ? element : element.closest(CONTROL_SELECTOR);
    if (control) scheduleControl(control);
    element.querySelectorAll?.(CONTROL_SELECTOR).forEach(scheduleControl);
  };

  Object.entries(FORMAT_LABELS).forEach(([format, label]) => {
    GM_registerMenuCommand(`賠率格式：${label}`, () => {
      selectedFormat = format;
      GM_setValue(FORMAT_KEY, format);
      document.querySelectorAll(CONTROL_SELECTOR).forEach(updateControl);
    });
  });

  document.querySelectorAll(CONTROL_SELECTOR).forEach(updateControl);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (mutation.type === 'childList' && changedNodes.length
        && changedNodes.every((node) => node.nodeType === 1 && node.hasAttribute(BADGE_ATTRIBUTE))) return;
      scheduleNode(mutation.target);
      mutation.addedNodes.forEach(scheduleNode);
    });
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ['href'],
    childList: true,
    subtree: true,
    characterData: true,
  });
})();

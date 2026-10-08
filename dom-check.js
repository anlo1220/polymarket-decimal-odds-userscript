// Run with Playwright CLI from this directory; see README. No test framework.
async (page) => {
  const results = [];
  const setup = async (html, saved = 'decimal') => {
    const test = await page.context().newPage();
    await test.setContent(html);
    await test.evaluate((saved) => {
      window.savedFormat = saved;
      window.commands = new Map();
      window.GM_getValue = () => savedFormat;
      window.GM_setValue = (_, value) => { savedFormat = value; };
      window.GM_registerMenuCommand = (label, callback, options = {}) => {
        const id = options.id ?? commands.size + 1;
        commands.set(id, {label, callback});
        return id;
      };
      window.controlScans = 0;
      const query = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function (selector) {
        if (selector === '*') controlScans++;
        return query.call(this, selector);
      };
    }, saved);
    return test;
  };
  const load = test => test.addScriptTag({path: 'polymarket-decimal-odds.user.js'});
  const expect = async (test, expected, name) => {
    await test.waitForFunction(expected => JSON.stringify(
      [...document.querySelectorAll('[data-pm-decimal-odds]')].map(b => b.textContent)
    ) === JSON.stringify(expected), expected, {timeout: 3000});
    results.push(name);
  };
  const check = (value, name) => {
    if (!value) throw new Error(name);
    results.push(name);
  };
  const attach = (test, selector, symbol = '¢') => test.evaluate(({selector, symbol}) => {
    document.querySelector(selector).attachShadow({mode:'open'}).innerHTML =
      '<span class="digit"><span class="digit__num">5</span></span>' +
      '<span class="digit"><span class="digit__num">0</span></span>' +
      `<span class="symbol"><span class="symbol__value">${symbol}</span></span>`;
  }, {selector, symbol});

  const basic = await setup('<button>Buy Yes 58.2¢</button><button>買入 否 41.9¢</button>' +
    '<button>买入 是 50¢</button><button><span>58</span><span>.2¢</span></button>' +
    '<a href="/event/test"><button><span>58.2¢</span></button></a>' +
    '<button>Reward 50¢</button><button>Buy Yes 0¢</button><button>Buy Yes</button>' +
    '<button>50%</button><a href="/rewards">50%</a>');
  try {
    await load(basic);
    await expect(basic, ['1.72x', '2.39x', '2.00x', '1.72x', '1.72x'], 'labels, split digits, nested controls, invalid prices');
    await basic.evaluate(() => commands.get(2).callback());
    await expect(basic, ['HK 0.72', 'HK 1.39', 'HK 1.00', 'HK 0.72', 'HK 0.72'], 'Hong Kong immediate refresh');
    await basic.evaluate(() => commands.get(3).callback());
    await expect(basic, ['US -139', 'US +139', 'US +100', 'US -139', 'US -139'], 'American immediate refresh');
    check(await basic.evaluate(() => savedFormat === 'american' && commands.size === 3
      && [...commands.values()].filter(c => c.label.startsWith('✓')).length === 1
      && commands.get(3).label.startsWith('✓')), 'saved format and current menu without duplicate entries');
    await basic.evaluate(() => {
      document.querySelector('button').firstChild.textContent = 'Buy Yes 100¢';
    });
    await expect(basic, ['US —', 'US +139', 'US +100', 'US -139', 'US -139'], 'live text price update');
    await basic.evaluate(() => { document.querySelector('button').firstChild.textContent = 'Buy Yes 0¢'; });
    await expect(basic, ['US +139', 'US +100', 'US -139', 'US -139'], 'invalid price removes stale badge');
    await basic.evaluate(() => {
      const button = document.createElement('button');
      button.innerHTML = '<span>25¢</span>';
      document.body.append(button);
      history.pushState({}, '', '#spa');
    });
    await expect(basic, ['US +139', 'US +100', 'US -139', 'US -139', 'US +300'], 'SPA added control');
    await basic.evaluate(() => commands.get(3).callback());
    await expect(basic, ['US +139', 'US +100', 'US -139', 'US -139', 'US +300'], 'repeat scan is idempotent');
  } finally { await basic.close(); }

  const flows = await setup('<button><number-flow-react></number-flow-react></button>' +
    '<a href="/event/test"><number-flow-react></number-flow-react></a>');
  try {
    await attach(flows, 'button number-flow-react', '%');
    await attach(flows, 'a number-flow-react', '%');
    await load(flows);
    await expect(flows, ['2.00x'], 'shadow percent shares market guard');
    await flows.evaluate(() => document.querySelector('a').setAttribute('href', '/rewards'));
    await expect(flows, [], 'href change clears shadow percentage');
    await flows.evaluate(() => {
      document.querySelector('button number-flow-react').shadowRoot.querySelector('.symbol__value').textContent = '¢';
    });
    await expect(flows, ['2.00x'], 'shadow symbol update');
    await flows.evaluate(() => {
      const digit = document.querySelector('button number-flow-react').shadowRoot.querySelector('.digit');
      digit.innerHTML = '<span class="digit__num" inert>5</span><span class="digit__num">2</span>';
    });
    await expect(flows, ['5.00x'], 'animated active digit update');
    await flows.evaluate(() => document.querySelector('button number-flow-react').remove());
    await expect(flows, [], 'removed flow clears sibling badge');
  } finally { await flows.close(); }

  const late = await setup('<button><number-flow-react>50¢</number-flow-react></button>');
  try {
    await load(late);
    await expect(late, ['2.00x'], 'light DOM fallback without duplicates');
    await attach(late, 'number-flow-react');
    await late.waitForTimeout(350);
    await late.evaluate(() => {
      document.querySelector('number-flow-react').shadowRoot.querySelector('.digit__num').textContent = '2';
    });
    await expect(late, ['5.00x'], 'late shadow attaches observer');
  } finally { await late.close(); }

  const emptyLate = await setup('<button><number-flow-react></number-flow-react></button>', 'invalid');
  try {
    await load(emptyLate);
    await attach(emptyLate, 'number-flow-react');
    await expect(emptyLate, ['2.00x'], 'initially empty late shadow and unknown saved format');
  } finally { await emptyLate.close(); }

  const scan = await setup('<main>' + '<button><span>50¢</span></button>'.repeat(500) + '</main>');
  try {
    await load(scan);
    await scan.waitForTimeout(100);
    await scan.evaluate(() => { controlScans = 0; document.body.append(document.createElement('aside')); });
    await scan.waitForTimeout(100);
    check(await scan.evaluate(() => controlScans === 0), 'unrelated body insert scans zero of 500 controls');
    await scan.evaluate(() => document.body.append(document.createTextNode('unrelated')));
    await scan.waitForTimeout(100);
    check(await scan.evaluate(() => controlScans === 0), 'unrelated body text insertion does not rescan controls');
    await scan.evaluate(() => { document.querySelector('button span').firstChild.textContent = '25¢'; });
    await scan.waitForTimeout(100);
    check(await scan.evaluate(() => controlScans === 1
      && document.querySelector('[data-pm-decimal-odds]').textContent === '4.00x'), 'price update scans only its control');
  } finally { await scan.close(); }

  const hover = await setup('<style>.absolute{position:absolute;top:50%;transform:translateY(-50%)}.opacity-0{opacity:0}</style>' +
    '<a href="/event/test" style="display:inline-flex;position:relative;width:40px;height:27px">' +
    '<span class="absolute">Yes</span><span class="absolute opacity-0 group-hover:opacity-100">50%</span></a>');
  try {
    await load(hover);
    await expect(hover, ['2.00x'], 'hover-only price has odds');
    check(await hover.evaluate(() => {
      const control = document.querySelector('a');
      const badge = document.querySelector('[data-pm-decimal-odds]');
      const rect = badge.getBoundingClientRect();
      const bounds = control.getBoundingClientRect();
      return badge.parentElement === control && getComputedStyle(badge.parentElement).opacity === '1'
        && bounds.width === 40 && bounds.height === 27 && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    }), 'hover odds visible inside unchanged button bounds');
    await hover.evaluate(() => { document.querySelector('.opacity-0').textContent = '0%'; });
    await expect(hover, [], 'invalid hover price clears badge');
    check(await hover.evaluate(() => !document.querySelector('a').hasAttribute('data-pm-odds-hover')), 'invalid hover price restores label layout');
  } finally { await hover.close(); }
  return {passed: results.length, checks: results};
}

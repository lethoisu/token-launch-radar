// Launch Radar's dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view with the model's own inputs and the protocol's
// farm plan, the live-token comparables and the model page. No network:
// every byte it shows is in data.js.
//
// The page recomputes a row's implied value from the snapshot figures the
// row carries (base, growth and age multipliers), so the page's code and
// the board's data are visibly the same arithmetic. It also regenerates
// each farm plan from the protocol's own record, the same rules main.ts
// used to write board.json.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  app.removeAttribute('aria-busy');

  var MODEL = DATA.model;

  // ------------------------------------------------------------ formatting
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(Math.round(n));
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------ the model, in the page
  // Implied value, recomputed here from the row's own figures.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.base_usd * row.growth_multiplier * row.age_multiplier));
  }
  function chainOf(row) { return row.chains.length > 0 ? row.chains[0] : 'its main chain'; }
  function gasPerTx(chain) {
    if (chain === 'Ethereum') return 18;
    if (chain === 'Solana' || chain === 'Base' || chain === 'Arbitrum') return 1;
    return 2;
  }
  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 250;
    if (row.tvl_usd >= 1000000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  // The farm plan, generated here from the protocol's own record.
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var gas = gasPerTx(chain);
    var hold = holdDaysFor(row.age_days);
    var raw = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(row, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $' + gas + ' of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ];
    return raw.map(function (s) {
      var text = s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.';
      if (text.length > 600) text = text.slice(0, 596) + '...';
      if (text.length < 20) text += ' Hold the position and check the protocol\'s own page.';
      return { text: s[0], cost: s[1], time: s[2], full: text };
    });
  }

  // ------------------------------------------------------------ state + routing
  var state = { tab: 'board', q: '', category: 'all', chain: 'all', verdict: 'all', watchlist: false, sort: 'implied', dir: -1, selected: null };
  function readHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var path = parts[0] || '';
    var query = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var eq = kv.split('=');
      query[decodeURIComponent(eq[0])] = decodeURIComponent(eq[1] || '');
    });
    state.tab = 'board';
    state.selected = null;
    if (path.indexOf('protocol/') === 0) { state.tab = 'detail'; state.selected = path.slice(9); }
    else if (path === 'live') state.tab = 'live';
    else if (path === 'model') state.tab = 'model';
    state.q = query.q || '';
    state.category = query.category || 'all';
    state.chain = query.chain || 'all';
    state.verdict = query.verdict || 'all';
    state.watchlist = query.watchlist === '1';
    state.sort = query.sort || 'implied';
    state.dir = query.dir === 'asc' ? 1 : -1;
  }
  function boardHash(extra) {
    var q = [];
    var s = Object.assign({}, state, extra || {});
    if (s.q) q.push('q=' + encodeURIComponent(s.q));
    if (s.category !== 'all') q.push('category=' + encodeURIComponent(s.category));
    if (s.chain !== 'all') q.push('chain=' + encodeURIComponent(s.chain));
    if (s.verdict !== 'all') q.push('verdict=' + encodeURIComponent(s.verdict));
    if (s.watchlist) q.push('watchlist=1');
    if (s.sort !== 'implied' || s.dir !== -1) { q.push('sort=' + s.sort); if (s.dir === 1) q.push('dir=asc'); }
    return '#/board' + (q.length ? '?' + q.join('&') : '');
  }

  // ------------------------------------------------------------ shared chrome
  var categories = [];
  DATA.rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category); });
  categories.sort();
  var chains = [];
  DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
  chains.sort();

  function header() {
    return '<header class="top">' +
      '<div class="eyebrow">Launch Radar &middot; model ' + esc(DATA.model_version) + ' &middot; snapshot ' + esc(DATA.as_of) + '</div>' +
      '<h1>Token launch radar<span class="dot">.</span></h1>' +
      '<p class="lede">Every protocol DefiLlama tracks that <b>records no token</b> and is not a wrapped, staked or bridged product of one that trades — ranked by what its launch would be worth, fitted from the ' + DATA.backtest.comps + ' live-token protocols in the same snapshot. A protocol on the list may still have a token its DefiLlama record does not carry: the board says <b>records no token</b>, never <b>has none</b>.</p>' +
      '</header>';
  }
  function statStrip() {
    var b = DATA.backtest;
    return '<div class="stats">' +
      stat('Board', String(DATA.board_size), DATA.watchlist_size + ' on the watchlist') +
      stat('Top implied', fmtUsd(DATA.rows[0].implied_value_usd), esc(DATA.rows[0].name)) +
      stat('Verdicts', DATA.verdicts.Farm + ' Farm', DATA.verdicts.Thin + ' Thin &middot; ' + DATA.verdicts.Skip + ' Skip') +
      stat('Curve slope', String(DATA.curve.slope), 'log mcap on log TVL') +
      stat('Backtest', (b.within_2x * 100).toFixed(0) + '% within 2&times;', 'median |log error| ' + b.median_abs_log_error) +
      stat('Set aside', String(DATA.excluded.length), 'wrapped / staked / versioned') +
      '</div>';
    function stat(k, v, s) {
      return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
    }
  }
  function tabs() {
    function tab(id, label, n) {
      return '<a href="#/' + id + '" class="' + (state.tab === id || (id === 'board' && state.tab === 'detail') ? 'on' : '') + '">' + label + (n !== undefined ? ' <span class="n">' + n + '</span>' : '') + '</a>';
    }
    return '<nav class="tabs">' + tab('board', 'Board', DATA.board_size) + tab('live', 'Live tokens', DATA.live_size) + tab('model', 'Model &amp; backtest') + '</nav>';
  }
  function footer() {
    return '<footer>Source: ' + esc(DATA.source) + '. Floor: ' + fmtUsd(DATA.floor_usd) + ' TVL. ' +
      'Implied values are fitted from this snapshot alone; they are order-of-magnitude guides, not prices. ' +
      'No protocol name is ever special-cased: the same function scores every row.</footer>';
  }

  // ------------------------------------------------------------ board
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name < b.name ? -1 : 1;
      if (d === 0) d = a.rank - b.rank;
      return d * dir;
    });
    return rows;
  }
  function sortArrow(key) {
    return state.sort === key ? (state.dir === -1 ? ' &darr;' : ' &uarr;') : '';
  }
  function renderBoard() {
    var rows = filteredRows();
    var html = header() + statStrip() + tabs();
    html += '<div class="filters">' +
      '<input type="search" id="f-q" placeholder="Search name or slug&hellip;" value="' + esc(state.q) + '" aria-label="Search">' +
      '<select id="f-cat" aria-label="Category"><option value="all">All categories</option>' +
      categories.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="f-chain" aria-label="Chain"><option value="all">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="f-verdict" aria-label="Verdict"><option value="all">All verdicts</option>' +
      ['Farm', 'Thin', 'Skip'].map(function (v) { return '<option value="' + v + '"' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" id="f-wl"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + DATA.board_size + ' rows</span></div>';
    if (rows.length === 0) {
      html += '<div class="empty">No protocol matches these filters. Clear the search or widen the filters.</div>';
    } else {
      html += '<table><thead><tr>' +
        '<th data-sort="implied">Rank' + sortArrow('implied') + '</th>' +
        '<th data-sort="name">Protocol' + sortArrow('name') + '</th>' +
        '<th>Category</th><th>Chains</th>' +
        '<th data-sort="tvl">TVL' + sortArrow('tvl') + '</th>' +
        '<th data-sort="growth">7d' + sortArrow('growth') + '</th>' +
        '<th data-sort="age">Age' + sortArrow('age') + '</th>' +
        '<th data-sort="implied">Implied value' + sortArrow('implied') + '</th><th>Verdict</th>' +
        '</tr></thead><tbody>';
      rows.forEach(function (r) {
        var growth = r.change_7d === null ? '<span class="muted">n/a</span>' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
        html += '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + '</td>' +
          '<td class="name"><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="wl">WATCHLIST</span>' : '') + '<span class="sub">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td class="small">' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
          '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="num">' + growth + '</td>' +
          '<td class="num">' + fmtAge(r.age_days) + '</td>' +
          '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b><span class="range">' + fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) + '</span></td>' +
          '<td><span class="pill ' + r.verdict + '">' + r.verdict + '</span></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '<p class="note">Click a row for its detail view: the model\'s working, the farm plan and the expected value. Implied values are ranked highest first; the range under each is the fit\'s own interquartile spread.</p>' + footer();
    app.innerHTML = html;
    bindBoard();
  }
  function bindBoard() {
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { location.hash = boardHash({ q: q.value }); });
    var cat = document.getElementById('f-cat');
    if (cat) cat.addEventListener('change', function () { location.hash = boardHash({ category: cat.value }); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { location.hash = boardHash({ chain: ch.value }); });
    var ve = document.getElementById('f-verdict');
    if (ve) ve.addEventListener('change', function () { location.hash = boardHash({ verdict: ve.value }); });
    var wl = document.getElementById('f-wl');
    if (wl) wl.addEventListener('change', function () { location.hash = boardHash({ watchlist: wl.checked }); });
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        var dir = state.sort === key ? -state.dir : -1;
        location.hash = boardHash({ sort: key, dir: dir });
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/protocol/' + tr.getAttribute('data-slug'); });
    });
  }

  // ------------------------------------------------------------ detail
  function renderDetail() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    var html = header() + statStrip() + tabs();
    if (!row) {
      html += '<div class="empty">No protocol on this board has the slug &ldquo;' + esc(state.selected || '') + '&rdquo;.</div>' + footer();
      app.innerHTML = html;
      return;
    }
    var check = impliedOf(row);
    var steps = farmSteps(row);
    var verdictNote = row.verdict === 'Farm'
      ? 'The illustrative farmer\'s share clears the $300 bar: worth farming first.'
      : row.verdict === 'Thin'
        ? 'The illustrative farmer\'s share clears $50 but not $300: farm only if you are already on this chain.'
        : 'The illustrative farmer\'s share does not clear $50: the board says skip, and the cost of farming outweighs it.';
    html += '<div class="detail">' +
      '<a class="back" href="' + boardHash() + '">&larr; Back to the board</a>' +
      '<h2>' + esc(row.name) + ' <span class="pill ' + row.verdict + '">' + row.verdict + '</span></h2>' +
      '<div class="meta">Rank #' + row.rank + ' of ' + DATA.board_size + ' &middot; ' + esc(row.slug) + ' &middot; ' + esc(row.category || 'no category') + ' &middot; ' + esc(row.chains.join(', ') || 'no chain') + (row.watchlist ? ' &middot; <b style="color:var(--green)">on the watchlist</b>' : '') + ' &middot; listed ' + (row.listed_at || 'unknown') + '</div>' +
      '<div class="grid2">' +
      '<div class="card"><h3>The value</h3><dl class="kv">' +
      '<dt>TVL</dt><dd>' + fmtUsd(row.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + fmtPct(row.change_7d) + '</dd>' +
      '<dt>Age with no token</dt><dd>' + fmtAge(row.age_days) + '</dd>' +
      '<dt>Implied value</dt><dd><b>' + fmtUsd(row.implied_value_usd) + '</b></dd>' +
      '<dt>Interval (fit&rsquo;s IQR)</dt><dd>' + fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) + '</dd>' +
      '<dt>Expected farmer value</dt><dd>' + fmtUsd(row.expected_value_usd) + '</dd>' +
      '<dt>Farm cost</dt><dd>' + fmtUsd(row.farm_cost_usd) + '</dd>' +
      '</dl><p class="note">' + verdictNote + '</p></div>' +
      '<div class="card"><h3>How the number is made</h3><dl class="kv">' +
      '<dt>Curve value</dt><dd>' + fmtUsd(row.base_usd) + '</dd>' +
      '<dt>Category adjustment</dt><dd>' + (row.category_adjustment >= 0 ? '+' : '') + row.category_adjustment.toFixed(2) + ' log pts' + (row.category_comps ? ' (' + row.category_comps + ' comps)' : ' (no category comps)') + '</dd>' +
      '<dt>Growth multiplier</dt><dd>&times;' + row.growth_multiplier.toFixed(4) + '</dd>' +
      '<dt>Age multiplier</dt><dd>&times;' + row.age_multiplier.toFixed(2) + '</dd>' +
      '<dt>Page recompute</dt><dd>' + fmtUsd(check) + (check === row.implied_value_usd ? ' &check; matches' : ' &ne; board') + '</dd>' +
      '</dl><p class="note">Curve: log(mcap) = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' &middot; log(TVL), fitted to ' + DATA.backtest.comps + ' live-token protocols. See the Model page for the backtest.</p></div>' +
      '</div>' +
      '<section class="block"><h2>Farm plan</h2><p>Concrete steps with what they cost and how long they take. Capital $' + capitalFor(row) + ' plus about $' + (row.farm_cost_usd - capitalFor(row)) + ' of gas on ' + esc(chainOf(row)) + '; total farm cost ' + fmtUsd(row.farm_cost_usd) + '.</p>' +
      '<ol class="steps">' + steps.map(function (s) {
        return '<li>' + esc(s.text) + '<br><span class="cost">Cost: ' + esc(s.cost) + '. Time: ' + esc(s.time) + '.</span></li>';
      }).join('') + '</ol></section>' +
      '<div class="callout">Never pay to claim, and claim only from the link the protocol itself publishes. ' +
      'A launch is not promised: this protocol records no token, which is not proof it will ever issue one.</div>' +
      '</div>' + footer();
    app.innerHTML = html;
  }

  // ------------------------------------------------------------ live tokens
  function renderLive() {
    var html = header() + statStrip() + tabs();
    html += '<section class="block"><h2>Live tokens — the comparables</h2>' +
      '<p>The ' + DATA.live_size + ' largest live-token protocols by market cap, with the market\'s own values. ' +
      'These are the comparables the curve is fitted to; they are <b>not</b> on the board, because their token already trades. ' +
      'The ratio column is market cap over TVL — the raw material the model learns from.</p>' +
      '<table class="plain"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th><th>7d</th></tr></thead><tbody>';
    DATA.live.forEach(function (p) {
      html += '<tr><td class="name"><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.ratio === null ? 'n/a' : p.ratio.toFixed(2) + '&times;') + '</td>' +
        '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
    });
    html += '</tbody></table></section>' + footer();
    app.innerHTML = html;
  }

  // ------------------------------------------------------------ model page
  function renderModel() {
    var b = DATA.backtest;
    var m = DATA.model;
    var html = header() + statStrip() + tabs();
    html += '<section class="block"><h2>The model, with the working shown</h2>' +
      '<p>One formula scores every row; no protocol name is ever special-cased. The curve is fitted at run time from the live-token protocols in this snapshot, so the numbers track the input.</p>' +
      '<div class="formula">log(mcap) = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log(TVL)   [fitted to ' + b.comps + ' live-token comps]\n' +
      'adjustment(category) = median residual of the category, shrunk by n/(n+' + m.shrink_k + '), min ' + m.min_category_comps + ' comps\n' +
      'growth  = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '\n' +
      'age     = 1.10 under ' + m.age_young_days + ' days, 1.00 to ' + m.age_old_days + ' days, 0.90 beyond, 1.00 unknown\n' +
      'implied = max(1, round(exp(log curve + adjustment) x growth x age))</div>' +
      '<p>Why the age factor falls: among the live comps, the median market-cap-to-TVL ratio is lower for older protocols, so a protocol that has run for years with no token is discounted, not rewarded, for its age. The growth factor is deliberately small (weight ' + m.growth_weight + '): a single week\'s TVL move is a weak signal.</p></section>' +
      '<section class="block"><h2>Backtest — five-fold, refitted every fold</h2>' +
      '<p>Each fold hides a fifth of the ' + b.comps + ' live-token comparables, refits the curve and the category adjustments on the rest, and predicts the hidden fifth\'s market caps. The error is honest, and it is large: <b>TVL explains only part of a launch\'s value</b>. That is why every implied value carries the fit\'s own interquartile interval, and why the board is a radar — a way to look — not a price.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">Median |log error|</div><div class="v">' + b.median_abs_log_error + '</div><div class="s">across ' + b.comps + ' comps</div></div>' +
      '<div class="stat"><div class="k">Within 2&times;</div><div class="v">' + (b.within_2x * 100).toFixed(1) + '%</div><div class="s">prediction vs market cap</div></div>' +
      '<div class="stat"><div class="k">Within 3&times;</div><div class="v">' + (b.within_3x * 100).toFixed(1) + '%</div><div class="s">prediction vs market cap</div></div>' +
      '<div class="stat"><div class="k">Residual spread</div><div class="v">&plusmn;' + DATA.curve.residual_sd + '</div><div class="s">log points, 1 SD</div></div>' +
      '</div></section>' +
      '<section class="block"><h2>Verdicts — netted, with the assumptions stated</h2>' +
      '<p>Expected farmer value = implied value &times; ' + m.airdrop_pool_share + ' (the share of supply an airdrop pool might hold) &times; ' + m.farmer_share + ' (one farmer in 5,000). ' +
      '<b>Farm</b> when it clears $' + m.farm_threshold_usd + ', <b>Thin</b> when it clears $' + m.thin_threshold_usd + ', else <b>Skip</b>. ' +
      'Both shares are assumptions, not data; the farm cost beside each row is the protocol\'s own capital and gas, so a reader can re-net it with their own shares.</p></section>' +
      '<section class="block"><h2>Comparables by category</h2>' +
      '<table class="plain"><thead><tr><th>Category</th><th>Comps</th><th>Median mcap/TVL</th><th>Curve adjustment (log pts)</th></tr></thead><tbody>' +
      DATA.categories.map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comps + '</td><td class="num">' + c.median_ratio.toFixed(3) + '&times;</td><td class="num">' + (c.adjustment >= 0 ? '+' : '') + c.adjustment.toFixed(2) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">Categories with fewer than ' + m.min_category_comps + ' comps get no adjustment and use the global curve.</p></section>' +
      '<section class="block"><h2>Set aside — ' + DATA.excluded.length + ' pre-token protocols, not ranked</h2>' +
      '<p>These record no token, but the watchlist rule sets them aside: a wrapped, staked or bridged product of a token that already trades is not a token that does not exist yet. WBTC is Bitcoin on Ethereum; Binance staked ETH is ETH in Binance\'s staking product. Showing them, with the reason each was set aside, is part of the radar.</p>' +
      '<table class="plain"><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Reason</th></tr></thead><tbody>' +
      DATA.excluded.map(function (p) {
        return '<tr><td class="name"><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td><td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="small">' + esc(p.reason) + '</td></tr>';
      }).join('') + '</tbody></table></section>' + footer();
    app.innerHTML = html;
  }

  // ------------------------------------------------------------ boot
  function render() {
    readHash();
    if (state.tab === 'detail') renderDetail();
    else if (state.tab === 'live') renderLive();
    else if (state.tab === 'model') renderModel();
    else renderBoard();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);
  // Exposed for the entry's own verification: the page's model, callable from a test.
  window.__radar = { data: DATA, impliedOf: impliedOf, farmSteps: farmSteps, filteredRows: function () { readHash(); return filteredRows(); } };
  render();
})();

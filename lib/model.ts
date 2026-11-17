// Launch Radar's model: one sealed DefiLlama snapshot in, one ranked board out.
//
// The board ranks only genuine launch candidates: protocols that record no
// token and are not a wrapped, staked or bridged product of a token that
// already trades. The snapshot's watchlist rule is applied in full (see
// exclusionReason), so the board never ranks WBTC, a staked-ETH product or
// a versioned pool as a token that does not exist yet. Every protocol the
// watchlist names is on the board; the rest of the board is the candidates
// below the watchlist floor.
//
// Implied value is fitted, never asserted. The live-token protocols in the
// same snapshot are the comparables: a log-log curve of market cap on TVL
// is fitted to all of them, then each category's median residual shifts the
// curve (shrunk toward zero when the category has few comparables), and two
// small factors adjust for the protocol's own seven-day growth and for how
// long it has run with no token. The whole fit is recomputed from the
// snapshot at every run, so the numbers track the input, not a hardcoded
// list of names. A five-fold backtest over the same comparables is run at
// every run too, and its honest error is published with the board: TVL
// explains only part of a launch's value, and the dashboard says so.
//
//   log(mcap) = intercept + slope * log(tvl)          (fitted, all live comps)
//   adj(cat)  = median residual of the category's comps, shrunk by n/(n+3)
//   growth    = 1 + clamp(change_7d, -40, 60) / 100 * 0.25
//   age       = 1.10 under 180 days, 1.00 to 730 days, 0.90 beyond, 1.00 unknown
//   implied   = max(1, round(exp(log curve + adj) * growth * age))
//   interval  = implied * exp(residual quartiles)     (the fit's own spread)
//
// The farm plan is costed from the protocol's own record: capital by TVL
// tier, gas by its first chain, six steps each with a cost and a time. The
// verdict nets an illustrative farmer's share against that cost:
// expected = implied * 0.05 (airdrop pool share) * 0.0002 (one farmer in
// 5,000); Farm when it clears $300, Thin when it clears $50, else Skip.
// Those two shares are assumptions, stated on the dashboard, not data.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's fixed constants. The curve's intercept and slope are fitted, not fixed. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_young_days: number;
  age_old_days: number;
  age_young_factor: number;
  age_mid_factor: number;
  age_old_factor: number;
  age_unknown_factor: number;
  shrink_k: number;
  min_category_comps: number;
  airdrop_pool_share: number;
  farmer_share: number;
  farm_threshold_usd: number;
  thin_threshold_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.25,
  growth_floor: -40,
  growth_cap: 60,
  age_young_days: 180,
  age_old_days: 730,
  age_young_factor: 1.1,
  age_mid_factor: 1.0,
  age_old_factor: 0.9,
  age_unknown_factor: 1.0,
  shrink_k: 3,
  min_category_comps: 3,
  airdrop_pool_share: 0.05,
  farmer_share: 0.0002,
  farm_threshold_usd: 300,
  thin_threshold_usd: 50,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
  expected_value_usd: number;
  farm_cost_usd: number;
  model: {
    base_usd: number;
    category: string | null;
    category_adjustment: number;
    category_comps: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
  expected_value_usd: number;
  farm_cost_usd: number;
  base_usd: number;
  category_adjustment: number;
  category_comps: number;
  growth_multiplier: number;
  age_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** One category's comparables, as the dashboard's model page shows them. */
export interface CategoryComp {
  category: string;
  comps: number;
  median_ratio: number;
  adjustment: number;
}

/** A protocol the board set aside, with the rule that set it aside. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** The backtest: five-fold cross-validation over the live comparables. */
export interface Backtest {
  folds: number;
  comps: number;
  median_abs_log_error: number;
  within_2x: number;
  within_3x: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  curve: { intercept: number; slope: number; residual_sd: number; residual_q25: number; residual_q75: number };
  backtest: Backtest;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  verdicts: { Farm: number; Thin: number; Skip: number };
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryComp[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a sorted-or-not array of finite numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product by definition. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names: a protocol beginning with one is the exchange's own product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Why a pre-token protocol is not a launch candidate, or null when it is
 * one. This is the snapshot's own watchlist rule, applied to every
 * protocol, not only to the ones above the floor.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'records a token that already trades';
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category} is a wrapped, staked or bridged product`;
  if (VERSIONED.test(p.name)) return 'name ends in a version marker (a pool of another protocol)';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'name marks it a wrapped or staked product';
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return `name begins with exchange ${prefix}`;
  }
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and not excluded. */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** The live-token comparables: a token that trades, a market cap, and not an exchange. */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The fitted log-log curve and the spread of its residuals. */
export interface Curve {
  intercept: number;
  slope: number;
  residual_sd: number;
  residual_q25: number;
  residual_q75: number;
}

/** Ordinary least squares of log(mcap) on log(tvl) over the comparables. */
export function fitCurve(comps: SnapshotProtocol[]): Curve {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const residuals = xs.map((x, i) => ys[i]! - (intercept + slope * x));
  const sd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);
  const sorted = [...residuals].sort((a, b) => a - b);
  const q = (f: number): number => {
    const at = (sorted.length - 1) * f;
    const lo = Math.floor(at);
    const hi = Math.ceil(at);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
  };
  return { intercept: round4(intercept), slope: round4(slope), residual_sd: round3(sd), residual_q25: round3(q(0.25)), residual_q75: round3(q(0.75)) };
}

/** A category's median residual against the curve, shrunk toward zero. */
export function categoryAdjustments(comps: SnapshotProtocol[], curve: Curve, model: ModelConstants = MODEL): Map<string, { adjustment: number; comps: number }> {
  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    const residual = Math.log(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log(p.tvl_usd));
    const list = byCategory.get(p.category ?? 'Unknown') ?? [];
    list.push(residual);
    byCategory.set(p.category ?? 'Unknown', list);
  }
  const out = new Map<string, { adjustment: number; comps: number }>();
  for (const [category, residuals] of byCategory) {
    if (residuals.length < model.min_category_comps) continue;
    const adj = (residuals.length * median(residuals)) / (residuals.length + model.shrink_k);
    out.set(category, { adjustment: round4(adj), comps: residuals.length });
  }
  return out;
}

/** The growth factor from a protocol's seven-day TVL change. */
export function growthMultiplier(change7d: number | null, model: ModelConstants = MODEL): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(change7d, 0)));
  return { pct: round4(pct), mult: round4(1 + (pct / 100) * model.growth_weight) };
}

/** The age factor from how long a protocol has run with no token. */
export function ageMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  if (age === null) return model.age_unknown_factor;
  if (age < model.age_young_days) return model.age_young_factor;
  if (age <= model.age_old_days) return model.age_mid_factor;
  return model.age_old_factor;
}

/** The fitted value and its interval for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  curve: Curve,
  adjustments: Map<string, { adjustment: number; comps: number }>,
  model: ModelConstants = MODEL,
): { implied: number; low: number; high: number; base: number; adjustment: number; comps: number; growthPct: number; growthMult: number; ageMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { pct, mult: growthMult } = growthMultiplier(protocol.change_7d, model);
  const ageMult = ageMultiplier(age, model);
  const adj = protocol.category !== null ? adjustments.get(protocol.category) : undefined;
  const adjustment = adj === undefined ? 0 : adj.adjustment;
  const comps = adj === undefined ? 0 : adj.comps;
  const base = Math.exp(curve.intercept + curve.slope * Math.log(protocol.tvl_usd) + adjustment);
  const implied = Math.max(1, Math.round(base * growthMult * ageMult));
  const low = Math.max(1, Math.round(implied * Math.exp(curve.residual_q25)));
  const high = Math.max(low, Math.round(implied * Math.exp(curve.residual_q75)));
  // `base` stays unrounded: the page recomputes implied from it, so the
  // page's arithmetic and the board's must agree to the dollar.
  return { implied, low, high, base, adjustment, comps, growthPct: pct, growthMult, ageMult, age };
}

/** Five-fold cross-validation over the live comparables, refitting each fold. */
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): Backtest {
  const comps = liveComps(snapshot);
  const errors: number[] = [];
  let within2 = 0;
  let within3 = 0;
  for (let fold = 0; fold < 5; fold++) {
    const train = comps.filter((_, i) => i % 5 !== fold);
    const test = comps.filter((_, i) => i % 5 === fold);
    const curve = fitCurve(train);
    const adjustments = categoryAdjustments(train, curve, model);
    for (const p of test) {
      const v = impliedValue(p, snapshot.as_of, curve, adjustments, model);
      const err = Math.abs(Math.log(v.implied / p.mcap_usd!));
      errors.push(err);
      if (err < Math.log(2)) within2++;
      if (err < Math.log(3)) within3++;
    }
  }
  return {
    folds: 5,
    comps: comps.length,
    median_abs_log_error: round3(median(errors)),
    within_2x: round3(within2 / errors.length),
    within_3x: round3(within3 / errors.length),
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one transaction on a chain, in whole dollars (a stated estimate). */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 18;
  if (chain === 'Solana' || chain === 'Base' || chain === 'Arbitrum') return 1;
  return 2;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The whole farm's cost: capital plus six transactions of gas. */
export function farmCost(p: SnapshotProtocol): number {
  return capitalFor(p) + 6 * gasPerTx(chainOf(p));
}

/** The illustrative value one farmer may expect, from the implied value. */
export function expectedValue(implied: number, model: ModelConstants = MODEL): number {
  return Math.round(implied * model.airdrop_pool_share * model.farmer_share);
}

/** Farm, Thin or Skip, from the expected value against the farm's cost. */
export function verdictFor(expected: number, model: ModelConstants = MODEL): 'Farm' | 'Thin' | 'Skip' {
  if (expected >= model.farm_threshold_usd) return 'Farm';
  if (expected >= model.thin_threshold_usd) return 'Thin';
  return 'Skip';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasPerTx(chain);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return liveComps(snapshot)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = liveComps(snapshot);
  const curve = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, curve, model);
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter((p) => isLaunchCandidate(p));
  const scored = candidates.map((p) => {
    const v = impliedValue(p, snapshot.as_of, curve, adjustments, model);
    const cost = farmCost(p);
    const expected = expectedValue(v.implied, model);
    return { p, v, cost, expected, verdict: verdictFor(expected, model) };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    verdict: s.verdict,
    expected_value_usd: s.expected,
    farm_cost_usd: s.cost,
    model: {
      base_usd: s.v.base,
      category: s.p.category,
      category_adjustment: s.v.adjustment,
      category_comps: s.v.comps,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      age_multiplier: s.v.ageMult,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    verdict: row.verdict,
    expected_value_usd: row.expected_value_usd,
    farm_cost_usd: row.farm_cost_usd,
    base_usd: row.model.base_usd,
    category_adjustment: row.model.category_adjustment,
    category_comps: row.model.category_comps,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = liveComps(snapshot);
  const curve = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, curve, model);
  const live = liveRows(snapshot);
  const verdicts = { Farm: 0, Thin: 0, Skip: 0 };
  for (const r of board) verdicts[r.verdict]++;
  const byCategory = new Map<string, { ratios: number[]; adjustment: number; comps: number }>();
  for (const p of comps) {
    const entry = byCategory.get(p.category ?? 'Unknown') ?? { ratios: [], adjustment: 0, comps: 0 };
    entry.ratios.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category ?? 'Unknown', entry);
  }
  const categories: CategoryComp[] = [...byCategory.entries()]
    .map(([category, e]) => ({
      category,
      comps: e.ratios.length,
      median_ratio: round4(median(e.ratios)),
      adjustment: adjustments.get(category)?.adjustment ?? 0,
    }))
    .sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1));
  const excluded: ExcludedRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !isLaunchCandidate(p))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p)! }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    curve,
    backtest: backtest(snapshot, model),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    verdicts,
    rows: board.map(radarRow),
    live,
    categories,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

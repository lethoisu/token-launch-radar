# Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar built for make.fun's
[Build the best token launch radar](https://make.fun/bounty/token-radar-01)
bounty. It reads a sealed snapshot of every protocol DefiLlama tracks,
works out which ones still record no token and are not a wrapped or staked
product of one that trades, and ranks them by what their launch would be
worth — then hands in a web dashboard that shows the board, a detail view
for each protocol and the steps to farm it.

## The board

- **198 launch candidates**, every one of the snapshot's 40 watchlist
  protocols included, ranked by implied value.
- **144 pre-token protocols set aside** with the reason each was set
  aside (wrapped, staked, bridged, versioned, or an exchange's own
  product) — shown on the Model page, not hidden.
- Verdicts: **10 Farm, 134 Thin, 54 Skip**, netted from an illustrative
  farmer's share against the farm's own cost.

## The model (radar-2)

The implied value is fitted, never asserted. A log-log curve of market
cap on TVL is fitted to the 119 live-token protocols in the same
snapshot, each category's median residual shifts the curve (shrunk
toward zero when the category has few comparables), and two small
factors adjust for the protocol's seven-day growth and for how long it
has run with no token. The whole fit is recomputed from the snapshot at
every run.

A five-fold backtest over the same comparables is run at every run and
published on the dashboard: median |log error| 1.187, 32.8% of
predictions within 2× of the market cap, 44.5% within 3×. TVL explains
only part of a launch's value — that is why every implied value carries
the fit's own interquartile interval, and why the board is a radar, not
a price.

## Run it

Node.js 22.18 or later, standard library only, no network. The program
reads the sealed snapshot (mounted at `/input` by the grader) and writes
`/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

That writes `board.json` (the ranked board), `data.js` (the dashboard's
dataset), `dashboard/` (the static page), `screenshots/` and
`dossier.json`. The run is fully deterministic: the same snapshot always
writes the same bytes.

To look at the dashboard, serve the output directory and open
`dashboard/index.html` — it renders with no network:

```sh
npx serve out
```

## Layout

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the model: candidates, the fitted curve, the backtest, farm plans.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`).
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `screenshots/` — the board, a protocol's detail view and a filtered view.

## License

MIT — see [LICENSE](LICENSE).

# AUXIDIEN INDEX METHODOLOGY

**Document Version**: 1.1
**Effective Date**: May 2026
**Index Administrator**: Auxidien Foundation

---

## 1. INDEX OVERVIEW

### 1.1 Description

The Auxidien Index (AUXI) is a precious metals price index. It represents a composite of the four most actively traded precious metals in global spot markets, combined into a single USD/oz figure that is published on-chain.

### 1.2 Index Objective

To provide a single, transparent metric that reflects the aggregate USD price movement of precious metals, using committee-governed weights that approximate the relative economic significance of each metal.

### 1.3 Index Type

- **Category**: Commodity Index
- **Weighting Method**: Curated reference weights, stored on-chain and governed by the Index Committee (`ADMIN_ROLE` on the oracle multisig)
- **Calculation Frequency**: Hourly publish cadence (configurable; minimum interval and per-tick cap enforced on-chain)
- **Base Currency**: USD

---

## 2. INDEX COMPOSITION

### 2.1 Constituent Metals

| Metal | Symbol | Initial Weight (bps) |
|-------|--------|----------------------|
| Gold | XAUUSD | 5500 (55.00%) |
| Silver | XAGUSD | 2000 (20.00%) |
| Platinum | XPTUSD | 1700 (17.00%) |
| Palladium | XPDUSD |  800 (8.00%) |

Weights sum to exactly 10000 bps (100%) and are stored on the `AuxidienOracle` contract. They may only be changed by `ADMIN_ROLE` (multisig) and every change emits a `WeightsChanged` event. The off-chain watcher reads `getWeights()` before each publish, so once a weights change lands on-chain the next composite reflects it without a code release.

### 2.2 Data Sources

**Current primary source**: [GoldAPI](https://www.goldapi.io) (XAU/XAG/XPT/XPD spot USD/oz quotes).

**Source policy**:

- The watcher caches the most recent successful quote per metal. If a single metal request fails, the cached value is used and the failure is logged.
- An off-chain `ORACLE_MAX_STEP_BPS` (default 3%) clamps how far the composite price can move per tick, regardless of input. The on-chain `maxPriceChangeRate` (default 10%) is an additional, contract-enforced ceiling.
- Additional independent feeds (LBMA reference, CME spot, alternative aggregators) are on the integration roadmap; once added they will be combined into a single composite quote per metal via the committee-approved methodology and this section will be revised.

---

## 3. CALCULATION METHODOLOGY

### 3.1 Index Formula

The AUXI index value is calculated using the following formula, in basis points:

```
AUXI = Σ(w_i × P_i) / 10000

Where:
  w_i = Weight of metal i, in basis points (sum = 10000)
  P_i = Spot price of metal i (USD/oz)
```

### 3.2 Weight Determination

Weights are governance parameters, not market-derived statistics. The Index Committee sets the initial values published in Section 2.1 and may revise them through the on-chain `setWeights(uint16,uint16,uint16,uint16)` admin call. The contract validates that the four basis-point values sum to exactly `WEIGHT_DENOMINATOR = 10000` and emits `WeightsChanged` on every successful update.

The committee considers, among other factors:

- Long-term relative spot market depth and turnover (institutional and OTC)
- Industrial vs. monetary demand drivers
- Liquidity available for each metal on regulated venues
- Concentration risk in any single constituent

Weight changes are reviewed on the schedule defined in Section 4.2.

### 3.3 Calculation Example

**Initial committee-set weights (Section 2.1)**:

| Metal | Weight (bps) |
|-------|--------------|
| Gold | 5500 |
| Silver | 2000 |
| Platinum | 1700 |
| Palladium | 800 |

**Sample spot prices**:

| Metal | Price (USD/oz) |
|-------|----------------|
| Gold | 2,350.00 |
| Silver | 27.85 |
| Platinum | 985.25 |
| Palladium | 1,050.00 |

**Index value**:
```
AUXI = (5500·2350 + 2000·27.85 + 1700·985.25 + 800·1050) / 10000
     = (12,925,000 + 55,700 + 1,674,925 + 840,000) / 10000
     = 15,495,625 / 10000
     = 1,549.56 USD/oz
```

---

## 4. INDEX GOVERNANCE

### 4.1 Index Committee

The Auxidien Index Committee oversees:
- Methodology reviews
- Constituent changes
- Data source validation
- Calculation accuracy

### 4.2 Review Schedule

| Review Type | Frequency |
|-------------|-----------|
| Methodology Review | Annual |
| Data Source Audit | Quarterly |
| Calculation Verification | Continuous |

---

## 5. DATA QUALITY

### 5.1 Data Validation

**Price Validation**:
- Maximum single-period change: 10%
- Price staleness threshold: 15 minutes
- Outlier detection via Z-score (±3σ)

**Volume Validation**:
- Minimum volume threshold per metal
- Volume spike detection
- Cross-reference with multiple sources

### 5.2 Error Handling

| Scenario | Action |
|----------|--------|
| Missing price data | Use last valid price |
| Stale data (>15 min) | Flag as stale, use backup source |
| Anomalous price | Apply median filter |
| Source unavailable | Switch to backup source |

---

## 6. ON-CHAIN IMPLEMENTATION

### 6.1 Oracle Contract

- **Network**: BNB Smart Chain
- **Price Format**: USD/oz × 10^6 (6 decimals)
- **Publish cadence**: Hourly by default; configurable via the watcher process. The contract enforces a `minUpdateInterval` floor.
- **Access Control**: Role-based via OpenZeppelin AccessControl
  - `ORACLE_ROLE` — the watcher signer; only role allowed to call `setPricePerOzE6` and `setPriceWithMetals`
  - `ADMIN_ROLE` — the multisig; can update weights, intervals, the max change rate, and grant/revoke `ORACLE_ROLE`
- **On-chain weights**: `weights` struct (gold/silver/platinum/palladium basis points). Read via `getWeights()`, mutated via `setWeights(...)` (admin only).
- **Transparency call**: `setPriceWithMetals(composite, gold, silver, platinum, palladium)` records all four constituent prices alongside the composite in a single event-emitting transaction.

### 6.2 Price Format Example

```
Real price: $2,231.17 USD/oz
On-chain value: 2,231,170,000 (uint256)
```

### 6.3 Security Measures

- **Per-update price ceiling**: `maxPriceChangeRate` is enforced on-chain; the constructor defaults it to 10% (1000 bps). The watcher applies an additional, tighter off-chain cap (`ORACLE_MAX_STEP_BPS`, default 3%) before submitting transactions.
- **Minimum update interval**: enforced on-chain by `minUpdateInterval`. Configurable by admin.
- **Role separation**: the watcher key holds only `ORACLE_ROLE`; ownership, weight changes, and threshold tuning require the admin multisig.
- **Auditable history**: `PriceUpdated`, `MetalPricesRecorded`, `WeightsChanged`, `MinUpdateIntervalChanged`, and `MaxPriceChangeRateChanged` events provide a full timeline.

---

## 7. INDEX DISSEMINATION

### 7.1 Publication Channels

| Channel | Update Frequency |
|---------|------------------|
| On-chain Oracle (BSC) | Hourly (configurable) |
| Website Dashboard | Reads the on-chain price; updates on every confirmed publish |
| Admin Dashboard | Reads the on-chain price, weights, and history |

### 7.2 Data Access

**Public (Read-only)**:
- Current index value
- Historical prices
- Constituent weights
- Metal prices

**Restricted (Write)**:
- Price updates
- Parameter changes

---

## 8. CHANGE LOG

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial publication |
| 1.1 | May 2026 | Replaced the "dynamic volume-weighted, four-source composite" framing with the actual committee-governed weight model. Documented on-chain `weights`, `setWeights`, and `WeightsChanged`. Stated the current single primary data source (GoldAPI) and the roadmap toward additional feeds. Corrected the calculation example to reflect the on-chain bps formula. Updated publish cadence to hourly. |

---

## 9. DISCLAIMER

This index methodology document is provided for informational purposes only. The Auxidien Index is not financial advice. Past performance is not indicative of future results. Users should conduct their own research before making investment decisions.

---

## 10. CONTACT

**Index Administrator**: Auxidien Foundation  
**Technical Inquiries**: [tech@auxidien.io]  
**Methodology Questions**: [index@auxidien.io]

---

*© 2026 Auxidien Foundation. All Rights Reserved.*

# AUXIDIEN INDEX METHODOLOGY

**Document Version**: 1.0  
**Effective Date**: January 2026  
**Index Administrator**: Auxidien Foundation

---

## 1. INDEX OVERVIEW

### 1.1 Description

The Auxidien Index (AUXI) is a real-time, volume-weighted precious metals price index. It represents a composite measure of the four most actively traded precious metals in global spot markets.

### 1.2 Index Objective

To provide a single, transparent metric that reflects the aggregate price movement of precious metals, weighted by their relative trading activity in the spot market.

### 1.3 Index Type

- **Category**: Commodity Index
- **Weighting Method**: Volume-weighted
- **Calculation Frequency**: Real-time (5-minute intervals)
- **Base Currency**: USD

---

## 2. INDEX COMPOSITION

### 2.1 Constituent Metals

| Metal | Symbol | Weight Factor |
|-------|--------|---------------|
| Gold | XAUUSD | Dynamic (volume-based) |
| Silver | XAGUSD | Dynamic (volume-based) |
| Platinum | XPTUSD | Dynamic (volume-based) |
| Palladium | XPDUSD | Dynamic (volume-based) |

### 2.2 Data Sources

**Primary Sources**:
- London Bullion Market Association (LBMA)
- CME Group Spot Prices
- Major Forex ECN Providers

**Composite Volume Weighting**:

| Source | Weight in Composite |
|--------|---------------------|
| LBMA Reference | 40% |
| CME Spot | 30% |
| Forex Metal Providers | 20% |
| OTC Market | 10% |

---

## 3. CALCULATION METHODOLOGY

### 3.1 Index Formula

The AUXI index value is calculated using the following formula:

```
AUXI = Σ(w_i × P_i)

Where:
  w_i = Weight of metal i
  P_i = Spot price of metal i (USD/oz)
```

### 3.2 Weight Calculation

Weights are derived from notional trading volume:

```
w_i = N_i / Σ(N_j)

Where:
  N_i = Notional USD volume of metal i
  N_i = V_i × P_i
  V_i = Trading volume of metal i
```

### 3.3 Calculation Example

**Input Data (Sample)**:

| Metal | Price (USD/oz) | Volume | Notional USD |
|-------|----------------|--------|--------------|
| Gold | 2,350.00 | 1,500,000 | 3,525,000,000 |
| Silver | 27.85 | 800,000 | 22,280,000 |
| Platinum | 985.25 | 200,000 | 197,050,000 |
| Palladium | 1,050.00 | 100,000 | 105,000,000 |
| **Total** | - | - | **3,849,330,000** |

**Weight Calculation**:

| Metal | Notional | Weight |
|-------|----------|--------|
| Gold | 3,525,000,000 | 91.57% |
| Silver | 22,280,000 | 0.58% |
| Platinum | 197,050,000 | 5.12% |
| Palladium | 105,000,000 | 2.73% |

**Index Value**:
```
AUXI = (0.9157 × 2350) + (0.0058 × 27.85) + (0.0512 × 985.25) + (0.0273 × 1050)
AUXI = 2151.90 + 0.16 + 50.44 + 28.67
AUXI = 2231.17 USD/oz
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
- **Price Format**: USD × 10^6 (6 decimals)
- **Update Frequency**: Every 5 minutes
- **Access Control**: Role-based (ORACLE_ROLE)

### 6.2 Price Format Example

```
Real price: $2,231.17 USD/oz
On-chain value: 2,231,170,000 (uint256)
```

### 6.3 Security Measures

- Maximum price change per update: 10%
- Minimum update interval: 5 minutes
- Multi-signature oracle management
- Emergency pause functionality

---

## 7. INDEX DISSEMINATION

### 7.1 Publication Channels

| Channel | Update Frequency |
|---------|------------------|
| On-chain Oracle | 5 minutes |
| API Endpoint | Real-time |
| Website Dashboard | Real-time |
| TradingView | 1 minute |

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

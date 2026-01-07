// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Auxidien Index Oracle
 * @author Auxidien Team
 * @notice Stores volume-weighted precious metals index price for AUXI
 * @dev Price format: USD/oz * 1e6 (6 decimals)
 *      Example: 2500.123456 USD/oz => 2_500_123_456
 * 
 * Index Methodology:
 * - Metals: Gold (XAUUSD), Silver (XAGUSD), Platinum (XPTUSD), Palladium (XPDUSD)
 * - Weighting: Volume-weighted based on notional USD value
 * - Formula: AUXI = Σ(weight_i * price_i) where weight_i = notional_i / total_notional
 */
contract AuxidienOracle is AccessControl {
    /// @notice Role identifier for oracle updaters (watcher backend)
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    
    /// @notice Role identifier for admin operations
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Current index price (USD/oz * 1e6)
    uint256 private _pricePerOzE6;

    /// @notice Timestamp of last price update
    uint256 public lastUpdateAt;

    /// @notice Minimum interval between updates (anti-spam protection)
    uint256 public minUpdateInterval;

    /// @notice Maximum allowed price change percentage per update (basis points, 10000 = 100%)
    uint256 public maxPriceChangeRate;

    /// @notice Individual metal prices for transparency
    struct MetalPrices {
        uint256 goldPrice;      // XAUUSD * 1e6
        uint256 silverPrice;    // XAGUSD * 1e6
        uint256 platinumPrice;  // XPTUSD * 1e6
        uint256 palladiumPrice; // XPDUSD * 1e6
    }

    /// @notice Last recorded individual metal prices
    MetalPrices public lastMetalPrices;

    /// @notice Emitted when the index price is updated
    event PriceUpdated(
        uint256 pricePerOzE6,
        uint256 timestamp,
        address indexed updater
    );

    /// @notice Emitted when metal prices are recorded
    event MetalPricesRecorded(
        uint256 goldPrice,
        uint256 silverPrice,
        uint256 platinumPrice,
        uint256 palladiumPrice,
        uint256 timestamp
    );

    /// @notice Emitted when minimum update interval changes
    event MinUpdateIntervalChanged(uint256 oldInterval, uint256 newInterval);

    /// @notice Emitted when max price change rate changes
    event MaxPriceChangeRateChanged(uint256 oldRate, uint256 newRate);

    /**
     * @notice Initialize the oracle with admin and minimum update interval
     * @param admin Address with admin privileges (should be multisig)
     * @param _minUpdateInterval Minimum seconds between price updates
     */
    constructor(address admin, uint256 _minUpdateInterval) {
        require(admin != address(0), "Oracle: admin is zero address");
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        minUpdateInterval = _minUpdateInterval;
        maxPriceChangeRate = 1000; // 10% default max change
    }

    /**
     * @notice Grant oracle role to a watcher backend address
     * @param oracle Address to grant ORACLE_ROLE
     */
    function grantOracleRole(address oracle) external onlyRole(ADMIN_ROLE) {
        require(oracle != address(0), "Oracle: zero address");
        _grantRole(ORACLE_ROLE, oracle);
    }

    /**
     * @notice Revoke oracle role from an address
     * @param oracle Address to revoke ORACLE_ROLE from
     */
    function revokeOracleRole(address oracle) external onlyRole(ADMIN_ROLE) {
        _revokeRole(ORACLE_ROLE, oracle);
    }

    /**
     * @notice Update minimum interval between price updates
     * @param interval New minimum interval in seconds
     */
    function setMinUpdateInterval(uint256 interval) external onlyRole(ADMIN_ROLE) {
        uint256 old = minUpdateInterval;
        minUpdateInterval = interval;
        emit MinUpdateIntervalChanged(old, interval);
    }

    /**
     * @notice Update maximum allowed price change rate
     * @param rate New max rate in basis points (10000 = 100%)
     */
    function setMaxPriceChangeRate(uint256 rate) external onlyRole(ADMIN_ROLE) {
        require(rate > 0 && rate <= 10000, "Oracle: invalid rate");
        uint256 old = maxPriceChangeRate;
        maxPriceChangeRate = rate;
        emit MaxPriceChangeRateChanged(old, rate);
    }

    /**
     * @notice Set the current index price (USD/oz * 1e6)
     * @param newPricePerOzE6 New price value (e.g., 2500.123456 USD => 2_500_123_456)
     */
    function setPricePerOzE6(uint256 newPricePerOzE6) external onlyRole(ORACLE_ROLE) {
        require(newPricePerOzE6 > 0, "Oracle: price must be > 0");

        // Anti-spam: enforce minimum update interval
        if (lastUpdateAt != 0 && minUpdateInterval > 0) {
            require(
                block.timestamp >= lastUpdateAt + minUpdateInterval,
                "Oracle: update too soon"
            );
        }

        // Price manipulation protection: check for extreme changes
        if (_pricePerOzE6 > 0) {
            uint256 priceDiff = newPricePerOzE6 > _pricePerOzE6 
                ? newPricePerOzE6 - _pricePerOzE6 
                : _pricePerOzE6 - newPricePerOzE6;
            uint256 maxChange = (_pricePerOzE6 * maxPriceChangeRate) / 10000;
            require(priceDiff <= maxChange, "Oracle: price change too large");
        }

        _pricePerOzE6 = newPricePerOzE6;
        lastUpdateAt = block.timestamp;

        emit PriceUpdated(newPricePerOzE6, block.timestamp, msg.sender);
    }

    /**
     * @notice Set index price along with individual metal prices for transparency
     * @param newPricePerOzE6 New index price
     * @param goldPrice Gold price (XAUUSD * 1e6)
     * @param silverPrice Silver price (XAGUSD * 1e6)
     * @param platinumPrice Platinum price (XPTUSD * 1e6)
     * @param palladiumPrice Palladium price (XPDUSD * 1e6)
     */
    function setPriceWithMetals(
        uint256 newPricePerOzE6,
        uint256 goldPrice,
        uint256 silverPrice,
        uint256 platinumPrice,
        uint256 palladiumPrice
    ) external onlyRole(ORACLE_ROLE) {
        require(newPricePerOzE6 > 0, "Oracle: price must be > 0");

        // Anti-spam check
        if (lastUpdateAt != 0 && minUpdateInterval > 0) {
            require(
                block.timestamp >= lastUpdateAt + minUpdateInterval,
                "Oracle: update too soon"
            );
        }

        // Price manipulation protection
        if (_pricePerOzE6 > 0) {
            uint256 priceDiff = newPricePerOzE6 > _pricePerOzE6 
                ? newPricePerOzE6 - _pricePerOzE6 
                : _pricePerOzE6 - newPricePerOzE6;
            uint256 maxChange = (_pricePerOzE6 * maxPriceChangeRate) / 10000;
            require(priceDiff <= maxChange, "Oracle: price change too large");
        }

        _pricePerOzE6 = newPricePerOzE6;
        lastUpdateAt = block.timestamp;

        lastMetalPrices = MetalPrices({
            goldPrice: goldPrice,
            silverPrice: silverPrice,
            platinumPrice: platinumPrice,
            palladiumPrice: palladiumPrice
        });

        emit PriceUpdated(newPricePerOzE6, block.timestamp, msg.sender);
        emit MetalPricesRecorded(
            goldPrice,
            silverPrice,
            platinumPrice,
            palladiumPrice,
            block.timestamp
        );
    }

    /**
     * @notice Get the current index price
     * @return Current price in USD/oz * 1e6 format
     */
    function getPricePerOzE6() external view returns (uint256) {
        return _pricePerOzE6;
    }

    /**
     * @notice Get price with metadata
     * @return price Current price
     * @return updatedAt Last update timestamp
     * @return decimals Price decimals (always 6)
     */
    function getPriceData() external view returns (
        uint256 price,
        uint256 updatedAt,
        uint8 decimals
    ) {
        return (_pricePerOzE6, lastUpdateAt, 6);
    }

    /**
     * @notice Get all metal prices
     * @return gold Gold price
     * @return silver Silver price
     * @return platinum Platinum price
     * @return palladium Palladium price
     */
    function getMetalPrices() external view returns (
        uint256 gold,
        uint256 silver,
        uint256 platinum,
        uint256 palladium
    ) {
        return (
            lastMetalPrices.goldPrice,
            lastMetalPrices.silverPrice,
            lastMetalPrices.platinumPrice,
            lastMetalPrices.palladiumPrice
        );
    }

    /**
     * @notice Check if price data is stale
     * @param maxAge Maximum acceptable age in seconds
     * @return True if data is stale or not set
     */
    function isStale(uint256 maxAge) external view returns (bool) {
        if (lastUpdateAt == 0) return true;
        return block.timestamp > lastUpdateAt + maxAge;
    }
}

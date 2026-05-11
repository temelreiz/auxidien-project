// Sources flattened with hardhat v2.28.2 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/access/IAccessControl.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (access/IAccessControl.sol)

pragma solidity >=0.8.4;

/**
 * @dev External interface of AccessControl declared to support ERC-165 detection.
 */
interface IAccessControl {
    /**
     * @dev The `account` is missing a role.
     */
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);

    /**
     * @dev The caller of a function is not the expected one.
     *
     * NOTE: Don't confuse with {AccessControlUnauthorizedAccount}.
     */
    error AccessControlBadConfirmation();

    /**
     * @dev Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     *
     * `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
     * {RoleAdminChanged} not being emitted to signal this.
     */
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);

    /**
     * @dev Emitted when `account` is granted `role`.
     *
     * `sender` is the account that originated the contract call. This account bears the admin role (for the granted role).
     * Expected in cases where the role was granted using the internal {AccessControl-_grantRole}.
     */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Emitted when `account` is revoked `role`.
     *
     * `sender` is the account that originated the contract call:
     *   - if using `revokeRole`, it is the admin role bearer
     *   - if using `renounceRole`, it is the role bearer (i.e. `account`)
     */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {AccessControl-_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) external view returns (bytes32);

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been granted `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     */
    function renounceRole(bytes32 role, address callerConfirmation) external;
}


// File @openzeppelin/contracts/utils/Context.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/utils/introspection/ERC165.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/ERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC-165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 */
abstract contract ERC165 is IERC165 {
    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}


// File @openzeppelin/contracts/access/AccessControl.sol@v5.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (access/AccessControl.sol)

pragma solidity ^0.8.20;



/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This is a lightweight version that doesn't allow enumerating role
 * members except through off-chain means by accessing the contract event logs. Some
 * applications may benefit from on-chain enumerability, for those cases see
 * {AccessControlEnumerable}.
 *
 * Roles are referred to by their `bytes32` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `public constant` hash digests:
 *
 * ```solidity
 * bytes32 public constant MY_ROLE = keccak256("MY_ROLE");
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {hasRole}:
 *
 * ```solidity
 * function foo() public {
 *     require(hasRole(MY_ROLE, msg.sender));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {grantRole} and
 * {revokeRole} functions. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it. We recommend using {AccessControlDefaultAdminRules}
 * to enforce additional security measures for this role.
 */
abstract contract AccessControl is Context, IAccessControl, ERC165 {
    struct RoleData {
        mapping(address account => bool) hasRole;
        bytes32 adminRole;
    }

    mapping(bytes32 role => RoleData) private _roles;

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /**
     * @dev Modifier that checks that an account has a specific role. Reverts
     * with an {AccessControlUnauthorizedAccount} error including the required role.
     */
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view virtual returns (bool) {
        return _roles[role].hasRole[account];
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `_msgSender()`
     * is missing `role`. Overriding this function changes the behavior of the {onlyRole} modifier.
     */
    function _checkRole(bytes32 role) internal view virtual {
        _checkRole(role, _msgSender());
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `account`
     * is missing `role`.
     */
    function _checkRole(bytes32 role, address account) internal view virtual {
        if (!hasRole(role, account)) {
            revert AccessControlUnauthorizedAccount(account, role);
        }
    }

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) public view virtual returns (bytes32) {
        return _roles[role].adminRole;
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleGranted} event.
     */
    function grantRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleRevoked} event.
     */
    function revokeRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been revoked `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     *
     * May emit a {RoleRevoked} event.
     */
    function renounceRole(bytes32 role, address callerConfirmation) public virtual {
        if (callerConfirmation != _msgSender()) {
            revert AccessControlBadConfirmation();
        }

        _revokeRole(role, callerConfirmation);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role.
     *
     * Emits a {RoleAdminChanged} event.
     */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual {
        bytes32 previousAdminRole = getRoleAdmin(role);
        _roles[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleGranted} event.
     */
    function _grantRole(bytes32 role, address account) internal virtual returns (bool) {
        if (!hasRole(role, account)) {
            _roles[role].hasRole[account] = true;
            emit RoleGranted(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleRevoked} event.
     */
    function _revokeRole(bytes32 role, address account) internal virtual returns (bool) {
        if (hasRole(role, account)) {
            _roles[role].hasRole[account] = false;
            emit RoleRevoked(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }
}


// File contracts/AuxidienOracle.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;

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

    /// @notice Index constituent weights in basis points (sum must equal 10000)
    /// @dev    Source of truth for the off-chain watcher. Updates are governed
    ///         by ADMIN_ROLE (multisig) and emit `WeightsChanged` so the change
    ///         is fully auditable on-chain.
    struct Weights {
        uint16 goldBps;
        uint16 silverBps;
        uint16 platinumBps;
        uint16 palladiumBps;
    }

    /// @notice Current index weights
    Weights public weights;

    /// @notice Total of all weight basis points (always 10000 == 100%)
    uint16 public constant WEIGHT_DENOMINATOR = 10_000;

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

    /// @notice Emitted when the index weights change
    event WeightsChanged(
        uint16 goldBps,
        uint16 silverBps,
        uint16 platinumBps,
        uint16 palladiumBps
    );

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

        // Initial weights documented in INDEX_METHODOLOGY.md. The committee
        // may update them at any time via `setWeights`.
        weights = Weights({
            goldBps: 5500,
            silverBps: 2000,
            platinumBps: 1700,
            palladiumBps: 800
        });
        emit WeightsChanged(5500, 2000, 1700, 800);
    }

    /**
     * @notice Update the index weights. Sum must equal WEIGHT_DENOMINATOR (10000).
     * @dev    The off-chain watcher reads these to compute the composite price.
     */
    function setWeights(
        uint16 goldBps,
        uint16 silverBps,
        uint16 platinumBps,
        uint16 palladiumBps
    ) external onlyRole(ADMIN_ROLE) {
        require(
            uint256(goldBps) + silverBps + platinumBps + palladiumBps == WEIGHT_DENOMINATOR,
            "Oracle: weights must sum to 10000"
        );
        weights = Weights({
            goldBps: goldBps,
            silverBps: silverBps,
            platinumBps: platinumBps,
            palladiumBps: palladiumBps
        });
        emit WeightsChanged(goldBps, silverBps, platinumBps, palladiumBps);
    }

    /**
     * @notice Get all four weights in one call (convenient for the watcher).
     */
    function getWeights() external view returns (
        uint16 goldBps,
        uint16 silverBps,
        uint16 platinumBps,
        uint16 palladiumBps
    ) {
        return (weights.goldBps, weights.silverBps, weights.platinumBps, weights.palladiumBps);
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

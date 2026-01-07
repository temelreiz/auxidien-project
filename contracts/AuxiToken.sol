// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Auxidien Index Token (AUXI)
 * @author Auxidien Team
 * @notice 100M fixed supply index token representing volume-weighted precious metals index
 * @dev No additional minting after deployment. Pure index-based investment token.
 * 
 * Tokenomics:
 * - Total Supply: 100,000,000 AUXI (fixed)
 * - Team & Development: 15% (15,000,000)
 * - Treasury / Corporate: 20% (20,000,000)
 * - Liquidity & Market Making: 20% (20,000,000)
 * - Public Distribution: 35% (35,000,000)
 * - Strategic & Advisors: 10% (10,000,000)
 */
contract AuxiToken is ERC20, Ownable {
    /// @notice Total supply: 100,000,000 AUXI with 18 decimals
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18;

    /// @notice Emitted when tokens are distributed to allocation addresses
    event TokensDistributed(
        address indexed recipient,
        uint256 amount,
        string category
    );

    /**
     * @notice Constructor mints entire supply to initial owner
     * @param initialOwner Address to receive initial supply (typically multisig or deployer)
     */
    constructor(address initialOwner)
        ERC20("Auxidien Index Token", "AUXI")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "AUXI: zero address");
        _mint(initialOwner, INITIAL_SUPPLY);
    }

    /**
     * @notice Helper function to distribute tokens with event logging
     * @param recipient Address to receive tokens
     * @param amount Amount of tokens to transfer
     * @param category Category name for tracking (e.g., "Team", "Treasury")
     */
    function distributeTokens(
        address recipient,
        uint256 amount,
        string calldata category
    ) external onlyOwner {
        require(recipient != address(0), "AUXI: zero address");
        require(amount > 0, "AUXI: zero amount");
        
        _transfer(msg.sender, recipient, amount);
        emit TokensDistributed(recipient, amount, category);
    }

    /**
     * @notice Batch distribution of tokens to multiple addresses
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to transfer
     * @param categories Array of category names
     */
    function batchDistribute(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string[] calldata categories
    ) external onlyOwner {
        require(
            recipients.length == amounts.length && 
            amounts.length == categories.length,
            "AUXI: array length mismatch"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "AUXI: zero address");
            require(amounts[i] > 0, "AUXI: zero amount");
            
            _transfer(msg.sender, recipients[i], amounts[i]);
            emit TokensDistributed(recipients[i], amounts[i], categories[i]);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Auxidien Team & Advisor Vesting Contract
 * @author Auxidien Team
 * @notice On-chain vesting for team tokens with cliff and linear release
 * @dev Vesting Schedule:
 *      - Start: Deploy + 30 days
 *      - Cliff: 6 months after start
 *      - End: 36 months after start (3 years total)
 *      - Release: Linear unlock from cliff to end
 * 
 * Team Allocation: 15% = 15,000,000 AUXI
 * Split across 3 beneficiaries (configurable at deployment)
 */
contract AuxiVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The AUXI token being vested
    IERC20 public immutable token;

    /// @notice Vesting schedule for each beneficiary
    struct Schedule {
        address beneficiary;      // Recipient address
        uint256 totalAmount;      // Total tokens to vest
        uint256 releasedAmount;   // Tokens already released
        uint64 start;             // Vesting start timestamp
        uint64 cliff;             // Cliff timestamp (no release before this)
        uint64 end;               // Vesting end timestamp
        bool revocable;           // Can admin revoke remaining tokens?
        bool revoked;             // Has schedule been revoked?
    }

    /// @notice All vesting schedules
    Schedule[] public schedules;

    /// @notice Mapping from beneficiary to their schedule IDs
    mapping(address => uint256[]) public beneficiarySchedules;

    /// @notice Total tokens committed to vesting (for validation)
    uint256 public totalCommitted;

    // Events
    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 totalAmount,
        uint64 start,
        uint64 cliff,
        uint64 end,
        bool revocable
    );

    event TokensReleased(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount
    );

    event ScheduleRevoked(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 remainingAmount
    );

    event BeneficiaryChanged(
        uint256 indexed scheduleId,
        address indexed oldBeneficiary,
        address indexed newBeneficiary
    );

    /**
     * @notice Deploy vesting contract with initial schedules
     * @param _token AUXI token address
     * @param _owner Contract owner (multisig recommended)
     * @param beneficiaries Array of beneficiary addresses
     * @param amounts Array of vesting amounts (18 decimals)
     * @param revocable Array of revocability flags
     */
    constructor(
        address _token,
        address _owner,
        address[] memory beneficiaries,
        uint256[] memory amounts,
        bool[] memory revocable
    ) Ownable(_owner) {
        require(_token != address(0), "Vesting: token is zero address");
        require(beneficiaries.length == amounts.length, "Vesting: length mismatch");
        require(beneficiaries.length == revocable.length, "Vesting: length mismatch");
        require(beneficiaries.length > 0, "Vesting: no beneficiaries");

        token = IERC20(_token);

        // Timeline:
        // T0 = block.timestamp (deploy)
        // start = T0 + 30 days
        // cliff = start + 180 days (6 months)
        // end = start + 1095 days (36 months / 3 years)
        uint64 startTimestamp = uint64(block.timestamp + 30 days);
        uint64 cliffTimestamp = uint64(startTimestamp + 180 days);
        uint64 endTimestamp = uint64(startTimestamp + 1095 days); // 3 years

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            require(beneficiaries[i] != address(0), "Vesting: beneficiary is zero");
            require(amounts[i] > 0, "Vesting: amount is zero");

            uint256 scheduleId = schedules.length;

            schedules.push(Schedule({
                beneficiary: beneficiaries[i],
                totalAmount: amounts[i],
                releasedAmount: 0,
                start: startTimestamp,
                cliff: cliffTimestamp,
                end: endTimestamp,
                revocable: revocable[i],
                revoked: false
            }));

            beneficiarySchedules[beneficiaries[i]].push(scheduleId);
            totalCommitted += amounts[i];

            emit ScheduleCreated(
                scheduleId,
                beneficiaries[i],
                amounts[i],
                startTimestamp,
                cliffTimestamp,
                endTimestamp,
                revocable[i]
            );
        }
    }

    /**
     * @notice Get total number of vesting schedules
     */
    function getSchedulesCount() external view returns (uint256) {
        return schedules.length;
    }

    /**
     * @notice Get schedule IDs for a beneficiary
     * @param beneficiary Address to query
     */
    function getScheduleIds(address beneficiary) external view returns (uint256[] memory) {
        return beneficiarySchedules[beneficiary];
    }

    /**
     * @notice Calculate vested amount for a schedule
     * @param scheduleId Schedule ID to query
     * @return Amount of tokens vested (may include already released)
     */
    function vestedAmount(uint256 scheduleId) public view returns (uint256) {
        require(scheduleId < schedules.length, "Vesting: invalid schedule");
        Schedule memory s = schedules[scheduleId];

        if (s.revoked) {
            return s.releasedAmount; // Only count what was already released
        }

        uint256 currentTime = block.timestamp;

        if (currentTime < s.cliff) {
            // Before cliff: nothing vested
            return 0;
        } else if (currentTime >= s.end) {
            // After end: fully vested
            return s.totalAmount;
        } else {
            // Linear vesting from cliff to end
            // vestedDuration = time since cliff
            // totalVestingDuration = end - cliff (30 months)
            uint256 vestedDuration = currentTime - s.cliff;
            uint256 totalVestingDuration = s.end - s.cliff;
            return (s.totalAmount * vestedDuration) / totalVestingDuration;
        }
    }

    /**
     * @notice Calculate releasable (unvested minus already released) amount
     * @param scheduleId Schedule ID to query
     */
    function releasableAmount(uint256 scheduleId) public view returns (uint256) {
        uint256 vested = vestedAmount(scheduleId);
        uint256 released = schedules[scheduleId].releasedAmount;
        return vested > released ? vested - released : 0;
    }

    /**
     * @notice Release vested tokens for a schedule
     * @param scheduleId Schedule ID to release from
     */
    function release(uint256 scheduleId) external nonReentrant {
        require(scheduleId < schedules.length, "Vesting: invalid schedule");
        Schedule storage s = schedules[scheduleId];

        require(!s.revoked, "Vesting: schedule revoked");
        require(
            msg.sender == s.beneficiary || msg.sender == owner(),
            "Vesting: not authorized"
        );

        uint256 releasable = releasableAmount(scheduleId);
        require(releasable > 0, "Vesting: nothing to release");

        s.releasedAmount += releasable;
        token.safeTransfer(s.beneficiary, releasable);

        emit TokensReleased(scheduleId, s.beneficiary, releasable);
    }

    /**
     * @notice Release all available tokens for a beneficiary (all their schedules)
     * @param beneficiary Address to release for
     */
    function releaseAll(address beneficiary) external nonReentrant {
        uint256[] memory ids = beneficiarySchedules[beneficiary];
        require(ids.length > 0, "Vesting: no schedules");

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 scheduleId = ids[i];
            Schedule storage s = schedules[scheduleId];

            if (s.revoked) continue;

            uint256 releasable = releasableAmount(scheduleId);
            if (releasable > 0) {
                s.releasedAmount += releasable;
                token.safeTransfer(s.beneficiary, releasable);
                emit TokensReleased(scheduleId, s.beneficiary, releasable);
            }
        }
    }

    /**
     * @notice Revoke a revocable schedule (admin only)
     * @param scheduleId Schedule to revoke
     * @dev Unreleased tokens are returned to owner
     */
    function revoke(uint256 scheduleId) external onlyOwner nonReentrant {
        require(scheduleId < schedules.length, "Vesting: invalid schedule");
        Schedule storage s = schedules[scheduleId];

        require(s.revocable, "Vesting: not revocable");
        require(!s.revoked, "Vesting: already revoked");

        // Release any vested but unreleased tokens first
        uint256 vested = vestedAmount(scheduleId);
        uint256 unreleased = vested - s.releasedAmount;
        
        if (unreleased > 0) {
            s.releasedAmount = vested;
            token.safeTransfer(s.beneficiary, unreleased);
            emit TokensReleased(scheduleId, s.beneficiary, unreleased);
        }

        // Calculate remaining unvested amount
        uint256 remaining = s.totalAmount - vested;
        s.revoked = true;

        if (remaining > 0) {
            totalCommitted -= remaining;
            token.safeTransfer(owner(), remaining);
        }

        emit ScheduleRevoked(scheduleId, s.beneficiary, remaining);
    }

    /**
     * @notice Change beneficiary address for a schedule
     * @param scheduleId Schedule to modify
     * @param newBeneficiary New beneficiary address
     */
    function changeBeneficiary(
        uint256 scheduleId,
        address newBeneficiary
    ) external {
        require(scheduleId < schedules.length, "Vesting: invalid schedule");
        require(newBeneficiary != address(0), "Vesting: zero address");
        
        Schedule storage s = schedules[scheduleId];
        require(
            msg.sender == s.beneficiary || msg.sender == owner(),
            "Vesting: not authorized"
        );
        require(!s.revoked, "Vesting: schedule revoked");

        address oldBeneficiary = s.beneficiary;
        s.beneficiary = newBeneficiary;

        // Update beneficiary mappings
        uint256[] storage oldIds = beneficiarySchedules[oldBeneficiary];
        for (uint256 i = 0; i < oldIds.length; i++) {
            if (oldIds[i] == scheduleId) {
                oldIds[i] = oldIds[oldIds.length - 1];
                oldIds.pop();
                break;
            }
        }
        beneficiarySchedules[newBeneficiary].push(scheduleId);

        emit BeneficiaryChanged(scheduleId, oldBeneficiary, newBeneficiary);
    }

    /**
     * @notice Get total tokens required to fund all schedules
     */
    function totalRequiredTokens() external view returns (uint256) {
        return totalCommitted;
    }

    /**
     * @notice Get contract's current token balance
     */
    function contractBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice Check if contract has enough tokens to cover all schedules
     */
    function isFunded() external view returns (bool) {
        return token.balanceOf(address(this)) >= totalCommitted;
    }

    /**
     * @notice Get detailed vesting info for UI display
     * @param scheduleId Schedule to query
     */
    function getVestingInfo(uint256 scheduleId) external view returns (
        address beneficiary,
        uint256 total,
        uint256 vested,
        uint256 released,
        uint256 releasable,
        uint64 start,
        uint64 cliff,
        uint64 end,
        bool revocable,
        bool revoked
    ) {
        require(scheduleId < schedules.length, "Vesting: invalid schedule");
        Schedule memory s = schedules[scheduleId];
        
        return (
            s.beneficiary,
            s.totalAmount,
            vestedAmount(scheduleId),
            s.releasedAmount,
            releasableAmount(scheduleId),
            s.start,
            s.cliff,
            s.end,
            s.revocable,
            s.revoked
        );
    }
}

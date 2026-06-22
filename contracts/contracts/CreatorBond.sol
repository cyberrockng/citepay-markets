// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CitePayMarket.sol";

/**
 * @title CreatorBond
 * @notice Creators post ETH bonds to signal credibility for their citation sources.
 *         A bonded source earns +20 relevance score in the buyer agent's scoring.
 *         If a creator's content hash changes after a PAY citation, anyone can call
 *         slashBond() to destroy the bond and record objective on-chain evidence.
 *
 *         Bond logic mirrors Shadow's BondedMandateEnforcer pattern, adapted for
 *         citation economy (content integrity) rather than DeFi (execution integrity).
 */
contract CreatorBond {
    // ─── State ────────────────────────────────────────────────────────────────

    CitePayMarket public immutable market;

    uint256 public constant MIN_BOND        = 0.001 ether; // minimum bond to earn bonded status
    uint256 public constant CHALLENGE_WINDOW = 7 days;     // withdrawal lock after bond posted

    struct BondRecord {
        uint256 amountWei;     // ETH bonded
        uint256 postedAt;      // timestamp of last bond action
        bool    active;        // currently bonded
        uint256 slashCount;    // how many times slashed
    }

    // creator address → bond info
    mapping(address => BondRecord) public bonds;

    // receiptId → already slashed (prevent double-slash)
    mapping(uint256 => bool) public slashed;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BondPosted(address indexed creator, uint256 amountWei, uint256 totalWei);
    event BondSlashed(
        address indexed creator,
        uint256 indexed receiptId,
        uint256 slashedWei,
        address indexed slashCaller
    );
    event BondWithdrawn(address indexed creator, uint256 amountWei);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error BondTooLow();
    error NoBondActive();
    error ChallengeWindowOpen();
    error AlreadySlashed();
    error TransferFailed();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address market_) {
        market = CitePayMarket(market_);
    }

    // ─── Bond Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Post an ETH bond to earn bonded creator status.
     *         Bonded sources receive a +20 score bonus in the buyer agent's
     *         relevance-weighted decision model.
     */
    function postBond() external payable {
        if (msg.value < MIN_BOND) revert BondTooLow();

        BondRecord storage b = bonds[msg.sender];
        b.amountWei += msg.value;
        b.postedAt   = block.timestamp;
        b.active     = true;

        emit BondPosted(msg.sender, msg.value, b.amountWei);
    }

    /**
     * @notice Slash a creator's bond when their content hash changed after a PAY citation.
     *         Triggers challengeHashChanged() on CitePayMarket — objective-only, no discretion.
     *         Slash amount is burned (sent to zero address) to prevent griefing incentives.
     */
    function slashBond(uint256 receiptId) external returns (bool) {
        if (slashed[receiptId]) revert AlreadySlashed();

        // challengeHashChanged reverts if hash is unchanged — objective gate
        bool resolved = market.challengeHashChanged(receiptId);
        if (!resolved) return false;

        CitePayMarket.Receipt memory r   = market.getReceipt(receiptId);
        CitePayMarket.Source  memory src = market.getSource(r.sourceId);

        address creator = src.creator;
        BondRecord storage b = bonds[creator];
        if (!b.active || b.amountWei == 0) revert NoBondActive();

        slashed[receiptId] = true;
        b.slashCount++;

        uint256 slashAmt = b.amountWei;
        b.amountWei = 0;
        b.active    = false;

        // Burn the bond — prevents slash-for-profit griefing
        (bool ok,) = address(0).call{value: slashAmt}("");
        // Sending to address(0) always succeeds on EVM; suppress unused-return warning
        ok;

        emit BondSlashed(creator, receiptId, slashAmt, msg.sender);
        return true;
    }

    /**
     * @notice Withdraw bond after CHALLENGE_WINDOW has elapsed.
     *         Window prevents post-citation bond pull before challengers can act.
     */
    function withdrawBond() external {
        BondRecord storage b = bonds[msg.sender];
        if (!b.active || b.amountWei == 0) revert NoBondActive();
        if (block.timestamp < b.postedAt + CHALLENGE_WINDOW) revert ChallengeWindowOpen();

        uint256 amt = b.amountWei;
        b.amountWei = 0;
        b.active    = false;

        (bool ok,) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();

        emit BondWithdrawn(msg.sender, amt);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function isBonded(address creator) external view returns (bool) {
        BondRecord storage b = bonds[creator];
        return b.active && b.amountWei >= MIN_BOND;
    }

    function getBond(address creator) external view returns (BondRecord memory) {
        return bonds[creator];
    }

    function canWithdraw(address creator) external view returns (bool) {
        BondRecord storage b = bonds[creator];
        return b.active && block.timestamp >= b.postedAt + CHALLENGE_WINDOW;
    }
}

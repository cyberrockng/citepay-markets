// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CitationMandate
 * @notice Per-session on-chain policy mandate for AI buyer agents.
 *
 *         Before querying, an agent registers a CitationMandate that binds its
 *         stated spend policy on-chain: max per citation, session cap, min relevance,
 *         and bonded-creator requirement. Every PAY decision is checked against the
 *         mandate via checkAndRecord() — producing verifiable ALLOW or BLOCK receipts.
 *
 *         This extends CitePayMarket's outcome layer (what happened) with an intent
 *         layer (what the agent committed to before it happened). Together they prove
 *         both that the agent followed its policy AND that receipts are bound to a
 *         pre-registered policy commitment.
 *
 *         Pattern adapted from Shadow's MandateRegistry + MandateAttestor for the
 *         citation economy domain.
 */
contract CitationMandate {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum BlockReason {
        AMOUNT_TOO_HIGH,       // 0 — citation price exceeds maxPerCitation
        SESSION_CAP_EXCEEDED,  // 1 — would push cumulative spend past sessionCap
        RELEVANCE_TOO_LOW,     // 2 — source relevance below minRelevanceScore
        CREATOR_NOT_BONDED,    // 3 — requireBonded=true but creator has no bond
        MANDATE_CLOSED         // 4 — session already closed
    }

    struct Mandate {
        uint256 id;
        address agent;
        bytes32 policyHash;        // keccak256(abi.encodePacked(policyName))
        uint256 maxPerCitation;    // micro-USDC max for a single PAY
        uint256 sessionCap;        // micro-USDC cap for entire session
        uint256 minRelevanceScore; // 0–100 minimum relevance
        bool    requireBonded;     // must source creator be bonded?
        uint256 spentMicro;        // cumulative PAY amount recorded (ALLOW only)
        uint256 citationCount;     // ALLOW decisions recorded
        uint256 blockCount;        // BLOCK decisions recorded
        bool    active;
        uint256 createdAt;
        uint256 closedAt;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _mandateCounter;

    mapping(uint256 => Mandate) public mandates;
    mapping(address => uint256[]) public agentMandates;

    uint256 public totalMandates;
    uint256 public totalAllows;
    uint256 public totalBlocks;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MandateCreated(
        uint256 indexed mandateId,
        address indexed agent,
        bytes32 policyHash,
        uint256 sessionCap,
        uint256 maxPerCitation,
        uint256 minRelevanceScore,
        bool requireBonded
    );

    event CitationAllowed(
        uint256 indexed mandateId,
        uint256 indexed sourceId,
        bytes32 evidenceHash,
        uint256 amountMicro,
        uint256 relevanceScore,
        uint256 newSpentMicro
    );

    event CitationBlocked(
        uint256 indexed mandateId,
        uint256 indexed sourceId,
        uint8   blockReason,
        uint256 amountMicro,
        uint256 relevanceScore
    );

    event MandateClosed(
        uint256 indexed mandateId,
        address indexed agent,
        uint256 totalSpent,
        uint256 citations,
        uint256 blocks
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error MandateNotFound();
    error NotMandateOwner();
    error MandateAlreadyClosed();
    error InvalidSessionCap();
    error InvalidMaxPerCitation();

    // ─── Mandate Lifecycle ────────────────────────────────────────────────────

    /**
     * @notice Register a pre-query policy mandate on-chain.
     *         Call this once before a query session; pass the returned mandateId
     *         to checkAndRecord() for each PAY decision.
     *
     * @param policyHash        keccak256(abi.encodePacked("balanced")) etc.
     * @param maxPerCitation    micro-USDC ceiling per single citation (e.g. 5000 = $0.005)
     * @param sessionCap        micro-USDC ceiling for entire session
     * @param minRelevanceScore 0–100 minimum relevance (e.g. 40)
     * @param requireBonded     true = only cite bonded creators
     */
    function createMandate(
        bytes32 policyHash,
        uint256 maxPerCitation,
        uint256 sessionCap,
        uint256 minRelevanceScore,
        bool    requireBonded
    ) external returns (uint256 mandateId) {
        if (sessionCap == 0)        revert InvalidSessionCap();
        if (maxPerCitation == 0)    revert InvalidMaxPerCitation();

        _mandateCounter++;
        mandateId = _mandateCounter;

        mandates[mandateId] = Mandate({
            id:                 mandateId,
            agent:              msg.sender,
            policyHash:         policyHash,
            maxPerCitation:     maxPerCitation,
            sessionCap:         sessionCap,
            minRelevanceScore:  minRelevanceScore,
            requireBonded:      requireBonded,
            spentMicro:         0,
            citationCount:      0,
            blockCount:         0,
            active:             true,
            createdAt:          block.timestamp,
            closedAt:           0
        });

        agentMandates[msg.sender].push(mandateId);
        totalMandates++;

        emit MandateCreated(mandateId, msg.sender, policyHash, sessionCap, maxPerCitation, minRelevanceScore, requireBonded);
    }

    /**
     * @notice Check a PAY decision against the mandate and record an ALLOW or BLOCK receipt.
     *         Called by the agent backend for every PAY decision before the off-chain
     *         USDC transfer executes.
     *
     * @param mandateId      from createMandate()
     * @param sourceId       on-chain source ID from CitePayMarket
     * @param evidenceHash   SHA-256 evidence hash (ties this record to the off-chain receipt)
     * @param amountMicro    actual micro-USDC to be paid (weighted amount)
     * @param relevanceScore 0–100 score from Claude Haiku
     * @param creatorBonded  true if creator has an active bond in CreatorBond.sol
     *
     * @return allowed     true = ALLOW (mandate satisfied); false = BLOCK
     * @return blockReason BlockReason enum value (0 if allowed)
     */
    function checkAndRecord(
        uint256 mandateId,
        uint256 sourceId,
        bytes32 evidenceHash,
        uint256 amountMicro,
        uint256 relevanceScore,
        bool    creatorBonded
    ) external returns (bool allowed, uint8 blockReason) {
        Mandate storage m = mandates[mandateId];
        if (m.id == 0) revert MandateNotFound();
        if (m.agent != msg.sender) revert NotMandateOwner();

        // ── BLOCK checks (order matters — cheapest checks first) ──────────────

        if (!m.active) {
            m.blockCount++;
            totalBlocks++;
            emit CitationBlocked(mandateId, sourceId, uint8(BlockReason.MANDATE_CLOSED), amountMicro, relevanceScore);
            return (false, uint8(BlockReason.MANDATE_CLOSED));
        }

        if (amountMicro > m.maxPerCitation) {
            m.blockCount++;
            totalBlocks++;
            emit CitationBlocked(mandateId, sourceId, uint8(BlockReason.AMOUNT_TOO_HIGH), amountMicro, relevanceScore);
            return (false, uint8(BlockReason.AMOUNT_TOO_HIGH));
        }

        if (m.spentMicro + amountMicro > m.sessionCap) {
            m.blockCount++;
            totalBlocks++;
            emit CitationBlocked(mandateId, sourceId, uint8(BlockReason.SESSION_CAP_EXCEEDED), amountMicro, relevanceScore);
            return (false, uint8(BlockReason.SESSION_CAP_EXCEEDED));
        }

        if (relevanceScore < m.minRelevanceScore) {
            m.blockCount++;
            totalBlocks++;
            emit CitationBlocked(mandateId, sourceId, uint8(BlockReason.RELEVANCE_TOO_LOW), amountMicro, relevanceScore);
            return (false, uint8(BlockReason.RELEVANCE_TOO_LOW));
        }

        if (m.requireBonded && !creatorBonded) {
            m.blockCount++;
            totalBlocks++;
            emit CitationBlocked(mandateId, sourceId, uint8(BlockReason.CREATOR_NOT_BONDED), amountMicro, relevanceScore);
            return (false, uint8(BlockReason.CREATOR_NOT_BONDED));
        }

        // ── ALLOW ─────────────────────────────────────────────────────────────

        m.spentMicro    += amountMicro;
        m.citationCount++;
        totalAllows++;

        emit CitationAllowed(mandateId, sourceId, evidenceHash, amountMicro, relevanceScore, m.spentMicro);
        return (true, 0);
    }

    /**
     * @notice Close a mandate at session end. Records final tally on-chain.
     */
    function closeMandate(uint256 mandateId) external {
        Mandate storage m = mandates[mandateId];
        if (m.id == 0)          revert MandateNotFound();
        if (m.agent != msg.sender) revert NotMandateOwner();
        if (!m.active)          revert MandateAlreadyClosed();

        m.active   = false;
        m.closedAt = block.timestamp;

        emit MandateClosed(mandateId, msg.sender, m.spentMicro, m.citationCount, m.blockCount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return mandates[mandateId];
    }

    function getAgentMandateIds(address agent) external view returns (uint256[] memory) {
        return agentMandates[agent];
    }

    function getMandateCount() external view returns (uint256) {
        return _mandateCounter;
    }

    function getMarketStats() external view returns (
        uint256 _totalMandates,
        uint256 _totalAllows,
        uint256 _totalBlocks
    ) {
        return (totalMandates, totalAllows, totalBlocks);
    }
}

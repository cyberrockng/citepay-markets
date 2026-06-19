// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CitePayMarket
 * @notice Agentic citation economy: AI agents pay creators when they cite their work.
 *         Every PAY, REFUSE, and SKIP decision gets a public receipt.
 *         Slashing is objective-only: triggered by content hash change after payment.
 */
contract CitePayMarket {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum Decision { PAY, REFUSE, SKIP }

    struct Source {
        uint256 id;
        address creator;
        address payoutWallet;
        bytes32 contentHash;
        string metadataURI;
        uint256 price;       // in wei (USDC 6-decimal equivalent off-chain)
        uint256 bond;
        int256  reputation;  // starts 0, moves with decisions
        uint256 paidCount;
        uint256 refusedCount;
        uint256 skipCount;
        bool    active;
    }

    struct Receipt {
        uint256 id;
        uint256 sourceId;
        address agent;
        address creator;
        Decision decision;
        bytes32 queryHash;
        bytes32 evidenceHash;
        bytes32 contentHashAtDecision;
        uint256 amountPaid;
        uint256 timestamp;
        uint8   reasonCode;
        bool    challenged;
    }

    struct AgentStats {
        uint256 bond;
        int256  reputation;
        uint256 totalDecisions;
        uint256 totalPaid;
        bool    authorized;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;

    uint256 private _sourceIdCounter;
    uint256 private _receiptIdCounter;

    mapping(uint256 => Source)      public sources;
    mapping(uint256 => Receipt)     public receipts;
    mapping(address => AgentStats)  public agentStats;

    // receipt IDs per source / per agent
    mapping(uint256 => uint256[]) public sourceReceipts;
    mapping(address => uint256[]) public agentReceipts;

    // Market-level stats
    uint256 public totalSources;
    uint256 public totalReceipts;
    uint256 public totalPaidCitations;
    uint256 public totalRefusals;
    uint256 public totalSkips;
    uint256 public totalUSDCRouted; // stored in micro-USDC (6 decimals)

    // ─── Events ───────────────────────────────────────────────────────────────

    event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond);
    event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash);
    event CitationRefused(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, bytes32 queryHash, bytes32 evidenceHash, uint8 reasonCode);
    event CitationSkipped(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, bytes32 queryHash, bytes32 evidenceHash, uint8 reasonCode);
    event SourceHashUpdated(uint256 indexed sourceId, bytes32 oldHash, bytes32 newHash);
    event HashChallengeResolved(uint256 indexed receiptId, uint256 indexed sourceId, address agent, address creator, uint256 refundAmount);
    event SourceReputationChanged(uint256 indexed sourceId, int256 oldScore, int256 newScore);
    event AgentReputationChanged(address indexed agent, int256 oldScore, int256 newScore);
    event AgentAuthorized(address indexed agent, bool allowed);
    event AgentBondDeposited(address indexed agent, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorizedAgent() {
        require(agentStats[msg.sender].authorized, "Agent not authorized");
        require(agentStats[msg.sender].bond > 0, "Agent bond required");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ─── Source Registration ──────────────────────────────────────────────────

    function registerSource(
        address payoutWallet,
        bytes32 contentHash,
        string calldata metadataURI,
        uint256 price,
        uint256 bond
    ) external payable returns (uint256 sourceId) {
        require(payoutWallet != address(0), "Invalid payout wallet");
        require(contentHash != bytes32(0), "Content hash required");
        require(price > 0, "Price must be > 0");

        if (bond > 0) {
            require(msg.value >= bond, "Insufficient bond");
        }

        _sourceIdCounter++;
        sourceId = _sourceIdCounter;

        sources[sourceId] = Source({
            id: sourceId,
            creator: msg.sender,
            payoutWallet: payoutWallet,
            contentHash: contentHash,
            metadataURI: metadataURI,
            price: price,
            bond: bond,
            reputation: 0,
            paidCount: 0,
            refusedCount: 0,
            skipCount: 0,
            active: true
        });

        totalSources++;
        emit SourceRegistered(sourceId, msg.sender, payoutWallet, contentHash, price, bond);
    }

    // ─── Agent Management ─────────────────────────────────────────────────────

    function setAuthorizedAgent(address agent, bool allowed) external onlyOwner {
        agentStats[agent].authorized = allowed;
        emit AgentAuthorized(agent, allowed);
    }

    function depositAgentBond(uint256 amount) external payable {
        require(msg.value >= amount && amount > 0, "Invalid bond amount");
        agentStats[msg.sender].bond += amount;
        emit AgentBondDeposited(msg.sender, amount);
    }

    // ─── Citation Decisions ───────────────────────────────────────────────────

    function payCitation(
        uint256 sourceId,
        bytes32 queryHash,
        bytes32 evidenceHash
    ) external onlyAuthorizedAgent returns (uint256 receiptId) {
        Source storage src = sources[sourceId];
        require(src.active, "Source not active");

        _receiptIdCounter++;
        receiptId = _receiptIdCounter;

        receipts[receiptId] = Receipt({
            id: receiptId,
            sourceId: sourceId,
            agent: msg.sender,
            creator: src.creator,
            decision: Decision.PAY,
            queryHash: queryHash,
            evidenceHash: evidenceHash,
            contentHashAtDecision: src.contentHash,
            amountPaid: src.price,
            timestamp: block.timestamp,
            reasonCode: 0,
            challenged: false
        });

        // Update source stats
        src.paidCount++;
        int256 oldRep = src.reputation;
        src.reputation += 1;
        emit SourceReputationChanged(sourceId, oldRep, src.reputation);

        // Update agent stats
        agentStats[msg.sender].totalDecisions++;
        agentStats[msg.sender].totalPaid += src.price;

        // Update market stats
        totalReceipts++;
        totalPaidCitations++;
        totalUSDCRouted += src.price;

        sourceReceipts[sourceId].push(receiptId);
        agentReceipts[msg.sender].push(receiptId);

        emit CitationPaid(receiptId, sourceId, msg.sender, src.creator, src.price, queryHash, evidenceHash);
    }

    function recordDecision(
        uint256 sourceId,
        uint8 decision,
        bytes32 queryHash,
        bytes32 evidenceHash,
        uint8 reasonCode
    ) external onlyAuthorizedAgent returns (uint256 receiptId) {
        require(decision == 1 || decision == 2, "Use payCitation for PAY");
        Source storage src = sources[sourceId];
        require(src.active, "Source not active");

        _receiptIdCounter++;
        receiptId = _receiptIdCounter;

        Decision d = Decision(decision);

        receipts[receiptId] = Receipt({
            id: receiptId,
            sourceId: sourceId,
            agent: msg.sender,
            creator: src.creator,
            decision: d,
            queryHash: queryHash,
            evidenceHash: evidenceHash,
            contentHashAtDecision: src.contentHash,
            amountPaid: 0,
            timestamp: block.timestamp,
            reasonCode: reasonCode,
            challenged: false
        });

        agentStats[msg.sender].totalDecisions++;

        if (d == Decision.REFUSE) {
            src.refusedCount++;
            int256 oldRep = src.reputation;
            src.reputation -= 1;
            totalRefusals++;
            emit SourceReputationChanged(sourceId, oldRep, src.reputation);
            emit CitationRefused(receiptId, sourceId, msg.sender, queryHash, evidenceHash, reasonCode);
        } else {
            src.skipCount++;
            totalSkips++;
            emit CitationSkipped(receiptId, sourceId, msg.sender, queryHash, evidenceHash, reasonCode);
        }

        totalReceipts++;
        sourceReceipts[sourceId].push(receiptId);
        agentReceipts[msg.sender].push(receiptId);
    }

    // ─── Content Integrity Challenge ──────────────────────────────────────────

    function updateSourceHash(uint256 sourceId, bytes32 newContentHash) external {
        Source storage src = sources[sourceId];
        require(msg.sender == src.creator, "Not creator");
        require(newContentHash != bytes32(0), "Hash required");
        bytes32 oldHash = src.contentHash;
        src.contentHash = newContentHash;
        emit SourceHashUpdated(sourceId, oldHash, newContentHash);
    }

    /**
     * @notice Challenge a PAY receipt where the source content hash changed after payment.
     *         Objective-only: triggers only if current hash != hash at decision time.
     */
    function challengeHashChanged(uint256 receiptId) external returns (bool) {
        Receipt storage r = receipts[receiptId];
        require(r.id != 0, "Receipt not found");
        require(r.decision == Decision.PAY, "Only PAY receipts challengeable");
        require(!r.challenged, "Already challenged");

        Source storage src = sources[r.sourceId];
        require(src.contentHash != r.contentHashAtDecision, "Hash unchanged - no slash");

        r.challenged = true;

        // Reputation drops for creator and agent
        int256 oldSrcRep = src.reputation;
        src.reputation -= 3;
        emit SourceReputationChanged(r.sourceId, oldSrcRep, src.reputation);

        AgentStats storage agent = agentStats[r.agent];
        int256 oldAgentRep = agent.reputation;
        agent.reputation -= 1;
        emit AgentReputationChanged(r.agent, oldAgentRep, agent.reputation);

        emit HashChallengeResolved(receiptId, r.sourceId, r.agent, r.creator, r.amountPaid);
        return true;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getSource(uint256 sourceId) external view returns (Source memory) {
        return sources[sourceId];
    }

    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        return receipts[receiptId];
    }

    function getAgentStats(address agent) external view returns (AgentStats memory) {
        return agentStats[agent];
    }

    function getMarketStats() external view returns (
        uint256 _totalSources,
        uint256 _totalReceipts,
        uint256 _totalPaidCitations,
        uint256 _totalRefusals,
        uint256 _totalSkips,
        uint256 _totalUSDCRouted
    ) {
        return (totalSources, totalReceipts, totalPaidCitations, totalRefusals, totalSkips, totalUSDCRouted);
    }

    function getSourceReceiptIds(uint256 sourceId) external view returns (uint256[] memory) {
        return sourceReceipts[sourceId];
    }

    function getAgentReceiptIds(address agent) external view returns (uint256[] memory) {
        return agentReceipts[agent];
    }

    function getSourceCount() external view returns (uint256) {
        return _sourceIdCounter;
    }

    function getReceiptCount() external view returns (uint256) {
        return _receiptIdCounter;
    }
}

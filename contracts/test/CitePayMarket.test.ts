import { expect } from "chai";
import { ethers } from "hardhat";
import { CitePayMarket } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CitePayMarket", function () {
  let market: CitePayMarket;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let challenger: HardhatEthersSigner;

  const CONTENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("initial content"));
  const NEW_HASH     = ethers.keccak256(ethers.toUtf8Bytes("updated content"));
  const QUERY_HASH   = ethers.keccak256(ethers.toUtf8Bytes("what is x402?"));
  const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("evidence payload"));
  const PRICE        = ethers.parseUnits("0.002", 6); // 0.002 USDC in 6 decimals
  const BOND         = ethers.parseEther("0.001");
  const AGENT_BOND   = ethers.parseEther("0.01");

  beforeEach(async () => {
    [owner, creator, agent, challenger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CitePayMarket");
    market = await Factory.deploy();
  });

  // ─── Source Registration ───────────────────────────────────────────────────

  it("1. registers a source without bond", async () => {
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    const src = await market.getSource(1);
    expect(src.creator).to.equal(creator.address);
    expect(src.price).to.equal(PRICE);
    expect(src.active).to.be.true;
  });

  it("2. registers a source with bond", async () => {
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, BOND,
      { value: BOND }
    );
    const src = await market.getSource(1);
    expect(src.bond).to.equal(BOND);
  });

  it("3. rejects source registration with zero price", async () => {
    await expect(
      market.connect(creator).registerSource(creator.address, CONTENT_HASH, "", 0, 0)
    ).to.be.revertedWith("Price must be > 0");
  });

  // ─── Agent Authorization ───────────────────────────────────────────────────

  it("3. authorizes an agent", async () => {
    await market.connect(owner).setAuthorizedAgent(agent.address, true);
    const stats = await market.getAgentStats(agent.address);
    expect(stats.authorized).to.be.true;
  });

  it("4. rejects unauthorized agent calling payCitation", async () => {
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    await expect(
      market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH)
    ).to.be.revertedWith("Agent not authorized");
  });

  it("5. rejects bonded but authorized agent with no bond", async () => {
    await market.connect(owner).setAuthorizedAgent(agent.address, true);
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    await expect(
      market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH)
    ).to.be.revertedWith("Agent bond required");
  });

  it("6. deposits agent bond", async () => {
    await market.connect(agent).depositAgentBond(AGENT_BOND, { value: AGENT_BOND });
    const stats = await market.getAgentStats(agent.address);
    expect(stats.bond).to.equal(AGENT_BOND);
  });

  // ─── Helper: setup authorized agent with bond + source ────────────────────

  async function setupAgentAndSource() {
    await market.connect(owner).setAuthorizedAgent(agent.address, true);
    await market.connect(agent).depositAgentBond(AGENT_BOND, { value: AGENT_BOND });
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, BOND, { value: BOND }
    );
  }

  // ─── Citation Decisions ────────────────────────────────────────────────────

  it("7. pays a citation and emits CitationPaid", async () => {
    await setupAgentAndSource();
    await expect(
      market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH)
    ).to.emit(market, "CitationPaid").withArgs(1, 1, agent.address, creator.address, PRICE, QUERY_HASH, EVIDENCE_HASH);

    const receipt = await market.getReceipt(1);
    expect(receipt.decision).to.equal(0); // PAY
    expect(receipt.amountPaid).to.equal(PRICE);
  });

  it("8. records a refusal and decrements source reputation", async () => {
    await setupAgentAndSource();
    await expect(
      market.connect(agent).recordDecision(1, 1, QUERY_HASH, EVIDENCE_HASH, 1)
    ).to.emit(market, "CitationRefused");

    const src = await market.getSource(1);
    expect(src.reputation).to.equal(-1);
    expect(src.refusedCount).to.equal(1);
  });

  it("9. records a skip", async () => {
    await setupAgentAndSource();
    await market.connect(agent).recordDecision(1, 2, QUERY_HASH, EVIDENCE_HASH, 2);
    const src = await market.getSource(1);
    expect(src.skipCount).to.equal(1);
  });

  it("10. snapshots content hash at payment time", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    const receipt = await market.getReceipt(1);
    expect(receipt.contentHashAtDecision).to.equal(CONTENT_HASH);
  });

  // ─── Content Hash Challenge ────────────────────────────────────────────────

  it("11. allows creator to update source hash", async () => {
    await setupAgentAndSource();
    await expect(
      market.connect(creator).updateSourceHash(1, NEW_HASH)
    ).to.emit(market, "SourceHashUpdated").withArgs(1, CONTENT_HASH, NEW_HASH);
  });

  it("12. challenge succeeds when hash changed after payment", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    await market.connect(creator).updateSourceHash(1, NEW_HASH);

    await expect(
      market.connect(challenger).challengeHashChanged(1)
    ).to.emit(market, "HashChallengeResolved");
  });

  it("13. reputation drops for creator and agent after challenge", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    await market.connect(creator).updateSourceHash(1, NEW_HASH);
    await market.connect(challenger).challengeHashChanged(1);

    const src = await market.getSource(1);
    expect(src.reputation).to.be.lessThan(0);
    const agentStat = await market.getAgentStats(agent.address);
    expect(agentStat.reputation).to.equal(-1);
  });

  it("14. prevents challenge when hash did not change", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    await expect(
      market.connect(challenger).challengeHashChanged(1)
    ).to.be.revertedWith("Hash unchanged — no slash");
  });

  it("15. prevents double challenge on same receipt", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    await market.connect(creator).updateSourceHash(1, NEW_HASH);
    await market.connect(challenger).challengeHashChanged(1);
    await expect(
      market.connect(challenger).challengeHashChanged(1)
    ).to.be.revertedWith("Already challenged");
  });

  it("16. market stats update after decisions", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);

    const [, , paidCitations, , , usdcRouted] = await market.getMarketStats();
    expect(paidCitations).to.equal(1);
    expect(usdcRouted).to.equal(PRICE);
  });

  it("17. receipt retrieval works", async () => {
    await setupAgentAndSource();
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    const r = await market.getReceipt(1);
    expect(r.id).to.equal(1);
    expect(r.agent).to.equal(agent.address);
  });
});

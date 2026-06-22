import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { CitePayMarket, CreatorBond } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CreatorBond", function () {
  let market:  CitePayMarket;
  let bond:    CreatorBond;
  let owner:   HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let agent:   HardhatEthersSigner;
  let challenger: HardhatEthersSigner;

  const CONTENT_HASH  = ethers.keccak256(ethers.toUtf8Bytes("original content"));
  const NEW_HASH      = ethers.keccak256(ethers.toUtf8Bytes("tampered content"));
  const QUERY_HASH    = ethers.keccak256(ethers.toUtf8Bytes("what is x402?"));
  const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
  const PRICE         = ethers.parseUnits("0.002", 6);
  const AGENT_BOND    = ethers.parseEther("0.01");
  const MIN_BOND      = ethers.parseEther("0.001");

  beforeEach(async () => {
    [owner, creator, agent, challenger] = await ethers.getSigners();

    const MarketFactory = await ethers.getContractFactory("CitePayMarket");
    market = await MarketFactory.deploy();

    const BondFactory = await ethers.getContractFactory("CreatorBond");
    bond = await BondFactory.deploy(await market.getAddress());

    // Set up market: authorize agent
    await market.setAuthorizedAgent(agent.address, true);
    await market.connect(agent).depositAgentBond(AGENT_BOND, { value: AGENT_BOND });
  });

  // ─── Bond Posting ─────────────────────────────────────────────────────────

  it("1. creator posts bond and becomes bonded", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });
    expect(await bond.isBonded(creator.address)).to.be.true;
  });

  it("2. rejects bond below minimum", async () => {
    await expect(
      bond.connect(creator).postBond({ value: ethers.parseEther("0.0001") })
    ).to.be.revertedWithCustomError(bond, "BondTooLow");
  });

  it("3. accumulates multiple bond top-ups", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });
    await bond.connect(creator).postBond({ value: MIN_BOND });
    const record = await bond.getBond(creator.address);
    expect(record.amountWei).to.equal(MIN_BOND * 2n);
  });

  it("4. unbonded creator not considered bonded", async () => {
    expect(await bond.isBonded(creator.address)).to.be.false;
  });

  // ─── Slash ────────────────────────────────────────────────────────────────

  it("5. slashes bond when content hash changes after citation", async () => {
    // Creator posts bond
    await bond.connect(creator).postBond({ value: MIN_BOND });

    // Register source and pay citation on market
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);

    // Creator tampers with content hash
    await market.connect(creator).updateSourceHash(1, NEW_HASH);

    // Slash bond (challengeHashChanged on market, then burn bond)
    const contractBefore = await ethers.provider.getBalance(await bond.getAddress());
    await bond.connect(challenger).slashBond(1);

    const record = await bond.getBond(creator.address);
    expect(record.active).to.be.false;
    expect(record.amountWei).to.equal(0);
    expect(record.slashCount).to.equal(1);

    // Bond ETH should be burned (contract balance reduced)
    const contractAfter = await ethers.provider.getBalance(await bond.getAddress());
    expect(contractAfter).to.be.lt(contractBefore + MIN_BOND);
  });

  it("6. slash fails when hash is unchanged", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    // No hash update — challenge should fail
    await expect(bond.connect(challenger).slashBond(1)).to.be.reverted;
  });

  it("7. cannot slash same receipt twice", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });
    await market.connect(creator).registerSource(
      creator.address, CONTENT_HASH, "ipfs://meta", PRICE, 0
    );
    await market.connect(agent).payCitation(1, QUERY_HASH, EVIDENCE_HASH);
    await market.connect(creator).updateSourceHash(1, NEW_HASH);
    await bond.connect(challenger).slashBond(1);
    await expect(bond.connect(challenger).slashBond(1))
      .to.be.revertedWithCustomError(bond, "AlreadySlashed");
  });

  // ─── Withdrawal ───────────────────────────────────────────────────────────

  it("8. cannot withdraw during challenge window", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });
    await expect(bond.connect(creator).withdrawBond())
      .to.be.revertedWithCustomError(bond, "ChallengeWindowOpen");
  });

  it("9. withdrawal succeeds after challenge window via time travel", async () => {
    await bond.connect(creator).postBond({ value: MIN_BOND });

    // Fast-forward 7 days + 1 second
    await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await hre.network.provider.send("evm_mine");

    expect(await bond.canWithdraw(creator.address)).to.be.true;

    const before = await ethers.provider.getBalance(creator.address);
    const tx = await bond.connect(creator).withdrawBond();
    const receipt = await tx.wait();
    const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
    const after  = await ethers.provider.getBalance(creator.address);

    expect(after + gasUsed).to.be.closeTo(before + MIN_BOND, ethers.parseEther("0.0001"));

    const record = await bond.getBond(creator.address);
    expect(record.active).to.be.false;
  });

  it("10. cannot withdraw with no bond", async () => {
    await expect(bond.connect(creator).withdrawBond())
      .to.be.revertedWithCustomError(bond, "NoBondActive");
  });
});

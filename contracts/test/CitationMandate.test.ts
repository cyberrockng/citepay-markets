import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { CitationMandate } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CitationMandate", function () {
  let mandate: CitationMandate;
  let agent:   HardhatEthersSigner;
  let other:   HardhatEthersSigner;

  const POLICY_BALANCED     = ethers.keccak256(ethers.toUtf8Bytes("balanced"));
  const POLICY_CONSERVATIVE = ethers.keccak256(ethers.toUtf8Bytes("conservative"));
  const EVIDENCE_HASH       = ethers.keccak256(ethers.toUtf8Bytes("evidence payload"));

  // Balanced policy params (mirrors src/lib/policy.ts)
  const MAX_PER_CITATION = 5_000n;  // $0.005 in micro-USDC
  const SESSION_CAP      = 50_000n; // $0.050 session cap
  const MIN_RELEVANCE    = 40n;
  const REQUIRE_BONDED   = false;

  beforeEach(async () => {
    [agent, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CitationMandate");
    mandate = await Factory.deploy();
  });

  // ─── Mandate Creation ─────────────────────────────────────────────────────

  it("1. creates a mandate and emits MandateCreated", async () => {
    await expect(
      mandate.connect(agent).createMandate(
        POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
      )
    ).to.emit(mandate, "MandateCreated")
     .withArgs(1, agent.address, POLICY_BALANCED, SESSION_CAP, MAX_PER_CITATION, MIN_RELEVANCE, REQUIRE_BONDED);

    const m = await mandate.getMandate(1);
    expect(m.agent).to.equal(agent.address);
    expect(m.policyHash).to.equal(POLICY_BALANCED);
    expect(m.active).to.be.true;
    expect(m.spentMicro).to.equal(0);
  });

  it("2. rejects zero session cap", async () => {
    await expect(
      mandate.connect(agent).createMandate(POLICY_BALANCED, MAX_PER_CITATION, 0, MIN_RELEVANCE, false)
    ).to.be.revertedWithCustomError(mandate, "InvalidSessionCap");
  });

  it("3. rejects zero max-per-citation", async () => {
    await expect(
      mandate.connect(agent).createMandate(POLICY_BALANCED, 0, SESSION_CAP, MIN_RELEVANCE, false)
    ).to.be.revertedWithCustomError(mandate, "InvalidMaxPerCitation");
  });

  // ─── ALLOW path ───────────────────────────────────────────────────────────

  it("4. allows a valid citation and updates spend", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );

    const amount    = 3_000n; // $0.003
    const relevance = 75n;

    await expect(
      mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, amount, relevance, true)
    ).to.emit(mandate, "CitationAllowed")
     .withArgs(1, 1, EVIDENCE_HASH, amount, relevance, amount);

    const m = await mandate.getMandate(1);
    expect(m.spentMicro).to.equal(amount);
    expect(m.citationCount).to.equal(1);
  });

  it("5. allows multiple citations, accumulates spend", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 80n, false);
    await mandate.connect(agent).checkAndRecord(1, 2, EVIDENCE_HASH, 3_000n, 70n, false);

    const m = await mandate.getMandate(1);
    expect(m.spentMicro).to.equal(5_000n);
    expect(m.citationCount).to.equal(2);
  });

  // ─── BLOCK paths ──────────────────────────────────────────────────────────

  it("6. blocks when amount exceeds maxPerCitation", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await expect(
      mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 6_000n, 80n, false)
    ).to.emit(mandate, "CitationBlocked")
     .withArgs(1, 1, 0 /* AMOUNT_TOO_HIGH */, 6_000n, 80n);

    const m = await mandate.getMandate(1);
    expect(m.blockCount).to.equal(1);
    expect(m.spentMicro).to.equal(0);
  });

  it("7. blocks when cumulative spend would exceed session cap", async () => {
    // Cap = 50_000; spend 48_000 first
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, 50_000n, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 48_000n, 80n, false);

    // Next 5_000 would exceed cap (48_000 + 5_000 = 53_000 > 50_000)
    await expect(
      mandate.connect(agent).checkAndRecord(1, 2, EVIDENCE_HASH, 5_000n, 80n, false)
    ).to.emit(mandate, "CitationBlocked")
     .withArgs(1, 2, 1 /* SESSION_CAP_EXCEEDED */, 5_000n, 80n);
  });

  it("8. blocks when relevance below minimum", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await expect(
      mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 30n, false)
    ).to.emit(mandate, "CitationBlocked")
     .withArgs(1, 1, 2 /* RELEVANCE_TOO_LOW */, 2_000n, 30n);
  });

  it("9. blocks when requireBonded=true and creator unbonded", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_CONSERVATIVE, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, true /* requireBonded */
    );
    await expect(
      mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 75n, false /* not bonded */)
    ).to.emit(mandate, "CitationBlocked")
     .withArgs(1, 1, 3 /* CREATOR_NOT_BONDED */, 2_000n, 75n);
  });

  it("10. blocks after mandate is closed", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(agent).closeMandate(1);

    await expect(
      mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 75n, false)
    ).to.emit(mandate, "CitationBlocked")
     .withArgs(1, 1, 4 /* MANDATE_CLOSED */, 2_000n, 75n);
  });

  // ─── Close ────────────────────────────────────────────────────────────────

  it("11. closes mandate and emits MandateClosed with final tally", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 3_000n, 80n, false);
    await mandate.connect(agent).checkAndRecord(1, 2, EVIDENCE_HASH, 2_000n, 70n, false);

    await expect(mandate.connect(agent).closeMandate(1))
      .to.emit(mandate, "MandateClosed")
      .withArgs(1, agent.address, 5_000n, 2, 0);

    const m = await mandate.getMandate(1);
    expect(m.active).to.be.false;
    expect(m.closedAt).to.be.gt(0);
  });

  it("12. cannot close someone else's mandate", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await expect(mandate.connect(other).closeMandate(1))
      .to.be.revertedWithCustomError(mandate, "NotMandateOwner");
  });

  it("13. cannot close already-closed mandate", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(agent).closeMandate(1);
    await expect(mandate.connect(agent).closeMandate(1))
      .to.be.revertedWithCustomError(mandate, "MandateAlreadyClosed");
  });

  // ─── Access control ───────────────────────────────────────────────────────

  it("14. only mandate owner can call checkAndRecord", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await expect(
      mandate.connect(other).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 75n, false)
    ).to.be.revertedWithCustomError(mandate, "NotMandateOwner");
  });

  // ─── Market stats ─────────────────────────────────────────────────────────

  it("15. market stats accumulate across agents", async () => {
    await mandate.connect(agent).createMandate(
      POLICY_BALANCED, MAX_PER_CITATION, SESSION_CAP, MIN_RELEVANCE, REQUIRE_BONDED
    );
    await mandate.connect(other).createMandate(
      POLICY_CONSERVATIVE, MAX_PER_CITATION, SESSION_CAP, 70n, true
    );

    await mandate.connect(agent).checkAndRecord(1, 1, EVIDENCE_HASH, 2_000n, 80n, false); // ALLOW
    await mandate.connect(other).checkAndRecord(2, 2, EVIDENCE_HASH, 2_000n, 80n, false); // BLOCK (not bonded)

    const [total, allows, blocks] = await mandate.getMarketStats();
    expect(total).to.equal(2);
    expect(allows).to.equal(1);
    expect(blocks).to.equal(1);
  });
});

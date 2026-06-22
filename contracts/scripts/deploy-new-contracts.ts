/**
 * Deploys only CreatorBond + CitationMandate against the already-live CitePayMarket.
 * Use this when CitePayMarket is already deployed (saves gas vs deploy-all.ts).
 *
 * Usage:
 *   MARKET_ADDRESS=0x396cf1... npx hardhat run scripts/deploy-new-contracts.ts --network arcTestnet
 *
 * If MARKET_ADDRESS is not set, defaults to the known mainnet address.
 */
import hre from "hardhat";
const { ethers } = hre;

const EXISTING_MARKET =
  process.env.MARKET_ADDRESS ||
  process.env.ARC_CONTRACT_ADDRESS ||
  "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Deployer:   ", deployer.address);
  console.log("Balance:    ", ethers.formatEther(balance), "ETH");
  console.log("Network:    ", network.name, "(chainId:", network.chainId.toString() + ")");
  console.log("CitePayMarket:", EXISTING_MARKET, "(existing — not re-deploying)");
  console.log("");

  // ── 1. CreatorBond ────────────────────────────────────────────────────────
  console.log("Deploying CreatorBond...");
  const BondFactory = await ethers.getContractFactory("CreatorBond");
  const bond = await BondFactory.deploy(EXISTING_MARKET);
  await bond.waitForDeployment();
  const bondAddr = await bond.getAddress();
  console.log("CreatorBond deployed to:", bondAddr);

  // ── 2. CitationMandate ────────────────────────────────────────────────────
  console.log("Deploying CitationMandate...");
  const MandateFactory = await ethers.getContractFactory("CitationMandate");
  const mandate = await MandateFactory.deploy();
  await mandate.waitForDeployment();
  const mandateAddr = await mandate.getAddress();
  console.log("CitationMandate deployed to:", mandateAddr);

  // ── Summary ───────────────────────────────────────────────────────────────
  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  const gasUsed = balance - balanceAfter;

  console.log("\n─── Add to Vercel env: ─────────────────────────────────────────");
  console.log(`ARC_CREATOR_BOND_ADDRESS=${bondAddr}`);
  console.log(`ARC_CITATION_MANDATE_ADDRESS=${mandateAddr}`);
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Gas used:", ethers.formatEther(gasUsed), "ETH");

  if (network.chainId === 5042002n) {
    console.log("\nVerify on ArcScan:");
    console.log(`https://testnet.arcscan.app/address/${bondAddr}`);
    console.log(`https://testnet.arcscan.app/address/${mandateAddr}`);
    console.log(`https://testnet.arcscan.app/address/${EXISTING_MARKET}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

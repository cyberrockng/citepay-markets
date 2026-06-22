import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deploying with:", deployer.address);
  console.log("Network:", network.name, "(chainId:", network.chainId.toString() + ")");

  // ── 1. CitePayMarket ──────────────────────────────────────────────────────
  const MarketFactory = await ethers.getContractFactory("CitePayMarket");
  const market = await MarketFactory.deploy();
  await market.waitForDeployment();
  const marketAddr = await market.getAddress();
  console.log("\nCitePayMarket deployed to:", marketAddr);

  await market.setAuthorizedAgent(deployer.address, true);
  console.log("Deployer authorized as agent");

  // ── 2. CreatorBond ────────────────────────────────────────────────────────
  const BondFactory = await ethers.getContractFactory("CreatorBond");
  const bond = await BondFactory.deploy(marketAddr);
  await bond.waitForDeployment();
  const bondAddr = await bond.getAddress();
  console.log("CreatorBond deployed to:", bondAddr);

  // ── 3. CitationMandate ────────────────────────────────────────────────────
  const MandateFactory = await ethers.getContractFactory("CitationMandate");
  const mandate = await MandateFactory.deploy();
  await mandate.waitForDeployment();
  const mandateAddr = await mandate.getAddress();
  console.log("CitationMandate deployed to:", mandateAddr);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n─── Add to your .env: ─────────────────────────────────────────");
  console.log(`ARC_CONTRACT_ADDRESS=${marketAddr}`);
  console.log(`ARC_CREATOR_BOND_ADDRESS=${bondAddr}`);
  console.log(`ARC_CITATION_MANDATE_ADDRESS=${mandateAddr}`);
  console.log("───────────────────────────────────────────────────────────────");

  if (network.chainId === 5042002n) {
    console.log("\nVerify on ArcScan:");
    console.log(`https://testnet.arcscan.app/address/${marketAddr}`);
    console.log(`https://testnet.arcscan.app/address/${bondAddr}`);
    console.log(`https://testnet.arcscan.app/address/${mandateAddr}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

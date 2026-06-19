import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Factory = await ethers.getContractFactory("CitePayMarket");
  const market = await Factory.deploy();
  await market.waitForDeployment();

  const address = await market.getAddress();
  console.log("CitePayMarket deployed to:", address);
  console.log("Network:", (await ethers.provider.getNetwork()).name);

  // Auto-authorize the deployer as an agent for demo
  await market.setAuthorizedAgent(deployer.address, true);
  console.log("Deployer authorized as agent");

  console.log("\nAdd to your .env:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

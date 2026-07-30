const hre = require("hardhat");

async function main() {
  const ChainTrack = await hre.ethers.getContractFactory("ChainTrack");
  const contract = await ChainTrack.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();

  console.log("ChainTrack deployed to:", address);
  console.log("Deployment tx hash:", tx?.hash);
  console.log("Deployment block:", tx?.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

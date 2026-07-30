require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { ETH_RPC_URL, PRIVATE_KEY } = process.env;

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: "0.8.24",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: ETH_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

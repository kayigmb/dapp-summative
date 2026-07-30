const { expect } = require("chai");
const { ethers } = require("hardhat");

const anyValue = () => true;

describe("ChainTrack", function () {
  async function deployFixture() {
    const [relayer, otherAccount, owner] = await ethers.getSigners();
    const ChainTrack = await ethers.getContractFactory("ChainTrack");
    const contract = await ChainTrack.deploy();
    return { contract, relayer, otherAccount, owner };
  }

  it("creates a shipment and emits ShipmentCreated", async function () {
    const { contract, owner } = await deployFixture();

    await expect(contract.createShipment("Widget", "Kigali", "Nairobi", owner.address))
      .to.emit(contract, "ShipmentCreated")
      .withArgs(1n, owner.address, anyValue);

    const shipment = await contract.getShipment(1);
    expect(shipment.productName).to.equal("Widget");
    expect(shipment.owner).to.equal(owner.address);
    expect(shipment.status).to.equal(0n); // Created
  });

  it("updates status and records history", async function () {
    const { contract, owner } = await deployFixture();
    await contract.createShipment("Widget", "Kigali", "Nairobi", owner.address);

    await expect(contract.updateStatus(1, 1)) // PickedUp
      .to.emit(contract, "StatusUpdated")
      .withArgs(1n, 0n, 1n, anyValue);

    const history = await contract.getShipmentHistory(1);
    expect(history).to.have.lengthOf(2);
    expect(history[1].status).to.equal(1n);
  });

  it("transfers ownership", async function () {
    const { contract, owner, otherAccount } = await deployFixture();
    await contract.createShipment("Widget", "Kigali", "Nairobi", owner.address);

    await expect(contract.transferOwnership(1, otherAccount.address))
      .to.emit(contract, "OwnershipTransferred")
      .withArgs(1n, owner.address, otherAccount.address);

    const shipment = await contract.getShipment(1);
    expect(shipment.owner).to.equal(otherAccount.address);
  });

  it("confirms delivery and emits DeliveryConfirmed", async function () {
    const { contract, owner } = await deployFixture();
    await contract.createShipment("Widget", "Kigali", "Nairobi", owner.address);

    await expect(contract.confirmDelivery(1)).to.emit(contract, "DeliveryConfirmed");

    const shipment = await contract.getShipment(1);
    expect(shipment.status).to.equal(5n); // Delivered
  });

  it("rejects writes from a non-relayer account", async function () {
    const { contract, otherAccount, owner } = await deployFixture();

    await expect(
      contract.connect(otherAccount).createShipment("Widget", "Kigali", "Nairobi", owner.address)
    ).to.be.revertedWith("ChainTrack: caller is not relayer");
  });

  it("verifyShipment reflects existence", async function () {
    const { contract, owner } = await deployFixture();
    expect(await contract.verifyShipment(1)).to.equal(false);

    await contract.createShipment("Widget", "Kigali", "Nairobi", owner.address);
    expect(await contract.verifyShipment(1)).to.equal(true);
  });
});

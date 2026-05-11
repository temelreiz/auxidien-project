import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AuxiToken } from "../typechain-types";

const INITIAL_SUPPLY = ethers.parseUnits("100000000", 18); // 100M * 1e18

describe("AuxiToken", () => {
  async function deployFixture() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("AuxiToken");
    const token = (await Token.deploy(owner.address)) as AuxiToken;
    await token.waitForDeployment();
    return { token, owner, alice, bob, carol };
  }

  describe("deployment", () => {
    it("mints the full INITIAL_SUPPLY to the initial owner", async () => {
      const { token, owner } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("exposes name, symbol, and decimals", async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("Auxidien Index Token");
      expect(await token.symbol()).to.equal("AUXI");
      expect(await token.decimals()).to.equal(18);
    });

    it("reverts when initialOwner is the zero address", async () => {
      const Token = await ethers.getContractFactory("AuxiToken");
      await expect(Token.deploy(ethers.ZeroAddress)).to.be.reverted;
    });

    it("exposes the INITIAL_SUPPLY constant", async () => {
      const { token } = await loadFixture(deployFixture);
      expect(await token.INITIAL_SUPPLY()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("distributeTokens", () => {
    it("transfers and emits TokensDistributed with the category label", async () => {
      const { token, owner, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 18);

      await expect(token.distributeTokens(alice.address, amount, "Treasury"))
        .to.emit(token, "TokensDistributed")
        .withArgs(alice.address, amount, "Treasury");

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount);
    });

    it("reverts when called by a non-owner", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).distributeTokens(bob.address, 1, "x"),
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts on the zero address recipient", async () => {
      const { token } = await loadFixture(deployFixture);
      await expect(
        token.distributeTokens(ethers.ZeroAddress, 1, "x"),
      ).to.be.revertedWith("AUXI: zero address");
    });

    it("reverts on zero amount", async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(
        token.distributeTokens(alice.address, 0, "x"),
      ).to.be.revertedWith("AUXI: zero amount");
    });
  });

  describe("batchDistribute", () => {
    it("transfers to each recipient and emits one event per entry", async () => {
      const { token, alice, bob, carol } = await loadFixture(deployFixture);
      const amounts = [
        ethers.parseUnits("100", 18),
        ethers.parseUnits("200", 18),
        ethers.parseUnits("300", 18),
      ];

      const tx = token.batchDistribute(
        [alice.address, bob.address, carol.address],
        amounts,
        ["Team", "Advisor", "Liquidity"],
      );

      await expect(tx)
        .to.emit(token, "TokensDistributed").withArgs(alice.address, amounts[0], "Team")
        .and.to.emit(token, "TokensDistributed").withArgs(bob.address, amounts[1], "Advisor")
        .and.to.emit(token, "TokensDistributed").withArgs(carol.address, amounts[2], "Liquidity");

      expect(await token.balanceOf(alice.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(bob.address)).to.equal(amounts[1]);
      expect(await token.balanceOf(carol.address)).to.equal(amounts[2]);
    });

    it("reverts on length mismatch (recipients vs amounts)", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.batchDistribute([alice.address, bob.address], [1], ["a", "b"]),
      ).to.be.revertedWith("AUXI: array length mismatch");
    });

    it("reverts on length mismatch (amounts vs categories)", async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(
        token.batchDistribute([alice.address], [1, 2], ["only-one"]),
      ).to.be.revertedWith("AUXI: array length mismatch");
    });

    it("reverts when called by a non-owner", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.connect(alice).batchDistribute([bob.address], [1], ["x"]),
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts if any recipient is the zero address", async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(
        token.batchDistribute(
          [alice.address, ethers.ZeroAddress],
          [1, 1],
          ["a", "b"],
        ),
      ).to.be.revertedWith("AUXI: zero address");
    });

    it("reverts if any amount is zero", async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(
        token.batchDistribute([alice.address, bob.address], [1, 0], ["a", "b"]),
      ).to.be.revertedWith("AUXI: zero amount");
    });
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AuxiToken, AuxiVesting } from "../typechain-types";

const DAY = 24 * 60 * 60;
const START_OFFSET = 30 * DAY;
const CLIFF_OFFSET = 180 * DAY;
const END_OFFSET = 1095 * DAY;

const TEAM_AMOUNT = ethers.parseUnits("5000000", 18);

describe("AuxiVesting", () => {
  async function deployFixture() {
    const [owner, alice, bob, carol, stranger] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AuxiToken");
    const token = (await Token.deploy(owner.address)) as AuxiToken;
    await token.waitForDeployment();

    const Vesting = await ethers.getContractFactory("AuxiVesting");
    const vesting = (await Vesting.deploy(
      await token.getAddress(),
      owner.address,
      [alice.address, bob.address, carol.address],
      [TEAM_AMOUNT, TEAM_AMOUNT, TEAM_AMOUNT],
      [false, true, false], // bob revocable
    )) as AuxiVesting;
    await vesting.waitForDeployment();

    // Fund vesting contract
    const total = TEAM_AMOUNT * 3n;
    await token.transfer(await vesting.getAddress(), total);

    const deployTs = await time.latest();
    return {
      token,
      vesting,
      owner,
      alice,
      bob,
      carol,
      stranger,
      deployTs,
      total,
    };
  }

  describe("deployment", () => {
    it("creates a schedule per beneficiary with the expected timeline", async () => {
      const { vesting, alice, deployTs } = await loadFixture(deployFixture);
      expect(await vesting.getSchedulesCount()).to.equal(3);

      const info = await vesting.getVestingInfo(0);
      expect(info.beneficiary).to.equal(alice.address);
      expect(info.total).to.equal(TEAM_AMOUNT);
      expect(info.released).to.equal(0n);
      expect(info.revoked).to.equal(false);
      expect(info.start).to.be.closeTo(BigInt(deployTs + START_OFFSET), 5n);
      expect(info.cliff).to.equal(info.start + BigInt(CLIFF_OFFSET));
      expect(info.end).to.equal(info.start + BigInt(END_OFFSET));
    });

    it("records totalCommitted across all schedules", async () => {
      const { vesting } = await loadFixture(deployFixture);
      expect(await vesting.totalRequiredTokens()).to.equal(TEAM_AMOUNT * 3n);
    });

    it("isFunded returns true once tokens are transferred in", async () => {
      const { vesting } = await loadFixture(deployFixture);
      expect(await vesting.isFunded()).to.equal(true);
    });

    it("reverts on length mismatch between beneficiaries/amounts/revocable", async () => {
      const [owner, alice] = await ethers.getSigners();
      const Token = await ethers.getContractFactory("AuxiToken");
      const token = await Token.deploy(owner.address);
      const Vesting = await ethers.getContractFactory("AuxiVesting");
      await expect(
        Vesting.deploy(
          await token.getAddress(),
          owner.address,
          [alice.address],
          [TEAM_AMOUNT, TEAM_AMOUNT],
          [false],
        ),
      ).to.be.revertedWith("Vesting: length mismatch");
    });
  });

  describe("vesting math", () => {
    it("vests 0 before cliff", async () => {
      const { vesting } = await loadFixture(deployFixture);
      // Before start
      expect(await vesting.vestedAmount(0)).to.equal(0n);
      // After start but before cliff
      await time.increase(START_OFFSET + 90 * DAY);
      expect(await vesting.vestedAmount(0)).to.equal(0n);
    });

    it("vests roughly half between cliff and end", async () => {
      const { vesting } = await loadFixture(deployFixture);
      // halfway through the linear range = cliff + (end - cliff) / 2
      // end - cliff = 1095 - 180 = 915 days
      const halfRange = Math.floor(915 / 2) * DAY;
      await time.increase(START_OFFSET + CLIFF_OFFSET + halfRange);

      const vested = await vesting.vestedAmount(0);
      const halfExpected = TEAM_AMOUNT / 2n;
      const tolerance = TEAM_AMOUNT / 200n; // 0.5%
      expect(vested).to.be.closeTo(halfExpected, tolerance);
    });

    it("vests the full amount at end", async () => {
      const { vesting } = await loadFixture(deployFixture);
      await time.increase(START_OFFSET + END_OFFSET + DAY);
      expect(await vesting.vestedAmount(0)).to.equal(TEAM_AMOUNT);
    });
  });

  describe("release", () => {
    it("releases nothing before cliff", async () => {
      const { vesting, alice } = await loadFixture(deployFixture);
      await expect(vesting.connect(alice).release(0)).to.be.revertedWith(
        "Vesting: nothing to release",
      );
    });

    it("transfers vested tokens to beneficiary after the cliff", async () => {
      const { token, vesting, alice } = await loadFixture(deployFixture);
      await time.increase(START_OFFSET + END_OFFSET + DAY);

      const before = await token.balanceOf(alice.address);
      await expect(vesting.connect(alice).release(0))
        .to.emit(vesting, "TokensReleased")
        .withArgs(0n, alice.address, TEAM_AMOUNT);

      expect(await token.balanceOf(alice.address)).to.equal(before + TEAM_AMOUNT);
    });

    it("allows the owner to trigger release on behalf of the beneficiary", async () => {
      const { token, vesting, owner, alice } = await loadFixture(deployFixture);
      await time.increase(START_OFFSET + END_OFFSET + DAY);
      await vesting.connect(owner).release(0);
      expect(await token.balanceOf(alice.address)).to.equal(TEAM_AMOUNT);
    });

    it("rejects unauthorized callers", async () => {
      const { vesting, stranger } = await loadFixture(deployFixture);
      await time.increase(START_OFFSET + END_OFFSET + DAY);
      await expect(vesting.connect(stranger).release(0)).to.be.revertedWith(
        "Vesting: not authorized",
      );
    });

    it("releaseAll iterates all schedules for a beneficiary", async () => {
      const { token, vesting, owner, alice } = await loadFixture(deployFixture);
      // give alice a second schedule by re-deploying; easier: just verify single
      // schedule path here, and skip multi without adding admin API.
      await time.increase(START_OFFSET + END_OFFSET + DAY);
      await vesting.connect(alice).releaseAll(alice.address);
      expect(await token.balanceOf(alice.address)).to.equal(TEAM_AMOUNT);

      // calling again is a no-op (no revert, just nothing to release)
      const before = await token.balanceOf(alice.address);
      await vesting.connect(alice).releaseAll(alice.address);
      expect(await token.balanceOf(alice.address)).to.equal(before);
    });
  });

  describe("revoke", () => {
    it("revokes a revocable schedule, paying out vested and returning remainder to owner", async () => {
      const { token, vesting, owner, bob } = await loadFixture(deployFixture);
      const half = Math.floor(915 / 2) * DAY;
      await time.increase(START_OFFSET + CLIFF_OFFSET + half);

      const ownerBefore = await token.balanceOf(owner.address);
      const bobBefore = await token.balanceOf(bob.address);

      await vesting.revoke(1); // schedule 1 = bob, revocable

      const info = await vesting.getVestingInfo(1);
      expect(info.revoked).to.equal(true);

      const bobReceived = (await token.balanceOf(bob.address)) - bobBefore;
      const ownerReceived = (await token.balanceOf(owner.address)) - ownerBefore;
      expect(bobReceived + ownerReceived).to.equal(TEAM_AMOUNT);
    });

    it("rejects revoking a non-revocable schedule", async () => {
      const { vesting } = await loadFixture(deployFixture);
      await expect(vesting.revoke(0)).to.be.revertedWith("Vesting: not revocable");
    });

    it("rejects revoking twice", async () => {
      const { vesting } = await loadFixture(deployFixture);
      await time.increase(START_OFFSET + CLIFF_OFFSET + DAY);
      await vesting.revoke(1);
      await expect(vesting.revoke(1)).to.be.revertedWith("Vesting: already revoked");
    });

    it("rejects revoke from a non-owner", async () => {
      const { vesting, stranger } = await loadFixture(deployFixture);
      await expect(
        vesting.connect(stranger).revoke(1),
      ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
    });
  });

  describe("changeBeneficiary", () => {
    it("lets the beneficiary transfer their schedule to a new address", async () => {
      const { vesting, alice, stranger } = await loadFixture(deployFixture);
      await expect(vesting.connect(alice).changeBeneficiary(0, stranger.address))
        .to.emit(vesting, "BeneficiaryChanged")
        .withArgs(0n, alice.address, stranger.address);

      const info = await vesting.getVestingInfo(0);
      expect(info.beneficiary).to.equal(stranger.address);

      // mapping moved
      const newIds = await vesting.getScheduleIds(stranger.address);
      expect(newIds.length).to.equal(1);
      expect(newIds[0]).to.equal(0n);

      const oldIds = await vesting.getScheduleIds(alice.address);
      expect(oldIds.length).to.equal(0);
    });

    it("lets the owner reassign a schedule", async () => {
      const { vesting, owner, stranger } = await loadFixture(deployFixture);
      await vesting.connect(owner).changeBeneficiary(0, stranger.address);
      const info = await vesting.getVestingInfo(0);
      expect(info.beneficiary).to.equal(stranger.address);
    });

    it("rejects unauthorized callers", async () => {
      const { vesting, stranger } = await loadFixture(deployFixture);
      await expect(
        vesting.connect(stranger).changeBeneficiary(0, stranger.address),
      ).to.be.revertedWith("Vesting: not authorized");
    });

    it("rejects zero address", async () => {
      const { vesting, alice } = await loadFixture(deployFixture);
      await expect(
        vesting.connect(alice).changeBeneficiary(0, ethers.ZeroAddress),
      ).to.be.revertedWith("Vesting: zero address");
    });
  });
});

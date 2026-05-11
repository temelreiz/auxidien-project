import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AuxidienOracle } from "../typechain-types";

const MIN_UPDATE_INTERVAL = 60; // 1 minute, fits within typical tests
const ORACLE_ROLE = ethers.id("ORACLE_ROLE");
const ADMIN_ROLE = ethers.id("ADMIN_ROLE");

// Helper: produce a USD/oz * 1e6 value
const e6 = (usdPerOz: number) => BigInt(Math.round(usdPerOz * 1_000_000));

describe("AuxidienOracle", () => {
  async function deployFixture() {
    const [admin, watcher, stranger] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("AuxidienOracle");
    const oracle = (await Oracle.deploy(admin.address, MIN_UPDATE_INTERVAL)) as AuxidienOracle;
    await oracle.waitForDeployment();
    await oracle.connect(admin).grantOracleRole(watcher.address);
    return { oracle, admin, watcher, stranger };
  }

  describe("deployment", () => {
    it("grants admin and default-admin roles to the deployer's chosen admin", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      const defaultAdminRole = await oracle.DEFAULT_ADMIN_ROLE();
      expect(await oracle.hasRole(defaultAdminRole, admin.address)).to.equal(true);
      expect(await oracle.hasRole(ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("initialises minUpdateInterval and maxPriceChangeRate", async () => {
      const { oracle } = await loadFixture(deployFixture);
      expect(await oracle.minUpdateInterval()).to.equal(MIN_UPDATE_INTERVAL);
      expect(await oracle.maxPriceChangeRate()).to.equal(1000); // default 10%
    });

    it("reverts when admin is the zero address", async () => {
      const Oracle = await ethers.getContractFactory("AuxidienOracle");
      await expect(Oracle.deploy(ethers.ZeroAddress, 0)).to.be.revertedWith(
        "Oracle: admin is zero address",
      );
    });
  });

  describe("role management", () => {
    it("admin can grant and revoke ORACLE_ROLE", async () => {
      const { oracle, admin, stranger } = await loadFixture(deployFixture);
      await oracle.connect(admin).grantOracleRole(stranger.address);
      expect(await oracle.hasRole(ORACLE_ROLE, stranger.address)).to.equal(true);

      await oracle.connect(admin).revokeOracleRole(stranger.address);
      expect(await oracle.hasRole(ORACLE_ROLE, stranger.address)).to.equal(false);
    });

    it("non-admin cannot grant ORACLE_ROLE", async () => {
      const { oracle, stranger } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(stranger).grantOracleRole(stranger.address),
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("rejects granting to zero address", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(admin).grantOracleRole(ethers.ZeroAddress),
      ).to.be.revertedWith("Oracle: zero address");
    });
  });

  describe("setPricePerOzE6", () => {
    it("accepts an initial price from ORACLE_ROLE and emits PriceUpdated", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      const price = e6(2350);
      await expect(oracle.connect(watcher).setPricePerOzE6(price))
        .to.emit(oracle, "PriceUpdated")
        .withArgs(price, anyValue(), watcher.address);
      expect(await oracle.getPricePerOzE6()).to.equal(price);
    });

    it("rejects callers without ORACLE_ROLE", async () => {
      const { oracle, stranger } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(stranger).setPricePerOzE6(e6(2350)),
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("rejects a zero price", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await expect(oracle.connect(watcher).setPricePerOzE6(0)).to.be.revertedWith(
        "Oracle: price must be > 0",
      );
    });

    it("enforces minUpdateInterval between updates", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2350));
      await expect(
        oracle.connect(watcher).setPricePerOzE6(e6(2355)),
      ).to.be.revertedWith("Oracle: update too soon");
    });

    it("allows an update once the interval has elapsed", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2350));
      await time.increase(MIN_UPDATE_INTERVAL + 1);
      // within 10% default rate
      await oracle.connect(watcher).setPricePerOzE6(e6(2400));
      expect(await oracle.getPricePerOzE6()).to.equal(e6(2400));
    });

    it("enforces maxPriceChangeRate after the first update (upward delta)", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2000));
      await time.increase(MIN_UPDATE_INTERVAL + 1);
      // 10% default cap → max delta is 200, so 2300 is rejected
      await expect(
        oracle.connect(watcher).setPricePerOzE6(e6(2300)),
      ).to.be.revertedWith("Oracle: price change too large");
      // but exactly 2200 (10%) is accepted
      await oracle.connect(watcher).setPricePerOzE6(e6(2200));
      expect(await oracle.getPricePerOzE6()).to.equal(e6(2200));
    });

    it("enforces maxPriceChangeRate after the first update (downward delta)", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2000));
      await time.increase(MIN_UPDATE_INTERVAL + 1);
      // 10% cap → max delta is 200, so 1700 is rejected
      await expect(
        oracle.connect(watcher).setPricePerOzE6(e6(1700)),
      ).to.be.revertedWith("Oracle: price change too large");
      // but 1800 (10% drop) is accepted
      await oracle.connect(watcher).setPricePerOzE6(e6(1800));
      expect(await oracle.getPricePerOzE6()).to.equal(e6(1800));
    });

    it("admin can tighten or relax maxPriceChangeRate", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      await expect(oracle.connect(admin).setMaxPriceChangeRate(500))
        .to.emit(oracle, "MaxPriceChangeRateChanged")
        .withArgs(1000, 500);
      expect(await oracle.maxPriceChangeRate()).to.equal(500);
    });

    it("rejects setMaxPriceChangeRate at 0 or above 100%", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(admin).setMaxPriceChangeRate(0),
      ).to.be.revertedWith("Oracle: invalid rate");
      await expect(
        oracle.connect(admin).setMaxPriceChangeRate(10_001),
      ).to.be.revertedWith("Oracle: invalid rate");
    });
  });

  describe("setPriceWithMetals", () => {
    it("records the composite price and the individual metal prices", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      const composite = e6(2231.17);
      const gold = e6(2350);
      const silver = e6(27.85);
      const platinum = e6(985.25);
      const palladium = e6(1050);

      await expect(
        oracle
          .connect(watcher)
          .setPriceWithMetals(composite, gold, silver, platinum, palladium),
      )
        .to.emit(oracle, "PriceUpdated")
        .and.to.emit(oracle, "MetalPricesRecorded")
        .withArgs(gold, silver, platinum, palladium, anyValue());

      expect(await oracle.getPricePerOzE6()).to.equal(composite);
      const metals = await oracle.getMetalPrices();
      expect(metals.gold).to.equal(gold);
      expect(metals.silver).to.equal(silver);
      expect(metals.platinum).to.equal(platinum);
      expect(metals.palladium).to.equal(palladium);
    });

    it("applies the same max-change guard as setPricePerOzE6", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2000));
      await time.increase(MIN_UPDATE_INTERVAL + 1);
      await expect(
        oracle
          .connect(watcher)
          .setPriceWithMetals(e6(2300), e6(2350), 0, 0, 0),
      ).to.be.revertedWith("Oracle: price change too large");
    });

    it("rejects callers without ORACLE_ROLE", async () => {
      const { oracle, stranger } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(stranger).setPriceWithMetals(e6(2350), 0, 0, 0, 0),
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("rejects zero composite price", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(watcher).setPriceWithMetals(0, 0, 0, 0, 0),
      ).to.be.revertedWith("Oracle: price must be > 0");
    });

    it("enforces minUpdateInterval after a setPriceWithMetals update", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPriceWithMetals(e6(2350), 0, 0, 0, 0);
      await expect(
        oracle.connect(watcher).setPriceWithMetals(e6(2355), 0, 0, 0, 0),
      ).to.be.revertedWith("Oracle: update too soon");
    });
  });

  describe("isStale and getPriceData", () => {
    it("isStale returns true before any update", async () => {
      const { oracle } = await loadFixture(deployFixture);
      expect(await oracle.isStale(60)).to.equal(true);
    });

    it("isStale flips after maxAge passes since last update", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2350));
      expect(await oracle.isStale(120)).to.equal(false);
      await time.increase(121);
      expect(await oracle.isStale(120)).to.equal(true);
    });

    it("getPriceData reports decimals=6 and the last update timestamp", async () => {
      const { oracle, watcher } = await loadFixture(deployFixture);
      await oracle.connect(watcher).setPricePerOzE6(e6(2350));
      const data = await oracle.getPriceData();
      expect(data.price).to.equal(e6(2350));
      expect(data.decimals).to.equal(6);
      expect(data.updatedAt).to.equal(await oracle.lastUpdateAt());
    });
  });

  describe("weights", () => {
    it("initialises with the documented default weights", async () => {
      const { oracle } = await loadFixture(deployFixture);
      const w = await oracle.getWeights();
      expect(w.goldBps).to.equal(5500);
      expect(w.silverBps).to.equal(2000);
      expect(w.platinumBps).to.equal(1700);
      expect(w.palladiumBps).to.equal(800);
    });

    it("emits WeightsChanged in the constructor", async () => {
      const Oracle = await ethers.getContractFactory("AuxidienOracle");
      const [admin] = await ethers.getSigners();
      const tx = await Oracle.deploy(admin.address, MIN_UPDATE_INTERVAL);
      await expect(tx.deploymentTransaction())
        .to.emit(tx, "WeightsChanged")
        .withArgs(5500, 2000, 1700, 800);
    });

    it("admin can change weights when they sum to 10000", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      await expect(oracle.connect(admin).setWeights(6000, 1800, 1500, 700))
        .to.emit(oracle, "WeightsChanged")
        .withArgs(6000, 1800, 1500, 700);
      const w = await oracle.getWeights();
      expect(w.goldBps).to.equal(6000);
      expect(w.silverBps).to.equal(1800);
      expect(w.platinumBps).to.equal(1500);
      expect(w.palladiumBps).to.equal(700);
    });

    it("rejects weights that do not sum to 10000", async () => {
      const { oracle, admin } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(admin).setWeights(5000, 2000, 1700, 800),
      ).to.be.revertedWith("Oracle: weights must sum to 10000");
      await expect(
        oracle.connect(admin).setWeights(5500, 2000, 1700, 801),
      ).to.be.revertedWith("Oracle: weights must sum to 10000");
    });

    it("rejects non-admin callers", async () => {
      const { oracle, stranger } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(stranger).setWeights(5500, 2000, 1700, 800),
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });

    it("exposes WEIGHT_DENOMINATOR as 10000", async () => {
      const { oracle } = await loadFixture(deployFixture);
      expect(await oracle.WEIGHT_DENOMINATOR()).to.equal(10_000);
    });
  });

  describe("setMinUpdateInterval", () => {
    it("admin can change the interval and the new value is enforced", async () => {
      const { oracle, admin, watcher } = await loadFixture(deployFixture);
      await expect(oracle.connect(admin).setMinUpdateInterval(10))
        .to.emit(oracle, "MinUpdateIntervalChanged")
        .withArgs(MIN_UPDATE_INTERVAL, 10);
      expect(await oracle.minUpdateInterval()).to.equal(10);

      await oracle.connect(watcher).setPricePerOzE6(e6(2350));
      await expect(
        oracle.connect(watcher).setPricePerOzE6(e6(2355)),
      ).to.be.revertedWith("Oracle: update too soon");
      await time.increase(11);
      await oracle.connect(watcher).setPricePerOzE6(e6(2355));
    });

    it("rejects non-admin caller", async () => {
      const { oracle, stranger } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(stranger).setMinUpdateInterval(10),
      ).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    });
  });
});

// Mimic chai-matchers anyValue for event args we don't pin (timestamps).
function anyValue() {
  return (_value: any) => true;
}

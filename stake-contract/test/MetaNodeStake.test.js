const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// 部署并初始化合约
async function deployFixture() {
    // 部署代币（MetaNodeToken）
    const RewardToken = await ethers.getContractFactory("MetaNodeToken");
    const metaNodeToken = await RewardToken.deploy();
    await metaNodeToken.waitForDeployment();
    const metaNodeAddress = await metaNodeToken.getAddress();

    // 获取签名者
    const [owner, admin, user1] = await ethers.getSigners();

    // 部署MetaNodeStake合约
    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    const stakeContract = await MetaNodeStake.deploy();
    await stakeContract.waitForDeployment();

    // 初始化参数
    const currentBlock = await ethers.provider.getBlockNumber();
    const startBlock = currentBlock;
    const endBlock = currentBlock + 10000;
    const metaNodePerBlock = 100; // 每区块100奖励
    const ethLockBlocks = 10; // ETH池锁仓10区块
    const ethRewardRate = 10; // ETH池奖励率

    // 初始化合约
    await stakeContract.initialize(
        metaNodeAddress,
        startBlock,
        endBlock,
        metaNodePerBlock,
        ethLockBlocks,
        ethRewardRate
    );

    // 授权管理员角色（可选，初始化已将owner设为管理员）
    const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("admin_role"));
    await stakeContract.grantRole(ADMIN_ROLE, admin.address);

    // 转账给用户质押代币
    await metaNodeToken.transfer(user1.address, ethers.parseEther("1000"));
    // 转账给合约奖励代币
    await metaNodeToken.transfer(await stakeContract.getAddress(), ethers.parseEther("1000000"));

    return {
        stakeContract,
        metaNodeToken,
        owner,
        admin,
        user1,
        currentBlock,
        startBlock,
        endBlock
    };
}

describe("MetaNodeStake", function () {
    let stakeContract, metaNodeToken;
    let owner, admin, user1, currentBlock;

    beforeEach(async function () {
        ({
            stakeContract,
            metaNodeToken,
            owner,
            admin,
            user1,
            currentBlock
        } = await loadFixture(deployFixture));
    });

    // 1. 初始化测试
    describe("Initialization", function () {
        it("should set correct initial parameters", async function () {
            expect(await stakeContract.MetaNode()).to.equal(await metaNodeToken.getAddress());
            expect(await stakeContract.startBlock()).to.equal(currentBlock);
            expect(await stakeContract.poolLength()).to.equal(1); // 初始ETH池

            // 验证ETH池参数
            const ethPool = await stakeContract.pools(0);
            expect(ethPool.stTokenAddress).to.equal(ethers.ZeroAddress);
            expect(ethPool.unstakeLockedBlocks).to.equal(10);
        });

        it("should grant correct roles to deployer", async function () {
            const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
            const UPGRADE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("upgrade_role"));
            const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("admin_role"));

            expect(await stakeContract.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await stakeContract.hasRole(UPGRADE_ROLE, owner.address)).to.be.true;
            expect(await stakeContract.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
        });
    });

    // 2. 管理员功能测试
    describe("Admin Functions", function () {
        it("should add ERC20 pool successfully", async function () {
            const stakeTokenAddress = await metaNodeToken.getAddress();
            await expect(
                stakeContract.connect(admin).addPool(
                    stakeTokenAddress,
                    200, // 权重
                    0, // 最小质押量
                    20, // 锁仓20区块
                    stakeTokenAddress, // 奖励代币
                    20, // 奖励率
                    false
                )
            ).to.emit(stakeContract, "AddPool")
                .withArgs(stakeTokenAddress, 200, await ethers.provider.getBlockNumber() + 1, 0, 20);

            expect(await stakeContract.poolLength()).to.equal(2); // ETH池 + ERC20池
        });

        it("should update pool weight correctly", async function () {
            // 先添加一个池
            await stakeContract.connect(admin).addPool(
                await metaNodeToken.getAddress(),
                200,
                0,
                20,
                await metaNodeToken.getAddress(),
                20,
                false
            );

            // 更新权重
            await stakeContract.connect(admin).setPoolWeight(1, 300, false);
            const pool = await stakeContract.pools(1);
            expect(pool.poolWeight).to.equal(300);
        });
    });

    // 3. 用户功能测试：质押
    describe("User Deposits", function () {
        it("should deposit ETH to pool 0", async function () {
            const amount = ethers.parseEther("1.5");
            await expect(
                stakeContract.connect(user1).depositETH({ value: amount })
            ).to.emit(stakeContract, "Staked")
                .withArgs(user1.address, 0, amount);

            // 验证质押余额
            expect(await stakeContract.stakingBalance(0, user1.address)).to.equal(amount);
        });

        it("should deposit ERC20 to pool 1", async function () {
            // 先添加ERC20池
            await stakeContract.connect(admin).addPool(
                await metaNodeToken.getAddress(),
                200,
                0,
                20,
                await metaNodeToken.getAddress(),
                20,
                false
            );

            // 授权并质押
            const amount = ethers.parseEther("100");
            await metaNodeToken.connect(user1).approve(await stakeContract.getAddress(), amount);
            await expect(
                stakeContract.connect(user1).deposit(1, amount)
            ).to.emit(stakeContract, "Staked")
                .withArgs(user1.address, 1, amount);

            expect(await stakeContract.stakingBalance(1, user1.address)).to.equal(amount);
        });
    });

    // 4. 用户功能测试：赎回与提取
    describe("User Withdrawals", function () {
        it("should unstake and withdraw ETH after lockup", async function () {
            // 质押ETH
            const depositAmount = ethers.parseEther("1.0");
            await stakeContract.connect(user1).depositETH({ value: depositAmount });

            // 申请赎回
            await stakeContract.connect(user1).unstake(0, depositAmount);

            // 挖矿11个区块（超过10区块锁仓期）
            await ethers.provider.send("hardhat_mine", ["0xb"]);

            // 提取
            const balanceBefore = await ethers.provider.getBalance(user1.address);
            const tx = await stakeContract.connect(user1).withdraw(0);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;

            // 验证余额（扣除gas后增加）
            const balanceAfter = await ethers.provider.getBalance(user1.address);
            expect(balanceAfter).to.equal(balanceBefore + depositAmount - gasCost);
        });
    });

    // 5. 用户功能测试：奖励领取
    describe("Reward Claims", function () {
        it("should claim rewards after staking", async function () {
            // 质押ETH
            await stakeContract.connect(user1).depositETH({ value: ethers.parseEther("1.0") });

            // 挖矿100个区块（累积奖励）
            await ethers.provider.send("hardhat_mine", ["0x64"]);

            // 领取奖励
            const rewardBefore = await metaNodeToken.balanceOf(user1.address);
            await stakeContract.connect(user1).claim(0);
            const rewardAfter = await metaNodeToken.balanceOf(user1.address);

            expect(rewardAfter).to.be.gt(rewardBefore); // 奖励增加
        });
    });
});
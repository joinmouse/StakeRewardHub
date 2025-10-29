const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaNodeAdmin", function () {
    let adminContract, metaNodeToken;
    let owner, admin, user;

    // 直接在beforeEach中部署所有合约和初始化
    beforeEach(async function () {
        // 获取签名者（账户）
        [owner, admin, user] = await ethers.getSigners();

        // 部署ERC20测试代币（假设MetaNodeToken是具体实现）
        const RewardToken = await ethers.getContractFactory("MetaNodeToken");
        metaNodeToken = await RewardToken.deploy();
        await metaNodeToken.waitForDeployment(); // 等待部署完成

        // 部署测试合约（具体实现MetaNodeAdmin）
        const AdminTest = await ethers.getContractFactory("MetaNodeAdminTest");
        adminContract = await AdminTest.deploy();
        await adminContract.waitForDeployment(); // 等待部署完成

        // 关键：初始化可升级合约（调用initialize函数，确保父类正确初始化, 确保owner获得DEFAULT_ADMIN_ROLE）
        await adminContract.initialize();

        // 2. 明确获取DEFAULT_ADMIN_ROLE（OpenZeppelin的默认管理员角色）
        const DEFAULT_ADMIN_ROLE = ethers.ZeroHash; // 0x00...00（默认管理员角色的哈希）
        const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("admin_role"));

        // 3. 验证owner是否拥有DEFAULT_ADMIN_ROLE（初始化函数中应已授予）
        const ownerHasAdminRole = await adminContract.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
        expect(ownerHasAdminRole).to.be.true;

        // 4. 用owner（拥有DEFAULT_ADMIN_ROLE）给admin账户授予ADMIN_ROLE
        await adminContract.connect(owner).grantRole(ADMIN_ROLE, admin.address);
    });

    // 测试权限控制（仅admin_role可调用）
    describe("Permission Control", function () {
        it("should reject non-admin calls to setMetaNode", async function () {
            const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("admin_role"));
            await expect(
                adminContract.connect(user).setMetaNode(await metaNodeToken.getAddress())
            ).to.be.revertedWithCustomError(adminContract, "AccessControlUnauthorizedAccount").withArgs(user.address, ADMIN_ROLE);
        });

        it("should allow admin_role to call setMetaNode", async function () {
            const tokenAddress = await metaNodeToken.getAddress();
            await expect(adminContract.connect(admin).setMetaNode(tokenAddress))
                .to.emit(adminContract, "SetMetaNode")
                .withArgs(tokenAddress);
            
            const storedToken = await adminContract.MetaNode();
            expect(storedToken).to.equal(tokenAddress);
        });
    });

    // 测试暂停/恢复功能
    describe("Pause/Unpause", function () {
        it("should pause withdraw correctly", async function () {
            await adminContract.connect(admin).pauseWithdraw();
            expect(await adminContract.withdrawPaused()).to.be.true;

            // 重复暂停应失败
            await expect(adminContract.connect(admin).pauseWithdraw())
                .to.be.revertedWith("withdraw has been already paused");
        });

        it("should unpause withdraw correctly", async function () {
            await adminContract.connect(admin).pauseWithdraw();
            await adminContract.connect(admin).unpauseWithdraw();
            expect(await adminContract.withdrawPaused()).to.be.false;
        });
    });

    // 测试区块和奖励设置
    describe("Block & Reward Settings", function () {
        it("should set startBlock and endBlock correctly", async function () {
            const start = 1000;
            const end = 2000;

            await adminContract.connect(admin).setEndBlock(end);
            await adminContract.connect(admin).setStartBlock(start);
            
            expect(await adminContract.startBlock()).to.equal(start);
            expect(await adminContract.endBlock()).to.equal(end);
        });

        it("should reject invalid startBlock > endBlock", async function () {
            await adminContract.connect(admin).setEndBlock(1000);
            await expect(adminContract.connect(admin).setStartBlock(2000))
                .to.be.revertedWith("start block must be smaller than end block");
        });
    });

    // 测试池管理功能
    describe("Pool Management", function () {
        it("should add first pool as ETH pool (address(0))", async function () {
            const tokenAddress = await metaNodeToken.getAddress();
            await adminContract.connect(admin).setEndBlock(2000);  // 设置endBlock以允许添加池
            await adminContract.connect(admin).addPool(
                ethers.ZeroAddress,       // ETH地址（0.8.20+推荐用ethers.ZeroAddress）
                100,                      // 权重
                0,                        // 最小质押量
                100,                      // 锁仓区块
                tokenAddress,             // 奖励代币
                10,                       // 奖励率
                false                     // 不更新
            );

            const pool = await adminContract.pools(0);
            expect(pool.stTokenAddress).to.equal(ethers.ZeroAddress);
            expect(pool.poolWeight).to.equal(100);
            expect(await adminContract.totalPoolWeight()).to.equal(100);
        });

        it("should reject non-ETH pool as first pool", async function () {
            const tokenAddress = await metaNodeToken.getAddress();
            await expect(adminContract.connect(admin).addPool(
                user.address, // 非ETH地址
                100,
                0,
                100,
                tokenAddress,
                10,
                false
            )).to.be.revertedWith("invalid staking token address");
        });

        it("should update pool weight correctly", async function () {
            const tokenAddress = await metaNodeToken.getAddress();
            await adminContract.connect(admin).setEndBlock(2000);  // 设置endBlock以允许添加池
            // 先添加一个池
            await adminContract.connect(admin).addPool(
                ethers.ZeroAddress,
                100,
                0,
                100,
                tokenAddress,
                10,
                false
            );

            // 更新权重
            await adminContract.connect(admin).setPoolWeight(0, 200, false);
            const pool = await adminContract.pools(0);
            expect(pool.poolWeight).to.equal(200);
            expect(await adminContract.totalPoolWeight()).to.equal(200); // 100 -> 200
        });
    });

    // 测试内部函数 _addPool（通过testAddPool暴露）
    describe("_addPool (internal)", function () {
        it("should add pool via internal function", async function () {
            const tokenAddress = await metaNodeToken.getAddress();
            await adminContract.testAddPool(
                ethers.ZeroAddress,
                50,
                50,
                tokenAddress,
                5
            );

            const pool = await adminContract.pools(0);
            expect(pool.poolWeight).to.equal(50);
            expect(pool.unstakeLockedBlocks).to.equal(50);
        });
    });
});
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { MockPokerToken } from "../src/MockPokerToken.sol";
import { PokerEscrow } from "../src/PokerEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes calldata revertData) external;
    function expectRevert(bytes4 revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract ReentrantPokerToken is MockPokerToken {
    PokerEscrow private target;
    PokerEscrow.Withdrawal private reentrantWithdrawal;
    bytes private reentrantSignature;

    bool public reentryAttempted;
    bool public reentrySucceeded;
    bool public nonceObservedUsedDuringTransfer;

    constructor(address admin) MockPokerToken(admin) { }

    function depositInto(PokerEscrow escrow, uint256 amount) external {
        this.approve(address(escrow), amount);
        escrow.deposit(amount);
    }

    function withdrawFrom(
        PokerEscrow escrow,
        PokerEscrow.Withdrawal calldata withdrawal,
        bytes calldata signature
    ) external {
        target = escrow;
        reentrantWithdrawal = withdrawal;
        reentrantSignature = signature;
        escrow.withdraw(withdrawal, signature);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (
            from == address(target) && to == address(this) && !reentryAttempted
                && reentrantSignature.length != 0
        ) {
            reentryAttempted = true;
            nonceObservedUsedDuringTransfer =
                target.usedNonces(address(this), reentrantWithdrawal.nonce);
            try target.withdraw(reentrantWithdrawal, reentrantSignature) {
                reentrySucceeded = true;
            } catch { }
        }
    }
}

contract PokerEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant OPERATOR_KEY = 0xA11CE;
    uint256 private constant OTHER_KEY = 0xB0B;
    uint256 private constant INITIAL_BALANCE = 1_000_000 ether;

    address private admin;
    address private operator;
    address private player;
    address private other;
    MockPokerToken private token;
    PokerEscrow private escrow;

    function setUp() public {
        admin = address(this);
        operator = vm.addr(OPERATOR_KEY);
        player = vm.addr(0xCAFE);
        other = vm.addr(OTHER_KEY);

        token = new MockPokerToken(admin);
        escrow = new PokerEscrow(token, admin, operator);
        token.mint(player, INITIAL_BALANCE);

        vm.prank(player);
        token.approve(address(escrow), type(uint256).max);
    }

    function test_DepositCreditsOnlyTheCallerAndEmitsCustody() public {
        vm.prank(player);
        escrow.deposit(100 ether);

        assert(escrow.balanceOf(player) == 100 ether);
        assert(escrow.balanceOf(other) == 0);
        assert(token.balanceOf(address(escrow)) == 100 ether);
    }

    function test_WithdrawUsesAnOperatorSignedVoucher() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));

        vm.prank(player);
        escrow.withdraw(withdrawal, signature);

        assert(escrow.balanceOf(player) == 60 ether);
        assert(token.balanceOf(player) == INITIAL_BALANCE - 60 ether);
        assert(escrow.usedNonces(player, 1));
    }

    function test_RevertsReplayedVoucher() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));

        vm.prank(player);
        escrow.withdraw(withdrawal, signature);

        vm.expectRevert(PokerEscrow.NonceAlreadyUsed.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);
    }

    function test_RevertsExpiredVoucher() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));
        vm.warp(withdrawal.deadline + 1);

        vm.expectRevert(PokerEscrow.VoucherExpired.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);
    }

    function test_RevertsWrongSigner() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OTHER_KEY, escrow.hashWithdrawal(withdrawal));

        vm.expectRevert(PokerEscrow.InvalidSigner.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);
    }

    function test_RevertsVoucherSignedForAnotherContractDomain() public {
        _deposit(player, 100 ether);
        PokerEscrow otherEscrow = new PokerEscrow(token, admin, operator);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory wrongDomainSignature =
            _sign(OPERATOR_KEY, otherEscrow.hashWithdrawal(withdrawal));

        vm.expectRevert(PokerEscrow.InvalidSigner.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, wrongDomainSignature);
    }

    function test_RevertsVoucherAfterChainChanges() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory priorChainSignature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));
        vm.chainId(block.chainid + 1);

        vm.expectRevert(PokerEscrow.InvalidSigner.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, priorChainSignature);
    }

    function test_RevertsWhenVoucherAccountIsNotCaller() public {
        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));

        vm.expectRevert(PokerEscrow.AccountMismatch.selector);
        vm.prank(other);
        escrow.withdraw(withdrawal, signature);
    }

    function test_PauseStopsDepositsAndWithdrawals() public {
        _deposit(player, 100 ether);
        escrow.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(player);
        escrow.deposit(1 ether);

        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);

        escrow.unpause();
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);
        assert(escrow.balanceOf(player) == 60 ether);
    }

    function test_RolesProtectMintPauseAndOperatorRotation() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, other, token.MINTER_ROLE()
            )
        );
        vm.prank(other);
        token.mint(other, 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                other,
                escrow.PAUSER_ROLE()
            )
        );
        vm.prank(other);
        escrow.pause();

        _deposit(player, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, 40 ether, 1, block.timestamp + 1 hours);
        bytes memory signature = _sign(OTHER_KEY, escrow.hashWithdrawal(withdrawal));
        vm.expectRevert(PokerEscrow.InvalidSigner.selector);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);

        escrow.grantRole(escrow.OPERATOR_ROLE(), other);
        vm.prank(player);
        escrow.withdraw(withdrawal, signature);
        assert(escrow.balanceOf(player) == 60 ether);
    }

    function test_NonceIsConsumedBeforeAHostileTokenCanReenter() public {
        ReentrantPokerToken hostileToken = new ReentrantPokerToken(admin);
        PokerEscrow hostileEscrow = new PokerEscrow(hostileToken, admin, operator);
        hostileToken.mint(address(hostileToken), 100 ether);
        hostileToken.depositInto(hostileEscrow, 100 ether);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(address(hostileToken), 40 ether, 9, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, hostileEscrow.hashWithdrawal(withdrawal));

        hostileToken.withdrawFrom(hostileEscrow, withdrawal, signature);

        assert(hostileToken.reentryAttempted());
        assert(hostileToken.nonceObservedUsedDuringTransfer());
        assert(!hostileToken.reentrySucceeded());
        assert(hostileEscrow.usedNonces(address(hostileToken), 9));
        assert(hostileEscrow.balanceOf(address(hostileToken)) == 60 ether);
    }

    function testFuzz_DepositAndWithdrawPreserveBalances(uint128 rawDeposit, uint128 rawWithdrawal)
        public
    {
        uint256 depositAmount = (uint256(rawDeposit) % INITIAL_BALANCE) + 1;
        uint256 withdrawalAmount = (uint256(rawWithdrawal) % depositAmount) + 1;
        _deposit(player, depositAmount);
        PokerEscrow.Withdrawal memory withdrawal =
            _withdrawal(player, withdrawalAmount, 77, block.timestamp + 1 hours);
        bytes memory signature = _sign(OPERATOR_KEY, escrow.hashWithdrawal(withdrawal));

        vm.prank(player);
        escrow.withdraw(withdrawal, signature);

        assert(escrow.balanceOf(player) == depositAmount - withdrawalAmount);
        assert(token.balanceOf(address(escrow)) == depositAmount - withdrawalAmount);
    }

    function _deposit(address account, uint256 amount) private {
        vm.prank(account);
        escrow.deposit(amount);
    }

    function _withdrawal(address account, uint256 amount, uint256 nonce, uint256 deadline)
        private
        pure
        returns (PokerEscrow.Withdrawal memory)
    {
        return PokerEscrow.Withdrawal({
            account: account, amount: amount, nonce: nonce, deadline: deadline
        });
    }

    function _sign(uint256 privateKey, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Custodies test tokens while poker hands settle off-chain.
/// @dev Base Sepolia test deployment only; not audited for real-value assets.
contract PokerEscrow is AccessControl, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant WITHDRAWAL_TYPEHASH =
        keccak256("Withdrawal(address account,uint256 amount,uint256 nonce,uint256 deadline)");

    IERC20 public immutable token;

    mapping(address account => uint256 amount) private balances;
    mapping(address account => mapping(uint256 nonce => bool consumed)) public usedNonces;

    struct Withdrawal {
        address account;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(
        address indexed account, uint256 amount, uint256 indexed nonce, address indexed signer
    );

    error AccountMismatch();
    error InsufficientBalance();
    error InvalidAddress();
    error InvalidSigner();
    error NonceAlreadyUsed();
    error VoucherExpired();
    error ZeroAmount();

    constructor(IERC20 token_, address admin, address operator) EIP712("PokerEscrow", "1") {
        if (address(token_) == address(0) || admin == address(0) || operator == address(0)) {
            revert InvalidAddress();
        }

        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        balances[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    function withdraw(Withdrawal calldata withdrawal, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        if (msg.sender != withdrawal.account) revert AccountMismatch();
        if (withdrawal.amount == 0) revert ZeroAmount();
        if (block.timestamp > withdrawal.deadline) revert VoucherExpired();
        if (usedNonces[withdrawal.account][withdrawal.nonce]) revert NonceAlreadyUsed();
        if (balances[withdrawal.account] < withdrawal.amount) revert InsufficientBalance();

        address signer = ECDSA.recover(hashWithdrawal(withdrawal), signature);
        if (!hasRole(OPERATOR_ROLE, signer)) revert InvalidSigner();

        // Consume the nonce and debit custody before invoking the untrusted token contract.
        usedNonces[withdrawal.account][withdrawal.nonce] = true;
        balances[withdrawal.account] -= withdrawal.amount;
        token.safeTransfer(withdrawal.account, withdrawal.amount);

        emit Withdrawn(withdrawal.account, withdrawal.amount, withdrawal.nonce, signer);
    }

    function hashWithdrawal(Withdrawal calldata withdrawal) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                WITHDRAWAL_TYPEHASH,
                withdrawal.account,
                withdrawal.amount,
                withdrawal.nonce,
                withdrawal.deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}

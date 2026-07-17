// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { MockPokerToken } from "../src/MockPokerToken.sol";
import { PokerEscrow } from "../src/PokerEscrow.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address value);
    function envUint(string calldata name) external returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys test-only contracts. Run against Anvil unless live testnet use is approved.
contract DeployBaseSepolia {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    error WrongChain(uint256 actualChainId);

    function run() external returns (MockPokerToken token, PokerEscrow escrow) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) revert WrongChain(block.chainid);

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("CONTRACT_ADMIN_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        token = new MockPokerToken(admin);
        escrow = new PokerEscrow(token, admin, operator);
        vm.stopBroadcast();
    }
}

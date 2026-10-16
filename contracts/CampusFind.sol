// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

contract CampusFind {
    enum Status { Reported, Claimed, Returned, Cancelled }

    struct Item {
        uint id;
        string description;
        string location;
        address finder;
        address claimant;
        string claimProof;
        uint deposit;
        Status status;
        uint reportedAt;
    }

    address public admin;
    uint public claimDeposit;
    uint public itemCount;
    mapping(uint => Item) private items;

    event ItemReported(uint indexed id, address indexed finder);
    event ItemClaimed(uint indexed id, address indexed claimant);
    event ClaimRejected(uint indexed id, address indexed claimant);
    event ClaimCancelled(uint indexed id, address indexed claimant);
    event ItemReturned(uint indexed id, address indexed claimant);
    event ReportCancelled(uint indexed id);
    event DepositChanged(uint newDeposit);

    constructor(uint _claimDeposit) {
        require(_claimDeposit > 0, "Deposit must be greater than zero");
        admin = msg.sender;
        claimDeposit = _claimDeposit;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin allowed");
        _;
    }

    modifier itemExists(uint id) {
        require(id > 0 && id <= itemCount, "Item does not exist");
        _;
    }

    modifier onlyFinder(uint id) {
        require(msg.sender == items[id].finder, "Only the finder allowed");
        _;
    }

    modifier onlyClaimant(uint id) {
        require(msg.sender == items[id].claimant, "Only the claimant allowed");
        _;
    }

    modifier inStatus(uint id, Status required) {
        require(items[id].status == required, "Invalid item status");
        _;
    }

    function reportFound(string memory description, string memory location) public {
        require(bytes(description).length > 0, "Description required");
        require(bytes(location).length > 0, "Location required");

        uint id = ++itemCount;
        Item storage item = items[id];
        item.id = id;
        item.description = description;
        item.location = location;
        item.finder = msg.sender;
        item.status = Status.Reported;
        item.reportedAt = block.timestamp;

        emit ItemReported(id, msg.sender);
    }

    function claimItem(uint id, string memory proof) public payable
        itemExists(id) inStatus(id, Status.Reported)
    {
        Item storage item = items[id];
        require(msg.sender != item.finder, "Finder cannot claim own item");
        require(bytes(proof).length > 0, "Proof required");
        require(msg.value == claimDeposit, "Incorrect deposit amount");

        item.claimant = msg.sender;
        item.claimProof = proof;
        item.deposit = msg.value;
        item.status = Status.Claimed;

        emit ItemClaimed(id, msg.sender);
    }

    function approveClaim(uint id) public
        itemExists(id) onlyFinder(id) inStatus(id, Status.Claimed)
    {
        address claimant = _endClaim(id, Status.Returned);
        emit ItemReturned(id, claimant);
    }

    function rejectClaim(uint id) public
        itemExists(id) onlyFinder(id) inStatus(id, Status.Claimed)
    {
        address claimant = _endClaim(id, Status.Reported);
        emit ClaimRejected(id, claimant);
    }

    function cancelClaim(uint id) public
        itemExists(id) onlyClaimant(id) inStatus(id, Status.Claimed)
    {
        address claimant = _endClaim(id, Status.Reported);
        emit ClaimCancelled(id, claimant);
    }

    function cancelReport(uint id) public
        itemExists(id) onlyFinder(id) inStatus(id, Status.Reported)
    {
        items[id].status = Status.Cancelled;
        emit ReportCancelled(id);
    }

    function setClaimDeposit(uint amount) public onlyAdmin {
        require(amount > 0, "Deposit must be greater than zero");
        claimDeposit = amount;
        emit DepositChanged(amount);
    }

    function getItem(uint id) public view itemExists(id) returns (Item memory) {
        return items[id];
    }

    // Closes an active claim and refunds the claimant's deposit.
    // State is updated before the ETH transfer (checks-effects-interactions).
    function _endClaim(uint id, Status next) private returns (address claimant) {
        Item storage item = items[id];
        claimant = item.claimant;
        uint amount = item.deposit;

        item.deposit = 0;
        item.status = next;
        if (next == Status.Reported) {
            item.claimant = address(0);
            item.claimProof = "";
        }

        (bool ok, ) = claimant.call{value: amount}("");
        require(ok, "Refund failed");
    }
}

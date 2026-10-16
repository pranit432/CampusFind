// CampusFind front end.
// Talks to the CampusFind smart contract through MetaMask using Ethers.js v6.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONTRACT_ADDRESS = "0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab";

const CHAIN = {
  hex: "0x539", // 1337
  name: "Ganache Local",
  rpc: "http://127.0.0.1:7545",
};

const STATUS = ["Reported", "Claimed", "Returned", "Cancelled"];

// Only the parts of the contract this page uses (human-readable ABI).
const ABI = [
  "function admin() view returns (address)",
  "function claimDeposit() view returns (uint256)",
  "function itemCount() view returns (uint256)",
  "function getItem(uint256 id) view returns (tuple(uint256 id, string description, string location, address finder, address claimant, string claimProof, uint256 deposit, uint8 status, uint256 reportedAt))",
  "function reportFound(string description, string location)",
  "function claimItem(uint256 id, string proof) payable",
  "function approveClaim(uint256 id)",
  "function rejectClaim(uint256 id)",
  "function cancelClaim(uint256 id)",
  "function cancelReport(uint256 id)",
  "function setClaimDeposit(uint256 amount)",
  "event ItemReported(uint256 indexed id, address indexed finder)",
  "event ItemClaimed(uint256 indexed id, address indexed claimant)",
  "event ClaimRejected(uint256 indexed id, address indexed claimant)",
  "event ClaimCancelled(uint256 indexed id, address indexed claimant)",
  "event ItemReturned(uint256 indexed id, address indexed claimant)",
  "event ReportCancelled(uint256 indexed id)",
  "event DepositChanged(uint256 newDeposit)",
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let provider = null;
let signer = null;
let contract = null;
let account = null;
let adminAddress = null;
let depositWei = 0n;
let initRun = 0; // guards against overlapping init() calls
const txLog = []; // transactions sent from this page during this session

// ---------------------------------------------------------------------------
// Small DOM helpers (all user/on-chain text is inserted with textContent, never innerHTML)
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const sameAddress = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function notice(message, kind = "info") {
  const box = $("notice");
  box.className = `alert alert-${kind} cf-notice`;
  box.textContent = message;
}

function clearNotice() {
  const box = $("notice");
  box.className = "alert cf-notice d-none";
  box.textContent = "";
}

function showDashboard(connected) {
  $("gate").classList.toggle("d-none", connected);
  $("dash").classList.toggle("d-none", !connected);
}

// ---------------------------------------------------------------------------
// Connecting to MetaMask
// ---------------------------------------------------------------------------
async function connect() {
  if (!window.ethereum) {
    notice("MetaMask was not found in this browser. Install the MetaMask extension, then reload this page.", "danger");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureChain();
    await init();
  } catch (err) {
    notice(await explain(err), "danger");
  }
}

// Ask MetaMask to switch to Ganache Local, adding the network first if it is unknown.
async function ensureChain() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current.toLowerCase() === CHAIN.hex) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.hex }] });
  } catch (err) {
    if (err.code !== 4902) throw err;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN.hex,
        chainName: CHAIN.name,
        rpcUrls: [CHAIN.rpc],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      }],
    });
  }
}

// Build the provider / signer / contract objects for the currently selected MetaMask account.
async function init() {
  const run = ++initRun;
  if (!window.ethereum) return;

  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (accounts.length === 0) {
    resetConnection();
    return;
  }

  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId.toLowerCase() !== CHAIN.hex) {
    resetConnection();
    notice(`Wrong network. Switch MetaMask to ${CHAIN.name} (chain ID 1337) and press Connect.`, "warning");
    return;
  }

  // cacheTimeout -1: Ganache mines instantly, so Ethers' default 250 ms cache would
  // hand back stale balances and event lists straight after a transaction.
  provider = new ethers.BrowserProvider(window.ethereum, undefined, { cacheTimeout: -1 });
  signer = await provider.getSigner();
  account = await signer.getAddress();

  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (run !== initRun) return;
  if (code === "0x") {
    resetConnection();
    notice("No contract found at the configured address on this network. Is Ganache running and the contract deployed?", "danger");
    return;
  }

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  clearNotice();
  showDashboard(true);
  await refreshAll();
  setHeaderButton(account);
}

function resetConnection() {
  provider = signer = contract = account = null;
  showDashboard(false);
  setHeaderButton(null);
}

function setHeaderButton(address) {
  const btn = $("headerConnect");
  btn.classList.toggle("is-connected", !!address);
  btn.querySelector("span").textContent = address ? short(address) : "Connect MetaMask";
}

// ---------------------------------------------------------------------------
// Reading data from the blockchain
// ---------------------------------------------------------------------------
async function refreshAll() {
  const [admin, deposit, count, balance] = await Promise.all([
    contract.admin(),
    contract.claimDeposit(),
    contract.itemCount(),
    provider.getBalance(account),
  ]);
  adminAddress = admin;
  depositWei = deposit;

  $("walletNet").textContent = `${CHAIN.name} · chain 1337`;
  $("walletRole").textContent = sameAddress(account, admin) ? "Admin" : "Regular user";
  $("walletAddr").textContent = account;
  $("walletBal").textContent = `${Number(ethers.formatEther(balance)).toFixed(4)} ETH`;

  $("statCount").textContent = count.toString();
  $("statDeposit").textContent = `${ethers.formatEther(deposit)} ETH`;
  $("statContract").textContent = short(CONTRACT_ADDRESS);
  $("statContract").title = CONTRACT_ADDRESS;
  $("statAdmin").textContent = short(admin);
  $("statAdmin").title = admin;

  const depositInput = $("depositInput");
  if (!depositInput.dataset.edited) depositInput.value = ethers.formatEther(deposit);

  await Promise.all([loadItems(Number(count)), loadActivity()]);
}

async function loadItems(count) {
  const list = $("items");
  list.replaceChildren();
  if (count === 0) {
    list.append(el("p", "empty-state", "No items reported yet. Report the first one above."));
    return;
  }
  const ids = Array.from({ length: count }, (_, i) => count - i); // newest first
  const items = await Promise.all(ids.map((id) => contract.getItem(id)));
  items.forEach((item) => list.append(renderItem(item)));
}

function renderItem(item) {
  const status = Number(item.status);
  const id = item.id;
  const hasClaim = item.claimant !== ethers.ZeroAddress;
  const youTag = (address) => (sameAddress(address, account) ? `${short(address)} (you)` : short(address));

  const body = el("div", "card-body p-4");
  const card = el("article", "card item-card");
  card.append(body);

  const head = el("div", "item-head");
  const titleBox = el("div");
  titleBox.append(el("span", "item-id", `ITEM #${id}`), el("h3", "item-title", item.description));
  head.append(titleBox, el("span", `status-badge s${status}`, STATUS[status]));
  body.append(head);

  const meta = el("dl", "item-meta");
  const addMeta = (label, value, mono = false) => {
    meta.append(el("dt", "", label), el("dd", mono ? "mono" : "", value));
  };
  addMeta("Location", item.location);
  addMeta("Found by", youTag(item.finder), true);
  addMeta("Reported", new Date(Number(item.reportedAt) * 1000).toLocaleString());
  if (hasClaim) {
    addMeta("Claimed by", youTag(item.claimant), true);
    addMeta("Proof", item.claimProof);
  }
  if (status === 1) addMeta("Deposit held", `${ethers.formatEther(item.deposit)} ETH`);
  body.append(meta);

  const isFinder = sameAddress(account, item.finder);
  const isClaimant = sameAddress(account, item.claimant);

  if (status === 0) {
    const proof = el("input", "form-control form-control-sm mb-2");
    proof.placeholder = "Proof it is yours (e.g. what is inside)";
    body.append(
      roleGroup("Claimant", !isFinder, [
        proof,
        actionButton("Claim item", "btn-primary", () => send("Claim item", "claimItem", () => [id, proof.value], () => ({ value: readDeposit() }))),
      ]),
      roleGroup("Finder", isFinder, [
        actionButton("Cancel report", "btn-outline-secondary", () => send("Cancel report", "cancelReport", () => [id])),
      ]),
    );
  } else if (status === 1) {
    body.append(
      roleGroup("Finder", isFinder, [
        actionButton("Approve claim", "btn-primary", () => send("Approve claim", "approveClaim", () => [id])),
        actionButton("Reject claim", "btn-outline-danger", () => send("Reject claim", "rejectClaim", () => [id])),
      ]),
      roleGroup("Claimant", isClaimant, [
        actionButton("Cancel my claim", "btn-outline-secondary", () => send("Cancel claim", "cancelClaim", () => [id])),
      ]),
    );
  } else {
    body.append(el("p", "closed-note", status === 2 ? "Returned to its owner. Deposit refunded." : "This report was withdrawn by the finder."));
  }
  return card;
}

function roleGroup(role, mine, children) {
  const group = el("div", `role-group${mine ? " mine" : ""}`);
  group.append(el("span", "role-label", `${role} only`));
  const row = el("div", "btn-row");
  row.append(...children);
  group.append(row);
  return group;
}

function actionButton(label, cls, onClick) {
  const button = el("button", `btn btn-sm js-action ${cls}`, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

async function loadActivity() {
  const list = $("activity");
  list.replaceChildren();
  try {
    const logs = await contract.queryFilter("*", 0, "latest");
    if (logs.length === 0) {
      list.append(el("li", "text-muted", "No events yet."));
      return;
    }
    logs.slice(-15).reverse().forEach((log) => {
      const row = el("li");
      row.append(el("span", "tag", `block ${log.blockNumber}`), el("span", "detail", log.eventName));
      const details = log.fragment.inputs
        .map((input, i) => {
          const value = log.args[i];
          return `${input.name}: ${typeof value === "string" && value.startsWith("0x") ? short(value) : value.toString()}`;
        })
        .join("   ");
      row.append(el("span", "sub", details));
      list.append(row);
    });
  } catch (err) {
    list.append(el("li", "text-muted", "Could not load events."));
  }
}

// ---------------------------------------------------------------------------
// Sending transactions
// ---------------------------------------------------------------------------
// Parse an ETH amount typed by the user into wei, with a readable error if it is not a number.
function parseEth(text) {
  try {
    return ethers.parseEther(text.trim());
  } catch (_) {
    throw new Error("Enter a valid amount in ETH, for example 0.001.");
  }
}

function readDeposit() {
  return parseEth($("depositInput").value);
}

// getArgs / getOverrides are functions so form values are read at click time and
// invalid input (e.g. a bad number) is caught by the try/catch below.
async function send(label, fn, getArgs = () => [], getOverrides = () => ({})) {
  if (!contract) {
    notice("Connect MetaMask first.", "warning");
    return false;
  }
  document.body.classList.add("is-busy");
  let args = [];
  let overrides = {};
  try {
    args = getArgs();
    overrides = { ...getOverrides() };
    // "Send even if it will fail": a fixed gas limit skips the pre-check, so MetaMask
    // submits the transaction and it is recorded on-chain as a failed transaction.
    if ($("forceSend").checked) overrides.gasLimit = 500000n;

    notice(`${label}: confirm the transaction in MetaMask…`, "info");
    const tx = await contract[fn](...args, overrides);
    notice(`${label}: sent (${short(tx.hash)}). Waiting for confirmation…`, "info");
    const receipt = await tx.wait();

    txLog.unshift({ label, ok: true, hash: tx.hash, block: receipt.blockNumber, gas: receipt.gasUsed });
    notice(`${label}: confirmed in block ${receipt.blockNumber}.`, "success");
    renderTxLog();
    await refreshAll();
    return true;
  } catch (err) {
    const reason = await explain(err, () => contract[fn].staticCall(...args, { ...overrides, from: account }));
    const hash = err.receipt?.hash || err.transaction?.hash || null;
    txLog.unshift({ label, ok: false, hash, reason });
    notice(`${label} failed: ${reason}`, "danger");
    renderTxLog();
    try { await refreshAll(); } catch (_) { /* keep the error message on screen */ }
    return false;
  } finally {
    document.body.classList.remove("is-busy");
  }
}

// Turn an Ethers/MetaMask error into a short, readable reason.
async function explain(err, replay) {
  if (err.code === "ACTION_REJECTED" || err.code === 4001) return "You rejected the request in MetaMask.";

  const direct = err.reason || err.revert?.args?.[0];
  if (direct) return direct;

  // A mined-but-reverted transaction carries no reason, so replay the call to get it.
  if (replay) {
    try {
      await replay();
    } catch (replayErr) {
      const reason = replayErr.reason || replayErr.revert?.args?.[0];
      if (reason) return reason;
    }
  }

  const raw = err.info?.error?.message || err.shortMessage || err.message || String(err);
  // Handles "execution reverted: <reason>" and Ganache's "VM Exception ...: revert <reason>".
  const match = raw.match(/revert(?:ed)?(?: with reason string)?:?\s+'?([^'\n]+)'?/i);
  return match ? match[1].trim() : raw;
}

function renderTxLog() {
  const list = $("txLog");
  list.replaceChildren();
  txLog.slice(0, 12).forEach((entry) => {
    const row = el("li");
    row.append(el("span", `tag ${entry.ok ? "ok" : "fail"}`, entry.ok ? "confirmed" : "failed"), el("span", "detail", entry.label));
    if (entry.ok) {
      row.append(el("span", "sub", `block ${entry.block} · gas ${entry.gas} · ${entry.hash}`));
    } else {
      row.append(el("span", "sub", `${entry.reason}${entry.hash ? ` · ${entry.hash}` : " · not sent"}`));
    }
    list.append(row);
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
document.querySelectorAll(".js-connect").forEach((link) => {
  link.addEventListener("click", () => {
    if (!account) connect();
  });
});

$("reportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  // No client-side checks on purpose: the contract validates the input.
  const ok = await send("Report item", "reportFound", () => [$("desc").value, $("loc").value]);
  if (ok) event.target.reset();
});

$("depositForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = await send("Set claim deposit", "setClaimDeposit", () => [parseEth($("newDeposit").value)]);
  if (ok) event.target.reset();
});

$("refreshBtn").addEventListener("click", () => contract && refreshAll());

$("depositInput").addEventListener("input", (event) => { event.target.dataset.edited = "1"; });
$("resetDeposit").addEventListener("click", () => {
  const input = $("depositInput");
  delete input.dataset.edited;
  input.value = ethers.formatEther(depositWei);
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => init().catch((err) => notice(String(err.message || err), "danger")));
  window.ethereum.on("chainChanged", () => init().catch((err) => notice(String(err.message || err), "danger")));
  init().catch(() => {}); // already connected from an earlier visit? pick it up silently
}

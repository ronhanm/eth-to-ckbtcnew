"use client";
import React, { useState } from "react";
import { ethers } from "ethers";
import { HttpAgent, Actor } from "@dfinity/agent";
import { idlFactory } from './canister_idl';
import bridgeAbi from "./bridgeAbi.json";

declare global {
  interface Window {
    ethereum?: any;
    ic?: any;
  }
}

export default function Home() {
  const [ethAddress, setEthAddress] = useState("");
  const [icpAddress, setIcpAddress] = useState("");
  const [isEthConnected, setIsEthConnected] = useState(false);
  const [isIcpConnected, setIsIcpConnected] = useState(false);
  const [action, setAction] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const contractAddress = process.env.ETH_CONTRACT_ADDRESS ?? "";
  const icCanisterId = process.env.ICP_CANISTER_ID ?? "";
  const icWhitelistCanister = process.env.ICP_WHITELIST_CANISTER ?? "";
  const icHost = process.env.IC_HOST ?? "";

  const handleEthConnect = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      setIsEthConnected(true);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setEthAddress(address);
    } catch (error) {
      console.error(error);
    }
  };

  const handleIcpConnect = async () => {
    if (!window.ic || !window.ic.plug) {
      alert("Please install the Plug Wallet extension!");
      return;
    }
    try {
      const connected = await window.ic.plug.requestConnect({
        whitelist: [icWhitelistCanister],
        host: icHost,
      });

      if (connected) {
        const principal = await window.ic.plug.getPrincipal();
        const principalText = principal.toText();

        if (!principalText || principalText === "aaaaa-aa") {
          throw new Error("Invalid Principal ID received from Plug wallet.");
        }

        setIsIcpConnected(true);
        setIcpAddress(principalText);
      } else {
        alert("Plug Wallet connection failed.");
      }
    } catch (error) {
      console.error("Error connecting to Plug wallet:", error);
      setTransactionStatus(`Error connecting to Plug wallet: ${error.message}`);
    }
  };

  const handleDepositWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransactionStatus('');
    setLoading(true);

    try {
      if (!isEthConnected || !isIcpConnected) {
        setTransactionStatus("Please connect both Ethereum and ICP wallets.");
        return;
      }

      let tx;

      if (action === "deposit") {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const network = await provider.getNetwork();

        if (network.chainId !== 11155111) {
          setTransactionStatus("Please switch to the Sepolia network.");
          return;
        }

        const contract = new ethers.Contract(contractAddress, bridgeAbi, signer);
        const icPrincipal = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(icpAddress));

        tx = await contract.deposit(icPrincipal, {
          value: ethers.utils.parseEther(amount),
        });

        await tx.wait();
        setTransactionStatus(`Transaction successful: ${tx.hash}`);
      } else {
        const agent = await HttpAgent.create({ host: icHost });
        await agent.fetchRootKey();

        const actor = Actor.createActor(idlFactory, {
          agent,
          canisterId: icCanisterId,
        });

        const amountToWithdraw = BigInt((parseFloat(amount) * 1_000_000_000).toFixed(0));

        const result = await actor.withdraw({
          amount: amountToWithdraw,
          ethAddress: ethAddress,
        });

        setTransactionStatus(result ? 'Withdrawal successful' : 'Withdrawal failed');
      }
    } catch (error: any) {
      console.error("Transaction error:", error);
      setTransactionStatus(`Transaction failed: ${error?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-lg">
        <h1 className="text-3xl font-bold text-center mb-6">ETH to ckETH Bridge</h1>

        {/* Connect Ethereum Wallet */}
        <button onClick={handleEthConnect} className={`mb-4 w-full py-3 px-4 rounded-lg text-white transition ${isEthConnected ? 'bg-red-500' : 'bg-green-500'}`}>
          {isEthConnected ? "Disconnect MetaMask" : "Connect MetaMask"}
        </button>
        {isEthConnected && <p className="text-center text-sm mb-4">Connected to Ethereum: {ethAddress}</p>}

        {/* Connect ICP Wallet */}
        <button onClick={handleIcpConnect} className={`mb-4 w-full py-3 px-4 rounded-lg text-white transition ${isIcpConnected ? 'bg-red-500' : 'bg-blue-500'}`}>
          {isIcpConnected ? "Disconnect Plug" : "Connect Plug Wallet"}
        </button>
        {isIcpConnected && <p className="text-center text-sm mb-4">Connected to ICP: {icpAddress}</p>}

        {/* Action Dropdown */}
        <div className="mb-4">
          <label className="block text-gray-700 mb-2 text-center">Select Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="p-3 border rounded w-full text-center">
            <option value="deposit">Deposit</option>
            <option value="withdraw">Withdraw</option>
          </select>
        </div>

        {/* Transaction Form */}
        <form onSubmit={handleDepositWithdraw} className="mb-4">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="p-3 border rounded w-full mb-4"
          />
          <button type="submit" disabled={!amount || isNaN(Number(amount))} className="w-full bg-blue-500 text-white py-3 rounded-lg disabled:opacity-50">
            {action === "deposit" ? "Deposit ETH" : "Withdraw ckETH"}
          </button>
        </form>

        {loading && <div className="loader mt-4 mx-auto"></div>}
        <p className={`mt-4 text-center ${transactionStatus.includes('failed') ? 'text-red-500' : 'text-green-500'}`}>
          {transactionStatus}
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { auth } from "../lib/firebase";

export default function PlaidConnectButton() {
  const [linkToken, setLinkToken] = useState("");
  const [status, setStatus] = useState("Not connected");

  useEffect(() => {
    async function createToken() {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.uid }),
        });

        const data = await res.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
        } else {
          setStatus("Could not create link token");
        }
      } catch {
        setStatus("Could not create link token");
      }
    }

    createToken();
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const res = await fetch("/api/plaid/exchange-public-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token,
            metadata,
            userId: user.uid,
          }),
        });

        const data = await res.json();

        if (data.success) {
          setStatus("Bank connected");
          alert("Bank connected.");
        } else {
          setStatus("Exchange failed");
          alert("Could not connect bank.");
        }
      } catch {
        setStatus("Exchange failed");
        alert("Could not connect bank.");
      }
    },
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken}
        className="w-full rounded-xl border border-[#d4af37] px-4 py-3 font-semibold text-[#f5e4a3] hover:bg-[#23242b] disabled:opacity-50"
      >
        Connect Bank with Plaid
      </button>

      <p className="text-sm text-slate-400">Status: {status}</p>
    </div>
  );
}

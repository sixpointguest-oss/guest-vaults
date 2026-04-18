"use client";

import Image from "next/image";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type ProfileType = "military" | "college_student" | "financial_stability" | "";
type PayCycleType =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "military_1_15"
  | "military_15_30"
  | "";

type AddType = "income" | "expense" | "savings";
type TransactionType = "income" | "expense" | "bill" | "debt" | "savings";

type UserFinanceData = {
  totalBalance: number;
  savings: number;
  isPremium: boolean;
  fullName: string;
  profileType: ProfileType;
  payCycle: PayCycleType;
  lastPayday: string;
  paydayAmount: number;
};

type BillItem = {
  id: string;
  name: string;
  amount: number;
  dueDate?: string;
  recurring?: boolean;
  paid?: boolean;
  paidDate?: string;
};

type DebtItem = {
  id: string;
  name: string;
  amount: number;
  minimumPayment?: number;
  dueDate?: string;
  recurring?: boolean;
  paid?: boolean;
  paidDate?: string;
};

type TransactionItem = {
  id: string;
  type: TransactionType;
  amount: number;
  note: string;
  createdAt?: any;
};

type BillView = BillItem & {
  effectiveDueDateRaw: Date | null;
  paidForCurrentCycle: boolean;
};

type DebtView = DebtItem & {
  effectiveDueDateRaw: Date | null;
  paidForCurrentCycle: boolean;
};

const defaultUserData: UserFinanceData = {
  totalBalance: 0,
  savings: 0,
  isPremium: false,
  fullName: "",
  profileType: "",
  payCycle: "",
  lastPayday: "",
  paydayAmount: 0,
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[#3a3a42] bg-[#111216] px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-[#d4af37]";

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("");
  const [payCycle, setPayCycle] = useState<PayCycleType>("");
  const [lastPayday, setLastPayday] = useState("");
  const [paydayAmount, setPaydayAmount] = useState(0);
  const [totalBalance, setTotalBalance] = useState(0);
  const [savings, setSavings] = useState(0);
  const [isPremium, setIsPremium] = useState(false);

  const [bills, setBills] = useState<BillItem[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  const [commandMessage, setCommandMessage] = useState(
    "Set up your profile, then build your vault with bills, debt, income, and expenses."
  );

  const [showAdd, setShowAdd] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [showDebt, setShowDebt] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showBuy, setShowBuy] = useState(false);

  const [addType, setAddType] = useState<AddType>("income");
  const [addAmount, setAddAmount] = useState("");
  const [addNote, setAddNote] = useState("");

  const [billName, setBillName] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [billRecurring, setBillRecurring] = useState(true);

  const [debtName, setDebtName] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtMinimumPayment, setDebtMinimumPayment] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtRecurring, setDebtRecurring] = useState(true);

  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileTypeInput, setProfileTypeInput] = useState<ProfileType>("");
  const [payCycleInput, setPayCycleInput] = useState<PayCycleType>("");
  const [lastPaydayInput, setLastPaydayInput] = useState("");
  const [paydayAmountInput, setPaydayAmountInput] = useState("");

  const [buyAmount, setBuyAmount] = useState("");
  const [buyNote, setBuyNote] = useState("");
  const [buyResult, setBuyResult] = useState("");

  const [plaidLinkToken, setPlaidLinkToken] = useState("");
  const [plaidStatus, setPlaidStatus] = useState("Not connected");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data() as Partial<UserFinanceData>;
          setFullName(data.fullName ?? "");
          setProfileType((data.profileType ?? "") as ProfileType);
          setPayCycle((data.payCycle ?? "") as PayCycleType);
          setLastPayday(data.lastPayday ?? "");
          setPaydayAmount(typeof data.paydayAmount === "number" ? data.paydayAmount : 0);
          setTotalBalance(typeof data.totalBalance === "number" ? data.totalBalance : 0);
          setSavings(typeof data.savings === "number" ? data.savings : 0);
          setIsPremium(Boolean(data.isPremium ?? false));
        } else {
          await setDoc(userRef, defaultUserData);
        }

        await Promise.all([
          loadBills(currentUser.uid),
          loadDebts(currentUser.uid),
          loadTransactions(currentUser.uid),
          createPlaidLinkToken(currentUser.uid),
        ]);
      } catch (error: any) {
        alert(error.message || "Failed to load account.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function createPlaidLinkToken(userId: string) {
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.link_token) {
        setPlaidLinkToken(data.link_token);
        setPlaidStatus("Ready to connect");
      } else {
        setPlaidStatus("Could not create link token");
      }
    } catch {
      setPlaidStatus("Could not create link token");
    }
  }

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken || null,
    onSuccess: async (public_token, metadata) => {
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
          setPlaidStatus("Bank connected");
          setCommandMessage("Bank connected. Next step is syncing transactions.");
          alert("Bank connected.");
        } else {
          setPlaidStatus("Exchange failed");
          alert("Could not connect bank.");
        }
      } catch {
        setPlaidStatus("Exchange failed");
        alert("Could not connect bank.");
      }
    },
  });

  async function loadBills(uid: string) {
    const snap = await getDocs(
      query(collection(db, "users", uid, "bills"), orderBy("createdAt", "desc"))
    );
    setBills(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BillItem)));
  }

  async function loadDebts(uid: string) {
    const snap = await getDocs(
      query(collection(db, "users", uid, "debts"), orderBy("createdAt", "desc"))
    );
    setDebts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DebtItem)));
  }

  async function loadTransactions(uid: string) {
    const snap = await getDocs(
      query(collection(db, "users", uid, "transactions"), orderBy("createdAt", "desc"))
    );
    setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionItem)));
  }

  async function saveUserData(next: Partial<UserFinanceData>) {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), next);
  }

  async function addTransaction(type: TransactionType, amount: number, note: string) {
    if (!user) return;
    await addDoc(collection(db, "users", user.uid, "transactions"), {
      type,
      amount,
      note,
      createdAt: serverTimestamp(),
    });
  }

  const billViews: BillView[] = useMemo(() => bills.map((item) => buildBillView(item)), [bills]);
  const debtViews: DebtView[] = useMemo(() => debts.map((item) => buildDebtView(item)), [debts]);

  const billsTotal = useMemo(
    () => bills.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [bills]
  );
  const debtTotal = useMemo(
    () => debts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [debts]
  );
  const debtMinimumTotal = useMemo(
    () => debts.reduce((sum, item) => sum + Number(item.minimumPayment || item.amount || 0), 0),
    [debts]
  );

  const safeToSpend = Math.max(0, totalBalance - (billsTotal + debtTotal));
  const totalObligations = billsTotal + debtTotal;

  const totalMoneyView = totalBalance + safeToSpend + billsTotal + debtTotal + savings;
  const totalBalancePct = totalMoneyView > 0 ? Math.round((totalBalance / totalMoneyView) * 100) : 0;
  const safeToSpendPct = totalMoneyView > 0 ? Math.round((safeToSpend / totalMoneyView) * 100) : 0;
  const billsPct = totalMoneyView > 0 ? Math.round((billsTotal / totalMoneyView) * 100) : 0;
  const debtPct = totalMoneyView > 0 ? Math.round((debtTotal / totalMoneyView) * 100) : 0;
  const savingsPct = totalMoneyView > 0 ? Math.round((savings / totalMoneyView) * 100) : 0;
  const vaultScore = Math.max(0, 100 - Math.round((totalObligations / (totalBalance + 1)) * 35));

  const payCycleInfo = getPayCycleInfo(payCycle, lastPayday);

  const dueBillsBeforeNextPayday = billViews
    .filter(
      (x) =>
        x.effectiveDueDateRaw &&
        !x.paidForCurrentCycle &&
        payCycleInfo.nextPayDateRaw &&
        x.effectiveDueDateRaw.getTime() <= payCycleInfo.nextPayDateRaw.getTime()
    )
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0));

  const dueDebtsBeforeNextPayday = debtViews
    .filter(
      (x) =>
        x.effectiveDueDateRaw &&
        !x.paidForCurrentCycle &&
        payCycleInfo.nextPayDateRaw &&
        x.effectiveDueDateRaw.getTime() <= payCycleInfo.nextPayDateRaw.getTime()
    )
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0));

  const dueBeforeNextPaydayTotal =
    dueBillsBeforeNextPayday.reduce((sum, x) => sum + Number(x.amount || 0), 0) +
    dueDebtsBeforeNextPayday.reduce((sum, x) => sum + Number(x.minimumPayment || x.amount || 0), 0);

  const payPeriodSafeToSpend = Math.max(0, totalBalance - dueBeforeNextPaydayTotal);

  const upcomingBills = [...billViews]
    .filter((x) => x.effectiveDueDateRaw)
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0))
    .slice(0, 3);

  const upcomingDebts = [...debtViews]
    .filter((x) => x.effectiveDueDateRaw)
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0))
    .slice(0, 3);

  async function handleSaveProfile() {
    if (!user) return;
    const paydayAmountNumber = Number(paydayAmountInput);

    if (!profileNameInput.trim() || !profileTypeInput || !payCycleInput || !lastPaydayInput) {
      alert("Fill out all profile fields.");
      return;
    }
    if (!paydayAmountNumber || paydayAmountNumber <= 0) {
      alert("Enter a valid payday amount.");
      return;
    }

    try {
      setSaving(true);
      await saveUserData({
        fullName: profileNameInput.trim(),
        profileType: profileTypeInput,
        payCycle: payCycleInput,
        lastPayday: lastPaydayInput,
        paydayAmount: paydayAmountNumber,
      });

      setFullName(profileNameInput.trim());
      setProfileType(profileTypeInput);
      setPayCycle(payCycleInput);
      setLastPayday(lastPaydayInput);
      setPaydayAmount(paydayAmountNumber);

      setCommandMessage("Profile settings updated.");
      setShowProfile(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMoney() {
    const num = Number(addAmount);
    if (!num || num <= 0) {
      alert("Enter a valid amount.");
      return;
    }

    let nextTotal = totalBalance;
    let nextSavings = savings;

    if (addType === "income") nextTotal += num;

    if (addType === "expense") {
      if (num > safeToSpend || num > totalBalance) {
        alert("That expense is too high.");
        return;
      }
      nextTotal -= num;
    }

    if (addType === "savings") {
      if (!isPremium) {
        alert("Savings account is premium only right now.");
        return;
      }
      if (num > safeToSpend || num > totalBalance) {
        alert("You do not have enough money.");
        return;
      }
      nextTotal -= num;
      nextSavings += num;
    }

    try {
      setSaving(true);
      await saveUserData({ totalBalance: nextTotal, savings: nextSavings });
      setTotalBalance(nextTotal);
      setSavings(nextSavings);
      await addTransaction(addType, num, addNote.trim() || `${getTransactionLabel(addType)} added`);
      await loadTransactions(user!.uid);
      setAddAmount("");
      setAddNote("");
      setShowAdd(false);
      setCommandMessage(`${getTransactionLabel(addType)} saved.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBill() {
    if (!user) return;
    const amount = Number(billAmount);
    if (!billName.trim() || !amount || amount <= 0 || !billDueDate) {
      alert("Fill out the full bill.");
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, "users", user.uid, "bills"), {
        name: billName.trim(),
        amount,
        dueDate: billDueDate,
        recurring: billRecurring,
        paid: false,
        paidDate: "",
        createdAt: serverTimestamp(),
      });
      await addTransaction("bill", amount, `Added bill: ${billName.trim()}`);
      await loadBills(user.uid);
      await loadTransactions(user.uid);
      setBillName("");
      setBillAmount("");
      setBillDueDate("");
      setBillRecurring(true);
      setShowBill(false);
      setCommandMessage(`Bill "${billName.trim()}" added.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDebt() {
    if (!user) return;
    const amount = Number(debtAmount);
    const minimumPayment = Number(debtMinimumPayment);
    if (!debtName.trim() || !amount || amount <= 0 || !minimumPayment || minimumPayment <= 0 || !debtDueDate) {
      alert("Fill out the full debt.");
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, "users", user.uid, "debts"), {
        name: debtName.trim(),
        amount,
        minimumPayment,
        dueDate: debtDueDate,
        recurring: debtRecurring,
        paid: false,
        paidDate: "",
        createdAt: serverTimestamp(),
      });
      await addTransaction("debt", minimumPayment, `Added debt: ${debtName.trim()}`);
      await loadDebts(user.uid);
      await loadTransactions(user.uid);
      setDebtName("");
      setDebtAmount("");
      setDebtMinimumPayment("");
      setDebtDueDate("");
      setDebtRecurring(true);
      setShowDebt(false);
      setCommandMessage(`Debt "${debtName.trim()}" added.`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleBillPaid(item: BillView) {
    if (!user) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "users", user.uid, "bills", item.id), {
        paid: !item.paidForCurrentCycle,
        paidDate: !item.paidForCurrentCycle ? todayString() : "",
      });
      await loadBills(user.uid);
      await addTransaction(
        "bill",
        Number(item.amount || 0),
        `${!item.paidForCurrentCycle ? "Marked bill paid" : "Marked bill unpaid"}: ${item.name}`
      );
      await loadTransactions(user.uid);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDebtPaid(item: DebtView) {
    if (!user) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "users", user.uid, "debts", item.id), {
        paid: !item.paidForCurrentCycle,
        paidDate: !item.paidForCurrentCycle ? todayString() : "",
      });
      await loadDebts(user.uid);
      await addTransaction(
        "debt",
        Number(item.minimumPayment || item.amount || 0),
        `${!item.paidForCurrentCycle ? "Marked debt paid" : "Marked debt unpaid"}: ${item.name}`
      );
      await loadTransactions(user.uid);
    } finally {
      setSaving(false);
    }
  }

  async function removeBill(item: BillItem) {
    if (!user) return;
    try {
      setSaving(true);
      await deleteDoc(doc(db, "users", user.uid, "bills", item.id));
      await loadBills(user.uid);
    } finally {
      setSaving(false);
    }
  }

  async function removeDebt(item: DebtItem) {
    if (!user) return;
    try {
      setSaving(true);
      await deleteDoc(doc(db, "users", user.uid, "debts", item.id));
      await loadDebts(user.uid);
    } finally {
      setSaving(false);
    }
  }

  function handleCanIBuyThis() {
    const num = Number(buyAmount);
    if (!num || num <= 0) {
      alert("Enter a valid amount.");
      return;
    }
    const note = buyNote.trim() || "this purchase";
    if (num <= payPeriodSafeToSpend) {
      setBuyResult(
        `Yes — you can buy ${note}. You would still have $${(
          payPeriodSafeToSpend - num
        ).toFixed(2)} left in your pay-period safe to spend.`
      );
    } else {
      setBuyResult(
        `No — ${note} is $${(num - payPeriodSafeToSpend).toFixed(
          2
        )} over your pay-period safe to spend.`
      );
    }
  }

  function openProfileModal() {
    setProfileNameInput(fullName);
    setProfileTypeInput(profileType);
    setPayCycleInput(payCycle);
    setLastPaydayInput(lastPayday);
    setPaydayAmountInput(paydayAmount ? String(paydayAmount) : "");
    setShowProfile(true);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0d0f] text-[#d4af37] text-2xl font-bold">
        Loading Guest Vaults...
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-[#f5f5f5]">
      <header className="border-b border-[#2a2a2f] bg-[#111216]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Image
              src="/guest-vaults-logo.jpg"
              alt="Guest Vaults logo"
              width={48}
              height={48}
              className="h-12 w-12 rounded-md object-contain"
            />
            <span className="text-lg font-bold md:text-xl">Guest Vaults</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openProfileModal}
              className="rounded-full border border-[#d4af37] bg-[#1a1b20] px-4 py-2 font-semibold text-[#f5e4a3] hover:bg-[#23242b]"
            >
              Profile
            </button>
            <button
              onClick={async () => {
                await signOut(auth);
                router.replace("/login");
              }}
              className="rounded-full border border-[#d4af37] bg-[#1a1b20] px-4 py-2 font-semibold text-[#f5e4a3] hover:bg-[#23242b]"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 grid gap-6 lg:grid-cols-[180px_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <Image
              src="/guest-vaults-logo.jpg"
              alt="Guest Vaults logo"
              width={170}
              height={170}
              className="h-32 w-32 rounded-2xl object-contain md:h-40 md:w-40"
            />
          </div>

          <div className="min-w-0">
            <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">
              {getGreeting()}, <span className="text-[#d4af37]">{fullName?.trim() || "User"}</span>
            </h1>
            <p className="mt-3 max-w-3xl text-base text-slate-400 md:text-lg">
              Your budget, bills, debt, pay cycle, and bank connection all in one place.
            </p>
            <div className="mt-4 h-2 w-32 bg-[#d4af37]" />
          </div>
        </div>

        <section className="mb-8 grid gap-6 lg:grid-cols-[1.85fr_1fr]">
          <div className="rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl font-extrabold md:text-3xl">Budget Breakdown</h2>
                <p className="mt-2 max-w-2xl text-base text-slate-400 md:text-lg">
                  Safe to spend is automatically calculated as total balance minus bills and debt.
                </p>
              </div>

              <div className="rounded-xl border border-[#b68a2d] bg-[#111216] px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-[#d4af37] md:text-sm">
                  Vault Score
                </p>
                <p className="text-2xl font-extrabold text-[#f5e4a3] md:text-3xl">
                  {vaultScore}/100
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <BudgetCard title="Total Balance" amount={`$${totalBalance.toFixed(2)}`} percent={`${totalBalancePct}%`} amountClass="text-[#d4af37]" />
              <BudgetCard title="Safe to Spend" amount={`$${safeToSpend.toFixed(2)}`} percent={`${safeToSpendPct}%`} amountClass="text-[#f5e4a3]" />
              <BudgetCard title="Bills" amount={`$${billsTotal.toFixed(2)}`} percent={`${billsPct}%`} amountClass="text-[#c59a3d]" />
              <BudgetCard title="Debt" amount={`$${debtTotal.toFixed(2)}`} percent={`${debtPct}%`} amountClass="text-[#c25757]" />
              <BudgetCard title="Savings" amount={isPremium ? `$${savings.toFixed(2)}` : "Premium Only"} percent={isPremium ? `${savingsPct}%` : "Locked"} amountClass={isPremium ? "text-[#d4d4d8]" : "text-slate-500"} />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <InfoMini title="Total Obligations" value={`$${totalObligations.toFixed(2)}`} sub="Bills + debt combined" className="text-[#c25757]" />
              <InfoMini title="Due Before Next Payday" value={`$${dueBeforeNextPaydayTotal.toFixed(2)}`} sub="Only unpaid items count" className="text-[#f5e4a3]" />
              <div className="rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5">
                <p className="text-base font-semibold text-slate-400">Current Budget Period</p>
                <p className="mt-2 text-base font-bold md:text-lg">{payCycleInfo.currentPeriod}</p>
                <p className="mt-3 text-sm text-slate-400">Next Pay Date: <span className="font-semibold text-[#f5e4a3]">{payCycleInfo.nextPayDate}</span></p>
                <p className="mt-2 text-sm text-slate-400">Payday Amount: <span className="font-semibold text-[#f5e4a3]">${paydayAmount.toFixed(2)}</span></p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <InfoMini title="Pay-Period Safe to Spend" value={`$${payPeriodSafeToSpend.toFixed(2)}`} sub="Total balance minus unpaid items due before next payday" className="text-[#d4af37]" />
              <InfoMini title="Debt Minimums" value={`$${debtMinimumTotal.toFixed(2)}`} sub="Combined minimum payments" className="text-[#ff9f9f]" />
            </div>
          </div>

          <aside className="space-y-5">
            <SideCard title="Profile">
              <p className="whitespace-pre-line text-base leading-7 text-slate-400 md:text-lg">
                {`Type: ${getProfileLabel(profileType)}
Pay Cycle: ${getPayCycleLabel(payCycle)}
Last Payday: ${formatMilitaryDate(lastPayday)}`}
              </p>
              <button onClick={openProfileModal} className="mt-5 text-base font-semibold text-[#f5e4a3] hover:underline">
                Edit profile ›
              </button>
            </SideCard>

            <SideCard title="Weekly Command">
              <p className="text-base leading-7 text-slate-400 md:text-lg">{commandMessage}</p>
            </SideCard>

            <SideCard title="Banking">
              <p className="mb-4 text-base leading-7 text-slate-400 md:text-lg">
                Connect your bank with Plaid to prepare for automatic transaction syncing.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => openPlaid()}
                  disabled={!plaidReady || !plaidLinkToken}
                  className="w-full rounded-xl border border-[#d4af37] px-4 py-3 font-semibold text-[#f5e4a3] hover:bg-[#23242b] disabled:opacity-50"
                >
                  Connect Bank with Plaid
                </button>
                <p className="text-sm text-slate-400">Status: {plaidStatus}</p>
              </div>
            </SideCard>
          </aside>
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <BlockCard title="Upcoming Bills" button="Add Bill" onClick={() => setShowBill(true)}>
            {upcomingBills.length === 0 ? (
              <Empty text="No upcoming bills yet." />
            ) : (
              upcomingBills.map((item) => (
                <UpcomingItem
                  key={item.id}
                  name={item.name}
                  date={formatMilitaryDate(item.effectiveDueDateRaw)}
                  amount={`$${Number(item.amount || 0).toFixed(2)}`}
                  meta={`${item.recurring ? "Recurring" : "One-Time"} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                  paid={item.paidForCurrentCycle}
                />
              ))
            )}
          </BlockCard>

          <BlockCard title="Upcoming Debt Payments" button="Add Debt" onClick={() => setShowDebt(true)}>
            {upcomingDebts.length === 0 ? (
              <Empty text="No upcoming debt payments yet." />
            ) : (
              upcomingDebts.map((item) => (
                <UpcomingItem
                  key={item.id}
                  name={item.name}
                  date={formatMilitaryDate(item.effectiveDueDateRaw)}
                  amount={`$${Number(item.minimumPayment || item.amount || 0).toFixed(2)}`}
                  meta={`${item.recurring ? "Recurring minimum payment" : "One-Time"} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                  paid={item.paidForCurrentCycle}
                />
              ))
            )}
          </BlockCard>
        </section>

        <section className="mb-8 overflow-hidden rounded-2xl border border-[#2a2a2f] bg-[#17181d]">
          <div className="flex flex-col gap-6 bg-[#111216] px-6 py-5 md:flex-row md:items-center md:justify-between">
            <h2 className="text-3xl font-extrabold text-[#f5e4a3] md:text-4xl">Vault</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MiniAction text="Can I Buy This" onClick={() => setShowBuy(true)} />
              <MiniAction text="Bills" onClick={() => setShowBill(true)} />
              <MiniAction text="Debt" onClick={() => setShowDebt(true)} />
              <MiniAction text="Add" onClick={() => setShowAdd(true)} />
            </div>
          </div>

          <div className="px-6 py-3">
            <RowLine title="Guest Vault" subtitle="Total balance" amount={`$${totalBalance.toFixed(2)}`} amountClass="text-[#d4af37]" />
            <RowLine title="Safe to Spend" subtitle="Total balance minus bills and debt" amount={`$${safeToSpend.toFixed(2)}`} amountClass="text-[#f5e4a3]" />
            <RowLine title="Pay-Period Safe to Spend" subtitle="Total balance minus unpaid items due before next payday" amount={`$${payPeriodSafeToSpend.toFixed(2)}`} amountClass="text-[#d8f3a3]" />
            <RowLine title="Savings Account" subtitle={isPremium ? "Premium savings balance" : "Upgrade to premium to unlock savings"} amount={isPremium ? `$${savings.toFixed(2)}` : "Locked"} amountClass={isPremium ? "text-[#d4d4d8]" : "text-slate-500"} />
            <RowLine title="Debt Total" subtitle="Bills + debt combined" amount={`-$${totalObligations.toFixed(2)}`} amountClass="text-[#c25757]" />
          </div>
        </section>

        <BlockCard title="Bills List" button="Add Bill" onClick={() => setShowBill(true)}>
          {billViews.length === 0 ? (
            <Empty text="No bills yet. Add your first bill like rent, phone, or internet." />
          ) : (
            billViews.map((item) => (
              <ManageItem
                key={item.id}
                name={item.name}
                amount={`$${Number(item.amount || 0).toFixed(2)}`}
                lineTwo={`Due: ${formatMilitaryDate(item.effectiveDueDateRaw)}`}
                lineThree={`${item.recurring ? "Recurring" : "One-Time"} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                amountClass={item.paidForCurrentCycle ? "text-slate-500" : "text-[#c59a3d]"}
                primaryLabel={item.paidForCurrentCycle ? "Paid" : "Mark Paid"}
                primaryClass={
                  item.paidForCurrentCycle
                    ? "border-[#2d6a4f] text-[#b7e4c7] hover:bg-[#183a2b]"
                    : "border-[#d4af37] text-[#f5e4a3] hover:bg-[#23242b]"
                }
                onPrimary={() => toggleBillPaid(item)}
                onRemove={() => removeBill(item)}
              />
            ))
          )}
        </BlockCard>

        <div className="mt-8" />

        <BlockCard title="Debt List" button="Add Debt" onClick={() => setShowDebt(true)}>
          {debtViews.length === 0 ? (
            <Empty text="No debt yet. Add your first debt like credit card, personal loan, or car note." />
          ) : (
            debtViews.map((item) => (
              <ManageItem
                key={item.id}
                name={item.name}
                amount={`$${Number(item.amount || 0).toFixed(2)}`}
                lineTwo={`Minimum Payment: $${Number(item.minimumPayment || 0).toFixed(2)}`}
                lineThree={`Due: ${formatMilitaryDate(item.effectiveDueDateRaw)} • ${item.recurring ? "Recurring" : "One-Time"} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                amountClass={item.paidForCurrentCycle ? "text-slate-500" : "text-[#ff9f9f]"}
                primaryLabel={item.paidForCurrentCycle ? "Paid" : "Mark Paid"}
                primaryClass={
                  item.paidForCurrentCycle
                    ? "border-[#2d6a4f] text-[#b7e4c7] hover:bg-[#183a2b]"
                    : "border-[#d4af37] text-[#f5e4a3] hover:bg-[#23242b]"
                }
                onPrimary={() => toggleDebtPaid(item)}
                onRemove={() => removeDebt(item)}
              />
            ))
          )}
        </BlockCard>

        <div className="mt-8" />

        <BlockCard title="Transaction History" button="Open" onClick={() => undefined}>
          {transactions.length === 0 ? (
            <Empty text="No transactions yet. Add income, expenses, bills, or debt to start your history." />
          ) : (
            transactions.slice(0, 10).map((tx) => (
              <div
                key={tx.id}
                className="flex flex-col gap-3 rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-lg font-bold md:text-xl">{getTransactionLabel(tx.type)}</p>
                  <p className="mt-1 break-words text-sm text-slate-400 md:text-base">{tx.note}</p>
                  <p className="mt-1 text-xs text-slate-500 md:text-sm">{formatMilitaryDate(tx.createdAt)}</p>
                </div>
                <div className={`text-xl font-extrabold md:text-2xl ${getTransactionColor(tx.type)}`}>
                  {tx.type === "income" ? "+" : "-"}${tx.amount.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </BlockCard>
      </section>

      {showAdd && (
        <Modal title="Add New Item" subtitle="Add income, expense, or savings.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Type</label>
          <select value={addType} onChange={(e) => setAddType(e.target.value as AddType)} className={inputClass}>
            <option value="income">Add Income</option>
            <option value="expense">Add Expense</option>
            <option value="savings">Add Savings</option>
          </select>

          <label className="mt-4 block text-sm font-semibold text-slate-300">Amount</label>
          <input value={addAmount} onChange={(e) => setAddAmount(e.target.value)} type="number" placeholder="Enter amount" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Note</label>
          <input value={addNote} onChange={(e) => setAddNote(e.target.value)} type="text" placeholder="Example: Coffee, gas, paycheck" className={inputClass} />

          <ModalActions saving={saving} saveText="Save" onCancel={() => setShowAdd(false)} onSave={handleAddMoney} />
        </Modal>
      )}

      {showBill && (
        <Modal title="Add Bill" subtitle="Add a bill with exact due date and recurring status.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Bill Name</label>
          <input value={billName} onChange={(e) => setBillName(e.target.value)} type="text" placeholder="Example: Rent" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Amount</label>
          <input value={billAmount} onChange={(e) => setBillAmount(e.target.value)} type="number" placeholder="Enter amount" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Due Date</label>
          <input value={billDueDate} onChange={(e) => setBillDueDate(e.target.value)} type="date" className={inputClass} />

          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#3a3a42] bg-[#111216] px-4 py-3">
            <span className="text-sm font-semibold text-slate-300">Recurring</span>
            <input checked={billRecurring} onChange={(e) => setBillRecurring(e.target.checked)} type="checkbox" className="h-4 w-4" />
          </div>

          <ModalActions saving={saving} saveText="Save Bill" onCancel={() => setShowBill(false)} onSave={handleAddBill} />
        </Modal>
      )}

      {showDebt && (
        <Modal title="Add Debt" subtitle="Add debt balance, minimum payment, exact due date, and recurring status.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Debt Name</label>
          <input value={debtName} onChange={(e) => setDebtName(e.target.value)} type="text" placeholder="Example: Credit Card" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Debt Balance</label>
          <input value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} type="number" placeholder="Enter total debt balance" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Minimum Payment</label>
          <input value={debtMinimumPayment} onChange={(e) => setDebtMinimumPayment(e.target.value)} type="number" placeholder="Enter minimum payment" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Due Date</label>
          <input value={debtDueDate} onChange={(e) => setDebtDueDate(e.target.value)} type="date" className={inputClass} />

          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#3a3a42] bg-[#111216] px-4 py-3">
            <span className="text-sm font-semibold text-slate-300">Recurring</span>
            <input checked={debtRecurring} onChange={(e) => setDebtRecurring(e.target.checked)} type="checkbox" className="h-4 w-4" />
          </div>

          <ModalActions saving={saving} saveText="Save Debt" onCancel={() => setShowDebt(false)} onSave={handleAddDebt} />
        </Modal>
      )}

      {showBuy && (
        <Modal title="Can I Buy This?" subtitle="Check whether a purchase fits inside your pay-period safe to spend amount.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Purchase</label>
          <input value={buyNote} onChange={(e) => setBuyNote(e.target.value)} type="text" placeholder="Example: Coffee" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Amount</label>
          <input value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} type="number" placeholder="Enter amount" className={inputClass} />

          {buyResult ? <div className="mt-4 rounded-xl border border-[#3a3120] bg-[#111216] p-4 text-sm leading-6 text-slate-200">{buyResult}</div> : null}

          <ModalActions saving={false} saveText="Check" onCancel={() => setShowBuy(false)} onSave={handleCanIBuyThis} />
        </Modal>
      )}

      {showProfile && (
        <Modal title="Profile Settings" subtitle="Update your profile anytime.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Full Name</label>
          <input value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} type="text" placeholder="Enter your name" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Profile Type</label>
          <select value={profileTypeInput} onChange={(e) => setProfileTypeInput(e.target.value as ProfileType)} className={inputClass}>
            <option value="">Choose one</option>
            <option value="military">Military</option>
            <option value="college_student">College Student</option>
            <option value="financial_stability">Trying to Become Financially Stable</option>
          </select>

          <label className="mt-4 block text-sm font-semibold text-slate-300">Pay Cycle</label>
          <select value={payCycleInput} onChange={(e) => setPayCycleInput(e.target.value as PayCycleType)} className={inputClass}>
            <option value="">Choose one</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="military_1_15">Military (1st and 15th)</option>
            <option value="military_15_30">Military (15th and 30th)</option>
          </select>

          <label className="mt-4 block text-sm font-semibold text-slate-300">Last Payday</label>
          <input value={lastPaydayInput} onChange={(e) => setLastPaydayInput(e.target.value)} type="date" className={inputClass} />

          <label className="mt-4 block text-sm font-semibold text-slate-300">Payday Amount</label>
          <input value={paydayAmountInput} onChange={(e) => setPaydayAmountInput(e.target.value)} type="number" placeholder="Enter amount you usually get paid" className={inputClass} />

          <ModalActions saving={saving} saveText="Save Profile" onCancel={() => setShowProfile(false)} onSave={handleSaveProfile} />
        </Modal>
      )}
    </main>
  );
}

function BudgetCard({
  title,
  amount,
  percent,
  amountClass,
}: {
  title: string;
  amount: string;
  percent: string;
  amountClass: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2a2a2f] bg-[#111216] p-4">
      <p className="text-sm font-semibold leading-5 text-slate-400 md:text-base">{title}</p>
      <p className={`mt-3 truncate font-extrabold leading-tight ${amountTextClass(amount)} ${amountClass}`} title={amount}>
        {amount}
      </p>
      <p className="mt-2 text-base font-semibold text-slate-400 md:text-lg">{percent}</p>
    </div>
  );
}

function InfoMini({
  title,
  value,
  sub,
  className,
}: {
  title: string;
  value: string;
  sub: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5">
      <p className="text-base font-semibold text-slate-400">{title}</p>
      <p className={`mt-1 font-extrabold ${amountTextClass(value)} ${className}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-500 md:text-base">{sub}</p>
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-5 shadow-sm md:p-6">
      <h3 className="text-2xl font-bold md:text-3xl">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BlockCard({
  title,
  button,
  onClick,
  children,
}: {
  title: string;
  button: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold md:text-3xl">{title}</h2>
        <button onClick={onClick} className="rounded-xl border border-[#d4af37] px-5 py-3 text-base font-semibold text-[#f5e4a3] hover:bg-[#23242b] md:text-lg">
          {button}
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function MiniAction({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-w-[88px] flex-col items-center justify-center rounded-xl border border-[#3a3120] bg-[#1a1b20] px-3 py-2 transition hover:bg-[#23242b]">
      <span className="text-xs font-medium text-slate-200 md:text-sm">{text}</span>
    </button>
  );
}

function UpcomingItem({
  name,
  date,
  amount,
  meta,
  paid,
}: {
  name: string;
  date: string;
  amount: string;
  meta: string;
  paid: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#2a2a2f] bg-[#111216] p-4">
      <div className="min-w-0">
        <p className="truncate text-lg font-bold">{name}</p>
        <p className="mt-1 text-sm text-slate-400">{date}</p>
        <p className="mt-1 text-xs text-slate-500">{meta}</p>
      </div>
      <div className={`shrink-0 text-right text-xl font-extrabold ${paid ? "text-slate-500" : "text-[#f5e4a3]"}`}>{amount}</div>
    </div>
  );
}

function RowLine({
  title,
  subtitle,
  amount,
  amountClass,
}: {
  title: string;
  subtitle: string;
  amount: string;
  amountClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2a2a2f] py-5 last:border-b-0">
      <div className="min-w-0 pr-4">
        <p className="text-xl font-semibold md:text-2xl">{title}</p>
        <p className="mt-1 text-sm text-slate-400 md:text-lg">{subtitle}</p>
      </div>
      <div className={`shrink-0 text-right font-semibold ${amountTextClass(amount)} ${amountClass}`} title={amount}>
        {amount}
      </div>
    </div>
  );
}

function ManageItem({
  name,
  amount,
  lineTwo,
  lineThree,
  amountClass,
  primaryLabel,
  primaryClass,
  onPrimary,
  onRemove,
}: {
  name: string;
  amount: string;
  lineTwo: string;
  lineThree: string;
  amountClass: string;
  primaryLabel: string;
  primaryClass: string;
  onPrimary: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 pr-4">
        <p className="break-words text-lg font-bold md:text-xl">{name}</p>
        <p className="mt-1 text-sm text-slate-400">{lineTwo}</p>
        <p className="mt-1 text-xs text-slate-500 md:text-sm">{lineThree}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className={`text-xl font-extrabold md:text-2xl ${amountClass}`}>{amount}</div>
        <button onClick={onPrimary} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition md:text-sm ${primaryClass}`}>
          {primaryLabel}
        </button>
        <button onClick={onRemove} className="rounded-lg border border-[#c25757] px-3 py-2 text-xs font-semibold text-[#f5b1b1] transition hover:bg-[#2a1717] md:text-sm">
          Remove
        </button>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-[#2a2a2f] bg-[#111216] p-6 text-base text-slate-500 md:text-lg">{text}</div>;
}

function Modal({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6 shadow-2xl">
        <h3 className="text-2xl font-extrabold">{title}</h3>
        <p className="mt-2 text-slate-400">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  saveText,
  onCancel,
  onSave,
}: {
  saving: boolean;
  saveText: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-6 flex gap-3">
      <button onClick={onCancel} className="flex-1 rounded-xl border border-[#3a3a42] px-4 py-3 font-semibold text-slate-300 hover:bg-[#23242b]">
        Cancel
      </button>
      <button onClick={onSave} disabled={saving} className="flex-1 rounded-xl bg-[#b68a2d] px-4 py-3 font-semibold text-[#111216] hover:bg-[#d4af37] disabled:opacity-60">
        {saving ? "Saving..." : saveText}
      </button>
    </div>
  );
}

function getGreeting() {
  const now = new Date();
  const total = now.getHours() * 100 + now.getMinutes();
  if (total >= 500 && total <= 1159) return "Good morning";
  if (total >= 1200 && total <= 1659) return "Good afternoon";
  if (total >= 1700 && total <= 2259) return "Good evening";
  return "Good night";
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatMilitaryDate(value: any) {
  let date: Date | null = null;
  if (value?.toDate) date = value.toDate();
  else if (value instanceof Date) date = value;
  else if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return "N/A";
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getProfileLabel(value: ProfileType) {
  if (value === "military") return "Military";
  if (value === "college_student") return "College Student";
  if (value === "financial_stability") return "Trying to Become Financially Stable";
  return "Not set";
}

function getTransactionLabel(type: AddType | TransactionType) {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  if (type === "bill") return "Bill";
  if (type === "debt") return "Debt";
  if (type === "savings") return "Savings";
  return "Transaction";
}

function getTransactionColor(type: TransactionType) {
  if (type === "income") return "text-[#d4af37]";
  if (type === "expense") return "text-[#f5b1b1]";
  if (type === "bill") return "text-[#f5e4a3]";
  if (type === "debt") return "text-[#ff9f9f]";
  if (type === "savings") return "text-[#cfd5df]";
  return "text-white";
}

function getPayCycleLabel(value: PayCycleType) {
  if (value === "weekly") return "Weekly";
  if (value === "biweekly") return "Biweekly";
  if (value === "monthly") return "Monthly";
  if (value === "military_1_15") return "Military (1st and 15th)";
  if (value === "military_15_30") return "Military (15th and 30th)";
  return "Not set";
}

function amountTextClass(value: string) {
  const length = value.length;
  if (length <= 8) return "text-3xl md:text-4xl";
  if (length <= 11) return "text-2xl md:text-3xl";
  if (length <= 14) return "text-xl md:text-2xl";
  return "text-lg md:text-xl";
}

function getRolledMonthlyDueDate(dueDate?: string) {
  if (!dueDate) return null;
  let date = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  while (date < now) {
    date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12);
  }
  return date;
}

function isPaidForCurrentCycle(
  recurring: boolean | undefined,
  paid: boolean | undefined,
  paidDate: string | undefined,
  effectiveDueDate: Date | null
) {
  if (!paid) return false;
  if (!recurring) return true;
  if (!paidDate || !effectiveDueDate) return false;

  const paidOn = new Date(`${paidDate}T12:00:00`);
  if (Number.isNaN(paidOn.getTime())) return false;

  return paidOn.getFullYear() === effectiveDueDate.getFullYear() && paidOn.getMonth() === effectiveDueDate.getMonth();
}

function buildBillView(item: BillItem): BillView {
  const effectiveDueDateRaw = item.recurring
    ? getRolledMonthlyDueDate(item.dueDate)
    : item.dueDate
    ? new Date(`${item.dueDate}T12:00:00`)
    : null;

  return {
    ...item,
    effectiveDueDateRaw,
    paidForCurrentCycle: isPaidForCurrentCycle(item.recurring, item.paid, item.paidDate, effectiveDueDateRaw),
  };
}

function buildDebtView(item: DebtItem): DebtView {
  const effectiveDueDateRaw = item.recurring
    ? getRolledMonthlyDueDate(item.dueDate)
    : item.dueDate
    ? new Date(`${item.dueDate}T12:00:00`)
    : null;

  return {
    ...item,
    effectiveDueDateRaw,
    paidForCurrentCycle: isPaidForCurrentCycle(item.recurring, item.paid, item.paidDate, effectiveDueDateRaw),
  };
}

function getPayCycleInfo(payCycle: PayCycleType, lastPayday: string) {
  if (!payCycle || !lastPayday) {
    return {
      currentPeriod: "Not set",
      nextPayDate: "Not set",
      nextPayDateRaw: null as Date | null,
    };
  }

  const last = new Date(`${lastPayday}T12:00:00`);
  if (Number.isNaN(last.getTime())) {
    return {
      currentPeriod: "Not set",
      nextPayDate: "Not set",
      nextPayDateRaw: null as Date | null,
    };
  }

  const today = new Date();
  let next = new Date(last);

  if (payCycle === "weekly") {
    while (next <= today) next.setDate(next.getDate() + 7);
  }

  if (payCycle === "biweekly") {
    while (next <= today) next.setDate(next.getDate() + 14);
  }

  if (payCycle === "monthly") {
    while (next <= today) next = new Date(next.getFullYear(), next.getMonth() + 1, last.getDate(), 12);
  }

  if (payCycle === "military_1_15") {
    const year = today.getFullYear();
    const month = today.getMonth();
    const fifteenth = new Date(year, month, 15, 12);
    const firstNextMonth = new Date(year, month + 1, 1, 12);
    next = today < fifteenth ? fifteenth : firstNextMonth;
  }

  if (payCycle === "military_15_30") {
    const year = today.getFullYear();
    const month = today.getMonth();
    const thirtieth = new Date(year, month, 30, 12);
    const fifteenthNextMonth = new Date(year, month + 1, 15, 12);
    next = today < thirtieth ? thirtieth : fifteenthNextMonth;
  }

  const currentEnd = new Date(next);
  currentEnd.setDate(currentEnd.getDate() - 1);

  return {
    currentPeriod: `${formatMilitaryDate(last)} - ${formatMilitaryDate(currentEnd)}`,
    nextPayDate: formatMilitaryDate(next),
    nextPayDateRaw: next,
  };
}

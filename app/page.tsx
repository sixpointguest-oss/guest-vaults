"use client";

import Image from "next/image";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePlaidLink } from "react-plaid-link";
import { auth, db } from "../lib/firebase";
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

type PaymentCadence = "monthly" | "biweekly" | "one_time";

type BillItem = {
  id: string;
  name: string;
  amount: number;
  dueDate?: string;
  recurring?: boolean;
  paymentCadence?: PaymentCadence;
  lastPaymentDate?: string;
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
  paymentCadence?: PaymentCadence;
  lastPaymentDate?: string;
  paid?: boolean;
  paidDate?: string;
};

type TransactionItem = {
  id: string;
  type: TransactionType;
  amount: number;
  note: string;
  category?: string;
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

const MIN_FUN_BUFFER = 50;

const savingsLevels = [
  {
    name: "Level 1 — Survival",
    min: 1000,
    bullets: ["$1,000–$2,000", "You are not panicking over small emergencies."],
  },
  {
    name: "Level 2 — Stability",
    min: 5000,
    bullets: ["$5,000–$10,000", "You are ahead of the majority already."],
  },
  {
    name: "Level 3 — Real Security",
    min: 15000,
    bullets: ["3–6 months expenses", "This is where life stops feeling fragile."],
  },
  {
    name: "Level 4 — Freedom",
    min: 30000,
    bullets: ["6–12 months expenses", "You can leave jobs, take risks, and breathe."],
  },
];


function categorizeSpending(note: string, fallbackType?: string) {
  const n = (note || "").toLowerCase();
  if (fallbackType === "bill") return "Bills";
  if (fallbackType === "debt") return "Debt";
  if (n.includes("rent") || n.includes("electric") || n.includes("internet") || n.includes("phone") || n.includes("insurance")) return "Bills";
  if (n.includes("uber") || n.includes("gas") || n.includes("train") || n.includes("bus") || n.includes("lyft")) return "Transportation";
  if (n.includes("netflix") || n.includes("spotify") || n.includes("subscription") || n.includes("apple music") || n.includes("hulu")) return "Subscriptions";
  if (n.includes("amazon") || n.includes("store") || n.includes("shopping") || n.includes("walmart") || n.includes("target")) return "Shopping";
  if (n.includes("food") || n.includes("restaurant") || n.includes("mcdonald") || n.includes("chipotle") || n.includes("coffee") || n.includes("eat")) return "Food";
  return fallbackType === "expense" ? "Other" : "General";
}

const weeklyCategoryLimits: Record<string, number> = {
  Food: 100,
  Transportation: 75,
  Shopping: 75,
  Subscriptions: 40,
  Bills: 999999,
  Debt: 999999,
  Other: 50,
};

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
  const [billLastPaymentDate, setBillLastPaymentDate] = useState("");
  const [billPaymentCadence, setBillPaymentCadence] = useState<PaymentCadence>("monthly");

  const [debtName, setDebtName] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtMinimumPayment, setDebtMinimumPayment] = useState("");
  const [debtLastPaymentDate, setDebtLastPaymentDate] = useState("");
  const [debtPaymentCadence, setDebtPaymentCadence] = useState<PaymentCadence>("monthly");

  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileTypeInput, setProfileTypeInput] = useState<ProfileType>("");
  const [payCycleInput, setPayCycleInput] = useState<PayCycleType>("");
  const [lastPaydayInput, setLastPaydayInput] = useState("");
  const [paydayAmountInput, setPaydayAmountInput] = useState("");
  const [profileSavingsInput, setProfileSavingsInput] = useState("");

  const [buyAmount, setBuyAmount] = useState("");
  const [buyNote, setBuyNote] = useState("");
  const [buyResult, setBuyResult] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "insights" | "payments">("home");
  const [showNotifications, setShowNotifications] = useState(false);

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
        alert(error?.message || "Failed to load data.");
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
          body: JSON.stringify({ public_token, metadata, userId: user.uid }),
        });
        const data = await res.json();
        if (data.success) {
          setPlaidStatus("Bank connected");
          setCommandMessage("Bank connected. Next step is syncing transactions.");
        } else {
          setPlaidStatus("Exchange failed");
        }
      } catch {
        setPlaidStatus("Exchange failed");
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
      category: categorizeSpending(note, type),
      createdAt: serverTimestamp(),
    });
  }

  const billViews = useMemo<BillView[]>(() => bills.map((item) => buildBillView(item)), [bills]);
  const debtViews = useMemo<DebtView[]>(() => debts.map((item) => buildDebtView(item)), [debts]);

  // 1. Replace static numbers with state-backed totals
  const billsTotal = useMemo(
    () => bills.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [bills]
  );

  const debtTotal = useMemo(
    () => debts.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [debts]
  );

  // 2. Add calculations
  const remainingAfterBills = Math.max(0, totalBalance - billsTotal);
  const remainingAfterDebt = Math.max(0, remainingAfterBills - debtTotal);
  const targetSavingsContribution = Math.max(0, remainingAfterDebt * 0.2);
  const savingsContribution = remainingAfterDebt > MIN_FUN_BUFFER
    ? Math.max(0, Math.min(targetSavingsContribution, remainingAfterDebt - MIN_FUN_BUFFER))
    : 0;
  const safeToSpend = Math.max(MIN_FUN_BUFFER, remainingAfterDebt - savingsContribution);
  const totalObligations = billsTotal + debtTotal;

  const totalMoneyView = totalBalance + billsTotal + debtTotal + savingsContribution + safeToSpend;
  const totalBalancePct = totalMoneyView > 0 ? Math.round((totalBalance / totalMoneyView) * 100) : 0;
  const billsPct = totalMoneyView > 0 ? Math.round((billsTotal / totalMoneyView) * 100) : 0;
  const debtPct = totalMoneyView > 0 ? Math.round((debtTotal / totalMoneyView) * 100) : 0;
  const savingsContributionPct = totalMoneyView > 0 ? Math.round((savingsContribution / totalMoneyView) * 100) : 0;
  const safeToSpendPct = totalMoneyView > 0 ? Math.round((safeToSpend / totalMoneyView) * 100) : 0;
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

  const payPeriodSafeToSpend = Math.max(MIN_FUN_BUFFER, totalBalance - dueBeforeNextPaydayTotal - savingsContribution);

  const upcomingBills = [...billViews]
    .filter((x) => x.effectiveDueDateRaw)
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0))
    .slice(0, 3);

  const upcomingDebts = [...debtViews]
    .filter((x) => x.effectiveDueDateRaw)
    .sort((a, b) => (a.effectiveDueDateRaw?.getTime() || 0) - (b.effectiveDueDateRaw?.getTime() || 0))
    .slice(0, 3);

  // 3. Show current savings level + next target
  const savingsProgressAmount = isPremium ? savings : totalBalance;
  const currentSavingsLevel = useMemo(() => {
    let current = "Level 0 — Getting Started";
    for (const level of savingsLevels) {
      if (savingsProgressAmount >= level.min) current = level.name;
    }
    return current;
  }, [savingsProgressAmount]);

  const nextSavingsLevel = useMemo(() => {
    return savingsLevels.find((level) => savingsProgressAmount < level.min) || null;
  }, [savingsProgressAmount]);


const amountToNextLevel = nextSavingsLevel ? Math.max(0, nextSavingsLevel.min - savingsProgressAmount) : 0;
const savingsProgressPercent = nextSavingsLevel
  ? Math.max(0, Math.min(100, (savingsProgressAmount / nextSavingsLevel.min) * 100))
  : 100;
const estimatedSavingsPerCycle = Math.max(savingsContribution, paydayAmount > 0 ? paydayAmount * 0.2 : 0);
const estimatedCyclesToNextLevel =
  amountToNextLevel > 0 && estimatedSavingsPerCycle > 0
    ? Math.ceil(amountToNextLevel / estimatedSavingsPerCycle)
    : null;


  const hasProfile =
    fullName.trim() !== "" &&
    profileType !== "" &&
    payCycle !== "" &&
    lastPayday !== "" &&
    paydayAmount > 0;
  const hasBills = bills.length > 0;
  const hasDebt = debts.length > 0;
  const hasReviewedSafeToSpend = totalBalance > 0 || bills.length > 0 || debts.length > 0;
  const hasConnectedBank = plaidStatus === "Bank connected";

  const onboardingSteps = [
    {
      title: "Complete Profile",
      description: "Add your name, profile type, pay cycle, last payday, and payday amount.",
      done: hasProfile,
      actionLabel: hasProfile ? "Done" : "Open Profile",
      onClick: () => {
        setProfileNameInput(fullName);
        setProfileTypeInput(profileType);
        setPayCycleInput(payCycle);
        setLastPaydayInput(lastPayday);
        setPaydayAmountInput(paydayAmount ? String(paydayAmount) : "");
        setProfileSavingsInput(String(savings || 0));
        setShowProfile(true);
      },
    },
    {
      title: "Add First Bill",
      description: "Add your first bill like rent, phone, internet, or insurance.",
      done: hasBills,
      actionLabel: hasBills ? "Done" : "Add Bill",
      onClick: () => setShowBill(true),
    },
    {
      title: "Add First Debt",
      description: "Add debt like a credit card, personal loan, or car payment.",
      done: hasDebt,
      actionLabel: hasDebt ? "Done" : "Add Debt",
      onClick: () => setShowDebt(true),
    },
    {
      title: "Review Safe to Spend",
      description: "See what is left after bills, debt, and savings contribution.",
      done: hasReviewedSafeToSpend,
      actionLabel: "View Budget",
      onClick: () => {
        const section = document.getElementById("budget-breakdown");
        section?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      title: "Connect Bank",
      description: "Connect your bank with Plaid to prepare for automatic syncing.",
      done: hasConnectedBank,
      actionLabel: hasConnectedBank ? "Done" : "Connect Bank",
      onClick: () => {
        const section = document.getElementById("banking-card");
        section?.scrollIntoView({ behavior: "smooth" });
      },
    },
  ];

  const completedSteps = onboardingSteps.filter((step) => step.done).length;

  const weeklyTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : tx.createdAt ? new Date(tx.createdAt) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        start.setDate(now.getDate() - now.getDay());
        return d >= start && ["expense", "bill", "debt"].includes(tx.type);
      }),
    [transactions]
  );

  const weeklyCategoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const tx of weeklyTransactions) {
      const category = tx.category || categorizeSpending(tx.note, tx.type);
      totals[category] = (totals[category] || 0) + Number(tx.amount || 0);
    }
    return totals;
  }, [weeklyTransactions]);

  const totalWeeklySpent = useMemo(
    () => Object.values(weeklyCategoryTotals).reduce((sum, amount) => sum + amount, 0),
    [weeklyCategoryTotals]
  );

  const topWeeklyCategory = useMemo(() => {
    const entries = Object.entries(weeklyCategoryTotals).sort((a, b) => b[1] - a[1]);
    return entries[0] || null;
  }, [weeklyCategoryTotals]);

  const categoryLimitRows = useMemo(() => {
    return Object.entries(weeklyCategoryLimits)
      .filter(([, limit]) => limit < 999999)
      .map(([name, limit]) => {
        const spent = weeklyCategoryTotals[name] || 0;
        const remaining = Math.max(0, limit - spent);
        const isOver = spent > limit;
        const usagePct = limit > 0 ? Math.min(999, Math.round((spent / limit) * 100)) : 0;
        const status =
          isOver ? "Over Limit" : usagePct >= 90 ? "Close" : usagePct >= 60 ? "Watch" : "On Track";
        return { name, limit, spent, remaining, isOver, usagePct, status };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [weeklyCategoryTotals]);

  const spendingInsights = useMemo(() => {
    const insights: string[] = [];
    if (topWeeklyCategory && totalWeeklySpent > 0) {
      insights.push(`${topWeeklyCategory[0]} was your top category this week at $${topWeeklyCategory[1].toFixed(2)}.`);
      insights.push(`${Math.round((topWeeklyCategory[1] / totalWeeklySpent) * 100)}% of weekly spending went to ${topWeeklyCategory[0].toLowerCase()}.`);
    }
    if (billsTotal + debtTotal > totalBalance && totalBalance > 0) {
      insights.push(`Bills and debt are higher than your current balance right now.`);
    } else if (totalBalance > 0 && billsTotal + debtTotal > totalBalance * 0.6) {
      insights.push(`Bills and debt are taking most of your balance right now.`);
    }
    if (safeToSpend <= MIN_FUN_BUFFER) {
      insights.push(`You only have your minimum outing buffer left in safe to spend.`);
    }
    const overLimitCategory = categoryLimitRows.find((row) => row.isOver);
    if (overLimitCategory) {
      insights.push(`${overLimitCategory.name} is over its weekly limit by $${(overLimitCategory.spent - overLimitCategory.limit).toFixed(2)}.`);
    }
    const closeLimitCategory = categoryLimitRows.find((row) => !row.isOver && row.usagePct >= 85);
    if (closeLimitCategory) {
      insights.push(`${closeLimitCategory.name} is close to its weekly limit with ${closeLimitCategory.usagePct}% used.`);
    }
    return insights.length ? insights : ["Add transactions this week to unlock smarter spending insights."];
  }, [topWeeklyCategory, totalWeeklySpent, billsTotal, debtTotal, totalBalance, safeToSpend, categoryLimitRows]);


  const nowDate = new Date();
  const daysUntilNextPayday =
    payCycleInfo.nextPayDateRaw
      ? Math.max(0, Math.ceil((payCycleInfo.nextPayDateRaw.getTime() - nowDate.getTime()) / 86400000))
      : null;
  const billReminderBuckets = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let dueThisWeek = 0;
    const allItems = [...billViews, ...debtViews];
    for (const item of allItems) {
      if (!item.effectiveDueDateRaw || item.paidForCurrentCycle) continue;
      const diffDays = Math.ceil((item.effectiveDueDateRaw.getTime() - nowDate.getTime()) / 86400000);
      if (diffDays < 0) overdue += 1;
      if (diffDays >= 0 && diffDays <= 3) dueSoon += 1;
      if (diffDays >= 0 && diffDays <= 7) dueThisWeek += 1;
    }
    return { overdue, dueSoon, dueThisWeek };
  }, [billViews, debtViews, nowDate]);


const notificationItems = useMemo(() => {
  return [...billViews, ...debtViews]
    .filter((item) => item.effectiveDueDateRaw && !item.paidForCurrentCycle)
    .map((item) => {
      const amount = "minimumPayment" in item ? Number(item.minimumPayment || item.amount || 0) : Number(item.amount || 0);
      const diffDays = Math.ceil(((item.effectiveDueDateRaw as Date).getTime() - nowDate.getTime()) / 86400000);
      return {
        id: item.id,
        name: item.name,
        amount,
        diffDays,
        dueDate: item.effectiveDueDateRaw as Date,
        kind: "minimumPayment" in item ? "Debt" : "Bill",
      };
    })
    .filter((item) => item.diffDays <= 7)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}, [billViews, debtViews, nowDate]);

const showStartHere = completedSteps < onboardingSteps.length;



const mainInsight = useMemo(() => {
  if (payPeriodSafeToSpend > MIN_FUN_BUFFER + 75) {
    return `You are safe this pay cycle — you can spend $${payPeriodSafeToSpend.toFixed(2)} without hurting your core priorities.`;
  }
  if (topWeeklyCategory && totalWeeklySpent > 0) {
    const pct = Math.round((topWeeklyCategory[1] / totalWeeklySpent) * 100);
    return `${topWeeklyCategory[0]} is your top spending category this week at ${pct}% of your weekly spending.`;
  }
  if (amountToNextLevel > 0 && amountToNextLevel <= 250) {
    return `You are close to your next savings level — only $${amountToNextLevel.toFixed(2)} left.`;
  }
  if (billReminderBuckets.overdue > 0) {
    return `You have ${billReminderBuckets.overdue} overdue item${billReminderBuckets.overdue === 1 ? "" : "s"} to clear first.`;
  }
  return "You are building your vault. Keep covering bills, debt, and savings before flexible spending.";
}, [payPeriodSafeToSpend, topWeeklyCategory, totalWeeklySpent, amountToNextLevel, billReminderBuckets]);

const momentumMessage = useMemo(() => {
  if (savingsProgressPercent >= 100) return "Savings target hit. Keep stacking and move to the next level.";
  if (savingsProgressPercent >= 75) return "You are in the final stretch of your current savings target.";
  if (totalWeeklySpent === 0) return "Clean week so far. Stay disciplined and protect your safe-to-spend.";
  if (topWeeklyCategory) return `Stay sharp — ${topWeeklyCategory[0]} is where most of your weekly money is going.`;
  return "Build momentum by logging bills, debt, and spending consistently.";
}, [savingsProgressPercent, totalWeeklySpent, topWeeklyCategory]);


  async function handleSaveProfile() {
    if (!user) return;
    const paydayAmountNumber = Number(paydayAmountInput);
    const savingsNumber = Number(profileSavingsInput || 0);
    if (!profileNameInput.trim() || !profileTypeInput || !payCycleInput || !lastPaydayInput) {
      alert("Fill out all profile fields.");
      return;
    }
    if (!paydayAmountNumber || paydayAmountNumber <= 0) {
      alert("Enter a valid payday amount.");
      return;
    }
    if (Number.isNaN(savingsNumber) || savingsNumber < 0) {
      alert("Enter a valid savings amount.");
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
        savings: savingsNumber,
      });
      setFullName(profileNameInput.trim());
      setProfileType(profileTypeInput);
      setPayCycle(payCycleInput);
      setLastPayday(lastPaydayInput);
      setPaydayAmount(paydayAmountNumber);
      setSavings(savingsNumber);
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
      if (num > totalBalance) {
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
      if (num > totalBalance) {
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
    if (!billName.trim() || !amount || amount <= 0 || !billLastPaymentDate) {
      alert("Fill out the full bill.");
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, "users", user.uid, "bills"), {
        name: billName.trim(),
        amount,
        lastPaymentDate: billLastPaymentDate,
        paymentCadence: billPaymentCadence,
        paid: false,
        paidDate: "",
        createdAt: serverTimestamp(),
      });
      await addTransaction("bill", amount, `Added bill: ${billName.trim()}`);
      await loadBills(user.uid);
      await loadTransactions(user.uid);
      setBillName("");
      setBillAmount("");
      setBillLastPaymentDate("");
      setBillPaymentCadence("monthly");
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
    if (!debtName.trim() || !amount || amount <= 0 || !minimumPayment || minimumPayment <= 0 || !debtLastPaymentDate) {
      alert("Fill out the full debt.");
      return;
    }

    try {
      setSaving(true);
      await addDoc(collection(db, "users", user.uid, "debts"), {
        name: debtName.trim(),
        amount,
        minimumPayment,
        lastPaymentDate: debtLastPaymentDate,
        paymentCadence: debtPaymentCadence,
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
      setDebtLastPaymentDate("");
      setDebtPaymentCadence("monthly");
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
      await addTransaction("bill", Number(item.amount || 0), `${!item.paidForCurrentCycle ? "Marked bill paid" : "Marked bill unpaid"}: ${item.name}`);
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
      await addTransaction("debt", Number(item.minimumPayment || item.amount || 0), `${!item.paidForCurrentCycle ? "Marked debt paid" : "Marked debt unpaid"}: ${item.name}`);
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
  const afterPurchase = payPeriodSafeToSpend - num;
  const safeSpendPctUsed = payPeriodSafeToSpend > 0 ? Math.round((num / payPeriodSafeToSpend) * 100) : 0;
  const delayedCycles =
    estimatedSavingsPerCycle > 0 ? Math.max(0, Math.ceil(num / estimatedSavingsPerCycle)) : null;

  if (afterPurchase >= MIN_FUN_BUFFER + 25) {
    setBuyResult(
      `Yes — you can buy ${note}. It uses ${safeSpendPctUsed}% of your pay-period safe to spend and leaves $${afterPurchase.toFixed(
        2
      )}. ${delayedCycles ? `It may slow your next savings level by about ${delayedCycles} pay cycle${delayedCycles === 1 ? "" : "s"}.` : ""}`
    );
    return;
  }

  if (afterPurchase >= 0) {
    setBuyResult(
      `Careful — you can buy ${note}, but it uses ${safeSpendPctUsed}% of your pay-period safe to spend and leaves only $${afterPurchase.toFixed(
        2
      )}. ${delayedCycles ? `It may push your next savings level back about ${delayedCycles} pay cycle${delayedCycles === 1 ? "" : "s"}.` : ""}`
    );
    return;
  }

  setBuyResult(
    `No — ${note} is $${Math.abs(afterPurchase).toFixed(2)} over your pay-period safe to spend. ${
      delayedCycles ? `It would also hit your savings progress by about ${delayedCycles} pay cycle${delayedCycles === 1 ? "" : "s"}.` : ""
    }`
  );
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
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3">
              <Image src="/guest-vaults-logo.jpg" alt="Guest Vaults logo" width={48} height={48} className="h-12 w-12 rounded-md object-contain" />
              <span className="text-lg font-bold md:text-xl">Guest Vaults</span>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {[
                { key: "home", label: "Home" },
                { key: "insights", label: "Growth Hub" },
                { key: "payments", label: "Payments Hub" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as "home" | "insights" | "payments")}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? "border-[#d4af37] bg-[#2a2415] text-[#f5e4a3]"
                      : "border-[#3a3a42] bg-[#1a1b20] text-slate-300 hover:bg-[#23242b]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex items-center gap-3">
            <button
              onClick={() => {
                setProfileNameInput(fullName);
                setProfileTypeInput(profileType);
                setPayCycleInput(payCycle);
                setLastPaydayInput(lastPayday);
                setPaydayAmountInput(paydayAmount ? String(paydayAmount) : "");
                setShowProfile(true);
              }}
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
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-full border border-[#d4af37] bg-[#1a1b20] px-4 py-2 font-semibold text-[#f5e4a3] hover:bg-[#23242b]"
              aria-label="Notifications"
            >
              🔔
              {notificationItems.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#c25757] px-1 text-[11px] text-white">
                  {notificationItems.length}
                </span>
              ) : null}
            </button>

            {showNotifications ? (
              <div className="absolute right-0 top-14 z-40 w-[340px] rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Due Within 7 Days</h3>
                  <span className="text-sm text-slate-400">{notificationItems.length} item{notificationItems.length === 1 ? "" : "s"}</span>
                </div>
                <div className="space-y-3">
                  {notificationItems.length === 0 ? (
                    <div className="rounded-xl border border-[#2a2a2f] bg-[#111216] p-4 text-sm text-slate-400">
                      No bills or debt payments due within the next week.
                    </div>
                  ) : (
                    notificationItems.map((item) => (
                      <div key={`${item.kind}-${item.id}`} className="rounded-xl border border-[#2a2a2f] bg-[#111216] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-wide text-[#d4af37]">{item.kind}</p>
                            <p className="mt-1 text-base font-bold text-white">{item.name}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {item.diffDays < 0 ? `${Math.abs(item.diffDays)} day${Math.abs(item.diffDays) === 1 ? "" : "s"} overdue` : item.diffDays === 0 ? "Due today" : `Due in ${item.diffDays} day${item.diffDays === 1 ? "" : "s"}`}
                            </p>
                            <p className="text-xs text-slate-500">{formatMilitaryDate(item.dueDate)}</p>
                          </div>
                          <div className="text-right text-lg font-extrabold text-[#f5e4a3]">${item.amount.toFixed(2)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>


      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 grid gap-6 lg:grid-cols-[180px_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <Image src="/guest-vaults-logo.jpg" alt="Guest Vaults logo" width={170} height={170} className="h-32 w-32 rounded-2xl object-contain md:h-40 md:w-40" />
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">
              {getGreeting()}, <span className="text-[#d4af37]">{fullName?.trim() || "User"}</span>
            </h1>
            <p className="mt-3 max-w-3xl text-base text-slate-400 md:text-lg">
              {fullName?.trim() ? `Let's lock in your money today, ${fullName.trim()}.` : "Your budget, bills, debt, pay cycle, and bank connection all in one place."}
            </p>
            <div className="mt-4 h-2 w-32 bg-[#d4af37]" />
          </div>
        </div>

        {activeTab === "home" ? (
          <>
            <section className="mb-8 rounded-2xl border border-[#3a3120] bg-[#17181d] p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#d4af37]">Main Insight</p>
                  <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">{mainInsight}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400 md:text-base">{momentumMessage}</p>
                </div>
                <div className="rounded-xl border border-[#2a2a2f] bg-[#111216] px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Savings Progress</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#9ad6b2]">{savingsProgressPercent.toFixed(0)}%</p>
                </div>
              </div>
            </section>

            {showStartHere ? (
              <section className="mb-8 rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6 shadow-sm">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold md:text-3xl">Start Here</h2>
                    <p className="mt-2 max-w-3xl text-base text-slate-400 md:text-lg">
                      Follow these steps to set up Guest Vaults the way a real user would.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#b68a2d] bg-[#111216] px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-[#d4af37] md:text-sm">Progress</p>
                    <p className="text-2xl font-extrabold text-[#f5e4a3] md:text-3xl">
                      {completedSteps}/{onboardingSteps.length}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {onboardingSteps.map((step, index) => (
                    <div key={step.title} className="rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold uppercase tracking-wide text-[#d4af37]">Step {index + 1}</p>
                          <h3 className="mt-1 text-xl font-bold md:text-2xl">{step.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-slate-400 md:text-base">{step.description}</p>
                        </div>
                        <div
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                            step.done
                              ? "border border-[#2d6a4f] bg-[#183a2b] text-[#b7e4c7]"
                              : "border border-[#d4af37] bg-[#2a2415] text-[#f5e4a3]"
                          }`}
                        >
                          {step.done ? "Done" : "Next"}
                        </div>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={step.onClick}
                          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition md:text-base ${
                            step.done
                              ? "border-[#2d6a4f] text-[#b7e4c7] hover:bg-[#183a2b]"
                              : "border-[#d4af37] text-[#f5e4a3] hover:bg-[#23242b]"
                          }`}
                        >
                          {step.actionLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mb-8 grid gap-6 lg:grid-cols-[1.85fr_1fr]">
              <div id="budget-breakdown" className="rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6">
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold md:text-3xl">Budget Breakdown</h2>
                    <p className="mt-2 max-w-2xl text-base text-slate-400 md:text-lg">
                      Priority goes in this order: total balance, bills, debt, building savings, then safe to spend.
                      Safe to spend should still leave enough to eat out or go out at least once during the pay cycle.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#b68a2d] bg-[#111216] px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-[#d4af37] md:text-sm">Vault Score</p>
                    <p className="text-2xl font-extrabold text-[#f5e4a3] md:text-3xl">{vaultScore}/100</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <BudgetCard title="Total Balance" amount={`$${totalBalance.toFixed(2)}`} percent={`${totalBalancePct}%`} amountClass="text-[#d4af37]" />
                  <BudgetCard title="Bills" amount={`$${billsTotal.toFixed(2)}`} percent={`${billsPct}%`} amountClass="text-[#c59a3d]" />
                  <BudgetCard title="Debt" amount={`$${debtTotal.toFixed(2)}`} percent={`${debtPct}%`} amountClass="text-[#c25757]" />
                  <BudgetCard title="Savings Contribution" amount={`$${savingsContribution.toFixed(2)}`} percent={`${savingsContributionPct}%`} amountClass="text-[#9ad6b2]" />
                  <BudgetCard title="Safe to Spend" amount={`$${safeToSpend.toFixed(2)}`} percent={`${safeToSpendPct}%`} amountClass="text-[#f5e4a3]" />
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  <InfoMini title="Remaining After Bills" value={`$${remainingAfterBills.toFixed(2)}`} sub="Balance after covering bills" className="text-[#f5e4a3]" />
                  <InfoMini title="Remaining After Debt" value={`$${remainingAfterDebt.toFixed(2)}`} sub="Balance after covering bills and debt" className="text-[#f1b4b4]" />
                  <InfoMini title="Pay-Period Safe to Spend" value={`$${payPeriodSafeToSpend.toFixed(2)}`} sub="Still leaves room for at least one outing this pay cycle" className="text-[#d4af37]" />
                </div>
              </div>

              <aside className="space-y-5">
                <SideCard title="Profile">
                  <p className="whitespace-pre-line text-base leading-7 text-slate-400 md:text-lg">
                    {`Type: ${getProfileLabel(profileType)}
Pay Cycle: ${getPayCycleLabel(payCycle)}
Last Payday: ${formatMilitaryDate(lastPayday)}`}
                  </p>
                  <button
                    onClick={() => {
                      setProfileNameInput(fullName);
                      setProfileTypeInput(profileType);
                      setPayCycleInput(payCycle);
                      setLastPaydayInput(lastPayday);
                      setPaydayAmountInput(paydayAmount ? String(paydayAmount) : "");
                      setProfileSavingsInput(String(savings || 0));
                      setShowProfile(true);
                    }}
                    className="mt-5 text-base font-semibold text-[#f5e4a3] hover:underline"
                  >
                    Edit profile ›
                  </button>
                </SideCard>

                <SideCard title="Weekly Command">
                  <p className="text-base leading-7 text-slate-400 md:text-lg">{momentumMessage}</p>
                </SideCard>

                <div id="banking-card">
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
                </div>
              </aside>
            </section>

            <section className="mb-8 grid gap-6 lg:grid-cols-2">
              <section className="overflow-hidden rounded-2xl border border-[#2a2a2f] bg-[#17181d]">
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
                  <RowLine title="Bills" subtitle="Priority item 1 after balance" amount={`-$${billsTotal.toFixed(2)}`} amountClass="text-[#c59a3d]" />
                  <RowLine title="Debt" subtitle="Priority item 2 after bills" amount={`-$${debtTotal.toFixed(2)}`} amountClass="text-[#c25757]" />
                  <RowLine title="Building Savings" subtitle="Priority item 3 before flexible spending" amount={`$${savingsContribution.toFixed(2)}`} amountClass="text-[#9ad6b2]" />
                  <RowLine title="Safe to Spend" subtitle="Flexible money after priorities and still leaves outing room" amount={`$${safeToSpend.toFixed(2)}`} amountClass="text-[#f5e4a3]" />
                </div>
              </section>

              <BlockCard title="Category Limits" button="Open" onClick={() => undefined}>
                <div className="space-y-3">
                  {categoryLimitRows.map((row) => (
                    <div key={row.name} className="rounded-xl border border-[#2a2a2f] bg-[#111216] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-white">{row.name}</p>
                          <p className="text-sm text-slate-400">Weekly limit: ${row.limit.toFixed(2)} • Spent: ${row.spent.toFixed(2)}</p>
                        </div>
                        <div
                          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                            row.isOver
                              ? "border-[#c25757] bg-[#2a1717] text-[#f5b1b1]"
                              : row.usagePct >= 90
                              ? "border-[#d4af37] bg-[#2a2415] text-[#f5e4a3]"
                              : row.usagePct >= 60
                              ? "border-[#9b7a22] bg-[#1f1a10] text-[#f0d68d]"
                              : "border-[#2d6a4f] bg-[#183a2b] text-[#b7e4c7]"
                          }`}
                        >
                          {row.status}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-slate-400">{row.usagePct}% used</span>
                        <span className={`font-semibold ${row.isOver ? "text-[#f5b1b1]" : "text-[#f5e4a3]"}`}>
                          {row.isOver ? `Over by $${(row.spent - row.limit).toFixed(2)}` : `$${row.remaining.toFixed(2)} left`}
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#23242b]">
                        <div className={`h-full transition-all ${row.isOver ? "bg-[#c25757]" : row.usagePct >= 90 ? "bg-[#d4af37]" : "bg-[#9ad6b2]"}`} style={{ width: `${Math.min(100, row.usagePct)}%` }} />
                      </div>

                      <p className="mt-3 text-sm text-slate-400">
                        {row.isOver
                          ? `You need to cut back $${(row.spent - row.limit).toFixed(2)} in ${row.name.toLowerCase()} to get back on track this week.`
                          : row.usagePct >= 90
                          ? `Be careful — ${row.name.toLowerCase()} is almost tapped out for this week.`
                          : row.usagePct >= 60
                          ? `Watch ${row.name.toLowerCase()} — it is moving faster than the rest of your budget.`
                          : `${row.name} is under control this week.`}
                      </p>
                    </div>
                  ))}
                </div>
              </BlockCard>
            </section>

            <BlockCard title="Transaction History" button="Open" onClick={() => undefined}>
              {transactions.length === 0 ? (
                <Empty text="No transactions yet. Add income, expenses, bills, or debt to start your history." />
              ) : (
                transactions.slice(0, 10).map((tx) => (
                  <div key={tx.id} className="flex flex-col gap-3 rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-bold md:text-xl">{getTransactionLabel(tx.type)}</p>
                      <p className="mt-1 break-words text-sm text-slate-400 md:text-base">{tx.note}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#d4af37]">{tx.category || categorizeSpending(tx.note, tx.type)}</p>
                      <p className="mt-1 text-xs text-slate-500 md:text-sm">{formatMilitaryDate(tx.createdAt)}</p>
                    </div>
                    <div className={`text-xl font-extrabold md:text-2xl ${getTransactionColor(tx.type)}`}>
                      {tx.type === "income" ? "+" : "-"}${tx.amount.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </BlockCard>
          </>
        ) : activeTab === "insights" ? (
          <>
            <section className="mb-8 rounded-2xl border border-[#2a2a2f] bg-[#17181d] p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-extrabold md:text-3xl">Savings Ladder</h2>
                <div className="rounded-xl border border-[#2a2a2f] bg-[#111216] px-4 py-2 text-sm text-slate-400">
                  Tracked amount: <span className="font-bold text-[#f5e4a3]">${savingsProgressAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {savingsLevels.map((level) => (
                  <div key={level.name} className="rounded-2xl border border-[#2a2a2f] bg-[#111216] p-5">
                    <p className="text-xl font-bold text-white">{level.name}</p>
                    <p className="mt-2 text-sm font-semibold text-[#d4af37]">Target: ${level.min.toFixed(2)}</p>
                    <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                      {level.bullets.map((point) => (
                        <li key={point}>• {point}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8 grid gap-6 lg:grid-cols-2">
              <BlockCard title="Weekly Summary" button="Open" onClick={() => undefined}>
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoMini title="Total Spent This Week" value={`$${totalWeeklySpent.toFixed(2)}`} sub="Bills, debt, and expenses this week" className="text-[#f5b1b1]" />
                  <InfoMini title="Top Category" value={topWeeklyCategory ? `${topWeeklyCategory[0]}` : "N/A"} sub={topWeeklyCategory ? `$${topWeeklyCategory[1].toFixed(2)}` : "Add spending to generate a top category"} className="text-[#f5e4a3]" />
                </div>
                <div className="mt-4 space-y-3">
                  {Object.keys(weeklyCategoryTotals).length === 0 ? (
                    <Empty text="No weekly spending yet. Add spending this week to generate a summary." />
                  ) : (
                    Object.entries(weeklyCategoryTotals).map(([name, amount]) => (
                      <div key={name} className="flex items-center justify-between rounded-xl border border-[#2a2a2f] bg-[#111216] px-4 py-3 text-sm md:text-base">
                        <span>{name}</span>
                        <span className="font-semibold text-[#f5e4a3]">${amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </BlockCard>

              <BlockCard title="Spending Insights" button="Open" onClick={() => undefined}>
                <div className="space-y-3">
                  {spendingInsights.map((insight) => (
                    <div key={insight} className="rounded-xl border border-[#2a2a2f] bg-[#111216] px-4 py-3 text-sm leading-6 text-slate-300 md:text-base">
                      {insight}
                    </div>
                  ))}
                </div>
              </BlockCard>
            </section>
          </>
        ) : (
          <>
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
                      meta={`${getCadenceLabel(item.paymentCadence, item.recurring)} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
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
                      meta={`${getCadenceLabel(item.paymentCadence, item.recurring)} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                      paid={item.paidForCurrentCycle}
                    />
                  ))
                )}
              </BlockCard>
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
                    lineTwo={`Next Payment: ${formatMilitaryDate(item.effectiveDueDateRaw)}`}
                    lineThree={`${getCadenceLabel(item.paymentCadence, item.recurring)} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                    amountClass={item.paidForCurrentCycle ? "text-slate-500" : "text-[#c59a3d]"}
                    primaryLabel={item.paidForCurrentCycle ? "Paid" : "Mark Paid"}
                    primaryClass={item.paidForCurrentCycle ? "border-[#2d6a4f] text-[#b7e4c7] hover:bg-[#183a2b]" : "border-[#d4af37] text-[#f5e4a3] hover:bg-[#23242b]"}
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
                    lineThree={`Next Payment: ${formatMilitaryDate(item.effectiveDueDateRaw)} • ${getCadenceLabel(item.paymentCadence, item.recurring)} • ${item.paidForCurrentCycle ? "Paid" : "Unpaid"}`}
                    amountClass={item.paidForCurrentCycle ? "text-slate-500" : "text-[#ff9f9f]"}
                    primaryLabel={item.paidForCurrentCycle ? "Paid" : "Mark Paid"}
                    primaryClass={item.paidForCurrentCycle ? "border-[#2d6a4f] text-[#b7e4c7] hover:bg-[#183a2b]" : "border-[#d4af37] text-[#f5e4a3] hover:bg-[#23242b]"}
                    onPrimary={() => toggleDebtPaid(item)}
                    onRemove={() => removeDebt(item)}
                  />
                ))
              )}
            </BlockCard>
          </>
        )}
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
        <Modal title="Add Bill" subtitle="Add a bill with payment amount, last payment date, and payment cadence.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Bill Name</label>
          <input value={billName} onChange={(e) => setBillName(e.target.value)} type="text" placeholder="Example: Rent" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Amount Due Each Payment</label>
          <input value={billAmount} onChange={(e) => setBillAmount(e.target.value)} type="number" placeholder="Enter amount due each payment" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Last Payment Date</label>
          <input value={billLastPaymentDate} onChange={(e) => setBillLastPaymentDate(e.target.value)} type="date" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Payment Cadence</label>
          <select value={billPaymentCadence} onChange={(e) => setBillPaymentCadence(e.target.value as PaymentCadence)} className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="biweekly">Biweekly</option>
            <option value="one_time">One-Time</option>
          </select>
          <ModalActions saving={saving} saveText="Save Bill" onCancel={() => setShowBill(false)} onSave={handleAddBill} />
        </Modal>
      )}

      {showDebt && (
        <Modal title="Add Debt" subtitle="Add debt balance, minimum payment, last payment date, and cadence.">
          <label className="mt-4 block text-sm font-semibold text-slate-300">Debt Name</label>
          <input value={debtName} onChange={(e) => setDebtName(e.target.value)} type="text" placeholder="Example: Credit Card" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Debt Balance</label>
          <input value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} type="number" placeholder="Enter total debt balance" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Minimum Payment Due Each Cycle</label>
          <input value={debtMinimumPayment} onChange={(e) => setDebtMinimumPayment(e.target.value)} type="number" placeholder="Enter minimum payment" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Last Payment Date</label>
          <input value={debtLastPaymentDate} onChange={(e) => setDebtLastPaymentDate(e.target.value)} type="date" className={inputClass} />
          <label className="mt-4 block text-sm font-semibold text-slate-300">Payment Cadence</label>
          <select value={debtPaymentCadence} onChange={(e) => setDebtPaymentCadence(e.target.value as PaymentCadence)} className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="biweekly">Biweekly</option>
            <option value="one_time">One-Time</option>
          </select>
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
      <p className={`mt-3 break-words text-[1.55rem] font-extrabold leading-none md:text-[1.8rem] xl:text-[2rem] ${amountClass}`} title={amount}>
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
      <p className={`mt-1 break-words text-[1.55rem] font-extrabold leading-none md:text-[1.8rem] ${className}`}>{value}</p>
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
        <button
          onClick={onClick}
          className="rounded-xl border border-[#d4af37] px-5 py-3 text-base font-semibold text-[#f5e4a3] hover:bg-[#23242b] md:text-lg"
        >
          {button}
        </button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function MiniAction({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-[88px] flex-col items-center justify-center rounded-xl border border-[#3a3120] bg-[#1a1b20] px-3 py-2 transition hover:bg-[#23242b]"
    >
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
      <div className={`shrink-0 text-right text-xl font-extrabold ${paid ? "text-slate-500" : "text-[#f5e4a3]"}`}>
        {amount}
      </div>
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
        <button
          onClick={onRemove}
          className="rounded-lg border border-[#c25757] px-3 py-2 text-xs font-semibold text-[#f5b1b1] transition hover:bg-[#2a1717] md:text-sm"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function ReminderCard({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: "danger" | "warn" | "ok";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#f5b1b1] border-[#c25757]"
      : tone === "warn"
      ? "text-[#f5e4a3] border-[#d4af37]"
      : "text-[#b7e4c7] border-[#2d6a4f]";

  return (
    <div className={`rounded-2xl border bg-[#111216] p-5 ${toneClass}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-extrabold">{count}</p>
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
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 rounded-xl bg-[#b68a2d] px-4 py-3 font-semibold text-[#111216] hover:bg-[#d4af37] disabled:opacity-60"
      >
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

function amountTextClass(value: string) {
  const length = value.length;
  if (length <= 8) return "text-3xl md:text-4xl";
  if (length <= 11) return "text-2xl md:text-3xl";
  if (length <= 14) return "text-xl md:text-2xl";
  return "text-lg md:text-xl";
}

function getPayCycleLabel(value: PayCycleType) {
  if (value === "weekly") return "Weekly";
  if (value === "biweekly") return "Biweekly";
  if (value === "monthly") return "Monthly";
  if (value === "military_1_15") return "Military (1st and 15th)";
  if (value === "military_15_30") return "Military (15th and 30th)";
  return "Not set";
}


function getNextScheduledDate(anchorDate?: string, paymentCadence?: PaymentCadence, recurring?: boolean, legacyDueDate?: string) {
  const sourceDate = anchorDate || legacyDueDate;
  if (!sourceDate) return null;
  let date = new Date(`${sourceDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const cadence: PaymentCadence =
    paymentCadence || (recurring === false ? "one_time" : "monthly");

  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

  if (cadence === "one_time") {
    return date;
  }

  if (cadence === "biweekly") {
    while (date < now) {
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 14, 12);
    }
    return date;
  }

  while (date < now) {
    date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate(), 12);
  }
  return date;
}

function isPaidForCurrentCycle(
  paymentCadence: PaymentCadence | undefined,
  recurring: boolean | undefined,
  paid: boolean | undefined,
  paidDate: string | undefined,
  effectiveDueDate: Date | null
) {
  if (!paid) return false;
  const cadence: PaymentCadence = paymentCadence || (recurring === false ? "one_time" : "monthly");
  if (cadence === "one_time") return true;
  if (!paidDate || !effectiveDueDate) return false;
  const paidOn = new Date(`${paidDate}T12:00:00`);
  if (Number.isNaN(paidOn.getTime())) return false;

  if (cadence === "biweekly") {
    const diffDays = Math.abs(Math.round((effectiveDueDate.getTime() - paidOn.getTime()) / 86400000));
    return diffDays <= 14;
  }

  return paidOn.getFullYear() === effectiveDueDate.getFullYear() && paidOn.getMonth() === effectiveDueDate.getMonth();
}

function buildBillView(item: BillItem): BillView {
  const effectiveDueDateRaw = getNextScheduledDate(item.lastPaymentDate, item.paymentCadence, item.recurring, item.dueDate);

  return {
    ...item,
    effectiveDueDateRaw,
    paidForCurrentCycle: isPaidForCurrentCycle(item.paymentCadence, item.recurring, item.paid, item.paidDate, effectiveDueDateRaw),
  };
}

function buildDebtView(item: DebtItem): DebtView {
  const effectiveDueDateRaw = getNextScheduledDate(item.lastPaymentDate, item.paymentCadence, item.recurring, item.dueDate);

  return {
    ...item,
    effectiveDueDateRaw,
    paidForCurrentCycle: isPaidForCurrentCycle(item.paymentCadence, item.recurring, item.paid, item.paidDate, effectiveDueDateRaw),
  };
}

function getCadenceLabel(paymentCadence?: PaymentCadence, recurring?: boolean) {
  const cadence: PaymentCadence = paymentCadence || (recurring === false ? "one_time" : "monthly");
  if (cadence === "biweekly") return "Biweekly";
  if (cadence === "one_time") return "One-Time";
  return "Monthly";
}

function getPayCycleInfo(payCycle: PayCycleType, lastPayday: string) {
  if (!payCycle || !lastPayday) {
    return { currentPeriod: "Not set", nextPayDate: "Not set", nextPayDateRaw: null as Date | null };
  }

  const last = new Date(`${lastPayday}T12:00:00`);
  if (Number.isNaN(last.getTime())) {
    return { currentPeriod: "Not set", nextPayDate: "Not set", nextPayDateRaw: null as Date | null };
  }

  const today = new Date();
  let next = new Date(last);

  if (payCycle === "weekly") while (next <= today) next.setDate(next.getDate() + 7);
  if (payCycle === "biweekly") while (next <= today) next.setDate(next.getDate() + 14);
  if (payCycle === "monthly") while (next <= today) next.setMonth(next.getMonth() + 1);

  if (payCycle === "military_1_15") {
    next = today.getDate() < 15
      ? new Date(today.getFullYear(), today.getMonth(), 15, 12)
      : new Date(today.getFullYear(), today.getMonth() + 1, 1, 12);
  }

  if (payCycle === "military_15_30") {
    next = today.getDate() < 30
      ? new Date(today.getFullYear(), today.getMonth(), 30, 12)
      : new Date(today.getFullYear(), today.getMonth() + 1, 15, 12);
  }

  return {
    currentPeriod: `${formatMilitaryDate(last)} - ${formatMilitaryDate(next)}`,
    nextPayDate: formatMilitaryDate(next),
    nextPayDateRaw: next,
  };
}

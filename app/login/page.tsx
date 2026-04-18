"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

type ProfileType = "military" | "college_student" | "financial_stability" | "";
type PayCycleType =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "military_1_15"
  | "military_15_30"
  | "";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("");
  const [payCycle, setPayCycle] = useState<PayCycleType>("");
  const [lastPayday, setLastPayday] = useState("");
  const [paydayAmount, setPaydayAmount] = useState("");

  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      alert("Enter your email and password.");
      return;
    }

    try {
      setBusy(true);
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      router.push("/");
    } catch (error: any) {
      if (
        error?.code === "auth/invalid-credential" ||
        error?.code === "auth/user-not-found" ||
        error?.code === "auth/wrong-password"
      ) {
        alert("No account found with that email and password. Create an account first.");
      } else {
        alert(error?.message || "Login failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAccount = async () => {
    if (
      !fullName.trim() ||
      !signupEmail.trim() ||
      !signupPassword ||
      !confirmPassword ||
      !profileType ||
      !payCycle ||
      !lastPayday ||
      !paydayAmount
    ) {
      alert("Fill out every field.");
      return;
    }

    if (signupPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    if (signupPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    const paydayAmountNumber = Number(paydayAmount);
    if (!paydayAmountNumber || paydayAmountNumber <= 0) {
      alert("Enter a valid payday amount.");
      return;
    }

    try {
      setBusy(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        signupEmail.trim(),
        signupPassword
      );

      await setDoc(doc(db, "users", cred.user.uid), {
        fullName: fullName.trim(),
        profileType,
        payCycle,
        lastPayday,
        paydayAmount: paydayAmountNumber,
        totalBalance: 0,
        savings: 0,
        isPremium: false,
      });

      router.push("/");
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        alert("That email already has an account. Log in instead.");
      } else if (error?.code === "auth/invalid-email") {
        alert("Enter a valid email address.");
      } else if (error?.code === "auth/weak-password") {
        alert("Password must be at least 6 characters.");
      } else {
        alert(error?.message || "Account creation failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-white">
      <header className="border-b border-[#26262b] bg-[#111216]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <Image
              src="/guest-vaults-logo.jpg"
              alt="Guest Vaults logo"
              width={52}
              height={52}
              className="h-12 w-12 rounded-lg object-contain"
            />
            <span className="text-xl font-bold text-[#f5f5f5]">Guest Vaults</span>
          </div>

          <Link
            href="/"
            className="rounded-full border border-[#d4af37] bg-[#1a1b20] px-5 py-2 text-sm font-semibold text-[#f5e4a3] transition hover:bg-[#23242b]"
          >
            Back Home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1.08fr_.92fr]">
        <div className="rounded-3xl border border-[#26262b] bg-[#17181d] p-10 shadow-xl">
          <div className="grid gap-6 md:grid-cols-[190px_1fr] md:items-start">
            <div className="flex justify-center md:justify-start">
              <Image
                src="/guest-vaults-logo.jpg"
                alt="Guest Vaults logo"
                width={190}
                height={190}
                className="h-40 w-40 rounded-2xl object-contain md:h-44 md:w-44"
              />
            </div>

            <div>
              <div className="inline-block rounded-full border border-[#3a3120] bg-[#111216] px-4 py-2 text-sm font-bold text-[#f5e4a3]">
                Secure Access
              </div>

              <h1 className="mt-6 text-4xl font-extrabold leading-tight text-[#f5f5f5] md:text-5xl">
                Welcome to
                <br />
                <span className="text-[#d4af37]">Guest Vaults</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400 md:text-xl">
                Build your vault, track bills and debt, and see what is actually safe to spend.
              </p>

              <div className="mt-8 space-y-4 text-base text-slate-400 md:text-lg">
                <p>• Create account first</p>
                <p>• Log in with email and password only</p>
                <p>• Set your profile, pay cycle, and last payday</p>
                <p>• Built for military, students, and financial stability</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#26262b] bg-[#17181d] p-8 shadow-xl">
          <div className="mb-6 flex gap-3">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-2xl px-5 py-3 text-base font-bold transition md:text-lg ${
                mode === "login"
                  ? "bg-[#b68a2d] text-[#111216]"
                  : "border border-[#3a3a42] bg-[#111216] text-slate-300"
              }`}
            >
              Log In
            </button>

            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-2xl px-5 py-3 text-base font-bold transition md:text-lg ${
                mode === "signup"
                  ? "bg-[#b68a2d] text-[#111216]"
                  : "border border-[#3a3a42] bg-[#111216] text-slate-300"
              }`}
            >
              Create Account
            </button>
          </div>

          {mode === "login" ? (
            <>
              <h2 className="text-3xl font-bold text-[#f5f5f5] md:text-4xl">Log In</h2>
              <p className="mt-3 text-base text-slate-400 md:text-lg">
                Only users who already created an account can log in.
              </p>

              <form
                className="mt-8 space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
              >
                <Field label="Email">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Enter email"
                    className={inputClass}
                  />
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className={inputClass}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-[#b68a2d] px-5 py-4 text-lg font-bold text-[#111216] transition hover:bg-[#d4af37] disabled:opacity-60 md:text-xl"
                >
                  {busy ? "Logging in..." : "Log In"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-[#f5f5f5] md:text-4xl">Create Account</h2>
              <p className="mt-3 text-base text-slate-400 md:text-lg">
                Set up your profile now. You can update it later on the homepage.
              </p>

              <form
                className="mt-8 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateAccount();
                }}
              >
                <Field label="Full Name">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className={inputClass}
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="Enter email"
                    className={inputClass}
                  />
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Enter password"
                    className={inputClass}
                  />
                </Field>

                <Field label="Confirm Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className={inputClass}
                  />
                </Field>

                <Field label="Profile Type">
                  <select
                    value={profileType}
                    onChange={(e) => setProfileType(e.target.value as ProfileType)}
                    className={inputClass}
                  >
                    <option value="">Choose one</option>
                    <option value="military">Military</option>
                    <option value="college_student">College Student</option>
                    <option value="financial_stability">
                      Trying to Become Financially Stable
                    </option>
                  </select>
                </Field>

                <Field label="Pay Cycle">
                  <select
                    value={payCycle}
                    onChange={(e) => setPayCycle(e.target.value as PayCycleType)}
                    className={inputClass}
                  >
                    <option value="">Choose one</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="military_1_15">Military (1st and 15th)</option>
                    <option value="military_15_30">Military (15th and 30th)</option>
                  </select>
                </Field>

                <Field label="Last Payday">
                  <input
                    type="date"
                    value={lastPayday}
                    onChange={(e) => setLastPayday(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field label="Payday Amount">
                  <input
                    type="number"
                    value={paydayAmount}
                    onChange={(e) => setPaydayAmount(e.target.value)}
                    placeholder="Enter amount you usually get paid"
                    className={inputClass}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-[#b68a2d] px-5 py-4 text-lg font-bold text-[#111216] transition hover:bg-[#d4af37] disabled:opacity-60 md:text-xl"
                >
                  {busy ? "Creating account..." : "Create Account"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-2xl border border-[#3a3a42] bg-[#111216] px-5 py-4 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 md:text-lg";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-base font-semibold text-[#f5f5f5] md:text-lg">
        {label}
      </label>
      {children}
    </div>
  );
}

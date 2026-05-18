"use client";

import type { QuizAttempt } from "./quiz";

const KEY = "recall:quiz:last";

export function saveAttempt(attempt: QuizAttempt) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(attempt));
  } catch {}
}

export function loadAttempt(): QuizAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuizAttempt;
  } catch {
    return null;
  }
}

export function clearAttempt() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

"use client";

export { Toaster } from "sonner";

export function toast(message: string, options?: { description?: string; type?: "default" | "success" | "error" | "info" | "warning" }) {
  if (typeof window === "undefined") return;
  const { toast: sonnerToast } = require("sonner");
  return sonnerToast(message, options);
}

export function toastSuccess(message: string, description?: string) {
  if (typeof window === "undefined") return;
  const { toast: sonnerToast } = require("sonner");
  return sonnerToast.success(message, { description });
}

export function toastError(message: string, description?: string) {
  if (typeof window === "undefined") return;
  const { toast: sonnerToast } = require("sonner");
  return sonnerToast.error(message, { description });
}
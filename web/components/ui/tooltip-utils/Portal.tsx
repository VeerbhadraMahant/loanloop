"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function Portal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!isClient) return null;
  return createPortal(children, document.body);
}

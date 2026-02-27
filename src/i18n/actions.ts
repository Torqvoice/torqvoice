"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { type Locale, locales } from "./config";

export async function setLocale(locale: string) {
  if (!locales.includes(locale as Locale)) {
    return { success: false, error: "Invalid locale" };
  }

  const cookieStore = await cookies();
  cookieStore.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/");
  return { success: true };
}

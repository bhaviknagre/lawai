"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function deleteConversation(id: string) {
  const user = await requireUser();
  await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
  revalidatePath("/assistant");
}

export async function rateMessage(id: string, value: 1 | -1) {
  const user = await requireUser();
  const mine = db.select({ id: conversations.id }).from(conversations).where(eq(conversations.userId, user.id));
  await db.update(messages).set({ feedback: value }).where(and(eq(messages.id, id), inArray(messages.conversationId, mine)));
}

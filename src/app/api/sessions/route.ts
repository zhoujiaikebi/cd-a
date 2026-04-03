import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { title } = await req.json().catch(() => ({}));

  const newSession = await prisma.session.create({
    data: {
      userId: session.user.id,
      title: title || "新对话",
    },
  });

  return NextResponse.json(newSession);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("id");
  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "无权删除该会话" }, { status: 403 });
  }

  await prisma.session.delete({ where: { id: sessionId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id, title } = await req.json().catch(() => ({}));

  if (!id) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "无权修改该会话" }, { status: 403 });
  }

  const updated = await prisma.session.update({
    where: { id },
    data: { title: title || existing.title },
  });

  return NextResponse.json(updated);
}
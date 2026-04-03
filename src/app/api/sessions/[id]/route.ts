import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "无权访问该会话" }, { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id: sessionId } = await params;

  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "无权访问该会话" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const { role, content, attachments, model, tokenCount } = body;

  if (!role || !content) {
    return NextResponse.json({ error: "缺少 role 或 content" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      sessionId,
      role,
      content,
      attachments: attachments || undefined,
      model: model || undefined,
      tokenCount: tokenCount || undefined,
    },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message);
}
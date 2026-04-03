import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      logs: { orderBy: { createdAt: "desc" }, take: 100 },
      searchLogs: { orderBy: { createdAt: "desc" }, take: 100 },
      sessions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const { password, role, disabled, tokenLimit, searchMonthlyLimit } = body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const updateData: any = {};

  if (typeof password === "string" && password.length > 0) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
  }
  if (typeof role === "string") {
    updateData.role = role;
  }
  if (typeof disabled === "boolean") {
    updateData.disabled = disabled;
  }
  if (tokenLimit !== undefined) {
    updateData.tokenLimit = BigInt(Math.max(0, Number(tokenLimit) || 0));
  }
  if (searchMonthlyLimit !== undefined) {
    updateData.searchMonthlyLimit = Math.max(0, Number(searchMonthlyLimit) || 0);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("[UpdateUser]", e);
    return NextResponse.json(
      { error: e?.message || "更新用户失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  if (session.user.id === id) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
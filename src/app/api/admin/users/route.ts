import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { sessions: true, logs: true, searchLogs: true },
      },
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.username || !body.password) {
    return NextResponse.json({ error: "缺少用户名或密码" }, { status: 400 });
  }

  const { username, password, role, tokenLimit, searchMonthlyLimit } = body;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role || "user",
        tokenLimit: BigInt(Math.max(0, Number(tokenLimit) || 0)),
        searchMonthlyLimit: Math.max(0, Number(searchMonthlyLimit) || 0),
      },
    });
    return NextResponse.json(user);
  } catch (e: any) {
    console.error("[CreateUser]", e);
    return NextResponse.json(
      { error: e?.message || "创建用户失败" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (userId) {
    const logs = await prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const searchLogs = await prisma.searchUsageLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ logs, searchLogs });
  }

  const logs = await prisma.usageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { username: true } } },
  });

  return NextResponse.json(logs);
}
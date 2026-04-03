import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const [totalUsers, totalSessions, totalLogs, totalSearchLogs] = await Promise.all([
    prisma.user.count(),
    prisma.session.count(),
    prisma.usageLog.count(),
    prisma.searchUsageLog.count(),
  ]);

  const tokenStats = await prisma.usageLog.aggregate({
    _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
  });

  const modelStats = await prisma.usageLog.groupBy({
    by: ["model"],
    _count: { model: true },
    _sum: { totalTokens: true },
    orderBy: { _count: { model: "desc" } },
  });

  const searchPointsStats = await prisma.searchUsageLog.aggregate({
    _sum: { pointsUsed: true },
  });

  const recentLogs = await prisma.usageLog.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { username: true } } },
  });

  return NextResponse.json({
    totalUsers,
    totalSessions,
    totalLogs,
    totalSearchLogs,
    totalTokens: tokenStats._sum.totalTokens || 0,
    totalPromptTokens: tokenStats._sum.promptTokens || 0,
    totalCompletionTokens: tokenStats._sum.completionTokens || 0,
    modelStats,
    totalSearchPoints: searchPointsStats._sum.pointsUsed || 0,
    recentLogs,
  });
}
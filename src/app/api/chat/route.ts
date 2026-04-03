import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claudeBaseUrl, claudeModel, claudeApiKey } from "@/lib/env";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }
  if (user.disabled) {
    return NextResponse.json({ error: "账号已被禁用" }, { status: 403 });
  }

  const tokenLimit = Number(user.tokenLimit);
  const tokenUsed = Number(user.tokenUsed);
  if (tokenLimit > 0 && tokenUsed >= tokenLimit) {
    return NextResponse.json({ error: "对话额度已用完" }, { status: 403 });
  }

  let body: {
    sessionId?: string;
    messages?: Array<{ role: string; content: string | any }>;
    isWebSearch?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const { sessionId, messages, isWebSearch } = body;
  if (!sessionId || !messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "缺少 sessionId 或 messages" }, { status: 400 });
  }

  let systemPrompt = "你是一个有用的 AI 助手。";

  if (isWebSearch) {
    const searchMonthlyLimit = user.searchMonthlyLimit;
    const searchCallCount = user.searchCallCount;
    if (searchMonthlyLimit > 0 && searchCallCount >= searchMonthlyLimit) {
      return NextResponse.json({ error: "本月搜索次数已用完" }, { status: 403 });
    }

    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      return NextResponse.json({ error: "未找到用户消息" }, { status: 400 });
    }

    const query = typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : (lastUserMessage.content?.[0]?.text || "");

    const searchResponse = await fetch(`${process.env.ANSRIPE_ENDPOINT || "https://plugin.anspire.cn/api/ntsearch/search"}?query=${encodeURIComponent(query)}&top_k=10`, {
      headers: {
        Authorization: `Bearer ${process.env.ANSRIPE_API_KEY}`,
      },
    });

    if (!searchResponse.ok) {
      const statusCode = searchResponse.status;
      if (statusCode === 401 || statusCode === 403) {
        return NextResponse.json({ error: "API Key 无效或权限不足，请联系管理员" }, { status: 403 });
      }
      if (statusCode === 429) {
        return NextResponse.json({ error: "上游限流，请稍后重试" }, { status: 429 });
      }
      return NextResponse.json({ error: "联网搜索失败，请稍后重试" }, { status: 502 });
    }

    let searchResults = "";
    try {
      const searchData = await searchResponse.json();
      if (searchData.results && Array.isArray(searchData.results)) {
        searchResults = searchData.results.map((r: any, i: number) =>
          `${i + 1}. 《${r.title || "无标题"}》 — ${r.url || ""}\n   ${r.abstract || r.snippet || ""}`
        ).join("\n\n");
      }
    } catch {
      searchResults = "";
    }

    const searchContext = searchResults
      ? `[以下为搜索结果摘要]\n${searchResults}`
      : "[以下为搜索结果摘要]\n未找到相关信息。";

    const forcedConstraints = `你是一个联网增强的 AI 助手。请严格遵守以下规则：
1. 回答必须以「以下为搜索结果摘要」开篇，逐条引用搜索内容。
2. 若搜索结果与用户问题无关或不足，请诚实说明「搜索结果未找到相关信息」。
3. 回答末尾必须列出参考来源，格式：[编号] 《标题》 — URL
4. 禁止捏造搜索结果中不存在的 URL 或内容。`;

    systemPrompt = `${searchContext}\n\n${forcedConstraints}`;

    await prisma.user.update({
      where: { id: userId },
      data: { searchCallCount: { increment: 1 } },
    });

    const pointsPerCall = parseInt(process.env.SEARCH_POINTS_PER_CALL || "0", 10);
    if (pointsPerCall > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { searchPointsUsed: { increment: pointsPerCall } },
      });
    }

    await prisma.searchUsageLog.create({
      data: {
        userId,
        query: query.slice(0, 200),
        topK: 10,
        statusCode: 200,
        pointsUsed: pointsPerCall,
      },
    });
  }

  const recentMessages = messages.slice(-10);
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: typeof m.content === "string" ? m.content : (m.content?.[0]?.text || ""),
    })),
  ];

  const openai = new OpenAI({
    baseURL: claudeBaseUrl,
    apiKey: claudeApiKey,
    timeout: 120000,
  });

  try {
    const stream = await openai.chat.completions.create({
      model: claudeModel,
      messages: chatMessages,
      stream: true,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let totalTokens = 0;
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
            if (chunk.usage) {
              totalTokens = chunk.usage.total_tokens || 0;
            }
          }

          if (totalTokens > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: { tokenUsed: { increment: totalTokens } },
            });
            await prisma.usageLog.create({
              data: {
                userId,
                model: claudeModel,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens,
              },
            });
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: "API Key 无效或权限不足，请联系管理员" }, { status: 403 });
    }
    if (status === 429) {
      return NextResponse.json({ error: "上游限流，请稍后重试" }, { status: 429 });
    }
    if (err.message?.includes("timeout")) {
      return NextResponse.json({ error: "请求超时，请检查网络后重试" }, { status: 504 });
    }
    return NextResponse.json({ error: "上游服务异常，请稍后重试" }, { status: 502 });
  }
}
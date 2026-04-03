import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { geminiBaseUrl, geminiModel, geminiApiKey } from "@/lib/env";

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

  const body = await req.json().catch(() => null);
  if (!body || !body.prompt) {
    return NextResponse.json({ error: "缺少 prompt 参数" }, { status: 400 });
  }

  const { prompt } = body;

  const openai = new (await import("openai")).default({
    baseURL: geminiBaseUrl,
    apiKey: geminiApiKey,
    timeout: 60000,
  });

  try {
    const response = await openai.chat.completions.create({
      model: geminiModel,
      messages: [
        {
          role: "user",
          content: `Generate an image based on this description: ${prompt}`,
        },
      ],
      max_tokens: 8192,
    });

    let imageUrl = "";
    let base64Image = "";
    let usageTokens = 0;

    const content = response.choices[0]?.message?.content || "";

    // Helper: prepends data URL MIME prefix if missing
    const ensureDataUrl = (raw: string): string => {
      if (!raw) return "";
      if (raw.startsWith("data:")) return raw;
      const header = raw.slice(0, 8);
      if (header.startsWith("/9j/") || header.startsWith("iVBOR")) {
        return header.startsWith("/9j/") ? `data:image/jpeg;base64,${raw}` : `data:image/png;base64,${raw}`;
      }
      return `data:image/png;base64,${raw}`;
    };

    // Helper: extract image data from Markdown image syntax like ![alt](url)
    const extractFromMarkdown = (text: string): string => {
      const match = text.match(/!\[.*?\]\((data:[^)]+)\)/);
      if (match) return match[1];
      const urlMatch = text.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
      if (urlMatch) return urlMatch[1];
      return text;
    };

    const clean = extractFromMarkdown(content);

    if (clean.startsWith("data:image")) {
      base64Image = ensureDataUrl(clean.replace(/^data:image\/\w+;base64,/, ""));
    } else if (clean.startsWith("http://") || clean.startsWith("https://")) {
      imageUrl = clean;
    } else {
      try {
        const parsed = JSON.parse(clean);
        imageUrl = parsed.url || parsed.image_url || parsed.data?.[0]?.url || "";
        const raw = parsed.b64_json || parsed.data?.[0]?.b64_json || "";
        base64Image = ensureDataUrl(raw);
      } catch {
        imageUrl = content;
      }
    }

    if (response.usage) {
      usageTokens = response.usage.total_tokens || 0;
      if (usageTokens > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { tokenUsed: { increment: usageTokens } },
        });
        await prisma.usageLog.create({
          data: {
            userId,
            model: geminiModel,
            promptTokens: response.usage.prompt_tokens || 0,
            completionTokens: response.usage.completion_tokens || 0,
            totalTokens: usageTokens,
          },
        });
      }
    }

    return NextResponse.json({
      imageUrl,
      base64Image,
      prompt,
      tokenCount: usageTokens,
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
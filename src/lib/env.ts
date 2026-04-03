const required = [
  "CLAUDE_API_KEY",
  "GEMINI_API_KEY",
  "ANESPIRE_API_KEY",
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
] as const;

function validateEnv() {
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[Env] Missing required environment variable: ${key}`);
    }
  }
}

validateEnv();

export const claudeBaseUrl = process.env.CLAUDE_BASE_URL || "https://api.zhangsan.cool/v1";
export const claudeModel = process.env.CLAUDE_MODEL || "claude-opus-4-6";
export const claudeApiKey = process.env.CLAUDE_API_KEY!;
export const geminiBaseUrl = process.env.GEMINI_BASE_URL || "https://api.zhangsan.cool/v1";
export const geminiModel = process.env.GEMINI_MODEL || "gemini-3-pro-image-preview";
export const geminiApiKey = process.env.GEMINI_API_KEY!;
export const anspireApiKey = process.env.ANESPIRE_API_KEY!;
export const anspireEndpoint = process.env.ANSRIPE_ENDPOINT || "https://plugin.anspire.cn/api/ntsearch/search";
export const searchPointsPerCall = parseInt(process.env.SEARCH_POINTS_PER_CALL || "0", 10);
export const adminUsername = process.env.ADMIN_USERNAME!;
export const adminPassword = process.env.ADMIN_PASSWORD!;
export const nextauthSecret = process.env.NEXTAUTH_SECRET!;
export const nextauthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

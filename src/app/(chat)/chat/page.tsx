"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Settings,
  LogOut,
  Globe,
  ImageIcon,
  Send,
  X,
  Loader2,
  ChevronRight,
  Search,
  Download,
  MessageSquare,
  Upload,
  PanelLeft,
  Pencil,
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils";
import Link from "next/link";

interface Message {
  id: string;
  role: string;
  content: string;
  attachments?: any[];
  model?: string;
  tokenCount?: number;
  createdAt: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
  messages?: Message[];
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isWebSearch, setIsWebSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Array<{ name: string; url: string; size: number; type: string }>>([]);
  const [imageModal, setImageModal] = useState<{ imageUrl: string; base64Image: string; prompt: string } | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; sessionId: string; title: string }>({ open: false, sessionId: "", title: "" });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchSessions();
    }
  }, [status]);

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  async function fetchSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (data.length > 0 && !activeSessionId) {
          setActiveSessionId(data[0].id);
        }
      }
    } catch (e) {
      toast.error("加载会话列表失败");
    }
  }

  async function fetchMessages(sessionId: string) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      toast.error("加载消息失败");
    }
  }

  async function createSession() {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新对话" }),
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
      }
    } catch (e) {
      toast.error("创建会话失败");
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      const res = await fetch(`/api/sessions?id=${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
          setMessages([]);
        }
        toast.success("会话已删除");
      }
    } catch (e) {
      toast.error("删除会话失败");
    }
  }

  async function renameSession() {
    if (!renameDialog.sessionId || !renameDialog.title.trim()) return;
    try {
      const res = await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameDialog.sessionId, title: renameDialog.title }),
      });
      if (res.ok) {
        setSessions((prev) => prev.map((s) => s.id === renameDialog.sessionId ? { ...s, title: renameDialog.title } : s));
        setRenameDialog({ open: false, sessionId: "", title: "" });
        toast.success("会话已重命名");
      }
    } catch (e) {
      toast.error("重命名失败");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > 7) {
      toast.error("单次最多上传 7 个文件");
      return;
    }

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`文件 "${file.name}" 超过 50MB 限制`);
        return;
      }
    }

    setUploadingFiles(files);

    const newPreviews = files.map((file) => ({
      name: file.name,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      size: file.size,
      type: file.type,
    }));
    setPreviews(newPreviews);
  }

  function removeFile(index: number) {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function sendMessage() {
    if ((!input.trim() && uploadingFiles.length === 0) || !activeSessionId || loading) return;

    const userContent = input.trim();
    setInput("");
    setLoading(true);
    setStreamingContent("");

    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userContent,
      attachments: uploadingFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    setUploadingFiles([]);
    setPreviews([]);

    const recentMessages = messages.slice(-10).concat(tempUserMessage).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const formData = new FormData();
      formData.append("sessionId", activeSessionId);
      formData.append("messages", JSON.stringify(recentMessages));
      formData.append("isWebSearch", String(isWebSearch));
      uploadingFiles.forEach((file) => formData.append("files", file));

      let response: Response;

      if (uploadingFiles.length > 0) {
        response = await fetch("/api/chat", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            messages: recentMessages,
            isWebSearch,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "请求失败" }));
        toast.error(errorData.error || "发送消息失败");
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
        setLoading(false);
        return;
      }

      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await response.json();
        if (data.error) {
          toast.error(data.error);
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
        }
        setLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch {}
          }
        }
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: fullContent,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMessage.id), tempUserMessage, assistantMessage]);

      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tempUserMessage),
      });
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assistantMessage),
      });

      fetchSessions();
    } catch (err: any) {
      toast.error(err.message || "发生未知错误，请联系管理员");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
    }

    setLoading(false);
  }

  async function generateImage() {
    if (!imagePrompt.trim()) return;
    setImageGenerating(true);

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "生成失败" }));
        toast.error(errorData.error || "文生图失败");
        setImageGenerating(false);
        return;
      }

      const data = await res.json();
      setImageModal(data);

      // Post user prompt message into chat
      const userMsg: Message = {
        id: `user-img-${Date.now()}`,
        role: "user",
        content: imagePrompt,
        createdAt: new Date().toISOString(),
      };

      // Post assistant image message into chat (rendered via react-markdown as actual image)
      const assistantMsg: Message = {
        id: `assistant-img-${Date.now()}`,
        role: "assistant",
        content: `**生成图片：** ${imagePrompt}\n\n![generated](${data.base64Image || data.imageUrl})`,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      if (activeSessionId) {
        await fetch(`/api/sessions/${activeSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userMsg),
        });
        await fetch(`/api/sessions/${activeSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(assistantMsg),
        });
      }

      setImagePrompt("");
      toast.success("图片生成成功");
    } catch (err) {
      toast.error("文生图失败，请稍后重试");
    }

    setImageGenerating(false);
  }

  function downloadImage(src: string, filename = "generated-image.png") {
    if (!src) return;
    if (src.startsWith("data:")) {
      const base64 = src.split(",")[1];
      const mimeMatch = src.match(/data:([^;]+);base64/);
      const mime = mimeMatch ? mimeMatch[1] : "image/png";
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } else {
      const link = document.createElement("a");
      link.href = src;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const displayMessages = streamingContent ? [...messages, { id: "streaming", role: "assistant", content: streamingContent, createdAt: new Date().toISOString() }] : messages;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50">
      {/* 左侧会话栏：固定宽度，内部单独滚动，与右侧聊天区完全分割 */}
      <aside
        className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out ${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-3">
          <h2 className="truncate text-sm font-semibold text-slate-900">会话列表</h2>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            title="收起侧栏"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 p-2">
          <Button onClick={createSession} variant="outline" className="w-full justify-start text-sm">
            <Plus className="mr-2 h-4 w-4" />
            新建对话
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`mb-2 overflow-hidden rounded-lg border ${
                activeSessionId === s.id
                  ? "border-blue-200 bg-blue-50/80"
                  : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <div className="flex gap-1 border-b border-slate-100/90 bg-slate-50/90 px-2 py-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 gap-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameDialog({ open: true, sessionId: s.id, title: s.title });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  重命名
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                  title="删除会话"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium ${
                  activeSessionId === s.id ? "text-blue-800" : "text-slate-700"
                }`}
                onClick={() => setActiveSessionId(s.id)}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 opacity-50 ${activeSessionId === s.id ? "rotate-90" : ""}`}
                />
                <span className="truncate">{s.title}</span>
              </button>
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-slate-400">
              暂无会话
              <br />
              点击上方新建对话
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-200 p-3">
          <div className="text-xs text-slate-500 px-2">
            <div className="truncate">用户: {session?.user?.name}</div>
            <div className="truncate">
              角色: {session?.user?.role === "admin" ? "管理员" : "普通用户"}
            </div>
          </div>
          {session?.user?.role === "admin" && (
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
                <Settings className="w-3 h-3 mr-2" />
                管理后台
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-red-500" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="w-3 h-3 mr-2" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* 右侧聊天区：独立一列，仅本区域滚动消息 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            title="展开会话列表"
          >
            <PanelLeft className="h-4 w-4 text-slate-600" />
          </button>
        )}

        {/* Chat Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-slate-900">
              {sessions.find((s) => s.id === activeSessionId)?.title || "Claude Chat"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isWebSearch ? "default" : "outline"}
              size="sm"
              onClick={() => setIsWebSearch(!isWebSearch)}
              title="联网搜索模式"
            >
              <Search className="w-4 h-4 mr-1" />
              联网模式
            </Button>
            <Button variant="outline" size="sm" onClick={() => imageDialogRef.current?.showModal()}>
              <ImageIcon className="w-4 h-4 mr-1" />
              文生图
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!activeSessionId ? (
            <div className="text-center text-slate-400 mt-20">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>选择或新建一个会话开始聊天</p>
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="text-center text-slate-400 mt-20">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>发送消息开始对话</p>
              {isWebSearch && (
                <p className="text-sm mt-2 text-blue-500">
                  <Globe className="w-4 h-4 inline mr-1" />
                  联网模式已开启，消息将先搜索后回答
                </p>
              )}
            </div>
          ) : (
            displayMessages.map((msg, idx) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm"
                }`}>
                  {msg.id === "streaming" && streamingContent && msg.role === "assistant" ? (
                    <div className="prose prose-slate prose-sm max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight]}
                      >
                        {streamingContent}
                      </ReactMarkdown>
                      <span className="streaming-cursor inline-block w-2 h-4 bg-blue-500 ml-1 align-middle" />
                    </div>
                  ) : (
                    <div>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-slate prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex, rehypeHighlight]}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att: any, i: number) => (
                            <div key={i} className="flex items-center gap-1 text-xs opacity-75 bg-black/10 rounded px-2 py-1">
                              <span>{att.name}</span>
                              <span>({formatBytes(att.size)})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`text-xs mt-1 ${msg.role === "user" ? "text-blue-100" : "text-slate-400"}`}>
                    {formatDate(msg.createdAt)}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* File Previews */}
        {previews.length > 0 && (
          <div className="px-6 pb-2 flex flex-wrap gap-2">
            {previews.map((preview, idx) => (
              <div key={idx} className="relative group bg-slate-100 rounded-lg overflow-hidden border">
                {preview.type.startsWith("image/") ? (
                  <img src={preview.url} alt={preview.name} className="h-16 w-16 object-cover" />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center text-xs text-slate-500 px-2 text-center">
                    {preview.name.slice(-10)}
                  </div>
                )}
                <button
                  onClick={() => removeFile(idx)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="text-xs text-slate-500 text-center truncate max-w-16">{formatBytes(preview.size)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="bg-white border-t border-slate-200 px-6 py-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={activeSessionId ? "输入消息... (Enter 发送, Shift+Enter 换行)" : "请先选择或新建一个会话"}
                disabled={!activeSessionId || loading}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 min-h-[48px] max-h-[200px]"
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!activeSessionId || loading}
                  title="上传文件"
                >
                  <Globe className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button onClick={sendMessage} disabled={!activeSessionId || loading || (!input.trim() && uploadingFiles.length === 0)}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>上传文件最多 7 个，每个不超过 50MB</span>
            {isWebSearch && <span className="text-blue-500">联网模式已开启</span>}
          </div>
        </div>
      </div>

      {/* Rename Session Dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => !open && setRenameDialog({ open: false, sessionId: "", title: "" })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameDialog.title}
              onChange={(e) => setRenameDialog((p) => ({ ...p, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && renameSession()}
              placeholder="输入新名称"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, sessionId: "", title: "" })}
            >
              取消
            </Button>
            <Button onClick={renameSession} disabled={!renameDialog.title.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Generation Modal */}
      <dialog ref={imageDialogRef} id="image-modal" className="rounded-xl shadow-2xl p-0 w-full max-w-lg backdrop:bg-black/50">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">文生图</h3>
            <button type="button" onClick={() => imageDialogRef.current?.close()} className="p-1 rounded hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="描述你想要生成的图片..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
            <Button onClick={generateImage} disabled={imageGenerating || !imagePrompt.trim()} className="w-full">
              {imageGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</> : <><ImageIcon className="w-4 h-4 mr-2" />生成图片</>}
            </Button>
          </div>
        </div>
      </dialog>

      {/* Image Preview Modal */}
      {imageModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setImageModal(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-600 truncate flex-1 mr-4">{imageModal.prompt}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadImage(imageModal.imageUrl || imageModal.base64Image)}>
                  <Download className="w-4 h-4 mr-1" />下载
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setImageModal(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <img
              src={imageModal.base64Image || imageModal.imageUrl}
              alt="Generated"
              className="w-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
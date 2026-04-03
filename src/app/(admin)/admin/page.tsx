"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users,
  BarChart3,
  Plus,
  Trash2,
  Settings,
  Loader2,
  Shield,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface User {
  id: string;
  username: string;
  role: string;
  tokenLimit: string;
  tokenUsed: string;
  searchCallCount: number;
  searchMonthlyLimit: number;
  disabled: boolean;
  createdAt: string;
  _count?: { sessions: number; logs: number; searchLogs: number };
}

interface Stats {
  totalUsers: number;
  totalSessions: number;
  totalLogs: number;
  totalSearchLogs: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  modelStats: Array<{ model: string; _count: { model: number }; _sum: { totalTokens: number } }>;
  totalSearchPoints: number;
  recentLogs: Array<{ id: string; user: { username: string }; model: string; totalTokens: number; createdAt: string }>;
}

type Tab = "users" | "stats";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", role: "user", tokenLimit: "0", searchMonthlyLimit: "0" });
  const [editForm, setEditForm] = useState({ password: "", role: "", disabled: false, tokenLimit: "0", searchMonthlyLimit: "0" });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated" && session?.user?.role !== "admin") {
      toast.error("无管理权限");
      router.push("/chat");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      loadData();
    }
  }, [status, session]);

  async function loadData() {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchStats()]);
    setLoading(false);
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      toast.error("加载用户列表失败");
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      toast.error("加载统计失败");
    }
  }

  async function handleCreateUser() {
    if (!createForm.username || !createForm.password) {
      toast.error("用户名和密码不能为空");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        toast.success("用户创建成功");
        setCreateDialogOpen(false);
        setCreateForm({ username: "", password: "", role: "user", tokenLimit: "0", searchMonthlyLimit: "0" });
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "创建失败");
      }
    } catch (e) {
      toast.error("创建失败");
    }
    setActionLoading(false);
  }

  async function handleUpdateUser() {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success("用户更新成功");
        setEditDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "更新失败");
      }
    } catch (e) {
      toast.error("更新失败");
    }
    setActionLoading(false);
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("确定要删除该用户吗？此操作不可撤销。")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("用户已删除");
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || "删除失败");
      }
    } catch (e) {
      toast.error("删除失败");
    }
    setActionLoading(false);
  }

  function openEditDialog(user: User) {
    setSelectedUser(user);
    setEditForm({
      password: "",
      role: user.role,
      disabled: user.disabled,
      tokenLimit: user.tokenLimit,
      searchMonthlyLimit: String(user.searchMonthlyLimit),
    });
    setEditDialogOpen(true);
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-500" />
          <h1 className="text-xl font-bold text-slate-900">管理后台</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/chat">
            <Button variant="ghost" size="sm">
              返回聊天
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut className="w-4 h-4 mr-1" />
            退出
          </Button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-slate-200 min-h-[calc(100vh-65px)]">
          <div className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "users" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Users className="w-4 h-4" />
              用户管理
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "stats" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              全局概览
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">用户管理</h2>
                <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  创建用户
                </Button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">用户名</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">角色</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Token 已用/上限</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">搜索次数</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {user.role === "admin" ? "管理员" : "普通用户"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            user.disabled ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                          }`}>
                            {user.disabled ? "已禁用" : "正常"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {Number(user.tokenUsed).toLocaleString()} / {user.tokenLimit === "0" ? "无限制" : Number(user.tokenLimit).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {user.searchCallCount} / {user.searchMonthlyLimit === 0 ? "无限制" : user.searchMonthlyLimit}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditDialog(user)}
                              className="p-1.5 rounded hover:bg-slate-200 text-slate-500"
                              title="编辑"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-1.5 rounded hover:bg-red-100 text-red-500"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div className="text-center text-slate-400 py-12">暂无用户数据</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "stats" && stats && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">全局概览</h2>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-2xl font-bold text-slate-900">{stats.totalUsers}</div>
                  <div className="text-sm text-slate-500">总用户数</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-2xl font-bold text-slate-900">{stats.totalSessions}</div>
                  <div className="text-sm text-slate-500">总会话数</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-2xl font-bold text-slate-900">{Number(stats.totalTokens).toLocaleString()}</div>
                  <div className="text-sm text-slate-500">总 Token 消耗</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-2xl font-bold text-slate-900">{stats.totalSearchLogs}</div>
                  <div className="text-sm text-slate-500">联网搜索次数</div>
                </div>
              </div>

              {/* Model Stats */}
              {stats.modelStats.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">模型使用统计</h3>
                  <div className="space-y-2">
                    {stats.modelStats.map((m) => (
                      <div key={m.model} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <span className="font-mono text-sm text-slate-700">{m.model}</span>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-900">{m._count.model} 次调用</div>
                          <div className="text-xs text-slate-500">{Number(m._sum.totalTokens).toLocaleString()} tokens</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Logs */}
              {stats.recentLogs.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">最近调用记录</h3>
                  <div className="space-y-2">
                    {stats.recentLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                        <div>
                          <span className="font-medium text-slate-700">{log.user.username}</span>
                          <span className="text-slate-400 mx-2">·</span>
                          <span className="font-mono text-slate-500">{log.model}</span>
                        </div>
                        <div className="text-right text-slate-500">
                          <span>{log.totalTokens.toLocaleString()} tokens</span>
                          <span className="mx-2">·</span>
                          <span>{formatDate(log.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新用户</DialogTitle>
            <DialogDescription>填写以下信息创建新用户账号</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))} placeholder="输入用户名" />
            </div>
            <div className="space-y-2">
              <Label>初始密码</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} placeholder="输入密码" />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>对话 Token 上限（0=无限制）</Label>
              <Input type="number" value={createForm.tokenLimit} onChange={(e) => setCreateForm((p) => ({ ...p, tokenLimit: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>每月搜索次数上限（0=无限制）</Label>
              <Input type="number" value={createForm.searchMonthlyLimit} onChange={(e) => setCreateForm((p) => ({ ...p, searchMonthlyLimit: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreateUser} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户 - {selectedUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>重置密码（留空不修改）</Label>
              <Input type="password" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} placeholder="输入新密码" />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>对话 Token 上限（0=无限制）</Label>
              <Input type="number" value={editForm.tokenLimit} onChange={(e) => setEditForm((p) => ({ ...p, tokenLimit: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>每月搜索次数上限（0=无限制）</Label>
              <Input type="number" value={editForm.searchMonthlyLimit} onChange={(e) => setEditForm((p) => ({ ...p, searchMonthlyLimit: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input type="checkbox" checked={editForm.disabled} onChange={(e) => setEditForm((p) => ({ ...p, disabled: e.target.checked }))} className="rounded" />
                禁用账号
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleUpdateUser} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
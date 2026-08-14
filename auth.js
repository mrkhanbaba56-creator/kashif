import { FREE_BACKEND } from "./config.js";

const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export class FreeAccountService {
  constructor(onSessionChange = () => {}) {
    this.client = null;
    this.session = null;
    this.profile = null;
    this.onSessionChange = onSessionChange;
  }

  get configured() {
    return Boolean(
      FREE_BACKEND.url?.startsWith("https://") &&
      FREE_BACKEND.anonKey &&
      !FREE_BACKEND.url.includes("YOUR_") &&
      !FREE_BACKEND.anonKey.includes("YOUR_")
    );
  }

  async start() {
    if (!this.configured) {
      this.onSessionChange({ session: null, profile: null, configured: false });
      return false;
    }
    const { createClient } = await import(SUPABASE_CDN);
    this.client = createClient(FREE_BACKEND.url, FREE_BACKEND.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await this.client.auth.getSession();
    await this.setSession(data.session);
    this.client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => this.setSession(session), 0);
    });
    return true;
  }

  async setSession(session) {
    this.session = session;
    this.profile = session ? await this.getMyProfile() : null;
    this.onSessionChange({ session: this.session, profile: this.profile, configured: true });
  }

  async signUp({ email, password, name }) {
    this.requireClient();
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
    return data;
  }

  async signIn({ email, password }) {
    this.requireClient();
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signOut() {
    this.requireClient();
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async getMyProfile() {
    if (!this.session?.user) return null;
    const { data, error } = await this.client
      .from("profiles")
      .select("id,email,full_name,role,active,created_at")
      .eq("id", this.session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data || {
      id: this.session.user.id,
      email: this.session.user.email,
      full_name: this.session.user.user_metadata?.full_name || "Seller",
      role: "seller",
      active: true,
    };
  }

  async listUsers() {
    const { data, error } = await this.client
      .from("profiles")
      .select("id,email,full_name,role,active,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async changeRole(userId, role) {
    if (!['seller', 'agent', 'admin'].includes(role)) throw new Error("Invalid role");
    const { error } = await this.client.from("profiles").update({ role }).eq("id", userId);
    if (error) throw error;
  }

  async assignAgent(sellerId, agentId) {
    const { error } = await this.client.from("agent_assignments").upsert(
      { seller_id: sellerId, agent_id: agentId, active: true },
      { onConflict: "seller_id" }
    );
    if (error) throw error;
    const { error: taskError } = await this.client
      .from("support_tasks")
      .update({ assigned_agent: agentId })
      .eq("seller_id", sellerId)
      .in("status", ["open", "in_progress"]);
    if (taskError) throw taskError;
  }

  async createTask({ platform, title, details }) {
    const { error } = await this.client.from("support_tasks").insert({
      seller_id: this.session.user.id,
      platform,
      title,
      details,
    });
    if (error) throw error;
  }

  async listTasks() {
    const { data, error } = await this.client
      .from("support_tasks")
      .select("id,platform,title,details,status,seller_id,assigned_agent,created_at,updated_at,seller:profiles!support_tasks_seller_id_fkey(full_name,email),agent:profiles!support_tasks_assigned_agent_fkey(full_name,email)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async updateTaskStatus(taskId, status) {
    if (!["open", "in_progress", "waiting", "done"].includes(status)) throw new Error("Invalid status");
    const { error } = await this.client.from("support_tasks").update({ status }).eq("id", taskId);
    if (error) throw error;
  }

  requireClient() {
    if (!this.client) throw new Error("Free backend is not configured yet.");
  }
}

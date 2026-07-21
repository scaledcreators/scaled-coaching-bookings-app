import { headers } from "next/headers";
import { whop, whopConfigured } from "@/lib/whop";

type Viewer = { userId: string; accessLevel: "admin" | "customer"; demo: boolean };

function allowDemo() {
  return process.env.NODE_ENV !== "production" && !whopConfigured;
}

export async function requireAdmin(companyId: string): Promise<Viewer> {
  if (allowDemo()) return { userId: "user_demo_admin", accessLevel: "admin", demo: true };
  if (!whopConfigured) throw new Error("Whop is not configured.");

  const { userId } = await whop.verifyUserToken(await headers());
  const access = await whop.users.checkAccess(companyId, { id: userId });
  if (access.access_level !== "admin") throw new Error("Admin access required.");
  return { userId, accessLevel: "admin", demo: false };
}

export async function requireExperienceAccess(experienceId: string): Promise<Viewer> {
  if (allowDemo()) return { userId: "user_demo_member", accessLevel: "customer", demo: true };
  if (!whopConfigured) throw new Error("Whop is not configured.");

  const { userId } = await whop.verifyUserToken(await headers());
  const access = await whop.users.checkAccess(experienceId, { id: userId });
  if (!access.has_access) throw new Error("Experience access required.");
  return { userId, accessLevel: access.access_level === "admin" ? "admin" : "customer", demo: false };
}

export async function requireRequestViewer(request: Request, resourceId: string, adminOnly = false): Promise<Viewer> {
  if (allowDemo()) {
    return { userId: adminOnly ? "user_demo_admin" : "user_demo_member", accessLevel: adminOnly ? "admin" : "customer", demo: true };
  }
  if (!whopConfigured) throw new Error("Whop is not configured.");

  const { userId } = await whop.verifyUserToken(request.headers);
  const access = await whop.users.checkAccess(resourceId, { id: userId });
  if (!access.has_access || (adminOnly && access.access_level !== "admin")) {
    throw new Error(adminOnly ? "Admin access required." : "Access required.");
  }
  return { userId, accessLevel: access.access_level === "admin" ? "admin" : "customer", demo: false };
}

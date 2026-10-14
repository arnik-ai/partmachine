import type { RoleValue } from "@/lib/constants";

export type OrgRole = "owner" | "member";

export interface Member {
  id: string;
  fullName: string;
  email: string;
  role: RoleValue;
  orgRole: OrgRole;
  joinedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  myOrgRole: OrgRole;
  members: Member[];
}

export interface Invite {
  id: string;
  createdAt: string;
  expiresAt: string;
  createdByName: string;
}

/** توکن خام فقط همین یک‌بار برمی‌گردد */
export interface InviteCreated extends Invite {
  token: string;
}

export interface InviteInfo {
  organizationName: string;
  role: Exclude<RoleValue, "admin">;
  inviterName: string;
  expiresAt: string;
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "مدیر سازمان",
  member: "عضو",
};

"use client";

import { useState } from "react";
import { Check, Copy, Link2, UserMinus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { roleLabel } from "@/lib/constants";
import { faDate } from "@/lib/utils";
import {
  inviteLink,
  useCreateInvite,
  useInvites,
  useOrganization,
  useRemoveMember,
  useRevokeInvite,
} from "../api";
import { ORG_ROLE_LABELS, type Member } from "../types";

export function OrganizationView() {
  const { data: organization, isLoading, isError, error, refetch } = useOrganization();
  const isOwner = organization?.myOrgRole === "owner";

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError || !organization) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          نقش شما: {ORG_ROLE_LABELS[organization.myOrgRole]}
        </p>
      </div>
      {isOwner && <InvitePanel />}
      <MembersCard members={organization.members} isOwner={isOwner} />
    </div>
  );
}

function MembersCard({ members, isOwner }: { members: Member[]; isOwner: boolean }) {
  const remove = useRemoveMember();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setError(null);
    try {
      await remove.mutateAsync(removing.id);
      setRemoving(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" aria-hidden />
          اعضای سازمان
        </CardTitle>
        {!isOwner && (
          <CardDescription>
            برای افزودن همکار، از مدیر سازمان بخواهید یک لینک دعوت بسازد.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {members.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {member.fullName}
                <Badge variant={member.orgRole === "owner" ? "default" : "secondary"}>
                  {ORG_ROLE_LABELS[member.orgRole]}
                </Badge>
              </span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {member.email}
              </span>
              <span className="text-xs text-muted-foreground">
                {roleLabel(member.role)} — عضو از {faDate(member.joinedAt)}
              </span>
            </div>
            {isOwner && member.orgRole !== "owner" && (
              <Button
                variant="outline"
                size="sm"
                aria-label={`حذف ${member.fullName} از سازمان`}
                onClick={() => {
                  setError(null);
                  setRemoving(member);
                }}
              >
                <UserMinus className="h-4 w-4" aria-hidden />
                حذف
              </Button>
            )}
          </div>
        ))}
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        pending={remove.isPending}
        error={error}
        destructive
        title="حذف عضو"
        confirmLabel="بله، حذف کن"
        description={
          removing &&
          `دسترسی «${removing.fullName}» بلافاصله قطع می‌شود و دیگر نمی‌تواند وارد شود. کارهایی که انجام داده در سازمان باقی می‌ماند.`
        }
      />
    </Card>
  );
}

function InvitePanel() {
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const { data: invites, isError, error, refetch } = useInvites(true);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreate() {
    setActionError(null);
    setCopied(false);
    try {
      const invite = await create.mutateAsync(undefined);
      setLink(inviteLink(invite.token));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function handleRevoke(id: string) {
    setActionError(null);
    try {
      await revoke.mutateAsync(id);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" aria-hidden />
          دعوت همکار
        </CardTitle>
        <CardDescription>
          یک لینک دعوت بسازید و برای همکارتان بفرستید. با همین لینک ثبت‌نام می‌کند و مستقیم عضو
          سازمان شما می‌شود. همکاران کارهای روزمره (ثبت درخواست، قیمت‌دادن، انتخاب برنده) را انجام
          می‌دهند؛ دعوت و حذف اعضا، و برای قطعه‌سازها پروفایل و مدارک شرکت، فقط با مدیر سازمان است.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={handleCreate} disabled={create.isPending} className="self-start">
          {create.isPending ? "در حال ساخت..." : "ساخت لینک دعوت"}
        </Button>

        {link && (
          <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/5 p-3">
            <label htmlFor="invite-link" className="text-sm font-medium">
              لینک دعوت (فقط همین حالا نمایش داده می‌شود)
            </label>
            <div className="flex gap-2">
              <Input id="invite-link" readOnly dir="ltr" value={link} onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "کپی شد" : "کپی"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              این لینک ۷ روز اعتبار دارد و فقط یک‌بار قابل استفاده است.
            </p>
          </div>
        )}

        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} title="فهرست دعوت‌ها بارگذاری نشد" />
        ) : invites && invites.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">دعوت‌های استفاده‌نشده</h3>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span className="text-muted-foreground">
                  ساخته‌شده توسط {invite.createdByName} در {faDate(invite.createdAt)} — معتبر تا{" "}
                  {faDate(invite.expiresAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(invite.id)}
                  disabled={revoke.isPending}
                >
                  باطل کردن
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              اگر لینکی را گم کرده‌اید، آن را باطل کنید و لینک تازه بسازید.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

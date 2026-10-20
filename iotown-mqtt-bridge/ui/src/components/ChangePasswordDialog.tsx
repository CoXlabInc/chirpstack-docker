import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const schema = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, t.auth.tooShort),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: t.auth.mismatch });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      api("/api/auth/password", { method: "POST", body: { currentPassword: v.currentPassword, newPassword: v.newPassword } }),
    onSuccess: () => {
      toast.success(t.auth.changed);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      onDone?.();
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });
  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t.auth.currentPassword}</Label>
        <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t.auth.newPassword}</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...form.register("newPassword")} />
        {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t.auth.confirmPassword}</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? t.common.saving : t.auth.changePassword}
      </Button>
    </form>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.auth.changePassword}</DialogTitle>
        </DialogHeader>
        <ChangePasswordForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

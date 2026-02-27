"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { setSettings, setSetting } from "@/features/settings/Actions/settingsActions";
import { renameOrganization } from "@/features/team/Actions/renameOrganization";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ImageIcon, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { createNewOrganization } from "@/features/team/Actions/createNewOrganization";
import { ReadOnlyBanner, SaveButton, ReadOnlyWrapper } from "../read-only-guard";

export function CompanySettings({ settings, organizationName }: { settings: Record<string, string>; organizationName: string }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [saving, setSaving] = useState(false);
  const [workshopName, setWorkshopName] = useState(organizationName);
  const [workshopAddress, setWorkshopAddress] = useState(settings[SETTING_KEYS.WORKSHOP_ADDRESS] || "");
  const [workshopPhone, setWorkshopPhone] = useState(settings[SETTING_KEYS.WORKSHOP_PHONE] || "");
  const [workshopEmail, setWorkshopEmail] = useState(settings[SETTING_KEYS.WORKSHOP_EMAIL] || "");
  const [orgNumber, setOrgNumber] = useState(settings[SETTING_KEYS.INVOICE_ORG_NUMBER] || "");
  const [logoUrl, setLogoUrl] = useState(settings[SETTING_KEYS.COMPANY_LOGO] || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const handleSave = async () => {
    setSaving(true);
    const [renameResult, settingsResult] = await Promise.all([
      renameOrganization({ name: workshopName }),
      setSettings({
        [SETTING_KEYS.WORKSHOP_ADDRESS]: workshopAddress,
        [SETTING_KEYS.WORKSHOP_PHONE]: workshopPhone,
        [SETTING_KEYS.WORKSHOP_EMAIL]: workshopEmail,
        [SETTING_KEYS.INVOICE_ORG_NUMBER]: orgNumber,
      }),
    ]);
    setSaving(false);
    if (!renameResult.success || !settingsResult.success) {
      toast.error(renameResult.error || settingsResult.error || t('company.failedSave'));
      return;
    }
    router.refresh();
    toast.success(t('company.settingsSaved'));
  };
  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    const toastId = toast.loading(t('company.uploadingLogo'));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/protected/upload/logo", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || t('company.failedUploadLogo'), { id: toastId });
        setUploadingLogo(false);
        return;
      }
      const data = await res.json();
      await setSetting(SETTING_KEYS.COMPANY_LOGO, data.url);
      setLogoUrl(data.url);
      router.refresh();
      toast.success(t('company.logoUpdated'), { id: toastId });
    } catch {
      toast.error(t('company.failedUploadLogo'), { id: toastId });
    }
    setUploadingLogo(false);
  };
  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    const result = await createNewOrganization({ name: newOrgName.trim() });
    setCreatingOrg(false);
    if (result.success) {
      setShowCreateOrg(false);
      setNewOrgName("");
      router.refresh();
      toast.success(t('company.companyCreated'));
    }
  };
  const handleRemoveLogo = async () => {
    await setSetting(SETTING_KEYS.COMPANY_LOGO, "");
    setLogoUrl("");
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <ReadOnlyBanner />
      <ReadOnlyWrapper>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" /> {t('company.logoTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
              {logoUrl ? (
                <Image src={logoUrl} alt={t('company.logoAlt')} width={64} height={64} unoptimized className="object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                {t('company.upload')}
              </Button>
              {logoUrl && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {t('company.remove')}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{t('company.logoHint')}</span>
            </div>
            <input ref={logoInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.svg" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); e.target.value = ""; }} />
          </div>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" /> {t('company.detailsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="workshopName" className="text-xs">{t('company.shopName')}</Label>
              <Input id="workshopName" placeholder={t('company.shopNamePlaceholder')} value={workshopName} onChange={(e) => setWorkshopName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="orgNumber" className="text-xs">{t('company.orgNumber')}</Label>
              <Input id="orgNumber" placeholder={t('company.orgNumberPlaceholder')} value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workshopPhone" className="text-xs">{t('company.phone')}</Label>
              <Input id="workshopPhone" placeholder={t('company.phonePlaceholder')} value={workshopPhone} onChange={(e) => setWorkshopPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workshopEmail" className="text-xs">{t('company.email')}</Label>
              <Input id="workshopEmail" type="email" placeholder={t('company.emailPlaceholder')} value={workshopEmail} onChange={(e) => setWorkshopEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="workshopAddress" className="text-xs">{t('company.address')}</Label>
            <Textarea id="workshopAddress" placeholder={t('company.addressPlaceholder')} rows={2} value={workshopAddress} onChange={(e) => setWorkshopAddress(e.target.value)} />
          </div>
          <SaveButton>
            <Separator />
            <div className="flex items-center justify-between">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {t('company.saveCompany')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreateOrg(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('company.addNewCompany')}
              </Button>
            </div>
          </SaveButton>
        </CardContent>
      </Card>
      </ReadOnlyWrapper>
      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('company.addNewCompany')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateOrg(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-org-name">{t('company.companyName')}</Label>
              <Input id="settings-org-name" placeholder={t('company.companyNamePlaceholder')} value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateOrg(false)}>{t('company.cancel')}</Button>
              <Button type="submit" disabled={creatingOrg || !newOrgName.trim()}>
                {creatingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('company.createCompany')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

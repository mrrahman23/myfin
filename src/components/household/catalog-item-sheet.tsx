"use client";

import { Archive, ArchiveRestore, Camera, ImageOff } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/data/errors";
import { createItem, updateItem } from "@/lib/household/mutations";
import { deleteItemPhoto, uploadItemPhoto } from "@/lib/household/photo";
import { ITEM_CATEGORIES, ITEM_EMOJI, UNITS, type HouseholdItem } from "@/lib/household/types";
import { ItemImage } from "./item-image";

export type CatalogEditTarget = { item: HouseholdItem } | { create: true; category?: string };

export function CatalogItemSheet({
  target,
  householdId,
  onClose,
}: {
  target: CatalogEditTarget | null;
  householdId: string;
  onClose: () => void;
}) {
  const item = target && "item" in target ? target.item : null;
  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={item ? "Edit item" : "New item"} description={item?.name_bn ?? undefined}>
      {target ? (
        <CatalogItemForm
          key={item?.id ?? "new"}
          item={item}
          defaultCategory={"create" in target ? target.category : undefined}
          householdId={householdId}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function CatalogItemForm({
  item,
  defaultCategory,
  householdId,
  onDone,
}: {
  item: HouseholdItem | null;
  defaultCategory?: string;
  householdId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [nameBn, setNameBn] = useState(item?.name_bn ?? "");
  const [emoji, setEmoji] = useState(item?.emoji ?? "🛒");
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? null);
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [category, setCategory] = useState(item?.category ?? defaultCategory ?? "");
  const [qty, setQty] = useState(item?.default_qty ? String(Number(item.default_qty)) : "");
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  function pick(file: File | undefined) {
    if (!file) return;
    setPendingPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the English name");
    const q = qty.trim() ? Number(qty) : null;
    if (q !== null && !(q > 0)) return setError("Usual quantity must be a positive number");
    setError(null);
    setBusy("save");
    try {
      const patch = { name: name.trim(), name_bn: nameBn.trim() || null, emoji, unit, category: category || null, default_qty: q };
      let id = item?.id;
      if (id) await updateItem(id, patch);
      else id = await createItem(householdId, patch);
      if (pendingPhoto) {
        const url = await uploadItemPhoto(householdId, id, pendingPhoto);
        await updateItem(id, { image_url: url });
        if (item?.image_url) await deleteItemPhoto(item.image_url);
      } else if (item?.image_url && !imageUrl) {
        await updateItem(id, { image_url: null });
        await deleteItemPhoto(item.image_url);
      }
      toast.success(item ? "Item saved" : `${patch.name} added to the catalogue`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    if (!item) return;
    setBusy("archive");
    try {
      await updateItem(item.id, { is_archived: !item.is_archived });
      toast.show(item.is_archived ? "Item restored" : "Item hidden from the catalogue");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const shown = { name: name || "?", emoji, image_url: preview ?? imageUrl };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => setShowEmoji((s) => !s)} aria-label="Choose a picture" className="rounded-[22px] ring-accent transition focus-visible:ring-2">
          <ItemImage item={shown} size="hero" />
        </button>
        <div className="grid flex-1 gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={busy === "save" && Boolean(pendingPhoto)}>
            <Camera className="h-4 w-4" /> {shown.image_url ? "Change photo" : "Take or choose photo"}
          </Button>
          {shown.image_url ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingPhoto(null);
                setPreview(null);
                setImageUrl(null);
              }}
            >
              <ImageOff className="h-4 w-4" /> Use emoji instead
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowEmoji((s) => !s)}>
              {showEmoji ? "Hide emoji" : "Pick an emoji"}
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Photo" />
      </div>

      {showEmoji ? (
        <div className="grid grid-cols-8 gap-1.5 rounded-2xl bg-surface-2 p-2 sm:grid-cols-12">
          {ITEM_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setEmoji(e);
                setShowEmoji(false);
              }}
              aria-label={`Use ${e}`}
              aria-pressed={emoji === e}
              className={cn("grid aspect-square place-items-center rounded-xl text-[22px] transition", emoji === e ? "bg-surface shadow-card" : "hover:bg-surface")}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name (English)" htmlFor="ci-name">
          <Input id="ci-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rice" data-autofocus={!item || undefined} />
        </Field>
        <Field label="নাম (বাংলা)" htmlFor="ci-bn">
          <Input id="ci-bn" lang="bn" value={nameBn} maxLength={80} onChange={(e) => setNameBn(e.target.value)} placeholder="যেমন: চাল" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Usual qty" htmlFor="ci-qty">
          <Input id="ci-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="1" />
        </Field>
        <Field label="Unit" htmlFor="ci-unit">
          <Select id="ci-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {[...new Set([unit, ...UNITS])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="ci-cat">
          <Select id="ci-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Other</option>
            {[...new Set([...(category ? [category] : []), ...ITEM_CATEGORIES.filter((c) => c !== "Other")])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-[12px] text-ink-3">The usual quantity is used when someone taps the item to add it to the list.</p>

      {error ? <p role="alert" className="text-[13px] text-negative">{error}</p> : null}
      <div className="flex gap-3">
        {item ? (
          <Button variant="secondary" className="h-[52px] rounded-2xl" onClick={toggleArchive} loading={busy === "archive"}>
            {item.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {item.is_archived ? "Restore" : "Hide"}
          </Button>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" loading={busy === "save"}>
          {item ? "Save" : "Add to catalogue"}
        </Button>
      </div>
    </form>
  );
}

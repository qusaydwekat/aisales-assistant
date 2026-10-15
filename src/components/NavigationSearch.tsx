import { useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { navigationItems, adminNavigationItem } from "./navigation-items";

export function NavigationSearch() {
  const [open, setOpen] = useState(false);
  const { t, dir } = useLanguage();
  const { role } = useAuth();
  const navigate = useNavigate();
  const items = role === "admin" ? [...navigationItems, adminNavigationItem] : navigationItems;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label={t("search")} className="h-10 w-10 px-0 sm:w-56 sm:justify-start sm:px-3 sm:bg-muted/50 text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">{t("search")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden" dir={dir}>
          <DialogHeader className="sr-only">
            <DialogTitle>{t("search")}</DialogTitle>
            <DialogDescription>{t("menu")}</DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder={t("search")} />
            <CommandList className="max-h-[60dvh] py-2">
              <CommandEmpty>{dir === "rtl" ? "لا توجد نتائج" : "No results found"}</CommandEmpty>
              <CommandGroup heading={t("menu")}>
                {items.map(item => (
                  <CommandItem key={item.key} value={`${t(item.key)} ${item.key}`} onSelect={() => { navigate(item.url); setOpen(false); }} className="gap-3 py-3 cursor-pointer">
                    <item.icon className="h-4 w-4 text-muted-foreground" />{t(item.key)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
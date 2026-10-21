import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="rounded-t-xl bg-surface pb-safe">
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-body">Нотная тетрадь</DrawerTitle>
          <DrawerDescription className="text-footnote">Партии для скрипки: написать, послушать, распечатать.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 px-5 pb-4 text-subhead text-muted-foreground">
          <p>Партии хранятся только на этом телефоне. Время от времени сохраняйте копию через меню «Ещё» на главном экране.</p>
          <p>
            Звук скрипки: FluidR3 GM (Frank Wen), лицензия CC BY 3.0, в обработке MIDI.js Soundfonts. Нотная графика: VexFlow (MIT).
            Шрифт заголовков в PDF: PT Serif (ParaType, OFL).
          </p>
          <Button size="lg" variant="secondary" onClick={onClose}>
            Готово
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

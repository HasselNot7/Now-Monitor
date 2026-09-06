import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/table";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api, fmt } from "../api";
import { toast } from "../lib/toast";
import type { Metric } from "../types";
import type { Shared } from "../shared";
import { Btn, CARD_CLS, Hint, Page, Section } from "../ui";

/** 指标总表：每个指标的当前值、来源、是否被版式引用、候选传感器 ID。
 * 行内可删除 —— 删掉的指标回"自定义指标"的未知池，注册表里不再占用。 */
export default function MetricsTablePage({ shared }: { shared: Shared }) {
  const { metrics, hw, check } = shared;
  const [pending, setPending] = useState<Metric | null>(null);
  const used = new Set(check?.referenced || []);
  const dig = (obj: unknown, path: string): unknown =>
    path.split(".").reduce((n: unknown, k: string) =>
      n != null && typeof n === "object" ? (n as Record<string, unknown>)[k] : null, obj);

  const remove = async () => {
    if (!pending) return;
    const m = pending;
    setPending(null);
    try {
      const rep = await api.removeCustomMetric(m.id);
      if (!rep.removed) {
        toast.danger("删除失败", { description: rep.error, timeout: 6000 });
        return;
      }
      toast.success(`已删除「${m.name}」`, { description: "传感器已回未知池", timeout: 2000 });
      await shared.reloadMetrics();
      await shared.refreshAll();
    } catch (e) {
      toast.danger("删除失败", { description: String(e), timeout: 6000 });
    }
  };

  return (
    <Page title="指标总表">
      <Section title="全部指标" divider={false}>
        <div className={`px-2 py-1 ${CARD_CLS}`}>
          {!metrics || !hw ? (
            <Hint className="py-4">载入中…</Hint>
          ) : (
            <Table aria-label="指标总表" removeWrapper
              classNames={{
                th: "bg-transparent text-xs font-normal text-default-500 border-b border-white/[0.04] rounded-none",
                td: "py-2.5",
              }}>
              <TableHeader>
                <TableColumn>指标</TableColumn>
                <TableColumn>当前值</TableColumn>
                <TableColumn>来源</TableColumn>
                <TableColumn>用于版式</TableColumn>
                <TableColumn>候选传感器 ID</TableColumn>
                <TableColumn> </TableColumn>
              </TableHeader>
              <TableBody emptyContent="还没有指标 —— 去「自定义指标」注册，或一键加载默认指标集">
                {metrics.map(m => {
                  const out = m.out || m.id;
                  const v = m.out ? dig(hw, m.out) : null;
                  const src = hw?.sources?.[m.id];
                  const isUsed = used.has(out);
                  return (
                    <TableRow key={m.id} className={isUsed ? "" : "opacity-45"}>
                      <TableCell>{m.name}{m.rate_untrusted ? " ⚠" : ""}</TableCell>
                      <TableCell className="text-right font-poppins tabular-nums">{fmt(v, m)}</TableCell>
                      <TableCell className="font-jetbrains text-xs text-default-500">{src || "无数据"}</TableCell>
                      <TableCell>{isUsed ? "是" : "—"}</TableCell>
                      <TableCell className="font-jetbrains text-xs text-default-500">
                        {(m.sources?.aida64 || []).join(" ") || m.agg || "winapi"}
                      </TableCell>
                      <TableCell>
                        <Btn isIconOnly size="sm" variant="ghost"
                          className="h-7 w-7 min-w-0 rounded-full text-default-500 hover:text-danger"
                          title="删除这个指标（回未知池）" onPress={() => setPending(m)}>
                          <Trash2 size={14} />
                        </Btn>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Section>

      <Modal isOpen={!!pending} size="sm" onOpenChange={open => { if (!open) setPending(null); }}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-xl">删除「{pending?.name}」？</ModalHeader>
              <ModalBody>
                <p className="text-sm leading-6 text-color-desc">
                  传感器回未知池，随时可再注册；版式引用处会显示 --。
                </p>
              </ModalBody>
              <ModalFooter>
                <Btn variant="secondary" className="bg-[#27272a]" onPress={() => setPending(null)}>取消</Btn>
                <Btn variant="danger" onPress={remove}>删除</Btn>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Page>
  );
}

import { Progress } from "@heroui/progress";
import { Input } from "@heroui/input";
import { useState } from "react";
import type { Shared } from "../shared";
import { Banner, CARD_CLS, Btn, FieldLabel, Hint, Page, SubTitle } from "../ui";
import CopyButton from "../components/CopyButton";
import { aidaIssue, TroubleshootModal, troubleshoot } from "../widgets";

type BarColor = "primary" | "success" | "warning" | "danger";

/** 连接状态点：带光晕的小点（NP 在线点同款思路）。有问题时（onClick）整颗可点，
 * 点开排障弹窗。 */
const StateChip = ({ text, kind, onClick }: {
  text: string; kind: "ok" | "warn" | "bad"; onClick?: () => void;
}) => {
  const dot = kind === "ok" ? "bg-success shadow-[0_0_8px_var(--heroui-success)]"
    : kind === "warn" ? "bg-warning shadow-[0_0_8px_var(--heroui-warning)]"
      : "bg-danger shadow-[0_0_8px_var(--heroui-danger)]";
  const inner = (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
  return onClick
    ? <button type="button" onClick={onClick} title="点击查看解决方案"
        className="cursor-pointer rounded-md px-1 transition-colors hover:bg-white/[0.06]">{inner}</button>
    : inner;
};

/** 顶部统计卡：小标签 + 大数字 + 灰注 + 细进度条。 */
function StatCard({ label, value, sub, progress, progressColor }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  progress?: number;
  progressColor?: BarColor;
}) {
  return (
    <div className={`${CARD_CLS} flex flex-col gap-1.5 p-4`}>
      <span className="text-xs font-bold text-default-500">{label}</span>
      <span className="font-poppins text-2xl font-bold leading-7">{value}</span>
      {sub && <span className="text-xs text-color-desc">{sub}</span>}
      {progress !== undefined && (
        <Progress aria-label={label} size="sm" className="mt-1"
          value={Math.min(100, progress)} color={progressColor ?? "primary"} />
      )}
    </div>
  );
}

/** 详情行：左名称右数值。 */
function Row({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-4 py-1.5">
      <div className="flex flex-col gap-[2px]">
        <span className="text-sm text-default-500">{k}</span>
        {sub && <span className="text-xs text-color-desc">{sub}</span>}
      </div>
      <span className="text-right text-sm font-jetbrains tabular-nums">{v}</span>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${CARD_CLS} flex flex-col gap-1 p-4`}>
      <SubTitle>{title}</SubTitle>
      {children}
    </div>
  );
}

export default function StatusPage({ shared }: { shared: Shared }) {
  const { status: st, hw, check } = shared;
  const [trouble, setTrouble] = useState(false);
  if (!st) {
    return (
      <Page title="状态总览">
        <div className={`${CARD_CLS} p-4`}>
          <Hint>读取中…</Hint>
        </div>
      </Page>
    );
  }
  const shmColor = st.shm_pct > 90 ? "text-danger" : st.shm_pct > 75 ? "text-warning" : "text-foreground";
  const shmBar: BarColor = st.shm_pct > 90 ? "danger" : st.shm_pct > 75 ? "warning" : "primary";
  const s = st.windows_net_sampler;
  const b = check?.budget;
  const worstPct = b ? Math.round(b.worst_bytes / b.usable * 100) : undefined;
  const worstColor = b && b.worst_bytes > b.usable ? "text-danger" : "text-foreground";
  const worstBar: BarColor = b && b.worst_bytes > b.usable ? "danger" : "primary";
  const problems = troubleshoot(st);

  return (
    <Page title="状态总览">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="AIDA64"
          value={<StateChip text={st.running ? "运行中" : "未运行"} kind={aidaIssue(st)}
            onClick={problems.length ? () => setTrouble(true) : undefined} />}
          sub={`导出 ${st.exported_ids.length} 个传感器`} />
        <StatCard label="共享内存" progress={st.shm_pct} progressColor={shmBar}
          value={<span className={shmColor}>{st.shm_pct}%</span>}
          sub={<>{st.shm_bytes} / {st.shm_limit} 字节 · 预算 {st.usable_bytes}</>} />
        <StatCard label="导出预算" progress={worstPct} progressColor={worstBar}
          value={b ? <span className={worstColor}>{worstPct}%</span> : "—"}
          sub={b ? <>最坏 {b.worst_bytes} / {b.usable} 字节 · {b.count} 个传感器</> : "载入中…"} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <DetailCard title="数据源">
          <Row k="安装目录" v={<span className="text-color-desc">{st.install || "未找到"}</span>} />
          <Row k="ini" v={<span className="break-all text-color-desc">{st.ini || "未找到"}</span>} />
          <Row k="网卡采样" v={s?.sampling
            ? <StateChip text="运行中" kind="warn" />
            : <span className="text-color-desc">未启动</span>} />
          {hw?.degraded && <Row k="降级原因" v={<span className="text-warning">{hw.degraded}</span>} />}
          {hw?.missing?.length ? (
            <Row k="AIDA64 缺这些" v={<span className="font-poppins text-danger">{hw.missing.join(", ")}</span>} />
          ) : null}
        </DetailCard>

        <DetailCard title="导出预算">
          {b ? (
            <>
              <Row k="版式需要" v={`${b.count} 个传感器`} />
              <Row k="最坏占用" v={<span className={b.worst_bytes > b.usable ? "text-danger" : "text-primary"}>
                {b.worst_bytes} / {b.usable} 字节</span>} />
              <Row k="典型占用" v={`${b.typical_bytes} 字节`} />
              <Row k="截断风险" v={b.fits ? <StateChip text="无" kind="ok" />
                : <span className="text-warning">从第 {(b.truncated_at ?? 0) + 1} 个起被截断</span>} />
            </>
          ) : <Hint>载入中…</Hint>}
        </DetailCard>
      </div>

      {/* NP Alert flat 同款横幅：OBS 源排障是最高频问题，常驻提醒 */}
      <Banner end={
        <Btn size="sm" variant="secondary" className="bg-[#27272a]"
          onPress={() => window.open("/", "_blank")}>打开叠加层</Btn>
      }>
        在 OBS 添加「浏览器」源并填入下方地址；改了版式 OBS 没变化，就点浏览器源上的「刷新缓存」。
      </Banner>

      {/* NP IntegrationCard 的 PcTab 同款：URL 只读输入框 + 复制按钮 + 居中说明 */}
      <DetailCard title="OBS 设置">
        <div className="flex flex-col gap-2">
          <FieldLabel>组件 URL</FieldLabel>
          <Input
            className="font-jetbrains"
            classNames={{ inputWrapper: "pl-4 pr-0" }}
            isReadOnly
            endContent={<CopyButton copyContent={`${location.origin}/`} label="复制 URL" />}
            type="text"
            value={`${location.origin}/`}
            variant="bordered"
          />
          <div className="w-full mt-5 text-sm text-color-desc flex items-center justify-center">
            将上方内容填写到直播软件的浏览器源 URL 栏
          </div>
        </div>
        <Row k="宽 × 高" v={`${check?.canvas_w ?? "—"} × ${check?.canvas_h ?? "—"}`} />
        <Row k="内容预估高" v={`${check?.est_height ?? "—"} px`} />
      </DetailCard>

      <TroubleshootModal status={st} isOpen={trouble} onClose={() => setTrouble(false)} />
    </Page>
  );
}

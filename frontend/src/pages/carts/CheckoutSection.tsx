import type { ReactNode } from 'react';

export default function SectionTitle({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#eaf0ff] text-[#263c65]">{icon}</span>
      <div>
        <h2 className="text-lg leading-snug font-bold">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{children}</p>
      </div>
    </div>
  );
}

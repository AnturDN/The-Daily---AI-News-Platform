export default function Toasts({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in h-8 max-w-full px-3 rounded-lg bg-ink text-bg text-sm flex items-center gap-2 truncate"
        >
          
          {t.text}
        </div>
      ))}
    </div>
  );
}
